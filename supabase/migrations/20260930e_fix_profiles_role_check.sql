-- Баг: при создании/редактировании сотрудника с ролью "Менеджер" база
-- падала с "new row for relation "profiles" violates check constraint
-- "profiles_role_check"".
--
-- Причина: роль "manager" была добавлена в приложение и в RLS-политики
-- миграцией 20260929p_manager_role.sql, но САМ check-constraint на
-- profiles.role (заведён руками в Supabase ещё до появления миграций,
-- разрешал только 'artist'/'lead'/'art_director'/'ceo') так и остался
-- старым — про него просто забыли при добавлении роли. Edge-функция
-- bright-api уже давно считает 'manager' валидной ролью (VALID_ROLES),
-- поэтому ошибка вылезала только на последнем шаге — при самой записи
-- в базу.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('artist', 'lead', 'art_director', 'ceo', 'manager'));
