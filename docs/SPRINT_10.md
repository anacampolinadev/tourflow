# Sprint 10 — White-label por configuração

## Entrega e uso
O responsável abre Configurações → Identidade da marca → Gerar white-label de teste. Após geração, configura nome de apresentação (2–80 unidades de texto), cor principal/secundária em #rrggbb e logótipo PNG opcional. A marca aparece no cabeçalho/cores do painel, no portal do motorista, títulos/tema do navegador e manifesto/ícones da PWA daquele operador. O nome legal/comercial da Organization permanece intacto. Sem perfil gerado, as interfaces mantêm a identidade TourFlow e os dados existentes.

## Factory e gates
generateWhiteLabel cria uma única BrandProfile com cores/nome iniciais e ícones de 192/512 píxeis. Root lock OperatorProfile, unicidade por organização e auditoria na mesma transação. Repetição/concor­rência não duplica perfil, evento de geração, contas, serviços, veículos ou motoristas, e não sobrescreve personalizações. Não copia código nem cria outro deploy. Revalida autorização do responsável e gate documental atual dentro do lock, inclusive ao repetir geração. Geração/edição exigem APPROVED, SANDBOX ou CLIENT_REVIEW com aprovação humana e documentos válidos. LIVE, suspensão, restrição e aprovação inválida são bloqueados. Não altera estado, versão ou aprovação do OperatorProfile. Reservas futuras não bloqueiam alteração puramente visual; nenhuma agenda/preço/condição de reserva é alterada.

Factory nesta etapa significa preparar identidade/configuração dos workspaces já existentes. Preparar assistente, executar QA por operador, validação do cliente e GO LIVE continuam nas etapas posteriores. A geração é acionada explicitamente pelo responsável após aprovação documental; não publica automaticamente na aprovação administrativa.

## Acesso, concorrência e privacidade
Só OPERATOR_OWNER gera/edita; dispatcher/viewer leem. DRIVER só lê a identidade/ficheiros do próprio tenant com User/vínculo ativos e Driver ACTIVE explicitamente associado. SUPER_ADMIN sem membership não recebe acesso implícito. Casos de uso verificam autorização independentemente do layout. Atualização exige versão esperada; dois pedidos da mesma versão só permitem um vencedor. Auditoria contém versão/estado da alteração do logo, sem nome da marca, conteúdo de ficheiro ou contactos. Falha no audit desfaz identidade/bytes/versão.

Metadados e ativos autenticados são privados/no-store, Vary: Cookie. IDs de organização nunca substituem membership. Metadados de páginas sem acesso usam nome genérico. Logo/ícones não expõem documentos, preços, clientes ou dados da outra empresa. React cache apenas por pedido, sem cache global da marca. Não usa Host/headers encaminhados para inferir tenant, DNS ou domínio. Sem URL remota/SVG fornecido pelo utilizador.

## Imagens e cores
PNG estático até 256 KiB, 16–1024 píxeis por lado e limite de 1 Mpixel no decoder. Rejeita bytes/formato inválidos, animação declarada, PNG incompleto, dimensões e limites excedidos. sharp 0.35.5 já existia como dependência opcional do Next; passa a dependência explícita para decodificar/reencodar, remover metadados/conteúdo anexado e limitar a 384×384 mantendo proporção. Logo canónico até 512 KiB. Ícones PNG em contain com fundo da cor principal, 192/512, até 1 MiB cada. Sem logo usa símbolo T gerado a partir de SVG interno constante e cores hex validadas; SVG não é aceite nem servido ao utilizador.

As cores só entram como valores hex validados em CSS custom properties de um wrapper do tenant. Texto preto/branco é escolhido pelo contraste; links usam tom escuro seguro quando necessário, mantendo pelo menos 4.5:1 nos fundos definidos. Alertas e estados de segurança mantêm semântica. A imagem do logótipo em si é responsabilidade visual do operador; não se certifica acessibilidade do desenho enviado.

## PWA
Manifesto privado em /driver/[organizationId]/manifest.webmanifest, id/start_url por organização e scope /driver. Uma única ligação rel=manifest com crossorigin=use-credentials na página, para incluir sessão no pedido do navegador ([MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/crossorigin)). O manifesto genérico /driver/manifest.webmanifest continua para a entrada comum. Ícones de marca saem por rotas privadas no mesmo origin. App já instalada pode precisar de atualização/reinstalação do navegador para refletir nome/ícones. Sem garantias de instalação em dispositivo físico nesta entrega; HTTPS é requisito fora de localhost. Worker/offline do Sprint 09 permanece sem cache privado nem fila de ações.

## Modelo e arquitetura
BrandProfile pertence a Organization por PK/FK organizationId RESTRICT. displayName, primaryColor, secondaryColor, logo opcional, hasLogo, icon192/icon512, version e timestamps. CHECKs de nome/cores/versão, coerência logo/hasLogo e tamanho dos bytes. Módulo branding separado evita ciclo tenants → compliance → tenants. APIs públicas por index.ts, imagens apenas no servidor, componentes da marca no servidor e formulário cliente mínimo com estado para preservar texto em erro. Sem novas variáveis de ambiente ou fornecedor externo.

## Verificações e limites
Suítes completas: 88 unitários, 94 integração PostgreSQL e 20 Chromium. Testes novos cobrem contraste/formato, decoder/dimensões/conteúdo anexado, factory concorrente/replay sem sobrescrever, gates, isolamento/roles/revogação, upload/manter/remover, edição concorrente e rollback. Chromium usa login real Mailpit, geração/formulário/upload/reload, preservação da Organization, visual móvel e alternância entre duas organizações, manifesto efetivamente lido pelo Chromium com credenciais e ativos privados. Resultados finais, commit e CI constam no relatório/PR. Capturas ocultam só a barra de desenvolvimento e preservam caret=initial.

Sem domínio próprio/subdomínios, site público, fotos, políticas, traduções, editor CSS/HTML, envio de e-mails de marca, assistente/Alana, publicação, merge ou deploy. Esses elementos não são declarados concluídos. Sprint 11 apenas com novo pedido.
