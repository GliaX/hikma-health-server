import { createFileRoute, Link } from "@tanstack/react-router";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePickerInput } from "@/components/date-picker-input";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import PatientRegistrationForm from "@/models/patient-registration-form";
import Language from "@/models/language";
import { createServerFn } from "@tanstack/react-start";
import { Label } from "@/components/ui/label";
import upperFirst from "lodash/upperFirst";
import { v1 as uuidv1 } from "uuid";
import { SelectInput } from "@/components/select-input";
import { getAllClinics } from "@/lib/server-functions/clinics";
import {
  joinCheckboxValues,
  splitCheckboxValues,
} from "@/lib/utils";
import { Result } from "@/lib/result";
import { getCookie } from "@tanstack/react-start/server";
import { createServerCaller, createQueryCaller } from "@/integrations/trpc/router";

type RegisterPatientInput = {
  patient: {
    id: string;
    given_name?: string | null;
    surname?: string | null;
    date_of_birth?: string | null;
    sex?: string | null;
    citizenship?: string | null;
    hometown?: string | null;
    phone?: string | null;
    camp?: string | null;
    government_id?: string | null;
    external_patient_id?: string | null;
    additional_data?: Record<string, any>;
    metadata?: Record<string, any>;
    photo_url?: string | null;
    primary_clinic_id?: string | null;
  };
  additional_attributes?: Array<{
    attribute_id: string;
    attribute: string;
    number_value?: number | null;
    string_value?: string | null;
    date_value?: string | null;
    boolean_value?: boolean | null;
    metadata?: Record<string, any>;
  }>;
};

export const createPatient = createServerFn({ method: "POST" })
  .inputValidator((data: RegisterPatientInput) => data)
  .handler(async ({ data }) => {
    const token = getCookie("token");
    if (!token) throw new Error("Unauthorized");

    const caller = createServerCaller({
      authHeader: `Bearer ${token}`,
    });

    const result = await caller.register_patient({
      patient: { ...data.patient },
      additional_attributes: data.additional_attributes,
    });

    return { patientId: result.patient_id };
  });

export const getAllPatientRegistrationForms = createServerFn({
  method: "GET",
}).handler(async () => {
  return PatientRegistrationForm.getAll();
});

export const checkGovtIdExists = createServerFn({ method: "GET" })
  .inputValidator((data: { government_id: string }) => data)
  .handler(async ({ data }) => {
    const token = getCookie("token");
    if (!token) throw new Error("Unauthorized");
    const caller = createQueryCaller({ authHeader: `Bearer ${token}` });
    return caller.patients.check_government_id({ government_id: data.government_id });
  });

export const findSimilarPatients = createServerFn({ method: "GET" })
  .inputValidator((data: { given_name: string; surname: string }) => data)
  .handler(async ({ data }) => {
    const token = getCookie("token");
    if (!token) throw new Error("Unauthorized");
    const caller = createQueryCaller({ authHeader: `Bearer ${token}` });
    return caller.patients.similar({ given_name: data.given_name, surname: data.surname, limit: 5 });
  });

export const Route = createFileRoute("/app/patients/register")({
  component: RouteComponent,
  loader: async () => {
    const patientRegistrationForm = await getAllPatientRegistrationForms();
    const clinicsList = Result.getOrElse(await getAllClinics(), []);
    return { patientRegistrationForm: patientRegistrationForm[0], clinicsList };
  },
});

function RouteComponent() {
  const { patientRegistrationForm, clinicsList } = Route.useLoaderData();
  const navigate = Route.useNavigate();

  const [lang, setLang] = useState<string>("en");
  const [govtIdExists, setGovtIdExists] = useState(false);
  const [similarPatients, setSimilarPatients] = useState<Array<{ id: string; given_name: string; surname: string; date_of_birth: string | null }>>([]);

  const { formState, handleSubmit, register, watch, setValue } = useForm({
    mode: "onSubmit",
  });

  const watchedGovtId = watch("government_id");
  const watchedGivenName = watch("given_name");
  const watchedSurname = watch("surname");

  // Debounced government ID duplicate check
  useEffect(() => {
    if (!watchedGovtId || watchedGovtId.trim().length < 2) {
      setGovtIdExists(false);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const result = await checkGovtIdExists({ data: { government_id: watchedGovtId.trim() } });
        setGovtIdExists(result.exists);
      } catch {
        setGovtIdExists(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [watchedGovtId]);

  // Debounced similar-name search
  useEffect(() => {
    if (!watchedGivenName || !watchedSurname || watchedGivenName.trim().length < 2 || watchedSurname.trim().length < 2) {
      setSimilarPatients([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const result = await findSimilarPatients({ data: { given_name: watchedGivenName.trim(), surname: watchedSurname.trim() } });
        setSimilarPatients(result.data as any);
      } catch {
        setSimilarPatients([]);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [watchedGivenName, watchedSurname]);

  const onSubmit = async (data: any) => {
    const patientId = uuidv1();

    const patient: RegisterPatientInput["patient"] = {
      id: patientId,
      given_name: data.given_name ?? null,
      surname: data.surname ?? null,
      date_of_birth: data.date_of_birth instanceof Date
        ? data.date_of_birth.toISOString()
        : data.date_of_birth ?? null,
      sex: data.sex ?? null,
      citizenship: data.citizenship ?? null,
      hometown: data.hometown ?? null,
      phone: data.phone ?? null,
      camp: data.camp ?? null,
      government_id: data.government_id ?? null,
      external_patient_id: data.external_patient_id ?? null,
      photo_url: data.photo_url ?? null,
      primary_clinic_id: data.primary_clinic_id ?? null,
      additional_data: data.additional_data || {},
      metadata: {},
    };

    const additional_attributes: NonNullable<
      RegisterPatientInput["additional_attributes"]
    > = [];

    patientRegistrationForm?.fields
      .filter((field) => field.deleted !== true && field.visible)
      .forEach((field) => {
        if (!field.baseField) {
          additional_attributes.push({
            attribute_id: field.id,
            attribute: field.column,
            number_value:
              field.fieldType === "number" ? Number(data[field.column]) : null,
            string_value: ["text", "select", "checkbox"].includes(
              field.fieldType,
            )
              ? String(data[field.column] ?? "")
              : null,
            date_value:
              field.fieldType === "date" && data[field.column]
                ? data[field.column] instanceof Date
                  ? data[field.column].toISOString()
                  : String(data[field.column])
                : null,
            boolean_value:
              field.fieldType === "boolean"
                ? Boolean(data[field.column])
                : null,
            metadata: {},
          });
        }
      });

    try {
      const result = await createPatient({
        data: { patient, additional_attributes },
      });
      navigate({ to: `/app/patients/${result.patientId}` });
    } catch (error) {
      console.error("Failed to register patient:", error);
      const reason = error instanceof Error ? error.message : String(error);
      alert(`Failed to register patient: ${reason}`);
    }
  };

  if (!patientRegistrationForm) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-semibold text-gray-800">
            No Registration Form Available
          </h2>
          <p className="text-gray-600">
            Please create a patient registration form first.
          </p>
          <Link to="/app/patients/customize-registration-form" className="mt-4">
            <Button className="primary">Create Registration Form</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-4">
      <form onSubmit={handleSubmit(onSubmit)}>
        <div style={{ maxWidth: 500 }} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-muted-foreground">Language</Label>
            <Select value={lang} onValueChange={setLang}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Language.supportedLanguages.map((code) => (
                  <SelectItem key={code} value={code}>
                    {Language.friendlyLang(code)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {patientRegistrationForm?.fields
            .filter((field) => field.visible && field.deleted !== true)
            .map((field, idx) => {
              const fieldLabel = Language.getTranslation(field.label, lang);
              const fieldError = formState.errors[field.column];

              if (
                field.fieldType === "text" &&
                field.column !== "primary_clinic_id"
              ) {
                const isGovtId = field.column === "government_id";
                return (
                  <div key={field.id} className="space-y-2">
                    <Label
                      htmlFor={field.column}
                      className="text-muted-foreground"
                    >
                      {fieldLabel}{field.required && <span className="text-destructive"> *</span>}
                    </Label>
                    <Input
                      data-testid={"register-patient-" + idx}
                      data-inputtype={"text"}
                      data-column={field.column}
                      key={field.id}
                      className={isGovtId && govtIdExists ? "border-destructive focus-visible:ring-destructive" : ""}
                      {...register(field.column, {
                        required: field.required && `${fieldLabel} is required`,
                      })}
                    />
                    {isGovtId && govtIdExists && (
                      <p className="text-sm text-destructive font-medium">
                        A patient with this government ID is already registered.
                      </p>
                    )}
                    {fieldError && (
                      <p className="text-sm text-destructive">{fieldError.message as string}</p>
                    )}
                  </div>
                );
              }
              if (field.column === "primary_clinic_id") {
                return (
                  <div key={field.id} className="space-y-2">
                    <SelectInput
                      className="w-full"
                      data-testid={"register-patient-" + idx}
                      data-inputtype={"select"}
                      label={field.required ? `${fieldLabel} *` : fieldLabel}
                      data={clinicsList.map((clinic) => ({
                        label: clinic.name,
                        value: clinic.id,
                      }))}
                      value={watch(field.column)}
                      onChange={(v) => setValue(field.column, v, { shouldValidate: true })}
                    />
                    <input type="hidden" {...register(field.column, {
                      required: field.required && `${fieldLabel} is required`,
                    })} />
                    {fieldError && (
                      <p className="text-sm text-destructive">{fieldError.message as string}</p>
                    )}
                  </div>
                );
              }
              if (field.fieldType === "number") {
                return (
                  <div key={field.id} className="space-y-2">
                    <Label
                      htmlFor={field.column}
                      className="text-muted-foreground"
                    >
                      {fieldLabel}{field.required && <span className="text-destructive"> *</span>}
                    </Label>
                    <Input
                      data-inputtype={"number"}
                      data-testid={"register-patient-" + idx}
                      key={field.id}
                      {...register(field.column, {
                        required: field.required && `${fieldLabel} is required`,
                      })}
                    />
                    {fieldError && (
                      <p className="text-sm text-destructive">{fieldError.message as string}</p>
                    )}
                  </div>
                );
              }
              if (field.fieldType === "select") {
                return (
                  <div key={field.id} className="space-y-2">
                    <Label
                      htmlFor={field.column}
                      className="text-muted-foreground"
                    >
                      {fieldLabel}{field.required && <span className="text-destructive"> *</span>}
                    </Label>
                    <Select
                      key={field.id}
                      value={watch(field.column)}
                      data-inputtype="select"
                      data-testid={"register-patient-" + idx}
                      onValueChange={(value) => setValue(field.column, value, { shouldValidate: true })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue
                          placeholder={`Select ${fieldLabel}`}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectLabel>
                            {fieldLabel}
                          </SelectLabel>
                          {field.options.map((opt) => (
                            <SelectItem
                              key={Language.getTranslation(opt, "en")}
                              data-testid={Language.getTranslation(opt, "en")}
                              value={Language.getTranslation(opt, "en")}
                            >
                              {upperFirst(Language.getTranslation(opt, lang))}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <input type="hidden" {...register(field.column, {
                      required: field.required && `${fieldLabel} is required`,
                    })} />
                    {fieldError && (
                      <p className="text-sm text-destructive">{fieldError.message as string}</p>
                    )}
                  </div>
                );
              }
              if (field.fieldType === "checkbox") {
                const currentValue = watch(field.column) || "";
                const selectedValues = splitCheckboxValues(currentValue);
                return (
                  <div key={field.id} className="space-y-2">
                    <Label
                      htmlFor={field.column}
                      className="text-muted-foreground"
                    >
                      {fieldLabel}{field.required && <span className="text-destructive"> *</span>}
                    </Label>
                    <div className="space-y-1">
                      {field.options.map((opt) => {
                        const optValue = Language.getTranslation(opt, "en");
                        const optDisplay = Language.getTranslation(opt, lang);
                        const isChecked = selectedValues.includes(optValue);
                        return (
                          <div
                            key={optValue}
                            className="flex items-center space-x-2"
                          >
                            <input
                              type="checkbox"
                              id={`${field.column}-${optValue}`}
                              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                              checked={isChecked}
                              data-testid={`register-patient-${idx}-${optValue}`}
                              onChange={(e) => {
                                const next = e.target.checked
                                  ? [...selectedValues, optValue]
                                  : selectedValues.filter(
                                      (v) => v !== optValue,
                                    );
                                setValue(
                                  field.column,
                                  joinCheckboxValues(next),
                                  { shouldValidate: true },
                                );
                              }}
                            />
                            <label
                              htmlFor={`${field.column}-${optValue}`}
                              className="text-sm"
                            >
                              {upperFirst(optDisplay)}
                            </label>
                          </div>
                        );
                      })}
                    </div>
                    <input type="hidden" {...register(field.column, {
                      required: field.required && `${fieldLabel} is required`,
                    })} />
                    {fieldError && (
                      <p className="text-sm text-destructive">{fieldError.message as string}</p>
                    )}
                  </div>
                );
              }
              if (field.fieldType === "date") {
                return (
                  <div key={field.id} className="space-y-2">
                    <Label
                      htmlFor={field.column}
                      className="text-muted-foreground"
                    >
                      {fieldLabel}{field.required && <span className="text-destructive"> *</span>}
                    </Label>
                    <DatePickerInput
                      required={field.required}
                      placeholder="Pick date"
                      data-testid={"register-patient-" + idx}
                      data-inputtype="date"
                      value={watch(field.column)}
                      onChange={(date) => setValue(field.column, date, { shouldValidate: true })}
                    />
                    <input type="hidden" {...register(field.column, {
                      required: field.required && `${fieldLabel} is required`,
                    })} />
                    {fieldError && (
                      <p className="text-sm text-destructive">{fieldError.message as string}</p>
                    )}
                  </div>
                );
              }
              return <div></div>;
            })}

          {similarPatients.length > 0 && (
            <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4 space-y-2">
              <p className="text-sm font-semibold text-yellow-800">
                Similar patients found — please verify this is not a duplicate before submitting:
              </p>
              <ul className="space-y-1">
                {similarPatients.map((p) => (
                  <li key={p.id}>
                    <Link
                      to="/app/patients/$patientId"
                      params={{ patientId: p.id }}
                      className="text-sm text-yellow-900 underline hover:text-yellow-700"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {p.given_name} {p.surname}
                      {p.date_of_birth ? ` — DOB: ${String(p.date_of_birth).split("T")[0]}` : ""}
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-yellow-700">You can still proceed with registration if this is a different patient.</p>
            </div>
          )}

          <Button
            type="submit"
            data-testid={"submit-button"}
            className="primary"
            disabled={govtIdExists || formState.isSubmitting}
          >
            {formState.isSubmitting ? "Submitting..." : "Submit"}
          </Button>
          {govtIdExists && (
            <p className="text-sm text-destructive">
              Resolve the duplicate government ID before submitting.
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
