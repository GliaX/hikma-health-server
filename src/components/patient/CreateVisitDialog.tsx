import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Plus, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createVisit } from "@/lib/server-functions/visits";
import { createEvent } from "@/lib/server-functions/events";
import { getEventForms } from "@/lib/server-functions/event-forms";
import { toast } from "sonner";
import type EventForm from "@/models/event-form";

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
 * Renders a single event form field for data entry.
 * Handles: free-text, date, options (radio/select, single/multi), binary,
 * diagnosis, medicine, separator, and text-display field types.
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

  const label = (
    <Label>
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
    const isLong =
      field.length === "long" || field.inputType === "textarea";
    if (isLong) {
      return (
        <div className="space-y-1">
          {label}
          {desc}
          <Textarea
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
                <Label htmlFor={`${field.id}-${opt.value}`}>
                  {opt.label}
                </Label>
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

  // Diagnosis — simplified text entry
  if (field.fieldType === "diagnosis") {
    return (
      <div className="space-y-1">
        {label}
        {desc}
        <Textarea
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
          placeholder="Enter diagnosis…"
          rows={2}
        />
      </div>
    );
  }

  // Medicine / input-group — simplified text entry
  if (field.fieldType === "medicine" || field.fieldType === "input-group") {
    return (
      <div className="space-y-1">
        {label}
        {desc}
        <Textarea
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
          placeholder="Enter medicine details…"
          rows={2}
        />
      </div>
    );
  }

  // File — not supported inside a dialog
  if (field.fieldType === "file") {
    return (
      <div className="space-y-1">
        {label}
        <p className="text-xs text-muted-foreground">
          File uploads are not supported here.
        </p>
      </div>
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
    if (!v) resetState();
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
        const fields: any[] = form.form_fields ?? [];
        const formData = fields
          .filter(
            (f) => f.fieldType !== "text" && f.fieldType !== "separator",
          )
          .map((f) => ({
            fieldId: f.id,
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

  const formFields: any[] = selectedForm?.form_fields ?? [];

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
