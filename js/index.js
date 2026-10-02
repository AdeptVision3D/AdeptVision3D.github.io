        let currentUser = null; // { id, full_name, role }

        // Проверяет вход и подгружает профиль (имя+роль). Если не вошли — отправляет на экран входа.
        // Общая часть (сессия/профиль/шапка/сайдбар) — в initAuthedPage() (common.js).
        async function requireAuth() {
            const user = await initAuthedPage({ showChangePin: true });
            if (!user) return false;
            applyRolePermissions();
            return true;
        }

        function applyRolePermissions() {
            const canManage = hasAdminAccess(currentUser) || ['lead', 'art_director', 'ceo'].includes(currentUser.role);
            // Менеджер только заводит новый проект после сделки (create-only) — дальше
            // им управляет производство, поэтому у него нет доступа к Аналитике и
            // редактированию/удалению существующих проектов (это остаётся в canManage).
            const canCreateProjects = canManage || currentUser.role === 'manager';
            // Единая проверка из common.js — включает тимлида (по решению Леонида:
            // добавлять/менять сотрудников может тимлид, арт-директор, CEO и админ).
            const canManageEmployees = canManageEmployeesRole(currentUser);
            const newBtn = document.getElementById('newProjectBtn');
            if (newBtn) newBtn.style.display = canCreateProjects ? '' : 'none';
            const employeesBtn = document.getElementById('employeesBtn');
            if (employeesBtn) employeesBtn.style.display = canManageEmployees ? '' : 'none';
            const analyticsBtn = document.getElementById('analyticsBtn');
            if (analyticsBtn) analyticsBtn.style.display = canManage ? '' : 'none';
        }

        // ====== Форма сотрудника: одна модалка на создание и редактирование ======
        // editingEmployeeId === null -> форма в режиме "Создать"; иначе -> "Сохранить" правки этого id
        let editingEmployeeId = null;
        let allEmployeesCache = [];

        function openAddEmployeeModal() {
            editingEmployeeId = null;
            document.getElementById('empModalTitle').textContent = 'Добавить сотрудника';
            document.getElementById('empSubmitBtn').textContent = 'Создать';
            document.getElementById('newEmpName').value = '';
            document.getElementById('newEmpRole').value = 'artist';
            document.getElementById('newEmpEmail').value = '';
            document.getElementById('newEmpPin').value = '';
            document.getElementById('empPinLabel').textContent = 'PIN (минимум 6 символов)';
            document.getElementById('newEmpIsAdmin').checked = false;
            document.getElementById('newEmpTeamGroup').value = '';
            document.getElementById('newEmpHireDate').value = '';
            document.getElementById('newEmpBirthday').value = '';
            fillTeamGroupOptions();
            document.getElementById('empAdminToggleWrap').style.display = hasAdminAccess(currentUser) || currentUser.role === 'ceo' || currentUser.role === 'art_director' ? '' : 'none';
            // Кнопка "Добавить сотрудника" теперь живёт внутри модалки "Сотрудники" —
            // прячем список под формой добавления, чтобы два окна не стояли друг на
            // друге, и вернём список обратно в closeAddEmployeeModal().
            document.getElementById('employeesModal').style.display = 'none';
            document.getElementById('addEmployeeModal').style.display = 'flex';
        }

        // Подсказки для поля "Команда" — берём уже существующие названия групп,
        // чтобы не плодить дубли из-за опечаток ("команда 1" / "Команда 1").
        // Запрашиваем напрямую (а не из allEmployeesCache), т.к. модалка "Добавить
        // сотрудника" может открываться до того, как список сотрудников вообще загружался.
        async function fillTeamGroupOptions() {
            const { data, error } = await supabaseClient.from('profiles').select('team_group');
            if (error) { console.error(error); return; }
            const existing = [...new Set((data || []).map(p => p.team_group).filter(Boolean))].sort();
            document.getElementById('teamGroupOptions').innerHTML = existing.map(g => `<option value="${escapeHtml(g)}">`).join('');
        }

        // Подсказки для поля "Заказчик" — имена уже существующих клиентов из CRM,
        // чтобы новый проект случайно не завёл дубликат клиента из-за опечатки.
        async function fillClientOptions(selectedClientId) {
            // Менеджер видит здесь только своих клиентов (так решает RLS на таблице
            // clients), у остальных ролей — полный список, как и раньше.
            const { data, error } = await supabaseClient.from('clients').select('id, name').order('name', { ascending: true });
            projectClientsCache = error ? [] : (data || []);
            if (error) console.error(error);
            const sel = document.getElementById('projectFormClientSelect');
            sel.innerHTML = ['<option value="">— без клиента —</option>']
                .concat(projectClientsCache.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`))
                .concat(['<option value="__new__">+ Новый клиент…</option>'])
                .join('');
            sel.value = (selectedClientId && projectClientsCache.some(c => c.id === selectedClientId)) ? selectedClientId : '';
            onProjectFormClientChange();
        }

        function openEditEmployeeModal(id) {
            const emp = allEmployeesCache.find(p => p.id === id);
            if (!emp) return;
            editingEmployeeId = id;
            document.getElementById('empModalTitle').textContent = 'Изменить сотрудника';
            document.getElementById('empSubmitBtn').textContent = 'Сохранить';
            document.getElementById('newEmpName').value = emp.full_name || '';
            document.getElementById('newEmpRole').value = emp.role || 'artist';
            document.getElementById('newEmpEmail').value = emp.login_email || '';
            document.getElementById('newEmpPin').value = '';
            document.getElementById('empPinLabel').textContent = 'Новый PIN (оставьте пустым, чтобы не менять)';
            document.getElementById('newEmpIsAdmin').checked = !!emp.is_admin;
            document.getElementById('newEmpTeamGroup').value = emp.team_group || '';
            document.getElementById('newEmpHireDate').value = emp.hire_date || '';
            document.getElementById('newEmpBirthday').value = emp.birthday || '';
            fillTeamGroupOptions();
            document.getElementById('empAdminToggleWrap').style.display = hasAdminAccess(currentUser) || currentUser.role === 'ceo' || currentUser.role === 'art_director' ? '' : 'none';
            // Список сотрудников закрываем, чтобы не оставалось два окна друг на друге —
            // после сохранения/отмены редактирования вернём его обратно.
            document.getElementById('employeesModal').style.display = 'none';
            document.getElementById('addEmployeeModal').style.display = 'flex';
        }

        async function closeAddEmployeeModal() {
            document.getElementById('addEmployeeModal').style.display = 'none';
            // И "Добавить", и "Изменить" теперь всегда открываются из списка
            // "Сотрудники" — всегда возвращаемся туда же.
            document.getElementById('employeesModal').style.display = 'flex';
            await loadAndRenderEmployees();
        }

        async function submitEmployeeForm() {
            const full_name = document.getElementById('newEmpName').value.trim();
            const role = document.getElementById('newEmpRole').value;
            const email = document.getElementById('newEmpEmail').value.trim();
            const pin = document.getElementById('newEmpPin').value.trim();
            const is_admin = document.getElementById('newEmpIsAdmin').checked;
            const team_group = document.getElementById('newEmpTeamGroup').value.trim();
            const hire_date = document.getElementById('newEmpHireDate').value || null;
            const birthday = document.getElementById('newEmpBirthday').value || null;

            if (!full_name || !email) { showToast('Заполните имя и логин', 'error'); return; }
            if (pin && pin.length < 6) { showToast('PIN должен быть не короче 6 символов', 'error'); return; }
            if (!editingEmployeeId && !pin) { showToast('Укажите PIN для нового сотрудника', 'error'); return; }

            const { data: { session } } = await supabaseClient.auth.getSession();
            const body = editingEmployeeId
                ? { action: 'update', id: editingEmployeeId, full_name, role, is_admin, email, team_group, hire_date, birthday, ...(pin ? { pin } : {}) }
                : { action: 'create', full_name, role, email, pin, team_group, hire_date, birthday };

            try {
                const response = await fetch(`${SUPABASE_URL}/functions/v1/bright-api`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session.access_token}`,
                        'apikey': SUPABASE_KEY
                    },
                    body: JSON.stringify(body)
                });
                const result = await response.json();
                if (!response.ok) { showToast(result.error || 'Не удалось сохранить сотрудника', 'error'); return; }
                const wasSelf = editingEmployeeId === currentUser.id;
                await closeAddEmployeeModal(); // сама вернёт список сотрудников, если редактировали из него
                showToast(editingEmployeeId ? 'Данные обновлены' : 'Сотрудник добавлен!', 'success');
                if (wasSelf) { await requireAuth(); } // если поменяли себя — обновляем свои права в интерфейсе
            } catch (e) {
                console.error(e);
                showToast('Ошибка соединения с сервером', 'error');
            }
        }

        // ====== Список сотрудников: просмотр, редактирование, деактивация ======
        async function openEmployeesModal() {
            document.getElementById('employeesModal').style.display = 'flex';
            await loadAndRenderEmployees();
        }
        function closeEmployeesModal() { document.getElementById('employeesModal').style.display = 'none'; }

        const EMP_LEADERSHIP_ROLES = ['lead', 'art_director', 'ceo'];
        const EMP_CHEVRON_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';

        function renderEmployeeRow(p) {
            const isActive = p.is_active !== false;
            return `<div style="display:flex; align-items:center; justify-content:space-between; gap:10px; padding:12px 0; border-bottom:1px solid var(--border); ${isActive ? '' : 'opacity:0.55;'}">
                <div style="min-width:0;">
                    <div style="font-weight:600; font-size:14px; display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                        ${escapeHtml(p.full_name)}
                        ${p.is_admin ? '<span style="font-family:var(--font-mono); font-size:10px; padding:2px 8px; border-radius:999px; background:rgba(39,67,192,0.12); color:var(--accent);">Админ-доступ</span>' : ''}
                        ${isActive ? '' : '<span style="font-family:var(--font-mono); font-size:10px; padding:2px 8px; border-radius:999px; background:rgba(231,76,60,0.12); color:var(--danger);">Уволен(а)</span>'}
                    </div>
                    <div style="font-size:12px; color:var(--text-secondary); margin-top:2px;">${roleLabels[p.role] || p.role}${p.team_group ? ' · ' + escapeHtml(p.team_group) : ''} · ${escapeHtml(p.login_email || '')}</div>
                </div>
                <div style="display:flex; gap:6px; flex-shrink:0;">
                    <button class="btn btn-secondary" onclick="openEditEmployeeModal('${p.id}')" title="Изменить">${ICON.edit}</button>
                    ${isActive
                        ? `<button class="btn btn-secondary" onclick="confirmDeactivateEmployee('${p.id}')" title="Деактивировать" style="color:var(--danger);">${ICON.trash}</button>`
                        : `<button class="btn btn-secondary" onclick="reactivateEmployee('${p.id}')" title="Восстановить доступ">${ICON.check}</button>`}
                </div>
            </div>`;
        }

        // Группировка — как на экране входа: руководство отдельным блоком сверху,
        // остальные по team_group ("Команда 1", "Команда 2"...), без группы — в конце.
        // Сворачиваемые блоки, чтобы длинный список (15+ человек) не превращался
        // в стену лиц при каждом открытии модалки.
        function renderEmployeesGrouped(people) {
            const listEl = document.getElementById('employeesList');
            const leadership = people.filter(p => EMP_LEADERSHIP_ROLES.includes(p.role));
            const rest = people.filter(p => !EMP_LEADERSHIP_ROLES.includes(p.role));

            const groupsMap = new Map();
            rest.forEach(p => {
                const key = p.team_group && p.team_group.trim() ? p.team_group.trim() : null;
                if (!groupsMap.has(key)) groupsMap.set(key, []);
                groupsMap.get(key).push(p);
            });
            const namedGroups = [...groupsMap.keys()].filter(k => k !== null).sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }));

            const blocks = [];
            if (leadership.length > 0) blocks.push({ title: 'Руководство', people: leadership });
            namedGroups.forEach(name => blocks.push({ title: name, people: groupsMap.get(name) }));
            if (groupsMap.has(null)) blocks.push({ title: 'Без команды', people: groupsMap.get(null) });

            // Если группировать особо не на что — показываем плоским списком, как раньше
            if (blocks.length <= 1) {
                listEl.innerHTML = people.map(renderEmployeeRow).join('');
                return;
            }

            listEl.innerHTML = blocks.map((block, i) => `
                <div class="emp-group-block">
                    <div class="emp-group-header" id="emp-group-header-${i}" onclick="toggleEmpGroup(${i})">
                        <div class="emp-group-header-left">
                            <span class="emp-group-title">${escapeHtml(block.title)}</span>
                            <span class="emp-group-count">${block.people.length}</span>
                        </div>
                        <span class="emp-group-chevron">${EMP_CHEVRON_SVG}</span>
                    </div>
                    <div class="emp-group-body-wrap" id="emp-group-wrap-${i}">
                        <div class="emp-group-body-inner">${block.people.map(renderEmployeeRow).join('')}</div>
                    </div>
                </div>
            `).join('');
        }

        function toggleEmpGroup(i) {
            document.getElementById(`emp-group-header-${i}`).classList.toggle('expanded');
            document.getElementById(`emp-group-wrap-${i}`).classList.toggle('expanded');
        }

        async function loadAndRenderEmployees() {
            const listEl = document.getElementById('employeesList');
            listEl.innerHTML = `<p style="color: var(--text-secondary); font-size: 13px; text-align: center; padding: 20px 0;">${randomLoadingPhrase()}</p>`;
            const { data, error } = await supabaseClient.from('profiles').select('*').order('full_name', { ascending: true });
            if (error) { console.error(error); listEl.innerHTML = '<p style="color: var(--danger); font-size: 13px;">Не удалось загрузить список</p>'; return; }
            allEmployeesCache = data || [];
            if (allEmployeesCache.length === 0) { listEl.innerHTML = '<p style="color: var(--text-secondary); font-size: 13px; text-align: center; padding: 20px 0;">Список пуст</p>'; return; }
            renderEmployeesGrouped(allEmployeesCache);
        }

        async function setEmployeeActive(id, isActive) {
            const { data: { session } } = await supabaseClient.auth.getSession();
            try {
                const response = await fetch(`${SUPABASE_URL}/functions/v1/bright-api`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}`, 'apikey': SUPABASE_KEY },
                    body: JSON.stringify({ action: 'update', id, is_active: isActive })
                });
                const result = await response.json();
                if (!response.ok) { showToast(result.error || 'Не удалось выполнить действие', 'error'); return; }
                showToast(isActive ? 'Доступ восстановлен' : 'Сотрудник деактивирован', 'success');
                await loadAndRenderEmployees();
            } catch (e) {
                console.error(e);
                showToast('Ошибка соединения с сервером', 'error');
            }
        }
        function confirmDeactivateEmployee(id) {
            const emp = allEmployeesCache.find(p => p.id === id);
            if (!emp) return;
            if (!confirm(`Деактивировать «${emp.full_name}»? Он больше не сможет войти в систему, но история его действий сохранится. Доступ можно будет вернуть в любой момент.`)) return;
            setEmployeeActive(id, false);
        }
        function reactivateEmployee(id) { setEmployeeActive(id, true); }

        // ====== Команда проекта: кто из сотрудников назначен на проект ======
        // Назначение НЕ ограничивает доступ — проекты видны всем всегда (полная
        // прозрачность). Единственный эффект: на главной странице проекты, в
        // команду которых человек не входит, показываются приглушённо, а его
        // собственные — с пометкой "Моя команда".
        let currentTeamProjectId = null;
        let teamPickerEmployeesCache = [];

        async function openProjectTeamModal(projectId) {
            const project = lastLoadedProjects.find(p => p.id === projectId);
            if (!project) return;
            currentTeamProjectId = projectId;
            document.getElementById('projectTeamName').textContent = project.name;
            document.getElementById('projectTeamList').innerHTML = `<p style="color: var(--text-secondary); font-size: 13px; text-align: center; padding: 20px 0;">${randomLoadingPhrase()}</p>`;
            document.getElementById('projectTeamModal').style.display = 'flex';

            const [{ data, error }, teamLeaveMap] = await Promise.all([
                supabaseClient.from('profiles').select('*').order('full_name', { ascending: true }),
                fetchCurrentLeaveMap()
            ]);
            if (error) {
                console.error(error);
                document.getElementById('projectTeamList').innerHTML = '<p style="color: var(--danger); font-size: 13px;">Не удалось загрузить список сотрудников</p>';
                return;
            }
            // Уволенных в список назначения не предлагаем, но если уволенный уже
            // числится в команде — не прячем его молча, а покажем с пометкой
            teamPickerEmployeesCache = data || [];
            const currentMemberIds = new Set(project.memberIds || []);
            const listEl = document.getElementById('projectTeamList');
            // Менеджеры не участвуют в производстве — не предлагаем их в команду проекта
            // (если только человек не был назначен раньше — тогда не прячем молча).
            const visible = teamPickerEmployeesCache.filter(p => (p.role !== 'manager' && (p.is_active !== false || currentMemberIds.has(p.id))) || currentMemberIds.has(p.id));
            if (visible.length === 0) {
                listEl.innerHTML = '<p style="color: var(--text-secondary); font-size: 13px; text-align: center; padding: 20px 0;">Список сотрудников пуст</p>';
                return;
            }
            listEl.innerHTML = visible.map(p => {
                const checked = currentMemberIds.has(p.id) ? 'checked' : '';
                const isActive = p.is_active !== false;
                const leave = teamLeaveMap[p.id];
                const dim = (!isActive || leave) ? 'opacity:0.55;' : '';
                const leaveBadge = leave ? `<span style="display:inline-flex; align-items:center; gap:4px; margin-left:8px; font-size:11px; color:${leave.type === 'vacation' ? 'var(--success)' : 'var(--danger)'};">${leave.type === 'vacation' ? ICON.palm : ICON.pill} ${LEAVE_TYPE_LABELS[leave.type]}</span>` : '';
                return `<label style="display:flex; align-items:center; gap:10px; padding:9px 0; border-bottom:1px solid var(--border); cursor:pointer; ${dim}">
                    <input type="checkbox" class="team-member-checkbox" value="${p.id}" ${checked} style="width:16px; height:16px; flex-shrink:0;">
                    <span style="font-size:14px; min-width:0;">${escapeHtml(p.full_name)} <span style="color:var(--text-secondary); font-size:12px;">· ${roleLabels[p.role] || p.role}${isActive ? '' : ' · уволен(а)'}</span>${leaveBadge}</span>
                </label>`;
            }).join('');
        }

        function closeProjectTeamModal() {
            document.getElementById('projectTeamModal').style.display = 'none';
            currentTeamProjectId = null;
        }

        async function saveProjectTeam() {
            if (!currentTeamProjectId) return;
            const projectId = currentTeamProjectId;
            const selectedIds = Array.from(document.querySelectorAll('.team-member-checkbox:checked')).map(el => el.value);

            const { error: delError } = await supabaseClient.from('project_members').delete().eq('project_id', projectId);
            if (delError) {
                console.error(delError);
                showToast('Не удалось обновить команду проекта', 'error');
                return;
            }
            if (selectedIds.length > 0) {
                const { error: insError } = await supabaseClient
                    .from('project_members')
                    .insert(selectedIds.map(user_id => ({ project_id: projectId, user_id })));
                if (insError) {
                    console.error(insError);
                    showToast('Не удалось обновить команду проекта', 'error');
                    return;
                }
            }
            const names = selectedIds.map(id => (teamPickerEmployeesCache || []).find(p => p.id === id)?.full_name).filter(Boolean);
            logProjectActivity(projectId, 'team_change', names.length > 0 ? `Изменена команда проекта: ${names.join(', ')}` : 'Команда проекта очищена');
            showToast('Команда проекта обновлена', 'success');
            closeProjectTeamModal();
            renderProjects();
        }

        // changePin() теперь общий — вынесен в common.js (нужен и футеру сайдбара
        // на других страницах, не только здесь).

        // ====== РАБОТА С ДАННЫМИ ЧЕРЕЗ SUPABASE (вместо localStorage) ======

        // Загружает все проекты + отдельно все кадры (для подсчёта прогресса)
        async function loadProjectsWithFrames() {
            const { data: projects, error: projErr } = await withRetry(() => supabaseClient
                .from('projects')
                .select('*')
                .order('created_at', { ascending: false }));

            if (projErr) {
                console.error(projErr);
                showToast(isNetworkError(projErr) ? 'Нет соединения — проверьте сеть и обновите страницу' : 'Ошибка загрузки проектов', 'error');
                return [];
            }

            const { data: frames, error: framesErr } = await supabaseClient
                .from('frames')
                .select('id, project_id, status, is_priority');

            if (framesErr) {
                console.error(framesErr);
                showToast('Ошибка загрузки кадров', 'error');
            }

            const { data: members, error: membersErr } = await supabaseClient
                .from('project_members')
                .select('project_id, user_id');

            if (membersErr) {
                // Не критично для отображения проектов — просто не будет подсветки "своей команды"
                console.error(membersErr);
            }

            // Приклеиваем кадры и команду к каждому проекту, чтобы дальше код работал как раньше
            return projects.map(p => ({
                ...p,
                frames: (frames || []).filter(f => f.project_id === p.id),
                memberIds: (members || []).filter(m => m.project_id === p.id).map(m => m.user_id)
            }));
        }

        // ====== Форма создания/редактирования проекта — единая модалка вместо
        // серии window.prompt() (те выглядели по-разному в каждом браузере,
        // например через Яндекс.Браузер, и не позволяли добавить новые поля) ======
        let editingProjectId = null; // null — создаём новый проект, иначе редактируем существующий

        const isManagerNotAdmin = () => currentUser && currentUser.role === 'manager' && !currentUser.is_admin;

        function openProjectFormModal(id) {
            editingProjectId = id || null;
            const project = editingProjectId ? lastLoadedProjects.find(p => p.id === editingProjectId) : null;
            document.getElementById('projectFormTitle').textContent = editingProjectId ? 'Изменить проект' : 'Новый проект';
            document.getElementById('projectFormSubmitBtn').textContent = editingProjectId ? 'Сохранить' : (isManagerNotAdmin() ? 'Отправить на согласование' : 'Создать');
            document.getElementById('projectFormName').value = project ? project.name : '';
            document.getElementById('projectFormDeadline').value = project ? (project.deadline || '') : '';
            document.getElementById('projectFormNotes').value = project ? (project.notes || '') : '';
            document.getElementById('projectFormClientNew').value = '';
            document.getElementById('projectFormModal').style.display = 'flex';
            fillClientOptions(project ? project.client_id : null);
        }

        let projectClientsCache = [];

        function onProjectFormClientChange() {
            const sel = document.getElementById('projectFormClientSelect');
            const newInput = document.getElementById('projectFormClientNew');
            const isNew = sel.value === '__new__';
            newInput.style.display = isNew ? '' : 'none';
            if (isNew) newInput.value = '';
        }
        function closeProjectFormModal() {
            document.getElementById('projectFormModal').style.display = 'none';
            editingProjectId = null;
        }

        async function submitProjectForm() {
            const name = document.getElementById('projectFormName').value.trim();
            if (!name) { showToast('Укажите название проекта', 'error'); return; }
            const deadlineIso = document.getElementById('projectFormDeadline').value || null; // input type="date" уже отдаёт ГГГГ-ММ-ДД
            const notes = document.getElementById('projectFormNotes').value.trim() || null;

            // Клиент — выбирается из уже заведённых (id) либо заводится новый по имени.
            const clientSelectValue = document.getElementById('projectFormClientSelect').value;
            let clientId = null, clientName = null;
            if (clientSelectValue === '__new__') {
                const newName = document.getElementById('projectFormClientNew').value.trim();
                if (newName) {
                    const client = await findOrCreateClientByName(newName, currentUser.id);
                    clientId = client ? client.id : null;
                    clientName = client ? client.name : newName;
                }
            } else if (clientSelectValue) {
                clientId = clientSelectValue;
                clientName = (projectClientsCache.find(c => c.id === clientSelectValue) || {}).name || null;
            }

            if (editingProjectId) {
                const { error } = await supabaseClient
                    .from('projects')
                    .update({ name, client_name: clientName, client_id: clientId, deadline: deadlineIso, notes })
                    .eq('id', editingProjectId);
                if (error) { console.error(error); showToast('Не удалось обновить проект', 'error'); return; }
                logProjectActivity(editingProjectId, 'project_edit', 'Изменены данные проекта');
                showToast('Проект обновлён', 'success');
            } else {
                // Проект менеджера не запускается сразу — ждёт подтверждения директора
                // (approval_status), у остальных ролей поток не меняется.
                const payload = { name, client_name: clientName, client_id: clientId, deadline: deadlineIso, notes, completed: false, created_by: currentUser.id };
                if (isManagerNotAdmin()) payload.approval_status = 'pending';
                const { data, error } = await supabaseClient
                    .from('projects')
                    .insert(payload)
                    .select()
                    .single();
                if (error) { console.error(error); showToast('Не удалось создать проект', 'error'); return; }
                showToast(isManagerNotAdmin() ? 'Заявка отправлена директору на согласование' : 'Проект создан!', 'success');
            }
            closeProjectFormModal();
            renderProjects();
        }

        async function deleteProject(id) {
            if (!confirm('Удалить проект?')) return;
            const { error } = await supabaseClient.from('projects').delete().eq('id', id);
            if (error) {
                console.error(error);
                showToast('Не удалось удалить проект', 'error');
                return;
            }
            showToast('Проект удалён', 'warning');
            renderProjects();
        }

        let ratingProjectId = null;
        let ratingValue = 0;
        function openRatingModal(projectId) {
            const p = (lastLoadedProjects || []).find(pr => pr.id === projectId);
            ratingProjectId = projectId;
            ratingValue = (p && p.client_rating) || 0;
            document.getElementById('ratingFeedback').value = (p && p.client_feedback) || '';
            renderRatingStars();
            document.getElementById('ratingModal').style.display = 'flex';
        }
        function closeRatingModal() {
            document.getElementById('ratingModal').style.display = 'none';
            ratingProjectId = null;
        }
        function renderRatingStars() {
            const row = document.getElementById('ratingStarsRow');
            row.innerHTML = [1, 2, 3, 4, 5].map(n =>
                `<span onclick="setRatingValue(${n})" style="color:${n <= ratingValue ? '#f5a623' : 'var(--border)'};">★</span>`
            ).join('');
        }
        function setRatingValue(n) {
            ratingValue = (ratingValue === n) ? 0 : n; // повторный клик по той же звезде — сброс
            renderRatingStars();
        }
        async function submitRating() {
            const feedback = document.getElementById('ratingFeedback').value.trim() || null;
            const { error } = await supabaseClient
                .from('projects')
                .update({ client_rating: ratingValue || null, client_feedback: feedback })
                .eq('id', ratingProjectId);
            if (error) { console.error(error); showToast('Не удалось сохранить оценку', 'error'); return; }
            showToast('Оценка сохранена', 'success');
            closeRatingModal();
            renderProjects();
        }

        async function completeProject(id, currentlyCompleted) {
            const { error } = await supabaseClient
                .from('projects')
                .update({ completed: !currentlyCompleted })
                .eq('id', id);
            if (error) {
                console.error(error);
                showToast('Не удалось обновить статус', 'error');
                return;
            }
            logProjectActivity(id, 'project_complete', !currentlyCompleted ? 'Проект отмечен как завершённый' : 'Проект возвращён в работу');
            showToast(!currentlyCompleted ? 'Проект завершён!' : 'Проект возвращён', 'success');
            // Маленький праздник — только когда завершаем, не при отмене
            if (!currentlyCompleted && typeof confetti === 'function') {
                confetti({ particleCount: 130, spread: 95, origin: { y: 0.6 } });
            }
            renderProjects();
        }

        // Фикс: раньше название/дедлайн передавались прямо в onclick='...' через
        // JSON.stringify внутри одинарных кавычек — если в названии проекта встречался
        // апостроф ('), HTML-атрибут ломался и кнопка редактирования переставала работать.
        // Теперь берём данные из последнего загруженного списка проектов по id.
        let lastLoadedProjects = [];

        // Флаги доступа/принадлежности проекта для текущего пользователя — используются
        // и в основной сетке карточек, и в виджете "горящие дедлайны", поэтому вынесены
        // в одну функцию, чтобы логика не разъезжалась между местами.
        function getProjectFlags(p, canManageProjects) {
            const isMyTeam = currentUser && Array.isArray(p.memberIds) && p.memberIds.includes(currentUser.id);
            const notAssigned = Array.isArray(p.memberIds) && p.memberIds.length > 0 && !isMyTeam;
            const blockedFromEntry = notAssigned && !canManageProjects;
            return { isMyTeam, notAssigned, blockedFromEntry };
        }

        // Сортировка списка проектов согласно выбору в тулбаре. Не трогает исходный
        // массив (map/filter в renderProjects и так создают новую копию).
        function sortProjects(list, mode, canManageProjects) {
            const sorted = list.slice();
            if (mode === 'deadline_asc') {
                sorted.sort((a, b) => {
                    if (!a.deadline && !b.deadline) return 0;
                    if (!a.deadline) return 1; // без дедлайна — в конец
                    if (!b.deadline) return -1;
                    return new Date(a.deadline) - new Date(b.deadline);
                });
            } else if (mode === 'name_asc') {
                sorted.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
            } else if (mode === 'mine_first') {
                sorted.sort((a, b) => {
                    const aMine = getProjectFlags(a, canManageProjects).isMyTeam ? 1 : 0;
                    const bMine = getProjectFlags(b, canManageProjects).isMyTeam ? 1 : 0;
                    return bMine - aMine; // мои — выше, остальное сохраняет относительный порядок
                });
            }
            // created_desc — порядок уже такой после загрузки (created_at desc), ничего не делаем
            return sorted;
        }

        // Сохраняем выбор сортировки/фильтра между визитами — мелочь, но раздражает,
        // когда после каждого захода нужно заново выбирать "по дедлайну"
        function restoreProjectsControls() {
            const savedSort = localStorage.getItem('decardProjectSort');
            if (savedSort) document.getElementById('sortSelect').value = savedSort;
            document.getElementById('hideCompletedToggle').checked = localStorage.getItem('decardHideCompleted') === '1';
            document.getElementById('hideOnHoldToggle').checked = localStorage.getItem('decardHideOnHold') === '1';
        }

        function onProjectsControlsChange() {
            localStorage.setItem('decardProjectSort', document.getElementById('sortSelect').value);
            localStorage.setItem('decardHideCompleted', document.getElementById('hideCompletedToggle').checked ? '1' : '0');
            localStorage.setItem('decardHideOnHold', document.getElementById('hideOnHoldToggle').checked ? '1' : '0');
            renderProjects();
        }

        // "Стоп от заказчика" — переключают только ceo/art_director/is_admin (тот же
        // круг, что может завершать проект)
        async function toggleProjectHold(id, currentlyOnHold) {
            const { error } = await supabaseClient.from('projects').update({ on_hold: !currentlyOnHold }).eq('id', id);
            if (error) { console.error(error); showToast('Не удалось изменить статус стопа', 'error'); return; }
            logProjectActivity(id, 'project_on_hold', !currentlyOnHold ? 'Проект поставлен в стоп от заказчика' : 'Стоп с проекта снят');
            showToast(!currentlyOnHold ? 'Проект поставлен в стоп' : 'Стоп снят', !currentlyOnHold ? 'warning' : 'success');
            renderProjects();
        }

        // ====== Глобальный поиск (шапка) — проекты + кадры по всем проектам ======
        let globalSearchDebounce = null;
        function onGlobalSearchInput() {
            clearTimeout(globalSearchDebounce);
            const query = document.getElementById('globalSearchInput').value;
            const resultsEl = document.getElementById('globalSearchResults');
            if (query.trim().length < 2) { resultsEl.style.display = 'none'; return; }
            globalSearchDebounce = setTimeout(async () => {
                const { projects, frames } = await runGlobalSearch(query);
                if (projects.length === 0 && frames.length === 0) {
                    resultsEl.innerHTML = '<div style="padding:14px; font-size:13px; color:var(--text-secondary);">Ничего не найдено</div>';
                } else {
                    resultsEl.innerHTML = `
                        ${projects.length > 0 ? `<div style="padding:8px 14px; font-size:11px; font-weight:700; color:var(--text-secondary); text-transform:uppercase;">Проекты</div>` : ''}
                        ${projects.map(p => `<a href="project.html?id=${p.id}" style="display:block; padding:8px 14px; font-size:13px; color:var(--text-primary); text-decoration:none;" onmouseover="this.style.background='rgba(39,67,192,0.08)'" onmouseout="this.style.background=''">${escapeHtml(p.name)}</a>`).join('')}
                        ${frames.length > 0 ? `<div style="padding:8px 14px; font-size:11px; font-weight:700; color:var(--text-secondary); text-transform:uppercase;">Кадры</div>` : ''}
                        ${frames.map(f => `<a href="frame.html?project=${f.project_id}&frame=${f.id}" style="display:block; padding:8px 14px; font-size:13px; color:var(--text-primary); text-decoration:none;" onmouseover="this.style.background='rgba(39,67,192,0.08)'" onmouseout="this.style.background=''">${escapeHtml(f.name)} <span style="color:var(--text-secondary); font-size:12px;">· ${escapeHtml(f.projects ? f.projects.name : '')}</span></a>`).join('')}
                    `;
                }
                resultsEl.style.display = 'block';
            }, 250);
        }
        document.addEventListener('click', (e) => {
            const wrap = document.getElementById('globalSearchInput');
            const results = document.getElementById('globalSearchResults');
            if (wrap && results && !wrap.contains(e.target) && !results.contains(e.target)) results.style.display = 'none';
        });

        // "Горящие дедлайны" — до 5 незавершённых проектов с ближайшим/просроченным
        // сроком, доступных текущему пользователю (не показываем то, что он всё равно
        // не может открыть). Считается от полного списка, а не от отфильтрованного
        // тулбаром — иначе "Скрыть завершённые" неожиданно повлияет на виджет.
        function renderHotDeadlines(projects, canManageProjects) {
            const widget = document.getElementById('hotDeadlines');
            const candidates = projects
                .filter(p => !p.completed && !p.on_hold && p.deadline)
                .filter(p => getDeadlineStatus(p.deadline) !== 'ok')
                .filter(p => !getProjectFlags(p, canManageProjects).blockedFromEntry)
                .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
                .slice(0, 5);

            if (candidates.length === 0) {
                widget.style.display = 'none';
                widget.innerHTML = '';
                return;
            }
            widget.style.display = 'block';
            widget.innerHTML = `
                <div class="hot-deadlines-title">${ICON.warning} Горящие дедлайны</div>
                <div class="hot-deadlines-list">
                    ${candidates.map(p => {
                        const status = getDeadlineStatus(p.deadline);
                        return `<a class="hot-deadline-item" href="project.html?id=${p.id}">
                            <span>${escapeHtml(p.name)}</span>
                            <span class="deadline-badge deadline-${status}"><span class="badge-dot"></span>${getDeadlineLabel(status)}: ${formatDateRu(p.deadline)}</span>
                        </a>`;
                    }).join('')}
                </div>
            `;
        }

        // ====== Согласование проектов, заведённых менеджером ======
        function renderProjectApprovalPanel(items) {
            const panelEl = document.getElementById('projectApprovalPanel');
            const canApprove = currentUser && (hasAdminAccess(currentUser) || currentUser.role === 'ceo');
            const rows = items.map(p => {
                const isMine = p.created_by === currentUser.id;
                if (!isMine && !canApprove) return '';
                let actions = '';
                if (p.approval_status === 'pending') {
                    if (canApprove) {
                        actions += `<button class="btn btn-primary" style="padding:6px 14px; font-size:12px;" onclick="approveProjectLaunch('${p.id}')">Одобрить запуск</button>
                            <button class="btn btn-secondary" style="padding:6px 14px; font-size:12px;" onclick="rejectProjectLaunch('${p.id}')">Отклонить</button>`;
                    }
                    if (isMine) actions += `<button class="btn btn-secondary" style="padding:6px 14px; font-size:12px;" onclick="cancelPendingProject('${p.id}')">Отменить</button>`;
                } else if (p.approval_status === 'rejected' && isMine) {
                    actions += `<button class="btn btn-secondary" style="padding:6px 14px; font-size:12px;" onclick="cancelPendingProject('${p.id}')">Удалить</button>`;
                }
                const statusLabel = p.approval_status === 'pending'
                    ? 'Ожидает подтверждения директора'
                    : `Отклонено${p.rejection_note ? ': ' + escapeHtml(p.rejection_note) : ''}`;
                return `<div class="approval-row">
                    <div>
                        <b>${escapeHtml(p.name)}</b>${p.client_name ? ' · Заказчик: ' + escapeHtml(p.client_name) : ''}
                        <div style="font-size:12px; color:${p.approval_status === 'rejected' ? 'var(--danger)' : 'var(--text-secondary)'}; margin-top:4px;">${statusLabel}</div>
                    </div>
                    <div class="approval-row-actions">${actions}</div>
                </div>`;
            }).filter(Boolean).join('');
            panelEl.innerHTML = rows ? `<div class="approval-panel">
                <div class="approval-panel-title">Проекты на согласовании</div>
                ${rows}
            </div>` : '';
        }

        async function approveProjectLaunch(id) {
            const { error } = await supabaseClient.from('projects').update({ approval_status: 'approved', approved_by: currentUser.id }).eq('id', id);
            if (error) { console.error(error); showToast('Не удалось подтвердить запуск', 'error'); return; }
            showToast('Проект одобрен и запущен', 'success');
            renderProjects();
        }

        async function rejectProjectLaunch(id) {
            const note = window.prompt('Причина отказа (необязательно):');
            if (note === null) return;
            const { error } = await supabaseClient.from('projects').update({ approval_status: 'rejected', rejected_by: currentUser.id, rejection_note: note.trim() || null }).eq('id', id);
            if (error) { console.error(error); showToast('Не удалось отклонить', 'error'); return; }
            showToast('Проект отклонён', 'success');
            renderProjects();
        }

        async function cancelPendingProject(id) {
            if (!confirm('Удалить эту заявку на проект?')) return;
            const { error } = await supabaseClient.from('projects').delete().eq('id', id);
            if (error) { console.error(error); showToast('Не удалось удалить', 'error'); return; }
            showToast('Заявка удалена', 'success');
            renderProjects();
        }

        async function renderProjects() {
            const allProjects = await loadProjectsWithFrames();
            // Проекты менеджера, ждущие или не прошедшие согласование директора, —
            // это ещё не реальная работа в производстве: не показываем их в общей
            // сетке/статистике/дедлайнах, только в отдельной панели согласования.
            const projects = allProjects.filter(p => (p.approval_status || 'approved') === 'approved');
            const pendingOrRejected = allProjects.filter(p => (p.approval_status || 'approved') !== 'approved');
            lastLoadedProjects = projects;
            const canManageProjects = currentUser && (hasAdminAccess(currentUser) || ['lead', 'art_director', 'ceo'].includes(currentUser.role));
            // "Завершить проект" — более узкий доступ, чем управление проектом:
            // только админ-доступ, ceo или арт-директор (тимлид — не может завершать)
            const canCompleteProject = currentUser && (hasAdminAccess(currentUser) || ['ceo', 'art_director'].includes(currentUser.role));

            renderProjectApprovalPanel(pendingOrRejected);
            renderHotDeadlines(projects, canManageProjects);

            const hideCompleted = document.getElementById('hideCompletedToggle').checked;
            const hideOnHold = document.getElementById('hideOnHoldToggle').checked;
            const sortMode = document.getElementById('sortSelect').value;
            let filteredProjects = projects;
            if (hideCompleted) filteredProjects = filteredProjects.filter(p => !p.completed);
            if (hideOnHold) filteredProjects = filteredProjects.filter(p => !p.on_hold);
            const displayProjects = sortProjects(
                filteredProjects,
                sortMode,
                canManageProjects
            );

            const grid = document.getElementById('projectsGrid');
            const empty = document.getElementById('emptyState');
            if (projects.length === 0) {
                grid.innerHTML = '';
                empty.style.display = 'block';
                document.getElementById('emptyStateTitle').textContent = 'Менеджеры ещё ничего не продали';
                document.getElementById('emptyStateText').textContent = 'Ожидайте — или создайте первый проект сами, чтобы начать работу';
            } else if (displayProjects.length === 0) {
                grid.innerHTML = '';
                empty.style.display = 'block';
                document.getElementById('emptyStateTitle').textContent = 'Ничего не найдено';
                document.getElementById('emptyStateText').textContent = 'Под текущий фильтр не попал ни один проект — попробуйте показать завершённые';
            } else {
                empty.style.display = 'none';
                grid.innerHTML = displayProjects.map(p => {
                    const totalFrames = p.frames.length;
                    const completedFrames = p.frames.filter(f => f.status === 'done').length;
                    const progress = totalFrames > 0 ? Math.round((completedFrames / totalFrames) * 100) : 0;
                    const deadlineStatus = getDeadlineStatus(p.deadline);
                    const deadlineLabel = getDeadlineLabel(deadlineStatus);
                    const deadlineClass = `deadline-${deadlineStatus}`;
                    const createdDisplay = p.created_at ? new Date(p.created_at).toLocaleDateString('ru-RU') : '';
                    const { isMyTeam, notAssigned, blockedFromEntry } = getProjectFlags(p, canManageProjects);
                    return `
                        <div class="project-card viewfinder-card ${p.completed ? 'completed' : ''} ${notAssigned ? 'not-assigned' : ''} ${p.on_hold ? 'on-hold' : ''}">
                            <div class="project-header">
                                <div class="project-header-text">
                                    <div class="project-title" style="display:flex;align-items:center;gap:8px;">${escapeHtml(p.name)} ${p.completed ? ICON.check : ''}</div>
                                    ${p.client_name ? `<div style="font-size:13px; color:var(--text-secondary); margin-bottom:6px;">Заказчик: ${escapeHtml(p.client_name)}</div>` : ''}
                                    <div class="project-meta">
                                        <span style="display:inline-flex;align-items:center;gap:5px;">${ICON.calendar}Создан: ${createdDisplay}</span>
                                        <span style="display:inline-flex;align-items:center;gap:5px;">${ICON.frames}${totalFrames} кадров</span>
                                        ${p.deadline ? `<span class="deadline-badge ${deadlineClass}"><span class="badge-dot"></span>${deadlineLabel}: ${formatDateRu(p.deadline)}</span>` : ''}
                                        ${isMyTeam ? `<span class="team-badge"><span class="badge-dot"></span>Моя команда</span>` : ''}
                                        ${p.on_hold ? `<span class="on-hold-badge">⏸ Стоп от заказчика</span>` : ''}
                                    </div>
                                </div>
                                <div class="progress-ring" style="--percent:${progress}"><span class="progress-ring-label">${progress}%</span></div>
                            </div>
                            <div class="project-body">
                                <div class="project-actions">
                                    ${blockedFromEntry
                                        ? `<button class="btn btn-secondary" onclick="showToast('Вы не назначены в команду этого проекта', 'error')" style="opacity:0.6; cursor:not-allowed;" title="Нет доступа — вы не в команде проекта">${ICON.lock} Нет доступа</button>`
                                        : `<a href="project.html?id=${p.id}" class="btn btn-primary">Открыть</a>`}
                                    ${!blockedFromEntry && safeHttpUrl(p.holst_url) ? `<a class="btn btn-secondary" href="${escapeHtml(safeHttpUrl(p.holst_url))}" target="_blank" rel="noopener noreferrer" title="Материалы проекта в Holst">Holst</a>` : ''}
                                    ${canManageProjects ? `<button class="btn btn-secondary" onclick="openProjectTeamModal('${p.id}')" title="Команда проекта">${ICON.team}</button>` : ''}
                                    ${canManageProjects ? `<button class="btn btn-secondary" onclick="openProjectFormModal('${p.id}')">${ICON.edit}</button>` : ''}
                                    ${canManageProjects ? `<button class="btn btn-secondary" onclick="deleteProject('${p.id}')" style="color: var(--danger);">${ICON.trash}</button>` : ''}
                                    ${canCompleteProject ? `<button class="btn ${p.completed ? 'btn-secondary' : 'btn-danger'}" onclick="completeProject('${p.id}', ${p.completed})">${p.completed ? '↺ Вернуть' : '✓ Завершить'}</button>` : ''}
                                    ${canCompleteProject ? `<button class="btn btn-secondary" onclick="toggleProjectHold('${p.id}', ${p.on_hold})" title="${p.on_hold ? 'Снять стоп' : 'Поставить в стоп от заказчика'}">${p.on_hold ? '▶ Снять стоп' : '⏸ Стоп'}</button>` : ''}
                                    ${canCompleteProject && p.completed ? `<button class="btn btn-secondary" onclick="openRatingModal('${p.id}')" title="Оценка клиента">${p.client_rating ? '★ ' + p.client_rating : '☆ Оценка'}</button>` : ''}
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');
            }
            updateStats(projects, canManageProjects);
        }

        function updateStats(projects, canManageProjects) {
            const totalFrames = projects.reduce((sum, p) => sum + p.frames.length, 0);
            const completedProjects = projects.filter(p => p.completed).length;
            // "Живой" показатель — горящие кадры только по доступным пользователю проектам
            const hotFrames = projects.reduce((sum, p) => {
                if (getProjectFlags(p, canManageProjects).blockedFromEntry) return sum;
                return sum + p.frames.filter(f => f.is_priority).length;
            }, 0);
            const onHoldCount = projects.filter(p => p.on_hold).length;
            document.getElementById('totalProjects').textContent = projects.length;
            document.getElementById('totalFrames').textContent = totalFrames;
            document.getElementById('completedProjects').textContent = completedProjects;
            const hotEl = document.getElementById('hotFramesCount');
            if (hotEl) hotEl.textContent = hotFrames;
            const onHoldEl = document.getElementById('onHoldCount');
            if (onHoldEl) onHoldEl.textContent = onHoldCount;
        }

        // "Живые" виджеты: тихо обновляем цифры каждые 60 секунд, не трогая сетку карточек,
        // чтобы не сбивать открытые модалки/выделение текста. Полный renderProjects()
        // вызывается только по явным действиям пользователя.
        function isAnyModalOpen() {
            return ['addEmployeeModal', 'employeesModal', 'projectTeamModal', 'projectFormModal'].some(id => {
                const el = document.getElementById(id);
                return el && el.style.display === 'flex';
            });
        }
        async function refreshLiveStats() {
            if (isAnyModalOpen()) return;
            const canManageProjects = currentUser && (hasAdminAccess(currentUser) || ['lead', 'art_director', 'ceo'].includes(currentUser.role));
            const projects = await loadProjectsWithFrames();
            lastLoadedProjects = projects;
            updateStats(projects, canManageProjects);
            renderHotDeadlines(projects, canManageProjects);
        }

        // ====== Виджет последних новостей на дашборде ======
        async function loadNewsWidget() {
            // Раньше здесь был блок с последними новостями. Теперь — короткое приглашение,
            // если есть новость, которую человек ещё не открывал (после просмотра раздела «Новости» пропадает)
            const widget = document.getElementById('newsWidget');
            if (!widget) return;
            const { data, error } = await supabaseClient
                .from('company_news')
                .select('id, title, created_at')
                .order('created_at', { ascending: false })
                .limit(1);
            if (error) { console.error(error); widget.innerHTML = ''; return; }
            const latest = data && data[0];
            if (!latest || latest.created_at <= getNewsSeen()) { widget.innerHTML = ''; return; }
            widget.innerHTML = `
                <div class="update-banner" role="status">
                    <span class="update-banner-dot" aria-hidden="true"></span>
                    <div class="update-banner-text">
                        <strong>Хей, у нас обновление!</strong>
                        <span>${escapeHtml(latest.title)}</span>
                    </div>
                    <a href="news.html" class="btn btn-primary">Посмотреть</a>
                    <button type="button" class="update-banner-close" aria-label="Скрыть" title="Скрыть" onclick="dismissNewsNotice('${latest.created_at}')">${ICON.close}</button>
                </div>`;
        }
        function dismissNewsNotice(iso) {
            markNewsSeen(iso);
            const widget = document.getElementById('newsWidget');
            const b = widget && widget.querySelector('.update-banner');
            if (!b) return;
            b.classList.add('leaving');
            setTimeout(() => { widget.innerHTML = ''; }, 350);
        }

        // ====== Виджет «Сегодня»: что требует внимания именно этого человека ======
        async function loadTodayWidget() {
            const el = document.getElementById('todayWidget');
            if (!el || !currentUser) return;
            const sections = [];

            // 1) Мои кадры в работе: горящие и с ближайшим сроком — сверху
            try {
                const { data: frames, error } = await supabaseClient
                    .from('frames')
                    .select('id, name, project_id, due_date, is_priority, status, projects(name, deadline)')
                    .eq('assigned_to', currentUser.id)
                    .neq('status', 'done')
                    .limit(60);
                if (error) throw error;
                const rows = (frames || []).map(f => {
                    const due = getEffectiveDueDate(f, f.projects && f.projects.deadline);
                    return { f, due, st: due ? getDeadlineStatus(due) : null };
                }).sort((a, b) => ((b.f.is_priority ? 1 : 0) - (a.f.is_priority ? 1 : 0)) || ((a.due || '9999') < (b.due || '9999') ? -1 : 1));
                if (rows.length) {
                    sections.push({
                        title: 'Мои кадры в работе',
                        total: rows.length,
                        items: rows.slice(0, 5).map(r => `
                            <a class="today-item" href="frame.html?project=${r.f.project_id}&frame=${r.f.id}">
                                <span class="today-item-main"><span class="today-item-title">${escapeHtml(r.f.name)}</span><span class="today-item-sub">${escapeHtml((r.f.projects && r.f.projects.name) || '')}</span></span>
                                ${r.f.is_priority ? '<span class="priority-badge">Горит</span>' : ''}
                                ${r.due ? `<span class="deadline-badge deadline-${r.st}"><span class="badge-dot"></span>${formatDateRu(r.due)}</span>` : ''}
                            </a>`).join('')
                    });
                }
            } catch (e) { console.error(e); }

            // 2) Продажи: пора связаться с клиентом
            if (canAccessDeals(currentUser)) {
                try {
                    const { data: deals, error } = await supabaseClient
                        .from('deals')
                        .select('id, title, next_followup_date, next_action, stage')
                        .eq('manager_id', currentUser.id)
                        .not('next_followup_date', 'is', null)
                        .limit(60);
                    if (error) throw error;
                    const due = (deals || []).filter(d => d.stage !== 'won' && d.stage !== 'lost' && daysUntilDate(d.next_followup_date) <= 0)
                        .sort((a, b) => (a.next_followup_date < b.next_followup_date ? -1 : 1));
                    if (due.length) {
                        sections.push({
                            title: 'Пора связаться с клиентом',
                            total: due.length,
                            items: due.slice(0, 5).map(d => `
                                <a class="today-item" href="deals.html">
                                    <span class="today-item-main"><span class="today-item-title">${escapeHtml(d.title)}</span><span class="today-item-sub">${escapeHtml(d.next_action || 'Следующий шаг не указан')}</span></span>
                                    <span class="deadline-badge deadline-urgent"><span class="badge-dot"></span>${formatDateRu(d.next_followup_date)}</span>
                                </a>`).join('')
                        });
                    }
                } catch (e) { console.error(e); }
            }

            // 3) Согласование условий сделок — для тех, кто согласует
            if (canApproveCommercial(currentUser)) {
                try {
                    const { count, error } = await supabaseClient.from('deals').select('id', { count: 'exact', head: true }).eq('commercial_approval_status', 'pending');
                    if (error) throw error;
                    if (count) {
                        sections.push({
                            title: 'Ждут вашего согласования',
                            total: count,
                            items: `<a class="today-item" href="deals.html"><span class="today-item-main"><span class="today-item-title">Сделки со скидками и бесплатными условиями</span><span class="today-item-sub">Нужно одобрить или отклонить</span></span><span class="rev-badge">${count}</span></a>`
                        });
                    }
                } catch (e) { console.error(e); }
            }

            if (!sections.length) {
                el.innerHTML = `<div class="news-widget today-widget"><div class="news-widget-head"><span class="news-widget-title">${ICON.clock} Сегодня</span></div><div class="today-empty">На сегодня срочных дел нет — всё под контролем.</div></div>`;
                return;
            }
            el.innerHTML = `<div class="news-widget today-widget">
                <div class="news-widget-head"><span class="news-widget-title">${ICON.clock} Сегодня</span></div>
                ${sections.map(s => `
                    <div class="today-section">
                        <div class="today-section-title">${s.title}${s.total > 5 ? ` <span class="today-more">· ещё ${s.total - 5}</span>` : ''}</div>
                        ${s.items}
                    </div>`).join('')}
            </div>`;
        }
        document.addEventListener('DOMContentLoaded', async function() {
            loadTheme();
            restoreProjectsControls();
            document.getElementById('emptyStateMascot').innerHTML = MASCOT_SVG;
            const ok = await requireAuth();
            if (!ok) return;
            await renderProjects();
            loadNewsWidget();
            loadTodayWidget();
            initDeadlineReminders(currentUser);
            // Если пришли редиректом с project.html (кто-то ввёл прямую ссылку на
            // проект без доступа) — покажем причину и уберём метку из адреса
            const params = new URLSearchParams(window.location.search);
            if (params.get('denied') === '1') {
                showToast('У вас нет доступа к этому проекту — вы не в его команде', 'error');
                window.history.replaceState({}, '', 'index.html');
            } else if (params.get('open') === 'employees') {
                // Переход из сайдбара с другой страницы — сразу открываем модалку сотрудников
                window.history.replaceState({}, '', 'index.html');
                if (canManageEmployeesRole(currentUser)) openEmployeesModal();
            } else {
                showToast('Добро пожаловать!', 'success');
            }
            // "Живые" виджеты — тихое обновление раз в минуту, без перерисовки всей сетки
            setInterval(refreshLiveStats, 60000);
        });
    
