-- Recepcionistas cadastrados pelo administrador (a recepção escolhe o nome na entrada).
create table public.receptionists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_key text not null unique,
  created_at timestamptz not null default now()
);
alter table public.receptionists enable row level security;

-- Senhas antigas (111, 222, 333) deixam de valer: o administrador volta para a senha padrão 1111,
-- e Recepção e Apresentação entram sem senha até o administrador definir uma.
delete from public.access_pins;
