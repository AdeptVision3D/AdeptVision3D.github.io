// ====== Напоминания: колокольчик сроков + дни рождения (вынесено из common.js) ======
// Самостоятельная подсистема: плавающий колокольчик с напоминаниями о
// приближающихся/просроченных сроках и днях рождения сотрудников, плюс звук
// уведомления. Единственная точка входа — initDeadlineReminders(currentUser),
// вызывается один раз с каждой защищённой страницы после requireAuth().
// Использует функции из common.js (escapeHtml, formatDateRu и т.д.) — поэтому
// этот файл должен подключаться СТРОГО ПОСЛЕ common.js в <script>-тегах.
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
        .select('id, title, next_followup_date, next_action')
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
                projectName: d.next_action || 'связаться с клиентом',
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

