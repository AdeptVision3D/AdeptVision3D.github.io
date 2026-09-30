-- Статус "решено" для лога ошибок — чтобы не удалять записи (историю багов
-- полезно сохранять), но и не держать пофикшенные ошибки на виду вперемешку
-- с новыми, из-за которых легко пропустить реально непофикшенное.
alter table public.error_logs add column if not exists resolved boolean not null default false;
alter table public.error_logs add column if not exists resolved_at timestamptz;
alter table public.error_logs add column if not exists resolved_by uuid references public.profiles(id);

-- Раньше на error_logs не было UPDATE-политики вообще (лог только писался
-- и удалялся) — без неё отметить ошибку решённой было бы невозможно,
-- RLS по умолчанию запрещает всё, что явно не разрешено.
drop policy if exists error_logs_update on public.error_logs;
create policy error_logs_update on public.error_logs
  for update
  using (auth_is_admin());
