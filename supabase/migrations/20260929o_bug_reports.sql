-- Сообщения об ошибках от пользователей. Любой сотрудник может сообщить
-- о баге прямо со страницы, где его встретил; страница подставляется
-- автоматически, руководители видят очередь и меняют статус по мере
-- разбора. SELECT открыт всем (та же "полная прозрачность", что и везде
-- в проекте) — автор видит, взяли ли его сообщение в работу, остальные
-- не дублируют уже заведённые баги.
create table if not exists public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  reported_by uuid not null references public.profiles(id),
  page text,
  description text not null,
  status text not null default 'new' check (status in ('new', 'in_progress', 'resolved')),
  resolved_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists bug_reports_created_idx on public.bug_reports(created_at desc);

alter table public.bug_reports enable row level security;

drop policy if exists bug_reports_select on public.bug_reports;
create policy bug_reports_select on public.bug_reports
  for select
  using (true);

-- Завести сообщение может кто угодно, но только от своего имени —
-- reported_by всегда сам автор, подделать чужой id нельзя.
drop policy if exists bug_reports_insert on public.bug_reports;
create policy bug_reports_insert on public.bug_reports
  for insert
  with check (reported_by = auth.uid());

-- Менять статус (взять в работу / закрыть) — тимлид и выше, они ближе
-- всего к продакшну и обычно первыми узнают о технических проблемах.
drop policy if exists bug_reports_update on public.bug_reports;
create policy bug_reports_update on public.bug_reports
  for update
  using (auth_role() = ANY (ARRAY['lead'::text, 'art_director'::text, 'ceo'::text]) OR auth_is_admin());

-- Удалить может автор (например, создал по ошибке/дубль) либо
-- арт-директор/ceo/админ.
drop policy if exists bug_reports_delete on public.bug_reports;
create policy bug_reports_delete on public.bug_reports
  for delete
  using (reported_by = auth.uid() OR auth_role() = ANY (ARRAY['art_director'::text, 'ceo'::text]) OR auth_is_admin());
