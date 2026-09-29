-- Лента новостей/объявлений компании — первый модуль "корпоративного портала"
-- поверх трекера производства. Публиковать могут только руководители
-- (ceo/art_director/is_admin — тот же круг, что управляет сотрудниками),
-- читают все. Закреплённые новости (pinned) всегда идут первыми.
create table if not exists public.company_news (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  pinned boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists company_news_created_idx on public.company_news(created_at desc);

alter table public.company_news enable row level security;

drop policy if exists company_news_select on public.company_news;
create policy company_news_select on public.company_news
  for select
  using (true);

drop policy if exists company_news_insert on public.company_news;
create policy company_news_insert on public.company_news
  for insert
  with check (auth_role() = ANY (ARRAY['ceo'::text, 'art_director'::text]) OR auth_is_admin());

drop policy if exists company_news_update on public.company_news;
create policy company_news_update on public.company_news
  for update
  using (auth_role() = ANY (ARRAY['ceo'::text, 'art_director'::text]) OR auth_is_admin());

drop policy if exists company_news_delete on public.company_news;
create policy company_news_delete on public.company_news
  for delete
  using (auth_role() = ANY (ARRAY['ceo'::text, 'art_director'::text]) OR auth_is_admin());
