import { z } from "zod";

export class DispatchError extends Error {
  constructor(message: string) { super(message); this.name = "DispatchError"; }
}
export const dispatchInput = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("AUTO"), expectedVersion: z.number().int().min(0), idempotencyKey: z.string().uuid() }).strict(),
  z.object({ mode: z.literal("MANUAL"), expectedVersion: z.number().int().min(0), idempotencyKey: z.string().uuid(), driverId: z.string().min(1).max(100), vehicleId: z.string().min(1).max(100), reason: z.string().trim().min(5).max(500) }).strict(),
]);
export function assertDispatchable(status: string) {
  if (status !== "CONFIRMED" && status !== "ASSIGNED" && status !== "DRIVER_DECLINED") throw new DispatchError("Esta reserva não permite distribuição.");
}
export const weights = { availability: 25, proximity: 20, fairness: 20, vehicleFit: 15, rating: 10, language: 5, acceptance: 5 } as const;
export type DriverCandidate = { id: string; assignments: number };
export type VehicleCandidate = { id: string; capacity: number };
export function scoreCandidate(driver: DriverCandidate, vehicle: VehicleCandidate, passengers: number, hasLanguage: boolean) {
  if (!Number.isInteger(driver.assignments) || driver.assignments < 0 || !Number.isInteger(passengers) || passengers < 1 || vehicle.capacity < passengers) throw new DispatchError("Candidato inválido.");
  const factors = { availability: 10000, proximity: 5000, fairness: Math.round(10000 / (1 + driver.assignments)), vehicleFit: Math.round(passengers * 10000 / vehicle.capacity), rating: 5000, language: hasLanguage ? 10000 : 5000, acceptance: 5000 };
  const score = Math.round((Object.keys(weights) as Array<keyof typeof weights>).reduce((sum, key) => sum + factors[key] * weights[key], 0) / 100);
  return { driverId: driver.id, vehicleId: vehicle.id, assignments: driver.assignments, capacity: vehicle.capacity, factors, score };
}
// Additive independent factors: each driver's best pair uses the smallest eligible vehicle.
// This avoids a Cartesian product while preserving the highest-scoring pair.
export function rankCandidates(drivers: DriverCandidate[], vehicles: VehicleCandidate[], passengers: number, hasLanguage: boolean) {
  const bestVehicle = [...vehicles].sort((a, b) => a.capacity - b.capacity || a.id.localeCompare(b.id, "en"))[0];
  if (!bestVehicle) return [];
  return drivers.map((driver) => scoreCandidate(driver, bestVehicle, passengers, hasLanguage)).sort((a, b) => b.score - a.score || a.assignments - b.assignments || a.driverId.localeCompare(b.driverId, "en") || a.vehicleId.localeCompare(b.vehicleId, "en"));
}
