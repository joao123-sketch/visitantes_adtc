# Visitantes ADTC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App web instalável (PWA) para recepcionistas lançarem visitantes e o apresentador ver e riscar a lista, com deduplicação e envio offline.

**Architecture:** Front-end Vite + React + TypeScript (PWA). API em Cloudflare Pages Functions (Hono) que valida PINs e é o único a falar com o Supabase (chave de serviço guardada como segredo; o celular nunca acessa o banco). O apresentador recebe atualizações por consulta periódica (polling de 3 s) em vez de Supabase Realtime, para não precisar de autenticação de cliente no banco (escolha do Claude: mais simples; ver spec "Atualização em tempo real").

**Tech Stack:** Vite, React, TypeScript, vite-plugin-pwa, Hono, @supabase/supabase-js, Vitest, Supabase (Postgres), Cloudflare Pages.

**Spec:** `docs/superpowers/specs/2026-11-06-visitantes-adtc-design.md`

## Global Constraints

- Idioma da interface: português do Brasil.
- Três papéis, cada um com PIN de 6 dígitos: `admin`, `reception`, `presenter`. Sem limite de tentativas de PIN.
- Só um evento com `status = 'open'` por vez.
- Duplicata = mesmo `nome + cidade + igreja` normalizados (sem maiúsculas, acentos e espaços extras) dentro do mesmo evento, pessoa por pessoa.
- Recepcionista edita/apaga só os próprios envios (identificados por `deviceId`), só com evento aberto.
- Apresentador: caixinha por pessoa, nome riscado, mesma posição, ordem de chegada dos grupos.
- Endereço gratuito `*.pages.dev`; `start_url` do PWA = `/`.
- Cores da logo (`Logo/images.jpg`): azul do livro, vermelho/laranja da chama, verde do globo; botão principal verde.
- Mobile first; instalável em iPhone e Android.

## Review Focus

1. Mesmo envio reenviado (queda de conexão) não cria duplicatas nem some do "Enviados" (testes nas tasks 1 e 5).
2. Nomes só com espaços ou linhas vazias são ignorados; envio sem nenhum nome é recusado (task 5).
3. Pendente criado offline e enviado depois do evento encerrado entra no evento original (task 5).
4. Recepcionista edita nome de pessoa já marcada como apresentada: a marcação continua (task 5); editar para nome que já existe é recusado com mensagem (task 5).
5. Token inválido/expirado ou PIN errado: volta ao login sem perder a fila de pendentes do celular (tasks 3 e 8).
6. Sem evento aberto: telas mostram "Nenhum evento aberto" (tasks 8 e 9).

---

### Task 1: Projeto, git e normalização

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `server/normalize.ts`
- Test: `server/normalize.test.ts`

**Interfaces:**
- Produces: `normalizeKey(value: string): string` (minúsculas, sem acentos, espaços colapsados e aparados).

- [ ] **Step 1:** Ligar a pasta ao repositório: `git init`, `git remote add origin https://github.com/joao123-sketch/visitantes_adtc.git`, `git pull origin main` (o Supabase pode ter criado `supabase/`), criar `.gitignore` com `node_modules`, `.superpowers/`, `.dev.vars`. Commit.
- [ ] **Step 2:** Criar projeto Vite React TS na raiz, instalar `hono @supabase/supabase-js vite-plugin-pwa vitest wrangler`.
- [ ] **Step 3: Teste falhando** em `server/normalize.test.ts`: `normalizeKey("  João  ") === "joao"`, `normalizeKey("IPUEIRAS") === "ipueiras"`, `normalizeKey("Maria   da  Silva") === "maria da silva"`, `normalizeKey("   ") === ""`.
- [ ] **Step 4:** Rodar `npx vitest run server/normalize.test.ts`; esperado: FAIL.
- [ ] **Step 5:** Implementar `normalizeKey` em `server/normalize.ts` (`normalize("NFD")` removendo marcas combinantes).
- [ ] **Step 6:** Rodar o teste; esperado: PASS. Commit.

### Task 2: Banco de dados (Supabase)

**Files:**
- Create: `supabase/migrations/0001_init.sql`

**Interfaces:**
- Produces tabelas:
  - `events(id uuid pk, name text, event_date date, status text check in ('open','closed'), created_at)` com índice único parcial `(status) where status = 'open'`.
  - `access_pins(role text pk, pin_hash text, salt text)`.
  - `groups(id uuid pk, event_id fk, client_id uuid, city text, church text, observation text, device_id text, receptionist text, created_at)` com `unique (event_id, client_id)`.
  - `people(id uuid pk, group_id fk, event_id fk, name text, name_key text, city_key text, church_key text, presented bool default false, created_at)` com `unique (event_id, name_key, city_key, church_key)`.

- [ ] **Step 1:** Escrever a migration com as tabelas acima.
- [ ] **Step 2:** Aplicar no projeto Supabase (`supabase db push` ou colar no SQL Editor). Esperado: tabelas visíveis no painel.
- [ ] **Step 3:** Habilitar RLS em todas as tabelas, sem políticas (acesso só pela chave de serviço). Commit.

### Task 3: Autenticação por PIN e token

**Files:**
- Create: `server/auth.ts`, `functions/api/[[route]].ts`, `server/db.ts`
- Test: `server/auth.test.ts`

**Interfaces:**
- Produces: `hashPin(pin: string, salt: string): Promise<string>`; `signToken(payload: {role: Role; deviceId: string; name?: string}, secret: string): Promise<string>`; `verifyToken(token: string, secret: string): Promise<Payload | null>`; middleware `requireRole(...roles: Role[])`; rota `POST /api/login {pin, deviceId, name?} -> {token, role}`; `type Role = 'admin' | 'reception' | 'presenter'`.

- [ ] **Step 1: Testes falhando** em `server/auth.test.ts`: token assinado verifica e devolve o payload; token alterado → `null`; segredo diferente → `null`; `hashPin("123456","s") === hashPin("123456","s")` e difere para outro PIN.
- [ ] **Step 2:** Rodar; esperado FAIL. Implementar com Web Crypto (HMAC-SHA-256, SHA-256). Rodar; PASS.
- [ ] **Step 3:** Implementar `POST /api/login` que compara o PIN contra `access_pins`; PIN errado → 401 `{error: "PIN incorreto"}`. Token vale por 24 h.
- [ ] **Step 4:** Criar `scripts/set-pin.ts` (`npx tsx scripts/set-pin.ts admin 123456`) para João definir os PINs iniciais. Commit.

### Task 4: API de eventos e PINs (admin)

**Files:**
- Create: `server/events.ts`
- Test: `server/events.test.ts`

**Interfaces:**
- Produces: `POST /api/events {name, eventDate}` (recusa com 409 se já houver evento aberto); `POST /api/events/:id/close`; `POST /api/events/:id/reopen` (409 se houver outro aberto); `GET /api/events/current -> {event | null}` (todos os papéis); `PUT /api/pins/:role {pin}` (admin; 6 dígitos numéricos).

- [ ] **Step 1: Testes falhando** (banco simulado): criar com outro aberto → 409; reabrir com outro aberto → 409; `PUT /api/pins/reception` com `"12345"` → 400.
- [ ] **Step 2:** Implementar e rodar; PASS. Commit.

### Task 5: API de visitantes (recepção)

**Files:**
- Create: `server/visitors.ts`
- Test: `server/visitors.test.ts`

**Interfaces:**
- Consumes: `normalizeKey`, `requireRole('reception')`.
- Produces:
  - `POST /api/groups {clientId: uuid, eventId: uuid, city, church, names: string[], observation?: string} -> {added: string[], duplicates: string[]}`. Linhas vazias ignoradas; sem nenhum nome → 400. Grupo sem pessoas novas não é gravado e devolve todos em `duplicates`. Observação de pessoa duplicada diferente da existente é anexada ao grupo existente. Aceita `eventId` de evento fechado (pendentes offline).
  - `GET /api/groups/mine?eventId=` → lista os grupos do `deviceId` do token.
  - `PUT /api/groups/:id {city, church, names, observation}` e `DELETE /api/groups/:id`: 403 se o `deviceId` não for o dono ou o evento estiver fechado; editar para nome que já existe → 409 `{error: "Essa pessoa já está na lista"}`; marcações `presented` das pessoas mantidas são preservadas.

- [ ] **Step 1: Testes falhando** (nomes): `reenvio com mesmo clientId não duplica`; `Maria e João + Maria e Carlos entra só Carlos`; `Joao de Ipueiras Bela Vista e Joao de Ipueiras Assembleia são pessoas diferentes`; `linhas vazias ignoradas`; `envio sem nomes retorna 400`; `envio com eventId de evento fechado é aceito`; `editar preserva presented`; `editar para nome existente retorna 409`; `outro deviceId não edita nem apaga (403)`.
- [ ] **Step 2:** Rodar; FAIL. Implementar usando os índices únicos do banco como fonte de verdade da duplicidade (inserir com `on conflict do nothing` e comparar o retornado). Rodar; PASS. Commit.

### Task 6: API do apresentador

**Files:**
- Create: `server/presenter.ts`
- Test: `server/presenter.test.ts`

**Interfaces:**
- Produces: `GET /api/list?eventId= -> {groups: {id, city, church, observation, people: {id, name, presented}[]}[]}` em ordem de chegada (`created_at`); `PUT /api/people/:id/presented {presented: boolean}` (papel `presenter`; última escrita vale).

- [ ] **Step 1: Testes falhando**: `ordem de chegada`; `marcar duas vezes mantém true`; `recepção não acessa /api/people/:id/presented (403)`.
- [ ] **Step 2:** Implementar; PASS. Commit.

### Task 7: Casca do app, login, tema e PWA

**Files:**
- Create: `src/App.tsx`, `src/api.ts`, `src/theme.css`, `src/screens/Login.tsx`, `public/logo.png`, `public/icon-192.png`, `public/icon-512.png`
- Modify: `vite.config.ts` (vite-plugin-pwa, manifest com nome "Visitantes ADTC", `start_url: "/"`, `display: "standalone"`)

**Interfaces:**
- Produces: `api<T>(path: string, init?: RequestInit): Promise<T>` (adiciona token, em 401 limpa o token e chama `onUnauthorized`); `getDeviceId(): string` (uuid persistido em `localStorage`).

- [ ] **Step 1:** Gerar ícones e logo a partir de `Logo/images.jpg`. Tema com as cores da logo, cartões arredondados e botão verde.
- [ ] **Step 2:** Tela de login (campo de PIN de 6 dígitos; pedir primeiro nome só para `reception`, uma vez); redirecionar por papel.
- [ ] **Step 3:** Tema claro/escuro/automático: `src/theme.ts` com `getTheme(): 'light'|'dark'|'auto'`, `setTheme(t)` (grava em `localStorage` e define `data-theme` no `<html>`; `auto` segue `prefers-color-scheme`); seletor de tema visível nas três telas; `theme.css` com variáveis para os dois temas. Teste `src/theme.test.ts`: `setTheme('dark')` grava `dark` e `getTheme()` devolve `dark`; valor inválido no `localStorage` → `auto`.
- [ ] **Step 4:** Tela sempre acesa: `src/wakeLock.ts` com `keepAwake(): () => void` (pede `navigator.wakeLock.request('screen')`, pede de novo em `visibilitychange` quando visível, devolve função que libera; sem suporte, não faz nada nem lança erro). Teste `src/wakeLock.test.ts` com `navigator.wakeLock` simulado: pede ao chamar; pede de novo ao voltar a ficar visível; sem `navigator.wakeLock` não lança. Chamar `keepAwake()` em `App.tsx` após o login.
- [ ] **Step 5:** Rodar `npm run build`; conferir o manifesto e o service worker gerados. Commit.

### Task 8: Tela da recepção com fila offline

**Files:**
- Create: `src/screens/Reception.tsx`, `src/queue.ts`
- Test: `src/queue.test.ts`

**Interfaces:**
- Produces: `enqueue(item: PendingGroup): void`, `flush(send: (g: PendingGroup) => Promise<void>): Promise<void>`, `pendingCount(): number`, com persistência em `localStorage`. `PendingGroup = {clientId, eventId, city, church, names, observation}`.

- [ ] **Step 1: Testes falhando**: `flush envia cada item uma vez e remove`; `erro de rede mantém o item`; `flush chamado duas vezes em paralelo não reenvia o mesmo clientId`; `401 mantém a fila`.
- [ ] **Step 2:** Implementar `queue.ts`; PASS.
- [ ] **Step 3:** Tela: cidade, igreja, linhas de pessoas com "+ Adicionar pessoa" e ✕, observação, botão Enviar, lista "Enviados" (com status "pendente"), edição e exclusão dos próprios envios, aviso "já estava na lista" para duplicatas, "Nenhum evento aberto" quando não houver evento. `flush` ao voltar a conexão (`online`) e ao abrir. Commit.

### Task 9: Tela do apresentador

**Files:**
- Create: `src/screens/Presenter.tsx`

- [ ] **Step 1:** Consultar `/api/list` a cada 3 s; em falha manter a última lista e mostrar "Sem conexão, mostrando a última lista".
- [ ] **Step 2:** Cartões por grupo com "Cidade · Igreja", caixinha por pessoa, nome riscado ao marcar, observação em destaque; marcações pendentes guardadas em `localStorage` e reenviadas ao reconectar. Contador "X de Y apresentados". Commit.

### Task 10: Tela do administrador

**Files:**
- Create: `src/screens/Admin.tsx`

- [ ] **Step 1:** Criar evento (nome e data), encerrar, reabrir; trocar os PINs dos três papéis. Commit.

### Task 11: Publicação e teste real

**Files:**
- Create: `wrangler.toml`, `README.md` (passo a passo de deploy e de definir PINs)

- [ ] **Step 1:** Conectar o repositório ao Cloudflare Pages (build `npm run build`, saída `dist`), variáveis `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `TOKEN_SECRET` como segredos. Nome do projeto escolhido com cuidado (endereço `pages.dev` fixa o `start_url`).
- [ ] **Step 2:** Definir os 3 PINs com `scripts/set-pin.ts`.
- [ ] **Step 3:** Teste real em iPhone e Android: instalar na tela inicial, lançar visitante, cortar a internet, enviar, religar e ver chegar; abrir apresentador em outro aparelho e riscar um nome. Esperado: tudo funciona sem duplicatas.

---

## Self-review

- **Cobertura da spec:** acessos/PINs (3, 4, 10), eventos e bordas (4, 5, 8, 9), registro (5, 8), lista do apresentador (6, 9), duplicatas pessoa a pessoa com igreja (1, 2, 5), edição/exclusão (5, 8), offline (8, 9), visual/logo (7), endereço pages.dev (11). Sem lacuna.
- **Tipos:** `PendingGroup`, `Role` e `normalizeKey` usados com os mesmos nomes em todas as tasks.
- **Escolha que mudou a spec:** polling de 3 s no lugar de Supabase Realtime (explicado no cabeçalho).
