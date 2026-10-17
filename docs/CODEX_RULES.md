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
