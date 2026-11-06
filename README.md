# Visitantes ADTC

App web instalável (PWA) para a recepção lançar visitantes e o apresentador vê-los e riscá-los durante o culto.

- Design: `docs/superpowers/specs/2026-11-06-visitantes-adtc-design.md`
- Plano: `docs/superpowers/plans/2026-11-06-visitantes-adtc.md`

## Rodar localmente (sem banco)

```bash
npx tsx scripts/dev-api.ts   # API com dados em memória na porta 8788
npm run dev                  # app na porta 5173
```

PINs de teste do servidor local: admin `111111`, recepção `222222`, apresentador `333333`.

## Testes

```bash
npm test
```

## Publicar na Cloudflare Pages

1. Cloudflare > Workers & Pages > Create > Pages > Connect to Git > repositório `visitantes_adtc`.
2. Build command: `npm run build`. Output directory: `dist`.
3. Em Settings > Variables and Secrets (Production), criar como **Secret**:
   - `SUPABASE_URL`: Supabase > Project Settings > API > Project URL
   - `SUPABASE_SERVICE_KEY`: Supabase > Project Settings > API > `service_role` (nunca no front-end nem no git)
   - `TOKEN_SECRET`: texto aleatório longo (por exemplo, 40 caracteres)
4. Refazer o deploy depois de criar os segredos.

## Definir os PINs iniciais

Crie o arquivo `.dev.vars` (ignorado pelo git) com `SUPABASE_URL=...` e `SUPABASE_SERVICE_KEY=...`, e rode:

```bash
npx tsx scripts/set-pin.ts admin 123456
npx tsx scripts/set-pin.ts reception 234567
npx tsx scripts/set-pin.ts presenter 345678
```

Depois, os PINs podem ser trocados na tela de administração.

## Instalar no celular

- iPhone (Safari): Compartilhar > Adicionar à Tela de Início.
- Android (Chrome): menu > Instalar app.
