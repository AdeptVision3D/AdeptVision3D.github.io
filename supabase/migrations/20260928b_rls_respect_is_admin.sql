-- Проблема: все RLS-политики на запись/удаление проверяют только auth_role()
-- (роль из profiles), и ничего не знают про новый флаг profiles.is_admin.
-- Из-за этого пользователь с ролью "artist" + is_admin=true (например, сам
-- Леонид после смены своей роли) видит кнопки в интерфейсе, но база
-- отклоняет операции с ошибкой 42501 "new row violates row-level security policy".
--
-- Фикс: добавляем функцию auth_is_admin() и дописываем её через OR
-- во все политики записи/удаления, которые сейчас ограничены по ролям.
-- Политики, открытые для всех (qual/with_check = true), не трогаем.

create or replace function auth_is_admin() returns boolean
language sql stable
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- projects
alter policy projects_write on public.projects
  with check (auth_role() = ANY (ARRAY['lead'::text, 'art_director'::text, 'ceo'::text]) OR auth_is_admin());

alter policy projects_update on public.projects
  using (auth_role() = ANY (ARRAY['lead'::text, 'art_director'::text, 'ceo'::text]) OR auth_is_admin());

alter policy projects_delete on public.projects
  using (auth_role() = ANY (ARRAY['lead'::text, 'art_director'::text, 'ceo'::text]) OR auth_is_admin());

-- frames
alter policy frames_insert on public.frames
  with check (auth_role() = ANY (ARRAY['lead'::text, 'art_director'::text, 'ceo'::text]) OR auth_is_admin());

alter policy frames_delete on public.frames
  using (auth_role() = ANY (ARRAY['lead'::text, 'art_director'::text, 'ceo'::text]) OR auth_is_admin());

-- frame_stages
alter policy stages_insert on public.frame_stages
  with check (auth_role() = ANY (ARRAY['lead'::text, 'art_director'::text, 'ceo'::text]) OR auth_is_admin());

alter policy stages_delete on public.frame_stages
  using (auth_role() = ANY (ARRAY['lead'::text, 'art_director'::text, 'ceo'::text]) OR auth_is_admin());

-- frame_comments
alter policy comments_delete on public.frame_comments
  using (auth_role() = ANY (ARRAY['art_director'::text, 'ceo'::text]) OR auth_is_admin());
