# operator

Composição de consultas privadas do painel: shell, dia, clientes e relatório por período. API pública em index.ts; datas/paginação em domain.ts e leituras em service.ts. Somente leitura, sem criar entidades ou regras de reserva/distribuição. Usa APIs públicas de auth/compliance e consultas agregadas com tenant validado. Nenhum módulo de negócio depende deste módulo. Ver docs/SPRINT_08.md.
