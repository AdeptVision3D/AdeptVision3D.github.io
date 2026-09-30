-- frame_activity_log.actor_name был обычным текстовым полем, которое
-- клиент передавал сам (см. logFrameActivity/logProjectActivity в
-- common.js) — никак не сверялось с тем, кто реально залогинен. Любой,
-- у кого есть открытая INSERT-политика на эту таблицу (а она открыта
-- всем), мог отправить прямой запрос к API и вписать в историю кадра
-- действие от чужого имени. Это единственное подобие журнала аудита в
-- приложении — доверять ему в таком виде нельзя.
--
-- Чиним триггером: имя автора теперь всегда берётся на стороне базы из
-- auth.uid() (по текущей сессии), а не из того, что прислал клиент.
-- Плюс сохраняем сам auth.uid() в actor_id — по нему можно будет надёжно
-- связать запись с профилем, а не полагаться на текстовое совпадение имён.
alter table public.frame_activity_log add column if not exists actor_id uuid references public.profiles(id);

create or replace function public.set_activity_log_actor() returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  NEW.actor_id := auth.uid();
  -- auth.uid() may be null only for a service-role insert (no user session) —
  -- в этом случае оставляем то, что прислали (например, серверный скрипт).
  -- Во всех остальных случаях имя всегда берётся из профиля, а не с клиента.
  if auth.uid() is not null then
    select full_name into NEW.actor_name from public.profiles where id = auth.uid();
  end if;
  return NEW;
end;
$$;

drop trigger if exists frame_activity_log_set_actor on public.frame_activity_log;
create trigger frame_activity_log_set_actor
  before insert on public.frame_activity_log
  for each row execute function public.set_activity_log_actor();
