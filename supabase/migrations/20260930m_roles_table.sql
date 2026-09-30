-- Единый источник списка ролей. До сих пор допустимые роли были
-- продублированы как минимум в двух не связанных друг с другом местах:
-- CHECK-ограничение на profiles.role (жёстко зашитый массив) и VALID_ROLES
-- в supabase/functions/bright-api/index.ts (отдельный жёстко зашитый
-- массив). Рассинхрон между ними дважды ронял прод: роль "manager", потом
-- "marketer" — добавляли в приложение/интерфейс, забывали обновить один
-- из этих списков (см. 20260930e_fix_profiles_role_check.sql,
-- 20260930f_marketer_role.sql).
--
-- Теперь это таблица: добавить новую роль — одна строка здесь и один
-- запрос в bright-api (который читает эту таблицу, а не свой массив),
-- вместо ALTER TABLE в миграции плюс правки хардкода в Edge Function.
--
-- Кто конкретно ЧТО может делать (например, "менять discount может только
-- art_director/ceo") — отдельный вопрос прав, не про "какие роли вообще
-- существуют", и сознательно остаётся как есть (в RLS-политиках и
-- canXxx()-функциях common.js) — сводить это в одну таблицу было бы уже
-- совсем другой, гораздо более рискованной переделкой.
create table if not exists public.roles (
  id text primary key,
  label text not null
);

insert into public.roles (id, label) values
  ('artist', 'Художник'),
  ('lead', 'Тимлид'),
  ('art_director', 'Арт-директор'),
  ('ceo', 'Генеральный директор'),
  ('manager', 'Менеджер'),
  ('marketer', 'Маркетолог')
on conflict (id) do update set label = excluded.label;

alter table public.roles enable row level security;

drop policy if exists roles_select on public.roles;
create policy roles_select on public.roles
  for select using (true);
-- INSERT/UPDATE/DELETE намеренно без клиентской политики — список ролей
-- меняется вручную через Supabase (service-role/дашборд), не из приложения,
-- так же как сейчас никто не может завести роль через обычный интерфейс.

-- Раньше: check (role = ANY (ARRAY['artist', 'lead', ...])) — фиксированный
-- список внутри самого ограничения. Теперь — внешний ключ на roles: чтобы
-- проверить/добавить допустимую роль, не нужно трогать структуру таблицы.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_fkey
  foreign key (role) references public.roles(id);
