-- Security Advisor: "Function Search Path Mutable" для auth_role() и
-- auth_is_admin() — у функций не зафиксирован search_path, из-за чего
-- теоретически можно подсунуть свою функцию/таблицу с тем же именем в
-- другой схеме и подменить поведение (актуально, если кто-то получит
-- права CREATE в схеме public — сейчас это только владелец проекта).
-- Фикс стандартный: жёстко фиксируем search_path у обеих функций.
alter function public.auth_role() set search_path = public, pg_temp;
alter function public.auth_is_admin() set search_path = public, pg_temp;
