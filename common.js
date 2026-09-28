// ============================================================
// Decard Pipeline — общие функции для всех страниц (login/index/project/frame)
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

const roleLabels = { artist: 'Художник', lead: 'Тимлид', art_director: 'Арт-директор', ceo: 'Генеральный директор' };

// PWA: регистрируем service worker на всех страницах, чтобы сайт можно было
// "установить" на телефон/десктоп (иконка на главном экране, отдельное окно).
// Сам sw.js ничего не кеширует — см. комментарий в файле.
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(err => console.error('SW registration failed', err));
    });
}

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
    team: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>'
};

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

async function initDeadlineReminders(user) {
    if (!user) return;
    try {
        const [{ data: myFrames, error: framesErr }, { data: memberships, error: memErr }] = await Promise.all([
            supabaseClient.from('frames').select('id, name, project_id, due_date, status').eq('assigned_to', user.id).neq('status', 'done'),
            supabaseClient.from('project_members').select('project_id').eq('user_id', user.id)
        ]);
        if (framesErr) console.error(framesErr);
        if (memErr) console.error(memErr);

        const frames = myFrames || [];
        const myProjectIds = [...new Set((memberships || []).map(m => m.project_id))];
        const projectIds = [...new Set([...frames.map(f => f.project_id), ...myProjectIds])];
        if (projectIds.length === 0) { renderReminderBell([]); return; }

        const { data: projects, error: projErr } = await supabaseClient.from('projects').select('id, name, deadline, completed, on_hold').in('id', projectIds);
        if (projErr) { console.error(projErr); return; }
        const projectMap = Object.fromEntries((projects || []).map(p => [p.id, p]));

        const items = [];
        frames.forEach(f => {
            const project = projectMap[f.project_id];
            if (!project || project.completed || project.on_hold) return;
            const due = f.due_date || project.deadline;
            if (!due) return;
            const daysLeft = daysUntilDate(due);
            if (daysLeft <= REMINDER_THRESHOLD_DAYS) {
                items.push({ type: 'frame', name: f.name, projectName: project.name, daysLeft, link: `frame.html?project=${f.project_id}&frame=${f.id}` });
            }
        });
        myProjectIds.forEach(pid => {
            const project = projectMap[pid];
            if (!project || project.completed || project.on_hold || !project.deadline) return;
            const daysLeft = daysUntilDate(project.deadline);
            if (daysLeft <= REMINDER_THRESHOLD_DAYS) {
                items.push({ type: 'project', name: project.name, projectName: null, daysLeft, link: `project.html?id=${pid}` });
            }
        });
        items.sort((a, b) => a.daysLeft - b.daysLeft);
        renderReminderBell(items);
    } catch (e) {
        console.error('Ошибка загрузки напоминаний:', e);
    }
}

function renderReminderBell(items) {
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
    if (items.length === 0) {
        badge.style.display = 'none';
        panel.innerHTML = '<div class="reminder-empty">Нет срочных сроков — всё под контролем</div>';
        return;
    }
    badge.style.display = 'flex';
    badge.textContent = items.length > 9 ? '9+' : String(items.length);
    panel.innerHTML = '<div class="reminder-panel-title">Ближайшие сроки</div>' + items.map(item => {
        const label = reminderLabel(item.daysLeft);
        const sub = item.type === 'frame' ? `${escapeHtml(item.projectName)} · кадр` : 'проект целиком';
        return `<a class="reminder-item" href="${item.link}">
            <div class="reminder-item-text">
                <div class="reminder-item-name">${escapeHtml(item.name)}</div>
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
