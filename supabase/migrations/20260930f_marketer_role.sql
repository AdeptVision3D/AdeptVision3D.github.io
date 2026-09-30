-- Роль "Маркетолог" — узкая роль без доступа к проектам/клиентам/
-- сотрудникам: только Аналитика (источники лидов, конверсия, финансы) и
-- публикация новостей компании. Права строже, чем у менеджера — CRM и
-- клиенты маркетологу не нужны, он не ведёт сделки, только анализирует.

-- 1) Разрешить роль на уровне constraint (тот же файл багов, что и с
--    "manager" — при добавлении новой роли обязательно нужно обновлять
--    и этот constraint, не только RLS/приложение).
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('artist', 'lead', 'art_director', 'ceo', 'manager', 'marketer'));

-- 2) Новости компании — маркетолог публикует наравне с ceo/art_director.
drop policy if exists company_news_insert on public.company_news;
create policy company_news_insert on public.company_news
  for insert
  with check (auth_role() = ANY (ARRAY['ceo'::text, 'art_director'::text, 'marketer'::text]) OR auth_is_admin());

drop policy if exists company_news_update on public.company_news;
create policy company_news_update on public.company_news
  for update
  using (auth_role() = ANY (ARRAY['ceo'::text, 'art_director'::text, 'marketer'::text]) OR auth_is_admin());

drop policy if exists company_news_delete on public.company_news;
create policy company_news_delete on public.company_news
  for delete
  using (auth_role() = ANY (ARRAY['ceo'::text, 'art_director'::text, 'marketer'::text]) OR auth_is_admin());

-- Аналитика (projects/frames/deals/clients/employee_leaves и т.д.) читается
-- по общему принципу "полная прозрачность" (select using(true) либо условие,
-- не завязанное на конкретный список ролей) — отдельных RLS-правок для
-- маркетолога не требуется, доступ на странице ограничивается только
-- интерфейсом (canViewAnalytics в common.js).
