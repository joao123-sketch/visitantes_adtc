-- Visitantes ADTC: esquema inicial
create extension if not exists pgcrypto;

create table public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event_date date not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now()
);
-- só um evento aberto por vez
create unique index events_one_open on public.events (status) where status = 'open';

create table public.access_pins (
  role text primary key check (role in ('admin', 'reception', 'presenter')),
  pin_hash text not null,
  salt text not null
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  client_id uuid not null,
  city text not null,
  church text not null,
  observation text,
  device_id text not null,
  receptionist text,
  created_at timestamptz not null default now(),
  unique (event_id, client_id)
);

create table public.people (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null,
  name_key text not null,
  city_key text not null,
  church_key text not null,
  presented boolean not null default false,
  created_at timestamptz not null default now(),
  unique (event_id, name_key, city_key, church_key)
);

create index people_group_idx on public.people (group_id);

-- Acesso só pela chave de serviço (servidor). Sem políticas = nenhum acesso direto do celular.
alter table public.events enable row level security;
alter table public.access_pins enable row level security;
alter table public.groups enable row level security;
alter table public.people enable row level security;
