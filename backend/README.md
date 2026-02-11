# Backend Go (API)

API REST com Go + Postgres para a aplicacao de gestao financeira.

## Stack e praticas aplicadas

- Router e middlewares com `chi` (request id, recover, timeout)
- Pool de conexao com `pgxpool`
- JWT com `RegisteredClaims` e validacao de issuer/audience/exp
- Senhas com `bcrypt`
- Shutdown gracioso com `Server.Shutdown(context.WithTimeout(...))`
- Multi-tenant por usuario (todos os dados vinculados a `user_id`)

## Subir via Docker

Na raiz do projeto:

```bash
docker compose up --build
```

Servicos:

- API: `http://localhost:8080`
- Postgres: `localhost:5432` (`finance/finance`)

## Auth

### `POST /api/auth/register`

```json
{
  "name": "Usuario",
  "email": "user@email.com",
  "password": "123456"
}
```

### `POST /api/auth/login`

```json
{
  "email": "user@email.com",
  "password": "123456"
}
```

Resposta de auth:

```json
{
  "token": "<jwt>",
  "user": {
    "id": "uuid",
    "name": "Usuario",
    "email": "user@email.com"
  }
}
```

Para endpoints protegidos:

```http
Authorization: Bearer <jwt>
```

## Endpoints protegidos

- `GET /api/me`
- `GET /api/bootstrap`

### Transacoes

- `GET /api/transactions?month=YYYY-MM`
- `GET /api/transactions/{id}`
- `POST /api/transactions`
- `POST /api/transactions/import` (importacao em lote, idempotente)
- `PUT /api/transactions/{id}`
- `DELETE /api/transactions/{id}`

Tipos aceitos: `receita`, `despesa`, `investimento`

### Orcamentos

- `GET /api/budgets`
- `POST /api/budgets`
- `PUT /api/budgets/{id}`
- `DELETE /api/budgets/{id}`

### Metas

- `GET /api/goals`
- `POST /api/goals`
- `PUT /api/goals/{id}`
- `DELETE /api/goals/{id}`
- `POST /api/goals/{id}/contributions`

### Projecao

- `GET /api/projection`
- `PUT /api/projection`

## Healthcheck

- `GET /health`
