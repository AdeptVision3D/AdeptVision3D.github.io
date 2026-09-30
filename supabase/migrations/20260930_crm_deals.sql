-- Мини-CRM, вторая часть: сделки (deals) — то, что происходит ДО проекта.
--
-- Сейчас клиент — просто карточка контакта, а коммерческие условия (цена,
-- скидка, "это мы сделаем бесплатно") нигде не фиксируются — только в
-- голове менеджера и переписке с клиентом. Отсюда и жалоба: художник
-- узнаёт о бесплатной доработке постфактум, когда её уже не отменить.
--
-- Сделка проходит стадии lead -> negotiation -> proposal_sent -> won/lost.
-- Как только в сделке появляется скидка или бесплатный пункт — она
-- обязана пройти согласование (commercial_approval_status), и менеджер
-- НЕ может сам себя одобрить — это следит триггер ниже, а не просто
-- скрытая в интерфейсе кнопка (кнопку легко обойти прямым запросом к API,
-- триггер — нет).

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  title text not null,
  manager_id uuid not null references public.profiles(id),
  created_by uuid references public.profiles(id),

  stage text not null default 'lead'
    check (stage in ('lead', 'negotiation', 'proposal_sent', 'won', 'lost')),
  lost_reason text,

  price numeric,
  discount_percent numeric not null default 0,
  discount_amount numeric not null default 0,
  discount_reason text,
  free_items jsonb not null default '[]'::jsonb, -- [{ "title": "Доп. ракурс", "note": "..." }]

  -- 'none' — в сделке нет скидок/бесплатного, согласование не нужно.
  -- 'pending' -> 'approved'/'rejected' — выставляется и охраняется триггером.
  commercial_approval_status text not null default 'none'
    check (commercial_approval_status in ('none', 'pending', 'approved', 'rejected')),
  approved_by uuid references public.profiles(id),
  rejected_by uuid references public.profiles(id),
  rejection_note text,

  template_id uuid,
  checklist jsonb not null default '[]'::jsonb, -- [{ "text": "...", "done": false }] — снимок шаблона на момент создания

  project_id uuid references public.projects(id) on delete set null,
  next_followup_date date,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists deals_client_idx on public.deals (client_id);
create index if not exists deals_manager_idx on public.deals (manager_id);
create index if not exists deals_stage_idx on public.deals (stage);

-- Лог переписки/звонков/встреч — то самое "чтобы было на глазах". Не
-- автоматическая интеграция с почтой/мессенджером (для этого нужен был бы
-- отдельный сервис-коннектор к каждому каналу), а общая лента, куда
-- менеджер (и любой причастный) коротко заносит суть разговора сразу
-- после него — руководитель и художник видят её в карточке сделки.
create table if not exists public.deal_activities (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  kind text not null default 'note' check (kind in ('note', 'call', 'message', 'meeting', 'system')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists deal_activities_deal_idx on public.deal_activities (deal_id, created_at);

-- Шаблоны брифов/чек-листов для менеджеров — заполняются руководством,
-- используются менеджерами при заведении сделки.
create table if not exists public.deal_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  checklist jsonb not null default '[]'::jsonb, -- ["Уточнить адрес и корпус", "Сколько ракурсов?", ...]
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.deals add constraint deals_template_fk
  foreign key (template_id) references public.deal_templates(id) on delete set null;

-- ---------- Триггер: коммерческие условия сам себе менеджер не одобряет ----------
create or replace function public.guard_deal_commercial_terms() returns trigger
language plpgsql
as $$
declare
  is_approver boolean;
  terms_changed boolean;
  has_commercial boolean;
begin
  is_approver := (auth_role() = ANY (ARRAY['art_director'::text, 'ceo'::text]) OR auth_is_admin());

  if TG_OP = 'INSERT' then
    has_commercial := (coalesce(NEW.discount_percent, 0) > 0 OR coalesce(NEW.discount_amount, 0) > 0 OR jsonb_array_length(coalesce(NEW.free_items, '[]'::jsonb)) > 0);
    NEW.commercial_approval_status := case when has_commercial then 'pending' else 'none' end;
    NEW.approved_by := null;
    NEW.rejected_by := null;
    NEW.rejection_note := null;
    return NEW;
  end if;

  -- UPDATE:
  terms_changed := (
    coalesce(NEW.discount_percent, 0) <> coalesce(OLD.discount_percent, 0)
    OR coalesce(NEW.discount_amount, 0) <> coalesce(OLD.discount_amount, 0)
    OR coalesce(NEW.free_items, '[]'::jsonb) <> coalesce(OLD.free_items, '[]'::jsonb)
  );

  if terms_changed then
    -- Условия поменялись (кем угодно) — предыдущее согласование сгорает,
    -- нужно согласовывать заново. Это же не даёт обойти проверку, отправив
    -- в одном запросе новую скидку и сразу approved.
    has_commercial := (coalesce(NEW.discount_percent, 0) > 0 OR coalesce(NEW.discount_amount, 0) > 0 OR jsonb_array_length(coalesce(NEW.free_items, '[]'::jsonb)) > 0);
    NEW.commercial_approval_status := case when has_commercial then 'pending' else 'none' end;
    NEW.approved_by := null;
    NEW.rejected_by := null;
    NEW.rejection_note := null;
  else
    -- Условия те же — значит меняется именно статус согласования.
    -- Это разрешено только арт-директору/CEO/админу.
    if NEW.commercial_approval_status IS DISTINCT FROM OLD.commercial_approval_status
       OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
       OR NEW.rejected_by IS DISTINCT FROM OLD.rejected_by then
      if not is_approver then
        raise exception 'Только арт-директор, директор или админ может согласовывать скидки и бесплатные условия';
      end if;
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists deals_guard_commercial_terms on public.deals;
create trigger deals_guard_commercial_terms
  before insert or update on public.deals
  for each row execute function public.guard_deal_commercial_terms();

-- updated_at
create or replace function public.set_deal_updated_at() returns trigger
language plpgsql
as $$
begin
  NEW.updated_at := now();
  return NEW;
end;
$$;

drop trigger if exists deals_set_updated_at on public.deals;
create trigger deals_set_updated_at
  before update on public.deals
  for each row execute function public.set_deal_updated_at();

-- ---------- RLS ----------
alter table public.deals enable row level security;
alter table public.deal_activities enable row level security;
alter table public.deal_templates enable row level security;

-- deals: полная прозрачность на чтение (как везде в проекте) — это и есть
-- смысл всей затеи, чтобы условия сделки были видны всей команде, а не
-- только менеджеру и клиенту в переписке.
drop policy if exists deals_select on public.deals;
create policy deals_select on public.deals
  for select using (true);

drop policy if exists deals_insert on public.deals;
create policy deals_insert on public.deals
  for insert with check (
    auth_role() = ANY (ARRAY['manager'::text, 'lead'::text, 'art_director'::text, 'ceo'::text]) OR auth_is_admin()
  );

-- Менеджер редактирует свою сделку, пока она не выиграна (после этого
-- условия уже перенесены в проект и дальше живут там). Руководство —
-- всегда, включая согласование скидок (проверяется триггером выше).
drop policy if exists deals_update on public.deals;
create policy deals_update on public.deals
  for update using (
    auth_role() = ANY (ARRAY['lead'::text, 'art_director'::text, 'ceo'::text]) OR auth_is_admin()
    OR (auth_role() = 'manager' AND manager_id = auth.uid() AND stage <> 'won')
  );

-- Удалять сделки может только руководство — историю (в том числе
-- проигранные сделки) менеджер сам стереть не может.
drop policy if exists deals_delete on public.deals;
create policy deals_delete on public.deals
  for delete using (
    auth_role() = ANY (ARRAY['lead'::text, 'art_director'::text, 'ceo'::text]) OR auth_is_admin()
  );

-- deal_activities: тоже полная прозрачность на чтение, добавлять запись
-- может тот же круг, что и сделки, только от своего имени. Не редактируем
-- задним числом (это же протокол) — только удаление (своей записи или
-- руководством), например если ошиблись клиентом.
drop policy if exists deal_activities_select on public.deal_activities;
create policy deal_activities_select on public.deal_activities
  for select using (true);

drop policy if exists deal_activities_insert on public.deal_activities;
create policy deal_activities_insert on public.deal_activities
  for insert with check (
    author_id = auth.uid()
    AND (auth_role() = ANY (ARRAY['manager'::text, 'lead'::text, 'art_director'::text, 'ceo'::text]) OR auth_is_admin())
  );

drop policy if exists deal_activities_delete on public.deal_activities;
create policy deal_activities_delete on public.deal_activities
  for delete using (
    author_id = auth.uid()
    OR auth_role() = ANY (ARRAY['lead'::text, 'art_director'::text, 'ceo'::text]) OR auth_is_admin()
  );

-- deal_templates: читают все, создают/меняют — руководство (шаблоны
-- пишутся для менеджеров, а не менеджерами).
drop policy if exists deal_templates_select on public.deal_templates;
create policy deal_templates_select on public.deal_templates
  for select using (true);

drop policy if exists deal_templates_insert on public.deal_templates;
create policy deal_templates_insert on public.deal_templates
  for insert with check (
    auth_role() = ANY (ARRAY['lead'::text, 'art_director'::text, 'ceo'::text]) OR auth_is_admin()
  );

drop policy if exists deal_templates_update on public.deal_templates;
create policy deal_templates_update on public.deal_templates
  for update using (
    auth_role() = ANY (ARRAY['lead'::text, 'art_director'::text, 'ceo'::text]) OR auth_is_admin()
  );

drop policy if exists deal_templates_delete on public.deal_templates;
create policy deal_templates_delete on public.deal_templates
  for delete using (
    auth_role() = ANY (ARRAY['lead'::text, 'art_director'::text, 'ceo'::text]) OR auth_is_admin()
  );
