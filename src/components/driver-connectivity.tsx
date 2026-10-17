"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function DriverConnectivity() {
  const [online, setOnline] = useState(true), [pending, startTransition] = useTransition();
  const router = useRouter();
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update(); window.addEventListener("online", update); window.addEventListener("offline", update);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/driver/sw.js", { scope: "/driver/", updateViaCache: "none" }).catch(() => { /* Installation is optional; online actions remain available. */ });
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  return <div className="driver-connectivity"><p role="status">{online ? "Ligação disponível. As ações são confirmadas pelo servidor." : "Sem ligação. Nenhuma ação será guardada offline. Volte a ligar e atualize antes de agir."}</p><button disabled={!online || pending} onClick={() => startTransition(() => router.refresh())}>{pending ? "A atualizar…" : "Atualizar serviços"}</button></div>;
}
