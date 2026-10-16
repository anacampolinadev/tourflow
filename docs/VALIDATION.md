# Validação

## Sprint 04
Aprovado na [CI 38976279662](https://github.com/anacampolinadev/tourflow/actions/runs/38976279662), implementação cee3d83: npm ci, geração Prisma, migrações incrementais, comparação banco/schema, lint, typecheck, build, 51 unitários, 30 de integração PostgreSQL e 6 testes completos Chromium (87 no total). Inclui regressão dos sprints anteriores, cadastros reais, dinheiro, estados, papéis, isolamento, concorrência, quotas documentais e largura mobile. Sem erros JavaScript no cenário novo do responsável. Ver [contratos e evidências](SPRINT_04.md).

## Sprint 03
Aprovado na [CI 38974150021](https://github.com/anacampolinadev/tourflow/actions/runs/38974150021), implementação 9e8b157: npm ci, geração Prisma, migrações incrementais, comparação banco/schema, lint, typecheck, build, 40 unitários, 19 de integração PostgreSQL e 4 testes completos Chromium. Inclui os sprints anteriores. Acesso privado, histórico, rejeição/substituição, validade, quotas, concorrência e aprovação humana validados. Sem novas dependências ou alterações de componentes do Windows. Ver [contratos e limites](SPRINT_03.md).

## Sprints 01 e 02
Código validado na [CI 38970643586](https://github.com/anacampolinadev/tourflow/actions/runs/38970643586), implementação 1319434: instalação limpa, lint, tipos, build, migração aplicada, comparação banco/schema sem diferenças, 33 testes unitários, 7 testes de integração PostgreSQL e 3 testes completos em Chromium. O navegador usa login real por e-mail no Mailpit, sem bypass de autenticação, e verifica nomes longos sem overflow da página. Docker local não iniciou por ausência do WSL; não foram instalados componentes do Windows. Não há deploy de produção.

Dependências de produção: zero vulnerabilidades no npm audit após atualizar o transporte SMTP para Nodemailer 10.1.2, com overrides restritos para os peers do Auth.js. O envio SMTP com essa versão passou no teste real. Cinco alertas high continuam nas dependências de desenvolvimento de lint, descritos abaixo. Auth.js beta está fixado em 5.0.0-beta.32; Prisma/client/adapter em 7.10.1.

## Histórico — Sprint 00

Ambiente local: Windows, Node 26.8.1, npm 11.19.0. CI configurada para Node 24 LTS em Linux; execução remota ainda precisa ser confirmada no GitHub.

Verificações: instalação com lockfile (`npm ci`), lint sem warnings, geração de tipos/TypeScript strict, 3 testes Vitest (renderização inicial, documentos persistentes e fronteiras dos módulos) e build de produção.

Não há testes de negócio, isolamento de tenants ou banco, pois essas funcionalidades não existem neste sprint.

## Dependências
`npm audit --omit=dev` não encontrou vulnerabilidades de produção em 2026-10-16.
O audit completo identificou 5 alertas high derivados de `braces` por `micromatch` → `fast-glob` → plugin/configuração de ESLint do Next.js (GHSA-vfj7-8cjw-p6xm). A cadeia está nas ferramentas de desenvolvimento. A sugestão automática rebaixa a configuração para Next 14 e não foi aplicada. Acompanhar correção upstream antes de processar padrões glob não confiáveis nas ferramentas.
ESLint 9.39.5 foi mantido porque plugins React/import/accessibility da configuração Next atual ainda não declaram compatibilidade com ESLint 10. Isso gera aviso de fim de suporte do ESLint 9 na instalação; migrar quando a cadeia suportar a versão 10. Não há overrides ou legacy-peer-deps.

## Limites
Sem deploy de produção ou serviços de produção configurados; PostgreSQL e Mailpit descartáveis usados apenas na CI. O compilador Next exige execução fora do sandbox de arquivos desta sessão no Windows para resolver o caminho do projeto; isso não exigiu alteração na aplicação.
