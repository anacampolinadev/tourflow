import Link from "next/link";
import { notFound } from "next/navigation";
import { ResourceForm } from "@/components/resource-form";
import { singularLabels } from "@/types/operator-core";
import { allowedDriverStatuses, driverLabels } from "@/modules/drivers";
import { operatorCatalogPage, resourceKind } from "../guard";
import { resourceEditor } from "../view";
import { saveResource, saveDriverStatus } from "../actions";
export default async function EditResource({ params, searchParams }: { params: Promise<{ organizationId: string; resource: string; resourceId: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { organizationId, resource, resourceId } = await params;
  const kind = resourceKind(resource);
  const catalog = await operatorCatalogPage(organizationId, kind);
  const editor = await resourceEditor(organizationId, kind, resourceId);
  if (!editor || editor.version === null) notFound();
  const options = editor.driverStatus ? allowedDriverStatuses(editor.driverStatus).map((value) => ({ value, label: driverLabels[value] })) : [];
  return <main className="operator-catalog narrow"><Link href={`/operator/${organizationId}/${kind}`}>Voltar à lista</Link><h1>Cadastro de {singularLabels[kind]}</h1><p>{catalog.organization.name}</p>{(await searchParams).saved ? <p role="status">Cadastro guardado.</p> : null}
    <ResourceForm key={editor.version} fields={editor.fields} action={saveResource.bind(null, organizationId, kind, resourceId, editor.version)} readOnly={!catalog.canManage} />
    {editor.driverStatus ? <section><h2>Estado do motorista</h2><p>Estado: <strong>{driverLabels[editor.driverStatus]}</strong></p>{catalog.canManage && options.length ? <ResourceForm key={`status-${editor.version}`} label="Alterar estado" fields={[{ name: "status", label: "Próximo estado", type: "select", value: options[0]!.value, options }]} action={saveDriverStatus.bind(null, organizationId, resourceId, editor.version)} /> : null}<p>Ativo indica apenas o estado do cadastro. A documentação e a disponibilidade serão verificadas antes de atribuir serviços nas etapas futuras.</p></section> : null}
  </main>;
}
