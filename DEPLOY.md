# Deploy — Nexus Finance

Arquitetura de produção:

| Camada     | Serviço        | URL                                     |
| ---------- | -------------- | --------------------------------------- |
| Banco      | **Neon**       | `ep-noisy-pond-….neon.tech`             |
| Backend    | **Fly.io**     | `https://gestao-api.fly.dev`            |
| Frontend   | **Vercel**     | `https://gestao-<hash>.vercel.app`      |

---

## 1. Banco de Dados — Neon (já criado)

Sua connection string (do painel Neon):

```
postgresql://neondb_owner:<PASSWORD>@ep-noisy-pond-aicg1mks-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require
```

> **Nota:** as tabelas serão criadas automaticamente pelo backend na primeira inicialização (migrations auto-apply).

---

## 2. Backend — Fly.io

### Pré-requisitos

```bash
# Instalar flyctl (se ainda não tiver)
# Windows (PowerShell):
powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"

# Ou via Scoop:
scoop install flyctl

# Login
fly auth login
```

### Deploy

```bash
cd backend

# Criar o app (só na primeira vez)
fly launch --name gestao-api --region gru --no-deploy

# Configurar os secrets (variáveis sensíveis)
fly secrets set DATABASE_URL="postgresql://neondb_owner:npg_h6BFWbzGPN1Z@ep-noisy-pond-aicg1mks-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require"
fly secrets set JWT_SECRET="$(openssl rand -base64 32)"
fly secrets set CORS_ALLOWED_ORIGINS="https://gestao-<SEU_PROJETO>.vercel.app"

# Fazer deploy
fly deploy
```

### Verificar

```bash
fly status
fly logs

# Testar health check
curl https://gestao-api.fly.dev/health
```

### Variáveis de ambiente (definidas no fly.toml)

| Variável               | Valor     | Onde definir |
| ---------------------- | --------- | ------------ |
| `DATABASE_URL`         | string    | `fly secrets set` |
| `JWT_SECRET`           | random    | `fly secrets set` |
| `CORS_ALLOWED_ORIGINS` | url       | `fly secrets set` |
| `PORT`                 | 8080      | fly.toml     |
| `DB_MAX_CONNS`         | 5         | fly.toml     |
| `DB_MIN_CONNS`         | 1         | fly.toml     |

> Neon free tier suporta ~100 conexões simultâneas. DB_MAX_CONNS=5 é conservador e seguro.

---

## 3. Frontend — Vercel

### Pré-requisitos

```bash
# Instalar Vercel CLI
npm i -g vercel

# Login
vercel login
```

### Deploy

```bash
# Na raiz do projeto (onde está index.html)
cd gestao

# Primeiro deploy (configurar)
vercel

# Responda as perguntas:
#   - Set up and deploy? → Y
#   - Which scope? → (seu usuário)
#   - Link to existing project? → N
#   - What's your project's name? → gestao
#   - In which directory is your code located? → ./
#   - Want to modify these settings? → N

# Deploy de produção
vercel --prod
```

### Configuração do vercel.json

O `vercel.json` já está configurado com **rewrites** que fazem proxy das chamadas `/api/*` para o Fly.io:

```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://gestao-api.fly.dev/api/:path*" },
    { "source": "/health", "destination": "https://gestao-api.fly.dev/health" }
  ]
}
```

> Isso significa que o frontend chama `/api/auth/login` no mesmo domínio, e o Vercel encaminha para `https://gestao-api.fly.dev/api/auth/login`. **Sem problemas de CORS.**

---

## 4. Pós-deploy — Checklist

- [ ] Backend rodando: `curl https://gestao-api.fly.dev/health`
- [ ] Frontend acessível: abrir `https://gestao-<hash>.vercel.app`
- [ ] Registro funciona: criar conta na tela de login
- [ ] Atualizar `CORS_ALLOWED_ORIGINS` no Fly com a URL final do Vercel
- [ ] (Opcional) Configurar domínio customizado no Vercel e no Fly

---

## 5. Atualizações futuras

```bash
# Backend
cd backend && fly deploy

# Frontend
cd .. && vercel --prod
```

---

## Troubleshooting

| Problema | Solução |
| -------- | ------- |
| `connection refused` no DB | Verificar se a CONNECTION STRING do Neon está correta no Fly secrets |
| `channel_binding` error | Remover `&channel_binding=require` da DATABASE_URL |
| CORS error no browser | Atualizar `CORS_ALLOWED_ORIGINS` com a URL exata do Vercel |
| 502 no Vercel `/api/*` | Verificar se o app no Fly está rodando: `fly status` |
| VM pausa (cold start) | Normal no free tier Fly — primeira request pode demorar ~3s |
