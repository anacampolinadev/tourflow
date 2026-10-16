import Link from "next/link";
import { notFound } from "next/navigation";
import { ResourceForm } from "@/components/resource-form";
import { singularLabels } from "@/types/operator-core";
import { operatorCatalogPage, resourceKind } from "../guard";
import { resourceEditor } from "../view";
import { saveResource } from "../actions";
export default async function NewResource({ params }: { params: Promise<{ organizationId: string; resource: string }> }) {
  const { organizationId, resource } = await params;
  const kind = resourceKind(resource);
  const catalog = await operatorCatalogPage(organizationId, kind);
  if (!catalog.canManage) notFound();
  const editor = await resourceEditor(organizationId, kind);
  if (!editor) notFound();
  return <main className="operator-catalog narrow"><Link href={`/operator/${organizationId}/${kind}`}>Voltar à lista</Link><h1>Adicionar {singularLabels[kind]}</h1><p>{catalog.organization.name}</p>{kind === "drivers" ? <p>O cadastro começa pendente. Não cria uma conta nem envia convite ao motorista.</p> : <p>O cadastro começa inativo. Ativá-lo não confirma disponibilidade nem publica o operador.</p>}<ResourceForm fields={editor.fields} action={saveResource.bind(null, organizationId, kind, null, null)} /></main>;
}
