# Автоматические бэкапы базы

Раз в день (03:00 UTC / 06:00 по Москве) GitHub Actions выгружает все таблицы
Supabase в JSON и сохраняет их в отдельном приватном репозитории —
это бесплатная замена платным автобэкапам Supabase Pro.

Файлы: `.github/workflows/backup.yml` (расписание) и `scripts/backup-supabase.js`
(сам скрипт выгрузки). Оба уже в этом репозитории и ничего дополнительно править
в них не нужно — но чтобы бэкап заработал, нужно один раз сделать 4 шага вручную.

## Шаг 1. Создать приватный репозиторий для бэкапов

1. Зайдите на github.com → New repository
2. Owner: `AdeptVision3D`, имя: `decard-backups`
3. **Обязательно Private** (там будут реальные данные сотрудников и проектов)
4. Create repository — больше туда ничего добавлять не нужно, файл README можно не создавать

## Шаг 2. Создать токен доступа к этому репозиторию

1. github.com → фото профиля (справа сверху) → Settings
2. Слева внизу → Developer settings → Personal access tokens → **Fine-grained tokens**
3. Generate new token
4. Resource owner: `AdeptVision3D`
5. Repository access: **Only select repositories** → выбрать `decard-backups`
6. Permissions → Repository permissions → **Contents: Read and write**
7. Generate token → скопировать значение (оно показывается один раз!)

## Шаг 3. Взять service role ключ Supabase

1. supabase.com/dashboard → ваш проект → Project Settings → API
2. Найти **service_role** (секретный, НЕ тот anon-ключ, что в common.js) → скопировать

⚠️ Этот ключ даёт полный доступ к базе в обход всех ограничений — держите его
только в секретах GitHub Actions, никогда не вставляйте в код сайта.

## Шаг 4. Добавить оба значения как секреты в этот репозиторий

1. В этом репозитории (`AdeptVision3D.github.io`) → Settings → Secrets and variables → Actions
2. New repository secret → имя `BACKUP_REPO_TOKEN`, значение — токен из шага 2
3. New repository secret → имя `SUPABASE_SERVICE_ROLE_KEY`, значение — ключ из шага 3

## Готово

После этого бэкап запустится автоматически по расписанию, а проверить/запустить
вручную можно во вкладке **Actions** этого репозитория → "Backup Supabase data" →
**Run workflow**.

Восстановление данных из бэкапа — это уже отдельная ручная операция (данные лежат
как JSON, их нужно будет загрузить обратно в Supabase через SQL/скрипт). Если
когда-нибудь понадобится — просто скажите, сделаем скрипт восстановления по факту,
когда он будет реально нужен.
