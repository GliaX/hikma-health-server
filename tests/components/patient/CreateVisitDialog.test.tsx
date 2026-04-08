import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  CreateVisitDialog,
  FormFieldEntry,
} from "@/components/patient/CreateVisitDialog";
import { createVisit } from "@/lib/server-functions/visits";
import { createEvent } from "@/lib/server-functions/events";
import { getEventForms } from "@/lib/server-functions/event-forms";
import { toast } from "sonner";

// ── Module mocks ──

vi.mock("@/lib/server-functions/visits", () => ({ createVisit: vi.fn() }));
vi.mock("@/lib/server-functions/events", () => ({ createEvent: vi.fn() }));
vi.mock("@/lib/server-functions/event-forms", () => ({
  getEventForms: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// ── Browser API stubs required by Radix UI in jsdom ──

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));
});

// ── Typed mock helpers ──

const mockCreateVisit = vi.mocked(createVisit);
const mockCreateEvent = vi.mocked(createEvent);
const mockGetEventForms = vi.mocked(getEventForms);
const mockToast = vi.mocked(toast);

// ── Test fixtures ──

const defaultProps = {
  patientId: "patient-123",
  clinicId: "clinic-456",
  providerId: "provider-789",
  providerName: "Dr. Smith",
  onVisitCreated: vi.fn(),
};

const sampleForm: any = {
  id: "form-001",
  name: "General Consultation",
  description: "Standard visit form",
  form_fields: [
    {
      id: "f1",
      fieldType: "free-text",
      inputType: "text",
      name: "Chief Complaint",
      description: "",
      required: true,
    },
    {
      id: "f2",
      fieldType: "date",
      inputType: "date",
      name: "Onset Date",
      description: "",
      required: false,
    },
  ],
  language: "en",
  is_editable: true,
  is_snapshot_form: false,
  metadata: {},
  clinic_ids: [],
  translations: [],
  is_deleted: false,
  created_at: new Date(),
  updated_at: new Date(),
  last_modified: new Date(),
  server_created_at: new Date(),
  deleted_at: null,
};

// ── FormFieldEntry tests ──

describe("FormFieldEntry", () => {
  it("renders a text input for free-text/text fields and fires onChange", () => {
    const onChange = vi.fn();
    const field = {
      id: "f1",
      fieldType: "free-text",
      inputType: "text",
      name: "Notes",
      description: "",
      required: false,
    };
    const { container } = render(
      <FormFieldEntry field={field} value="" onChange={onChange} />,
    );
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input).not.toBeNull();
    fireEvent.change(input, { target: { value: "hello" } });
    expect(onChange).toHaveBeenCalledWith("hello");
  });

  it("renders a number input for free-text/number fields", () => {
    const field = {
      id: "f1",
      fieldType: "free-text",
      inputType: "number",
      name: "Weight",
      description: "",
      required: false,
    };
    const { container } = render(
      <FormFieldEntry field={field} value="" onChange={vi.fn()} />,
    );
    expect(container.querySelector("input[type='number']")).not.toBeNull();
  });

  it("renders a textarea for free-text fields with length='long'", () => {
    const field = {
      id: "f1",
      fieldType: "free-text",
      inputType: "text",
      length: "long",
      name: "History",
      description: "",
      required: false,
    };
    const onChange = vi.fn();
    const { container } = render(
      <FormFieldEntry field={field} value="" onChange={onChange} />,
    );
    const ta = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(ta).not.toBeNull();
    fireEvent.change(ta, { target: { value: "long text" } });
    expect(onChange).toHaveBeenCalledWith("long text");
  });

  it("renders a date input for date fields and fires onChange", () => {
    const onChange = vi.fn();
    const field = {
      id: "f1",
      fieldType: "date",
      inputType: "date",
      name: "Visit Date",
      description: "",
      required: false,
    };
    const { container } = render(
      <FormFieldEntry field={field} value="" onChange={onChange} />,
    );
    const input = container.querySelector(
      "input[type='date']",
    ) as HTMLInputElement;
    expect(input).not.toBeNull();
    fireEvent.change(input, { target: { value: "2026-03-30" } });
    expect(onChange).toHaveBeenCalledWith("2026-03-30");
  });

  it("renders radio buttons for single-select options/radio fields", () => {
    const field = {
      id: "f1",
      fieldType: "options",
      inputType: "radio",
      name: "Result",
      description: "",
      required: false,
      multi: false,
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
      ],
    };
    const { container } = render(
      <FormFieldEntry field={field} value="" onChange={vi.fn()} />,
    );
    expect(
      container.querySelectorAll('button[role="radio"]').length,
    ).toBe(2);
  });

  it("renders checkboxes for multi-select options fields", () => {
    const field = {
      id: "f1",
      fieldType: "options",
      inputType: "radio",
      name: "Symptoms",
      description: "",
      required: false,
      multi: true,
      options: [
        { value: "fever", label: "Fever" },
        { value: "cough", label: "Cough" },
        { value: "fatigue", label: "Fatigue" },
      ],
    };
    const { container } = render(
      <FormFieldEntry field={field} value={[]} onChange={vi.fn()} />,
    );
    expect(
      container.querySelectorAll('button[role="checkbox"]').length,
    ).toBe(3);
  });

  it("fires onChange with updated array when a multi-select checkbox is toggled on", () => {
    const onChange = vi.fn();
    const field = {
      id: "f1",
      fieldType: "options",
      inputType: "radio",
      name: "Symptoms",
      description: "",
      required: false,
      multi: true,
      options: [
        { value: "fever", label: "Fever" },
        { value: "cough", label: "Cough" },
      ],
    };
    const { container } = render(
      <FormFieldEntry field={field} value={[]} onChange={onChange} />,
    );
    fireEvent.click(container.querySelectorAll('button[role="checkbox"]')[0]);
    expect(onChange).toHaveBeenCalledWith(["fever"]);
  });

  it("fires onChange removing the value when a checked checkbox is toggled off", () => {
    const onChange = vi.fn();
    const field = {
      id: "f1",
      fieldType: "options",
      inputType: "radio",
      name: "Symptoms",
      description: "",
      required: false,
      multi: true,
      options: [
        { value: "fever", label: "Fever" },
        { value: "cough", label: "Cough" },
      ],
    };
    const { container } = render(
      <FormFieldEntry field={field} value={["fever"]} onChange={onChange} />,
    );
    fireEvent.click(container.querySelectorAll('button[role="checkbox"]')[0]);
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("renders static text for text-display fields with no input element", () => {
    const field = {
      id: "f1",
      fieldType: "text",
      name: "Section header",
      description: "",
      required: false,
      content: "Patient History",
    };
    const { container } = render(
      <FormFieldEntry field={field} value={null} onChange={vi.fn()} />,
    );
    expect(container.querySelector("input")).toBeNull();
    expect(container.querySelector("textarea")).toBeNull();
    expect(container.textContent).toContain("Patient History");
  });

  it("renders a separator with no input element", () => {
    const field = {
      id: "f1",
      fieldType: "separator",
      name: "",
      description: "",
      required: false,
    };
    const { container } = render(
      <FormFieldEntry field={field} value={null} onChange={vi.fn()} />,
    );
    expect(container.querySelector("input")).toBeNull();
    expect(container.querySelector("textarea")).toBeNull();
  });

  it("renders a textarea for diagnosis fields", () => {
    const field = {
      id: "f1",
      fieldType: "diagnosis",
      inputType: "select",
      name: "Diagnosis",
      description: "",
      required: false,
      options: [],
    };
    const { container } = render(
      <FormFieldEntry field={field} value="" onChange={vi.fn()} />,
    );
    expect(container.querySelector("textarea")).not.toBeNull();
  });

  it("renders a textarea for medicine fields", () => {
    const field = {
      id: "f1",
      fieldType: "medicine",
      inputType: "input-group",
      name: "Medicine",
      description: "",
      required: false,
    };
    const { container } = render(
      <FormFieldEntry field={field} value="" onChange={vi.fn()} />,
    );
    expect(container.querySelector("textarea")).not.toBeNull();
  });

  it("renders an unsupported notice for file fields with no file input", () => {
    const field = {
      id: "f1",
      fieldType: "file",
      inputType: "file",
      name: "Attachment",
      description: "",
      required: false,
    };
    const { container } = render(
      <FormFieldEntry field={field} value={null} onChange={vi.fn()} />,
    );
    expect(container.querySelector("input[type='file']")).toBeNull();
    expect(container.textContent).toContain("not supported");
  });

  it("shows required indicator (*) for required fields", () => {
    const field = {
      id: "f1",
      fieldType: "free-text",
      inputType: "text",
      name: "Name",
      description: "",
      required: true,
    };
    const { container } = render(
      <FormFieldEntry field={field} value="" onChange={vi.fn()} />,
    );
    expect(container.querySelector(".text-destructive")).not.toBeNull();
  });

  it("does not show required indicator for optional fields", () => {
    const field = {
      id: "f1",
      fieldType: "free-text",
      inputType: "text",
      name: "Name",
      description: "",
      required: false,
    };
    const { container } = render(
      <FormFieldEntry field={field} value="" onChange={vi.fn()} />,
    );
    expect(container.querySelector(".text-destructive")).toBeNull();
  });
});

// ── CreateVisitDialog tests ──

describe("CreateVisitDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEventForms.mockResolvedValue([]);
    defaultProps.onVisitCreated = vi.fn();
  });

  // ── Smoke / render ──

  it("renders the trigger button", () => {
    render(<CreateVisitDialog {...defaultProps} />);
    expect(
      screen.getByRole("button", { name: /new visit/i }),
    ).toBeDefined();
  });

  it("shows step 1 content when the dialog is opened", async () => {
    render(<CreateVisitDialog {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /new visit/i }));
    expect(
      await screen.findByText("Record a new visit for this patient."),
    ).toBeDefined();
  });

  // ── Form selection ──

  it("shows 'Create Visit' button when no form is selected", async () => {
    render(<CreateVisitDialog {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /new visit/i }));
    await screen.findByText("Record a new visit for this patient.");
    expect(
      screen.getByRole("button", { name: /^create visit$/i }),
    ).toBeDefined();
  });

  it("changes button to 'Continue' when a form is selected", async () => {
    mockGetEventForms.mockResolvedValue([sampleForm]);
    render(<CreateVisitDialog {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /new visit/i }));
    fireEvent.click(await screen.findByText(sampleForm.name));
    expect(
      screen.getByRole("button", { name: /^continue$/i }),
    ).toBeDefined();
  });

  it("deselects a form when the same form is clicked a second time", async () => {
    mockGetEventForms.mockResolvedValue([sampleForm]);
    render(<CreateVisitDialog {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /new visit/i }));
    const formBtn = await screen.findByText(sampleForm.name);
    fireEvent.click(formBtn); // select
    fireEvent.click(formBtn); // deselect
    expect(
      screen.getByRole("button", { name: /^create visit$/i }),
    ).toBeDefined();
  });

  // ── Step transitions ──

  it("advances to step 2 when Continue is clicked", async () => {
    mockGetEventForms.mockResolvedValue([sampleForm]);
    render(<CreateVisitDialog {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /new visit/i }));
    fireEvent.click(await screen.findByText(sampleForm.name));
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    expect(
      await screen.findByText("Complete the form for this visit."),
    ).toBeDefined();
  });

  it("Back button returns to step 1 without losing visit details", async () => {
    mockGetEventForms.mockResolvedValue([sampleForm]);
    render(<CreateVisitDialog {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /new visit/i }));
    fireEvent.click(await screen.findByText(sampleForm.name));
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    await screen.findByText("Complete the form for this visit.");
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(
      await screen.findByText("Record a new visit for this patient."),
    ).toBeDefined();
  });

  it("step 2 renders the form's field names", async () => {
    mockGetEventForms.mockResolvedValue([sampleForm]);
    render(<CreateVisitDialog {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /new visit/i }));
    fireEvent.click(await screen.findByText(sampleForm.name));
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    expect(
      await screen.findByText("Chief Complaint"),
    ).toBeDefined();
    expect(screen.getByText("Onset Date")).toBeDefined();
  });

  // ── Submit: no form ──

  it("calls createVisit with correct args and onVisitCreated when submitting without a form", async () => {
    mockCreateVisit.mockResolvedValue({ success: true, id: "new-visit-id" });
    const onVisitCreated = vi.fn();
    render(
      <CreateVisitDialog {...defaultProps} onVisitCreated={onVisitCreated} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /new visit/i }));
    await screen.findByText("Record a new visit for this patient.");
    fireEvent.click(screen.getByRole("button", { name: /^create visit$/i }));
    await waitFor(() => expect(onVisitCreated).toHaveBeenCalledOnce());
    expect(mockCreateVisit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        patientId: defaultProps.patientId,
        clinicId: defaultProps.clinicId,
        providerId: defaultProps.providerId,
      }),
    });
    expect(mockCreateEvent).not.toHaveBeenCalled();
  });

  // ── Submit: with form ──

  it("calls createVisit then createEvent with the correct visitId and formId", async () => {
    mockGetEventForms.mockResolvedValue([sampleForm]);
    mockCreateVisit.mockResolvedValue({ success: true, id: "new-visit-id" });
    mockCreateEvent.mockResolvedValue({ success: true, id: "new-event-id" });
    const onVisitCreated = vi.fn();
    render(
      <CreateVisitDialog {...defaultProps} onVisitCreated={onVisitCreated} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /new visit/i }));
    fireEvent.click(await screen.findByText(sampleForm.name));
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    await screen.findByText("Complete the form for this visit.");
    fireEvent.click(screen.getByRole("button", { name: /^create visit$/i }));
    await waitFor(() => expect(onVisitCreated).toHaveBeenCalledOnce());
    expect(mockCreateVisit).toHaveBeenCalledOnce();
    expect(mockCreateEvent).toHaveBeenCalledWith({
      data: expect.objectContaining({
        patientId: defaultProps.patientId,
        visitId: "new-visit-id",
        formId: sampleForm.id,
        eventType: sampleForm.name,
      }),
    });
  });

  it("shows success toast on a clean submit", async () => {
    mockCreateVisit.mockResolvedValue({ success: true, id: "new-visit-id" });
    render(<CreateVisitDialog {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /new visit/i }));
    await screen.findByText("Record a new visit for this patient.");
    fireEvent.click(screen.getByRole("button", { name: /^create visit$/i }));
    await waitFor(() =>
      expect(mockToast.success).toHaveBeenCalledWith("Visit created"),
    );
  });

  // ── Error handling ──

  it("shows error toast and does not call createEvent or onVisitCreated when createVisit fails", async () => {
    mockCreateVisit.mockResolvedValue({
      success: false,
      error: "DB connection error",
    });
    const onVisitCreated = vi.fn();
    render(
      <CreateVisitDialog {...defaultProps} onVisitCreated={onVisitCreated} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /new visit/i }));
    await screen.findByText("Record a new visit for this patient.");
    fireEvent.click(screen.getByRole("button", { name: /^create visit$/i }));
    await waitFor(() =>
      expect(mockToast.error).toHaveBeenCalledWith("DB connection error"),
    );
    expect(mockCreateEvent).not.toHaveBeenCalled();
    expect(onVisitCreated).not.toHaveBeenCalled();
  });

  it("still calls onVisitCreated but shows warning toast when createEvent fails", async () => {
    mockGetEventForms.mockResolvedValue([sampleForm]);
    mockCreateVisit.mockResolvedValue({ success: true, id: "new-visit-id" });
    mockCreateEvent.mockResolvedValue({
      success: false,
      error: "Event save error",
    });
    const onVisitCreated = vi.fn();
    render(
      <CreateVisitDialog {...defaultProps} onVisitCreated={onVisitCreated} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /new visit/i }));
    fireEvent.click(await screen.findByText(sampleForm.name));
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    await screen.findByText("Complete the form for this visit.");
    fireEvent.click(screen.getByRole("button", { name: /^create visit$/i }));
    await waitFor(() => expect(onVisitCreated).toHaveBeenCalledOnce());
    expect(mockToast.error).toHaveBeenCalledWith(
      expect.stringContaining("form data could not be saved"),
    );
  });

  it("shows clinic error and calls no server functions when clinicId is null", async () => {
    const onVisitCreated = vi.fn();
    render(
      <CreateVisitDialog
        {...defaultProps}
        clinicId={null}
        onVisitCreated={onVisitCreated}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /new visit/i }));
    await screen.findByText("Record a new visit for this patient.");
    fireEvent.click(screen.getByRole("button", { name: /^create visit$/i }));
    await waitFor(() =>
      expect(mockToast.error).toHaveBeenCalledWith(
        expect.stringContaining("not assigned to a clinic"),
      ),
    );
    expect(mockCreateVisit).not.toHaveBeenCalled();
    expect(onVisitCreated).not.toHaveBeenCalled();
  });
});
