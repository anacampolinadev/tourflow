import Link from "next/link";
import { ComplianceForm } from "./compliance-form";
import { complianceAction } from "@/app/compliance/actions";
import { documentLabels, isDocumentValid, type ComplianceScope, type readCompliance } from "@/modules/compliance";
import { statusLabels } from "@/modules/tenants";

type Overview = NonNullable<Awaited<ReturnType<typeof readCompliance>>>;
export function CompliancePanel({ data, scope }: { data: Overview; scope: ComplianceScope }) {
  const { organization, profile, requirements } = data;
  const admin = scope === "admin";
  const action = (command: Parameters<typeof complianceAction>[2], target = "") => complianceAction.bind(null, organization.id, profile.version, command, target);
  return <>
    <h1>Documentos de {organization.name}</h1>
    <p>Estado: <strong>{statusLabels[profile.status]}</strong></p>
    {profile.complianceNote ? <p role="alert">Correção solicitada: {profile.complianceNote}</p> : null}
    <p>Os ficheiros são privados. Aceitamos PDF, PNG e JPEG até 2 MB; o arquivo por operador admite até 50 versões e 25 MB. As validades incluem a data indicada, em UTC.</p>
    {!requirements.length ? <p>A lista de documentos ainda não foi definida pelo Admin.</p> : null}
    {requirements.map((requirement) => <section className="document-card" key={requirement.id} aria-labelledby={`title-${requirement.id}`}>
      <h2 id={`title-${requirement.id}`}>{requirement.title}</h2>
      <p>{requirement.document ? documentLabels[isDocumentValid(requirement) ? requirement.document.status : "EXPIRED"] : "Por enviar"}{requirement.requiresExpiry ? " · Validade obrigatória" : ""}</p>
      {requirement.document?.review?.note ? <p>Observação da revisão: {requirement.document.review.note}</p> : null}
      {requirement.history.length ? <details><summary>Histórico de versões ({requirement.history.length})</summary><ul>{requirement.history.map((document) => <li key={document.id}>
        <Link prefetch={false} href={`/api/organizations/${organization.id}/documents/${document.id}${admin ? "?scope=admin" : ""}`}>Descarregar versão {document.revision}: {document.fileName}</Link>
        {" · "}{documentLabels[document.status]}{document.expiresOn ? ` · Válido até ${document.expiresOn.toISOString().slice(0, 10)}` : ""}
        {document.review?.note ? <p>Observação: {document.review.note}</p> : null}
      </li>)}</ul></details> : null}
      {!admin && profile.status === "DOCS_PENDING" ? <ComplianceForm key={`upload-${profile.version}`} action={action("upload", requirement.id)} label="Guardar documento">
        <label htmlFor={`file-${requirement.id}`}>Ficheiro para {requirement.title}</label><input id={`file-${requirement.id}`} name="file" type="file" accept=".pdf,.png,.jpg,.jpeg" required />
        <label htmlFor={`expiry-${requirement.id}`}>Válido até{requirement.requiresExpiry ? " (obrigatório)" : " (opcional)"}</label><input id={`expiry-${requirement.id}`} name="expiresOn" type="date" required={requirement.requiresExpiry} />
      </ComplianceForm> : null}
      {admin && profile.status === "DOCS_PENDING" ? <ComplianceForm key={`deactivate-${profile.version}`} action={action("deactivate", requirement.id)} label="Desativar requisito" /> : null}
      {admin && profile.status === "UNDER_REVIEW" && requirement.document?.status === "UNDER_REVIEW" ? <ComplianceForm key={`review-${profile.version}`} action={action("review", requirement.document.id)} label="Guardar revisão">
        <label htmlFor={`decision-${requirement.id}`}>Decisão para {requirement.title}</label><select id={`decision-${requirement.id}`} name="decision"><option value="APPROVED">Aprovar documento</option><option value="REJECTED">Pedir substituição</option></select>
        <label htmlFor={`note-${requirement.id}`}>Motivo da substituição (obrigatório ao rejeitar)</label><textarea id={`note-${requirement.id}`} name="note" maxLength={1000} />
      </ComplianceForm> : null}
    </section>)}
    {admin && ["ONBOARDING", "DOCS_PENDING"].includes(profile.status) ? <section className="document-card"><h2>Definir requisito</h2><p>A lista é definida individualmente pelo Admin. Todos os requisitos ativos são obrigatórios. Máximo de 12, incluindo os desativados.</p>
      <ComplianceForm key={`add-${profile.version}`} action={action("add")} label="Adicionar requisito">
        <label htmlFor="requirement-title">Nome do documento exigido</label><input id="requirement-title" name="title" minLength={3} maxLength={120} required />
        <label className="checkbox"><input name="requiresExpiry" type="checkbox" />Exigir data de validade</label>
      </ComplianceForm></section> : null}
    {!admin && profile.status === "DOCS_PENDING" ? <section><h2>Enviar para análise</h2><p>Confirme que enviou todos os documentos pedidos e que os dados estão corretos.</p><ComplianceForm key={`submit-${profile.version}`} action={action("submit")} label="Enviar documentação para análise" disabled={!data.canSubmit} /></section> : null}
    {admin && profile.status === "UNDER_REVIEW" ? <section><h2>Aprovação final</h2><p>Confirme a revisão de todos os documentos e a identidade do operador antes de aprovar.</p><ComplianceForm key={`approve-${profile.version}`} action={action("approve")} label="Aprovar documentação do operador" disabled={!data.canApprove} /></section> : null}
    {admin && ["UNDER_REVIEW", "APPROVED"].includes(profile.status) ? <section><h2>Solicitar correções ou reabrir</h2><ComplianceForm key={`correct-${profile.version}`} action={action("correct")} label="Reabrir documentação"><label htmlFor="correction-note">Correção necessária</label><textarea id="correction-note" name="note" minLength={5} maxLength={1000} required /></ComplianceForm></section> : null}
    {profile.status === "APPROVED" ? <p role={data.canGenerate ? "status" : "alert"}>{data.canGenerate ? "Documentação aprovada e válida. A geração do ambiente será implementada numa etapa futura." : "A aprovação está registada, mas há documentos em falta ou expirados. A geração do ambiente está bloqueada; contacte o Admin para reabrir a documentação."}</p> : null}
  </>;
}
