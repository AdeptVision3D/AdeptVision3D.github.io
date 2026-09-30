-- Три инструмента для маркетолога, по запросу:
-- 1) Расходы на рекламу по каналам → CAC (считается на фронте в analytics.html
--    из этой таблицы + deals.source, в базе только сырые расходы).
-- 2) Пометка проектов как "кейс" для портфолио/соцсетей + описание.
-- 3) Контент-план — календарь публикаций.

-- ---------- 1. Расходы на рекламу ----------
create table if not exists public.marketing_expenses (
  id uuid primary key default gen_random_uuid(),
  channel text not null
    check (channel in ('website', 'instagram', 'referral', 'avito', 'cold_call', 'repeat_client', 'other')),
  amount numeric not null check (amount > 0),
  period_month date not null, -- всегда 1-е число месяца, к которому относится расход
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists marketing_expenses_period_idx on public.marketing_expenses (period_month);
create index if not exists marketing_expenses_channel_idx on public.marketing_expenses (channel);

alter table public.marketing_expenses enable row level security;

drop policy if exists marketing_expenses_select on public.marketing_expenses;
create policy marketing_expenses_select on public.marketing_expenses
  for select using (true);

-- В отличие от deal_payments (там сознательно разделены "занести" и
-- "исправить/удалить" — потому что платежи по сделке трогает много ролей,
-- есть риск подмены цифр задним числом), тут узкий круг и без конфликта
-- интересов: сам заводит расходы, сам может поправить свою же опечатку.
drop policy if exists marketing_expenses_insert on public.marketing_expenses;
create policy marketing_expenses_insert on public.marketing_expenses
  for insert with check (
    auth_role() = ANY (ARRAY['ceo'::text, 'art_director'::text, 'marketer'::text]) OR auth_is_admin()
  );

drop policy if exists marketing_expenses_update on public.marketing_expenses;
create policy marketing_expenses_update on public.marketing_expenses
  for update using (
    auth_role() = ANY (ARRAY['ceo'::text, 'art_director'::text, 'marketer'::text]) OR auth_is_admin()
  );

drop policy if exists marketing_expenses_delete on public.marketing_expenses;
create policy marketing_expenses_delete on public.marketing_expenses
  for delete using (
    auth_role() = ANY (ARRAY['ceo'::text, 'art_director'::text, 'marketer'::text]) OR auth_is_admin()
  );

-- ---------- 2. Кейсы/портфолио ----------
alter table public.projects add column if not exists is_case boolean not null default false;
alter table public.projects add column if not exists case_description text;
alter table public.projects add column if not exists case_tags text; -- простой список через запятую, без отдельной таблицы тегов — не тот масштаб

-- Обновлять эти три поля может тот же круг, что и остальной маркетинг —
-- это не производственные данные проекта, отдельная RLS на UPDATE по
-- конкретным колонкам в Postgres не делается, поэтому просто даём этим
-- ролям право на update всей строки проекта (как уже есть у lead/art_director/
-- ceo/admin) — маркетолог получает то же самое, но только на этот один
-- случай, а не на управление проектами в целом (в UI ему открыта только
-- страница "Кейсы", не общий дашборд проектов).
drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects
  for update using (
    auth_role() = ANY (ARRAY['lead'::text, 'art_director'::text, 'ceo'::text, 'marketer'::text]) OR auth_is_admin()
    OR (auth_role() = 'manager' AND created_by = auth.uid() AND approval_status = 'pending')
  );

-- ---------- 3. Контент-план ----------
create table if not exists public.content_plan (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  channel text not null default 'other'
    check (channel in ('instagram', 'website', 'vk', 'telegram', 'other')),
  planned_date date,
  status text not null default 'idea'
    check (status in ('idea', 'planned', 'ready', 'published')),
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists content_plan_planned_date_idx on public.content_plan (planned_date);
create index if not exists content_plan_status_idx on public.content_plan (status);

create or replace function public.set_content_plan_updated_at() returns trigger
language plpgsql
as $$
begin
  NEW.updated_at := now();
  return NEW;
end;
$$;

drop trigger if exists content_plan_set_updated_at on public.content_plan;
create trigger content_plan_set_updated_at
  before update on public.content_plan
  for each row execute function public.set_content_plan_updated_at();

alter table public.content_plan enable row level security;

drop policy if exists content_plan_select on public.content_plan;
create policy content_plan_select on public.content_plan
  for select using (true);

drop policy if exists content_plan_insert on public.content_plan;
create policy content_plan_insert on public.content_plan
  for insert with check (
    auth_role() = ANY (ARRAY['ceo'::text, 'art_director'::text, 'marketer'::text]) OR auth_is_admin()
  );

drop policy if exists content_plan_update on public.content_plan;
create policy content_plan_update on public.content_plan
  for update using (
    auth_role() = ANY (ARRAY['ceo'::text, 'art_director'::text, 'marketer'::text]) OR auth_is_admin()
  );

drop policy if exists content_plan_delete on public.content_plan;
create policy content_plan_delete on public.content_plan
  for delete using (
    auth_role() = ANY (ARRAY['ceo'::text, 'art_director'::text, 'marketer'::text]) OR auth_is_admin()
  );
