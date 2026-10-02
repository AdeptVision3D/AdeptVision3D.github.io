        // Фикс: email раньше подставлялся прямо в onclick-атрибут — если бы в нём
        // оказалась кавычка, атрибут ломался бы. Теперь храним список людей
        // в переменной и берём email по id из неё.
        let lastLoadedPeople = [];

        const LEADERSHIP_ROLES = ['lead', 'art_director', 'ceo'];
        const CHEVRON_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';

        async function loadPeople() {
            // Если уже есть активная сессия — сразу пускаем внутрь, не показывая экран входа
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (session) { window.location.href = 'index.html'; return; }

            const { data, error } = await withRetry(() => supabaseClient.from('profiles').select('*').order('full_name', { ascending: true }));
            if (error) { console.error(error); showToast(isNetworkError(error) ? 'Нет соединения — проверьте сеть и обновите страницу' : 'Не удалось загрузить список сотрудников', 'error'); return; }
            // Фильтр по is_active — на клиенте, а не через .eq() в запросе: так список
            // работает даже до того, как в Supabase будет добавлена колонка is_active
            // (в этом случае p.is_active === undefined, и человек считается активным).
            // Раньше здесь был баг: список ниже рендерился из непрофильтрованного `data`,
            // и уволенные сотрудники всё равно оставались на экране входа.
            lastLoadedPeople = (data || []).filter(p => p.is_active !== false);
            if (lastLoadedPeople.length === 0) { document.getElementById('emptyHint').style.display = 'block'; return; }
            renderGroups(lastLoadedPeople);
        }

        // Группировка: руководство (lead/art_director/ceo) — всегда отдельным блоком
        // сверху; остальные (обычно художники) — по полю team_group, которое
        // руководитель проставляет вручную ("Команда 1", "Команда 2" и т.д.);
        // те, кому группу ещё не назначили, попадают в "Без команды" в конце.
        function renderGroups(people) {
            const leadership = people.filter(p => LEADERSHIP_ROLES.includes(p.role));
            const rest = people.filter(p => !LEADERSHIP_ROLES.includes(p.role));

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

            // Если группировать особо не на что (нет ни руководства, ни назначенных
            // команд — всё в одной безымянной куче) показываем как раньше, без блоков
            if (blocks.length <= 1) {
                document.getElementById('peopleList').innerHTML = renderPeopleList(people);
                return;
            }

            document.getElementById('peopleList').innerHTML = blocks.map((block, i) => `
                <div class="group-block">
                    <div class="group-header" id="group-header-${i}" onclick="toggleGroup(${i})">
                        <div class="group-header-left">
                            <span class="group-title">${escapeHtml(block.title)}</span>
                            <span class="group-count">${block.people.length}</span>
                        </div>
                        <span class="group-chevron">${CHEVRON_SVG}</span>
                    </div>
                    <div class="group-body-wrap" id="group-wrap-${i}">
                        <div class="group-body-inner">
                            <div class="group-people">${renderPeopleList(block.people)}</div>
                        </div>
                    </div>
                </div>
            `).join('');
        }

        function renderPeopleList(people) {
            return people.map(p => `
                <div class="person-card">
                    <div class="person-row" onclick="togglePin('${p.id}')">
                        <span class="person-name">${escapeHtml(p.full_name)}</span>
                        <span class="role-badge"><span class="badge-dot"></span>${escapeHtml(roleLabels[p.role] || p.role)}</span>
                    </div>
                    <div class="pin-panel" id="pin-${p.id}">
                        <input type="password" class="pin-input" id="pin-input-${p.id}" placeholder="PIN" inputmode="numeric" onkeydown="if(event.key==='Enter') doLogin('${p.id}')">
                        <button class="btn btn-primary" onclick="doLogin('${p.id}')">Войти</button>
                    </div>
                </div>
            `).join('');
        }

        function toggleGroup(i) {
            document.getElementById(`group-header-${i}`).classList.toggle('expanded');
            document.getElementById(`group-wrap-${i}`).classList.toggle('expanded');
        }

        function togglePin(personId) {
            document.querySelectorAll('.pin-panel').forEach(panel => {
                if (panel.id !== `pin-${personId}`) panel.classList.remove('active');
            });
            const panel = document.getElementById(`pin-${personId}`);
            panel.classList.toggle('active');
            if (panel.classList.contains('active')) document.getElementById(`pin-input-${personId}`).focus();
        }

        async function doLogin(personId) {
            const pin = document.getElementById(`pin-input-${personId}`).value;
            if (!pin) { showToast('Введите PIN', 'error'); return; }
            const person = lastLoadedPeople.find(p => p.id === personId);
            if (!person) { showToast('Не удалось определить пользователя, обновите страницу', 'error'); return; }
            const { error } = await supabaseClient.auth.signInWithPassword({ email: person.login_email, password: pin });
            if (error) { console.error(error); showToast('Неверный PIN', 'error'); return; }
            window.location.href = 'index.html';
        }

        document.addEventListener('DOMContentLoaded', function() {
            loadTheme();
            loadPeople();
        });
    
