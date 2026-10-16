"use client";
import { useActionState, useId } from "react";
import { supportedLanguages, languageLabels } from "@/types/languages";
import type { ResourceField, ResourceFormState } from "@/types/operator-core";
type FormState = ResourceFormState & { attempt: number; values?: Record<string, string[]> };
export function ResourceForm({ fields, action, readOnly = false, label = "Guardar cadastro", preserveOnError = false }: { fields: ResourceField[]; action: (state: ResourceFormState, form: FormData) => Promise<ResourceFormState>; readOnly?: boolean; label?: string; preserveOnError?: boolean }) {
  const [state, submit, pending] = useActionState(async (previous: FormState, form: FormData): Promise<FormState> => {
    const result = await action({ error: previous.error }, form);
    return { ...result, attempt: previous.attempt + 1, ...(preserveOnError && result.error ? { values: Object.fromEntries(fields.map((field) => [field.name, form.getAll(field.name).filter((value): value is string => typeof value === "string")])) } : {}) };
  }, { error: null, attempt: 0 });
  const displayedFields = fields.map((field): ResourceField => {
    const values = state.values?.[field.name];
    if (!values) return field;
    if (field.type === "checkbox") return { ...field, value: values.includes("on") };
    if (field.type === "languages") return { ...field, value: values };
    return { ...field, value: values[0] ?? "" };
  });
  const formId = useId();
  return <form action={submit}>
    {state.error ? <p role="alert">{state.error}</p> : null}
    {readOnly ? <p>Modo de leitura. Não pode alterar este cadastro.</p> : null}
    {/* Recreate uncontrolled defaults after an error, including select options, before React resets the form. */}
    <fieldset key={preserveOnError ? state.attempt : 0} disabled={pending || readOnly} className="resource-fields"><legend className="sr-only">Dados do cadastro</legend>
      {displayedFields.map((field) => {
        const id = `${formId}-${field.name}`;
        if (field.type === "checkbox") return <label key={field.name} className="checkbox"><input id={id} name={field.name} type="checkbox" defaultChecked={field.value} />{field.label}</label>;
        if (field.type === "languages") return <fieldset key={field.name} className="language-fields"><legend>{field.label}</legend>{supportedLanguages.map((language) => <label key={language} className="checkbox"><input name={field.name} type="checkbox" value={language} defaultChecked={field.value.includes(language)} />{languageLabels[language]}</label>)}</fieldset>;
        if (field.type === "select") return <div key={field.name}><label htmlFor={id}>{field.label}</label><select id={id} name={field.name} defaultValue={field.value}>{field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>;
        return <div key={field.name}><label htmlFor={id}>{field.label}</label>{field.type === "textarea" ? <textarea id={id} name={field.name} defaultValue={field.value} required={field.required} maxLength={field.maxLength} /> : <input id={id} name={field.name} type={field.type} defaultValue={field.value} required={field.required} min={field.min} max={field.max} maxLength={field.maxLength} step={field.step} />}</div>;
      })}
    </fieldset>
    {!readOnly ? <button disabled={pending} type="submit">{pending ? "A guardar…" : label}</button> : null}
  </form>;
}
