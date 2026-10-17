import { z } from "zod";

export class BrandError extends Error {
  constructor(message: string) { super(message); this.name = "BrandError"; }
}
export const brandInput = z.object({ displayName: z.string().trim().min(2).max(80).refine(value => [...value].length >= 2 && [...value].every(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127)), primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).transform(value => value.toLowerCase()), secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).transform(value => value.toLowerCase()) }).strict();
export const MAX_LOGO_BYTES = 256 * 1024;
export type BrandIdentity = z.infer<typeof brandInput> & { generated: boolean; version: number | null; hasLogo: boolean };
export function contrast(a: string, b: string) {
  const luminance = (hex: string) => [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index]!, 0);
  const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function brandPalette(primary: string, secondary: string) {
  const foreground = (background: string) => contrast(background, "#ffffff") >= contrast(background, "#000000") ? "#ffffff" : "#000000";
  return { primary, secondary, onPrimary: foreground(primary), onSecondary: foreground(secondary), link: contrast(primary, "#ffffff") >= 4.5 ? primary : "#172b3c" };
}
