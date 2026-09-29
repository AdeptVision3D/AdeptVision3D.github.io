-- Проект, заведённый менеджером, не запускается в производство сразу —
-- нужно подтверждение директора (CEO). Проекты, заведённые тимлидом/
-- арт-директором/ceo/админом, как и раньше запускаются сразу
-- (approval_status по умолчанию 'approved' — обратная совместимость,
-- ничего не меняется для существующего потока).
alter table public.projects add column if not exists created_by uuid references public.profiles(id);
alter table public.projects add column if not exists approval_status text not null default 'approved'
  check (approval_status in ('pending', 'approved', 'rejected'));
alter table public.projects add column if not exists approved_by uuid references public.profiles(id);
alter table public.projects add column if not exists rejected_by uuid references public.profiles(id);
alter table public.projects add column if not exists rejection_note text;

-- SELECT: проект в статусе pending не показываем всей компании (в отличие
-- от обычной "полной прозрачности" — здесь это черновик сделки, ещё не
-- решение) — видит только автор и директор/арт-директор/админ, которые
-- должны его согласовать. Как только approval_status != 'pending' —
-- видимость снова полностью открыта, как и для всех остальных проектов.
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects
  for select
  using (
    approval_status <> 'pending'
    OR created_by = auth.uid()
    OR auth_role() = ANY (ARRAY['ceo'::text, 'art_director'::text])
    OR auth_is_admin()
  );

-- DELETE: менеджер может убрать свою заявку на проект, пока её не
-- одобрили (например, сделка сорвалась) — остальным ролям права не меняем.
drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects
  for delete
  using (
    auth_role() = ANY (ARRAY['lead'::text, 'art_director'::text, 'ceo'::text]) OR auth_is_admin()
    OR (auth_role() = 'manager' AND created_by = auth.uid() AND approval_status <> 'approved')
  );

-- UPDATE: менеджер может поправить свою заявку, пока она ждёт решения
-- (например, опечатался в названии) — после одобрения проект переходит
-- в ведение производства, менеджер его больше не редактирует.
drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects
  for update
  using (
    auth_role() = ANY (ARRAY['lead'::text, 'art_director'::text, 'ceo'::text]) OR auth_is_admin()
    OR (auth_role() = 'manager' AND created_by = auth.uid() AND approval_status = 'pending')
  );
