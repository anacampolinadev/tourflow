# Sprint 13 — Sandbox/QA

## Entrega
Qualidade por operador em `/operator/[organizationId]/qa`, apenas para o responsável ativo. Administração usa `/admin/operators/[organizationId]/qa`, acesso SUPER_ADMIN explícito e auditado, sem herdar permissões do operador. O responsável executa a bateria; a administração regista evidência/impedimentos da revisão humana. Listagem por defeito mostra apenas falhas e pendências, com opção para consultar todos os resultados e as últimas dez execuções.

A bateria tem 34 verificações: 33 internas de preparação/contratos e uma pendência explícita de conversação real. Não há modelo/canal integrado para avaliar respostas de IA. Logo, nenhum relatório declara aprovação de conversação, validação do cliente ou produção; `productionReady=false` permanece obrigatório. Mesmo todos os contratos internos aprovados não habilitam CLIENT_REVIEW/LIVE. Este é o mecanismo de QA interno; o teste completo do MVP continua pendente da integração de atendimento/canais e revisão humana real.

## Bateria automática
Verifica aprovação documental, marca, configuração atual da assistente, horário/políticas/FAQ/contacto humano, serviços e existência de veículo/motorista com conta/membership ativa. Probes executam o mesmo motor das ferramentas do Sprint 12: catálogo/detalhes, referências desconhecidas, rejeição de tenant/preço/SQL/desconto/cancelamento inválidos, data/idioma/capacidade, condições antigas, consulta de disponibilidade, criação de reserva, cálculo de preço, ocupação, repetição e chave com outros dados, isolamento de outra sessão, recibo privado e pedido humano sem notificação/duplicação.

A amostra operacional é o primeiro serviço ativo ordenado por referência. Procura saída nos próximos 30 dias, até 32 consultas, usando idioma configurado compatível. Sem saída elegível, marca falha/etapas dependentes bloqueadas; não cria agenda, inventa disponibilidade ou declara que todos os serviços foram testados. A verificação de contacto humano não atesta disponibilidade real da pessoa; as notas e políticas ainda requerem revisão do cliente. Documentação individual de recursos não está implementada e não é presumida por este QA.

## Rollback e persistência
Fase 1: autorizar owner → lock OperatorProfile → revalidar identidade/gate documental/quota → snapshot → probes → exceção de controlo que obriga rollback. Cada chamada tem savepoint para reverter falhas sem contaminar probes posteriores. Reserva, cliente fictício, ocupação, eventos, sessões, chamadas, handoffs e audit de teste são revertidos mesmo quando passam. Sem mensagens ou efeitos externos; se adapters externos forem acrescentados, é obrigatório preservar modo de probe que não os execute.

Fase 2: nova transação → mesmo lock e revalidações → comparar snapshot atual ao testado → persistir apenas QaRun e audit. Uma alteração entre as fases impede gravar resultado válido. Falha do audit desfaz relatório e transição de estado. O primeiro relatório, inclusive com falhas de preparação, passa APPROVED → SANDBOX e incrementa versão da raiz, mantendo os marcadores de aprovação documental; não entra em revisão do cliente ou produção. Execuções seguintes em SANDBOX não mudam versão documental. Cliente em revisão não inicia outra bateria nesta etapa.

Helpers de composição transacional de assistants são internos ao servidor e revalidam owner/tenant/autor/gates. Não há novo endpoint público nem acesso do modelo ao banco. O executor normal continua com transação própria e respostas de erro seguras; regressões do Sprint 12 verificam que a extração não alterou o comportamento.

## Evidência e validade
QaRun guarda autor, organização, versão da suite `qa-contracts-1`, hash SHA-256 do snapshot, resultados limitados e prazo de até 24 horas. Não guarda argumentos de ferramentas, contactos do cliente QA ou cópia do conhecimento/configuração. Snapshot privado inclui versão da marca/assistente, playbook/conhecimento, serviços/recursos ativos, contas/memberships de motorista, fuso/calendário e aprovação/documentos atuais. Ocupações operacionais posteriores não são configuração e não invalidam o relatório; os resultados de disponibilidade são observações da execução, sem promessa de lugares futuros.

Mudança de configuração, perda de aprovação/documentação, prazo ou versão da suite tornam o relatório desatualizado e `internalReady=false` nas leituras. Entrada em SANDBOX é normalizada no hash para não invalidar o próprio resultado. A UI preserva o resultado histórico com aviso e exige nova bateria. Alterações futuras à suite/contratos devem incrementar QA_SUITE_VERSION e ajustar migration/limites quando o formato mudar.

Até 100 relatórios por operador, sem apagar histórico automaticamente. Resultados têm exatamente 34 chaves únicas e até 32 KiB; detalhes seguros e limitados, sem erros de banco ou valores pessoais. Datas de validade documental continuam a ser verificadas no momento da leitura/escrita, não apenas pelo hash.

## Revisão humana e gates
Cinco cenários: reserva normal, pessoa confusa, negociação, alteração e exceção difícil. A administração pode registar FAIL ou BLOCKED com nota de 20–1000 caracteres, sem dados de turistas. PASS é recusado no serviço e pelo CHECK do banco enquanto não houver integração de conversação. Não existe botão de aprovação aparente que salte essa pendência.

QaManualCheck é histórico imutável de até dez revisões por cenário/execução. Revisão esperada sob root lock rejeita concorrência; nota/revisão e audit são atómicos. Auditoria guarda apenas cenário/decisão/revisão/IDs; o texto fica privado. Relatório desatualizado não recebe revisão nova. Não há resolução automática da fila de handoff nem envio de mensagens.

Admin pode suspender SANDBOX pelo fluxo de estado existente. Pode também reabrir documentação em SANDBOX/CLIENT_REVIEW, limpando aprovação atual e invalidando QA. Não há reativação/publicação genérica nova. Estes caminhos preservam as três aprovações humanas previstas no produto.

## Modelo e validação
QaRun: FK Organization/User RESTRICT, índice de histórico e unicidade (id,organizationId). QaManualCheck: FK composta de tenant para o relatório, User revisor, unicidade relatório/cenário/revisão e CHECKs de tipos, limites e decisões permitidas. Sem exclusão operacional.

Unitários: integridade da evidência, chaves ausentes/duplicadas, notas/revisões limitadas e separação de QA interno/produção. PostgreSQL: execução real com rollback sem resíduos, falhas, papéis/isolamento/revogação/admin auditado, validade/hash, revisões concorrentes, bloqueio de PASS, rollback de relatório/audit, correção documental, suspensão e quotas. Chromium/Mailpit: owner executa → vê contagens/pendências/todos os casos → admin regista impedimento → owner consulta → mudança de configuração invalida; desktop/móvel e acesso estrangeiro.

Antes de concluir: npm run check, CI de migrations/drift/PostgreSQL/Chromium e relatório de entrega no commit final. Sem deploy, fornecedor novo, credenciais externas ou alterações do Windows/WSL. Sprint 14 — Managed Ops exige novo pedido; integração de conversas e gates finais continuam trabalho obrigatório antes do piloto/MVP.
