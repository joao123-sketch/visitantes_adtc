# Visitantes ADTC

App web instalável (PWA) para a recepção lançar visitantes e o apresentador vê-los e riscá-los durante o culto.

- Design: `docs/superpowers/specs/2026-11-06-visitantes-adtc-design.md`
- Plano: `docs/superpowers/plans/2026-11-06-visitantes-adtc.md`

## Rodar localmente (sem banco)

```bash
npx tsx scripts/dev-api.ts   # API com dados em memória na porta 8788
npm run dev                  # app na porta 5173
```

PINs de teste do servidor local: admin `111`, recepção `222`, apresentador `333`.

## Testes

```bash
npm test
```

## Publicar na Cloudflare (Worker com arquivos estáticos)

1. Cloudflare > Workers & Pages > Create > Import a repository > `visitantes_adtc`.
2. Settings > Builds: Deploy command `npx wrangler deploy` (o build roda sozinho, configurado em `wrangler.jsonc`).
3. Settings > Variables and Secrets: criar como **Secret**:
   - `SUPABASE_URL`: Supabase > Project Settings > API > Project URL
   - `SUPABASE_SERVICE_KEY`: chave `service_role` (nunca no front-end nem no git)
   - `TOKEN_SECRET`: texto aleatório longo (por exemplo, 40 caracteres)
4. Refazer o deploy depois de criar os segredos. O endereço fica `visitantes-adtc.<conta>.workers.dev`.

A configuração do Worker está em `wrangler.jsonc`; só as rotas `/api/*` passam pelo código em `worker/index.ts`.

## Definir os PINs iniciais

Crie o arquivo `.dev.vars` (ignorado pelo git) com `SUPABASE_URL=...` e `SUPABASE_SERVICE_KEY=...`, e rode:

```bash
npx tsx scripts/set-pin.ts admin 111
npx tsx scripts/set-pin.ts reception 222
npx tsx scripts/set-pin.ts presenter 333
```

Depois, os PINs podem ser trocados na tela de administração.

## Instalar no celular

- iPhone (Safari): Compartilhar > Adicionar à Tela de Início.
- Android (Chrome): menu > Instalar app.
