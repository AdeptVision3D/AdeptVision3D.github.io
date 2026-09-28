-- Для "Моё" (личные задачи): у кадра появляется ответственный исполнитель.
-- Это ДОПОЛНЕНИЕ к команде проекта, а не замена — команда проекта решает,
-- кому проект виден/выделен, а assigned_to — кто именно отвечает за кадр.
alter table public.frames add column if not exists assigned_to uuid references public.profiles(id) on delete set null;

-- Для "Упоминаний" (@Имя в комментариях): список id упомянутых людей.
-- Заполняется на клиенте при отправке комментария (парсим "@Имя Фамилия" по
-- известным сотрудникам) — никакой отдельной логики на стороне базы не нужно.
alter table public.frame_comments add column if not exists mentions uuid[] not null default '{}';

-- Индекс для быстрой выборки "меня упомянули" на странице "Моё" (across всех комментариев)
create index if not exists frame_comments_mentions_idx on public.frame_comments using gin (mentions);

-- Индекс для быстрой выборки "мои кадры" на странице "Моё"
create index if not exists frames_assigned_to_idx on public.frames (assigned_to);
