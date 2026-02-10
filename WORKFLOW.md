# Workflow de Atualização

## 📝 Fluxo completo de atualização

### 1. Fazer mudanças no código

```bash
# Editar arquivos (app.js, styles.css, backend/*.go, etc)
code .
```

### 2. Testar localmente (opcional)

```bash
# Backend
cd backend
go run ./cmd/server

# Frontend (outro terminal)
python -m http.server 3000
```

### 3. Commit das alterações

```bash
git add .
git commit -m "feat: descrição da alteração"
```

### 4. Deploy

#### Opção A: Deploy manual separado

```bash
# Frontend (Vercel) — na raiz
vercel --prod

# Backend (Fly.io) — na pasta backend
cd backend
fly deploy
```

#### Opção B: Script unificado

```bash
# Deploy completo (frontend + backend)
bash deploy.sh all

# Ou apenas um:
bash deploy.sh frontend
bash deploy.sh backend
```

## 🔄 Exemplos de cenários comuns

### Mudança apenas no frontend (app.js, styles.css, index.html)

```bash
# 1. Editar arquivos
code app.js

# 2. Commit
git add app.js
git commit -m "fix: corrigir bug no dashboard"

# 3. Deploy só do front
vercel --prod
```

### Mudança apenas no backend (handlers, models, etc)

```bash
# 1. Editar arquivos
code backend/internal/handler/transaction.go

# 2. Commit
git add backend/
git commit -m "feat: adicionar filtro de transações"

# 3. Deploy só do backend
cd backend
fly deploy
```

### Mudança full-stack (frontend + backend)

```bash
# 1. Editar ambos
code app.js backend/internal/handler/budget.go

# 2. Commit
git add .
git commit -m "feat: adicionar campo novo em orçamentos"

# 3. Deploy ambos (ordem importante: backend primeiro!)
cd backend
fly deploy
cd ..
vercel --prod
```

## 🚨 Troubleshooting

### Frontend não atualiza

```bash
# Limpar cache do Vercel
vercel --prod --force

# Verificar se o deploy foi bem sucedido
vercel ls
```

### Backend com erro após deploy

```bash
# Ver logs do Fly.io
cd backend
fly logs

# Verificar status
fly status

# Reverter para versão anterior (se necessário)
fly releases
fly releases rollback <versão>
```

### Mudança no schema do banco

```bash
# 1. Adicionar migration em backend/internal/postgres/postgres.go
# 2. Commitar
# 3. Deploy do backend — migrations rodam automaticamente!
cd backend
fly deploy
```

## 📊 Monitoramento pós-deploy

```bash
# Backend
fly logs -n           # Logs recentes
fly status            # Status das máquinas
curl https://gestao-api.fly.dev/health

# Frontend
curl -I https://gestao-htvb05zze-rupelios-projects.vercel.app
```

## 🔐 Atualizar secrets (variáveis de ambiente)

### Backend (Fly.io)

```bash
cd backend

# Atualizar secret
fly secrets set JWT_SECRET="novo-valor"

# Listar secrets (sem valores)
fly secrets list

# Remover secret
fly secrets unset NOME_DO_SECRET
```

### Frontend (Vercel)

Vercel não precisa de secrets — usa rewrites para proxy pro backend.

## 🌿 Branches e ambientes

```bash
# Criar branch de feature
git checkout -b feature/nova-funcionalidade

# ... fazer alterações ...

# Deploy de preview no Vercel (automático no push)
git push origin feature/nova-funcionalidade
vercel  # cria preview URL automática

# Após aprovação, merge e deploy de produção
git checkout main
git merge feature/nova-funcionalidade
bash deploy.sh all
```

## 📦 Backup antes de mudanças críticas

```bash
# Exportar dump do Neon (via GUI ou CLI)
# Download pelo dashboard: https://console.neon.tech

# Ou via pg_dump
pg_dump "$DATABASE_URL" > backup_$(date +%Y%m%d).sql
```
