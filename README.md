# GoFund

Sistema de gestão financeira pessoal com Go backend, PostgreSQL e frontend vanilla JS.

## 🚀 Stack

- **Backend:** Go 1.23 + Chi Router + pgx/v5
- **Frontend:** Vanilla JS + HTML5 + CSS3 (PWA habilitado)
- **Banco:** PostgreSQL 16 (Neon em produção)

## 📦 Deploy

### Produção

| Camada | Serviço | URL |
|--------|---------|-----|
| Frontend | Vercel | https://gestao-htvb05zze-rupelios-projects.vercel.app |
| Backend | Fly.io | https://gestao-api.fly.dev |
| Banco | Neon | (connection string nos secrets) |

### Como atualizar

#### Frontend (Vercel)

```bash
# Na raiz do projeto
vercel --prod
```

Atualiza automaticamente: `index.html`, `app.js`, `styles.css`, `manifest.json`, `sw.js`

#### Backend (Fly.io)

```bash
# Na pasta backend
cd backend
fly deploy
```

Atualiza todo o código Go + Dockerfile

## 🛠️ Desenvolvimento local

### Com Docker Compose

```bash
# Subir banco + API
docker compose up --build

# Abrir o frontend
# Abra index.html no navegador ou use um servidor local:
python -m http.server 3000
# Acesse http://localhost:3000
```

### Sem Docker

#### Backend

```bash
cd backend

# Configurar DATABASE_URL no .env
export DATABASE_URL="postgres://..."
export JWT_SECRET="seu-secret-aqui"

# Rodar
go run ./cmd/server
```

#### Frontend

```bash
# Qualquer servidor HTTP estático
python -m http.server 3000
# ou
npx serve .
# ou
php -S localhost:3000
```

## 📝 Features

- ✅ Autenticação JWT
- ✅ Transações (receitas/despesas)
- ✅ Orçamentos mensais
- ✅ Metas financeiras com contribuições
- ✅ Projeção futura
- ✅ Categorias customizadas
- ✅ Múltiplas contas
- ✅ Dashboard com KPIs
- ✅ Relatórios mensais
- ✅ Planejador de parcelas
- ✅ Gráfico de evolução patrimonial
- ✅ Modo comparativo (meses)
- ✅ Exportar PDF
- ✅ Drag & drop CSV
- ✅ PWA (Service Worker)
- ✅ Atalhos de teclado
- ✅ Dark/Light theme

## 🗂️ Estrutura

```
gestao/
├── backend/
│   ├── cmd/server/        # Entry point
│   ├── internal/
│   │   ├── config/        # Configuração
│   │   ├── domain/        # Models + validação
│   │   ├── handler/       # HTTP handlers
│   │   ├── middleware/    # Auth, CORS, rate limit
│   │   ├── postgres/      # Repos + migrations
│   │   └── server/        # HTTP server setup
│   ├── Dockerfile
│   ├── fly.toml
│   └── go.mod
├── index.html             # SPA shell
├── app.js                 # Toda lógica do frontend
├── styles.css             # Design system
├── manifest.json          # PWA manifest
├── sw.js                  # Service Worker
├── vercel.json            # Vercel config + rewrites
├── docker-compose.yml
└── DEPLOY.md              # Guia completo de deploy
```

## 🔐 Variáveis de ambiente

### Backend (Fly.io secrets)

```bash
fly secrets set DATABASE_URL="postgresql://..."
fly secrets set JWT_SECRET="$(openssl rand -base64 32)"
fly secrets set CORS_ALLOWED_ORIGINS="https://seu-dominio.vercel.app"
```

### Desenvolvimento local (.env)

```env
DATABASE_URL=postgres://finance:finance@localhost:5432/finance?sslmode=disable
JWT_SECRET=dev-secret-change-in-prod
CORS_ALLOWED_ORIGINS=*
PORT=8080
```

## 📚 Docs

Ver [DEPLOY.md](./DEPLOY.md) para instruções completas de deploy.
