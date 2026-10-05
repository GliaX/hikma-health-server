import {
	PrescriptionForm,
	type PrescriptionFormValues,
	type PrescriptionItemValues,
} from "@/components/prescription-form";
import { Button } from "@/components/ui/button";
import db from "@/db";
import { Result } from "@/lib/result";
import { getCurrentUser } from "@/lib/server-functions/auth";
import { getAllClinics } from "@/lib/server-functions/clinics";
import { getAllUsers } from "@/lib/server-functions/users";
import { isValidUUID } from "@/lib/utils";
import type Clinic from "@/models/clinic";
import Prescription from "@/models/prescription";
import type User from "@/models/user";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

// Create a save prescription server function
const savePrescription = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			prescription: PrescriptionFormValues;
			items: PrescriptionItemValues[];
			id: string | null;
			currentUserName: string;
			currentClinicId: string;
		}) => data,
	)
	.handler(async ({ data }) => {
		const { prescription, items, id, currentUserName, currentClinicId } = data;

		const prescriptionId = isValidUUID(id || "") ? id : null;

		return Prescription.API.save(
			prescriptionId,
			prescription,
			items,
			currentUserName,
			currentClinicId,
		);
	});

// Get prescription by ID server function
const getPrescriptionById = createServerFn({ method: "POST" })
	.inputValidator((data: { id: string }) => data)
	.handler(async ({ data }) => {
		const { id } = data;
		const res = await db
			.selectFrom(Prescription.Table.name)
			.where("id", "=", id)
			.where("is_deleted", "=", false)
			.selectAll()
			.executeTakeFirst();

		return res as unknown as Prescription.EncodedT | null;
	});

export const Route = createFileRoute("/app/prescriptions/edit/$")({
	component: RouteComponent,
	loader: async ({ params }) => {
		const prescriptionId = params["_splat"];
		const result: {
			prescription: Prescription.EncodedT | null;
			users: User.EncodedT[];
			clinics: Clinic.EncodedT[];
			currentUser: User.EncodedT | null;
		} = { prescription: null, users: [], clinics: [], currentUser: null };

		if (prescriptionId && prescriptionId !== "new") {
			result.prescription = (await getPrescriptionById({
				data: { id: prescriptionId },
			})) as Prescription.EncodedT | null;
		}

		result.users = (await getAllUsers()) as User.EncodedT[];
		result.clinics = Result.getOrElse(
			await getAllClinics(),
			[],
		) as Clinic.EncodedT[];
		result.currentUser = (await getCurrentUser()) as User.EncodedT | null;

		return result;
	},
});

function RouteComponent() {
	const {
		prescription,
		users: providers,
		clinics,
		currentUser,
	} = Route.useLoaderData();
	const navigate = Route.useNavigate();
	const params = Route.useParams();
	const prescriptionId = params._splat;
	const isEditing = isValidUUID(prescriptionId || "");

	// Handle form submission
	const onSubmit = async (
		prescription: PrescriptionFormValues,
		items: PrescriptionItemValues[],
	) => {
		try {
			await savePrescription({
				data: {
					prescription,
					items,
					id: prescriptionId || null,
					currentUserName: currentUser?.name || "Unknown",
					currentClinicId: currentUser?.clinic_id || "Unknown",
				},
			});

			toast.success(
				`Prescription ${isEditing ? "updated" : "created"} successfully`,
			);

			navigate({ to: "/app/prescriptions" });
		} catch (error) {
			console.error(error);
			toast.error(`Failed to ${isEditing ? "update" : "create"} prescription`);
		}
	};

	return (
		<div className="container py-6">
			<h1 className="text-2xl font-bold mb-6">
				{isEditing ? "Edit" : "Create"} Prescription
			</h1>

			<div className="grid grid-cols-1 gap-6 max-w-2xl">
				<div className="p-6">
					<PrescriptionForm
						onSubmit={(prescription, prescriptionItems) =>
							onSubmit(prescription, prescriptionItems)
						}
						providers={providers}
						clinics={clinics.map((cl) => ({ id: cl.id, name: cl.name }))}
					/>
					<div className="flex justify-end gap-4 mt-4">
						<Button
							type="button"
							variant="outline"
							onClick={() => navigate({ to: "/app/prescriptions" })}
						>
							Cancel
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}
