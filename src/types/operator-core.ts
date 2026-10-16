export const resourceKinds = ["services", "vehicles", "drivers"] as const;
export type ResourceKind = (typeof resourceKinds)[number];
export const resourceLabels = { services: "Serviços", vehicles: "Veículos", drivers: "Motoristas" };
export const singularLabels = { services: "serviço", vehicles: "veículo", drivers: "motorista" };
export type ResourceField =
  | { name: string; label: string; type: "text" | "email" | "tel" | "number" | "textarea" | "date" | "time" | "datetime-local"; value: string; required?: boolean; min?: number; max?: number; maxLength?: number; step?: string }
  | { name: string; label: string; type: "checkbox"; value: boolean }
  | { name: string; label: string; type: "languages"; value: string[] }
  | { name: string; label: string; type: "select"; value: string; options: Array<{ value: string; label: string }> };
export type ResourceFormState = { error: string | null };
