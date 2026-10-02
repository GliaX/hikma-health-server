import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { getEventForms } from "@/lib/server-functions/event-forms";
import { createEvent } from "@/lib/server-functions/events";
import { createVisit } from "@/lib/server-functions/visits";
import EventForm from "@/models/event-form";
import { format } from "date-fns";
import { ChevronLeft, Plus } from "lucide-react";
import { Trash2 } from "lucide-react";
import MiniSearch from "minisearch";
import { nanoid } from "nanoid";
import { useEffect, useRef, useState } from "react";
import AsyncSelect from "react-select/async";
import { toast } from "sonner";

type Step = "details" | "form-entry";

type Props = {
	patientId: string;
	clinicId: string | null;
	providerId: string;
	providerName: string;
	onVisitCreated: () => void;
};

const toDatetimeLocal = (d: Date): string => format(d, "yyyy-MM-dd'T'HH:mm");

/**
 * Image upload input for a file field.
 * Uploads to POST /api/forms/resources and stores the returned resource ID
 * as the field value. Manages its own upload state internally.
 */
function FileFieldEntry({
	value,
	onChange,
	label,
	desc,
}: {
	value: string | null;
	onChange: (value: string) => void;
	label: React.ReactNode;
	desc: React.ReactNode;
}) {
	const [uploading, setUploading] = useState(false);
	const [fileName, setFileName] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;

		setUploading(true);
		setError(null);

		try {
			const body = new FormData();
			body.append("file", file);

			// Browser sends session cookie automatically on same-origin fetch
			const response = await fetch("/api/forms/resources", {
				method: "POST",
				body,
			});

			if (!response.ok) {
				const data = await response.json().catch(() => ({}));
				throw new Error(data.error ?? `Upload failed (${response.status})`);
			}

			const { id } = await response.json();
			setFileName(file.name);
			onChange(id);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Upload failed");
		} finally {
			setUploading(false);
			// Reset input so the same file can be re-selected after an error
			if (inputRef.current) inputRef.current.value = "";
		}
	};

	return (
		<div className="space-y-1">
			{label}
			{desc}
			<div className="space-y-2">
				{value && fileName && (
					<p className="text-xs text-muted-foreground truncate">
						Uploaded: {fileName}
					</p>
				)}
				<label className="block w-fit">
					<span
						className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
							uploading
								? "cursor-not-allowed opacity-50"
								: "cursor-pointer hover:bg-muted/50"
						}`}
					>
						{uploading
							? "Uploading…"
							: value
								? "Replace image"
								: "Choose image"}
					</span>
					<input
						ref={inputRef}
						type="file"
						accept="image/*"
						className="sr-only"
						onChange={handleFileChange}
						disabled={uploading}
					/>
				</label>
				{error && <p className="text-xs text-destructive">{error}</p>}
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// ICD-11 diagnosis search (lazily-built shared index)
// ---------------------------------------------------------------------------

let diagnosisSearch: MiniSearch | null = null;

async function getDiagnosisSearch() {
	if (!diagnosisSearch) {
		const icd11 = (await import("@/data/icd11-xs.js")).default;
		diagnosisSearch = new MiniSearch({
			fields: ["desc", "code"],
			storeFields: ["desc", "code"],
			idField: "code",
			searchOptions: {
				fuzzy: 1,
				boost: { desc: 5, code: 1 },
			},
		});
		diagnosisSearch.addAll(icd11);
	}
	return diagnosisSearch;
}

type DiagnosisOption = { value: string; label: string; desc: string };

const toDiagnosisOption = (d: {
	code: string;
	desc: string;
}): DiagnosisOption => ({
	value: d.code,
	label: `${d.desc} (${d.code})`,
	desc: d.desc,
});

/**
 * Structured diagnosis entry — searches ICD-11 and stores
 * `Array<{ code, desc }>`, matching the mobile app's value shape.
 */
function DiagnosisFieldEntry({
	value,
	onChange,
	label,
	desc,
}: {
	value: unknown;
	onChange: (value: Array<{ code: string; desc: string }>) => void;
	label: React.ReactNode;
	desc: React.ReactNode;
}) {
	const loadOptions = async (
		inputValue: string,
	): Promise<DiagnosisOption[]> => {
		const search = await getDiagnosisSearch();
		return search
			.search(inputValue)
			.sort((a, b) => b.score - a.score)
			.slice(0, 25)
			.map((item) =>
				toDiagnosisOption({ code: String(item.code), desc: item.desc }),
			);
	};

	const selected: DiagnosisOption[] = (
		Array.isArray(value) ? (value as Array<{ code: string; desc: string }>) : []
	).map(toDiagnosisOption);

	return (
		<div className="space-y-1">
			{label}
			{desc}
			<AsyncSelect
				isMulti
				cacheOptions
				defaultOptions
				loadOptions={loadOptions}
				value={selected}
				getOptionValue={(o) => o.value}
				placeholder="Search for a diagnosis…"
				onChange={(opts) =>
					onChange(
						(opts as DiagnosisOption[]).map((o) => ({
							code: o.value,
							desc: o.desc,
						})),
					)
				}
				classNamePrefix="react-select"
			/>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Structured medicine entry
// ---------------------------------------------------------------------------

type MedicineEntryValue = {
	name: string;
	route: string;
	form: string;
	dose: string;
	doseUnits: string;
	frequency: string;
	intervals: string;
	duration: string;
	durationUnits: string;
};

const emptyMedicineEntry = (): MedicineEntryValue => ({
	name: "",
	route: "",
	form: "",
	dose: "",
	doseUnits: "",
	frequency: "",
	intervals: "",
	duration: "",
	durationUnits: "",
});

function LabeledSelect({
	label,
	options,
	value,
	onChange,
}: {
	label: string;
	options: readonly string[];
	value: string;
	onChange: (value: string) => void;
}) {
	return (
		<div className="space-y-1">
			<Label className="text-xs text-muted-foreground">{label}</Label>
			<Select value={value || undefined} onValueChange={onChange}>
				<SelectTrigger className="w-full">
					<SelectValue placeholder="Select…" />
				</SelectTrigger>
				<SelectContent>
					{options.map((opt) => (
						<SelectItem key={opt} value={opt}>
							{opt}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}

/**
 * Structured medicine entry — one sub-form per medicine, storing
 * `Array<MedicineEntryValue>` matching the mobile app's value shape.
 */
function MedicineFieldEntry({
	value,
	onChange,
	label,
	desc,
}: {
	value: unknown;
	onChange: (value: MedicineEntryValue[]) => void;
	label: React.ReactNode;
	desc: React.ReactNode;
}) {
	const meds: MedicineEntryValue[] = Array.isArray(value) ? value : [];

	const update = (index: number, key: keyof MedicineEntryValue, v: string) => {
		onChange(meds.map((med, i) => (i === index ? { ...med, [key]: v } : med)));
	};

	const remove = (index: number) => {
		onChange(meds.filter((_, i) => i !== index));
	};

	// Stable per-row React keys without leaking ids into the stored value
	const keysRef = useRef<string[]>([]);
	while (keysRef.current.length < meds.length) keysRef.current.push(nanoid());
	if (keysRef.current.length > meds.length)
		keysRef.current.length = meds.length;

	return (
		<div className="space-y-1">
			{label}
			{desc}
			<div className="space-y-2">
				{meds.map((med, i) => (
					<div
						key={keysRef.current[i]}
						className="rounded-md border p-3 space-y-2"
					>
						<div className="flex items-center justify-between">
							<p className="text-sm font-medium">Medicine {i + 1}</p>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={() => remove(i)}
								aria-label={`Remove medicine ${i + 1}`}
							>
								<Trash2 className="h-4 w-4 text-destructive" />
							</Button>
						</div>
						<Input
							label="Name"
							value={med.name ?? ""}
							onChange={(e) => update(i, "name", e.target.value)}
							placeholder="Medicine name"
						/>
						<div className="grid grid-cols-2 gap-2">
							<LabeledSelect
								label="Route"
								options={EventForm.medicineRoutes}
								value={med.route ?? ""}
								onChange={(v) => update(i, "route", v)}
							/>
							<LabeledSelect
								label="Form"
								options={EventForm.medicineForms}
								value={med.form ?? ""}
								onChange={(v) => update(i, "form", v)}
							/>
						</div>
						<div className="grid grid-cols-2 gap-2">
							<Input
								label="Dose"
								type="number"
								value={med.dose ?? ""}
								onChange={(e) => update(i, "dose", e.target.value)}
							/>
							<LabeledSelect
								label="Dosage unit"
								options={EventForm.doseUnits}
								value={med.doseUnits ?? ""}
								onChange={(v) => update(i, "doseUnits", v)}
							/>
						</div>
						<div className="grid grid-cols-2 gap-2">
							<Input
								label="Frequency"
								value={med.frequency ?? ""}
								onChange={(e) => update(i, "frequency", e.target.value)}
								placeholder="e.g. 1x3"
							/>
							<Input
								label="Intervals"
								value={med.intervals ?? ""}
								onChange={(e) => update(i, "intervals", e.target.value)}
								placeholder="e.g. every 8h"
							/>
						</div>
						<div className="grid grid-cols-2 gap-2">
							<Input
								label="Duration"
								type="number"
								value={med.duration ?? ""}
								onChange={(e) => update(i, "duration", e.target.value)}
							/>
							<LabeledSelect
								label="Duration unit"
								options={EventForm.durationUnits}
								value={med.durationUnits ?? ""}
								onChange={(v) => update(i, "durationUnits", v)}
							/>
						</div>
					</div>
				))}
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={() => onChange([...meds, emptyMedicineEntry()])}
				>
					<Plus className="h-4 w-4 mr-1" />
					Add medicine
				</Button>
			</div>
		</div>
	);
}

/**
 * Renders a single event form field for data entry.
 * Handles: free-text, date, options (radio/select, single/multi), binary,
 * diagnosis, medicine, file, separator, and text-display field types.
 */
export function FormFieldEntry({
	field,
	value,
	onChange,
}: {
	field: any;
	value: any;
	onChange: (value: any) => void;
}) {
	// Static display — no input
	if (field.fieldType === "text") {
		return (
			<p className="text-sm font-medium text-foreground">
				{field.content ?? field.name}
			</p>
		);
	}

	if (field.fieldType === "separator") {
		return <Separator />;
	}

	const inputId = `visit-field-${field.id}`;

	const label = (
		<Label htmlFor={inputId}>
			{field.name}
			{field.required && (
				<span className="text-destructive ml-1" aria-hidden>
					*
				</span>
			)}
		</Label>
	);

	const desc = field.description ? (
		<p className="text-xs text-muted-foreground">{field.description}</p>
	) : null;

	// Date
	if (field.fieldType === "date") {
		return (
			<div className="space-y-1">
				{label}
				{desc}
				<Input
					id={inputId}
					type="date"
					value={value ?? ""}
					onChange={(e) => onChange(e.target.value)}
					required={field.required}
				/>
			</div>
		);
	}

	// Free text / number / long text
	// Note: the server migrates `inputType: "textarea"` → `inputType: "text"` + `length: "long"`
	if (field.fieldType === "free-text") {
		const isLong = field.length === "long" || field.inputType === "textarea";
		if (isLong) {
			return (
				<div className="space-y-1">
					{label}
					{desc}
					<Textarea
						id={inputId}
						value={value ?? ""}
						onChange={(e) => onChange(e.target.value)}
						required={field.required}
						rows={3}
					/>
				</div>
			);
		}
		return (
			<div className="space-y-1">
				{label}
				{desc}
				<Input
					id={inputId}
					type={field.inputType === "number" ? "number" : "text"}
					value={value ?? ""}
					onChange={(e) => onChange(e.target.value)}
					required={field.required}
				/>
			</div>
		);
	}

	// Options / binary — radio or select, single or multi
	if (field.fieldType === "options" || field.fieldType === "binary") {
		const options: EventForm.FieldOption[] = field.options ?? [];
		const isMulti = Boolean(field.multi);

		// Multi-select: render as checkboxes regardless of inputType
		if (isMulti) {
			const selected: string[] = Array.isArray(value) ? value : [];
			return (
				<div className="space-y-1">
					{label}
					{desc}
					<div className="space-y-2 mt-1">
						{options.map((opt) => (
							<div key={opt.value} className="flex items-center space-x-2">
								<Checkbox
									id={`${field.id}-${opt.value}`}
									checked={selected.includes(opt.value)}
									onCheckedChange={(checked) =>
										onChange(
											checked
												? [...selected, opt.value]
												: selected.filter((v) => v !== opt.value),
										)
									}
								/>
								<Label htmlFor={`${field.id}-${opt.value}`}>{opt.label}</Label>
							</div>
						))}
					</div>
				</div>
			);
		}

		// Single select (dropdown)
		if (field.inputType === "select") {
			return (
				<div className="space-y-1">
					{label}
					{desc}
					<Select value={value ?? ""} onValueChange={onChange}>
						<SelectTrigger>
							<SelectValue placeholder="Select…" />
						</SelectTrigger>
						<SelectContent>
							{options.map((opt) => (
								<SelectItem key={opt.value} value={opt.value}>
									{opt.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			);
		}

		// Single radio
		return (
			<div className="space-y-1">
				{label}
				{desc}
				<RadioGroup
					value={value ?? ""}
					onValueChange={onChange}
					className="mt-1"
				>
					{options.map((opt) => (
						<div key={opt.value} className="flex items-center space-x-2">
							<RadioGroupItem
								value={opt.value}
								id={`${field.id}-${opt.value}`}
							/>
							<Label htmlFor={`${field.id}-${opt.value}`}>{opt.label}</Label>
						</div>
					))}
				</RadioGroup>
			</div>
		);
	}

	// Diagnosis — structured ICD-11 entry storing [{ code, desc }]
	if (field.fieldType === "diagnosis") {
		return (
			<DiagnosisFieldEntry
				value={value}
				onChange={onChange}
				label={label}
				desc={desc}
			/>
		);
	}

	// Medicine / input-group — structured per-medicine sub-forms
	if (field.fieldType === "medicine" || field.fieldType === "input-group") {
		return (
			<MedicineFieldEntry
				value={value}
				onChange={onChange}
				label={label}
				desc={desc}
			/>
		);
	}

	// File / image upload
	if (field.fieldType === "file") {
		return (
			<FileFieldEntry
				value={value}
				onChange={onChange}
				label={label}
				desc={desc}
			/>
		);
	}

	// Fallback for any unknown field types
	return (
		<div className="space-y-1">
			{label}
			{desc}
			<Input
				value={value ?? ""}
				onChange={(e) => onChange(e.target.value)}
				required={field.required}
			/>
		</div>
	);
}

export function CreateVisitDialog({
	patientId,
	clinicId,
	providerId,
	providerName: defaultProviderName,
	onVisitCreated,
}: Props) {
	const [open, setOpen] = useState(false);
	const [step, setStep] = useState<Step>("details");

	// Step 1 state
	const [providerName, setProviderName] = useState(defaultProviderName);
	const [checkInTimestamp, setCheckInTimestamp] = useState(() =>
		toDatetimeLocal(new Date()),
	);
	const [forms, setForms] = useState<EventForm.EncodedT[]>([]);
	const [formsLoading, setFormsLoading] = useState(false);
	const [selectedForm, setSelectedForm] = useState<EventForm.EncodedT | null>(
		null,
	);

	// Step 2 state
	const [formValues, setFormValues] = useState<Record<string, any>>({});

	const [submitting, setSubmitting] = useState(false);

	const nowLocal = toDatetimeLocal(new Date());

	// Load available forms when the dialog opens
	useEffect(() => {
		if (!open) return;
		setFormsLoading(true);
		getEventForms({ data: { includeDeleted: false } })
			.then((result) => setForms(result))
			.catch(() => toast.error("Failed to load forms"))
			.finally(() => setFormsLoading(false));
	}, [open]);

	const resetState = () => {
		setStep("details");
		setProviderName(defaultProviderName);
		setCheckInTimestamp(toDatetimeLocal(new Date()));
		setSelectedForm(null);
		setFormValues({});
	};

	const handleOpenChange = (v: boolean) => {
		setOpen(v);
		// Reset when opening (not just closing): closes performed via
		// `setOpen(false)` after a successful create bypass this handler,
		// so leftover state would otherwise leak into the next visit.
		resetState();
	};

	const handleFieldChange = (fieldId: string, value: any) => {
		setFormValues((prev) => ({ ...prev, [fieldId]: value }));
	};

	const handleContinue = () => {
		if (selectedForm) {
			setStep("form-entry");
		} else {
			handleSubmit(null);
		}
	};

	const handleSubmit = async (form: EventForm.EncodedT | null) => {
		if (!clinicId) {
			toast.error(
				"Your account is not assigned to a clinic. Contact an administrator.",
			);
			return;
		}

		const fields = form ? ((form.form_fields ?? []) as any[]) : [];

		// Required-field validation for the structured entry components, which
		// (unlike plain inputs) can't rely on the HTML `required` attribute
		if (form) {
			const missing = fields
				.filter(
					(f) =>
						f.required &&
						(f.fieldType === "diagnosis" ||
							f.fieldType === "medicine" ||
							f.fieldType === "input-group"),
				)
				.filter((f) => {
					const v = formValues[f.id];
					return !Array.isArray(v) || v.length === 0;
				});
			if (missing.length > 0) {
				toast.error(
					`Please complete required fields: ${missing.map((f) => f.name).join(", ")}`,
				);
				return;
			}
		}

		setSubmitting(true);
		try {
			// 1. Create the visit
			const visitResult = await createVisit({
				data: {
					patientId,
					clinicId,
					providerId,
					providerName: providerName.trim() || null,
					checkInTimestamp: new Date(checkInTimestamp).toISOString(),
				},
			});

			if (!visitResult.success) {
				toast.error(visitResult.error ?? "Failed to create visit");
				return;
			}

			// 2. If a form was selected, create the event linked to the new visit
			if (form) {
				const formData = fields
					.filter((f) => f.fieldType !== "text" && f.fieldType !== "separator")
					.map((f) => ({
						fieldId: f.id,
						name: f.name,
						fieldType: f.fieldType,
						inputType: f.inputType,
						value: formValues[f.id] ?? null,
					}));

				const eventResult = await createEvent({
					data: {
						patientId,
						visitId: visitResult.id,
						formId: form.id,
						eventType: form.name ?? null,
						formData,
					},
				});

				if (!eventResult.success) {
					// The visit was created — still refresh, but warn about the event
					toast.error(
						"Visit was created but the form data could not be saved.",
					);
					onVisitCreated();
					setOpen(false);
					return;
				}
			}

			toast.success("Visit created");
			setOpen(false);
			onVisitCreated();
		} catch {
			toast.error("Failed to create visit");
		} finally {
			setSubmitting(false);
		}
	};

	const formFields = (selectedForm?.form_fields ?? []) as any[];

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogTrigger asChild>
				<Button size="sm">
					<Plus className="h-4 w-4 mr-1" />
					New Visit
				</Button>
			</DialogTrigger>

			<DialogContent className="sm:max-w-lg">
				{step === "details" ? (
					<>
						<DialogHeader>
							<DialogTitle>New Visit</DialogTitle>
							<DialogDescription>
								Record a new visit for this patient.
							</DialogDescription>
						</DialogHeader>

						<div className="space-y-4 py-2">
							<div className="space-y-2">
								<Label htmlFor="cv-check-in">Check-in date &amp; time</Label>
								<Input
									id="cv-check-in"
									type="datetime-local"
									value={checkInTimestamp}
									max={nowLocal}
									onChange={(e) => setCheckInTimestamp(e.target.value)}
								/>
							</div>

							<div className="space-y-2">
								<Label htmlFor="cv-provider">Provider name</Label>
								<Input
									id="cv-provider"
									type="text"
									value={providerName}
									onChange={(e) => setProviderName(e.target.value)}
									placeholder="Provider name"
								/>
							</div>

							<Separator />

							<div className="space-y-2">
								<Label>
									Select a form{" "}
									<span className="font-normal text-muted-foreground">
										(optional)
									</span>
								</Label>

								{formsLoading ? (
									<p className="text-sm text-muted-foreground">
										Loading forms…
									</p>
								) : forms.length === 0 ? (
									<p className="text-sm text-muted-foreground">
										No forms available.
									</p>
								) : (
									<div className="max-h-48 overflow-y-auto space-y-1 pr-1">
										{forms.map((form) => (
											<button
												key={form.id}
												type="button"
												onClick={() =>
													setSelectedForm(
														selectedForm?.id === form.id ? null : form,
													)
												}
												className={`w-full text-left rounded-lg border px-3 py-2 text-sm transition-colors ${
													selectedForm?.id === form.id
														? "border-primary bg-primary/5"
														: "border-border hover:bg-muted/50"
												}`}
											>
												<p className="font-medium">
													{form.name ?? "Unnamed form"}
												</p>
												{form.description && (
													<p className="text-xs text-muted-foreground mt-0.5">
														{form.description}
													</p>
												)}
											</button>
										))}
									</div>
								)}
							</div>
						</div>

						<DialogFooter>
							<Button
								variant="ghost"
								onClick={() => setOpen(false)}
								disabled={submitting}
							>
								Cancel
							</Button>
							<Button
								onClick={handleContinue}
								disabled={submitting || formsLoading}
							>
								{submitting
									? "Creating…"
									: selectedForm
										? "Continue"
										: "Create Visit"}
							</Button>
						</DialogFooter>
					</>
				) : (
					<>
						<DialogHeader>
							<DialogTitle>{selectedForm?.name ?? "Fill in form"}</DialogTitle>
							<DialogDescription>
								Complete the form for this visit.
							</DialogDescription>
						</DialogHeader>

						<div className="max-h-[60vh] overflow-y-auto space-y-4 py-2 pr-1">
							{formFields.length === 0 ? (
								<p className="text-sm text-muted-foreground text-center py-4">
									This form has no fields.
								</p>
							) : (
								formFields.map((field) => (
									<FormFieldEntry
										key={field.id}
										field={field}
										value={formValues[field.id]}
										onChange={(v) => handleFieldChange(field.id, v)}
									/>
								))
							)}
						</div>

						<DialogFooter className="flex-row justify-between sm:justify-between">
							<Button
								variant="ghost"
								onClick={() => setStep("details")}
								disabled={submitting}
							>
								<ChevronLeft className="h-4 w-4 mr-1" />
								Back
							</Button>
							<Button
								onClick={() => handleSubmit(selectedForm)}
								disabled={submitting}
							>
								{submitting ? "Creating…" : "Create Visit"}
							</Button>
						</DialogFooter>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
