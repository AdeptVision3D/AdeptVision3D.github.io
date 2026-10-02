// ============================================================
// Decard Studio — общие функции для всех страниц (login/index/project/frame)
// Раньше этот код был продублирован в каждом HTML-файле по отдельности:
// правка в одном месте (например, в showToast) не долетала до остальных
// страниц, если про неё забывали. Теперь это единственная копия.
//
// ВАЖНО: все HTML-страницы подключают этот файл как
// <script src="common.js?v=XXXXXXXX"></script> — версия в query-параметре
// нужна для сброса кэша браузера/CDN GitHub Pages. Без нового "v=" после
// правки в common.js часть пользователей ещё долго будет получать старую
// версию файла и ловить "ReferenceError: ... is not defined" на новых
// функциях. ПРИ КАЖДОМ ИЗМЕНЕНИИ ЭТОГО ФАЙЛА — бампать "?v=" во всех
// HTML-файлах на новое значение (проще всего — на дату+суффикс миграции).
// Специфичная для конкретной страницы логика (загрузка данных, рендер
// карточек и т.д.) остаётся в <script> самой страницы.
// ============================================================

// ====== ПОДКЛЮЧЕНИЕ К SUPABASE ======
const SUPABASE_URL = 'https://mcpsnmcvzxzdgllhbrib.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ouAuh1fPBDLo3bLxs4FnLA_dJwIN-Un';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
// =====================================

const roleLabels = { artist: 'Художник', lead: 'Тимлид', art_director: 'Арт-директор', ceo: 'Генеральный директор', manager: 'Менеджер', marketer: 'Маркетолог' };

// Источник лида и причина отказа — фиксированные списки (см. check-constraint
// в БД), чтобы их можно было считать в аналитике, а не разбирать десятки
// вариантов свободного текста.
const DEAL_SOURCE_LABELS = {
    website: 'Сайт', instagram: 'Instagram', referral: 'Рекомендация',
    avito: 'Авито', cold_call: 'Холодный обзвон', repeat_client: 'Повторный клиент', other: 'Другое'
};
const DEAL_LOST_REASON_LABELS = {
    price: 'Дорого', no_response: 'Пропал на связи', chose_competitor: 'Выбрал другую студию',
    timing: 'Не подошли сроки', budget_cut: 'Урезали бюджет', not_relevant: 'Проект не состоялся', other: 'Другое'
};

// PWA: регистрируем service worker на всех страницах, чтобы сайт можно было
// "установить" на телефон/десктоп (иконка на главном экране, отдельное окно).
// Сам sw.js ничего не кеширует — см. комментарий в файле.
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(err => console.error('SW registration failed', err));
    });
}

// ====== АВТОМАТИЧЕСКИЙ ЛОГ ОШИБОК ======
// Сайт "ведёт" сам себя: любая необработанная JS-ошибка или отклонённый
// promise на любой странице (включая login.html, до входа в систему)
// автоматически пишется в error_logs — реальная техническая диагностика
// для админа/того, кто будет дальше сопровождать сайт, без необходимости
// просить пользователя описать словами, что именно сломалось. Смотреть
// эти записи можно на странице error-console.html (только для is_admin).
const _loggedErrorKeys = new Set(); // не долбим одну и ту же ошибку в error_logs много раз за одну загрузку страницы
async function logClientError(message, stack) {
    try {
        const text = String(message || 'Неизвестная ошибка').slice(0, 2000);
        const key = text + '|' + String(stack || '').slice(0, 300);
        if (_loggedErrorKeys.has(key)) return;
        _loggedErrorKeys.add(key);
        await supabaseClient.from('error_logs').insert({
            message: text,
            stack: stack ? String(stack).slice(0, 4000) : null,
            page: (location.pathname.split('/').pop() || 'index.html'),
            url: location.href,
            user_id: (typeof currentUser !== 'undefined' && currentUser && currentUser.id) ? currentUser.id : null,
            user_agent: navigator.userAgent
        });
    } catch (e) {
        // логирование ошибок намеренно не должно порождать собственные ошибки/тосты
    }
}
window.addEventListener('error', function(event) {
    logClientError(event.message, event.error && event.error.stack ? event.error.stack : null);
});
window.addEventListener('unhandledrejection', function(event) {
    const reason = event.reason;
    const message = reason && reason.message ? reason.message : String(reason);
    const stack = reason && reason.stack ? reason.stack : null;
    logClientError(message, stack);
});
// window.onerror/unhandledrejection ловят только НЕОБработанные исключения —
// то есть баги в самом JS-коде. А подавляющее большинство реальных ошибок в
// проекте — это ошибки Supabase (RLS, check-constraint и т.п.), которые код
// уже осознанно ловит паттерном "const { error } = await supabase...; if
// (error) { console.error(error); showToast(...) }". Такая ошибка — не
// исключение, а обычный объект, который выводят в консоль и на этом всё:
// до error_logs она никогда не доходила (это и произошло с ошибкой
// "profiles_role_check" — она была поймана и показана тостом, но не
// записана). Перехватываем console.error, чтобы ловить и такие тоже.
const _origConsoleError = console.error.bind(console);
console.error = function(...args) {
    _origConsoleError(...args);
    try {
        const first = args[0];
        let message, stack;
        if (first instanceof Error) {
            message = first.message;
            stack = first.stack;
        } else if (first && typeof first === 'object') {
            // Форма ошибок Supabase: { message, details, hint, code }
            message = first.message || first.error_description || JSON.stringify(first).slice(0, 500);
            const parts = [first.code ? 'code: ' + first.code : null, first.details ? 'details: ' + first.details : null, first.hint ? 'hint: ' + first.hint : null].filter(Boolean);
            stack = parts.length > 0 ? parts.join('; ') : null;
        } else {
            message = args.map(a => String(a)).join(' ');
            stack = null;
        }
        logClientError(message, stack);
    } catch (e) {
        // логирование ошибок намеренно не должно порождать собственные ошибки
    }
};
// =========================================

// Отдельный флаг "админ-доступа" в profiles.is_admin — даёт полный доступ ко всем
// панелям НЕЗАВИСИМО от роли в профиле. Нужен, например, когда роль в профиле
// отражает реальную должность человека (скажем, "Художник"), но ему всё равно
// нужен полный доступ для тестирования/отладки. Используется вместе с проверками
// по роли (через ||), а не вместо них — обычным сотрудникам ничего не открывает.
function hasAdminAccess(user) { return !!(user && user.is_admin); }
// Принимаем только http(s)-ссылки — защита от javascript:-ссылок в данных (ссылки на Holst и т.п.)
function safeHttpUrl(raw) {
    if (!raw) return '';
    let u;
    try { u = new URL(/^https?:\/\//i.test(String(raw).trim()) ? String(raw).trim() : 'https://' + String(raw).trim()); } catch (e) { return ''; }
    return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : '';
}
// Библиотека иконок ICON вынесена в icons.js (подключается отдельным <script> на странице).


// Единая проверка ролей для пунктов сайдбара — та же логика, что раньше была
// продублирована в applyRolePermissions() на index.html. canManageProjectsRole
// решает доступ к "Аналитике" (тимлид и выше), canManageEmployeesRole — к
// "Сотрудникам" (тимлид, арт-директор, CEO, админ — по решению Леонида).
function canManageProjectsRole(user) {
    return !!(user && (hasAdminAccess(user) || ['lead', 'art_director', 'ceo'].includes(user.role)));
}
function canManageEmployeesRole(user) {
    return !!(user && (hasAdminAccess(user) || ['lead', 'art_director', 'ceo'].includes(user.role)));
}
// Отдельная проверка для раздела "Клиенты": помимо руководителей производства
// (canManageProjectsRole), сюда же пускаем менеджеров — они ведут свои сделки,
// но не управляют проектами/аналитикой, поэтому не годится расширять
// canManageProjectsRole целиком (это открыло бы им и другие разделы).
function canAccessClients(user) {
    return !!(user && (hasAdminAccess(user) || ['lead', 'art_director', 'ceo', 'manager'].includes(user.role)));
}
// Сделки (CRM-пайплайн) доступны тому же кругу, что и карточки клиентов —
// менеджеры их ведут, руководство видит и согласовывает.
function canAccessDeals(user) {
    return canAccessClients(user);
}
// Согласовывать скидки/бесплатные условия в сделке может только
// арт-директор, CEO или админ — тимлид сюда намеренно не входит (он может
// заводить и вести сделки как менеджер, но не одобрять чужие уступки
// клиенту), это же ограничение зашито триггером в базе на случай прямого
// запроса к API в обход интерфейса.
function canApproveCommercial(user) {
    return !!(user && (hasAdminAccess(user) || ['art_director', 'ceo'].includes(user.role)));
}
// Кто может заводить/редактировать шаблоны брифов для менеджеров.
function canManageDealTemplates(user) {
    return canManageProjectsRole(user);
}
// Заносить оплату по сделке может тот же круг, что ведёт сделки, а вот
// исправлять/удалять уже внесённую запись — только руководство (это
// финансовая запись, отдельно охраняется RLS в базе).
function canAddDealPayment(user) {
    return canAccessDeals(user);
}
function canEditDealPayment(user) {
    return canManageProjectsRole(user);
}
// Маркетолог — узкая роль без доступа к проектам/клиентам/сотрудникам:
// только аналитика (посмотреть, куда идёт трафик и что с деньгами) и
// публикация новостей компании. Не расширяем canManageProjectsRole и т.п.,
// чтобы не дать лишнего доступа туда, где он не нужен и не спрашивался.
// Доступ к Аналитике — те же роли, что управляют проектами, плюс маркетолог
// (единая функция, используется и в гейте пункта меню, и на самой странице,
// чтобы не разъезжались два независимых списка ролей).
function canViewAnalytics(user) {
    return !!(user && (hasAdminAccess(user) || ['lead', 'art_director', 'ceo', 'marketer'].includes(user.role)));
}
// Публиковать/редактировать новости — те же роли, что и раньше (ceo/
// art_director/admin, см. RLS в 20260929j_company_news.sql), плюс маркетолог.
// Раньше кнопка в интерфейсе ориентировалась на canManageEmployeesRole
// (lead и выше), а RLS этого не разрешал — тимлид видел кнопку "Добавить",
// но получал ошибку при сохранении. Заодно чиним это несоответствие.
function canManageNews(user) {
    return !!(user && (hasAdminAccess(user) || ['ceo', 'art_director', 'marketer'].includes(user.role)));
}
// Маркетинговый инструментарий (расходы на рекламу, кейсы/портфолио,
// контент-план) — маркетолог + руководство (ceo/art_director), тимлид
// сюда намеренно не входит — это не его зона ответственности.
function canManageMarketing(user) {
    return !!(user && (hasAdminAccess(user) || ['ceo', 'art_director', 'marketer'].includes(user.role)));
}

// ====== Сообщения об ошибках (bug_reports) — общие справочники ======
// Используются и на bugs.html (форма + список), и в колокольчике напоминаний
// (см. initDeadlineReminders ниже), чтобы не дублировать один и тот же
// список категорий/срочности в двух файлах.
const BUG_PAGE_OPTIONS = [
    { value: 'index.html', label: 'Дашборд' },
    { value: 'project.html', label: 'Страница проекта' },
    { value: 'frame.html', label: 'Карточка кадра' },
    { value: 'my.html', label: 'Моё' },
    { value: 'vacations.html', label: 'Отпуска' },
    { value: 'news.html', label: 'Новости' },
    { value: 'clients.html', label: 'Клиенты' },
    { value: 'calendar.html', label: 'Календарь' },
    { value: 'analytics.html', label: 'Аналитика' },
    { value: 'cases.html', label: 'Кейсы' },
    { value: 'content-plan.html', label: 'Контент-план' },
    { value: 'other', label: 'Другое / не знаю' }
];
const BUG_PAGE_LABELS = Object.fromEntries(BUG_PAGE_OPTIONS.map(o => [o.value, o.label]));

const BUG_CATEGORY_OPTIONS = [
    { value: 'save_error', label: 'Не сохраняется / не отправляется' },
    { value: 'load_error', label: 'Не загружается страница' },
    { value: 'button_broken', label: 'Не работает кнопка или ссылка' },
    { value: 'wrong_data', label: 'Неверные данные или расчёт' },
    { value: 'visual', label: 'Визуальная ошибка (вёрстка, наезжает текст и т.п.)' },
    { value: 'access', label: 'Не могу зайти / нет доступа к разделу' },
    { value: 'other', label: 'Другое' }
];
const BUG_CATEGORY_LABELS = Object.fromEntries(BUG_CATEGORY_OPTIONS.map(o => [o.value, o.label]));

const BUG_PRIORITY_OPTIONS = [
    { value: 'critical', label: '🔴 Критично — работать невозможно' },
    { value: 'medium', label: '🟠 Мешает — неудобно, но можно работать' },
    { value: 'low', label: '🟢 Незначительно — мелочь' }
];
const BUG_PRIORITY_LABELS = { critical: 'Критично', medium: 'Мешает', low: 'Незначительно' };
const BUG_PRIORITY_RANK = { critical: 0, medium: 1, low: 2 };

// ====== Отпуска и больничные (employee_leaves) — общие хелперы ======
// Используются и на vacations.html (полный календарь), и в местах выбора
// исполнителя (project.html — назначение на кадр, index.html — команда
// проекта), чтобы показать "сотрудник сейчас недоступен".
const LEAVE_TYPE_LABELS = { vacation: 'Отпуск', sick: 'Больничный' };

function leaveDaysCount(startDate, endDate) {
    const ms = new Date(endDate + 'T00:00:00') - new Date(startDate + 'T00:00:00');
    return Math.round(ms / 86400000) + 1;
}

function todayIso() {
    return new Date().toISOString().slice(0, 10);
}

// Отпуска/больничные, актуальные ПРЯМО СЕЙЧАС (today между start и end) —
// один период на сотрудника (если вдруг пересекаются несколько — берём любой,
// это ошибка данных, а не нормальный случай).
async function fetchCurrentLeaveMap() {
    const today = todayIso();
    const { data, error } = await supabaseClient
        .from('employee_leaves')
        .select('user_id, type, end_date, status')
        .eq('status', 'approved')
        .lte('start_date', today)
        .gte('end_date', today);
    if (error) { console.error(error); return {}; }
    const map = {};
    (data || []).forEach(l => { map[l.user_id] = l; });
    return map;
}

// Остаток дней отпуска в текущем календарном году: норма минус уже
// использованные (type='vacation') дни, где start_date попадает в этот год.
function calcVacationBalance(user, leavesOfUser) {
    const year = new Date().getFullYear();
    const norm = (user && user.vacation_days_per_year) || 28;
    const used = (leavesOfUser || [])
        // В баланс идут только полностью утверждённые отпуска — заявка в процессе
        // согласования ещё не "потрачена". Записи без status (старые импорты) считаем
        // утверждёнными по умолчанию — см. миграцию 20260929n.
        .filter(l => l.type === 'vacation' && (l.status || 'approved') === 'approved' && new Date(l.start_date + 'T00:00:00').getFullYear() === year)
        .reduce((sum, l) => sum + leaveDaysCount(l.start_date, l.end_date), 0);
    return { norm, used, remaining: norm - used };
}

// ====== Мини-CRM (clients) — общий хелпер ======
// Используется в форме создания/редактирования проекта (index.html): поле
// "Заказчик" остаётся простым текстовым полем с автодополнением, но при
// сохранении мы либо находим существующего клиента по имени (без учёта
// регистра), либо заводим нового — так проект всегда привязан к
// настоящей карточке клиента в CRM, а не просто к строке текста.
async function findOrCreateClientByName(name, createdByUserId, phone) {
    const trimmed = (name || '').trim();
    if (!trimmed) return null;
    const { data: existing, error: findErr } = await supabaseClient
        .from('clients')
        .select('*')
        .ilike('name', trimmed)
        .limit(1);
    if (findErr) { console.error(findErr); return null; }
    if (existing && existing.length > 0) return existing[0];
    const { data: created, error: createErr } = await supabaseClient
        .from('clients')
        .insert({ name: trimmed, created_by: createdByUserId || null, phone: (phone || '').trim() || null })
        .select()
        .single();
    if (createErr) { console.error(createErr); return null; }
    return created;
}

// Защита от дублей клиентов по телефону — сравниваем только цифры (без
// учёта +7/8, скобок, дефисов), чтобы "+7 999 123-45-67" и "89991234567"
// считались одним и тем же номером. Тянем всю таблицу клиентов и сверяем
// на клиенте — она у студии небольшая, отдельный SQL-фильтр не нужен.
function normalizePhoneDigits(phone) {
    return (phone || '').replace(/\D/g, '').slice(-10);
}
async function findClientsByPhone(phone) {
    const digits = normalizePhoneDigits(phone);
    if (!digits) return [];
    const { data, error } = await supabaseClient.from('clients').select('id, name, phone');
    if (error) { console.error(error); return []; }
    return (data || []).filter(c => normalizePhoneDigits(c.phone) === digits);
}

// Смена PIN (пароля) — раньше была продублирована на index.html, вынесена сюда,
// чтобы её мог вызвать и футер сайдбара на любой странице.
async function changePin() {
    const newPin = prompt('Новый PIN (минимум 6 символов):');
    if (!newPin) return;
    if (newPin.length < 6) { showToast('PIN должен быть не короче 6 символов', 'error'); return; }
    const { error } = await supabaseClient.auth.updateUser({ password: newPin });
    if (error) { console.error(error); showToast('Не удалось сменить PIN', 'error'); return; }
    showToast('PIN обновлён', 'success');
}

// Экранирование пользовательского текста перед вставкой в innerHTML —
// защита от HTML/JS в названиях проектов, кадров, этапов, задач и комментариях
// (иначе это хранимый XSS: увидит каждый, кто откроет страницу)
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? '✓' : type === 'warning' ? '⚠' : '✗';
    toast.innerHTML = `<span class="toast-icon">${icon}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ====== Тема (светлая/тёмная/системная) ======
function setTheme(theme) {
    localStorage.setItem('decardTheme', theme);
    applyTheme(theme);
    updateThemeButtons(theme);
}
function applyTheme(theme) {
    if (theme === 'system') {
        const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.setAttribute('data-theme', systemDark ? 'dark' : 'light');
    } else {
        document.documentElement.setAttribute('data-theme', theme);
    }
}
function updateThemeButtons(activeTheme) {
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-theme') === activeTheme) btn.classList.add('active');
    });
}
function loadTheme() {
    const saved = localStorage.getItem('decardTheme') || 'system';
    applyTheme(saved);
    updateThemeButtons(saved);
}

async function doLogout() {
    await supabaseClient.auth.signOut();
    window.location.href = 'login.html';
}

// ====== Дедлайны проектов (общая логика для главной страницы и аналитики) ======
function getDeadlineStatus(deadlineIso) {
    if (!deadlineIso) return 'ok';
    const dl = new Date(deadlineIso);
    const now = new Date();
    const diffDays = (dl - now) / (1000 * 60 * 60 * 24);
    if (diffDays < 0) return 'urgent';
    if (diffDays <= 7) return 'soon';
    return 'ok';
}
function getDeadlineLabel(status) {
    if (status === 'urgent') return 'Просрочено';
    if (status === 'soon') return 'Скоро';
    return 'В срок';
}
function formatDateRu(isoDate) {
    if (!isoDate) return '';
    const [year, month, day] = isoDate.split('-');
    return `${day}.${month}.${year}`;
}

// ====== Упоминания (@Имя Фамилия) в комментариях — общая логика для frame.html и my.html ======

// Достаём из текста комментария id всех сотрудников, чьё полное имя встречается
// после "@" (сравнение без учёта регистра). Простое решение без парсинга markdown —
// сотрудник должен быть напечатан целиком, автокомплит (attachMentionAutocomplete)
// как раз вставляет имя в нужном виде, чтобы не приходилось печатать вручную.
function extractMentions(text, employees) {
    if (!text || !employees || employees.length === 0) return [];
    const lower = text.toLowerCase();
    const ids = [];
    employees.forEach(p => {
        if (p.full_name && lower.includes('@' + p.full_name.toLowerCase())) ids.push(p.id);
    });
    return [...new Set(ids)];
}

// Подсвечивает "@Имя Фамилия" в уже экранированном (escapeHtml) тексте комментария.
// Работает поверх escapeHtml — сначала текст экранируется, потом в нём ищутся и
// оборачиваются в span только реально известные имена сотрудников, поэтому это
// безопасно (нельзя вставить произвольный HTML через комментарий).
function highlightMentions(escapedText, employees) {
    if (!employees || employees.length === 0) return escapedText;
    let result = escapedText;
    employees.forEach(p => {
        if (!p.full_name) return;
        const escapedName = escapeHtml(p.full_name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        result = result.replace(new RegExp('@' + escapedName, 'gi'), `<span class="mention-tag">@${escapeHtml(p.full_name)}</span>`);
    });
    return result;
}

// Простой автокомплит "@" в текстовом поле: набираешь "@" + начало имени — под полем
// всплывает список совпадений из employeesGetter(), клик вставляет имя целиком.
// employeesGetter — функция (не массив!), т.к. список сотрудников обычно подгружается
// асинхронно уже после того, как поле привязано.
function attachMentionAutocomplete(inputEl, employeesGetter) {
    if (!inputEl) return;
    let dropdown = null;
    function closeDropdown() { if (dropdown) { dropdown.remove(); dropdown = null; } }
    inputEl.addEventListener('input', () => {
        const val = inputEl.value;
        const cursor = inputEl.selectionStart;
        const uptoCursor = val.slice(0, cursor);
        const atIndex = uptoCursor.lastIndexOf('@');
        if (atIndex === -1 || /\s/.test(uptoCursor.slice(atIndex + 1))) { closeDropdown(); return; }
        const partial = uptoCursor.slice(atIndex + 1).toLowerCase();
        const employees = (employeesGetter && employeesGetter()) || [];
        const matches = employees.filter(p => p.full_name && p.full_name.toLowerCase().includes(partial)).slice(0, 5);
        closeDropdown();
        if (matches.length === 0) return;
        dropdown = document.createElement('div');
        dropdown.style.cssText = 'position:absolute; z-index:5000; background:var(--card-bg,#fff); border:1px solid var(--border,#ccc); border-radius:6px; box-shadow:0 8px 24px rgba(0,0,0,0.2); overflow:hidden; font-size:13px; min-width:180px;';
        const rect = inputEl.getBoundingClientRect();
        dropdown.style.left = (rect.left + window.scrollX) + 'px';
        dropdown.style.top = (rect.bottom + window.scrollY + 4) + 'px';
        matches.forEach(p => {
            const item = document.createElement('div');
            item.textContent = p.full_name;
            item.style.cssText = 'padding:8px 12px; cursor:pointer; color: var(--text-primary, #111);';
            item.onmouseenter = () => item.style.background = 'rgba(39,67,192,0.1)';
            item.onmouseleave = () => item.style.background = '';
            item.onmousedown = (e) => {
                e.preventDefault(); // не даём инпуту потерять фокус раньше клика
                const before = val.slice(0, atIndex);
                const after = val.slice(cursor);
                inputEl.value = `${before}@${p.full_name} ${after}`;
                inputEl.focus();
                closeDropdown();
            };
            dropdown.appendChild(item);
        });
        document.body.appendChild(dropdown);
    });
    inputEl.addEventListener('blur', () => setTimeout(closeDropdown, 150));
}

// ====== Глобальный поиск (проекты + кадры) — используется на главной и доступен
// с других страниц через переход на index.html#search=... ======
async function runGlobalSearch(query) {
    const q = query.trim();
    if (q.length < 2) return { projects: [], frames: [] };
    const [{ data: projects, error: projErr }, { data: frames, error: frameErr }] = await Promise.all([
        supabaseClient.from('projects').select('id, name').ilike('name', `%${q}%`).limit(8),
        supabaseClient.from('frames').select('id, name, project_id').ilike('name', `%${q}%`).limit(8)
    ]);
    if (projErr) console.error(projErr);
    if (frameErr) console.error(frameErr);
    // Джойн с проектами вручную (как и везде на сайте) — не полагаемся на то, что
    // Supabase сам определит связь frames.project_id -> projects.id для вложенного select
    let framesWithProject = frames || [];
    if (framesWithProject.length > 0) {
        const projectIds = [...new Set(framesWithProject.map(f => f.project_id))];
        const { data: frameProjects, error: fpErr } = await supabaseClient.from('projects').select('id, name').in('id', projectIds);
        if (fpErr) console.error(fpErr);
        framesWithProject = framesWithProject.map(f => ({
            ...f,
            projects: { name: (frameProjects || []).find(p => p.id === f.project_id)?.name || '' }
        }));
    }
    return { projects: projects || [], frames: framesWithProject };
}

// ====== "Сдача в срок" — эффективный срок кадра и статус доставки ======
// Если у кадра нет своего срока — используем дедлайн проекта. Возвращает
// ISO-дату (YYYY-MM-DD) или null, если срок нигде не задан.
function getEffectiveDueDate(frame, projectDeadline) {
    return (frame && frame.due_date) || projectDeadline || null;
}

// Статус доставки кадра: 'on_time' | 'late' | 'overdue' | null.
// null — либо срок не задан вовсе, либо кадр ещё не завершён и срок не прошёл
// (тогда достаточно обычного deadline-бейджа "скоро/просрочено", см. getDeadlineStatus).
function getDeliveryStatus(frame, projectDeadline) {
    const due = getEffectiveDueDate(frame, projectDeadline);
    if (!due) return null;
    if (frame.status === 'done') {
        if (!frame.completed_at) return null; // старые записи без даты завершения — не оцениваем
        const completedDate = frame.completed_at.slice(0, 10);
        return completedDate <= due ? 'on_time' : 'late';
    }
    const todayIso = new Date().toISOString().slice(0, 10);
    return todayIso > due ? 'overdue' : null;
}

// ====== Лог активности (frame_activity_log) — общие функции для всех страниц ======
// Раньше запись в лог умел делать только frame.html (там же и модалка для чтения).
// Теперь действия с кадром можно совершать и со страницы проекта (назначение,
// приоритет, статус, срок сдачи) — эти функции даём общими, чтобы такие действия
// тоже попадали в журнал.
// Имя автора действия ставится триггером в базе (set_activity_log_actor,
// см. миграцию 20260930l) из auth.uid() текущей сессии — не из того, что
// передаёт клиент, поэтому параметра actorName здесь больше нет: раньше
// его можно было передать любым текстом и подделать, от чьего имени
// записано действие.
async function logFrameActivity(frameId, actionType, description) {
    const { error } = await supabaseClient.from('frame_activity_log').insert({
        frame_id: frameId, action_type: actionType, description: description
    });
    if (error) console.error('Ошибка записи в лог:', error);
}

// Записи уровня проекта (не привязаны к конкретному кадру) — стоп/снятие стопа,
// завершение проекта, изменение команды и т.п.
async function logProjectActivity(projectId, actionType, description) {
    const { error } = await supabaseClient.from('frame_activity_log').insert({
        project_id: projectId, action_type: actionType, description: description
    });
    if (error) console.error('Ошибка записи в лог:', error);
}

// ====== Сеть: баннер офлайн/онлайн + устойчивые к сетевым сбоям запросы ======
// Баннер создаём один раз через JS и вставляем на любую страницу, где подключён
// common.js — правкой одного файла работает сразу везде, без изменений в каждом HTML.
(function initConnectivityBanner() {
    let banner = null;
    function ensureBanner() {
        if (banner) return banner;
        banner = document.createElement('div');
        banner.id = 'connectivityBanner';
        const attach = () => document.body && document.body.prepend(banner);
        if (document.body) attach();
        else document.addEventListener('DOMContentLoaded', attach);
        return banner;
    }
    function showOffline() {
        const el = ensureBanner();
        el.className = 'offline';
        el.textContent = '⚠ Нет подключения к интернету — изменения не сохраняются';
    }
    function showReconnected() {
        const el = ensureBanner();
        if (el.className !== 'offline') return; // баннера офлайна не было — не показываем "восстановлено" зря
        el.className = 'reconnected';
        el.textContent = '✓ Соединение восстановлено';
        setTimeout(() => { el.className = ''; }, 3000);
    }
    window.addEventListener('offline', showOffline);
    window.addEventListener('online', showReconnected);
    document.addEventListener('DOMContentLoaded', () => {
        if (!navigator.onLine) showOffline();
    });
})();

// Похоже ли это на сетевую ошибку (обрыв соединения), а не на обычную ошибку
// от Supabase/Postgres (нет прав, нарушение constraint и т.п.)?
function isNetworkError(error) {
    if (!error) return false;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
    const msg = ((error && error.message) || '').toLowerCase();
    return msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('load failed') || msg.includes('network request failed');
}

// Оборачивает запрос к Supabase: если ошибка похожа на сетевую — делает
// повторные попытки с паузой вместо того, чтобы сразу показывать пользователю
// ошибку из-за случайного обрыва связи (актуально в полевых условиях/на объекте).
// queryFn — функция без аргументов, возвращающая { data, error } (обычный supabase-запрос).
async function withRetry(queryFn, retries = 2, delayMs = 1200) {
    let result = await queryFn();
    while (result && result.error && isNetworkError(result.error) && retries > 0) {
        await new Promise(r => setTimeout(r, delayMs));
        result = await queryFn();
        retries--;
    }
    return result;
}

// Подсистема напоминаний (колокольчик сроков + дни рождения) вынесена в reminders.js
// (подключается отдельным <script> ПОСЛЕ common.js на странице).

// ====== Подпись автора внизу страницы — добавляется на все страницы через JS,
// без правок вёрстки в каждом файле (как баннер соединения и колокольчик выше) ======
(function initSiteCredit() {
    function inject() {
        if (document.getElementById('siteCredit')) return;
        const el = document.createElement('div');
        el.id = 'siteCredit';
        el.className = 'site-credit';
        el.innerHTML = 'Create by Adept · <a href="https://t.me/cute_adept" target="_blank" rel="noopener">tg: @cute_adept</a>';
        document.body.appendChild(el);
    }
    if (document.body) inject();
    else document.addEventListener('DOMContentLoaded', inject);
})();

// ====== Немного мема: шуточные фразы загрузки и маскот-рендербот ======
// Заменяют скучное "Загрузка..." в модалках/заголовках — чисто для настроения,
// на логику ни на что не влияет.
const FUNNY_LOADING_PHRASES = [
    'Считаем полигоны...',
    'Прогреваем Corona...',
    'Договариваемся с GI...',
    'Кэшируем облучённость...',
    'Будим Sun & Sky...',
    'Ищем потерянные пиксели...',
    'Собираем сцену...',
    'Считаем денойз...',
    'Почти как рендер — осталось совсем чуть-чуть...',
    'Уговариваем Vray... то есть Corona, простите'
];
function randomLoadingPhrase() {
    return FUNNY_LOADING_PHRASES[Math.floor(Math.random() * FUNNY_LOADING_PHRASES.length)];
}

// Маленький маскот-рендербот для пустых состояний ("кадров пока нет" и т.п.) —
// покачивается и изредка моргает, чистый inline SVG + CSS-анимация, без картинок.
const MASCOT_SVG = `
<svg class="mascot" width="88" height="88" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="50" cy="90" rx="26" ry="5" fill="currentColor" opacity="0.08"/>
    <g class="mascot-body">
        <rect x="10" y="8" width="10" height="6" rx="3" fill="currentColor" opacity="0.5" transform="rotate(-20 15 11)"/>
        <circle cx="10" cy="8" r="3" fill="var(--accent)"/>
        <rect x="22" y="16" width="56" height="42" rx="10" fill="currentColor" opacity="0.12" stroke="var(--accent)" stroke-width="2.5"/>
        <circle class="mascot-eye" cx="40" cy="37" r="4.5" fill="var(--accent)"/>
        <circle class="mascot-eye" cx="60" cy="37" r="4.5" fill="var(--accent)"/>
        <path d="M40 48 Q50 54 60 48" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" fill="none"/>
        <rect x="16" y="62" width="68" height="10" rx="5" fill="currentColor" opacity="0.12" stroke="var(--accent)" stroke-width="2"/>
        <rect x="30" y="76" width="12" height="10" rx="3" fill="currentColor" opacity="0.3"/>
        <rect x="58" y="76" width="12" height="10" rx="3" fill="currentColor" opacity="0.3"/>
    </g>
</svg>`;

// ====== Аутентификация страницы + шапка пользователя — общие для всех защищённых страниц ======
// До этой правки код ниже был побайтово продублирован в 14 файлах (requireAuth
// + renderUserBox), несмотря на то что весь смысл common.js — "правка в одном
// месте". Теперь это единственная копия; каждая страница вызывает
// initAuthedPage() внутри своего requireAuth() и следом делает свою
// специфичную часть (редирект по роли, разовые тоглы кнопок, доп. поля
// профиля) — см. requireAuth() в любой из html-страниц как пример.
//
// options.extraFields — доп. колонки profiles, которые нужно скопировать в
// currentUser сверх базового набора (id/full_name/role/is_admin) — например
// vacations.html нужен vacation_days_per_year.
// options.showChangePin — показывать ли в шапке кнопку "Сменить PIN"
// (сейчас так только на index.html — со страницы дашборда).
// Возвращает currentUser при успехе, иначе null — в этом случае страница уже
// была перенаправлена на login.html и больше ничего делать не должна.
async function initAuthedPage(options) {
    options = options || {};
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) { window.location.href = 'login.html'; return null; }
    const { data: profile, error } = await supabaseClient.from('profiles').select('*').eq('id', session.user.id).single();
    if (error || !profile) {
        console.error(error);
        await supabaseClient.auth.signOut();
        window.location.href = 'login.html';
        return null;
    }
    currentUser = { id: profile.id, full_name: profile.full_name, role: profile.role, is_admin: !!profile.is_admin };
    (options.extraFields || []).forEach(field => { currentUser[field] = profile[field]; });
    renderUserBox(!!options.showChangePin);
    initAppSidebar(currentUser);
    return currentUser;
}

function renderUserBox(showChangePin) {
    const box = document.getElementById('userBox');
    if (!box || !currentUser) return;
    box.innerHTML = `<span>${currentUser.full_name} · ${roleLabels[currentUser.role] || currentUser.role}</span>
        ${showChangePin ? `<button class="btn btn-secondary" onclick="changePin()" style="padding:4px 10px; font-size:12px;">Сменить PIN</button>` : ''}
        <button class="btn btn-secondary" onclick="doLogout()" style="padding:4px 10px; font-size:12px;">Выйти</button>`;
}

// ====== Боковая навигация (сайдбар) — общая для index/project/frame/analytics/my ======
// Раньше на каждой странице отдельно дублировались: переключатель темы,
// ссылка "Моё", кнопки "Аналитика"/"Сотрудники" (с ручной проверкой роли) и
// userBox с именем/выходом. Теперь всё это — один компонент, вставляемый
// через initAppSidebar(currentUser) сразу после того, как страница узнала
// пользователя (внутри requireAuth(), следом за renderUserBox()).
// CSS для сайдбара — в styles.css (.app-sidebar и т.д.), включая правила,
// прячущие старые header-элементы на страницах, где появился сайдбар
// (body.has-app-sidebar ...).
const APP_NAV_ITEMS = [
    { key: 'dashboard', label: 'Дашборд', href: 'index.html', icon: 'home', match: ['index.html', 'project.html', 'frame.html', ''] },
    { key: 'my', label: 'Моё', href: 'my.html', icon: 'user', match: ['my.html'] },
    { key: 'vacations', label: 'Отпуска', href: 'vacations.html', icon: 'palm', match: ['vacations.html'] },
    { key: 'news', label: 'Новости', href: 'news.html', icon: 'megaphone', match: ['news.html'] },
    { key: 'clients', label: 'Клиенты', href: 'clients.html', icon: 'briefcase', match: ['clients.html'], gate: canAccessClients },
    { key: 'deals', label: 'Сделки', href: 'deals.html', icon: 'funnel', match: ['deals.html'], gate: canAccessDeals },
    { key: 'calendar', label: 'Календарь', href: 'calendar.html', icon: 'calendar', match: ['calendar.html'] },
    { key: 'bugs', label: 'Сообщить об ошибке', href: 'bugs.html', icon: 'bug', match: ['bugs.html'] },
    { key: 'analytics', label: 'Аналитика', href: 'analytics.html', icon: 'chart', match: ['analytics.html'], gate: canViewAnalytics },
    { key: 'cases', label: 'Кейсы', href: 'cases.html', icon: 'star', match: ['cases.html'], gate: canManageMarketing },
    { key: 'content-plan', label: 'Контент-план', href: 'content-plan.html', icon: 'calendar', match: ['content-plan.html'], gate: canManageMarketing },
    { key: 'employees', label: 'Сотрудники', href: 'index.html?open=employees', icon: 'team', match: [], gate: canManageEmployeesRole },
    { key: 'console', label: 'Консоль ошибок', href: 'error-console.html', icon: 'console', match: ['error-console.html'], gate: hasAdminAccess }
];

function initAppSidebar(user) {
    if (!user || document.getElementById('appSidebar')) return;

    document.body.classList.add('has-app-sidebar');

    const navHtml = APP_NAV_ITEMS.filter(item => !item.gate || item.gate(user)).map(item => `
        <a class="app-nav-item" data-nav-key="${item.key}" href="${item.href}">
            <span class="app-nav-icon">${ICON[item.icon] || ''}</span>
            <span>${item.label}</span>
        </a>`).join('');

    const wrap = document.createElement('div');
    wrap.innerHTML = `
        <button class="app-sidebar-toggle" id="appSidebarToggle" title="Меню" aria-label="Меню">${ICON.menu}</button>
        <div class="app-sidebar-overlay" id="appSidebarOverlay"></div>
        <aside class="app-sidebar" id="appSidebar">
            <div class="app-sidebar-logo">
                DECARD <span>STUDIO</span>
                <button class="app-sidebar-close" id="appSidebarClose" aria-label="Закрыть">${ICON.close}</button>
            </div>
            <nav class="app-sidebar-nav">${navHtml}</nav>
            <div class="app-sidebar-footer">
                <div class="app-sidebar-theme theme-controls">
                    <button class="theme-btn" data-theme="light" onclick="setTheme('light')" title="Светлая тема">${ICON.sun}</button>
                    <button class="theme-btn" data-theme="dark" onclick="setTheme('dark')" title="Тёмная тема">${ICON.moon}</button>
                    <button class="theme-btn" data-theme="system" onclick="setTheme('system')" title="Системная тема">${ICON.monitor}</button>
                </div>
                <div class="app-sidebar-user">
                    <div class="app-sidebar-user-name">${escapeHtml(user.full_name)}</div>
                    <div class="app-sidebar-user-role">${roleLabels[user.role] || user.role}</div>
                </div>
                <div class="app-sidebar-user-actions">
                    <button class="btn btn-secondary" onclick="changePin()">Сменить PIN</button>
                    <button class="btn btn-secondary" onclick="doLogout()">${ICON.logout} Выйти</button>
                </div>
            </div>
        </aside>`;
    document.body.insertBefore(wrap, document.body.firstChild);
    while (wrap.firstChild) document.body.insertBefore(wrap.firstChild, wrap);
    wrap.remove();

    loadTheme();
    updateSidebarActiveState();

    const toggle = document.getElementById('appSidebarToggle');
    const closeBtn = document.getElementById('appSidebarClose');
    const overlay = document.getElementById('appSidebarOverlay');
    const sidebar = document.getElementById('appSidebar');
    const openSidebar = () => { sidebar.classList.add('open'); overlay.classList.add('open'); };
    const closeSidebar = () => { sidebar.classList.remove('open'); overlay.classList.remove('open'); };
    if (toggle) toggle.addEventListener('click', openSidebar);
    if (closeBtn) closeBtn.addEventListener('click', closeSidebar);
    if (overlay) overlay.addEventListener('click', closeSidebar);
}

// Подсвечивает пункт меню, соответствующий текущей странице. project.html и
// frame.html относятся к "Дашборду" — это их родительский контекст.
function updateSidebarActiveState() {
    const sidebar = document.getElementById('appSidebar');
    if (!sidebar) return;
    const page = window.location.pathname.split('/').pop();
    sidebar.querySelectorAll('.app-nav-item').forEach(el => {
        const item = APP_NAV_ITEMS.find(i => i.key === el.dataset.navKey);
        el.classList.toggle('active', !!(item && item.match.includes(page)));
    });
}
