-- Добавляет в profiles два новых поля:
--   is_admin  — флаг "админ-доступа": даёт полный доступ ко всем панелям
--               НЕЗАВИСИМО от роли в профиле (нужно для тестирования/отладки,
--               когда роль отражает реальную должность человека, а не права доступа);
--   is_active — мягкое увольнение: false скрывает сотрудника из списка входа
--               и блокирует доступ, но НЕ удаляет его данные и историю действий
--               (жёсткое удаление не делаем намеренно — сломало бы ссылки на автора
--               в логе действий и комментариях).
--
-- Выполнить один раз в Supabase Dashboard → SQL Editor → Run.
-- Безопасно выполнять повторно (if not exists).

alter table public.profiles add column if not exists is_admin boolean not null default false;
alter table public.profiles add column if not exists is_active boolean not null default true;
