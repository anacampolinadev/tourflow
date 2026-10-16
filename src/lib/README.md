# Área reservada

Infraestrutura transversal: env.ts valida configuração de autenticação e banco; db.ts fornece o cliente Prisma/PostgreSQL exclusivamente no servidor. Regras de domínio permanecem nos módulos.
