-- Личные встречи: раньше заводить события календаря могли только
-- руководители (lead+) и менеджеры (свои встречи с клиентами). Теперь
-- любой сотрудник может завести встречу (например, художник — с тимлидом),
-- но только как организатор самого себя — от чужого имени заводить
-- события по-прежнему нельзя (это проверяется и в интерфейсе, и здесь,
-- на уровне RLS, чтобы нельзя было обойти через прямой запрос).
-- SELECT не трогаем — календарь общий, видят все (полная прозрачность).

drop policy if exists company_events_insert on public.company_events;
create policy company_events_insert on public.company_events
  for insert
  with check (
    auth_role() = ANY (ARRAY['lead'::text, 'art_director'::text, 'ceo'::text, 'manager'::text]) OR auth_is_admin()
    OR organizer_id = auth.uid()
  );

drop policy if exists company_events_update on public.company_events;
create policy company_events_update on public.company_events
  for update
  using (
    auth_role() = ANY (ARRAY['lead'::text, 'art_director'::text, 'ceo'::text]) OR auth_is_admin()
    OR organizer_id = auth.uid()
  );

drop policy if exists company_events_delete on public.company_events;
create policy company_events_delete on public.company_events
  for delete
  using (
    auth_role() = ANY (ARRAY['lead'::text, 'art_director'::text, 'ceo'::text]) OR auth_is_admin()
    OR organizer_id = auth.uid()
  );

-- Приглашённые: тот же организатор своей встречи может позвать участников.
drop policy if exists company_event_invitees_insert on public.company_event_invitees;
create policy company_event_invitees_insert on public.company_event_invitees
  for insert
  with check (
    auth_role() = ANY (ARRAY['lead'::text, 'art_director'::text, 'ceo'::text, 'manager'::text]) OR auth_is_admin()
    OR exists (select 1 from public.company_events e where e.id = event_id and e.organizer_id = auth.uid())
  );

drop policy if exists company_event_invitees_delete on public.company_event_invitees;
create policy company_event_invitees_delete on public.company_event_invitees
  for delete
  using (
    auth_role() = ANY (ARRAY['lead'::text, 'art_director'::text, 'ceo'::text, 'manager'::text]) OR auth_is_admin()
    OR exists (select 1 from public.company_events e where e.id = event_id and e.organizer_id = auth.uid())
  );
