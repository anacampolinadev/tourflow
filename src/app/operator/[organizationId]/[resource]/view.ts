import "server-only";
import { listServices, getService, pricingTypes, pricingLabels } from "@/modules/services";
import { listVehicles, getVehicle, vehicleTypes, vehicleLabels } from "@/modules/vehicles";
import { listDrivers, getDriver, driverLabels } from "@/modules/drivers";
import type { ResourceKind, ResourceField } from "@/types/operator-core";
import type { DriverStatus } from "@/modules/drivers";
export async function listResources(organizationId: string, kind: ResourceKind, query: unknown) {
  switch (kind) {
    case "services": { const result = await listServices(organizationId, query); return { ...result, items: result.items.map((item) => ({ id: item.id, name: item.name, detail: `${(item.basePriceCents / 100).toFixed(2)} EUR · ${pricingLabels[item.pricingType]} · ${item.durationMinutes} min · ${item.capacity} passageiros`, status: item.active ? "Ativo" : "Inativo" })) }; }
    case "vehicles": { const result = await listVehicles(organizationId, query); return { ...result, items: result.items.map((item) => ({ id: item.id, name: item.name, detail: `${item.registration} · ${vehicleLabels[item.type]} · ${item.capacity} passageiros`, status: item.active ? "Ativo" : "Inativo" })) }; }
    case "drivers": { const result = await listDrivers(organizationId, query); return { ...result, items: result.items.map((item) => ({ id: item.id, name: item.name, detail: item.languages.map((language) => language.toUpperCase()).join(", "), status: driverLabels[item.status] })) }; }
  }
}
type Editor = { id: string | null; version: number | null; fields: ResourceField[]; driverStatus?: DriverStatus };
export async function resourceEditor(organizationId: string, kind: ResourceKind, id?: string): Promise<Editor | null> {
  switch (kind) {
    case "services": {
      const item = id ? await getService(organizationId, id) : null;
      if (id && !item) return null;
      return { id: item?.id ?? null, version: item?.version ?? null, fields: [
        { name: "name", label: "Nome do serviço", type: "text", value: item?.name ?? "", required: true, maxLength: 120 },
        { name: "description", label: "Descrição", type: "textarea", value: item?.description ?? "", maxLength: 2000 },
        { name: "durationMinutes", label: "Duração em minutos", type: "number", value: String(item?.durationMinutes ?? 120), min: 1, max: 1440, required: true },
        { name: "pricingType", label: "Tipo de preço", type: "select", value: item?.pricingType ?? "PER_PERSON", options: pricingTypes.map((value) => ({ value, label: pricingLabels[value] })) },
        { name: "basePrice", label: "Preço base em EUR", type: "text", value: item ? (item.basePriceCents / 100).toFixed(2) : "", required: true, maxLength: 11 },
        { name: "capacity", label: "Capacidade de passageiros", type: "number", value: String(item?.capacity ?? 6), min: 1, max: 100, required: true },
        { name: "meetingPoint", label: "Ponto de encontro", type: "text", value: item?.meetingPoint ?? "", required: true, maxLength: 300 },
        { name: "pickupAvailable", label: "Permitir recolha de passageiros", type: "checkbox", value: item?.pickupAvailable ?? false },
        { name: "pickupRules", label: "Regras de recolha (obrigatórias se permitir recolha)", type: "textarea", value: item?.pickupRules ?? "", maxLength: 1000 },
        { name: "languages", label: "Idiomas do serviço", type: "languages", value: item?.languages ?? ["pt"] },
        { name: "active", label: "Cadastro ativo", type: "checkbox", value: item?.active ?? false },
      ] };
    }
    case "vehicles": {
      const item = id ? await getVehicle(organizationId, id) : null;
      if (id && !item) return null;
      return { id: item?.id ?? null, version: item?.version ?? null, fields: [
        { name: "name", label: "Nome do veículo", type: "text", value: item?.name ?? "", required: true, maxLength: 120 },
        { name: "type", label: "Tipo de veículo", type: "select", value: item?.type ?? "JEEP", options: vehicleTypes.map((value) => ({ value, label: vehicleLabels[value] })) },
        { name: "registration", label: "Matrícula", type: "text", value: item?.registration ?? "", required: true, maxLength: 20 },
        { name: "capacity", label: "Capacidade de passageiros (sem motorista)", type: "number", value: String(item?.capacity ?? 6), min: 1, max: 100, required: true },
        { name: "features", label: "Características (até 10, separadas por vírgulas)", type: "text", value: item?.features.join(", ") ?? "", maxLength: 610 },
        { name: "active", label: "Cadastro ativo", type: "checkbox", value: item?.active ?? false },
      ] };
    }
    case "drivers": {
      const item = id ? await getDriver(organizationId, id) : null;
      if (id && !item) return null;
      return { id: item?.id ?? null, version: item?.version ?? null, driverStatus: item?.status, fields: [
        { name: "name", label: "Nome do motorista", type: "text", value: item?.name ?? "", required: true, maxLength: 120 },
        { name: "phone", label: "Telefone", type: "tel", value: item?.phone ?? "", required: true, maxLength: 30 },
        { name: "email", label: "E-mail do motorista", type: "email", value: item?.email ?? "", required: true, maxLength: 254 },
        { name: "languages", label: "Idiomas do motorista", type: "languages", value: item?.languages ?? ["pt"] },
      ] };
    }
  }
}
