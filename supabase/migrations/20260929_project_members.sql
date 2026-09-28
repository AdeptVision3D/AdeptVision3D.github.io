-- Назначение сотрудников на проект ("команда проекта").
--
-- Важно: это НЕ ограничение доступа — все по-прежнему видят все проекты
-- (полная прозрачность команды, как решили раньше). Таблица нужна только
-- для того, чтобы на главной странице выделить визуально, какие проекты
-- назначены текущему пользователю, а какие нет.
--
-- SELECT открыт всем авторизованным (иначе не получится вычислить, кто
-- в какой команде, чтобы подсветить свои проекты).
-- INSERT/DELETE — только руководители (lead/art_director/ceo) или is_admin,
-- по уже устоявшемуся в этом проекте паттерну (см. 20260928b).

create table if not exists public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

alter table public.project_members enable row level security;

drop policy if exists project_members_select on public.project_members;
create policy project_members_select on public.project_members
  for select
  using (true);

drop policy if exists project_members_insert on public.project_members;
create policy project_members_insert on public.project_members
  for insert
  with check (auth_role() = ANY (ARRAY['lead'::text, 'art_director'::text, 'ceo'::text]) OR auth_is_admin());

drop policy if exists project_members_delete on public.project_members;
create policy project_members_delete on public.project_members
  for delete
  using (auth_role() = ANY (ARRAY['lead'::text, 'art_director'::text, 'ceo'::text]) OR auth_is_admin());
