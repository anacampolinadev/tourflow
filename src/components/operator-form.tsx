"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/admin/operators/actions";

type Values = { name: string; responsibleName: string; contactEmail: string; contactPhone: string; plan: string; setupPaid: boolean; monthlyPriceCents: number; primaryLanguage: string };
export function OperatorForm({ action, values }: { action: (state: FormState, form: FormData) => Promise<FormState>; values?: Values }) {
  const [state, submit, pending] = useActionState(action, { error: null });
  return <form action={submit}>
    {state.error ? <p role="alert">{state.error}</p> : null}
    <label htmlFor="name">Nome do operador</label><input id="name" name="name" required maxLength={120} defaultValue={values?.name} />
    {!values ? <><label htmlFor="slug">Endereço do operador</label><input id="slug" name="slug" required minLength={3} maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="sintra-mountain" /><p>Use letras minúsculas, números e hífen. Este identificador é permanente.</p></> : null}
    <label htmlFor="responsibleName">Responsável</label><input id="responsibleName" name="responsibleName" required maxLength={120} defaultValue={values?.responsibleName} />
    <label htmlFor="contactEmail">E-mail de contacto</label><input id="contactEmail" name="contactEmail" type="email" required maxLength={254} defaultValue={values?.contactEmail} />
    <p>{values ? "Alterar o contacto não transfere o acesso do titular." : "O responsável terá acesso por e-mail a esta organização. Nenhuma mensagem é enviada ao guardar."}</p>
    <label htmlFor="contactPhone">Telefone</label><input id="contactPhone" name="contactPhone" type="tel" required minLength={6} maxLength={30} defaultValue={values?.contactPhone} />
    <label htmlFor="plan">Plano</label><select id="plan" name="plan" defaultValue={values?.plan ?? "MANAGED"}><option value="FLEET">Fleet</option><option value="MANAGED">Managed</option></select>
    <label htmlFor="monthlyPrice">Mensalidade (€)</label><input id="monthlyPrice" name="monthlyPrice" inputMode="decimal" required pattern="[0-9]{1,7}([.,][0-9]{1,2})?" defaultValue={values ? (values.monthlyPriceCents / 100).toFixed(2) : "499.00"} />
    <label className="checkbox"><input name="setupPaid" type="checkbox" defaultChecked={values?.setupPaid} /> Setup pago</label>
    <label htmlFor="primaryLanguage">Idioma principal</label><select id="primaryLanguage" name="primaryLanguage" defaultValue={values?.primaryLanguage ?? "pt"}><option value="pt">Português</option><option value="en">Inglês</option><option value="es">Espanhol</option><option value="de">Alemão</option></select>
    <button type="submit" disabled={pending}>{pending ? "A guardar…" : "Guardar operador"}</button>
  </form>;
}
