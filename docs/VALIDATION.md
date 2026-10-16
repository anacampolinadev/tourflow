# Validação do Sprint 00

Ambiente local: Windows, Node 26.8.1, npm 11.19.0. CI configurada para Node 24 LTS em Linux; execução remota ainda precisa ser confirmada no GitHub.

Verificações: instalação com lockfile (`npm ci`), lint sem warnings, geração de tipos/TypeScript strict, 3 testes Vitest (renderização inicial, documentos persistentes e fronteiras dos módulos) e build de produção.

Não há testes de negócio, isolamento de tenants ou banco, pois essas funcionalidades não existem neste sprint.

## Dependências
`npm audit --omit=dev` não encontrou vulnerabilidades de produção em 2026-10-16.
O audit completo identificou 5 alertas high derivados de `braces` por `micromatch` → `fast-glob` → plugin/configuração de ESLint do Next.js (GHSA-vfj7-8cjw-p6xm). A cadeia está nas ferramentas de desenvolvimento. A sugestão automática rebaixa a configuração para Next 14 e não foi aplicada. Acompanhar correção upstream antes de processar padrões glob não confiáveis nas ferramentas.
ESLint 9.39.5 foi mantido porque plugins React/import/accessibility da configuração Next atual ainda não declaram compatibilidade com ESLint 10. Isso gera aviso de fim de suporte do ESLint 9 na instalação; migrar quando a cadeia suportar a versão 10. Não há overrides ou legacy-peer-deps.

## Limites
Sem deploy, serviços externos ou base de dados. O compilador Next exige execução fora do sandbox de arquivos desta sessão no Windows para resolver o caminho do projeto; isso não exigiu alteração na aplicação.
