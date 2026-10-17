# TourFlow
Plataforma B2B de operações para turismo, em monólito modular Next.js/TypeScript.

## Estado
Sprints 01 (Auth/Multi-tenant) e 02 (Admin): autenticação por e-mail, isolamento por organização, papéis e gestão administrativa de operadores. Schema Prisma/PostgreSQL, migração, auditoria e testes incluídos. CI aprovada com 33 testes unitários, 7 de integração e 3 de navegador; ver [evidências e limites](docs/SPRINT_01_02.md).
Sprint 03 acrescenta checklist documental, envio privado versionado, revisão, correções e aprovação humana. CI aprovada: 40 testes unitários, 19 de integração e 4 de navegador (63 no total). Ver [escopo e verificações](docs/SPRINT_03.md). Sprint 04 acrescenta cadastro de serviços, veículos e motoristas, validado com 51 unitários, 30 de integração e 6 de navegador (87 no total); ver [escopo e testes](docs/SPRINT_04.md). Sprint 05 acrescenta agenda e consulta de disponibilidade, validado com 68 unitários, 41 de integração e 8 de navegador (117 no total); ver [contratos e testes](docs/SPRINT_05.md). Sprint 06 acrescenta reservas transacionais internas, idempotência, ocupações e cancelamento, validado com 71 unitários, 55 de integração e 10 de navegador (136 no total); ver [contratos e validação](docs/SPRINT_06.md). Sprint 07 acrescenta Fair Dispatch v1 interno, escolha manual e decisões explicáveis, validado com 77 unitários, 68 de integração e 12 de navegador (157 no total); ver [contratos e validação](docs/SPRINT_07.md). Sprint 08 acrescenta painel diário, navegação comum, clientes, filtros de reservas e relatório de testes, validado com 81 unitários, 77 de integração e 14 de navegador (172 no total); ver [contratos e validação](docs/SPRINT_08.md). White-label e publicação ficam para as próximas etapas. Sem deploy nesta entrega.

## Executar localmente
Node 24 LTS (26 aceito), npm e Docker Desktop em execução.
```sh
npm ci
cp .env.example .env
docker compose up -d
npm run db:generate
npm run db:migrate
npm run db:bootstrap -- email-real-do-admin
npm run dev
```
No PowerShell, usar Copy-Item para copiar o exemplo. Preencher AUTH_SECRET com um segredo gerado conforme .env.example antes de iniciar. Credenciais do exemplo são apenas locais. O bootstrap é de uso único e não envia e-mail.
Abrir http://localhost:3000/login. Links locais aparecem no Mailpit em http://localhost:8025; nenhum destinatário externo é contactado. Contas operadoras são cadastradas pelo Admin, sem registo público.
Produção exige PostgreSQL e SMTP reais, HTTPS, limites de abuso e segredos próprios.

## Verificar
```sh
npm run check
```
Executa lint, geração de tipos, TypeScript, unitários e build. Para servir o build: npm start. Para testes interativos: npm run test:watch.

Integração: configurar DATABASE_URL de banco dedicado com nome terminado em _test, executar npm run db:migrate e npm run test:integration. Navegador: instalar Chromium com npx playwright install chromium, manter Mailpit local disponível e executar npm run test:e2e. Playwright inicia um servidor de teste na porta 3100. Os testes recusam outro nome de banco e limpam apenas suas fixtures. CI prepara PostgreSQL/Mailpit descartáveis e executa a mesma sequência.

## Estrutura
- src/app: páginas, layouts e API de autenticação.
- src/modules: operator (consultas do painel), auth, tenants, compliance, services, vehicles, drivers, availability, bookings e dispatch; duas fronteiras futuras.
- src/components: formulários reutilizáveis.
- src/lib: configuração validada e conexão ao banco.
- src/generated: cliente Prisma gerado, fora do Git.
- prisma: schema e migrations; scripts: bootstrap administrativo.
- tests: unitários, integração e navegador; docs: contexto persistente.

## Contexto para a próxima tarefa
Ler [regras](docs/CODEX_RULES.md), [produto](docs/PRODUCT.md), [arquitetura](docs/ARCHITECTURE.md), [modelo de dados](docs/DATA_MODEL.md) e [estado dos sprints](docs/SPRINT_01_02.md).


## Documentação do operador
No Admin, crie o operador e avance até Em configuração. Abra Rever documentação, defina os requisitos e indique se exigem validade. O responsável entra pelo próprio e-mail, abre Documentação do operador e envia os ficheiros. Após o envio para análise, o Admin revê cada versão atual e dá a aprovação final separadamente; rejeições pedem substituição. PDF/PNG/JPEG até 2 MiB, arquivo de 25 MiB/50 versões, 12 requisitos por operador. Os documentos ficam no PostgreSQL privado e são descarregados apenas com autorização. Não há antivírus integrado. Aprovação não publica o operador nem gera ambiente.

## Cadastros do operador
Entre com o e-mail do responsável e abra a organização → Serviços, Veículos ou Motoristas. Prepare preços e recursos desde Em configuração; operadores suspensos/restritos não podem alterar cadastros. Serviços e veículos começam inativos; motoristas começam pendentes e não recebem conta ou convite. A ativação do cadastro não confirma disponibilidade nem aprova documentos. Dispatcher gere veículos/motoristas e consulta serviços; viewer consulta sem alterar. Para retirar um recurso do cadastro ativo, desative-o ou mude o estado; não há exclusão física.

## Agenda e disponibilidade
Na organização, abra Agenda e disponibilidade. O responsável configura fuso, saídas semanais e veículos compatíveis; responsável/dispatcher registam janelas e bloqueios. A consulta usa passageiros, idioma, capacidades, estado ativo e horário completo com pausas; mostra motivo e até três alternativas em sete dias. Horas ambíguas na mudança da hora são rejeitadas. O resultado é planeamento: não segura recursos, não confirma reserva e não valida documentos individuais. A reserva revalida disponibilidade e aprovação documental na própria transação e desconta as ocupações já confirmadas.

## Reservas de teste
Após aprovação documental humana e configuração de agenda/recursos, abra Reservas de teste na organização. Owner/dispatcher confirmam o grupo e podem cancelar; viewer consulta. A reserva guarda preço/condições e ocupa um veículo/motorista com pausas. Repetir o mesmo pedido não duplica. Sem venda pública, pagamentos ou mensagens. Alterações de cadastros/calendário são bloqueadas enquanto existirem compromissos futuros: cancelar primeiro. Migration requer permissão PostgreSQL para btree_gist; não instala Linux/WSL.

## Distribuição interna
Na reserva, abra Ver distribuição. Owner/dispatcher podem distribuir automaticamente ou escolher recursos elegíveis com justificação; viewer consulta. A escolha revalida a agenda, substitui a ocupação atomicamente e preserva histórico/pontuação. Sem candidatos mantém a ocupação anterior. Carga e capacidade orientam o ranking; GPS/avaliações/aceitação são fatores neutros identificados. Somente SANDBOX, sem validação documental individual ou envio de pedidos ao motorista.

## Painel do operador
Abra a organização para consultar o dia, as pendências e a próxima saída. Use data e Atualizar dados para rever a operação; pendências abrem reservas filtradas. Menu comum inclui Clientes (contactos de reservas, sem deduplicação), Relatórios (até 31 dias por saída no fuso local, sem receita recebida) e Configurações em leitura. Motoristas com janela não significa elegibilidade para um serviço. Todos os indicadores continuam de teste; documentação detalhada é acessível apenas ao responsável.

### Sprint 09 — Motorista
Portal/PWA privado em /driver/[organizationId]. Responsável ativa o acesso no cadastro do motorista; contacto não concede acesso por si só. Aceite/recusa/chegada/início/conclusão de teste, histórico, redistribuição após recusa e manifesto de instalação. Sem notificações, GPS ou operações offline. Ver [contratos e limites](docs/SPRINT_09.md). A mesma base PostgreSQL/SMTP e comandos de teste anteriores continuam; não há variável ou dependência nova.

### Sprint 10 — White-label
Em Configurações → Identidade da marca, o responsável gera a configuração de teste após aprovação documental e define nome, cores e PNG. Identidade aplicada por organização ao painel e ao portal/PWA do motorista, com ícones privados e contraste legível. Geração repetível sem duplicar dados; não publica nem altera produção. Ver [contratos e limites](docs/SPRINT_10.md). Sem variável de ambiente nova; sharp 0.35.5 passa a dependência explícita para normalizar imagens.

### Sprint 11 — Alana Core
Em Configurações → Assistente Alana, o responsável prepara e personaliza a assistente, consulta instruções e histórico privado. Exige aprovação documental nas escritas. Sem modelo de IA, ferramentas ou canais ligados nesta etapa; o atendimento ao público continua desativado. Migration acrescenta perfis e versões; não há variável ou dependência nova. Ver [contratos e limites](docs/SPRINT_11.md).
