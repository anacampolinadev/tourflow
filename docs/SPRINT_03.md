# Sprint 03 — Compliance

## Escopo implementado
Checklist individual definido pelo SUPER_ADMIN, envio pelo OPERATOR_OWNER, versões privadas, revisão por documento, pedido de correção e aprovação humana final. O formulário genérico de estados não permite contornar os gates. Não gera ambientes, não publica e não implementa o Sprint 04.

Fluxo: ONBOARDING → (Admin define requisito) DOCS_PENDING → (responsável envia) UNDER_REVIEW → (Admin revê todos e aprova explicitamente) APPROVED. Rejeição ou reabertura administrativa volta a DOCS_PENDING e limpa os marcadores atuais de aprovação. Revisões e auditoria anteriores permanecem. Todos os requisitos ativos são obrigatórios; checklist vazio nunca aprova. Não se presume qualquer lista de obrigações legais.

## Persistência e acesso
- ComplianceRequirement, ComplianceDocument e ComplianceReview com organizationId e FKs compostas para impedir referências entre operadores. Migração incremental, sem reset da base existente.
- Ficheiros em BYTEA privado no PostgreSQL: 2 MiB por ficheiro, 25 MiB e 50 versões por operador; até 12 requisitos incluindo desativados. Evita armazenamento efémero e credenciais de um fornecedor adicional neste MVP. O limite conta versões antigas.
- PDF/PNG/JPEG exigem extensão, MIME e assinatura coerentes. Não existe antivírus ou análise completa do formato; assinatura não garante que o conteúdo seja seguro. Download exclusivamente como anexo, nome gerado, no-store, nosniff e CSP sandbox; nunca publicar os bytes. Deve ser acrescentada análise de malware antes de uma operação que exija essa garantia.
- Responsável autenticado e vínculo ativo para envio/leitura; dispatcher, viewer e driver não acedem aos documentos. Admin usa acesso explícito e auditado. Servidor revalida a autorização em cada ação e download, incluindo versões antigas.
- Datas de validade são DATE, inclusivas até ao fim do dia UTC. O gate é recalculado a cada leitura/aprovação; expiração bloqueia geração mesmo com estado APPROVED persistido. Não há scheduler de expiração ou notificações.
- Revisões e bytes não são sobrescritos pela aplicação: substituições criam nova revisão de ficheiro. Histórico desativado permanece no banco. Ainda não há política automatizada de retenção/eliminação ou exportação de backups; exigem definição antes de produção.
- Cada escrita bloqueia a raiz OperatorProfile por compare-and-swap de version e grava auditoria na mesma transação. Pedidos com versões desatualizadas falham sem escrita parcial. Identidade do operador (nome, responsável e e-mail) não pode mudar em análise ou aprovado sem reabrir a documentação.
- Logs de auditoria guardam apenas identificadores, evento e versão, sem nomes de ficheiro, conteúdo ou observações. Dados sensíveis ficam nas tabelas privadas. Segredos e dados reais não foram adicionados.

## Interface
/operator/[organizationId]/documents: checklist, envio, histórico e correções.
/admin/operators/[organizationId]/documents: configuração dos requisitos, análise, reabertura e aprovação final.
/api/organizations/[organizationId]/documents/[documentId]: anexo autenticado; scope=admin requer SUPER_ADMIN. Negação/ausência responde 404 sem revelar existência.

## Validação
Em execução. Unitários verificam gates, validade, uploads e permissões. Integração usa PostgreSQL descartável para transações, concorrência, isolamento, FKs e quotas. Chromium exercita login real por e-mail, envio, rejeição, substituição, downloads privados e aprovação final.
Docker local permanece indisponível por ausência de WSL. Nenhum componente do Windows foi instalado; integração e navegador executam na CI com PostgreSQL e Mailpit descartáveis. Sem deploy de produção.
