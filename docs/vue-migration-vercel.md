# Migracao Incremental para Vue e Impacto na Vercel

## Objetivo
Migrar o frontend atual (`index.html` + `app.js`) para Vue sem interromper o deploy atual na Vercel e sem alterar o backend no Fly.

## Base tecnica (Context7)
- Vue 3: `createApp(...).mount('#app')` permite adocao incremental por container.
- Vue + Vite: caminho oficial para SFC (`.vue`) e build otimizado.
- Vercel: continua servindo estatico com `outputDirectory` (ex.: `dist`) e rewrites para `/api/*` permanecem no `vercel.json`.

## Plano em fases
1. Fase 0: Preparacao
- Criar pasta `frontend-vue/` com Vite + Vue 3.
- Manter deploy atual intacto.

2. Fase 1: Ilha Vue
- Montar Vue em uma secao isolada (ex.: importacao CSV + reconciliacao) usando `createApp`.
- Continuar usando os mesmos endpoints REST.

3. Fase 2: Modulos principais
- Migrar gradualmente: transacoes, dashboard, relatórios e settings.
- Extrair regras compartilhadas (categorizacao CSV, normalizacao, formatacao) para utilitarios reutilizaveis.

4. Fase 3: Troca de entrypoint
- `index.html` passa a carregar bundle do Vite.
- `vercel.json` define `buildCommand` e `outputDirectory: dist`.
- Rewrites de `/api/:path*` para Fly permanecem iguais.

## Impacto na hospedagem Vercel
- Infra: baixo impacto. Continua frontend estatico + proxy `/api`.
- Build: passa de estatico puro para build Vite (Node em CI da Vercel).
- Cache: melhora para assets versionados (`dist/assets/*`).
- Risco principal: regressao de estado global durante coexistencia Vanilla + Vue.

## Riscos e mitigacoes
- Estado duplicado (Vanilla x Vue): centralizar em store unica antes de migrar paginas grandes.
- Quebra de roteamento interno: definir estrategia (SPA router ou paginas ancoradas) antes da fase 3.
- Regressao visual: validar com checklist funcional por modulo migrado.

## Criterio de pronto
- Importacao CSV, transacoes e dashboard funcionando 100% no Vue.
- `app.js` legado reduzido a bootstrap/fallback.
- Deploy Vercel com build Vite estavel e rewrite `/api` validado.
