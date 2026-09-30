-- Уточнение к источнику лида: когда выбрано "Другое", даём необязательное
-- поле свободного текста — не плодим новые значения в check-constraint
-- ради редких случаев, но и не теряем детали.
alter table public.deals add column if not exists source_note text;
