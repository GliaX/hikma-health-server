import Appointment from "@/models/appointment";
import User from "@/models/user";
import { createServerFn } from "@tanstack/react-start";
import { requireCapability } from "./guards";

/**
 * Get all appointments
 * @returns {Promise<Appointment.EncodedT[]>} - The list of appointments
 */
export const getAllAppointments = createServerFn({ method: "GET" }).handler(
	async (): Promise<Appointment.EncodedT[]> => {
		await requireCapability(User.CAPABILITIES.READ_ALL_PATIENT);
		const res = await Appointment.API.getAll();
		return res;
	},
);

/**
 * Get an appointment by ID
 * @param {string} id - The ID of the appointment
 * @returns {Promise<Appointment.EncodedT | null>} - The appointment or null if not found
 */
export const getAppointmentById = createServerFn({ method: "GET" })
	.inputValidator((data: { id: string }) => data)
	.handler(async ({ data }): Promise<Appointment.EncodedT | null> => {
		await requireCapability(User.CAPABILITIES.READ_ALL_PATIENT);
		const res = await Appointment.API.getById(data.id);

		return res;
	});

/**
 * Get all a patient's appointments
 * @param {string} patientId - the ID of the patient
 * @returns {Promise<Appointment.EncodedT[]>} - the list of appointments for the patient, sorted by date from earliest to latest
 */
export const getAppointmentsByPatientId = createServerFn({ method: "GET" })
	.inputValidator((data: { patientId: string }) => data)
	.handler(
		async ({
			data,
		}): Promise<
			WithError<{
				data: {
					appointment: Appointment.EncodedT;
					patient: Patient.EncodedT;
					clinic: Clinic.EncodedT;
					provider: User.EncodedT | null;
				}[];
			}>
		> => {
			await requireCapability(User.CAPABILITIES.READ_ALL_PATIENT);
			try {
				const res = await Appointment.API.getByPatientId(data.patientId);
				return {
					data: res || [],
					error: null,
				};
			} catch (error) {
				return {
					data: [],
					error: error as Error,
				};
			}
		},
	);

/**
 * Get all appointments with their patients, clinics, and providers information
 * @returns {Promise<{appointment: Appointment.EncodedT, patient: Patient.EncodedT, clinic: Clinic.EncodedT, provider: User.EncodedT | null}[]>} - The list of appointments with their patients, clinics, and providers information
 */
export const getAllAppointmentsWithDetails = createServerFn({
	method: "GET",
}).handler(
	async (): Promise<
		{
			appointment: Appointment.EncodedT;
			patient: Patient.EncodedT;
			clinic: Clinic.EncodedT;
			provider: User.EncodedT | null;
		}[]
	> => {
		await requireCapability(User.CAPABILITIES.READ_ALL_PATIENT);
		const res = await Appointment.API.getAllWithDetails();
		return res;
	},
);

/**
 * Toggle the status of an appointment
 * @param {string} id - The ID of the appointment
 * @param {string} status - The new status of the appointment
 * @returns {Promise<void>}
 */
export const toggleAppointmentStatus = createServerFn({ method: "POST" })
	.inputValidator((data: { id: string; status: string }) => data)
	.handler(async ({ data }): Promise<void> => {
		await requireCapability(User.CAPABILITIES.UPDATE_PATIENT);
		await Appointment.API.toggleStatus(data.id, data.status);
	});
