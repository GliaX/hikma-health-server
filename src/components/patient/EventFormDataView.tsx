import { format } from "date-fns";

type FormDataItem = Record<string, any>;

/** Field types that carry no user-entered data and should be skipped. */
const DISPLAY_ONLY_FIELD_TYPES = new Set(["text", "separator"]);

// ---------------------------------------------------------------------------
// Field-type renderers
// ---------------------------------------------------------------------------

function DiagnosisValue({ value }: { value: Array<{ code: string; desc: string }> }) {
  if (!Array.isArray(value) || value.length === 0) return <Empty />;
  return (
    <ul className="space-y-0.5">
      {value.map((dx, i) => (
        <li key={i} className="text-sm">
          <span className="font-mono text-xs text-muted-foreground mr-1">
            ({dx.code})
          </span>
          {dx.desc}
        </li>
      ))}
    </ul>
  );
}

function MedicineValue({
  value,
}: {
  value: Array<{
    name: string;
    dose: number;
    doseUnits: string;
    form: string;
    route: string;
    frequency: string;
    duration: number;
    durationUnits: string;
  }>;
}) {
  if (!Array.isArray(value) || value.length === 0) return <Empty />;
  return (
    <ul className="space-y-2">
      {value.map((med, i) => (
        <li key={i} className="text-sm space-y-0.5">
          <p className="font-medium">
            {med.name}{" "}
            <span className="font-normal text-muted-foreground">
              ({med.dose} {med.doseUnits})
            </span>
          </p>
          <p className="text-muted-foreground">
            {med.form} · {med.route} · {med.frequency}
            {med.duration
              ? ` · ${med.duration} ${med.durationUnits}`
              : null}
          </p>
        </li>
      ))}
    </ul>
  );
}

function ImageValue({ resourceId }: { resourceId: string }) {
  if (!resourceId) return <Empty />;
  return (
    <a
      href={`/api/forms/resources/${resourceId}`}
      target="_blank"
      rel="noopener noreferrer"
      className="block"
    >
      <img
        src={`/api/forms/resources/${resourceId}`}
        alt="Uploaded image"
        className="max-h-48 max-w-full rounded-md border object-contain"
      />
    </a>
  );
}

function DateValue({ value }: { value: unknown }) {
  if (!value) return <Empty />;
  try {
    return <span>{format(new Date(String(value)), "MMM dd, yyyy")}</span>;
  } catch {
    return <span>{String(value)}</span>;
  }
}

function Empty() {
  return <span className="text-muted-foreground italic text-sm">—</span>;
}

function FieldValue({ item }: { item: FormDataItem }) {
  // Diagnosis
  if (item.fieldType === "diagnosis") {
    return <DiagnosisValue value={item.value} />;
  }

  // Medicine
  if (item.fieldType === "medicine" || item.inputType === "input-group") {
    return <MedicineValue value={item.value} />;
  }

  // File / image upload
  if (item.inputType === "file") {
    return <ImageValue resourceId={item.value} />;
  }

  // Date
  if (item.inputType === "date") {
    return <DateValue value={item.value} />;
  }

  // Empty / missing
  if (item.value === null || item.value === undefined || item.value === "") {
    return <Empty />;
  }

  // Arrays (unexpected shape — join as fallback)
  if (Array.isArray(item.value)) {
    const joined = item.value.join(", ");
    return joined ? <span className="text-sm">{joined}</span> : <Empty />;
  }

  // Multi-select stored as "; "-separated string
  const str = String(item.value);
  if (str.includes("; ")) {
    return <span className="text-sm">{str.split("; ").join(", ")}</span>;
  }

  return <span className="text-sm">{str}</span>;
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

type Props = {
  formData: FormDataItem[];
};

/**
 * Read-only display of a submitted event form's field values.
 * Renders each non-display-only field as a label/value row,
 * with type-aware rendering for diagnoses, medicines, and images.
 */
export function EventFormDataView({ formData }: Props) {
  if (!Array.isArray(formData) || formData.length === 0) return null;

  const fields = formData.filter(
    (item) => !DISPLAY_ONLY_FIELD_TYPES.has(item.fieldType),
  );

  if (fields.length === 0) return null;

  return (
    <div className="mt-2 space-y-2 rounded-md bg-muted/40 p-3">
      {fields.map((item, i) => (
        <div
          key={item.fieldId ?? i}
          className="grid grid-cols-3 gap-x-4 gap-y-1 text-sm"
        >
          <span className="col-span-1 font-medium text-muted-foreground truncate pt-0.5">
            {item.name}
          </span>
          <div className="col-span-2">
            <FieldValue item={item} />
          </div>
        </div>
      ))}
    </div>
  );
}
