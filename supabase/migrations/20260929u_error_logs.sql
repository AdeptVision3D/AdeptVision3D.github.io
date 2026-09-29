-- Технический лог ошибок фронтенда: сайт сам себя "ведёт" — любая
-- необработанная JS-ошибка или отклонённый promise на любой странице
-- пишется сюда автоматически (см. common.js), чтобы у админа/того, кто
-- будет дальше сопровождать сайт, была реальная диагностика, а не только
-- то, что успел заметить и описать сам пользователь (для этого есть
-- отдельная ручная форма bug_reports).
create table if not exists public.error_logs (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  stack text,
  page text,
  url text,
  user_id uuid references public.profiles(id),
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists error_logs_created_at_idx on public.error_logs(created_at desc);

alter table public.error_logs enable row level security;

-- INSERT открыт всем (в том числе до входа в систему — ошибка может
-- случиться прямо на странице логина), это внутренний тех.лог, не
-- содержит чувствительных данных пользователей.
drop policy if exists error_logs_insert on public.error_logs;
create policy error_logs_insert on public.error_logs
  for insert
  with check (true);

-- SELECT/DELETE — только у админов (тех, кто реально будет сопровождать
-- сайт технически), остальным ролям эта информация не нужна и не должна
-- отвлекать/путать.
drop policy if exists error_logs_select on public.error_logs;
create policy error_logs_select on public.error_logs
  for select
  using (auth_is_admin());

drop policy if exists error_logs_delete on public.error_logs;
create policy error_logs_delete on public.error_logs
  for delete
  using (auth_is_admin());
