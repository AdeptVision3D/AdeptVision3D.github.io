-- Мини-CRM: клиенты как отдельная сущность вместо просто текстового поля
-- "Заказчик" в проекте. projects.client_name остаётся (денормализованная
-- копия имени клиента для быстрого отображения в карточках проекта без
-- лишнего джойна — по принятой в проекте манере ручных джойнов), а
-- projects.client_id — настоящая связь на карточку клиента в CRM, по
-- которой строится история проектов клиента.
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  phone text,
  email text,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists clients_name_idx on public.clients (lower(name));

alter table public.projects add column if not exists client_id uuid references public.clients(id) on delete set null;

alter table public.clients enable row level security;

-- SELECT открыт всем (та же полная прозрачность, что и везде в проекте).
-- INSERT/UPDATE/DELETE — тот же круг, что управляет проектами (lead и выше),
-- т.к. карточка клиента заводится/редактируется прямо из формы проекта.
drop policy if exists clients_select on public.clients;
create policy clients_select on public.clients
  for select
  using (true);

drop policy if exists clients_insert on public.clients;
create policy clients_insert on public.clients
  for insert
  with check (auth_role() = ANY (ARRAY['lead'::text, 'art_director'::text, 'ceo'::text]) OR auth_is_admin());

drop policy if exists clients_update on public.clients;
create policy clients_update on public.clients
  for update
  using (auth_role() = ANY (ARRAY['lead'::text, 'art_director'::text, 'ceo'::text]) OR auth_is_admin());

drop policy if exists clients_delete on public.clients;
create policy clients_delete on public.clients
  for delete
  using (auth_role() = ANY (ARRAY['lead'::text, 'art_director'::text, 'ceo'::text]) OR auth_is_admin());
