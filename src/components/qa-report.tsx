import Link from "next/link";
import { readOperatorQa, qaCases, manualScenarios } from "@/modules/qa";
import { ResourceForm } from "./resource-form";
import { manualQaAction } from "@/app/admin/operators/[organizationId]/qa/actions";
type Data = NonNullable<Awaited<ReturnType<typeof readOperatorQa>>>;
export function QaReport({ data, organizationId, admin, showAll }: { data: Data; organizationId: string; admin: boolean; showAll: boolean }) {
  const base = admin ? `/admin/operators/${organizationId}/qa` : `/operator/${organizationId}/qa`, run = data.run;
  const labels = { PASS: "Passou", FAIL: "Falhou", BLOCKED: "Por validar" };
  return <><p className="sandbox-note">Produção bloqueada. Esta bateria verifica configuração e ferramentas reais do servidor. Conversas de IA e os cinco cenários humanos continuam por validar; nenhum resultado publica o operador.</p>
    {!run ? <p>Ainda não há relatório. O responsável pode executar a bateria após aprovação documental.</p> : <>
      <section aria-label="Resultado da bateria"><h2>{run.passed}/{run.total} verificações internas passaram</h2><p>{run.failed} falhas · {run.blocked} verificações internas por executar</p>
        <p>{run.stale ? <strong role="alert">Relatório desatualizado. Execute novamente antes de o usar na revisão.</strong> : run.internalReady ? "Ferramentas prontas para a próxima revisão; conversação ainda não avaliada." : "Corrija as falhas e repita a bateria."}</p>
        <p>Resultados da execução de {run.createdAt.toISOString()}. Validade máxima de 24 horas, enquanto a configuração e a documentação se mantiverem válidas.</p>
        <p>Probes temporários revertidos: não ficam reservas, clientes, ocupações ou pedidos humanos fictícios na operação.</p>
        <p>A amostra operacional usa o primeiro serviço ativo por referência e procura uma saída nos próximos 30 dias, até 32 consultas. Não substitui a revisão de todos os serviços pelo cliente.</p>
      </section>
      <p><Link href={`${base}?run=${run.id}${showAll ? "" : "&view=all"}`}>{showAll ? "Mostrar só falhas e pendências" : "Mostrar todas as verificações"}</Link></p>
      <section aria-label="Verificações de qualidade"><h2>{showAll ? "Todas as verificações" : "Falhas e pendências"}</h2><ul className="qa-checks">{run.checks.filter(item => showAll || item.status !== "PASS").map(item => <li key={item.key}><strong>{qaCases[item.key]}</strong><p>{labels[item.status]} · {item.detail}</p></li>)}</ul></section>
      <section aria-label="Revisão humana"><h2>Cinco cenários humanos</h2><p>A aplicação ainda não integra conversas reais de IA. A administração pode registar falhas e impedimentos; aprovação de conversação, validação do cliente e GO LIVE permanecem bloqueados.</p>
        {Object.entries(manualScenarios).map(([scenario, title]) => {
          const latest = run.reviews.find(review => review.scenario === scenario);
          return <article key={scenario} className="qa-manual"><h3>{title}</h3><p>{latest ? `${latest.decision === "FAIL" ? "Falha registada" : "Impedimento registado"} · revisão ${latest.revision}` : "Sem revisão registada"}</p>{latest ? <p>{latest.note}</p> : null}
            {admin && !run.stale && (latest?.revision ?? 0) < 10 ? <ResourceForm fields={[{ name: "decision", label: "Resultado da revisão", type: "select", value: latest?.decision ?? "BLOCKED", options: [{ value: "BLOCKED", label: "Impedido / por validar" }, { value: "FAIL", label: "Falhou" }] }, { name: "note", label: "Evidência ou impedimento (20–1000 caracteres, sem dados de turistas)", type: "textarea", value: "", required: true, maxLength: 1000 }]} preserveOnError label="Guardar revisão humana" action={manualQaAction.bind(null, organizationId, run.id, scenario, latest?.revision ?? 0)} /> : null}
            {run.reviews.some(review => review.scenario === scenario && review.id !== latest?.id) ? <details><summary>Revisões anteriores</summary>{run.reviews.filter(review => review.scenario === scenario && review.id !== latest?.id).map(review => <p key={review.id}>Revisão {review.revision}: {review.note}</p>)}</details> : null}
          </article>;
        })}
      </section>
    </>}
    <nav aria-label="Relatórios de qualidade"><h2>Histórico de baterias</h2><p>Últimas 10 execuções; até 100 relatórios por operador.</p><ul>{data.history.map(item => <li key={item.id}><Link href={`${base}?run=${item.id}`}>{item.createdAt.toISOString()}</Link></li>)}</ul></nav>
  </>;
}
