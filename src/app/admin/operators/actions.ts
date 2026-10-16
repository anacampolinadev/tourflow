"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireCurrentSuperAdmin } from "@/modules/auth";
import { createOperator, updateOperator, changeOperatorStatus, priceToCents, OperatorConflict, InvalidTransition } from "@/modules/tenants";

export type FormState = { error: string | null };

function fields(form: FormData) {
  return {
    name: form.get("name"), responsibleName: form.get("responsibleName"),
    contactEmail: form.get("contactEmail"), contactPhone: form.get("contactPhone"),
    plan: form.get("plan"), setupPaid: form.get("setupPaid") === "on",
    monthlyPriceCents: priceToCents(String(form.get("monthlyPrice") ?? "")), primaryLanguage: form.get("primaryLanguage"),
  };
}

function message(error: unknown): FormState {
  if (error instanceof ZodError) return { error: "Verifique os campos do formulário." };
  if (error instanceof OperatorConflict || error instanceof InvalidTransition) return { error: error.message };
  return { error: "Não foi possível guardar. Verifique os dados ou tente novamente." };
}

export async function saveNewOperator(_previous: FormState, form: FormData): Promise<FormState> {
  await requireCurrentSuperAdmin();
  let id: string;
  try { id = (await createOperator({ ...fields(form), slug: form.get("slug") })).id; }
  catch (error) { return message(error); }
  revalidatePath("/admin/operators");
  redirect(`/admin/operators/${id}`);
}

export async function saveOperator(id: string, version: number, _previous: FormState, form: FormData): Promise<FormState> {
  await requireCurrentSuperAdmin();
  try { await updateOperator(id, version, fields(form)); }
  catch (error) { return message(error); }
  revalidatePath("/admin/operators"); revalidatePath(`/admin/operators/${id}`);
  redirect(`/admin/operators/${id}?saved=1`);
}

export async function saveStatus(id: string, version: number, _previous: FormState, form: FormData): Promise<FormState> {
  await requireCurrentSuperAdmin();
  try { await changeOperatorStatus(id, version, form.get("status")); }
  catch (error) { return message(error); }
  revalidatePath("/admin/operators"); revalidatePath(`/admin/operators/${id}`);
  redirect(`/admin/operators/${id}?saved=1`);
}
