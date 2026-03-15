# Tasklist — Sistema RBAC Virtuosa

## ✅ Fase 1: Banco de Dados
- [x] Criar model `User` no `schema.prisma` com roles: `ADMINISTRADOR`, `GERENTE`, `VENDEDOR`, `ESTETICISTA`
- [x] Rodar migrations Prisma (SQLite)

## ✅ Fase 2: APIs Next.js
- [x] Rota `POST /api/auth/register` com hash bcryptjs
- [x] Rota `POST /api/auth/login` com validação e retorno do perfil completo
- [x] Rota `GET/PUT/DELETE /api/users` (CRUD para painel admin)

## ✅ Fase 3: Proteção de Rotas Next.js
- [x] Criar componente `<AuthGuard allowedRoles=[...]>`
- [x] Aplicar AuthGuard na página `/` (Financeiro) — liberado para `ADMINISTRADOR` e `GERENTE`
- [x] Aplicar AuthGuard na página `/usuarios` — liberado apenas para `ADMINISTRADOR`

## ✅ Fase 4: Integração no Frontend Vanilla JS
- [x] Formulários de login/registro em `login.html` com chamadas fetch para `localhost:3000`
- [x] Salvar dados do usuário (`name`, `email`, `role`, `unit`) no `localStorage` como `virtuosa_user`
- [x] Resolver CORS via `next.config.ts`
- [x] Criar `permissions.js` e injetar em todas as páginas HTML
- [x] `permissions.js` oculta links de "Financeiro" e "Dashboard" para roles `VENDEDOR` e `ESTETICISTA`
- [x] `permissions.js` redireciona VENDEDOR/ESTETICISTA se tentarem acessar `dashboard.html` diretamente

## ✅ Fase 5: Validar Fluxos de Acesso por Nível

### 5.1 — Corrigir Logout (Sair)
- [x] **Bug identificado**: botão "Sair" em todas as páginas redirecionava para `login.html` sem limpar o `localStorage`, causando loop de redirecionamento (usuário voltava ao dashboard)
- [x] Corrigido em `script.js` (páginas `index.html` e `profile.html`)
- [x] Corrigido em `dashboard_v2.js` (página `dashboard.html`)
- [x] Corrigido em `financeiro/src/app/page.tsx` (página Financeiro Next.js)
- [x] Corrigido em `financeiro/src/app/usuarios/page.tsx` (página Usuários Next.js)
- **Fix**: `localStorage.removeItem('virtuosa_user')` adicionado antes de qualquer `window.location.href = 'login.html'`

### 5.2 — Validação Role VENDEDOR (Vanilla JS)
- [x] `permissions.js` oculta `a[href*="dashboard.html"]` e `a[href*="3000"]` para VENDEDOR
- [x] Acesso direto a `dashboard.html` redireciona para `index.html`
- [x] Menus "Dashboard" e "Financeiro" ficam invisíveis na navbar

### 5.3 — Validação Bloqueio Next.js (AuthGuard)
- [x] `AuthGuard` em `page.tsx` com `allowedRoles=['ADMINISTRADOR', 'GERENTE']`
- [x] VENDEDOR tentando acessar `localhost:3000/` é redirecionado para `localhost:8000/index.html`
- [x] VENDEDOR tentando acessar `localhost:3000/usuarios` é redirecionado para `localhost:8000/index.html`
- [x] Enquanto verifica, exibe spinner "Verificando acessos..." (sem flash de conteúdo protegido)
