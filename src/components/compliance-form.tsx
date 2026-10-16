"use client";
import { useActionState, type ReactNode } from "react";
export type ComplianceFormState = { error: string | null; saved: boolean };
export function ComplianceForm({ action, label, children, disabled = false }: { action: (state: ComplianceFormState, form: FormData) => Promise<ComplianceFormState>; label: string; children?: ReactNode; disabled?: boolean }) {
  const [state, submit, pending] = useActionState(action, { error: null, saved: false });
  return <form action={submit}>
    {state.error ? <p role="alert">{state.error}</p> : null}
    {state.saved ? <p role="status">Alteração guardada.</p> : null}
    {children}
    <button type="submit" disabled={pending || disabled}>{pending ? "A guardar…" : label}</button>
  </form>;
}
