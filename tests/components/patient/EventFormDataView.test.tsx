import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { EventFormDataView } from "@/components/patient/EventFormDataView";

describe("EventFormDataView", () => {
  it("preserves line breaks for long free-text fields", () => {
    const { container } = render(
      <EventFormDataView
        formData={[
          {
            fieldId: "f1",
            name: "Notes",
            fieldType: "free-text",
            inputType: "text",
            length: "long",
            value: "line one\nline two\nline three",
          },
        ]}
      />,
    );
    const span = container.querySelector("span.whitespace-pre-wrap");
    expect(span).not.toBeNull();
    expect(span?.textContent).toBe("line one\nline two\nline three");
  });

  it("preserves line breaks for legacy textarea entries", () => {
    const { container } = render(
      <EventFormDataView
        formData={[
          {
            fieldId: "f1",
            name: "History",
            fieldType: "free-text",
            inputType: "textarea",
            value: "a\nb",
          },
        ]}
      />,
    );
    expect(container.querySelector("span.whitespace-pre-wrap")).not.toBeNull();
  });

  it("respects newlines in legacy entries saved without length config", () => {
    const { container } = render(
      <EventFormDataView
        formData={[
          {
            fieldId: "f1",
            name: "Notes",
            fieldType: "free-text",
            inputType: "text",
            value: "first\nsecond",
          },
        ]}
      />,
    );
    const span = container.querySelector("span.whitespace-pre-wrap");
    expect(span?.textContent).toBe("first\nsecond");
  });

  it("joins multi-select values for short text fields as before", () => {
    const { container } = render(
      <EventFormDataView
        formData={[
          {
            fieldId: "f1",
            name: "Symptoms",
            fieldType: "free-text",
            inputType: "text",
            value: "fever; cough",
          },
        ]}
      />,
    );
    const span = container.querySelector("span.whitespace-pre-wrap");
    expect(span).toBeNull();
    expect(container.textContent).toContain("fever, cough");
  });
});
