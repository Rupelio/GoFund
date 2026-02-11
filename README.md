# GoFund

Monorepo do GoFund com:

- `backend/`: API Go (Fly.io)
- `frontend-vue/`: frontend publicado na Vercel

## Deploy

### Frontend (Vercel)

```bash
cd frontend-vue
vercel --prod
```

### Backend (Fly.io)

```bash
cd backend
fly deploy
```

### Script unificado

```bash
./deploy.sh frontend
./deploy.sh backend
./deploy.sh all
```

## Desenvolvimento local

### Frontend

```bash
cd frontend-vue
npm install
npm run dev
```

### Backend

```bash
cd backend
go run ./cmd/server
```

## Observacao sobre migracao Vue

No momento, `frontend-vue` carrega o frontend legado em `/legacy/index.html`
para manter o mesmo visual/comportamento em producao enquanto a migracao para
componentes Vue acontece em etapas.
