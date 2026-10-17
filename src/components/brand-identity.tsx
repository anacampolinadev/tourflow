import "server-only";
import { cache, type CSSProperties } from "react";
import { readBrandIdentity, brandPalette, type BrandIdentity } from "@/modules/branding";
// React cache is request-scoped: private identities are never shared across users/tenants.
export const readPageBrand = cache(readBrandIdentity);
type ThemeStyle = CSSProperties & { "--brand-primary": string; "--brand-secondary": string; "--brand-on-primary": string; "--brand-on-secondary": string; "--brand-link": string };
export function brandStyle(brand: BrandIdentity): ThemeStyle | undefined {
  if (!brand.generated) return undefined;
  const palette = brandPalette(brand.primaryColor, brand.secondaryColor);
  return { "--brand-primary": palette.primary, "--brand-secondary": palette.secondary, "--brand-on-primary": palette.onPrimary, "--brand-on-secondary": palette.onSecondary, "--brand-link": palette.link };
}
export function BrandMark({ organizationId, brand }: { organizationId: string; brand: BrandIdentity }) {
  return <span className="brand-mark">{brand.generated && brand.hasLogo ?
    // Authenticated bytes bypass the public image optimizer and never fetch remote URLs.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/api/organizations/${organizationId}/brand/logo?v=${brand.version}`} alt={`Logótipo de ${brand.displayName}`} width={48} height={48} /> : null}<span>{brand.generated ? brand.displayName : "TourFlow"}</span></span>;
}
