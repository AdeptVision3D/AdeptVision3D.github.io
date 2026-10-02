# Пересоздаёт docs/CODE-MAP.md — указатель страниц, функций и таблиц.
# Запуск (из корня проекта):  powershell -ExecutionPolicy Bypass -File scripts/make-code-map.ps1
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root
New-Item -ItemType Directory -Force docs | Out-Null
$sb = New-Object Text.StringBuilder
function L([string]$s) { [void]$sb.AppendLine($s) }
L '# Карта кода Decard Studio'
L ''
L 'Автогенерируемый указатель: где что лежит. Нужен, чтобы находить нужное место без чтения больших файлов.'
L 'Обновление: `powershell -ExecutionPolicy Bypass -File scripts/make-code-map.ps1` после крупных правок.'
L ''
L '## Устройство'
L '- Сайт статический (GitHub Pages) + Supabase (база, вход, Edge-функция `supabase/functions/bright-api`).'
L '- Каждая страница = `страница.html` (разметка) + `css/страница.css` + `js/страница.js`. Общее лежит в корне.'
L '- Общие файлы: `common.js` (вход, роли, права, журнал ошибок, тосты, тема), `icons.js` (иконки `ICON`), `reminders.js` (колокольчик и напоминания), `styles.css` (базовые стили), `glass.css` + `glass.js` + `glass-fx.js` (дизайн «жидкое стекло», поиск Ctrl+K, подсказки, эффекты).'
L '- Версии файлов — в query-параметрах `?v=...` в HTML (при правке файла поднимать версию во всех страницах).'
L '- База: `supabase/migrations/*.sql` (по порядку имён). Права — через RLS-политики + функции `canXxx()` в `common.js`.'
L '- Бэкап базы: `.github/workflows/backup.yml` + `scripts/backup-supabase.js` (ежедневно, в репозиторий `decard-backups`).'
L '- Роли: artist, lead, art_director, ceo, manager, marketer (+ флаг `is_admin`). Таблица ролей: `public.roles`.'
L ''
L '## Страницы'
foreach ($h in Get-ChildItem *.html | Sort-Object Name) {
  $name = [IO.Path]::GetFileNameWithoutExtension($h.Name)
  $ht = [IO.File]::ReadAllText($h.FullName,[Text.Encoding]::UTF8)
  $title = ([regex]::Match($ht,'<title>(.*?)</title>')).Groups[1].Value -replace '^Decard Studio — ',''
  $jsFile = "js/$name.js"
  L ("### {0} — {1}" -f $h.Name, $title)
  L ("Файлы: ``{0}`` · ``css/{1}.css`` · ``{2}``" -f $h.Name, $name, $jsFile)
  if (Test-Path $jsFile) {
    $lines = [IO.File]::ReadAllLines((Resolve-Path $jsFile).Path, [Text.Encoding]::UTF8)
    $fns = @(); $tables = @{}
    for ($i=0; $i -lt $lines.Count; $i++) {
      $m = [regex]::Match($lines[$i], '^\s{0,12}(?:async\s+)?function\s+(\w+)')
      if ($m.Success) { $fns += ("{0}:{1}" -f $m.Groups[1].Value, ($i+1)) }
      foreach ($tm in [regex]::Matches($lines[$i], "\.from\('(\w+)'\)")) { $tables[$tm.Groups[1].Value] = 1 }
    }
    L ("Таблицы: {0}" -f (($tables.Keys | Sort-Object) -join ', '))
    L ("Функции ({0} КБ, формат имя:строка): {1}" -f [math]::Round((Get-Item $jsFile).Length/1KB,0), ($fns -join ', '))
  }
  L ''
}
L '## Общие файлы: функции'
foreach ($f in 'common.js','reminders.js','glass.js','glass-fx.js') {
  $lines = [IO.File]::ReadAllLines((Resolve-Path $f).Path, [Text.Encoding]::UTF8)
  $fns = @()
  for ($i=0; $i -lt $lines.Count; $i++) { $m = [regex]::Match($lines[$i], '^\s{0,4}(?:async\s+)?function\s+(\w+)'); if ($m.Success) { $fns += ("{0}:{1}" -f $m.Groups[1].Value, ($i+1)) } }
  L ("### {0} ({1} КБ)" -f $f, [math]::Round((Get-Item $f).Length/1KB,0))
  L ($fns -join ', ')
  L ''
}
L '## Миграции базы'
L (((Get-ChildItem supabase\migrations\*.sql | Sort-Object Name | ForEach-Object { $_.Name }) -join "`r`n"))
[IO.File]::WriteAllText((Join-Path $root 'docs\CODE-MAP.md'), $sb.ToString(), (New-Object Text.UTF8Encoding($false)))
'Готово: docs/CODE-MAP.md'