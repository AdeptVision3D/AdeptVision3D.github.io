-- Праздники РФ: таблица + настоящий фоновый планировщик (pg_cron), который
-- сам, без захода кого-либо на сайт, за 2-3 дня до праздника публикует
-- новость и отмечает день как объявленный (чтобы не задублировать пост).
-- Таблица полностью редактируемая (на случай переноса даты правительством
-- или если кто-то в этот день выходит отрабатывать — тогда строку можно
-- поправить/удалить прямо в интерфейсе, см. vacations.html).

-- ====== 1. Таблица праздников ======
create table if not exists public.company_holidays (
  id uuid primary key default gen_random_uuid(),
  holiday_date date not null unique,
  name text not null,
  is_day_off boolean not null default true,
  announced boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists company_holidays_date_idx on public.company_holidays(holiday_date);

alter table public.company_holidays enable row level security;

-- SELECT открыт всем (полная прозрачность, как и везде) — календарь отпусков
-- должен показывать праздники всем сотрудникам.
drop policy if exists company_holidays_select on public.company_holidays;
create policy company_holidays_select on public.company_holidays
  for select
  using (true);

-- Править список праздников могут те же роли, что управляют сотрудниками
-- (арт-директор/директор/админ) — это общекорпоративная настройка, не
-- повседневная задача тимлида.
drop policy if exists company_holidays_insert on public.company_holidays;
create policy company_holidays_insert on public.company_holidays
  for insert
  with check (auth_role() = ANY (ARRAY['art_director'::text, 'ceo'::text]) OR auth_is_admin());

drop policy if exists company_holidays_update on public.company_holidays;
create policy company_holidays_update on public.company_holidays
  for update
  using (auth_role() = ANY (ARRAY['art_director'::text, 'ceo'::text]) OR auth_is_admin());

drop policy if exists company_holidays_delete on public.company_holidays;
create policy company_holidays_delete on public.company_holidays
  for delete
  using (auth_role() = ANY (ARRAY['art_director'::text, 'ceo'::text]) OR auth_is_admin());

-- ====== 2. Сид на остаток 2026 и на 2027 ======
-- ВАЖНО: это базовые (незаменённые) даты по Трудовому кодексу РФ. Точный
-- перенос выходных дней на 2027 год правительство публикует отдельным
-- постановлением — когда оно выйдет, поправьте даты прямо в интерфейсе
-- (страница "Отпуска" → "Праздники"), таблица для этого и сделана
-- редактируемой.
insert into public.company_holidays (holiday_date, name) values
  ('2026-11-04', 'День народного единства'),
  ('2027-01-01', 'Новогодние каникулы'),
  ('2027-01-02', 'Новогодние каникулы'),
  ('2027-01-03', 'Новогодние каникулы'),
  ('2027-01-04', 'Новогодние каникулы'),
  ('2027-01-05', 'Новогодние каникулы'),
  ('2027-01-06', 'Новогодние каникулы'),
  ('2027-01-07', 'Рождество Христово'),
  ('2027-01-08', 'Новогодние каникулы'),
  ('2027-02-23', 'День защитника Отечества'),
  ('2027-03-08', 'Международный женский день'),
  ('2027-05-01', 'Праздник Весны и Труда'),
  ('2027-05-09', 'День Победы'),
  ('2027-06-12', 'День России'),
  ('2027-11-04', 'День народного единства')
on conflict (holiday_date) do nothing;

-- ====== 3. Функция объявления ======
-- За 2-3 дня до праздника (и не позже) публикует пост в новости и
-- отмечает праздник как объявленный, чтобы при следующем запуске не
-- продублировать. Автором ставим директора (или любого админа, если
-- директора в базе нет) — новости не могут быть без автора.
create or replace function public.announce_upcoming_holidays()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  h record;
  author_id uuid;
begin
  select id into author_id from public.profiles where role = 'ceo' and is_active = true order by created_at asc limit 1;
  if author_id is null then
    select id into author_id from public.profiles where is_admin = true order by created_at asc limit 1;
  end if;
  if author_id is null then
    return; -- некому подписать новость — пропускаем этот запуск, попробуем завтра
  end if;

  for h in
    select * from public.company_holidays
    where is_day_off = true
      and announced = false
      and holiday_date >= current_date
      and holiday_date <= current_date + interval '3 days'
  loop
    insert into public.company_news (title, body, pinned, created_by)
    values (
      'Скоро ' || h.name,
      h.name || ' — официальный выходной день (' || to_char(h.holiday_date, 'DD.MM.YYYY') || '). Хорошего отдыха! Если планируете в этот день работать — предупредите руководителя.',
      true,
      author_id
    );
    update public.company_holidays set announced = true where id = h.id;
  end loop;
end;
$$;

-- ====== 4. Планировщик (pg_cron) ======
-- Если это расширение ещё не включено в проекте, следующая строка может
-- потребовать один раз включить его вручную: Supabase Dashboard →
-- Database → Extensions → найти "pg_cron" → Enable, затем повторно
-- выполнить весь этот файл.
create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'announce-holidays-daily') then
    perform cron.unschedule('announce-holidays-daily');
  end if;
end $$;

-- Каждый день в 06:00 UTC (09:00 по Москве) — реальный фоновый планировщик
-- на стороне базы, не зависит от того, заходит кто-то на сайт или нет.
select cron.schedule('announce-holidays-daily', '0 6 * * *', $$select public.announce_upcoming_holidays();$$);
