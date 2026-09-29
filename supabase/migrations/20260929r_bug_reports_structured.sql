-- Делаем сообщение об ошибке структурированным: вместо (или в дополнение к)
-- свободному тексту — категория и срочность из фиксированного списка. Так
-- по тикету сразу видно, что случилось и насколько горит, не читая текст.
-- description теперь необязателен — это просто уточняющий комментарий.
alter table public.bug_reports add column if not exists category text not null default 'other'
  check (category in ('save_error', 'load_error', 'button_broken', 'wrong_data', 'visual', 'access', 'other'));
alter table public.bug_reports add column if not exists priority text not null default 'medium'
  check (priority in ('critical', 'medium', 'low'));
alter table public.bug_reports alter column description drop not null;
