-- Организатор и приглашённые на событие календаря.
--
-- organizer_id — кто проводит встречу (по умолчанию совпадает с created_by,
-- но может быть другим человеком, если событие заводит, например, тимлид
-- за директора). Бэкафиллим существующие события созданным ими же автором.
alter table public.company_events add column if not exists organizer_id uuid references public.profiles(id);
update public.company_events set organizer_id = created_by where organizer_id is null;

-- Кого пригласили — отдельная таблица (человек может быть приглашён на
-- несколько событий, событие может звать нескольких людей).
create table if not exists public.company_event_invitees (
  event_id uuid not null references public.company_events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index if not exists company_event_invitees_user_idx on public.company_event_invitees(user_id);

alter table public.company_event_invitees enable row level security;

-- SELECT открыт всем (полная прозрачность, как и везде), INSERT/DELETE —
-- тот же круг, что управляет самими событиями (lead и выше).
drop policy if exists company_event_invitees_select on public.company_event_invitees;
create policy company_event_invitees_select on public.company_event_invitees
  for select
  using (true);

drop policy if exists company_event_invitees_insert on public.company_event_invitees;
create policy company_event_invitees_insert on public.company_event_invitees
  for insert
  with check (auth_role() = ANY (ARRAY['lead'::text, 'art_director'::text, 'ceo'::text]) OR auth_is_admin());

drop policy if exists company_event_invitees_delete on public.company_event_invitees;
create policy company_event_invitees_delete on public.company_event_invitees
  for delete
  using (auth_role() = ANY (ARRAY['lead'::text, 'art_director'::text, 'ceo'::text]) OR auth_is_admin());
