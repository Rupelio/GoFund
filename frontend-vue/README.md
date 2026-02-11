# GoFund Frontend Vue

Aplicacao Vue 3 + Vite criada com `create-vue`.
Neste momento, ela carrega o frontend legado em `/legacy/index.html` para manter
o mesmo visual/comportamento em producao enquanto a migracao Vue acontece por etapas.

## Rodar local

```bash
cd frontend-vue
npm install
npm run dev
```

Por padrao, o Vite faz proxy de `/api` e `/health` para `http://127.0.0.1:8080`.

## Build

```bash
npm run build
npm run preview
```

## Variaveis de ambiente

- `VITE_API_BASE_URL`: opcional. Se definido, o app usa esse host para chamar API.
  - Exemplo: `https://www.gofund.com.br`

Sem essa variavel, o app usa caminhos relativos (`/api`, `/health`).
