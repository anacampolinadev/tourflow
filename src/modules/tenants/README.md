# tenants

Responsabilidade futura: Organizações, membros e configuração por tenant.

Sprints 01/02: organizações/membros, listagem tenant-scoped e gestão administrativa de operadores. API pública em index.ts. Toda leitura normal resolve o vínculo ativo; acesso global é exclusivo de SUPER_ADMIN e auditado. Criação, atualização e transições usam transação. Conflitos são tratados com versionamento otimista. Aprovação documental e GO LIVE permanecem indisponíveis. Evidências de validação em docs/SPRINT_01_02.md.
