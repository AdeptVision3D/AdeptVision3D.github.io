-- Согласование отпуска: тимлид подаёт заявку → арт-директор одобряет →
-- директор утверждает. Существующие записи (все раньше создавались
-- напрямую ceo/art_director/админом) остаются со статусом 'approved' —
-- обратная совместимость, ничего не ломаем задним числом.
alter table public.employee_leaves add column if not exists status text not null default 'approved'
  check (status in ('pending', 'awaiting_ceo', 'approved', 'rejected'));
alter table public.employee_leaves add column if not exists approved_by_art_director uuid references public.profiles(id);
alter table public.employee_leaves add column if not exists approved_by_ceo uuid references public.profiles(id);
alter table public.employee_leaves add column if not exists rejected_by uuid references public.profiles(id);
alter table public.employee_leaves add column if not exists rejection_note text;

-- INSERT теперь открыт и тимлидам (раньше могли только ceo/art_director/админ) —
-- именно тимлид инициирует заявку. Кто именно может её создать и с каким
-- стартовым статусом (pending / awaiting_ceo / approved) — решает клиент по
-- роли создателя, RLS здесь намеренно не детализирует переходы статусов
-- (тот же принцип "разрешаем широко, логику решает UI", что и везде в проекте).
drop policy if exists employee_leaves_insert on public.employee_leaves;
create policy employee_leaves_insert on public.employee_leaves
  for insert
  with check (auth_role() = ANY (ARRAY['lead'::text, 'art_director'::text, 'ceo'::text]) OR auth_is_admin());

drop policy if exists employee_leaves_update on public.employee_leaves;
create policy employee_leaves_update on public.employee_leaves
  for update
  using (auth_role() = ANY (ARRAY['lead'::text, 'art_director'::text, 'ceo'::text]) OR auth_is_admin());

-- DELETE: автор заявки может отменить свою (например, тимлид передумал,
-- пока она ещё не согласована), либо арт-директор/ceo/админ — в любой момент.
drop policy if exists employee_leaves_delete on public.employee_leaves;
create policy employee_leaves_delete on public.employee_leaves
  for delete
  using (created_by = auth.uid() OR auth_role() = ANY (ARRAY['art_director'::text, 'ceo'::text]) OR auth_is_admin());
