-- Разрешаем менеджерам заводить новый проект после сделки (create-only —
-- дальше проектом управляет производство, у менеджера нет прав его
-- редактировать/удалять/распоряжаться командой, это осталось за
-- lead/art_director/ceo). SELECT/UPDATE/DELETE на projects не трогаем.
drop policy if exists projects_write on public.projects;
create policy projects_write on public.projects
  for insert
  with check (auth_role() = ANY (ARRAY['lead'::text, 'art_director'::text, 'ceo'::text, 'manager'::text]) OR auth_is_admin());
