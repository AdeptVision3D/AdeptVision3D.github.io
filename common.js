// ============================================================
// Decard Studio — общие функции для всех страниц (login/index/project/frame)
// Раньше этот код был продублирован в каждом HTML-файле по отдельности:
// правка в одном месте (например, в showToast) не долетала до остальных
// страниц, если про неё забывали. Теперь это единственная копия.
// Специфичная для конкретной страницы логика (загрузка данных, рендер
// карточек и т.д.) остаётся в <script> самой страницы.
// ============================================================

// ====== ПОДКЛЮЧЕНИЕ К SUPABASE ======
const SUPABASE_URL = 'https://mcpsnmcvzxzdgllhbrib.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ouAuh1fPBDLo3bLxs4FnLA_dJwIN-Un';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
// =====================================

const roleLabels = { artist: 'Художник', lead: 'Тимлид', art_director: 'Арт-директор', ceo: 'Генеральный директор', manager: 'Менеджер' };

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
// =========================================

// Отдельный флаг "админ-доступа" в profiles.is_admin — даёт полный доступ ко всем
// панелям НЕЗАВИСИМО от роли в профиле. Нужен, например, когда роль в профиле
// отражает реальную должность человека (скажем, "Художник"), но ему всё равно
// нужен полный доступ для тестирования/отладки. Используется вместе с проверками
// по роли (через ||), а не вместо них — обычным сотрудникам ничего не открывает.
function hasAdminAccess(user) { return !!(user && user.is_admin); }

// Набор простых линейных иконок взамен эмодзи — единый визуальный язык, без "клипарта".
// Не все страницы используют все иконки — лишние просто не вставляются в разметку.
const ICON = {
    calendar: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/></svg>',
    frames: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
    trash: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/></svg>',
    edit: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    comment: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    log: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    pdf: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M9.5 15.5 12 18l2.5-2.5"/><path d="M12 12v6"/></svg>',
    warning: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2 20h20Z"/><line x1="12" y1="9" x2="12" y2="14"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    search: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    check: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    clock: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    pin: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-7.5 7-12a7 7 0 1 0-14 0c0 4.5 7 12 7 12Z"/><circle cx="12" cy="9" r="2.3"/></svg>',
    expand: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="7 13 12 18 17 13"/><polyline points="7 6 12 11 17 6"/></svg>',
    collapse: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 11 12 6 7 11"/><polyline points="17 18 12 13 7 18"/></svg>',
    sun: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="6.34" y2="6.34"/><line x1="17.66" y1="17.66" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="6.34" y2="17.66"/><line x1="17.66" y1="6.34" x2="19.07" y2="4.93"/></svg>',
    moon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
    monitor: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
    team: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    home: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></svg>',
    chart: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
    logout: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
    menu: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
    close: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    user: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    palm: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22V12"/><path d="M12 12c0-4 -3-6-7-6 0 4 3 6 7 6Z"/><path d="M12 12c0-5 3-8 8-8 0 5 -3 8-8 8Z"/><path d="M12 12c0-3 -2-5 -5-5"/><path d="M12 12c0-3 2-5 5-5"/></svg>',
    pill: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="9.5" width="15" height="7" rx="3.5" transform="rotate(-45 12 13)"/><line x1="9.5" y1="10" x2="14.5" y2="15" /></svg>',
    megaphone: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11v3a1 1 0 0 0 1 1h2l3.5 5V6L6 10H4a1 1 0 0 0-1 1Z"/><path d="M13 8a4 4 0 0 1 0 8"/><path d="M17.5 5a8 8 0 0 1 0 14"/></svg>',
    briefcase: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="2" y1="12" x2="22" y2="12"/></svg>',
    phone: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
    mail: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 8.97 6.28a2 2 0 0 0 2.06 0L22 7"/></svg>',
    bug: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="6" width="8" height="12" rx="4"/><path d="M12 6V3"/><path d="M8 9H3"/><path d="M8 14H3"/><path d="M16 9h5"/><path d="M16 14h5"/><path d="M9 3l1.5 2"/><path d="M15 3l-1.5 2"/><path d="M6 19l2-2"/><path d="M18 19l-2-2"/></svg>',
    console: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3"/><path d="M13 15h4"/></svg>',
    funnel: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h18l-7 9v6l-4 2v-8z"/></svg>',
    percent: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>',
    gift: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M12 8c-1.5-4-6-4-6-1s3 1 6 1Z"/><path d="M12 8c1.5-4 6-4 6-1s-3 1-6 1Z"/></svg>'
};

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
async function findOrCreateClientByName(name, createdByUserId) {
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
        .insert({ name: trimmed, created_by: createdByUserId || null })
        .select()
        .single();
    if (createErr) { console.error(createErr); return null; }
    return created;
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
async function logFrameActivity(frameId, actionType, description, actorName) {
    const { error } = await supabaseClient.from('frame_activity_log').insert({
        frame_id: frameId, action_type: actionType, description: description, actor_name: actorName || null
    });
    if (error) console.error('Ошибка записи в лог:', error);
}

// Записи уровня проекта (не привязаны к конкретному кадру) — стоп/снятие стопа,
// завершение проекта, изменение команды и т.п.
async function logProjectActivity(projectId, actionType, description, actorName) {
    const { error } = await supabaseClient.from('frame_activity_log').insert({
        project_id: projectId, action_type: actionType, description: description, actor_name: actorName || null
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

// ====== Напоминания о сроках — плавающий колокольчик в углу экрана ======
// Показывает лично назначенному пользователю кадры (assigned_to) и проекты,
// в которых он состоит (project_members), если до эффективного срока сдачи
// осталось REMINDER_THRESHOLD_DAYS дней или меньше — включая уже просроченные.
// Работает на любой странице без правок вёрстки (кнопка добавляется через JS,
// как и баннер соединения выше). Каждая страница после успешной авторизации
// вызывает initDeadlineReminders(currentUser) один раз.
const REMINDER_THRESHOLD_DAYS = 3;

function daysUntilDate(dueIso) {
    const due = new Date(dueIso + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((due - today) / (1000 * 60 * 60 * 24));
}

function reminderLabel(daysLeft) {
    if (daysLeft < 0) return { text: `Просрочено на ${Math.abs(daysLeft)} дн.`, cls: 'danger' };
    if (daysLeft === 0) return { text: 'Сегодня', cls: 'danger' };
    if (daysLeft === 1) return { text: 'Завтра', cls: 'warning' };
    return { text: `Осталось ${daysLeft} дн.`, cls: 'warning' };
}

function isoDatePlusDays(n) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Встречи календаря, где текущий пользователь — организатор или приглашённый,
// в ближайшие REMINDER_THRESHOLD_DAYS дней (прошедшие не напоминаем, в отличие
// от дедлайнов — встречу back in time напоминать уже незачем).
async function fetchUpcomingMyEvents(user) {
    const [{ data: organized, error: orgErr }, { data: inviteRows, error: invErr }] = await Promise.all([
        supabaseClient.from('company_events').select('*').eq('organizer_id', user.id),
        supabaseClient.from('company_event_invitees').select('event_id').eq('user_id', user.id)
    ]);
    if (orgErr) console.error(orgErr);
    if (invErr) console.error(invErr);
    const inviteIds = [...new Set((inviteRows || []).map(r => r.event_id))];
    let invited = [];
    if (inviteIds.length > 0) {
        const { data, error } = await supabaseClient.from('company_events').select('*').in('id', inviteIds);
        if (error) console.error(error);
        invited = data || [];
    }
    const byId = {};
    [...(organized || []), ...invited].forEach(e => { byId[e.id] = e; });
    const todayStr = todayIso();
    const horizon = isoDatePlusDays(REMINDER_THRESHOLD_DAYS);
    return Object.values(byId)
        .filter(e => e.event_date >= todayStr && e.event_date <= horizon)
        .sort((a, b) => a.event_date.localeCompare(b.event_date) || (a.event_time || '').localeCompare(b.event_time || ''));
}

// ====== Дни рождения и годовщины работы в компании ======
// Показываем всем (не только руководству) — это про атмосферу в команде,
// а не про рабочие задачи. Порог чуть шире, чем у дедлайнов (неделя, а не
// 3 дня) — чтобы успеть придумать поздравление/подарок, а не узнать в упор.
const PEOPLE_EVENTS_THRESHOLD_DAYS = 7;
// Как часто колокольчик сам переспрашивает сервер, пока страница открыта
// (без ручного обновления). При команде в несколько человек 5 секунд не
// нагружает бесплатный план Supabase (лимитируется место в базе и трафик,
// а не число запросов в минуту), но при желании это единственное число,
// которое нужно поменять, если вкладок станет заметно больше.
const REMINDER_POLL_INTERVAL_MS = 5000;

function pluralYearsRu(n) {
    const mod10 = n % 10, mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return `${n} год`;
    if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return `${n} года`;
    return `${n} лет`;
}

// Следующее наступление даты по месяцу/числу (год не важен — так считаются
// дни рождения и годовщины: если в этом году дата уже прошла, берём тот же
// день в следующем году).
function nextAnnualOccurrence(monthDayIso) {
    const src = new Date(monthDayIso + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let year = today.getFullYear();
    let candidate = new Date(year, src.getMonth(), src.getDate());
    if (candidate < today) {
        year += 1;
        candidate = new Date(year, src.getMonth(), src.getDate());
    }
    return { iso: `${candidate.getFullYear()}-${String(candidate.getMonth() + 1).padStart(2, '0')}-${String(candidate.getDate()).padStart(2, '0')}`, year };
}

async function fetchUpcomingPeopleEvents() {
    const { data, error } = await supabaseClient.from('profiles').select('id, full_name, birthday, hire_date').eq('is_active', true);
    if (error) { console.error(error); return []; }
    const items = [];
    (data || []).forEach(p => {
        if (p.birthday) {
            const occ = nextAnnualOccurrence(p.birthday);
            const daysLeft = daysUntilDate(occ.iso);
            if (daysLeft >= 0 && daysLeft <= PEOPLE_EVENTS_THRESHOLD_DAYS) {
                items.push({ type: 'birthday', id: p.id, name: p.full_name, daysLeft, link: 'calendar.html' });
            }
        }
        if (p.hire_date) {
            const occ = nextAnnualOccurrence(p.hire_date);
            const hireYear = new Date(p.hire_date + 'T00:00:00').getFullYear();
            const years = occ.year - hireYear;
            if (years >= 1) {
                const daysLeft = daysUntilDate(occ.iso);
                if (daysLeft >= 0 && daysLeft <= PEOPLE_EVENTS_THRESHOLD_DAYS) {
                    items.push({ type: 'anniversary', id: p.id, name: p.full_name, years, daysLeft, link: 'calendar.html' });
                }
            }
        }
    });
    return items;
}

// Открытые тикеты об ошибках — только для тех, кто их разбирает (тимлид и
// выше, включая админ-доступ); остальным в колокольчике не показываем.
async function fetchOpenBugReportsForBell(user) {
    if (!canManageProjectsRole(user)) return [];
    const { data, error } = await supabaseClient
        .from('bug_reports')
        .select('id, category, priority, status')
        .neq('status', 'resolved');
    if (error) { console.error(error); return []; }
    return (data || []).sort((a, b) => BUG_PRIORITY_RANK[a.priority] - BUG_PRIORITY_RANK[b.priority]);
}

// Сделки со скидкой/бесплатным условием, которые ждут решения — только
// тем, кто вправе их согласовывать (арт-директор/CEO/админ). Это и есть
// тот самый "контроль" из просьбы: руководитель узнаёт о скидке/бесплатной
// услуге сразу, а не когда работа уже сделана.
async function fetchPendingCommercialApprovalsForBell(user) {
    if (!canApproveCommercial(user)) return [];
    const { data, error } = await supabaseClient
        .from('deals')
        .select('id, title')
        .eq('commercial_approval_status', 'pending');
    if (error) { console.error(error); return []; }
    return data || [];
}

// Свои сделки менеджера с приближающейся датой "перезвонить/написать" —
// личный рабочий список, а не общий дедлайн по проекту.
async function fetchMyDealFollowupsForBell(user) {
    if (!canAccessDeals(user)) return [];
    const { data, error } = await supabaseClient
        .from('deals')
        .select('id, title, next_followup_date')
        .eq('manager_id', user.id)
        .not('stage', 'in', '(won,lost)')
        .not('next_followup_date', 'is', null);
    if (error) { console.error(error); return []; }
    return (data || []).filter(d => daysUntilDate(d.next_followup_date) <= REMINDER_THRESHOLD_DAYS);
}

async function initDeadlineReminders(user) {
    if (!user) return;
    try {
        const [{ data: myFrames, error: framesErr }, { data: memberships, error: memErr }, myEvents, openBugs, peopleEvents, pendingDeals, myFollowups] = await Promise.all([
            supabaseClient.from('frames').select('id, name, project_id, due_date, status').eq('assigned_to', user.id).neq('status', 'done'),
            supabaseClient.from('project_members').select('project_id').eq('user_id', user.id),
            fetchUpcomingMyEvents(user),
            fetchOpenBugReportsForBell(user),
            fetchUpcomingPeopleEvents(),
            fetchPendingCommercialApprovalsForBell(user),
            fetchMyDealFollowupsForBell(user)
        ]);
        if (framesErr) console.error(framesErr);
        if (memErr) console.error(memErr);

        const frames = myFrames || [];
        const myProjectIds = [...new Set((memberships || []).map(m => m.project_id))];
        const projectIds = [...new Set([...frames.map(f => f.project_id), ...myProjectIds])];

        const items = [];
        // Открытые тикеты — всегда наверху колокольчика (это не "дедлайн через N
        // дней", а "уже сейчас надо посмотреть"), критичные выше остальных.
        openBugs.forEach((b, i) => {
            items.push({
                type: 'bug',
                id: b.id,
                name: BUG_CATEGORY_LABELS[b.category] || b.category,
                projectName: BUG_PRIORITY_LABELS[b.priority] || b.priority,
                bugPriority: b.priority,
                daysLeft: -1000 + BUG_PRIORITY_RANK[b.priority] * 10 + i,
                link: 'bugs.html'
            });
        });
        // Согласование скидок — рядом с тикетами по срочности (это тоже
        // "надо посмотреть сейчас", а не отсчёт дней до дедлайна).
        pendingDeals.forEach((d, i) => {
            items.push({
                type: 'deal_approval',
                id: d.id,
                name: d.title,
                projectName: 'ждёт согласования скидки',
                daysLeft: -900 + i,
                link: `deals.html?deal=${d.id}`
            });
        });
        myFollowups.forEach(d => {
            const daysLeft = daysUntilDate(d.next_followup_date);
            items.push({
                type: 'deal_followup',
                id: d.id,
                name: d.title,
                projectName: 'связаться с клиентом',
                daysLeft,
                link: `deals.html?deal=${d.id}`
            });
        });
        myEvents.forEach(e => {
            const daysLeft = daysUntilDate(e.event_date);
            const timeLabel = e.event_time ? ` в ${e.event_time.slice(0, 5)}` : '';
            items.push({ type: 'event', id: e.id, name: e.title, projectName: `встреча${timeLabel}`, daysLeft, link: 'calendar.html' });
        });
        peopleEvents.forEach(p => {
            items.push({
                type: p.type,
                name: p.name,
                projectName: p.type === 'birthday' ? 'день рождения' : `${pluralYearsRu(p.years)} в компании`,
                daysLeft: p.daysLeft,
                link: p.link
            });
        });

        if (projectIds.length > 0) {
            const { data: projects, error: projErr } = await supabaseClient.from('projects').select('id, name, deadline, completed, on_hold').in('id', projectIds);
            if (projErr) { console.error(projErr); }
            const projectMap = Object.fromEntries((projects || []).map(p => [p.id, p]));

            frames.forEach(f => {
                const project = projectMap[f.project_id];
                if (!project || project.completed || project.on_hold) return;
                const due = f.due_date || project.deadline;
                if (!due) return;
                const daysLeft = daysUntilDate(due);
                if (daysLeft <= REMINDER_THRESHOLD_DAYS) {
                    items.push({ type: 'frame', id: f.id, name: f.name, projectName: project.name, daysLeft, link: `frame.html?project=${f.project_id}&frame=${f.id}` });
                }
            });
            myProjectIds.forEach(pid => {
                const project = projectMap[pid];
                if (!project || project.completed || project.on_hold || !project.deadline) return;
                const daysLeft = daysUntilDate(project.deadline);
                if (daysLeft <= REMINDER_THRESHOLD_DAYS) {
                    items.push({ type: 'project', id: pid, name: project.name, projectName: null, daysLeft, link: `project.html?id=${pid}` });
                }
            });
        }
        items.sort((a, b) => a.daysLeft - b.daysLeft);
        notifyIfNewReminderItems(user, items);
        renderReminderBell(items);

        // Пока страница открыта, сами не узнаем о новом тикете/встрече — здесь
        // нет "живых" уведомлений с сервера, поэтому просто переспрашиваем раз
        // в REMINDER_POLL_INTERVAL_MS. Настраиваем только один раз за загрузку
        // страницы.
        if (!window.__reminderPollingStarted) {
            window.__reminderPollingStarted = true;
            setInterval(() => initDeadlineReminders(user), REMINDER_POLL_INTERVAL_MS);
        }
    } catch (e) {
        console.error('Ошибка загрузки напоминаний:', e);
    }
}

// ====== Звук колокольчика ======
// Простой сигнал через Web Audio API (без файла-ассета) — играет только когда
// в колокольчике появляется ЧТО-ТО НОВОЕ по сравнению с прошлым разом на этом
// устройстве (иначе звук бы дублировался при каждом заходе на страницу).
// Браузеры блокируют звук без предварительного взаимодействия пользователя —
// AudioContext создаём сразу, но пока не было клика/нажатия клавиши, он
// остаётся в состоянии "suspended" и тон физически не слышен. Поэтому если
// новый тикет/событие прилетает ДО первого клика (например, сразу после
// обновления страницы), звук откладываем флагом _pendingReminderSound и
// проигрываем его, как только пользователь первый раз кликнет или нажмёт
// клавишу где угодно на странице.
let _reminderAudioCtx = null;
let _pendingReminderSound = false;

function _ensureReminderAudioCtx() {
    if (_reminderAudioCtx) return _reminderAudioCtx;
    try { _reminderAudioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* не поддерживается — просто без звука */ }
    return _reminderAudioCtx;
}

function _playReminderToneNow() {
    const ctx = _reminderAudioCtx;
    if (!ctx) return;
    try {
        const now = ctx.currentTime;
        [880, 1175].forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            const start = now + i * 0.12;
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(0.16, start + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, start + 0.28);
            osc.connect(gain).connect(ctx.destination);
            osc.start(start);
            osc.stop(start + 0.3);
        });
    } catch (e) { /* звук не критичен — просто пропускаем */ }
}

function _unlockReminderAudio() {
    const ctx = _ensureReminderAudioCtx();
    if (!ctx) return;
    const finishUnlock = () => {
        if (_pendingReminderSound && ctx.state === 'running') {
            _pendingReminderSound = false;
            _playReminderToneNow();
        }
    };
    if (ctx.state === 'suspended') {
        ctx.resume().then(finishUnlock).catch(() => {});
    } else {
        finishUnlock();
    }
}
document.addEventListener('click', _unlockReminderAudio);
document.addEventListener('keydown', _unlockReminderAudio);

function isReminderSoundEnabled() {
    try { return localStorage.getItem('reminderSoundEnabled') !== '0'; } catch (e) { return true; }
}
function setReminderSoundEnabled(enabled) {
    try { localStorage.setItem('reminderSoundEnabled', enabled ? '1' : '0'); } catch (e) { /* игнор */ }
}

function playReminderSound() {
    if (!isReminderSoundEnabled()) return;
    const ctx = _ensureReminderAudioCtx();
    if (!ctx) return;
    if (ctx.state === 'running') {
        _playReminderToneNow();
        return;
    }
    // Контекст ещё заблокирован политикой автовоспроизведения браузера —
    // звук разрешат только после жеста пользователя. Пробуем разбудить
    // контекст прямо сейчас (иногда браузер уже "доверяет" странице), а
    // если не выйдет — откладываем до первого клика/нажатия клавиши.
    _pendingReminderSound = true;
    ctx.resume().then(() => {
        if (_pendingReminderSound && ctx.state === 'running') {
            _pendingReminderSound = false;
            _playReminderToneNow();
        }
    }).catch(() => {});
}

function reminderItemKey(item) {
    return `${item.type}:${item.id !== undefined && item.id !== null ? item.id : item.name + '|' + (item.link || '')}`;
}

// Сравниваем с тем, что видели на этом устройстве в прошлый раз (per-user —
// на общем компьютере с разными входами звук не будет путать чужие тикеты).
// В самый первый раз (ничего не сохранено) молча запоминаем всё — не пугаем
// сотрудника звуком по всем уже существующим напоминаниям сразу.
function notifyIfNewReminderItems(user, items) {
    const storageKey = `reminderSeenKeys_${user.id}`;
    const currentKeys = items.map(reminderItemKey);
    let prevSeen = null;
    try {
        const raw = localStorage.getItem(storageKey);
        prevSeen = raw ? new Set(JSON.parse(raw)) : null;
    } catch (e) { prevSeen = null; }

    if (prevSeen) {
        const hasNew = currentKeys.some(k => !prevSeen.has(k));
        if (hasNew) playReminderSound();
    }
    try { localStorage.setItem(storageKey, JSON.stringify(currentKeys)); } catch (e) { /* игнор */ }
}

let _lastReminderItems = [];

function toggleReminderSoundSetting() {
    setReminderSoundEnabled(!isReminderSoundEnabled());
    renderReminderBell(_lastReminderItems);
}

function renderReminderBell(items) {
    _lastReminderItems = items;
    let wrap = document.getElementById('reminderBellWrap');
    if (!wrap) {
        wrap = document.createElement('div');
        wrap.id = 'reminderBellWrap';
        wrap.innerHTML = `
            <button id="reminderBellBtn" type="button" title="Ближайшие сроки">🔔<span id="reminderBellBadge" class="reminder-badge" style="display:none;"></span></button>
            <div id="reminderBellPanel" class="reminder-panel"></div>
        `;
        document.body.appendChild(wrap);
        document.getElementById('reminderBellBtn').addEventListener('click', (e) => {
            e.stopPropagation();
            document.getElementById('reminderBellPanel').classList.toggle('open');
        });
        document.addEventListener('click', (e) => {
            if (!wrap.contains(e.target)) document.getElementById('reminderBellPanel').classList.remove('open');
        });
    }
    const badge = document.getElementById('reminderBellBadge');
    const panel = document.getElementById('reminderBellPanel');
    const soundOn = isReminderSoundEnabled();
    const titleRow = `<div class="reminder-panel-title" style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
        <span>Ближайшие сроки</span>
        <button type="button" onclick="event.stopPropagation(); toggleReminderSoundSetting();" title="${soundOn ? 'Выключить звук уведомлений' : 'Включить звук уведомлений'}" style="background:none; border:none; cursor:pointer; font-size:14px; line-height:1; padding:2px;">${soundOn ? '🔈' : '🔇'}</button>
    </div>`;
    if (items.length === 0) {
        badge.style.display = 'none';
        panel.innerHTML = titleRow + '<div class="reminder-empty">Нет срочных сроков — всё под контролем</div>';
        return;
    }
    badge.style.display = 'flex';
    badge.textContent = items.length > 9 ? '9+' : String(items.length);
    panel.innerHTML = titleRow + items.map(item => {
        const isPeopleEvent = item.type === 'birthday' || item.type === 'anniversary';
        const label = item.type === 'bug'
            ? { text: item.projectName, cls: item.bugPriority === 'critical' ? 'danger' : 'warning' }
            : item.type === 'deal_approval'
            ? { text: 'Решение', cls: 'warning' }
            : isPeopleEvent
            ? { text: reminderLabel(item.daysLeft).text, cls: 'success' }
            : reminderLabel(item.daysLeft);
        const sub = item.type === 'frame' ? `${escapeHtml(item.projectName)} · кадр`
            : item.type === 'event' ? escapeHtml(item.projectName)
            : item.type === 'bug' ? 'тикет об ошибке'
            : item.type === 'deal_approval' || item.type === 'deal_followup' ? escapeHtml(item.projectName)
            : isPeopleEvent ? escapeHtml(item.projectName)
            : 'проект целиком';
        const prefix = item.type === 'birthday' ? '🎂 ' : item.type === 'anniversary' ? '🎉 ' : '';
        return `<a class="reminder-item" href="${item.link}">
            <div class="reminder-item-text">
                <div class="reminder-item-name">${prefix}${escapeHtml(item.name)}</div>
                <div class="reminder-item-sub">${sub}</div>
            </div>
            <span class="reminder-item-badge reminder-${label.cls}">${label.text}</span>
        </a>`;
    }).join('');
}

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
    { key: 'analytics', label: 'Аналитика', href: 'analytics.html', icon: 'chart', match: ['analytics.html'], gate: canManageProjectsRole },
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
