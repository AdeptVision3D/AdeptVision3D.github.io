-- Три доработки аналитики: Финансы, Качество, экспорт.
-- Экспорт — чисто фронтенд (CSV/печать), в базе для него ничего не нужно.
--
-- 1) Финансы: в deals уже есть price/discount — это ДОГОВОРЁННАЯ сумма,
--    но нет ни одного места, где фиксируется реально ПОЛУЧЕННАЯ оплата.
--    Добавляем deal_payments — по сути приходный кассовый ордер, привязанный
--    к сделке. Это позволяет считать "выручка / получено / дебиторка".
--
-- 2) Качество, часть А — рейтинг клиента: полей для оценки нигде не было.
--    Клиент в портал не заходит, поэтому оценку проставляет сотрудник
--    (менеджер/арт-директор) после сдачи проекта — это внутренняя фиксация
--    обратной связи, а не самооценка клиента через форму.
--
-- 3) Качество, часть Б — "правки после сдачи". Просто взять все правки
--    (frame_stages.stage_type in paid_revision/free_revision) недостаточно:
--    часть правок случается ДО сдачи, в процессе обычной работы, и это
--    нормально. Нужно различать. Момент сдачи — это когда projects.completed
--    становится true. Поэтому вместо того чтобы гадать про created_at в
--    frame_stages (структура которой заведена не через миграции, а руками
--    в Supabase, и точный набор колонок не гарантирован), помечаем это
--    ПРЯМО в момент создания правки: триггер на insert в frame_stages
--    смотрит, завершён ли уже проект этого кадра, и если да — ставит
--    is_post_delivery = true. Это надёжнее, чем сравнение дат задним числом.

-- ---------- 1. Платежи по сделке ----------
create table if not exists public.deal_payments (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  amount numeric not null check (amount > 0),
  payment_date date not null default current_date,
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists deal_payments_deal_idx on public.deal_payments (deal_id);
create index if not exists deal_payments_date_idx on public.deal_payments (payment_date);

alter table public.deal_payments enable row level security;

-- Читают все (та же прозрачность, что и везде).
drop policy if exists deal_payments_select on public.deal_payments;
create policy deal_payments_select on public.deal_payments
  for select using (true);

-- Заносить оплату может тот же круг, что работает со сделками.
drop policy if exists deal_payments_insert on public.deal_payments;
create policy deal_payments_insert on public.deal_payments
  for insert with check (
    auth_role() = ANY (ARRAY['manager'::text, 'lead'::text, 'art_director'::text, 'ceo'::text]) OR auth_is_admin()
  );

-- А вот менять/удалять уже занесённую запись об оплате — только
-- руководство. Это финансовая запись, "поправить самому себе" здесь
-- не должно быть проще, чем со скидками.
drop policy if exists deal_payments_update on public.deal_payments;
create policy deal_payments_update on public.deal_payments
  for update using (
    auth_role() = ANY (ARRAY['lead'::text, 'art_director'::text, 'ceo'::text]) OR auth_is_admin()
  );

drop policy if exists deal_payments_delete on public.deal_payments;
create policy deal_payments_delete on public.deal_payments
  for delete using (
    auth_role() = ANY (ARRAY['lead'::text, 'art_director'::text, 'ceo'::text]) OR auth_is_admin()
  );

-- ---------- 2. Рейтинг клиента + момент сдачи проекта ----------
alter table public.projects add column if not exists completed_at timestamptz;
alter table public.projects add column if not exists client_rating smallint
  check (client_rating between 1 and 5);
alter table public.projects add column if not exists client_feedback text;

create or replace function public.set_project_completed_at() returns trigger
language plpgsql
as $$
begin
  if NEW.completed IS DISTINCT FROM OLD.completed then
    if NEW.completed then
      NEW.completed_at := now();
    else
      NEW.completed_at := null; -- вернули в работу — метка сдачи больше не актуальна
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists projects_set_completed_at on public.projects;
create trigger projects_set_completed_at
  before update on public.projects
  for each row execute function public.set_project_completed_at();

-- ---------- 3. Правки после сдачи ----------
alter table public.frame_stages add column if not exists is_post_delivery boolean not null default false;

create or replace function public.mark_post_delivery_revision() returns trigger
language plpgsql
as $$
declare
  project_completed boolean;
begin
  if NEW.stage_type in ('paid_revision', 'free_revision') then
    select p.completed into project_completed
    from public.frames f
    join public.projects p on p.id = f.project_id
    where f.id = NEW.frame_id;

    NEW.is_post_delivery := coalesce(project_completed, false);
  end if;
  return NEW;
end;
$$;

drop trigger if exists frame_stages_mark_post_delivery on public.frame_stages;
create trigger frame_stages_mark_post_delivery
  before insert on public.frame_stages
  for each row execute function public.mark_post_delivery_revision();
