"use client";
import { useActionState } from "react";
import type { FormState } from "@/app/admin/operators/actions";
import { useHydrated } from "./use-hydrated";

export function StatusForm({ action, options }: { action: (state: FormState, form: FormData) => Promise<FormState>; options: Array<{ value: string; label: string }> }) {
  const [state, submit, pending] = useActionState(action, { error: null });
  const hydrated = useHydrated();
  return <form action={submit}>
    {state.error ? <p role="alert">{state.error}</p> : null}
    <fieldset disabled={!hydrated || pending}>
    <label htmlFor="nextStatus">Próximo estado</label><select id="nextStatus" name="status" required>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
    <button type="submit" disabled={pending}>{pending ? "A atualizar…" : "Alterar estado"}</button>
    </fieldset>
  </form>;
}
