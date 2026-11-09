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
3. `SUPABASE_URL` já está em `wrangler.jsonc` (não é segredo). Em Settings > Variables and Secrets, criar só estes dois como **Secret**:
   - `SUPABASE_SERVICE_KEY`: chave secreta `sb_secret_...` (Supabase > Project Settings > API Keys > Secret keys; nunca no front-end nem no git)
   - `TOKEN_SECRET`: texto aleatório longo (por exemplo, 40 caracteres)
4. Refazer o deploy depois de criar os segredos. O endereço fica `visitantes-adtc.<conta>.workers.dev`.

A configuração do Worker está em `wrangler.jsonc`; só as rotas `/api/*` passam pelo código em `worker/index.ts`.

## Acesso

A entrada tem três caixas: Administrador, Recepção e Apresentação. O Administrador entra com a senha padrão `1111` e, na aba Recepcionistas, cadastra os nomes de quem trabalha na recepção e troca as senhas dos três acessos (4 a 8 números). Recepção e Apresentação entram sem senha até o Administrador definir uma. Quem entra na Recepção escolhe o próprio nome na lista. "Lembrar de mim" mantém a sessão por 30 dias no aparelho; sem ele, a sessão dura até fechar o app (no máximo 12 horas).

Antes de publicar esta versão, rode no SQL Editor do Supabase o arquivo `supabase/migrations/0002_receptionists.sql` (cria a tabela de recepcionistas e apaga as senhas antigas).

## Instalar no celular

- iPhone (Safari): Compartilhar > Adicionar à Tela de Início.
- Android (Chrome): menu > Instalar app.
