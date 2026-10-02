        let currentUser = null;
        let projectsCache = [];
        let clientsCache = [];
        let caseFilter = 'all';

        async function requireAuth() {
            const user = await initAuthedPage();
            if (!user) return false;
            if (!canManageMarketing(currentUser)) {
                document.getElementById('noAccess').style.display = 'block';
                return false;
            }
            document.getElementById('pageContainer').style.display = 'block';
            return true;
        }

        function setCaseFilter(filter) {
            caseFilter = filter;
            document.getElementById('filterAllBtn').classList.toggle('active', filter === 'all');
            document.getElementById('filterCasesBtn').classList.toggle('active', filter === 'cases');
            renderCases();
        }

        async function loadCases() {
            const { data: projects, error } = await supabaseClient
                .from('projects')
                .select('*')
                .eq('completed', true)
                .order('completed_at', { ascending: false, nullsFirst: false });
            if (error) { console.error(error); document.getElementById('casesList').innerHTML = '<div class="panel-empty">Не удалось загрузить проекты</div>'; return; }
            const { data: clients, error: clientsErr } = await supabaseClient.from('clients').select('id, name');
            if (clientsErr) console.error(clientsErr);
            clientsCache = clients || [];
            projectsCache = projects || [];
            renderCases();
        }

        function clientNameById(id) {
            const c = clientsCache.find(c => c.id === id);
            return c ? c.name : '';
        }

        function renderCases() {
            const listEl = document.getElementById('casesList');
            const query = document.getElementById('caseSearch').value.trim().toLowerCase();
            let items = projectsCache;
            if (caseFilter === 'cases') items = items.filter(p => p.is_case);
            if (query) items = items.filter(p => [p.name, clientNameById(p.client_id)].some(v => (v || '').toLowerCase().includes(query)));

            if (items.length === 0) {
                listEl.innerHTML = `<div class="panel-empty">${projectsCache.length === 0 ? 'Завершённых проектов пока нет' : 'Ничего не найдено'}</div>`;
                return;
            }
            listEl.innerHTML = items.map(p => {
                const date = p.completed_at ? formatDateRu(p.completed_at) : '';
                const rating = p.client_rating ? '★'.repeat(p.client_rating) + '☆'.repeat(5 - p.client_rating) : '';
                return `<div class="case-card ${p.is_case ? 'is-case' : ''}" id="case-${p.id}">
                    <div class="case-head">
                        <div>
                            <div class="case-title">${p.is_case ? ICON.star : ''}${escapeHtml(p.name)}</div>
                            <div class="case-meta">${escapeHtml(clientNameById(p.client_id) || 'Без клиента')}${date ? ' · сдан ' + date : ''}${rating ? ' · ' + rating : ''}</div>
                        </div>
                        <button class="btn ${p.is_case ? 'btn-secondary' : 'btn-primary'}" onclick="toggleCase('${p.id}', ${!p.is_case})" style="padding:6px 14px; font-size:12.5px;">${p.is_case ? '− Убрать из кейсов' : '★ Добавить в кейсы'}</button>
                    </div>
                    ${p.is_case ? `
                    <div class="case-body">
                        <label class="field-label">Описание для соцсетей/сайта</label>
                        <textarea class="field-input" id="caseDesc-${p.id}" placeholder="Например: Экстерьер ЖК «Северный», 6 ракурсов, вечернее освещение, срок — 12 дней...">${escapeHtml(p.case_description || '')}</textarea>
                        <div class="case-tags-row">
                            <input type="text" class="field-input" id="caseTags-${p.id}" placeholder="Теги через запятую: экстерьер, ЖК, вечер..." value="${escapeHtml(p.case_tags || '')}">
                        </div>
                        <div class="case-actions-row">
                            <button class="btn btn-primary" onclick="saveCaseText('${p.id}')" style="padding:6px 14px; font-size:12.5px;">Сохранить</button>
                            <button class="btn btn-secondary" onclick="copyCaseText('${p.id}', '${escapeHtml(p.name).replace(/'/g, "\\'")}')" style="padding:6px 14px; font-size:12.5px;">⧉ Скопировать текст</button>
                        </div>
                    </div>` : ''}
                </div>`;
            }).join('');
        }

        async function toggleCase(id, isCase) {
            const { error } = await supabaseClient.from('projects').update({ is_case: isCase }).eq('id', id);
            if (error) { console.error(error); showToast('Не удалось обновить', 'error'); return; }
            showToast(isCase ? 'Добавлено в кейсы' : 'Убрано из кейсов', 'success');
            await loadCases();
        }

        async function saveCaseText(id) {
            const case_description = document.getElementById(`caseDesc-${id}`).value.trim() || null;
            const case_tags = document.getElementById(`caseTags-${id}`).value.trim() || null;
            const { error } = await supabaseClient.from('projects').update({ case_description, case_tags }).eq('id', id);
            if (error) { console.error(error); showToast('Не удалось сохранить', 'error'); return; }
            showToast('Сохранено', 'success');
            await loadCases();
        }

        async function copyCaseText(id, name) {
            const desc = document.getElementById(`caseDesc-${id}`).value.trim();
            const tags = document.getElementById(`caseTags-${id}`).value.trim();
            const text = [name, desc, tags ? tags.split(',').map(t => '#' + t.trim().replace(/\s+/g, '')).join(' ') : ''].filter(Boolean).join('\n\n');
            try {
                await navigator.clipboard.writeText(text);
                showToast('Текст скопирован', 'success');
            } catch (e) {
                console.error(e);
                showToast('Не удалось скопировать — скопируйте вручную', 'error');
            }
        }

        document.addEventListener('DOMContentLoaded', async function() {
            loadTheme();
            const ok = await requireAuth();
            if (!ok) return;
            initDeadlineReminders(currentUser);
            await loadCases();
        });
    
