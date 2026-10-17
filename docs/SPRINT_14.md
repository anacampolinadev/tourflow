# Sprint 14 — Managed Ops

## Objetivo e entrega
Central privada para tratar exceções existentes e acompanhar a saúde da operação em SANDBOX. O responsável usa Atendimento no menu da sua organização; SUPER_ADMIN usa Central Managed na administração e abre o operador. Papéis dispatcher/viewer/driver não recebem motivos ou notas privadas. Acesso administrativo é explícito e auditado, sem membership implícita nem acesso às ferramentas do owner.

## Atendimento
- Reutiliza AssistantHandoff criado pela ferramenta do Sprint 12. Não duplica pedidos nem altera o motivo original. OPEN → CLAIM → IN_PROGRESS → RESOLVE → RESOLVED; RELEASE devolve à fila; REOPEN abre novamente.
- Assumir vincula ao ator autenticado. Apenas quem assumiu pode concluir; admin pode devolver uma atribuição presa à fila, depois assumir explicitamente. Não há seleção arbitrária de utilizador pelo formulário/modelo.
- Resolução exige nota privada de 10–1000 caracteres, apresentada como texto escapado. Histórico HandoffEvent imutável na API, até 100 alterações por pedido, com ator, data, revisão, ação e nota apenas na resolução. Nenhuma exclusão operacional.
- Lock OperatorProfile → releitura de identidade/membership → transição e CAS de versão → evento e audit na mesma transação. Revisão esperada mais ação/nota/ator identificam o pedido: retry igual não repete a mutação e devolve o estado atual; payload diferente ou disputa são recusados. Retentar um comando antigo nunca reaplica uma atribuição já devolvida.
- Pedidos existentes podem ser tratados sob suspensão, perda documental ou sessão de origem expirada; tratar exceção não cria reserva nem altera aprovação/status/gates. Revogação do utilizador/membership continua a bloquear.
- Filas OPEN/IN_PROGRESS/RESOLVED, 20 por página, ordem estável pelos pedidos mais antigos; totais completos do estado. Histórico no cartão. Lista antiga de ferramentas omite concluídos; replay de handoff mostra estado real atual, sem reabrir ou declarar pendência falsa.
- Assumir/concluir regista trabalho interno. notificationSent continua false. Não envia e-mail, chamada ou WhatsApp nem prova que um turista foi atendido fora da central.

## Saúde observada
Leituras atuais em RepeatableRead; sem jobs, snapshots de saúde, cache partilhado ou dados pessoais em logs. Owner lê sem escrita; admin audita cada leitura. A central administrativa pagina até 20 operadores e cada cartão mostra contagens completas desse operador; não apresenta totais parciais como globais.

Precisa de mim reúne pedidos abertos/em curso, suspensão/restrição, aprovação/checklist documental pendente, documentos atuais em falta/não aprovados/expirados ou a expirar até sete dias, futuras recusas de motorista, reservas CONFIRMED nas próximas 24h sem distribuição e execução em atraso. Documento usa a última revisão do requisito ativo; DATE é inclusivo em UTC, igual ao gate de compliance. Atraso: etapas anteriores ao início com startsAt passado ou IN_PROGRESS com endsAt passado; concluídas/canceladas excluídas. Horas são apresentadas explicitamente em UTC. Alertas apontam para documentos/reservas/filas conforme a permissão; admin solicita a intervenção do operador nas reservas.

Retell, WhatsApp e n8n aparecem como ainda não integrados, sem conectividade verificada. Não se fabricam ping, taxa de sucesso, disponibilidade, mensagens ou estado verde. O SMTP existente serve login; não demonstra atendimento de turistas. Não há opção manual de marcar um canal conectado. Monitorização do fornecedor exige adapter e observação autenticada numa etapa própria.

## Persistência e fronteiras
Migration 202610180014_managed_ops amplia AssistantHandoff com status/version/assignedToId/resolvedAt e acrescenta HandoffEvent. Defaults migram filas antigas para OPEN sem perder o motivo; CHECKs defendem estado/atribuição/data, limites e evidência; FK composta handoff/organização impede eventos entre tenants. assignedTo/actor usam FK User RESTRICT. Metadados auditados contêm IDs, ação, revisão e estado, nunca motivo ou nota.

Módulo managed-ops compõe leituras existentes e gere o ciclo de atendimento. assistants não depende de managed-ops; a ferramenta lê o estado persistido. Suite QA passa para qa-contracts-2 para invalidar evidência do contrato anterior. Probes continuam rollback-only e sem efeitos externos. Nenhuma dependência ou variável de ambiente nova.

## Aceite e verificação
Lint/tipos/unitários/build obrigatórios; PostgreSQL verifica RBAC, isolamento, transições, retry/concorrência, rollback após falha de auditoria, constraints, paginação, saúde documental/operacional e manutenção dos gates. Chromium/Mailpit verifica login real → owner assume → admin devolve/assume/conclui → owner consulta histórico/reabre, com viewport desktop/390px e bloqueio de conta estrangeira. Resultados exatos e commit final no relatório de entrega em outputs e na CI do PR.

## Limites
Não é o piloto nem o MVP pronto para venda. Não acrescenta inferência de IA, webhooks/credenciais, canais externos, notificações automáticas, onboarding público, validação final do cliente, CLIENT_REVIEW/LIVE ou deploy. QA de conversas reais continua bloqueado. O Sprint 15 depende de um novo pedido e de preparação das integrações e gates pendentes; não pode assumir que esta central os concluiu.
