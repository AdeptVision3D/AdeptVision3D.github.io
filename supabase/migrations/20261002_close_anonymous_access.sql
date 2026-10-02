-- Проблема: почти все политики созданы без указания роли, то есть действуют
-- для {public} — а это включает и анонимов. Публичный anon-ключ лежит в
-- common.js на открытом сайте, поэтому любой человек без аккаунта мог читать
-- таблицы с политикой "select using (true)": deals, deal_activities (переписка
-- с клиентами), employee_leaves, bug_reports, company_events, company_news,
-- marketing_expenses, content_plan, project_members, projects и т.д.
--
-- Фикс: переводим все политики с {public} на {authenticated} (только вошедшие
-- в систему). Условия внутри политик (роли, is_admin и т.п.) не меняются.
--
-- Исключения (остаются публичными намеренно):
--   profiles_select_all — страница входа (login.html) читает список сотрудников
--                         ДО входа, чтобы показать, из кого выбирать;
--   roles_select        — справочник названий ролей, секретов там нет;
--   error_logs_insert   — ошибки с экрана входа тоже должны попадать в журнал.
--
-- Выполнить один раз в Supabase Dashboard → SQL Editor → Run.
-- Безопасно выполнять повторно.

do $$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and roles = '{public}'
      and policyname not in ('profiles_select_all', 'roles_select', 'error_logs_insert')
  loop
    execute format('alter policy %I on %I.%I to authenticated',
                   p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

-- Проверка: этот запрос после выполнения должен вернуть ТОЛЬКО три строки
-- (profiles_select_all, roles_select, error_logs_insert).
-- select tablename, policyname from pg_policies
--   where schemaname = 'public' and roles = '{public}';
