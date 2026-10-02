        let currentUser = null;

        async function requireAuth() {
            return !!(await initAuthedPage());
        }

        // ====== Сбор данных со всего пайплайна ======

        // Загружает все проекты, все кадры и прогресс задач по каждому кадру одним проходом,
        // плюс лог активности по всем кадрам сразу (а не по одному кадру, как в project.html/frame.html)
        async function loadAllData() {
            const { data: projects, error: projErr } = await withRetry(() => supabaseClient.from('projects').select('*'));
            if (projErr) { console.error(projErr); showToast(isNetworkError(projErr) ? 'Нет соединения — проверьте сеть и обновите страницу' : 'Ошибка загрузки проектов', 'error'); return null; }

            const { data: frames, error: framesErr } = await withRetry(() => supabaseClient.from('frames').select('*'));
            if (framesErr) { console.error(framesErr); showToast(isNetworkError(framesErr) ? 'Нет соединения — проверьте сеть и обновите страницу' : 'Ошибка загрузки кадров', 'error'); return null; }

            const frameIds = frames.map(f => f.id);
            let taskProgressByFrame = {};
            let stages = [];
            if (frameIds.length > 0) {
                const { data: stageRows, error: stageErr } = await supabaseClient
                    .from('frame_stages')
                    .select('frame_id, stage_type, is_post_delivery, frame_tasks(checked)')
                    .in('frame_id', frameIds);
                if (stageErr) { console.error(stageErr); }
                stages = stageRows || [];
                stages.forEach(row => {
                    if (!taskProgressByFrame[row.frame_id]) taskProgressByFrame[row.frame_id] = { total: 0, completed: 0 };
                    const tasks = row.frame_tasks || [];
                    taskProgressByFrame[row.frame_id].total += tasks.length;
                    taskProgressByFrame[row.frame_id].completed += tasks.filter(t => t.checked).length;
                });
            }

            // Лог активности по всем кадрам сразу — здесь и берём "кто что делал"
            // (в базе нет отдельного поля "исполнитель задачи", поэтому активность
            // считаем по логу действий, а не по формальному назначению задач)
            const { data: activity, error: actErr } = await supabaseClient
                .from('frame_activity_log')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(500);
            if (actErr) console.error(actErr);

            // Сотрудники — для панели загрузки (кто сколько кадров ведёт прямо сейчас)
            const { data: profiles, error: profErr } = await supabaseClient
                .from('profiles')
                .select('id, full_name')
                .eq('is_active', true);
            if (profErr) console.error(profErr);

            // Все сотрудники (включая неактивных) — нужны, чтобы подписать создателя
            // заявки на проект в панели согласований, даже если он уже не работает
            const { data: allProfiles, error: allProfErr } = await supabaseClient
                .from('profiles')
                .select('id, full_name');
            if (allProfErr) console.error(allProfErr);

            // Клиенты — для панели "Новые клиенты". RLS уже сама ограничивает выборку
            // (менеджер видит только своих), но аналитика доступна лишь руководству,
            // которое и так видит всех клиентов
            const { data: clients, error: clientsErr } = await supabaseClient
                .from('clients')
                .select('id, name, created_at');
            if (clientsErr) console.error(clientsErr);

            // Сделки — для блоков "Сделки по менеджерам", "Источники лидов",
            // "Причины отказов". Таблица новая и может быть ещё не создана
            // (миграция применяется вручную) — тогда просто не показываем блоки.
            const { data: deals, error: dealsErr } = await supabaseClient.from('deals').select('*');
            if (dealsErr) console.error(dealsErr);

            // Платежи по сделкам — для блока "Финансы" (выручка/получено/дебиторка).
            // Таблица новая, как и deals — не считаем ошибкой, если её ещё нет.
            const { data: payments, error: paymentsErr } = await supabaseClient.from('deal_payments').select('*');
            if (paymentsErr) console.error(paymentsErr);

            // Расходы на рекламу по каналам — для CAC в блоке "Финансы". Тоже новая
            // таблица, применяется отдельной миграцией — не считаем ошибкой, если
            // её ещё нет.
            const { data: marketingExpenses, error: expensesErr } = await supabaseClient.from('marketing_expenses').select('*');
            if (expensesErr) console.error(expensesErr);

            // Отпуска/больничные — для панели "Сейчас в отпуске" на вкладке "Сотрудники".
            const { data: leaves, error: leavesErr } = await supabaseClient.from('employee_leaves').select('*');
            if (leavesErr) console.error(leavesErr);

            return { projects, frames, taskProgressByFrame, activity: activity || [], stages, profiles: profiles || [], allProfiles: allProfiles || [], clients: clients || [], deals: deals || [], payments: payments || [], marketingExpenses: marketingExpenses || [], leaves: leaves || [] };
        }

        function renderStats(projects, frames, taskProgressByFrame, clients) {
            const totalProjects = projects.length;
            const activeProjects = projects.filter(p => !p.completed).length;
            const completedProjects = projects.filter(p => p.completed).length;
            const totalFrames = frames.length;
            const framesByStatus = { not_started: 0, in_progress: 0, done: 0 };
            frames.forEach(f => { framesByStatus[f.status] = (framesByStatus[f.status] || 0) + 1; });

            let totalTasks = 0, completedTasks = 0;
            Object.values(taskProgressByFrame).forEach(p => { totalTasks += p.total; completedTasks += p.completed; });
            const overallPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

            const onHoldCount = projects.filter(p => p.on_hold && !p.completed && p.approval_status !== 'pending').length;
            const pendingCount = projects.filter(p => p.approval_status === 'pending').length;
            const newClientsCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
            const newClientsCount = (clients || []).filter(c => c.created_at && new Date(c.created_at).getTime() >= newClientsCutoff).length;

            const cards = [
                { number: activeProjects, label: 'Активных проектов' },
                { number: completedProjects, label: 'Завершено проектов' },
                { number: totalFrames, label: 'Кадров всего' },
                { number: framesByStatus.in_progress || 0, label: 'Кадров в работе' },
                { number: framesByStatus.done || 0, label: 'Кадров готово' },
                { number: `${overallPercent}%`, label: 'Задач выполнено всего' },
                { number: onHoldCount, label: 'Проектов в стопе' },
                { number: pendingCount, label: 'На согласовании у CEO' },
                { number: newClientsCount, label: 'Новых клиентов за 30 дней' }
            ];
            document.getElementById('statsRow').innerHTML = cards.map(c => `
                <div class="stat-card">
                    <div class="stat-number">${c.number}</div>
                    <div class="stat-label">${c.label}</div>
                </div>
            `).join('');
        }

        // "Сдача в срок" — сравниваем completed_at кадра с его эффективным сроком
        // (свой due_date или, если не задан, дедлайн проекта). Считаем только кадры,
        // у которых вообще есть срок для сравнения — иначе метрика была бы неполной
        // и вводила бы в заблуждение.
        function renderOnTimeDelivery(frames, projects) {
            const panel = document.getElementById('onTimePanel');
            const projectMap = Object.fromEntries(projects.map(p => [p.id, p]));
            const evaluated = frames
                .filter(f => f.status === 'done' && f.completed_at)
                .map(f => ({ frame: f, delivery: getDeliveryStatus(f, projectMap[f.project_id] ? projectMap[f.project_id].deadline : null) }))
                .filter(x => x.delivery === 'on_time' || x.delivery === 'late');

            if (evaluated.length === 0) {
                panel.innerHTML = '<div class="panel-empty">Пока нет завершённых кадров со сроком сдачи для оценки</div>';
                return;
            }
            const onTime = evaluated.filter(x => x.delivery === 'on_time').length;
            const late = evaluated.length - onTime;
            const percent = Math.round((onTime / evaluated.length) * 100);
            const percentClass = percent >= 80 ? 'deadline-ok' : percent >= 50 ? 'deadline-soon' : 'deadline-urgent';

            const byProject = {};
            evaluated.forEach(({ frame, delivery }) => {
                const pid = frame.project_id;
                if (!byProject[pid]) byProject[pid] = { onTime: 0, late: 0 };
                byProject[pid][delivery === 'on_time' ? 'onTime' : 'late']++;
            });
            const rows = Object.entries(byProject)
                .map(([pid, counts]) => ({ project: projectMap[pid], ...counts, total: counts.onTime + counts.late }))
                .filter(r => r.project)
                .sort((a, b) => b.total - a.total);

            const summaryRow = `
                <div class="row">
                    <div>
                        <div class="row-title">Всего оценено: ${evaluated.length} завершённых кадров</div>
                        <div class="row-sub">${onTime} сдано в срок · ${late} с опозданием</div>
                    </div>
                    <span class="deadline-badge ${percentClass}">${percent}%</span>
                </div>`;
            const projectRows = rows.map(r => {
                const rowPercent = Math.round((r.onTime / r.total) * 100);
                const rowClass = r.late === 0 ? 'deadline-ok' : r.onTime === 0 ? 'deadline-urgent' : 'deadline-soon';
                return `
                <div class="row">
                    <div>
                        <div class="row-title">${escapeHtml(r.project.name)}</div>
                        <div class="row-sub">${r.onTime} в срок · ${r.late} с опозданием</div>
                    </div>
                    <span class="deadline-badge ${rowClass}">${rowPercent}%</span>
                </div>`;
            }).join('');
            panel.innerHTML = summaryRow + projectRows;
        }

        function renderDeadlines(projects) {
            const panel = document.getElementById('deadlinesPanel');
            const withDeadline = projects
                .filter(p => !p.completed && p.deadline)
                .map(p => ({ ...p, status: getDeadlineStatus(p.deadline) }))
                .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

            if (withDeadline.length === 0) {
                panel.innerHTML = '<div class="panel-empty">Нет активных проектов с дедлайном</div>';
                return;
            }
            panel.innerHTML = withDeadline.map(p => `
                <div class="row">
                    <div>
                        <div class="row-title">${escapeHtml(p.name)}</div>
                        <div class="row-sub">${formatDateRu(p.deadline)}</div>
                    </div>
                    <span class="deadline-badge deadline-${p.status}"><span class="badge-dot"></span>${getDeadlineLabel(p.status)}</span>
                </div>
            `).join('');
        }

        function renderActivityByPerson(activity) {
            const panel = document.getElementById('activityByPersonPanel');
            const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
            const counts = {};
            activity.forEach(entry => {
                if (!entry.actor_name) return;
                if (new Date(entry.created_at).getTime() < cutoff) return;
                counts[entry.actor_name] = (counts[entry.actor_name] || 0) + 1;
            });
            const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
            if (entries.length === 0) {
                panel.innerHTML = '<div class="panel-empty">Действий за последние 30 дней пока нет</div>';
                return;
            }
            const maxCount = entries[0][1];
            panel.innerHTML = entries.map(([name, count]) => `
                <div class="person-row">
                    <span class="person-name">${escapeHtml(name)}</span>
                    <div class="person-bar-track"><div class="person-bar-fill" style="width:${Math.round((count / maxCount) * 100)}%"></div></div>
                    <span class="person-count">${count} действ.</span>
                </div>
            `).join('');
        }

        // Платные/бесплатные правки — считаем по frame_stages.stage_type, группируем по проекту.
        // Прямая финансовая метрика: сколько доп. работы (за деньги и бесплатно) было по проекту.
        function renderRevisions(stages, frames, projects) {
            const panel = document.getElementById('revisionsPanel');
            const frameById = {};
            frames.forEach(f => { frameById[f.id] = f; });
            const projectById = {};
            projects.forEach(p => { projectById[p.id] = p; });

            const byProject = {};
            let totalPaid = 0, totalFree = 0;
            stages.forEach(s => {
                if (s.stage_type !== 'paid_revision' && s.stage_type !== 'free_revision') return;
                const frame = frameById[s.frame_id];
                if (!frame) return;
                const projectId = frame.project_id;
                if (!byProject[projectId]) byProject[projectId] = { paid: 0, free: 0 };
                if (s.stage_type === 'paid_revision') { byProject[projectId].paid++; totalPaid++; }
                else { byProject[projectId].free++; totalFree++; }
            });

            const summary = `<div class="row" style="background: var(--bg-secondary);">
                <div class="row-title">Итого по всем проектам</div>
                <div style="display:flex; gap:16px; font-family: var(--font-mono); font-size:12px;">
                    <span style="color: var(--danger);">Платных: ${totalPaid}</span>
                    <span style="color: var(--text-secondary);">Бесплатных: ${totalFree}</span>
                </div>
            </div>`;

            const entries = Object.entries(byProject)
                .filter(([, v]) => v.paid > 0 || v.free > 0)
                .sort((a, b) => b[1].paid - a[1].paid);

            if (entries.length === 0) {
                panel.innerHTML = summary + '<div class="panel-empty">Правок (платных/бесплатных) пока не было</div>';
                return;
            }
            panel.innerHTML = summary + entries.map(([projectId, v]) => {
                const project = projectById[projectId];
                return `<div class="row">
                    <div class="row-title">${escapeHtml(project ? project.name : 'Проект удалён')}</div>
                    <div style="display:flex; gap:16px; font-family: var(--font-mono); font-size:12px;">
                        <span style="color: var(--danger);">Платных: ${v.paid}</span>
                        <span style="color: var(--text-secondary);">Бесплатных: ${v.free}</span>
                    </div>
                </div>`;
            }).join('');
        }

        // Текущая загрузка по людям — сколько НЕзавершённых кадров сейчас назначено
        // на каждого (frames.assigned_to), а не что делали в прошлом (это уже
        // покрывает "Активность по сотрудникам" ниже)
        // Часы: план/факт по проектам и кто сколько часов записал (по ответственному за кадр)
        function renderHours(frames, projects, allProfiles) {
            const panel = document.getElementById('hoursPanel');
            if (!panel) return;
            const projectById = {}; projects.forEach(p => { projectById[p.id] = p; });
            const byProject = {}, byPerson = {};
            let totalSpent = 0, totalEst = 0;
            frames.forEach(f => {
                const spent = Number(f.spent_hours || 0);
                const est = (f.est_hours !== null && f.est_hours !== undefined) ? Number(f.est_hours) : 0;
                if (!spent && !est) return;
                if (!byProject[f.project_id]) byProject[f.project_id] = { spent: 0, est: 0 };
                byProject[f.project_id].spent += spent; byProject[f.project_id].est += est;
                totalSpent += spent; totalEst += est;
                const who = f.assigned_to || 'none';
                byPerson[who] = (byPerson[who] || 0) + spent;
            });
            const fmt = n => (Math.round(n * 10) / 10).toString();
            const entries = Object.entries(byProject).sort((a, b) => (b[1].spent - b[1].est) - (a[1].spent - a[1].est));
            if (entries.length === 0) {
                panel.innerHTML = '<div class="panel-empty">Часы пока не записывались — их можно вносить на карточке кадра в проекте</div>';
                return;
            }
            const nameOf = id => id === 'none' ? 'Без ответственного' : ((allProfiles || []).find(p => p.id === id) || {}).full_name || 'Сотрудник';
            const summary = `<div class="row" style="background: var(--bg-secondary);">
                <div class="row-title">Итого</div>
                <div style="font-family: var(--font-mono); font-size:12px;">факт ${fmt(totalSpent)} ч${totalEst ? ' / план ' + fmt(totalEst) + ' ч' : ''}</div>
            </div>`;
            const projRows = entries.map(([pid, v]) => {
                const over = v.est > 0 && v.spent > v.est;
                const proj = projectById[pid];
                return `<div class="row">
                    <div class="row-title">${escapeHtml(proj ? proj.name : 'Проект удалён')}</div>
                    <div style="font-family: var(--font-mono); font-size:12px; color:${over ? 'var(--danger)' : 'var(--text-secondary)'};">факт ${fmt(v.spent)} ч${v.est ? ' / план ' + fmt(v.est) + ' ч' : ''}${over ? ' · перерасход ' + fmt(v.spent - v.est) + ' ч' : ''}</div>
                </div>`;
            }).join('');
            const people = Object.entries(byPerson).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
            const peopleRows = people.length ? `<div class="row" style="background: var(--bg-secondary);"><div class="row-title">По исполнителям</div><div></div></div>` +
                people.map(([id, v]) => `<div class="row"><div class="row-title">${escapeHtml(nameOf(id))}</div><div style="font-family: var(--font-mono); font-size:12px; color: var(--text-secondary);">${fmt(v)} ч</div></div>`).join('') : '';
            panel.innerHTML = summary + projRows + peopleRows;
        }
        function renderWorkload(frames, profiles) {
            const panel = document.getElementById('workloadPanel');
            const profileById = {};
            profiles.forEach(p => { profileById[p.id] = p; });

            const counts = {};
            frames.forEach(f => {
                if (!f.assigned_to || f.status === 'done') return;
                counts[f.assigned_to] = (counts[f.assigned_to] || 0) + 1;
            });
            const entries = Object.entries(counts)
                .map(([id, count]) => ({ name: profileById[id] ? profileById[id].full_name : 'Неизвестный', count }))
                .sort((a, b) => b.count - a.count);

            if (entries.length === 0) {
                panel.innerHTML = '<div class="panel-empty">Пока никому не назначены кадры лично (назначает руководитель на странице проекта)</div>';
                return;
            }
            const maxCount = entries[0].count;
            panel.innerHTML = entries.map(e => `
                <div class="person-row">
                    <span class="person-name">${escapeHtml(e.name)}</span>
                    <div class="person-bar-track"><div class="person-bar-fill" style="width:${Math.round((e.count / maxCount) * 100)}%"></div></div>
                    <span class="person-count">${e.count} в работе</span>
                </div>
            `).join('');
        }

        function renderRecentActivity(activity, frames, projects) {
            const panel = document.getElementById('recentActivityPanel');
            if (activity.length === 0) {
                panel.innerHTML = '<div class="panel-empty">Изменений пока нет</div>';
                return;
            }
            const frameById = {};
            frames.forEach(f => { frameById[f.id] = f; });
            const projectById = {};
            projects.forEach(p => { projectById[p.id] = p; });

            panel.innerHTML = activity.slice(0, 60).map(entry => {
                const time = new Date(entry.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                const frame = frameById[entry.frame_id];
                const project = frame ? projectById[frame.project_id] : (entry.project_id ? projectById[entry.project_id] : null);
                const context = [project ? project.name : null, frame ? frame.name : null].filter(Boolean).join(' → ');
                return `<div class="log-entry">
                    <div class="log-time">${time}${entry.actor_name ? ' · ' + escapeHtml(entry.actor_name) : ''}</div>
                    <div class="log-desc">${escapeHtml(entry.description)}</div>
                    ${context ? `<div class="log-context">${escapeHtml(context)}</div>` : ''}
                </div>`;
            }).join('');
        }

        // Новые клиенты по месяцам — простой столбчатый график за последние 6 месяцев,
        // чтобы сразу видеть, растёт приток новых клиентов или проседает
        function renderNewClients(clients) {
            const panel = document.getElementById('newClientsPanel');
            const now = new Date();
            const months = [];
            for (let i = 5; i >= 0; i--) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleString('ru-RU', { month: 'short' }), count: 0 });
            }
            const monthByKey = Object.fromEntries(months.map(m => [m.key, m]));
            let withDate = 0;
            clients.forEach(c => {
                if (!c.created_at) return;
                const d = new Date(c.created_at);
                const key = `${d.getFullYear()}-${d.getMonth()}`;
                if (monthByKey[key]) { monthByKey[key].count++; withDate++; }
            });

            if (clients.length === 0) {
                panel.innerHTML = '<div class="panel-empty">Клиентов пока нет в базе</div>';
                return;
            }
            const maxCount = Math.max(1, ...months.map(m => m.count));
            const totalInPeriod = months.reduce((s, m) => s + m.count, 0);
            const chart = `<div class="month-chart">${months.map(m => `
                <div class="month-chart-col">
                    <span class="month-chart-count">${m.count || ''}</span>
                    <div class="month-chart-bar" style="height:${Math.round((m.count / maxCount) * 100)}%"></div>
                    <span class="month-chart-label">${m.label}</span>
                </div>
            `).join('')}</div>`;
            const foot = `<div class="month-chart-foot">Всего клиентов в базе: ${clients.length} · за 6 месяцев: ${totalInPeriod}</div>`;
            panel.innerHTML = chart + foot;
        }

        // Проекты "в стопе" — активные (не завершённые), но приостановленные.
        // Отдельный блок специально, чтобы не терялись среди обычных дедлайнов
        function renderOnHoldProjects(projects) {
            const panel = document.getElementById('onHoldPanel');
            const onHold = projects
                .filter(p => p.on_hold && !p.completed && p.approval_status !== 'pending')
                .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru'));

            if (onHold.length === 0) {
                panel.innerHTML = '<div class="panel-empty">Сейчас ни один проект не стоит на паузе</div>';
                return;
            }
            panel.innerHTML = onHold.map(p => `
                <div class="row">
                    <div>
                        <div class="row-title">${escapeHtml(p.name)}</div>
                        <div class="row-sub">${p.deadline ? 'Дедлайн: ' + formatDateRu(p.deadline) : 'Без дедлайна'}</div>
                    </div>
                    <span class="status-chip hold">На паузе</span>
                </div>
            `).join('');
        }

        // Проекты, заведённые менеджером и ожидающие решения CEO/арт-директора —
        // отдельный блок, чтобы согласования не терялись и было видно, кто и когда подал заявку
        function renderPendingApprovals(projects, allProfiles) {
            const panel = document.getElementById('pendingApprovalPanel');
            const profileById = Object.fromEntries(allProfiles.map(p => [p.id, p]));
            const pending = projects
                .filter(p => p.approval_status === 'pending')
                .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));

            if (pending.length === 0) {
                panel.innerHTML = '<div class="panel-empty">Нет проектов, ожидающих согласования</div>';
                return;
            }
            panel.innerHTML = pending.map(p => {
                const author = p.created_by && profileById[p.created_by] ? profileById[p.created_by].full_name : 'Неизвестно';
                return `
                <div class="row">
                    <div>
                        <div class="row-title">${escapeHtml(p.name)}</div>
                        <div class="row-sub">Заявка от: ${escapeHtml(author)}${p.created_at ? ' · ' + formatDateRu(p.created_at) : ''}</div>
                    </div>
                    <span class="status-chip pending">Ждёт решения</span>
                </div>`;
            }).join('');
        }

        // Сделки по менеджерам: сколько завёл, сколько выиграно, конверсия
        // (выиграно / (выиграно + проиграно) — сделки в работе не считаются,
        // иначе конверсия занижена просто потому что часть ещё не закрыта),
        // средний чек по выигранным и среднее время до закрытия в днях
        // (won_at - created_at — именно поэтому в базе есть won_at, а не
        // используется updated_at, которая едет при любой правке сделки).
        function renderDealManagers(deals, allProfiles) {
            const wrap = document.getElementById('dealManagersWrap');
            const panel = document.getElementById('dealManagersPanel');
            if (!deals || deals.length === 0) {
                panel.innerHTML = '<div class="panel-empty">Сделок пока нет — раздел появится, как только менеджеры начнут их заводить</div>';
                return;
            }
            const profileById = Object.fromEntries((allProfiles || []).map(p => [p.id, p]));
            const byManager = {};
            deals.forEach(d => {
                if (!byManager[d.manager_id]) byManager[d.manager_id] = [];
                byManager[d.manager_id].push(d);
            });
            const rows = Object.entries(byManager).map(([managerId, list]) => {
                const won = list.filter(d => d.stage === 'won');
                const lost = list.filter(d => d.stage === 'lost');
                const closed = won.length + lost.length;
                const conversion = closed > 0 ? Math.round((won.length / closed) * 100) : null;
                const pricedWon = won.filter(d => d.price != null);
                const avgPrice = pricedWon.length > 0 ? Math.round(pricedWon.reduce((s, d) => s + Number(d.price), 0) / pricedWon.length) : null;
                const cycleDays = won.filter(d => d.won_at && d.created_at).map(d => (new Date(d.won_at) - new Date(d.created_at)) / 86400000);
                const avgCycle = cycleDays.length > 0 ? Math.round(cycleDays.reduce((s, v) => s + v, 0) / cycleDays.length) : null;
                return {
                    name: (profileById[managerId] || {}).full_name || 'Неизвестно',
                    total: list.length, won: won.length, conversion, avgPrice, avgCycle
                };
            }).sort((a, b) => b.total - a.total);

            wrap.style.display = '';
            panel.innerHTML = `<div class="mgr-table">
                <div class="mgr-row mgr-head"><span>Менеджер</span><span>Сделок</span><span>Выиграно</span><span>Конверсия</span><span>Средний чек</span><span>Дней до закрытия</span></div>
                ${rows.map(r => `<div class="mgr-row">
                    <span>${escapeHtml(r.name)}</span>
                    <span>${r.total}</span>
                    <span>${r.won}</span>
                    <span>${r.conversion !== null ? r.conversion + '%' : '—'}</span>
                    <span>${r.avgPrice !== null ? r.avgPrice.toLocaleString('ru-RU') + ' ₽' : '—'}</span>
                    <span>${r.avgCycle !== null ? r.avgCycle : '—'}</span>
                </div>`).join('')}
            </div>`;
        }

        function renderCategoryBreakdown(panelId, items, key, labels) {
            const panel = document.getElementById(panelId);
            const counts = {};
            items.forEach(item => {
                const v = item[key];
                if (!v) return;
                counts[v] = (counts[v] || 0) + 1;
            });
            const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
            if (entries.length === 0) {
                panel.innerHTML = '<div class="panel-empty">Данных пока нет</div>';
                return;
            }
            const maxCount = entries[0][1];
            panel.innerHTML = entries.map(([key_, count]) => `
                <div class="person-row">
                    <span class="person-name">${escapeHtml(labels[key_] || key_)}</span>
                    <div class="person-bar-track"><div class="person-bar-fill" style="width:${Math.round((count / maxCount) * 100)}%"></div></div>
                    <span class="person-count">${count}</span>
                </div>
            `).join('');
        }

        // Кто сегодня в отпуске/на больничном — только реально согласованные
        // (pending/awaiting_ceo — ещё не решённые заявки, rejected — отклонённые,
        // их не показываем).
        function renderOnLeaveToday(leaves, allProfiles) {
            const panel = document.getElementById('onLeaveTodayPanel');
            const profileById = Object.fromEntries((allProfiles || []).map(p => [p.id, p]));
            const today = todayIso();
            const activeLeaves = (leaves || []).filter(l =>
                l.status !== 'pending' && l.status !== 'awaiting_ceo' && l.status !== 'rejected'
                && l.start_date <= today && l.end_date >= today
            );
            if (activeLeaves.length === 0) {
                panel.innerHTML = '<div class="panel-empty">Сегодня все на месте</div>';
                return;
            }
            panel.innerHTML = activeLeaves.map(l => {
                const emp = profileById[l.user_id];
                return `<div class="row">
                    <div>
                        <div class="row-title">${escapeHtml(emp ? emp.full_name : 'Сотрудник')}</div>
                        <div class="row-sub">${formatDateRu(l.start_date)} – ${formatDateRu(l.end_date)}</div>
                    </div>
                    <span class="vac-type-badge ${l.type}">${l.type === 'vacation' ? ICON.palm : ICON.pill} ${LEAVE_TYPE_LABELS[l.type] || l.type}</span>
                </div>`;
            }).join('');
        }

        // ====== Финансы: выручка (по выигранным сделкам) / получено (платежи) / дебиторка ======
        function renderFinanceSummary(deals, payments) {
            const panel = document.getElementById('financeSummaryPanel');
            const won = (deals || []).filter(d => d.stage === 'won');
            if (won.length === 0) {
                panel.innerHTML = '<div class="panel-empty">Пока нет выигранных сделок — здесь появится сводка по выручке</div>';
                return;
            }
            const receivedByDeal = {};
            (payments || []).forEach(p => { receivedByDeal[p.deal_id] = (receivedByDeal[p.deal_id] || 0) + Number(p.amount); });

            const revenue = won.reduce((s, d) => s + (Number(d.price) || 0), 0);
            const received = won.reduce((s, d) => s + (receivedByDeal[d.id] || 0), 0);
            const receivable = Math.max(0, revenue - received);

            const cards = [
                { number: revenue.toLocaleString('ru-RU') + ' ₽', label: 'Выручка (по выигранным сделкам)' },
                { number: received.toLocaleString('ru-RU') + ' ₽', label: 'Получено оплат' },
                { number: receivable.toLocaleString('ru-RU') + ' ₽', label: 'Дебиторка (не оплачено)' }
            ];
            panel.innerHTML = `<div class="stats" style="margin:0;">${cards.map(c => `
                <div class="stat-card"><div class="stat-number">${c.number}</div><div class="stat-label">${c.label}</div></div>
            `).join('')}</div>`;
        }

        function renderFinanceByMonth(payments) {
            const panel = document.getElementById('financeByMonthPanel');
            const now = new Date();
            const months = [];
            for (let i = 5; i >= 0; i--) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleString('ru-RU', { month: 'short' }), sum: 0 });
            }
            const monthByKey = Object.fromEntries(months.map(m => [m.key, m]));
            (payments || []).forEach(p => {
                const d = new Date(p.payment_date);
                const key = `${d.getFullYear()}-${d.getMonth()}`;
                if (monthByKey[key]) monthByKey[key].sum += Number(p.amount);
            });
            if (!payments || payments.length === 0) {
                panel.innerHTML = '<div class="panel-empty">Оплат пока не зафиксировано — заносятся в карточке сделки</div>';
                return;
            }
            const maxSum = Math.max(1, ...months.map(m => m.sum));
            const total = months.reduce((s, m) => s + m.sum, 0);
            const chart = `<div class="month-chart">${months.map(m => `
                <div class="month-chart-col">
                    <span class="month-chart-count">${m.sum ? Math.round(m.sum / 1000) + 'к' : ''}</span>
                    <div class="month-chart-bar" style="height:${Math.round((m.sum / maxSum) * 100)}%"></div>
                    <span class="month-chart-label">${m.label}</span>
                </div>
            `).join('')}</div>`;
            panel.innerHTML = chart + `<div class="month-chart-foot">За 6 месяцев получено: ${total.toLocaleString('ru-RU')} ₽</div>`;
        }

        function renderFinanceReceivables(deals, payments, allProfiles) {
            const panel = document.getElementById('financeReceivablesPanel');
            const profileById = Object.fromEntries((allProfiles || []).map(p => [p.id, p]));
            const receivedByDeal = {};
            (payments || []).forEach(p => { receivedByDeal[p.deal_id] = (receivedByDeal[p.deal_id] || 0) + Number(p.amount); });

            const rows = (deals || [])
                .filter(d => d.stage === 'won' && d.price)
                .map(d => ({ deal: d, received: receivedByDeal[d.id] || 0, remaining: Math.max(0, Number(d.price) - (receivedByDeal[d.id] || 0)) }))
                .filter(r => r.remaining > 0)
                .sort((a, b) => b.remaining - a.remaining);

            if (rows.length === 0) {
                panel.innerHTML = '<div class="panel-empty">Дебиторки нет — все выигранные сделки оплачены полностью</div>';
                return;
            }
            panel.innerHTML = rows.map(r => `
                <div class="row">
                    <div>
                        <div class="row-title">${escapeHtml(r.deal.title)}</div>
                        <div class="row-sub">${escapeHtml((profileById[r.deal.manager_id] || {}).full_name || 'Неизвестно')} · получено ${r.received.toLocaleString('ru-RU')} из ${Number(r.deal.price).toLocaleString('ru-RU')} ₽</div>
                    </div>
                    <span class="status-chip pending">${r.remaining.toLocaleString('ru-RU')} ₽</span>
                </div>
            `).join('');
        }

        // ====== Расходы на рекламу → CAC по каналам ======
        // Считаем два CAC: на лид (расход / все сделки с этим source, независимо
        // от стадии — это и есть "лиды пришли с канала") и на клиента (расход /
        // только выигранные) — второй показательнее, но по нему можно ошибочно
        // решить, что канал не работает, пока сделки ещё не закрылись, поэтому
        // оставляем оба.
        function populateExpenseChannelSelect() {
            const sel = document.getElementById('expenseChannel');
            if (!sel || sel.options.length > 0) return;
            sel.innerHTML = Object.keys(DEAL_SOURCE_LABELS).map(k => `<option value="${k}">${DEAL_SOURCE_LABELS[k]}</option>`).join('');
        }
        function toggleAddExpenseForm() {
            const form = document.getElementById('addExpenseForm');
            const show = form.style.display === 'none';
            form.style.display = show ? '' : 'none';
            if (show) {
                populateExpenseChannelSelect();
                const now = new Date();
                document.getElementById('expenseMonth').value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            }
        }
        async function addMarketingExpense() {
            const channel = document.getElementById('expenseChannel').value;
            const monthVal = document.getElementById('expenseMonth').value; // "2026-09"
            const amount = Number(document.getElementById('expenseAmount').value);
            const note = document.getElementById('expenseNote').value.trim() || null;
            if (!monthVal || !amount || amount <= 0) { showToast('Укажите месяц и сумму', 'error'); return; }
            const period_month = monthVal + '-01';
            const { error } = await supabaseClient.from('marketing_expenses').insert({ channel, period_month, amount, note, created_by: currentUser.id });
            if (error) { console.error(error); showToast('Не удалось сохранить расход', 'error'); return; }
            showToast('Расход добавлен', 'success');
            document.getElementById('expenseAmount').value = '';
            document.getElementById('expenseNote').value = '';
            ANALYTICS_DATA.marketingExpenses = (await supabaseClient.from('marketing_expenses').select('*')).data || ANALYTICS_DATA.marketingExpenses;
            renderMarketingExpenses(ANALYTICS_DATA.marketingExpenses, ANALYTICS_DATA.deals);
        }
        async function deleteMarketingExpense(id) {
            if (!confirm('Удалить эту запись о расходе?')) return;
            const { error } = await supabaseClient.from('marketing_expenses').delete().eq('id', id);
            if (error) { console.error(error); showToast('Не удалось удалить', 'error'); return; }
            ANALYTICS_DATA.marketingExpenses = (await supabaseClient.from('marketing_expenses').select('*')).data || [];
            renderMarketingExpenses(ANALYTICS_DATA.marketingExpenses, ANALYTICS_DATA.deals);
        }
        function renderMarketingExpenses(expenses, deals) {
            const wrap = document.getElementById('marketingExpensesWrap');
            const panel = document.getElementById('marketingExpensesPanel');
            const canManage = canManageMarketing(currentUser);
            document.getElementById('addExpenseBtn').style.display = canManage ? '' : 'none';
            if (!canManage && (!expenses || expenses.length === 0)) { wrap.style.display = 'none'; return; }
            wrap.style.display = '';

            if (!expenses || expenses.length === 0) {
                panel.innerHTML = '<div class="panel-empty">Расходов пока не внесено</div>';
                return;
            }
            const spendByChannel = {};
            expenses.forEach(e => { spendByChannel[e.channel] = (spendByChannel[e.channel] || 0) + Number(e.amount); });
            const leadsByChannel = {};
            const wonByChannel = {};
            (deals || []).forEach(d => {
                if (!d.source) return;
                leadsByChannel[d.source] = (leadsByChannel[d.source] || 0) + 1;
                if (d.stage === 'won') wonByChannel[d.source] = (wonByChannel[d.source] || 0) + 1;
            });
            const channels = Object.keys(spendByChannel).sort((a, b) => spendByChannel[b] - spendByChannel[a]);
            const totalSpend = channels.reduce((s, c) => s + spendByChannel[c], 0);

            const table = `<div class="mgr-table">
                <div class="mgr-row mgr-head"><span>Канал</span><span>Потрачено</span><span>Лидов</span><span>Выиграно</span><span>CAC / лид</span><span>CAC / клиент</span></div>
                ${channels.map(c => {
                    const spend = spendByChannel[c];
                    const leads = leadsByChannel[c] || 0;
                    const won = wonByChannel[c] || 0;
                    const cacLead = leads > 0 ? Math.round(spend / leads) : null;
                    const cacClient = won > 0 ? Math.round(spend / won) : null;
                    return `<div class="mgr-row">
                        <span>${DEAL_SOURCE_LABELS[c] || c}</span>
                        <span>${spend.toLocaleString('ru-RU')} ₽</span>
                        <span>${leads}</span>
                        <span>${won}</span>
                        <span>${cacLead !== null ? cacLead.toLocaleString('ru-RU') + ' ₽' : '—'}</span>
                        <span>${cacClient !== null ? cacClient.toLocaleString('ru-RU') + ' ₽' : '—'}</span>
                    </div>`;
                }).join('')}
            </div>
            <div class="month-chart-foot" style="padding:10px 20px 0;">Итого потрачено: ${totalSpend.toLocaleString('ru-RU')} ₽</div>`;

            const recentList = canManage ? `<div style="padding:14px 20px 4px;">
                ${[...expenses].sort((a, b) => b.period_month.localeCompare(a.period_month)).slice(0, 12).map(e => `
                <div class="row">
                    <div>
                        <div class="row-title">${DEAL_SOURCE_LABELS[e.channel] || e.channel} · ${Number(e.amount).toLocaleString('ru-RU')} ₽</div>
                        <div class="row-sub">${new Date(e.period_month).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}${e.note ? ' · ' + escapeHtml(e.note) : ''}</div>
                    </div>
                    <button class="row-remove-btn" onclick="deleteMarketingExpense('${e.id}')">${ICON.trash}</button>
                </div>`).join('')}
            </div>` : '';

            panel.innerHTML = table + recentList;
        }

        // ====== Качество: правки после сдачи + оценка клиента ======
        function renderQualityRevisions(stages, frames, projects) {
            const panel = document.getElementById('qualityRevisionsPanel');
            const frameById = Object.fromEntries(frames.map(f => [f.id, f]));
            const projectById = Object.fromEntries(projects.map(p => [p.id, p]));

            const revisionStages = stages.filter(s => s.stage_type === 'paid_revision' || s.stage_type === 'free_revision');
            const postDelivery = revisionStages.filter(s => s.is_post_delivery);

            if (revisionStages.length === 0) {
                panel.innerHTML = '<div class="panel-empty">Правок пока не было</div>';
                return;
            }
            const percent = Math.round((postDelivery.length / revisionStages.length) * 100);
            const summary = `<div class="row" style="background: var(--bg-secondary);">
                <div class="row-title">После сдачи проекта — ${postDelivery.length} из ${revisionStages.length} правок (${percent}%)</div>
                <div style="font-size:12px; color: var(--text-secondary);">Правки, начатые уже после того, как проект отмечен завершённым</div>
            </div>`;

            const byProject = {};
            postDelivery.forEach(s => {
                const frame = frameById[s.frame_id];
                if (!frame) return;
                byProject[frame.project_id] = (byProject[frame.project_id] || 0) + 1;
            });
            const entries = Object.entries(byProject).sort((a, b) => b[1] - a[1]);
            if (entries.length === 0) {
                panel.innerHTML = summary + '<div class="panel-empty">Правок после сдачи не было — хороший знак</div>';
                return;
            }
            panel.innerHTML = summary + entries.map(([pid, count]) => `
                <div class="row">
                    <div class="row-title">${escapeHtml(projectById[pid] ? projectById[pid].name : 'Проект удалён')}</div>
                    <span class="status-chip urgent">${count} правок после сдачи</span>
                </div>
            `).join('');
        }

        function renderQualityRating(projects) {
            const summaryPanel = document.getElementById('qualityRatingSummaryPanel');
            const listPanel = document.getElementById('qualityRatingListPanel');
            const rated = projects.filter(p => p.client_rating);

            if (rated.length === 0) {
                summaryPanel.innerHTML = '<div class="panel-empty">Оценок пока нет — проставляются на завершённом проекте</div>';
                listPanel.innerHTML = '<div class="panel-empty">—</div>';
                return;
            }
            const avg = rated.reduce((s, p) => s + p.client_rating, 0) / rated.length;
            summaryPanel.innerHTML = `<div class="stats" style="margin:0;">
                <div class="stat-card"><div class="stat-number">${avg.toFixed(1)} ★</div><div class="stat-label">Средняя оценка (${rated.length} проектов)</div></div>
            </div>`;
            listPanel.innerHTML = rated
                .sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''))
                .map(p => `
                <div class="row">
                    <div>
                        <div class="row-title">${escapeHtml(p.name)}</div>
                        ${p.client_feedback ? `<div class="row-sub">${escapeHtml(p.client_feedback)}</div>` : ''}
                    </div>
                    <span class="status-chip ${p.client_rating >= 4 ? 'ok' : p.client_rating === 3 ? 'soon' : 'urgent'}">${'★'.repeat(p.client_rating)}${'☆'.repeat(5 - p.client_rating)}</span>
                </div>
            `).join('');
        }

        // ====== Экспорт активной вкладки в CSV (открывается в Excel) ======
        function csvEscape(v) {
            const s = String(v == null ? '' : v);
            return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        }
        function downloadCSV(filename, headers, rows) {
            const lines = [headers, ...rows].map(r => r.map(csvEscape).join(';'));
            const csv = '﻿' + lines.join('\r\n'); // BOM — чтобы Excel правильно показал кириллицу
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = filename;
            document.body.appendChild(a); a.click(); a.remove();
            URL.revokeObjectURL(url);
        }
        function exportCurrentTabCSV() {
            if (!ANALYTICS_DATA) { showToast('Данные ещё загружаются', 'error'); return; }
            const { projects, frames, deals, payments, stages, clients, leaves, profiles, allProfiles, activity } = ANALYTICS_DATA;
            const profileById = Object.fromEntries(allProfiles.map(p => [p.id, p]));
            const stamp = todayIso();

            if (currentAnalyticsTab === 'employees') {
                const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
                const activityCounts = {};
                activity.forEach(e => { if (new Date(e.created_at).getTime() >= cutoff) activityCounts[e.actor_name] = (activityCounts[e.actor_name] || 0) + 1; });
                const workloadCounts = {};
                frames.forEach(f => { if (f.assigned_to && f.status !== 'done') workloadCounts[f.assigned_to] = (workloadCounts[f.assigned_to] || 0) + 1; });
                const today = todayIso();
                const onLeaveIds = new Set(leaves.filter(l => l.status !== 'pending' && l.status !== 'awaiting_ceo' && l.status !== 'rejected' && l.start_date <= today && l.end_date >= today).map(l => l.user_id));
                const rows = profiles.map(p => [p.full_name, workloadCounts[p.id] || 0, activityCounts[p.full_name] || 0, onLeaveIds.has(p.id) ? 'да' : 'нет']);
                downloadCSV(`sotrudniki_${stamp}.csv`, ['Сотрудник', 'Кадров в работе', 'Действий за 30 дней', 'В отпуске/на больничном сегодня'], rows);
            } else if (currentAnalyticsTab === 'projects') {
                const projectById = Object.fromEntries(projects.map(p => [p.id, p]));
                const revByProject = {};
                stages.forEach(s => {
                    if (s.stage_type !== 'paid_revision' && s.stage_type !== 'free_revision') return;
                    const frame = frames.find(f => f.id === s.frame_id);
                    if (!frame) return;
                    if (!revByProject[frame.project_id]) revByProject[frame.project_id] = { paid: 0, free: 0 };
                    revByProject[frame.project_id][s.stage_type === 'paid_revision' ? 'paid' : 'free']++;
                });
                const rows = projects.map(p => {
                    const rev = revByProject[p.id] || { paid: 0, free: 0 };
                    return [p.name, p.completed ? 'завершён' : (p.on_hold ? 'в стопе' : 'в работе'), p.deadline ? formatDateRu(p.deadline) : '', rev.paid, rev.free];
                });
                downloadCSV(`proekty_${stamp}.csv`, ['Проект', 'Статус', 'Дедлайн', 'Платных правок', 'Бесплатных правок'], rows);
            } else if (currentAnalyticsTab === 'clients') {
                const clientById = Object.fromEntries(clients.map(c => [c.id, c]));
                const rows = deals.map(d => [
                    d.title, (clientById[d.client_id] || {}).name || '', (profileById[d.manager_id] || {}).full_name || '',
                    d.stage, d.source ? (DEAL_SOURCE_LABELS[d.source] || d.source) : '', d.price || '',
                    d.lost_reason_category ? (DEAL_LOST_REASON_LABELS[d.lost_reason_category] || d.lost_reason_category) : '',
                    d.created_at ? formatDateRu(d.created_at) : ''
                ]);
                downloadCSV(`sdelki_${stamp}.csv`, ['Сделка', 'Клиент', 'Менеджер', 'Стадия', 'Источник', 'Цена', 'Причина отказа', 'Создана'], rows);
            } else if (currentAnalyticsTab === 'finance') {
                const receivedByDeal = {};
                payments.forEach(p => { receivedByDeal[p.deal_id] = (receivedByDeal[p.deal_id] || 0) + Number(p.amount); });
                const rows = deals.filter(d => d.stage === 'won').map(d => {
                    const received = receivedByDeal[d.id] || 0;
                    return [d.title, (profileById[d.manager_id] || {}).full_name || '', d.price || 0, received, Math.max(0, (Number(d.price) || 0) - received)];
                });
                downloadCSV(`finansy_${stamp}.csv`, ['Сделка', 'Менеджер', 'Стоимость', 'Получено', 'Остаток'], rows);
            } else if (currentAnalyticsTab === 'quality') {
                const revByProject = {};
                stages.forEach(s => {
                    if (!s.is_post_delivery || (s.stage_type !== 'paid_revision' && s.stage_type !== 'free_revision')) return;
                    const frame = frames.find(f => f.id === s.frame_id);
                    if (!frame) return;
                    revByProject[frame.project_id] = (revByProject[frame.project_id] || 0) + 1;
                });
                const rows = projects.filter(p => p.completed).map(p => [
                    p.name, p.completed_at ? formatDateRu(p.completed_at) : '', p.client_rating || '', p.client_feedback || '', revByProject[p.id] || 0
                ]);
                downloadCSV(`kachestvo_${stamp}.csv`, ['Проект', 'Дата сдачи', 'Оценка', 'Отзыв', 'Правок после сдачи'], rows);
            }
        }

        let currentAnalyticsTab = 'employees';
        let ANALYTICS_DATA = null;
        function switchAnalyticsTab(tab) {
            currentAnalyticsTab = tab;
            document.querySelectorAll('.analytics-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
            document.querySelectorAll('.analytics-tab-panel').forEach(panel => {
                panel.style.display = panel.dataset.tabPanel === tab ? '' : 'none';
            });
            try { localStorage.setItem('analyticsActiveTab', tab); } catch (e) { /* игнор */ }
        }

        document.addEventListener('DOMContentLoaded', async function() {
            loadTheme();
            const ok = await requireAuth();
            if (!ok) return;
            initDeadlineReminders(currentUser);

            if (!canViewAnalytics(currentUser)) {
                document.getElementById('noAccess').style.display = 'block';
                return;
            }
            document.getElementById('pageContainer').style.display = 'block';

            let savedTab = 'employees';
            try { savedTab = localStorage.getItem('analyticsActiveTab') || 'employees'; } catch (e) { /* игнор */ }
            switchAnalyticsTab(savedTab);

            const data = await loadAllData();
            if (!data) return;
            ANALYTICS_DATA = data;
            const { projects, frames, taskProgressByFrame, activity, stages, profiles, allProfiles, clients, deals, payments, marketingExpenses, leaves } = data;

            renderStats(projects, frames, taskProgressByFrame, clients);
            renderDeadlines(projects);
            renderActivityByPerson(activity);
            renderRevisions(stages, frames, projects);
            renderHours(frames, projects, allProfiles);
            renderWorkload(frames, profiles);
            renderOnLeaveToday(leaves, allProfiles);
            renderOnTimeDelivery(frames, projects);
            renderNewClients(clients);
            renderOnHoldProjects(projects);
            renderPendingApprovals(projects, allProfiles);
            renderDealManagers(deals, allProfiles);
            renderCategoryBreakdown('dealSourcesPanel', deals, 'source', DEAL_SOURCE_LABELS);
            renderCategoryBreakdown('dealLostReasonsPanel', deals.filter(d => d.stage === 'lost'), 'lost_reason_category', DEAL_LOST_REASON_LABELS);
            renderRecentActivity(activity, frames, projects);
            renderFinanceSummary(deals, payments);
            renderFinanceByMonth(payments);
            renderFinanceReceivables(deals, payments, allProfiles);
            renderMarketingExpenses(marketingExpenses, deals);
            renderQualityRevisions(stages, frames, projects);
            renderQualityRating(projects);
        });
    
