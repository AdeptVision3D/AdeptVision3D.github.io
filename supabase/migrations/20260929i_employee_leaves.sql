-- Отпуска и больничные сотрудников.
--
-- норма отпуска — фиксированное число дней в год на сотрудника (по
-- умолчанию 28, как в РФ по ТК), начисляется сразу с 1 января, без
-- накопления по месяцам. Остаток на клиенте считается как
-- vacation_days_per_year минус сумма дней уже взятых отпусков (type='vacation')
-- с start_date в текущем календарном году.
alter table public.profiles add column if not exists vacation_days_per_year integer not null default 28;

create table if not exists public.employee_leaves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('vacation', 'sick')),
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists employee_leaves_user_idx on public.employee_leaves(user_id);
create index if not exists employee_leaves_dates_idx on public.employee_leaves(start_date, end_date);

alter table public.employee_leaves enable row level security;

-- SELECT открыт всем авторизованным — как и остальные таблицы в проекте
-- (project_members, frames и т.д. используют тот же принцип полной
-- прозрачности с ограничением через UI, а не через RLS). Это нужно и
-- технически: чтобы в селекте назначения исполнителя на кадр/в команду
-- проекта можно было показать серым, кто сейчас в отпуске/на больничном,
-- даже если назначает не админ, а, например, тимлид.
-- На самой странице "Отпуска" полный календарь всей команды видят только
-- админы (ceo/art_director/is_admin) — это ограничение уже на уровне UI
-- (см. vacations.html), обычный сотрудник там видит только свою сводку.
drop policy if exists employee_leaves_select on public.employee_leaves;
create policy employee_leaves_select on public.employee_leaves
  for select
  using (true);

drop policy if exists employee_leaves_insert on public.employee_leaves;
create policy employee_leaves_insert on public.employee_leaves
  for insert
  with check (auth_role() = ANY (ARRAY['ceo'::text, 'art_director'::text]) OR auth_is_admin());

drop policy if exists employee_leaves_update on public.employee_leaves;
create policy employee_leaves_update on public.employee_leaves
  for update
  using (auth_role() = ANY (ARRAY['ceo'::text, 'art_director'::text]) OR auth_is_admin());

drop policy if exists employee_leaves_delete on public.employee_leaves;
create policy employee_leaves_delete on public.employee_leaves
  for delete
  using (auth_role() = ANY (ARRAY['ceo'::text, 'art_director'::text]) OR auth_is_admin());
