"use client";
import { useActionState, useState } from "react";
import type { ResourceFormState } from "@/types/operator-core";
export function BrandForm({ initial, action }: { initial: { displayName: string; primaryColor: string; secondaryColor: string }; action: (state: ResourceFormState, form: FormData) => Promise<ResourceFormState> }) {
  const [values, setValues] = useState(initial), [state, submit, pending] = useActionState(action, { error: null });
  return <form action={submit}>
    {state.error ? <p role="alert">{state.error} Se enviou um ficheiro, selecione-o novamente.</p> : null}
    <fieldset disabled={pending} className="resource-fields"><legend className="sr-only">Identidade da marca</legend>
      <label htmlFor="brand-name">Nome de apresentação</label><input id="brand-name" name="displayName" required minLength={2} maxLength={80} value={values.displayName} onChange={event => setValues({ ...values, displayName: event.target.value })} />
      <label htmlFor="brand-primary">Cor principal</label><input id="brand-primary" name="primaryColor" required pattern="#[0-9a-fA-F]{6}" maxLength={7} value={values.primaryColor} onChange={event => setValues({ ...values, primaryColor: event.target.value })} aria-describedby="brand-colours-help" />
      <label htmlFor="brand-secondary">Cor secundária</label><input id="brand-secondary" name="secondaryColor" required pattern="#[0-9a-fA-F]{6}" maxLength={7} value={values.secondaryColor} onChange={event => setValues({ ...values, secondaryColor: event.target.value })} aria-describedby="brand-colours-help" />
      <p id="brand-colours-help">Use o formato #123456. O texto e os links recebem contraste legível automaticamente.</p>
      <label htmlFor="brand-logo">Logótipo PNG (opcional)</label><input id="brand-logo" name="logo" type="file" accept="image/png" /><p>PNG estático até 256 KiB, entre 16 e 1024 píxeis por lado. Não enviar um ficheiro mantém o logótipo atual.</p>
      <label className="checkbox"><input name="removeLogo" type="checkbox" />Remover o logótipo atual</label>
    </fieldset><button disabled={pending}>{pending ? "A guardar…" : "Guardar identidade"}</button>
  </form>;
}
