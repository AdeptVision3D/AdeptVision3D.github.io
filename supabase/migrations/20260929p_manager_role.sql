-- Роль "Менеджер" (продажник): ведёт своих клиентов и встречи с ними.
-- В отличие от всех остальных таблиц в проекте (полная прозрачность
-- внутри команды), здесь сознательно вводим реальное ограничение на
-- уровне RLS, а не только на уровне интерфейса: менеджеры могут вести
-- конкурирующие сделки, и видеть чужих клиентов им не нужно и не должно
-- быть можно даже в обход UI. Тимлид/арт-директор/директор/админ по
-- прежнему видят и могут редактировать всех клиентов — им нужен полный
-- обзор бизнеса.

-- ====== Клиенты ======
drop policy if exists clients_select on public.clients;
create policy clients_select on public.clients
  for select
  using (auth_role() <> 'manager' OR created_by = auth.uid() OR auth_is_admin());

drop policy if exists clients_insert on public.clients;
create policy clients_insert on public.clients
  for insert
  with check (auth_role() = ANY (ARRAY['lead'::text, 'art_director'::text, 'ceo'::text, 'manager'::text]) OR auth_is_admin());

drop policy if exists clients_update on public.clients;
create policy clients_update on public.clients
  for update
  using (
    auth_role() = ANY (ARRAY['lead'::text, 'art_director'::text, 'ceo'::text]) OR auth_is_admin()
    OR (auth_role() = 'manager' AND created_by = auth.uid())
  );

drop policy if exists clients_delete on public.clients;
create policy clients_delete on public.clients
  for delete
  using (
    auth_role() = ANY (ARRAY['lead'::text, 'art_director'::text, 'ceo'::text]) OR auth_is_admin()
    OR (auth_role() = 'manager' AND created_by = auth.uid())
  );

-- ====== Календарь: менеджер заводит и правит только свои встречи ======
-- SELECT не трогаем — календарь общий, видят все (как и раньше).
drop policy if exists company_events_insert on public.company_events;
create policy company_events_insert on public.company_events
  for insert
  with check (auth_role() = ANY (ARRAY['lead'::text, 'art_director'::text, 'ceo'::text, 'manager'::text]) OR auth_is_admin());

drop policy if exists company_events_update on public.company_events;
create policy company_events_update on public.company_events
  for update
  using (
    auth_role() = ANY (ARRAY['lead'::text, 'art_director'::text, 'ceo'::text]) OR auth_is_admin()
    OR (auth_role() = 'manager' AND organizer_id = auth.uid())
  );

drop policy if exists company_events_delete on public.company_events;
create policy company_events_delete on public.company_events
  for delete
  using (
    auth_role() = ANY (ARRAY['lead'::text, 'art_director'::text, 'ceo'::text]) OR auth_is_admin()
    OR (auth_role() = 'manager' AND organizer_id = auth.uid())
  );

-- Приглашённые на события — тот же круг ролей, что управляет событиями
-- (без построчной привязки к конкретному событию, как и раньше для
-- lead/art_director/ceo — этой таблице такая детализация не нужна).
drop policy if exists company_event_invitees_insert on public.company_event_invitees;
create policy company_event_invitees_insert on public.company_event_invitees
  for insert
  with check (auth_role() = ANY (ARRAY['lead'::text, 'art_director'::text, 'ceo'::text, 'manager'::text]) OR auth_is_admin());

drop policy if exists company_event_invitees_delete on public.company_event_invitees;
create policy company_event_invitees_delete on public.company_event_invitees
  for delete
  using (auth_role() = ANY (ARRAY['lead'::text, 'art_director'::text, 'ceo'::text, 'manager'::text]) OR auth_is_admin());
