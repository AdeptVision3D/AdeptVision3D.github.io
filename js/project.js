        let currentUser = null;

        async function requireAuth() {
            const user = await initAuthedPage();
            if (!user) return false;
            applyRolePermissions();
            return true;
        }

        function applyRolePermissions() {
            const canManage = hasAdminAccess(currentUser) || ['lead', 'art_director', 'ceo'].includes(currentUser.role);
            const newBtn = document.getElementById('newFrameBtn');
            if (newBtn) newBtn.style.display = canManage ? '' : 'none';
            ['bulkFramesBtn', 'editProjectHolstBtn'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = canManage ? '' : 'none'; });
        }

        const urlParams = new URLSearchParams(window.location.search);
        const projectId = urlParams.get('id'); // теперь это uuid-строка, а не число

        // Проверка доступа: руководители/админ видят и открывают любой проект всегда.
        // Остальным вход закрыт, если у проекта назначена команда, а их в ней нет
        // (нет назначенной команды вообще — значит проект открыт всем, как раньше).
        async function checkProjectAccess() {
            const canManage = hasAdminAccess(currentUser) || ['lead', 'art_director', 'ceo'].includes(currentUser.role);
            if (canManage) return true;

            const { data: members, error } = await supabaseClient
                .from('project_members')
                .select('user_id')
                .eq('project_id', projectId);
            if (error) {
                // Не смогли проверить команду — не блокируем (как и раньше, до этой проверки)
                console.error(error);
                return true;
            }
            if (!members || members.length === 0) return true;
            const isMember = members.some(m => m.user_id === currentUser.id);
            if (!isMember) {
                window.location.href = 'index.html?denied=1';
                return false;
            }
            return true;
        }

        // ====== РАБОТА С ДАННЫМИ ЧЕРЕЗ SUPABASE ======

        async function getProject() {
            // withRetry — при обрыве связи (не при обычной ошибке БД) делает пару
            // повторных попыток вместо того, чтобы сразу показать пустую страницу
            const { data, error } = await withRetry(() => supabaseClient
                .from('projects')
                .select('*')
                .eq('id', projectId)
                .single());
            if (error) {
                console.error(error);
                return null;
            }
            return data;
        }

        // Сотрудники для назначения ответственного за кадр ("Моё") — загружаем один раз
        let allProfilesCache = [];
        // Кто сейчас в отпуске/на больничном — чтобы серым показать в селекте назначения
        let currentLeaveMap = {};
        async function loadProfilesCache() {
            const { data, error } = await supabaseClient.from('profiles').select('id, full_name').eq('is_active', true).order('full_name', { ascending: true });
            if (error) { console.error(error); return; }
            allProfilesCache = data || [];
            currentLeaveMap = await fetchCurrentLeaveMap();
        }

        async function assignFrame(frameId, userId) {
            const { error } = await supabaseClient.from('frames').update({ assigned_to: userId || null }).eq('id', frameId);
            if (error) {
                const msg = isNetworkError(error) ? 'Нет соединения — попробуйте ещё раз' : 'Не удалось назначить исполнителя';
                console.error(error); showToast(msg, 'error'); return;
            }
            const assignee = userId ? allProfilesCache.find(p => p.id === userId) : null;
            logFrameActivity(frameId, 'assign', assignee ? `Назначен исполнитель: ${assignee.full_name}` : 'Исполнитель снят');
            showToast(userId ? 'Исполнитель назначен' : 'Исполнитель снят', 'success');
            renderFrames();
        }

        // Срок сдачи конкретного кадра (если пусто — используется срок проекта).
        // Быстрое редактирование через prompt(), как и у срока проекта на главной.
        async function editFrameDueDate(frameId, currentDueIso) {
            let currentDisplay = '';
            if (currentDueIso) {
                const [y, m, d] = currentDueIso.split('-');
                currentDisplay = `${d}.${m}.${y}`;
            }
            const raw = prompt('Срок сдачи кадра (ДД.ММ.ГГГГ), пусто — использовать срок проекта:', currentDisplay);
            if (raw === null) return; // отмена

            let dueIso = null;
            if (raw.trim()) {
                const parts = raw.trim().split('.');
                if (parts.length !== 3) { showToast('Неверный формат даты', 'error'); return; }
                const [d, m, y] = parts;
                dueIso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
            }
            const { error } = await supabaseClient.from('frames').update({ due_date: dueIso }).eq('id', frameId);
            if (error) { console.error(error); showToast('Не удалось изменить срок', 'error'); return; }
            logFrameActivity(frameId, 'due_date_change', dueIso ? `Установлен срок сдачи кадра: ${formatDateRu(dueIso)}` : 'Срок сдачи кадра сброшен (используется срок проекта)');
            showToast('Срок обновлён', 'success');
            renderFrames();
        }

        async function getFrames() {
            const { data, error } = await withRetry(() => supabaseClient
                .from('frames')
                .select('*')
                .eq('project_id', projectId)
                .order('created_at', { ascending: false }));
            if (error) {
                console.error(error);
                showToast(isNetworkError(error) ? 'Нет соединения — проверьте сеть и обновите страницу' : 'Ошибка загрузки кадров', 'error');
                return [];
            }
            return data;
        }

        // Догружает этапы и задачи всех кадров проекта одним запросом (frame_stages → frame_tasks)
        // и считает для каждого кадра "выполнено/всего" — теперь у каждого кадра своё число задач,
        // так как задачи и этапы редактируются индивидуально (см. frame.html).
        async function getFramesProgress(frameIds) {
            if (frameIds.length === 0) return {};
            const { data, error } = await supabaseClient
                .from('frame_stages')
                .select('frame_id, stage_type, frame_tasks(checked)')
                .in('frame_id', frameIds);
            if (error) {
                console.error(error);
                return {};
            }
            const progress = {};
            (data || []).forEach(stageRow => {
                if (!progress[stageRow.frame_id]) progress[stageRow.frame_id] = { total: 0, completed: 0, freeRev: 0, paidRev: 0 };
                if (stageRow.stage_type === 'free_revision') progress[stageRow.frame_id].freeRev++;
                if (stageRow.stage_type === 'paid_revision') progress[stageRow.frame_id].paidRev++;
                const tasks = stageRow.frame_tasks || [];
                progress[stageRow.frame_id].total += tasks.length;
                progress[stageRow.frame_id].completed += tasks.filter(t => t.checked).length;
            });
            return progress;
        }

        async function createFrame() {
            const name = prompt('Название кадра:');
            if (!name) return;

            const { error } = await supabaseClient.from('frames').insert({
                project_id: projectId,
                name: name,
                status: 'not_started'
            });

            if (error) {
                console.error(error);
                showToast('Не удалось создать кадр', 'error');
                return;
            }
            showToast('Кадр создан!', 'success');
            renderFrames();
        }

        async function deleteFrame(frameId) {
            if (!confirm('Удалить кадр?')) return;
            const { error } = await supabaseClient.from('frames').delete().eq('id', frameId);
            if (error) {
                console.error(error);
                showToast('Не удалось удалить кадр', 'error');
                return;
            }
            showToast('Кадр удалён', 'warning');
            renderFrames();
        }

        async function setFrameStatus(frameId, status) {
            // completed_at фиксируем/сбрасываем вместе со статусом — нужно для
            // расчёта "сдано в срок / с опозданием" (см. getDeliveryStatus в common.js)
            const updates = { status: status };
            updates.completed_at = status === 'done' ? new Date().toISOString() : null;
            const { error } = await supabaseClient
                .from('frames')
                .update(updates)
                .eq('id', frameId);
            if (error) {
                const msg = isNetworkError(error) ? 'Нет соединения — попробуйте ещё раз' : 'Не удалось обновить статус';
                console.error(error); showToast(msg, 'error'); return;
            }
            logFrameActivity(frameId, 'frame_status_change', `Статус кадра изменён: ${getFrameStatusLabel(status)}`);
            showToast(`Статус: ${getFrameStatusLabel(status)}`, 'success');
            renderFrames();
        }

        // "Горящий" кадр — ручная пометка приоритета, не связана со статусом/дедлайном
        // проекта. Ставить/снимать может любой (как и смену статуса выше) — это просто
        // сигнал "обратите внимание", а не право доступа.
        async function toggleFramePriority(frameId, currentlyPriority) {
            const { error } = await supabaseClient
                .from('frames')
                .update({ is_priority: !currentlyPriority })
                .eq('id', frameId);
            if (error) {
                console.error(error);
                showToast('Не удалось изменить приоритет', 'error');
                return;
            }
            logFrameActivity(frameId, 'priority_toggle', !currentlyPriority ? 'Кадр отмечен как горящий' : 'Пометка приоритета снята');
            showToast(!currentlyPriority ? 'Кадр отмечен как горящий' : 'Пометка приоритета снята', 'success');
            renderFrames();
        }

        function getFrameStatusLabel(status) {
            if (status === 'done') return 'Готов';
            if (status === 'in_progress') return 'В работе';
            return 'Не начат';
        }
        function getFrameStatusClass(status) {
            if (status === 'done') return 'status-done';
            if (status === 'in_progress') return 'status-in-progress';
            return 'status-not-started';
        }

        async function renderFrames() {
            await renderFramesList();
            renderBoard();
            applyFrameView();
        }
        async function renderFramesList() {
            const project = await getProject();
            if (!project) {
                document.getElementById('projectTitle').textContent = 'Проект не найден';
                return;
            }
            document.getElementById('projectTitle').textContent = project.name;
            updateProjectHolstLink(project);

            const frames = await getFrames();
            // Горящие кадры — наверх списка; порядок внутри каждой группы сохраняется
            // (Array.sort в JS стабилен), created_at desc уже задан запросом в getFrames()
            frames.sort((a, b) => (b.is_priority ? 1 : 0) - (a.is_priority ? 1 : 0));
            const progressMap = await getFramesProgress(frames.map(f => f.id));
            frameCache = frames; projectCache = project; progressCache = progressMap;
            const canManageFrames = currentUser && (hasAdminAccess(currentUser) || ['lead', 'art_director', 'ceo'].includes(currentUser.role));
            const grid = document.getElementById('framesGrid');
            const empty = document.getElementById('emptyState');
            if (frames.length === 0) {
                grid.innerHTML = '';
                empty.style.display = 'block';
            } else {
                empty.style.display = 'none';
                grid.innerHTML = frames.map(f => {
                    const statusLabel = getFrameStatusLabel(f.status);
                    const statusClass = getFrameStatusClass(f.status);
                    const createdDisplay = f.created_at ? new Date(f.created_at).toLocaleDateString('ru-RU') : '';
                    const frameProgress = progressMap[f.id] || { total: 0, completed: 0 };
                    const progressPercent = frameProgress.total > 0 ? Math.round((frameProgress.completed / frameProgress.total) * 100) : 0;
                    const isPriority = !!f.is_priority;
                    const effectiveDue = getEffectiveDueDate(f, project.deadline);
                    const dueStatus = effectiveDue ? getDeadlineStatus(effectiveDue) : null;
                    const delivery = getDeliveryStatus(f, project.deadline);
                    const dueTitle = f.due_date ? 'Свой срок кадра (не срок проекта)' : 'Срок по умолчанию — дедлайн проекта';
                    const assignee = f.assigned_to ? allProfilesCache.find(p => p.id === f.assigned_to) : null;
                    const freeRev = frameProgress.freeRev || 0, paidRev = frameProgress.paidRev || 0;
                    const revBadge = (freeRev + paidRev) > 0 ? `<span class="rev-badge" title="Раунды правок: бесплатных ${freeRev}, платных ${paidRev}">Правки: ${freeRev + paidRev}${paidRev ? ` · платных ${paidRev}` : ''}</span>` : '';
                    const spentH = Number(f.spent_hours || 0), estH = (f.est_hours !== null && f.est_hours !== undefined) ? Number(f.est_hours) : null;
                    const hoursBadge = (spentH > 0 || estH !== null) ? `<span class="hours-badge ${estH !== null && spentH > estH ? 'over' : ''}" title="Потрачено / план, часов">${spentH}${estH !== null ? ' / ' + estH : ''} ч</span>` : '';
                    const assigneeBadge = assignee ? `<span class="assignee-badge">${ICON.team} ${escapeHtml(assignee.full_name)}</span>` : '';
                    const assigneeSelect = canManageFrames ? `
                        <select class="assignee-select" onchange="assignFrame('${f.id}', this.value)" title="Назначить ответственного">
                            <option value="">Не назначено</option>
                            ${allProfilesCache.map(p => {
                                // <option> не поддерживает HTML/SVG-иконки — единственный способ показать
                                // тип отсутствия внутри нативного select это текстовый маркер (эмодзи).
                                const leave = currentLeaveMap[p.id];
                                const marker = leave ? (leave.type === 'vacation' ? ' 🌴 в отпуске' : ' 💊 на больничном') : '';
                                const style = leave ? ' style="color: var(--text-secondary);"' : '';
                                return `<option value="${p.id}" ${f.assigned_to === p.id ? 'selected' : ''}${style}>${escapeHtml(p.full_name)}${marker}</option>`;
                            }).join('')}
                        </select>` : '';
                    return `
                        <div class="frame-card viewfinder-card ${isPriority ? 'priority' : ''}">
                            <div class="frame-header">
                                <div class="frame-header-text">
                                    <div class="frame-title">${escapeHtml(f.name)}</div>
                                    <div class="frame-meta">
                                        <span style="display:inline-flex;align-items:center;gap:5px;">${ICON.calendar}${createdDisplay}</span>
                                        <span class="status-badge ${statusClass}"><span class="badge-dot"></span>${statusLabel}</span>
                                        <span>${frameProgress.completed}/${frameProgress.total} задач</span>
                                        ${revBadge}${hoursBadge}
                                        ${isPriority ? `<span class="priority-badge">${ICON.warning} Горит</span>` : ''}
                                        ${f.status !== 'done' && effectiveDue ? `<span class="deadline-badge deadline-${dueStatus}" title="${dueTitle}"><span class="badge-dot"></span>${getDeadlineLabel(dueStatus)}: ${formatDateRu(effectiveDue)}</span>` : ''}
                                        ${delivery === 'on_time' ? `<span class="delivery-badge delivery-on_time">✓ Сдано в срок</span>` : ''}
                                        ${delivery === 'late' ? `<span class="delivery-badge delivery-late">⚠ Сдано с опозданием</span>` : ''}
                                        ${!canManageFrames ? assigneeBadge : ''}
                                    </div>
                                </div>
                                <div class="progress-ring" style="--percent:${progressPercent}"><span class="progress-ring-label">${progressPercent}%</span></div>
                            </div>
                            <div class="frame-body">
                                ${canManageFrames ? `<div style="margin-bottom:12px;">${assigneeSelect}</div>` : ''}
                                <div class="frame-actions">
                                    <a href="frame.html?project=${projectId}&frame=${f.id}" class="btn btn-primary">Открыть чек-лист</a>
                                    <button class="btn btn-secondary ${isPriority ? 'btn-priority-on' : ''}" onclick="toggleFramePriority('${f.id}', ${isPriority})" title="${isPriority ? 'Снять пометку приоритета' : 'Отметить как горящий'}">${ICON.warning}</button>
                                    <button class="btn btn-secondary" onclick="setFrameStatus('${f.id}', 'in_progress')">${ICON.clock} В работу</button>
                                    <button class="btn btn-secondary" onclick="setFrameStatus('${f.id}', 'done')">${ICON.check} Готов</button>
                                    ${safeHttpUrl(f.holst_url) ? `<a class="btn btn-secondary" href="${escapeHtml(safeHttpUrl(f.holst_url))}" target="_blank" rel="noopener noreferrer" title="Материалы кадра в Holst">Holst</a>` : ''}
                                    <button class="btn btn-secondary" onclick="editFrameHolst('${f.id}')" title="${f.holst_url ? 'Изменить ссылку на Holst' : 'Добавить ссылку на Holst'}">${f.holst_url ? ICON.edit : 'Holst'}</button>
                                    <button class="btn btn-secondary" onclick="logFrameHours('${f.id}')" title="Записать потраченные часы">${ICON.clock} Часы</button>
                                    ${canManageFrames ? `<button class="btn btn-secondary" onclick="setFrameEstimate('${f.id}')" title="Плановые часы на кадр">План, ч</button>` : ''}
                                    ${canManageFrames ? `<button class="btn btn-secondary" onclick="editFrameDueDate('${f.id}', ${f.due_date ? `'${f.due_date}'` : 'null'})" title="Срок сдачи кадра">${ICON.calendar} Срок</button>` : ''}
                                    ${canManageFrames ? `<button class="btn btn-secondary" onclick="deleteFrame('${f.id}')" style="color: var(--danger);">${ICON.trash}</button>` : ''}
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }

        // ====== Журнал изменений по проекту — объединяет записи по всем кадрам проекта
        // и записи уровня самого проекта (стоп/снятие стопа, завершение, команда) ======
        async function openProjectLogModal() {
            document.getElementById('projectLogModal').classList.add('active');
            const listEl = document.getElementById('projectLogModalList');
            listEl.innerHTML = `<p style="color: var(--text-secondary); font-size: 13px; text-align: center; padding: 20px 0;">${randomLoadingPhrase()}</p>`;

            const frames = await getFrames();
            const frameIds = frames.map(f => f.id);
            const frameNameMap = Object.fromEntries(frames.map(f => [f.id, f.name]));

            const queries = [
                supabaseClient.from('frame_activity_log').select('*').eq('project_id', projectId).order('created_at', { ascending: false }).limit(100)
            ];
            if (frameIds.length > 0) {
                queries.push(supabaseClient.from('frame_activity_log').select('*').in('frame_id', frameIds).order('created_at', { ascending: false }).limit(200));
            }
            const results = await Promise.all(queries);
            const failed = results.find(r => r.error);
            if (failed) {
                console.error(failed.error);
                listEl.innerHTML = '<p style="color: var(--danger); font-size: 13px;">Не удалось загрузить журнал</p>';
                return;
            }

            let entries = results.flatMap(r => r.data || []);
            const seen = new Set();
            entries = entries.filter(e => { if (seen.has(e.id)) return false; seen.add(e.id); return true; });
            entries.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            entries = entries.slice(0, 200);

            if (entries.length === 0) {
                listEl.innerHTML = '<p style="color: var(--text-secondary); font-size: 13px; text-align: center; padding: 40px 0;">Изменений пока нет</p>';
                return;
            }
            listEl.innerHTML = entries.map(entry => {
                const time = new Date(entry.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                const frameLabel = entry.frame_id ? (frameNameMap[entry.frame_id] || 'Удалённый кадр') : 'Проект';
                return `<div class="log-entry"><div class="log-time">${time}${entry.actor_name ? ' · ' + escapeHtml(entry.actor_name) : ''} · <span class="log-frame-tag">${escapeHtml(frameLabel)}</span></div><div class="log-desc">${escapeHtml(entry.description)}</div></div>`;
            }).join('');
        }
        function closeProjectLogModal() { document.getElementById('projectLogModal').classList.remove('active'); }

        // ====== Рабочий пакет: Holst, часы, несколько кадров, доска ======
        let frameCache = [], projectCache = null, progressCache = {};
        let frameView = 'list';
        try { frameView = localStorage.getItem('decardFrameView') === 'board' ? 'board' : 'list'; } catch (e) {}

        function updateProjectHolstLink(project) {
            const a = document.getElementById('projectHolstLink');
            if (!a) return;
            const url = safeHttpUrl(project && project.holst_url);
            if (url) { a.href = url; a.style.display = ''; } else { a.style.display = 'none'; }
        }

        async function editProjectHolst() {
            const current = (projectCache && projectCache.holst_url) || '';
            const raw = prompt('Ссылка на материалы проекта в Holst (пусто — убрать):', current);
            if (raw === null) return;
            const url = raw.trim() ? safeHttpUrl(raw) : '';
            if (raw.trim() && !url) { showToast('Это не похоже на ссылку', 'error'); return; }
            const { error } = await supabaseClient.from('projects').update({ holst_url: url || null }).eq('id', projectId);
            if (error) { console.error(error); showToast('Не удалось сохранить ссылку', 'error'); return; }
            showToast(url ? 'Ссылка сохранена' : 'Ссылка убрана', 'success');
            renderFrames();
        }

        async function editFrameHolst(frameId) {
            const f = frameCache.find(x => x.id === frameId);
            const raw = prompt('Ссылка на материалы кадра в Holst (пусто — убрать):', (f && f.holst_url) || '');
            if (raw === null) return;
            const url = raw.trim() ? safeHttpUrl(raw) : '';
            if (raw.trim() && !url) { showToast('Это не похоже на ссылку', 'error'); return; }
            const { error } = await supabaseClient.from('frames').update({ holst_url: url || null }).eq('id', frameId);
            if (error) { console.error(error); showToast('Не удалось сохранить ссылку', 'error'); return; }
            logFrameActivity(frameId, 'holst_link', url ? 'Добавлена/изменена ссылка на Holst' : 'Ссылка на Holst убрана');
            showToast(url ? 'Ссылка сохранена' : 'Ссылка убрана', 'success');
            renderFrames();
        }

        // Часы: потраченное время накапливается; плановые часы ставит руководитель
        function parseHours(raw) {
            const v = parseFloat(String(raw).replace(',', '.'));
            return (isFinite(v) && v >= 0 && v <= 1000) ? Math.round(v * 10) / 10 : null;
        }
        async function logFrameHours(frameId) {
            const f = frameCache.find(x => x.id === frameId);
            const raw = prompt('Сколько часов вы потратили на этот кадр? (например 2 или 1.5)', '');
            if (raw === null || !raw.trim()) return;
            const add = parseHours(raw);
            if (add === null || add <= 0 || add > 24) { showToast('Введите число часов от 0.1 до 24', 'error'); return; }
            const next = Math.round((Number((f && f.spent_hours) || 0) + add) * 10) / 10;
            const { error } = await supabaseClient.from('frames').update({ spent_hours: next }).eq('id', frameId);
            if (error) { console.error(error); showToast('Не удалось записать часы', 'error'); return; }
            logFrameActivity(frameId, 'hours_logged', `Записано часов: +${add} (всего ${next})`);
            showToast(`Записано: +${add} ч`, 'success');
            renderFrames();
        }
        async function setFrameEstimate(frameId) {
            const f = frameCache.find(x => x.id === frameId);
            const raw = prompt('Плановые часы на кадр (пусто — не задан):', (f && f.est_hours !== null && f.est_hours !== undefined) ? f.est_hours : '');
            if (raw === null) return;
            let est = null;
            if (raw.trim()) { est = parseHours(raw); if (est === null) { showToast('Введите число часов', 'error'); return; } }
            const { error } = await supabaseClient.from('frames').update({ est_hours: est }).eq('id', frameId);
            if (error) { console.error(error); showToast('Не удалось сохранить план', 'error'); return; }
            logFrameActivity(frameId, 'hours_estimate', est === null ? 'Плановые часы сброшены' : `Плановые часы: ${est}`);
            showToast('План сохранён', 'success');
            renderFrames();
        }

        // Несколько кадров списком
        function openBulkFrames() {
            document.getElementById('bulkFramesText').value = '';
            document.getElementById('bulkFramesCount').textContent = '';
            document.getElementById('bulkFramesModal').classList.add('active');
            setTimeout(() => document.getElementById('bulkFramesText').focus(), 50);
        }
        function closeBulkFrames() { document.getElementById('bulkFramesModal').classList.remove('active'); }
        function bulkNames() {
            return document.getElementById('bulkFramesText').value.split('\n').map(s => s.trim()).filter(Boolean);
        }
        async function submitBulkFrames() {
            const names = bulkNames();
            if (names.length === 0) { showToast('Впишите хотя бы одно название', 'error'); return; }
            if (names.length > 30) { showToast('За раз можно создать не больше 30 кадров', 'error'); return; }
            const btn = document.getElementById('bulkFramesSubmit');
            btn.disabled = true;
            const { error } = await supabaseClient.from('frames').insert(names.map(name => ({ project_id: projectId, name: name, status: 'not_started' })));
            btn.disabled = false;
            if (error) { console.error(error); showToast('Не удалось создать кадры', 'error'); return; }
            closeBulkFrames();
            showToast(`Создано кадров: ${names.length}`, 'success');
            renderFrames();
        }

        // Доска: колонки по статусу, перетаскивание карточек между колонками
        const BOARD_COLUMNS = [
            { status: 'not_started', title: 'Не начаты' },
            { status: 'in_progress', title: 'В работе' },
            { status: 'done', title: 'Готовы' }
        ];
        function renderBoard() {
            const board = document.getElementById('framesBoard');
            if (!board) return;
            const frames = frameCache;
            board.innerHTML = BOARD_COLUMNS.map(col => {
                const items = frames.filter(f => (f.status || 'not_started') === col.status);
                return `
                    <div class="board-col" ondragover="boardDragOver(event)" ondragleave="boardDragLeave(event)" ondrop="boardDrop(event, '${col.status}')">
                        <div class="board-col-head"><span>${col.title}</span><span class="board-col-count">${items.length}</span></div>
                        <div class="board-col-body">
                            ${items.length === 0 ? '<div class="board-empty">Пусто</div>' : items.map(boardCardHtml).join('')}
                        </div>
                    </div>`;
            }).join('');
        }
        function boardCardHtml(f) {
            const prog = progressCache[f.id] || { total: 0, completed: 0 };
            const pct = prog.total > 0 ? Math.round((prog.completed / prog.total) * 100) : 0;
            const due = f.status !== 'done' ? getEffectiveDueDate(f, projectCache && projectCache.deadline) : null;
            const dueStatus = due ? getDeadlineStatus(due) : null;
            const assignee = f.assigned_to ? allProfilesCache.find(p => p.id === f.assigned_to) : null;
            const rev = (prog.freeRev || 0) + (prog.paidRev || 0);
            return `
                <div class="board-card ${f.is_priority ? 'priority' : ''}" draggable="true" ondragstart="boardDragStart(event, '${f.id}')" ondragend="boardDragEnd(event)">
                    <a class="board-card-title" href="frame.html?project=${projectId}&frame=${f.id}" draggable="false">${escapeHtml(f.name)}</a>
                    <div class="board-card-meta">
                        <span class="board-pct">${pct}%</span>
                        ${f.is_priority ? '<span class="priority-badge">Горит</span>' : ''}
                        ${due ? `<span class="deadline-badge deadline-${dueStatus}"><span class="badge-dot"></span>${formatDateRu(due)}</span>` : ''}
                        ${rev > 0 ? `<span class="rev-badge">Правки: ${rev}</span>` : ''}
                    </div>
                    ${assignee ? `<div class="board-card-assignee">${escapeHtml(assignee.full_name)}</div>` : ''}
                </div>`;
        }
        let boardDragId = null;
        function boardDragStart(e, id) { boardDragId = id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); e.currentTarget.classList.add('dragging'); }
        function boardDragEnd(e) { e.currentTarget.classList.remove('dragging'); document.querySelectorAll('.board-col.drop').forEach(c => c.classList.remove('drop')); }
        function boardDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; e.currentTarget.classList.add('drop'); }
        function boardDragLeave(e) { if (!e.currentTarget.contains(e.relatedTarget)) e.currentTarget.classList.remove('drop'); }
        async function boardDrop(e, status) {
            e.preventDefault();
            e.currentTarget.classList.remove('drop');
            const id = boardDragId || e.dataTransfer.getData('text/plain');
            boardDragId = null;
            const f = frameCache.find(x => x.id === id);
            if (!f || (f.status || 'not_started') === status) return;
            await setFrameStatus(id, status);
        }
        function setFrameView(mode) {
            frameView = mode === 'board' ? 'board' : 'list';
            try { localStorage.setItem('decardFrameView', frameView); } catch (e) {}
            applyFrameView();
        }
        function applyFrameView() {
            const grid = document.getElementById('framesGrid'), board = document.getElementById('framesBoard');
            if (!grid || !board) return;
            const hasFrames = frameCache.length > 0;
            grid.style.display = (frameView === 'list' && hasFrames) ? '' : 'none';
            board.style.display = (frameView === 'board' && hasFrames) ? '' : 'none';
            document.getElementById('viewListBtn').classList.toggle('active', frameView === 'list');
            document.getElementById('viewBoardBtn').classList.toggle('active', frameView === 'board');
            const toolbar = document.querySelector('.frames-toolbar');
            if (toolbar) toolbar.style.display = hasFrames ? '' : 'none';
        }
        document.addEventListener('DOMContentLoaded', async function() {
            loadTheme();
            document.getElementById('emptyStateMascot').innerHTML = MASCOT_SVG;
            document.getElementById('bulkFramesText').addEventListener('input', () => { const n = bulkNames().length; document.getElementById('bulkFramesCount').textContent = n ? ('Будет создано кадров: ' + n) : ''; });
            document.getElementById('projectTitle').textContent = randomLoadingPhrase();
            const ok = await requireAuth();
            if (!ok) return;
            const allowed = await checkProjectAccess();
            if (!allowed) return;
            await loadProfilesCache();
            renderFrames();
            initDeadlineReminders(currentUser);
            showToast('Добро пожаловать!', 'success');
        });
    
