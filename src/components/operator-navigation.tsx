"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
export function OperatorRefresh() {
  const router = useRouter(), [pending, startTransition] = useTransition();
  return <button disabled={pending} onClick={() => startTransition(() => router.refresh())}>{pending ? "A atualizar…" : "Atualizar dados"}</button>;
}
export function OperatorNavigation({ organizationId, owner }: { organizationId: string; owner: boolean }) {
  const pathname = usePathname(), base = `/operator/${organizationId}`;
  const links = [{ path: "", label: "Hoje" }, { path: "/bookings", label: "Reservas" }, { path: "/calendar", label: "Agenda" }, { path: "/drivers", label: "Motoristas" }, { path: "/vehicles", label: "Veículos" }, { path: "/services", label: "Serviços" }, { path: "/customers", label: "Clientes" }, { path: "/reports", label: "Relatórios" }, ...(owner ? [{ path: "/documents", label: "Documentação" }, { path: "/assistant", label: "Assistente Alana" }] : []), { path: "/settings", label: "Configurações" }, { path: "/brand", label: "Identidade da marca" }];
  return <nav className="operator-navigation" aria-label="Navegação do operador">{links.map(({ path, label }) => <Link key={path} href={`${base}${path}`} aria-current={pathname === `${base}${path}` || (path && pathname.startsWith(`${base}${path}/`)) || (path === "/bookings" && pathname.startsWith(`${base}/dispatch/`)) ? "page" : undefined}>{label}</Link>)}</nav>;
}
