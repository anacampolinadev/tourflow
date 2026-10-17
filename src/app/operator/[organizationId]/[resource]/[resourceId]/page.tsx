import Link from "next/link";
import { notFound } from "next/navigation";
import { ResourceForm } from "@/components/resource-form";
import { singularLabels } from "@/types/operator-core";
import { allowedDriverStatuses, driverLabels, getDriver } from "@/modules/drivers";
import { operatorCatalogPage, resourceKind } from "../guard";
import { resourceEditor } from "../view";
import { saveResource, saveDriverStatus, enableDriverAccess } from "../actions";
export default async function EditResource({ params, searchParams }: { params: Promise<{ organizationId: string; resource: string; resourceId: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { organizationId, resource, resourceId } = await params;
  const kind = resourceKind(resource);
  const catalog = await operatorCatalogPage(organizationId, kind);
  const editor = await resourceEditor(organizationId, kind, resourceId);
  if (!editor || editor.version === null) notFound();
  const driver = kind === "drivers" ? await getDriver(organizationId, resourceId) : null;
  const options = editor.driverStatus ? allowedDriverStatuses(editor.driverStatus).map((value) => ({ value, label: driverLabels[value] })) : [];
  return <main className="operator-catalog narrow"><Link href={`/operator/${organizationId}/${kind}`}>Voltar à lista</Link><h1>Cadastro de {singularLabels[kind]}</h1><p>{catalog.organization.name}</p>{(await searchParams).saved ? <p role="status">Cadastro guardado.</p> : null}
    {driver ? <section><h2>Acesso do motorista</h2>{driver.userId ? <p>Conta associada. Alterar o contacto não transfere o acesso nem muda o e-mail de login. A desativação do motorista ou do vínculo bloqueia o portal.</p> : <><p>Ao ativar, autoriza uma conta de motorista para {driver.email}. O cadastro de contacto, por si só, não dá acesso. Nenhum e-mail será enviado automaticamente.</p>{catalog.context.role === "OPERATOR_OWNER" ? <ResourceForm fields={[]} label="Ativar acesso do motorista" action={enableDriverAccess.bind(null, organizationId, resourceId, editor.version)} /> : <p>Só o responsável pode ativar o acesso.</p>}</>}</section> : null}
    <ResourceForm key={editor.version} fields={editor.fields} action={saveResource.bind(null, organizationId, kind, resourceId, editor.version)} readOnly={!catalog.canManage} />
    {editor.driverStatus ? <section><h2>Estado do motorista</h2><p>Estado: <strong>{driverLabels[editor.driverStatus]}</strong></p>{catalog.canManage && options.length ? <ResourceForm key={`status-${editor.version}`} label="Alterar estado" fields={[{ name: "status", label: "Próximo estado", type: "select", value: options[0]!.value, options }]} action={saveDriverStatus.bind(null, organizationId, resourceId, editor.version)} /> : null}<p>Ativo indica apenas o estado do cadastro. A elegibilidade é verificada na distribuição de teste. A aptidão documental individual ainda não foi implementada.</p></section> : null}
  </main>;
}
