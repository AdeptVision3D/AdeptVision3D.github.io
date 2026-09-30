-- Донастройка CRM-сделок по обсуждению "что нужно менеджерам в базе":
-- 1) источник лида — без этого нельзя понять, какой канал вообще
--    приносит клиентов;
-- 2) причина отказа — фиксированный список вместо произвольного текста,
--    чтобы его можно было посчитать (иначе через месяц будет 20 разных
--    формулировок одного и того же);
-- 3) "следующий шаг" отдельно от даты follow-up — дата без текста ни о
--    чём не напомнит через неделю;
-- 4) won_at/lost_at — метки времени попадания в финальную стадию, нужны
--    для аналитики "сколько дней в среднем идёт сделка до закрытия"
--    (updated_at для этого не годится — она едет при любой правке).

alter table public.deals add column if not exists source text
  check (source in ('website', 'instagram', 'referral', 'avito', 'cold_call', 'repeat_client', 'other'));

alter table public.deals add column if not exists lost_reason_category text
  check (lost_reason_category in ('price', 'no_response', 'chose_competitor', 'timing', 'budget_cut', 'not_relevant', 'other'));

alter table public.deals add column if not exists next_action text;

alter table public.deals add column if not exists won_at timestamptz;
alter table public.deals add column if not exists lost_at timestamptz;

create index if not exists deals_source_idx on public.deals (source);
create index if not exists deals_lost_reason_category_idx on public.deals (lost_reason_category);

-- Простая защита от дублей клиентов по телефону — сравниваем только цифры,
-- чтобы "+7 (999) 123-45-67" и "89991234567" считались одним номером.
create index if not exists clients_phone_digits_idx on public.clients ((regexp_replace(coalesce(phone, ''), '\D', '', 'g')));

create or replace function public.set_deal_stage_timestamps() returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'INSERT' then
    if NEW.stage = 'won' then NEW.won_at := now(); end if;
    if NEW.stage = 'lost' then NEW.lost_at := now(); end if;
    return NEW;
  end if;

  if NEW.stage IS DISTINCT FROM OLD.stage then
    if NEW.stage = 'won' then
      NEW.won_at := now();
    elsif OLD.stage = 'won' then
      NEW.won_at := null; -- сделку открыли заново — старая метка закрытия больше не актуальна
    end if;

    if NEW.stage = 'lost' then
      NEW.lost_at := now();
    elsif OLD.stage = 'lost' then
      NEW.lost_at := null;
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists deals_set_stage_timestamps on public.deals;
create trigger deals_set_stage_timestamps
  before insert or update on public.deals
  for each row execute function public.set_deal_stage_timestamps();
