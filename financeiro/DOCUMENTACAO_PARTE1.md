# Documentação Completa — Virtuosa Financeiro

## 1. Visão Geral

**Nome:** Virtuosa Financeiro  
**Tipo:** Sistema de Gestão (ERP) para Clínicas de Estética  
**Stack:** Next.js 16 + React 19 + Prisma + Supabase (PostgreSQL) + Tailwind CSS 4  
**Deploy:** Vercel  
**URL:** https://financeiro-blush-nine.vercel.app  

### Descrição
Sistema completo de gestão para a rede de clínicas **Virtuosa Estética**, com 4 unidades (Barueri, Osasco, SBC, SCS). Cobre: agenda, CRM com WhatsApp integrado, financeiro (folha, custos, vendas), contratos digitais, estoque, pedidos, relatórios e calculadora de precificação.

---

## 2. Arquitetura

```
financeiro/
├── prisma/schema.prisma          # 55 modelos, ~1074 linhas
├── middleware.ts                  # Auth JWT em todas as rotas API
├── src/
│   ├── app/
│   │   ├── layout.tsx            # Root layout (Inter font, PWA, auth gate)
│   │   ├── page.tsx              # Página principal (Financeiro)
│   │   ├── api/                  # ~85 API routes (Next.js Route Handlers)
│   │   ├── agenda/               # Agendamento de procedimentos
│   │   ├── calculadora/          # Calculadora de precificação
│   │   ├── cancelamentos/        # Histórico de cancelamentos
│   │   ├── catalogo/             # Catálogo de serviços
│   │   ├── chat/                 # Chat IA (Gemini)
│   │   ├── clientes/             # CRM Pipeline (Kanban)
│   │   ├── configuracoes/        # Configurações do sistema
│   │   ├── contratos/            # Contratos digitais
│   │   ├── crm/                  # CRM (WhatsApp, Avaliações, Estatísticas)
│   │   ├── dashboard/            # Dashboard com sub-tabs
│   │   ├── estoque/              # Gestão de estoque
│   │   ├── insumos/              # Upload/extração de insumos
│   │   ├── pacotes/              # Vendas, orçamentos, pacientes, procedimentos
│   │   ├── pagamentos/           # Controle de pagamentos
│   │   ├── pedidos/              # Pedidos de compra
│   │   ├── perfil/               # Perfil do usuário
│   │   ├── relatorios/           # Relatórios gerenciais
│   │   ├── termos/               # Modelos de contrato
│   │   └── usuarios/             # Gestão de usuários
│   ├── components/               # ~60 componentes React
│   ├── contexts/UnitContext.tsx   # Contexto global de unidade
│   ├── hooks/                    # 7 custom hooks
│   └── lib/                      # 15 módulos utilitários
├── public/                       # Assets estáticos, manifest.json, sw.js
└── package.json
```

**Total:** 246 arquivos TypeScript/TSX, ~60.919 linhas de código.

---

## 3. Autenticação e Autorização

### Sistema de Auth
- **JWT** com `jose` (HS256, expiração 7 dias)
- **Cookie httpOnly** (`virtuosa_token`) + fallback `Authorization: Bearer`
- **Middleware** (`middleware.ts`) intercepta TODAS as requisições API
- **Rotas públicas:** login, register, logout, webhooks (Meta, WhatsApp, Assinafy)
- **localStorage** (`virtuosa_user`) armazena dados do usuário no cliente

### Roles e Permissões
- **ADMINISTRADOR** — acesso total a tudo
- **Roles customizadas** — permissões granulares por funcionalidade:

| Permissão | Descrição |
|-----------|-----------|
| `admin` | Acesso administrativo total |
| `dashboard` | Dashboard e análises |
| `agenda` | Agenda de procedimentos |
| `financeiro` | Módulo financeiro |
| `finAdiantamento` | Adiantamentos |
| `finPremiacao` | Premiações |
| `finReembolso` | Reembolsos |
| `finCustos` | Custos fixos/variáveis |
| `finAnalise` | Análise financeira |
| `dashboardVendas` | Vendas e orçamentos |
| `pedidos` | Pedidos de compra |
| `termos` | Contratos e termos |
| `cancelamento` | Cancelamentos |
| `crmEstatistica` | Estatísticas CRM |
| `perfil` | Perfil pessoal |
| `dashboardRelatorios` | Relatórios |
| `unitBarueri/unitOsasco/unitSBC/unitSCS` | Acesso por unidade |

### Fluxo de Login
1. Cliente envia email/senha para `POST /api/auth/login`
2. API verifica bcrypt hash, gera JWT, seta cookie httpOnly
3. Retorna dados do usuário (sem senha) para localStorage
4. Middleware injeta headers `x-user-*` em cada request subsequente

---

## 4. Multi-Unidade (UnitContext)

O sistema opera com 4 unidades: **Barueri, Osasco, SBC, SCS**.

- `UnitContext.tsx` gerencia unidade ativa globalmente
- Cada usuário vê apenas as unidades que tem permissão
- Componente `UnitSelector` no header permite trocar unidade
- Dados são filtrados por `unit` em quase todas as queries
- Evento `virtuosa-unit-change` sincroniza mudanças entre componentes

---

## 5. Banco de Dados (55 Modelos Prisma)

### Modelos Principais

#### Gestão de Pessoas
| Modelo | Descrição |
|--------|-----------|
| `User` | Usuários do sistema (email, senha bcrypt, role, permissões JSON, unidade) |
| `Client` | Pacientes/clientes (nome, telefone, CPF, email, endereço, foto, unidade) |
| `Profissional` | Profissionais que realizam procedimentos |

#### Agenda
| Modelo | Descrição |
|--------|-----------|
| `Agendamento` | Agendamentos (cliente, procedimento, profissional, data/hora, status, sala, sessão) |
| `ServiceCatalog` | Catálogo de serviços (nome, duração, preço, categoria) |
| `ServiceChecklist` | Checklists de procedimentos |

#### Financeiro
| Modelo | Descrição |
|--------|-----------|
| `PayrollImport` | Importação de folhas de pagamento (PDF upload) |
| `PayrollEntry` | Entradas individuais da folha (nome, salário, status, adiantamento, recorrente) |
| `Adiantamento` | Registros de adiantamento salarial |
| `Payment` | Pagamentos recebidos de clientes |
| `PricingProtocol` | Protocolos de precificação (calculadora) |

#### Vendas e Pacotes
| Modelo | Descrição |
|--------|-----------|
| `Package` | Pacotes vendidos (procedimentos, sessões, valor, parcelas) |
| `TreatmentSession` | Sessões individuais de tratamento |

#### Pedidos e Estoque
| Modelo | Descrição |
|--------|-----------|
| `Order` | Pedidos de compra (fornecedor, itens, valores, status, aprovação) |
| `OrderApproval` | Aprovações de pedidos |
| `OrderAuditLog` | Log de auditoria de pedidos |
| `StockItem` | Itens em estoque (quantidade, mín, máx, lote, validade) |
| `StockMovement` | Movimentações de estoque |
| `InsumoUpload` | Uploads de notas fiscais de insumos |

#### CRM e WhatsApp
| Modelo | Descrição |
|--------|-----------|
| `EvolutionConfig` | Configuração da API WhatsApp (Evolution/Mega) por unidade |
| `EvolutionChatCache` | Cache de conversas WhatsApp (nome, foto, última msg, status, lead) |
| `EvolutionMessage` | Mensagens WhatsApp persistidas (texto, mídia, status) |
| `CannedResponse` | Respostas rápidas do CRM |
| `ConversationNote` | Notas internas por conversa |
| `ConversationLabel` | Etiquetas por conversa |
| `LabelDefinition` | Definições de etiquetas |
| `SalesPipeline` | Pipeline de vendas (status, fonte, valor estimado) |
| `LeadAssignment` | Atribuição de leads a vendedores |
| `MetaConfig` | Configuração Meta/Facebook Ads |
| `MetaLead` | Leads vindos do Meta Ads |
| `WhatsAppConversation` | Conversas WhatsApp (legado) |
| `WhatsAppMessage` | Mensagens WhatsApp (legado) |

#### Documentos e Contratos
| Modelo | Descrição |
|--------|-----------|
| `DigitalContract` | Contratos digitais (HTML, assinatura, status) |
| `ContractTemplate` | Templates de contrato (HTML, PDF background) |
| `CancelamentoHistory` | Histórico de cancelamentos com relatório HTML |
| `TermoHistory` | Histórico de termos |
| `ProcedimentoTermo` | Procedimentos vinculados a termos |

#### Avaliações e Fidelidade
| Modelo | Descrição |
|--------|-----------|
| `SatisfactionSurvey` | Pesquisas de satisfação (NPS) |
| `SurveyResponse` | Respostas de pesquisa pós-atendimento |
| `LoyaltyTransaction` | Programa de fidelidade (pontos) |
| `WaitlistEntry` | Lista de espera |

#### Reembolso
| Modelo | Descrição |
|--------|-----------|
| `ReembolsoTicket` | Tickets de reembolso |
| `ReembolsoItem` | Itens do reembolso |
| `ReembolsoAttachment` | Anexos do reembolso |
| `ReembolsoAuditLog` | Auditoria de reembolsos |

#### Sistema
| Modelo | Descrição |
|--------|-----------|
| `ActivityLog` | Log de atividades do sistema |
| `AuditLog` | Auditoria geral |
| `Notification` | Notificações push |
| `PushSubscription` | Inscrições push do navegador |
| `CommunicationLog` | Log de comunicações |
| `WebhookLog` | Log de webhooks recebidos |
| `FinancialBackup` | Backups financeiros |
| `ClientPhoto` | Fotos de clientes (antes/depois) |
| `MercadoLivreConnection` | Conexão Mercado Livre |
| `MercadoLivreOrder` | Pedidos do Mercado Livre |

---

## 6. Variáveis de Ambiente

| Variável | Uso |
|----------|-----|
| `DATABASE_URL` | Conexão Supabase PostgreSQL |
| `JWT_SECRET` | Chave para assinar tokens JWT |
| `GEMINI_API_KEY` | Google Gemini AI (chat, extração de dados) |
| `RESEND_API_KEY` | Envio de emails (Resend) |
| `FROM_EMAIL` | Email remetente |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_EMAIL` | Push notifications |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | VAPID key no cliente |
| `NEXT_PUBLIC_APP_URL` | URL da aplicação |
| `AUTENTIQUE_API_KEY` | Assinatura digital Autentique |
| `AUTENTIQUE_WEBHOOK_SECRET` | Webhook Autentique |
| `ASSINAFY_API_KEY` / `ASSINAFY_ACCOUNT_ID` / `ASSINAFY_BASE_URL` | Assinatura Assinafy |
| `D4SIGN_TOKEN_API` / `D4SIGN_CRYPT_KEY` / `D4SIGN_BASE_URL` | Assinatura D4Sign |
| `META_ACCESS_TOKEN` / `WHATSAPP_PHONE_ID` / `WHATSAPP_TOKEN` / `WHATSAPP_VERIFY_TOKEN` | WhatsApp Business API (Meta) |
| `EVOLUTION_WEBHOOK_SECRET` | Webhook Evolution API |
| `ML_APP_ID` / `ML_CLIENT_SECRET` / `ML_REDIRECT_URI` | Mercado Livre API |
| `GROQ_API_KEY` | Groq AI (fallback) |
| `MISTRAL_API_KEY` | Mistral AI (fallback) |
