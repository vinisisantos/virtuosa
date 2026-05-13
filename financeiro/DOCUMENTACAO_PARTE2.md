# Documentação — Parte 2: Módulos, APIs e Integrações

## 7. API Routes (~85 endpoints)

### Autenticação
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/auth/login` | Login (email+senha → JWT cookie) |
| POST | `/api/auth/register` | Registro de usuário |
| POST | `/api/auth/logout` | Logout (limpa cookie) |
| GET | `/api/auth/me` | Dados do usuário autenticado |

### Agendamento
| Método | Rota | Descrição |
|--------|------|-----------|
| GET/POST/PUT/DELETE | `/api/sessions` | CRUD de agendamentos |
| GET/POST | `/api/checkin` | Check-in de pacientes |
| GET/POST | `/api/checklists` | Checklists de procedimento |

### Clientes e CRM
| Método | Rota | Descrição |
|--------|------|-----------|
| GET/POST/PUT/DELETE | `/api/clients` | CRUD de clientes |
| GET | `/api/clients/search` | Busca de clientes |
| GET | `/api/clients/check-duplicate` | Verificação de duplicatas |
| GET/POST/PUT/DELETE | `/api/pipeline` | Pipeline de vendas |
| GET | `/api/pipeline/stats` | Estatísticas do pipeline |
| GET/POST | `/api/leads` | Leads do CRM |
| GET/POST/PUT | `/api/lead-assignment` | Atribuição de leads |
| GET/POST | `/api/communications` | Log de comunicações |
| GET/POST | `/api/surveys` | Pesquisas de satisfação |
| POST | `/api/surveys/send` | Envio de pesquisa via WhatsApp |
| GET/POST | `/api/loyalty` | Programa de fidelidade |
| GET/POST | `/api/waitlist` | Lista de espera |
| GET/POST/PUT | `/api/photos` | Fotos de clientes |

### WhatsApp (CRM Nativo)
| Método | Rota | Descrição |
|--------|------|-----------|
| GET/POST/PUT/DELETE | `/api/whatsapp/evolution` | Gestão de instâncias Evolution API |
| POST | `/api/whatsapp/evolution/webhook` | Webhook Evolution API |
| GET | `/api/whatsapp/evolution/media` | Proxy de mídia |
| POST | `/api/whatsapp/mega/webhook` | Webhook Mega API |
| GET/POST/DELETE | `/api/whatsapp/conversations` | Conversas do CRM |
| POST | `/api/whatsapp/send` | Envio de mensagens |
| GET/POST | `/api/whatsapp/session` | Sessão WhatsApp |
| POST | `/api/whatsapp/webhook` | Webhook WhatsApp genérico |
| GET/POST/PUT/DELETE | `/api/whatsapp/canned-responses` | Respostas rápidas |
| GET/POST/PUT/DELETE | `/api/whatsapp/labels` | Etiquetas de conversa |
| GET/POST | `/api/whatsapp/notes` | Notas de conversa |

### Financeiro
| Método | Rota | Descrição |
|--------|------|-----------|
| GET/POST | `/api/payments` | Pagamentos |
| POST | `/api/payroll/upload` | Upload de folha (PDF) |
| GET/POST/PUT | `/api/payroll/entries` | Entradas da folha |
| POST | `/api/payroll/payment` | Marcar pagamento |
| POST | `/api/payroll/penalty` | Penalidades |
| POST | `/api/payroll/toggle-adiantamento` | Toggle adiantamento |
| POST | `/api/payroll/toggle-recurring` | Toggle salário recorrente |
| GET | `/api/payroll/dashboard-sync` | Sync com dashboard |
| GET/POST | `/api/adiantamento` | Adiantamentos |
| GET/POST | `/api/pricing` | Calculadora de precificação |
| GET/POST | `/api/forecast` | Previsão de fluxo de caixa |
| POST | `/api/sales/extract` | Extração de vendas (AI) |
| POST | `/api/simulate` | Simulação financeira |

### Vendas e Pacotes
| Método | Rota | Descrição |
|--------|------|-----------|
| GET/POST/PUT/DELETE | `/api/packages` | Pacotes de tratamento |
| DELETE | `/api/packages/batch-delete-by-name` | Exclusão em lote |
| GET/POST/PUT/DELETE | `/api/catalog` | Catálogo de serviços |
| POST | `/api/catalog/seed` | Seed do catálogo |
| POST | `/api/catalog/bulk` | Importação em lote |
| GET/POST | `/api/procedimentos` | Procedimentos |
| GET/POST | `/api/profissionais` | Profissionais |

### Pedidos e Estoque
| Método | Rota | Descrição |
|--------|------|-----------|
| GET/POST/PUT/DELETE | `/api/orders` | Pedidos de compra |
| POST | `/api/orders/ai-price` | Preço sugerido por AI |
| GET/POST | `/api/orders/approvals` | Aprovações |
| GET | `/api/orders/audit` | Auditoria |
| GET | `/api/orders/prices` | Histórico de preços |
| POST | `/api/orders/scrape` | Web scraping de preços |
| POST | `/api/orders/scrape-edge` | Scraping edge |
| GET | `/api/orders/suggestions` | Sugestões de pedido |
| GET/POST/PUT/DELETE | `/api/insumos` | Insumos |
| POST | `/api/insumos/extract` | Extração de NF (AI) |
| POST | `/api/insumos/chat` | Chat AI sobre insumos |
| GET/POST/PUT | `/api/stock` | Estoque |

### Documentos e Contratos
| Método | Rota | Descrição |
|--------|------|-----------|
| GET/POST/PUT/DELETE | `/api/contracts` | Contratos digitais |
| POST | `/api/contracts/send-email` | Envio por email |
| GET/POST/PUT/DELETE | `/api/contract-templates` | Templates de contrato |
| POST | `/api/contrato/generate` | Geração de contrato |
| GET/POST | `/api/signatures` | Assinaturas digitais |
| GET/POST/DELETE | `/api/termos` | Termos |
| POST | `/api/templates/upload` | Upload de template |
| GET | `/api/templates/preview` | Preview de template |
| POST | `/api/assinafy` | Integração Assinafy |
| POST | `/api/assinafy/webhook` | Webhook Assinafy |
| POST | `/api/d4sign` | Integração D4Sign |

### Reembolso
| Método | Rota | Descrição |
|--------|------|-----------|
| GET/POST/PUT | `/api/reembolso` | Tickets de reembolso |
| GET/POST | `/api/reembolso/items` | Itens |
| POST | `/api/reembolso/attachment` | Anexos |
| GET | `/api/reembolso/audit` | Auditoria |
| POST | `/api/reembolso/payment-proof` | Comprovante |

### Sistema
| Método | Rota | Descrição |
|--------|------|-----------|
| GET/POST/PUT/DELETE | `/api/users` | Gestão de usuários |
| GET/POST | `/api/notifications` | Notificações |
| POST | `/api/push/subscribe` | Inscrição push |
| GET | `/api/push/debug` | Debug push |
| GET/POST | `/api/reminders` | Lembretes |
| GET | `/api/relatorios` | Relatórios |
| POST | `/api/chat` | Chat com AI |
| POST | `/api/data-cleanup` | Limpeza de dados |
| GET | `/api/webhook-logs` | Logs de webhook |
| GET/POST | `/api/meta-config` | Config Meta Ads |
| POST | `/api/webhooks/meta/lead` | Webhook Meta Lead |
| POST | `/api/webhooks/meta/messages` | Webhook Meta Messages |

### Mercado Livre
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/mercadolivre/auth` | Início OAuth |
| GET | `/api/mercadolivre/callback` | Callback OAuth |
| GET | `/api/mercadolivre/status` | Status da conexão |
| GET | `/api/mercadolivre/orders` | Pedidos ML |
| POST | `/api/mercadolivre/webhook` | Webhook ML |

---

## 8. Módulos do Frontend (Páginas)

### 8.1 Agenda (`/agenda`)
- Visualizações: dia, semana, mês, lista
- Drag & drop de agendamentos
- Filtros por profissional, status, procedimento, unidade
- Integração com catálogo de serviços
- Check-in de pacientes
- Checklists de procedimento
- Autocomplete de pacientes do CRM

### 8.2 Dashboard (`/dashboard`)
Sub-tabs dinâmicas:
- **Visão Geral** — KPIs de faturamento, vendas, custos
- **Metas** — Metas por unidade/mês com progresso visual
- **Análise** — Gráficos Chart.js (vendas x custos, tendências)
- **Comissões** — Cálculo de comissões por profissional
- **Comparativo** — Comparação entre unidades
- **Fluxo de Caixa** — Previsão financeira
- **Profissionais** — Dashboard por profissional
- **Mapa de Calor** — Horários mais movimentados
- **Aniversários** — Tracker de aniversários de clientes
- **Fidelidade** — Programa de pontos
- **Retenção** — Painel de retenção de clientes
- **Comunicações** — Histórico de comunicações
- **Avaliações (NPS)** — Pesquisas de satisfação
- **Atividades** — Log de atividades do sistema
- **Lista de Espera** — Gestão de lista de espera

### 8.3 Financeiro (`/` — página principal)
Sub-tabs:
- **Folha de Pagamento** — Upload de PDF, extração AI, CRUD de entradas, status de pagamento, adiantamento, salário recorrente
- **Vale Transporte** — Gestão de VT
- **Vale Refeição** — Gestão de VR
- **Premiação** — Comissões e bônus
- **Reembolso** — Tickets com anexos e auditoria
- **Custos** — Custos fixos e variáveis por categoria
- **Análise** — Análise financeira detalhada

### 8.4 CRM
- **Pipeline** (`/clientes`) — Kanban com colunas de status
- **WhatsApp** (`/crm/whatsapp`) — Chat completo com:
  - Envio/recebimento de mensagens em tempo real
  - Suporte a texto, imagem, áudio, vídeo, documentos
  - Respostas rápidas (canned responses)
  - Notas internas por conversa
  - Etiquetas coloridas
  - Detecção de leads de campanhas (Click-to-WhatsApp)
  - Cache de conversas no banco
  - Proxy de mídia autenticado
- **WhatsApp Conectar** (`/crm/whatsapp-connect`) — QR Code para conectar instâncias
- **Chatwoot** (`/crm/chatwoot`) — Integração com Chatwoot
- **Avaliações** (`/crm/avaliacoes`) — NPS e pesquisas
- **Estatísticas** (`/crm/estatistica`) — Métricas do CRM
- **Leads** (`/crm/leads`) — Gestão de leads Meta Ads

### 8.5 Vendas (`/pacotes`)
- **Orçamento** (`/pacotes/orcamento`) — Criação de orçamentos
- **Vendas** (`/pacotes`) — Pacotes vendidos com controle de sessões
- **Pacientes** (`/pacotes/pacientes`) — Lista e detalhes de pacientes
- **Procedimentos** (`/pacotes/procedimentos`) — Cadastro de procedimentos
- **Calculadora** (`/calculadora`) — Precificação inteligente com:
  - 4 etapas: Hora Maca → Impostos → Insumos → Protocolo
  - Gráfico donut de composição de custos
  - KPIs dinâmicos
  - Formatação de moeda brasileira em tempo real
  - Salvamento de protocolos no banco

### 8.6 Documentos
- **Modelos de Contrato** (`/termos`) — Editor HTML de templates com suporte a PDF de fundo
- **Contratos** (`/contratos`) — Gestão de contratos digitais com assinatura
- **Cancelamentos** (`/cancelamentos`) — Histórico com relatório HTML completo

### 8.7 Estoque e Pedidos
- **Estoque** (`/estoque`) — Itens, quantidades, movimentações, lotes, validade
- **Pedidos** (`/pedidos`) — Pedidos de compra com:
  - Comparação de preços
  - Sugestão AI de preço
  - Web scraping de fornecedores
  - Fluxo de aprovação
  - Auditoria completa
- **Insumos** (`/insumos`) — Upload de notas fiscais com extração AI

### 8.8 Outros
- **Pagamentos** (`/pagamentos`) — Controle de recebimentos
- **Relatórios** (`/relatorios`) — Relatórios gerenciais
- **Chat IA** (`/chat`) — Chat com Gemini AI
- **Perfil** (`/perfil`) — Dados e alteração de senha
- **Usuários** (`/usuarios`) — Gestão de usuários (admin only)
- **Catálogo** (`/catalogo`) — Catálogo de serviços
- **Configurações** (`/configuracoes`) — Configurações do sistema

---

## 9. Integrações Externas

| Integração | Finalidade | Lib/API |
|------------|------------|---------|
| **Supabase** | Banco PostgreSQL na nuvem | Prisma Client |
| **Google Gemini** | AI para chat, extração de NF, sugestão de preços | `@google/generative-ai` |
| **Evolution API** | WhatsApp via QR Code (self-hosted no VPS Contabo) | REST API |
| **Mega API** | WhatsApp alternativo | REST API |
| **Meta WhatsApp Business** | WhatsApp oficial (webhooks) | REST API |
| **Resend** | Envio de emails transacionais | `resend` |
| **Autentique** | Assinatura digital de contratos | GraphQL API |
| **Assinafy** | Assinatura digital alternativa | REST API |
| **D4Sign** | Assinatura digital alternativa | REST API |
| **Mercado Livre** | Pedidos de compra (OAuth) | REST API |
| **Vercel** | Deploy e hosting | Git push |
| **Web Push** | Notificações push no navegador | `web-push` |

---

## 10. Hooks Customizados

| Hook | Arquivo | Descrição |
|------|---------|-----------|
| `useDashboard` | `hooks/useDashboard.ts` | Estado completo do dashboard: logs financeiros, metas, custos fixos, contas. Formatação de moeda, tabs, filtros |
| `useFinanceiro` | `hooks/useFinanceiro.ts` | Tabs do financeiro (folha, VT, VR, premiação, reembolso, custos, análise) |
| `useAgenda` | `hooks/useAgenda.ts` | Estado da agenda: agendamentos, profissionais, filtros, views, CRUD |
| `useOrders` | `hooks/useOrders.ts` | Pedidos de compra com push notifications |
| `useUsers` | `hooks/useUsers.ts` | Gestão de usuários |
| `useCancelamento` | `hooks/useCancelamento.ts` | Histórico de cancelamentos |
| `useInsumos` | `hooks/useInsumos.ts` | Uploads de insumos |
| `useAnalytics` | `hooks/useAnalytics.ts` | Dados analíticos |

---

## 11. Bibliotecas Utilitárias (`lib/`)

| Módulo | Descrição |
|--------|-----------|
| `auth.ts` | JWT sign/verify, middleware helpers, cookie management |
| `db.ts` | Prisma Client singleton |
| `ai.ts` | Integração Google Gemini AI |
| `autentique.ts` | Client API Autentique (assinatura digital) |
| `mercadolivre.ts` | Client API Mercado Livre |
| `whatsapp-provider.ts` | Abstração para múltiplos providers WhatsApp |
| `lead-processor.ts` | Processamento de leads Meta Ads |
| `lead-assigner.ts` | Atribuição automática de leads |
| `payroll-calc.ts` | Cálculos de folha de pagamento |
| `payroll-extractor.ts` | Extração de dados de PDF de folha |
| `pdf-parser.ts` | Parser de PDF genérico |
| `pdf-export.ts` | Exportação para PDF (jsPDF) |
| `activity-logger.ts` | Logger de atividades do sistema |
| `unit-guard.ts` | Guard de permissão por unidade |
| `push.ts` | Envio de push notifications |
| `indexeddb-storage.ts` | Storage local com IndexedDB |
| `types.ts` | Tipos TypeScript compartilhados |

---

## 12. Componentes Principais

### Layout e Navegação
- `AppHeader` — Header com nav dropdowns, busca global (Ctrl+K), unit selector, theme toggle, profile
- `MobileTabBar` — Navegação mobile (bottom bar)
- `GuidedTour` — Tour interativo para novos usuários
- `KeyboardShortcuts` — Atalhos de teclado
- `WhatsNew` — Modal de novidades

### Dashboard
- `GoalsSection` — Metas com progresso
- `SalesSection` — Lançamento de vendas
- `CostsSection` / `FixedCostsSection` / `CustosUnificado` — Gestão de custos
- `FinancialAnalysis` — Análise financeira com gráficos
- `CommissionsView` — Comissões
- `UnitComparisonView` — Comparativo entre unidades
- `CashflowForecast` — Previsão de fluxo de caixa
- `ProfessionalDashboard` — Dashboard por profissional
- `BirthdayTracker` — Aniversários
- `LoyaltyProgram` — Fidelidade
- `RetentionPanel` — Retenção
- `NpsDashboard` — NPS
- `WaitlistPanel` — Lista de espera
- `AuditTrail` — Auditoria
- `BiDashboard` — Business Intelligence
- `ReportsSection` — Relatórios
- `BackupHistoryView` — Backups
- `PaymentReminder` — Lembretes de pagamento
- `CommunicationHistory` — Comunicações

### Financeiro
- `PayrollTable` — Tabela de folha de pagamento
- `FolhaInteligente` — Folha inteligente (upload PDF, extração AI, CRUD)
- `PremiacaoSection` — Premiações
- `ReembolsoSection` — Reembolsos
- `VrSection` / `VtSection` — VR/VT

### Pedidos
- `OrdersTable` — Tabela de pedidos
- `OrderModal` — Modal de criação/edição
- `OrderFilters` — Filtros
- `OrderApprovalPanel` — Aprovações
- `OrderAuditPanel` — Auditoria
- `PriceComparison` — Comparação de preços
- `MercadoLivreSection` — Integração ML

### UI Compartilhados
- `Toast` — Notificações toast
- `Skeleton` — Loading skeleton
- `ConfirmDialog` — Diálogo de confirmação
- `DatePicker` — Seletor de data
- `PatientAutocomplete` — Autocomplete de pacientes
- `ProcedureSelector` — Seletor de procedimentos
- `UploadZone` — Área de upload drag & drop
- `SummaryCards` — Cards de resumo
- `ThemeCustomizer` — Customização de tema
- `NotificationBell` — Sino de notificações
- `UnitSelector` — Seletor de unidade
- `Filters` — Filtros genéricos

---

## 13. Design e UX

### Tema
- **Dark mode padrão** com suporte a light mode
- CSS variables para theming (`--card-bg`, `--border`, `--primary`, `--text-main`, etc.)
- Cor primária: `#e6007e` (rosa Virtuosa)
- Font: Inter (Google Fonts)
- Material Symbols Outlined para ícones
- Border radius arredondados (20px cards, 10px inputs)
- Glassmorphism (backdrop-filter blur)
- Animações suaves (framer-motion)

### Responsividade
- PWA com manifest.json e service worker
- Mobile-first com MobileTabBar
- Hamburger menu no header
- Touch-friendly

### Funcionalidades de UX
- **Busca global** (Ctrl+K) — pesquisa em todas as funcionalidades
- **Tour guiado** — tutorial interativo por página
- **Push notifications** — alertas em tempo real
- **Tema escuro/claro** — toggle no header
- **Atalhos de teclado** — navegação rápida

---

## 14. Deploy e Infraestrutura

| Componente | Plataforma | Detalhes |
|------------|------------|---------|
| Frontend + API | Vercel | Deploy automático via git push (branch `main`) |
| Banco de Dados | Supabase | PostgreSQL gerenciado |
| WhatsApp API | Contabo VPS | Evolution API self-hosted |
| Domínio | Vercel | financeiro-blush-nine.vercel.app |

### Comandos
```bash
npm run dev          # Servidor de desenvolvimento
npm run build        # Build (prisma generate + next build)
npm run start        # Servidor de produção
npx prisma db push   # Sincronizar schema com banco
npx prisma generate  # Gerar Prisma Client
```

---

## 15. Fluxos Importantes

### Fluxo de Venda (Pacote)
1. Cliente é cadastrado no CRM
2. Orçamento é criado em `/pacotes/orcamento`
3. Pacote é convertido em venda em `/pacotes`
4. Sessões são criadas e vinculadas ao agendamento
5. Pagamentos são registrados em `/pagamentos`
6. Contrato digital é gerado e enviado para assinatura

### Fluxo de Folha de Pagamento
1. Upload de PDF da folha em `/` (tab folha)
2. AI (Gemini) extrai nomes e salários automaticamente
3. Entradas são revisadas e confirmadas
4. Pagamentos são marcados individualmente
5. Adiantamentos podem ser toggled
6. Salários recorrentes são replicados automaticamente

### Fluxo de WhatsApp CRM
1. Instância conectada via QR Code em `/crm/whatsapp-connect`
2. Webhooks (Evolution/Mega) recebem mensagens
3. Mensagens são persistidas em `EvolutionMessage`
4. Cache de conversas atualizado em `EvolutionChatCache`
5. Leads de campanha detectados automaticamente (adTitle/adBody)
6. Respostas rápidas, notas e etiquetas disponíveis

### Fluxo de Contrato Digital
1. Template criado/editado em `/termos` (HTML + PDF background)
2. Contrato gerado com dados do paciente via `/contratos`
3. Enviado para assinatura digital (Autentique/Assinafy/D4Sign)
4. Webhook recebe confirmação de assinatura
5. Status atualizado no sistema

### Fluxo de Cancelamento
1. Cancelamento registrado em `/cancelamentos`
2. Relatório HTML completo gerado (snapshot)
3. Relatório armazenado no banco para consulta futura
4. Histórico acessível com impressão direta
