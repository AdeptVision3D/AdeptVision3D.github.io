-- Календарь событий компании (встречи, планёрки, важные даты) — отдельный
-- от дедлайнов проектов и отпусков, по решению Леонида ("только свои события").
-- Создавать/редактировать могут руководители (тот же круг, что управляет
-- проектами и клиентами — lead и выше), видят все.
create table if not exists public.company_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  event_date date not null,
  event_time time,
  description text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists company_events_date_idx on public.company_events(event_date);

alter table public.company_events enable row level security;

drop policy if exists company_events_select on public.company_events;
create policy company_events_select on public.company_events
  for select
  using (true);

drop policy if exists company_events_insert on public.company_events;
create policy company_events_insert on public.company_events
  for insert
  with check (auth_role() = ANY (ARRAY['lead'::text, 'art_director'::text, 'ceo'::text]) OR auth_is_admin());

drop policy if exists company_events_update on public.company_events;
create policy company_events_update on public.company_events
  for update
  using (auth_role() = ANY (ARRAY['lead'::text, 'art_director'::text, 'ceo'::text]) OR auth_is_admin());

drop policy if exists company_events_delete on public.company_events;
create policy company_events_delete on public.company_events
  for delete
  using (auth_role() = ANY (ARRAY['lead'::text, 'art_director'::text, 'ceo'::text]) OR auth_is_admin());
