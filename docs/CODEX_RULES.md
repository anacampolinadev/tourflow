# Regras persistentes do Codex
1. Ler PRODUCT.md e ARCHITECTURE.md antes de alterar código; DATA_MODEL.md quando houver persistência.
2. Executar apenas o sprint solicitado. Não refatorar código alheio à tarefa, antecipar funcionalidades ou avançar automaticamente para o próximo sprint.
3. Manter o monólito modular. Páginas e handlers coordenam casos de uso; regras ficam nos módulos. Não importar internals de outros módulos.
4. TypeScript strict; evitar any, casts para silenciar erros e dependências sem necessidade. Usar npm e manter package-lock.json.
5. Segredos somente no servidor e fora do Git. Variáveis novas exigem exemplo sem segredo e validação na fronteira. Não registrar dados pessoais sensíveis.
6. Multi-tenancy e RBAC devem ser implementados antes dos fluxos operacionais. OrganizationId derivado de contexto validado. Testar deliberadamente acesso entre tenants e elevação de privilégios.
7. Disponibilidade é determinística. Reservas exigem transações, concorrência segura e idempotência. Alana confirma apenas após sucesso real da ferramenta.
8. Transições de estado passam por funções de domínio. Gates humanos de compliance, validação do cliente e GO LIVE permanecem explícitos.
9. Testar comportamento e riscos relevantes; não criar testes que apenas espelham implementação. A fundação possui contratos estruturais; autenticação, Admin e Compliance exigem testes de acesso, isolamento, concorrência e persistência, além do fluxo real de login. Compliance verifica também downloads privados, versões, quotas, validade e aprovação humana.
10. Antes de concluir: npm run lint, npm run typecheck, npm test e npm run build. Executar integração/E2E quando a mudança exigir. Relatar comandos, resultados, arquivos/áreas alterados e riscos; nunca declarar uma verificação não executada.
11. Atualizar documentos quando houver decisão ou mudança de contrato. Documentar claramente o que está implementado e o que é plano.
12. Definition of Done: escopo e aceite atendidos, verificações aprovadas, nenhuma credencial no diff, documentação coerente e limitações relatadas.

Preparação 15B: executar diagnóstico antes de publicar o piloto; não substituir TLS por conexões inseguras nem guardar segredos no Git/logs. config-only não contacta recursos, diagnóstico não migra/escreve/envia mensagens. deploymentReady não significa entrega de e-mail, login real ou GO LIVE. Confirmar isolamento/destino antes de migrations/bootstrap e manter Retell fechado no primeiro preview. Ver docs/SPRINT_15B.md.

## Entrada curta para tarefas futuras
Read first: docs/CODEX_RULES.md, docs/PRODUCT.md, docs/ARCHITECTURE.md.
Task: SPRINT-XX — nome.
Goal: um objetivo.
Implement: escopo fechado.
Do not: exclusões.
Acceptance criteria: comportamento verificável.
Before finishing: verificações acima e relatório conciso.

Operator Core exige também testes de preço em cêntimos, recolha, idiomas, normalização/duplicidade, transições de motorista e bloqueio de escrita por estado do operador. Conta de motorista não deve ser criada implicitamente por cadastro de contacto. Preservar ordem de bloqueio raiz do operador → recurso quando novos casos de uso partilharem esses dados.

Availability exige testes de DST, meia-noite, buffers, limites semiabertos, cobertura de janelas, associações, estado/idioma/capacidade e isolamento de todas as referências. mode=PLANNING não confirma reservas. Booking futuro deve revalidar disponibilidade e gates dentro da própria transação e incluir ocupações reais. Datas locais usam fuso do operador e horários ambíguos/inexistentes são rejeitados.

Booking exige teste de replay concorrente e chave com payload diferente, disputa do último recurso, rollback de cliente/reserva/ocupação/evento, snapshots de preços e condições, gates documentais e cancelamento idempotente. Não remover modo SANDBOX nem liberar LIVE antes da validação do cliente/GO LIVE. Em novos escritores, preservar lock da raiz e consultar compromissos; dispatch deverá trocar ocupação atomicamente. Requer PostgreSQL btree_gist.

Dispatch exige elegibilidade antes do ranking, revalidação sob lock, exclusão somente da própria ocupação e manutenção dos intervalos/preços preservados. Manual exige motivo e nunca ultrapassa filtros. Testar carga, desempates, reassignment atómico, replay, versão, isolamento, rollback após falha da decisão e cancelamento de ASSIGNED. Não usar fatores neutros como observações reais nem assumir validade documental individual; bloquear operação pública até aos gates próprios.

Painel: validar fuso/dias de 23/25 horas, intervalos [início,fim), totais completos apesar de paginação, última decisão de dispatch, canceladas fora de valores/passageiros e ausência de escritas/audit nas consultas. Não chamar valores previstos de receita nem janelas de motoristas de disponibilidade operacional. Não expor detalhes documentais a papéis de leitura; só contagens/gates. Novas páginas mantêm auth/RBAC nos casos de uso, independentemente do layout.

Motorista: vínculo explícito separado de contacto; nunca transferir acesso por edição de e-mail. Verificar User/membership/Driver ativos e apenas ocupação atribuída própria. Ações usam lock da raiz, versão/chave/hash com ator, evento/audit atómicos; testar replay, recusa, reatribuição e rollback. Redistribuição exclui recusas e não altera aceite/início silenciosamente. Não liberar buffers na conclusão antecipada nem cachear passageiros ou enfileirar ações offline. Novos estados precisam manter filtros, painel, relatórios e fairness coerentes.

White-label: não resolver tenant por Host sem propriedade de domínio verificada; usar contexto autenticado. Brand config só owner sob gate documental, com root lock/versão/audit. Regeração não sobrescreve personalizações nem duplica recursos. Não aceitar CSS/HTML/SVG/URL remota como branding; validar/normalizar PNG e limitar bytes/píxeis. Manter contraste, isolamento, cache privado e manifesto autenticado com use-credentials. Não remover os avisos SANDBOX nem confundir gerar marca com GO LIVE/Alana pronta.

Alana Core: owner ativo da própria organização, root lock/versão/gate documental/audit atómicos. Não alterar versões antigas silenciosamente nem copiar dados operacionais para o prompt. Playbook central prevalece sobre referências; contactos internos nunca entram nas instruções para o modelo. Prompt não é autorização nem garantia contra injection: ferramentas futuras validam tenant, RBAC, gates e idempotência no servidor. Não alegar inferência, mensagens, encaminhamento ou confirmação sem integração e sucesso reais. Preservar limite e histórico; não remover SANDBOX/gates.

Alana Tools: organização/sessão/callId vêm do adapter autenticado, fora dos argumentos do modelo. Revalidar owner/autor/TTL/configuração/gates; nunca dar acesso a outra reserva por referência livre. Criar booking e grant/audit na mesma transação; preservar callId em retries e recusar payload alterado. serviceVersion impede confirmação de condições antigas. success de consulta não confirma reserva; replay mostra estado atual. Handoff só regista fila interna com notificationSent=false. Consentimento de turista e integração de canais exigem implementação própria; notas/modelo não autorizam ações. Preservar snapshots antigos do playbook.

QA: não confundir contratos internos com avaliação de conversas ou aprovação de produção. Probes devem ser reais e sempre rollback-only, sem efeitos externos; persistir relatório apenas após revalidar hash/gates/identidade sob lock. Suite versionada, TTL e histórico limitado; não usar relatório desatualizado como autorização. Revisões humanas exigem SUPER_ADMIN explícito, revisão esperada e audit sem nota privada. PASS de conversação e CLIENT_REVIEW/LIVE continuam bloqueados até integração e validação reais. Ao adicionar adapters, impedir chamadas externas nos probes e incrementar a versão da suite quando mudar contratos.

Managed Ops: motivos/notas só owner do tenant ou SUPER_ADMIN explícito auditado. Lock raiz/revalidação/CAS/evento/audit atómicos; somente assignee conclui, admin pode devolver e assumir explicitamente. Retry histórico devolve estado atual sem reaplicar ação. Manter eventos privados e limite de alterações; não duplicar nota em audit. Handoff resolvido não reaparece como pendente num replay. Exceções podem ser tratadas sob suspensão/expiração sem liberar gates. Saúde usa última revisão documental e totais completos por âmbito; canais sem adapter/observação real ficam não integrados, nunca saudáveis por configuração ou declaração manual.

Telefonia 15A: associação Retell permanente por operador; não reatribuir agentId antigo. Segredos só ambiente, master switch fechado por defeito. Verificar bytes originais com SDK antes do JSON; reduzir payload e nunca guardar números/transcrições/gravações/análise. Tenant deriva do agente assinado e mapeado, não de metadata. GET externo fora da transação com ticket/versão/revalidação; prova expira e muda com chave/URL/configuração. Retry de evento não renova lastEventAt, quota não bloqueia duplicado. API/evento não autorizam funções, consentimento, QA conversacional ou produção. Não usar fixtures como prova de integração real; não iniciar testes/chamadas pagos automaticamente.
