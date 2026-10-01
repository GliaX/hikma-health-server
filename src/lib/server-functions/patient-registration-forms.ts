import PatientRegistrationForm from "@/models/patient-registration-form";
import { createServerFn } from "@tanstack/react-start";
import { Option } from "effect";
import { requireAuthenticatedUser } from "./guards";

export const getPatientRegistrationForm = createServerFn({
	method: "GET",
}).handler(async (): Promise<PatientRegistrationForm.EncodedT | undefined> => {
	await requireAuthenticatedUser();
	const forms = await PatientRegistrationForm.getAll();
	const form = forms[0];
	return form;
});
