import type { Metadata, Viewport } from "next";
import { BrandMark, brandStyle, readPageBrand } from "@/components/brand-identity";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AccessDenied, currentActor } from "@/modules/auth";
import { readOperatorShell } from "@/modules/operator";
import { OperatorNavigation } from "@/components/operator-navigation";
import type { ReactNode } from "react";
export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ organizationId: string }> }): Promise<Metadata> {
  try { const brand = await readPageBrand((await params).organizationId); return { title: brand.generated ? brand.displayName : "TourFlow", robots: { index: false, follow: false } }; }
  catch (error) { if (error instanceof AccessDenied) return { title: "TourFlow" }; throw error; }
}
export async function generateViewport({ params }: { params: Promise<{ organizationId: string }> }): Promise<Viewport> {
  try { const brand = await readPageBrand((await params).organizationId); return { themeColor: brand.primaryColor }; }
  catch (error) { if (error instanceof AccessDenied) return {}; throw error; }
}
export default async function OperatorLayout({ params, children }: { params: Promise<{ organizationId: string }>; children: ReactNode }) {
  if (!(await currentActor())?.active) redirect("/login");
  const { organizationId } = await params;
  const data = await readOperatorShell(organizationId).catch((error: unknown) => { if (error instanceof AccessDenied) notFound(); throw error; });
  const brand = await readPageBrand(organizationId);
  const roles = { OPERATOR_OWNER: "Responsável", OPERATOR_DISPATCHER: "Gestor de operações", OPERATOR_VIEWER: "Consulta", DRIVER: "Motorista" };
  return <div className={`operator-shell${brand.generated ? " brand-themed" : ""}`} style={brandStyle(brand)}><a className="operator-skip" href="#operator-content">Ir para o conteúdo</a>
    <header className="operator-topbar"><div><span className="operator-brand"><BrandMark organizationId={organizationId} brand={brand} /></span><span className="operator-name">{data.organization.name}</span></div><div className="operator-account"><span>{roles[data.context.role]}</span><Link href="/workspace">Mudar organização</Link></div></header>
    <aside className="operator-sidebar"><OperatorNavigation organizationId={organizationId} owner={data.context.role === "OPERATOR_OWNER"} /></aside>
    <div className="operator-content" id="operator-content" tabIndex={-1}>{children}</div>
  </div>;
}
