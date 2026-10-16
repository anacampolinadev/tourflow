# Regras persistentes do Codex
1. Ler PRODUCT.md e ARCHITECTURE.md antes de alterar código; DATA_MODEL.md quando houver persistência.
2. Executar apenas o sprint solicitado. Não refatorar código alheio à tarefa, antecipar funcionalidades ou avançar automaticamente para o próximo sprint.
3. Manter o monólito modular. Páginas e handlers coordenam casos de uso; regras ficam nos módulos. Não importar internals de outros módulos.
4. TypeScript strict; evitar any, casts para silenciar erros e dependências sem necessidade. Usar npm e manter package-lock.json.
5. Segredos somente no servidor e fora do Git. Variáveis novas exigem exemplo sem segredo e validação na fronteira. Não registrar dados pessoais sensíveis.
6. Multi-tenancy e RBAC devem ser implementados antes dos fluxos operacionais. OrganizationId derivado de contexto validado. Testar deliberadamente acesso entre tenants e elevação de privilégios.
7. Disponibilidade é determinística. Reservas exigem transações, concorrência segura e idempotência. Alana confirma apenas após sucesso real da ferramenta.
8. Transições de estado passam por funções de domínio. Gates humanos de compliance, validação do cliente e GO LIVE permanecem explícitos.
9. Testar comportamento e riscos relevantes; não criar testes que apenas espelham implementação. Neste sprint os testes verificam os contratos estruturais da fundação.
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
