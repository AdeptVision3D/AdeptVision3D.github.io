        let currentUser = null;
        let editingClientId = null;
        let clientsCache = [];
        let projectsByClientId = {};

        async function requireAuth() {
            const user = await initAuthedPage();
            if (!user) return false;
            if (!canAccessClients(currentUser)) {
                // Раздел клиентов — тем, кто ведёт проекты, и менеджерам (свои клиенты)
                window.location.href = 'index.html';
                return false;
            }
            return true;
        }

        let dealsByClientId = {};

        async function loadClients() {
            const queries = [
                supabaseClient.from('clients').select('*').order('name', { ascending: true }),
                supabaseClient.from('projects').select('id, name, client_id, completed, on_hold').order('created_at', { ascending: false })
            ];
            if (canAccessDeals(currentUser)) {
                queries.push(supabaseClient.from('deals').select('id, title, client_id, stage, commercial_approval_status').order('created_at', { ascending: false }));
            }
            const results = await Promise.all(queries);
            const [{ data: clients, error: clientsErr }, { data: projects, error: projectsErr }] = results;
            const { data: deals, error: dealsErr } = results[2] || { data: [] };
            if (clientsErr || projectsErr || dealsErr) {
                console.error(clientsErr || projectsErr || dealsErr);
                document.getElementById('clientsList').innerHTML = '<div class="panel-empty">Не удалось загрузить клиентов</div>';
                return;
            }
            clientsCache = clients || [];
            projectsByClientId = {};
            (projects || []).forEach(p => {
                if (!p.client_id) return;
                if (!projectsByClientId[p.client_id]) projectsByClientId[p.client_id] = [];
                projectsByClientId[p.client_id].push(p);
            });
            dealsByClientId = {};
            (deals || []).forEach(d => {
                if (!d.client_id) return;
                if (!dealsByClientId[d.client_id]) dealsByClientId[d.client_id] = [];
                dealsByClientId[d.client_id].push(d);
            });
            renderClients();
        }

        function renderClients() {
            const query = document.getElementById('clientSearch').value.trim().toLowerCase();
            const listEl = document.getElementById('clientsList');
            const filtered = clientsCache.filter(c => {
                if (!query) return true;
                return [c.name, c.contact_name, c.phone, c.email].some(v => (v || '').toLowerCase().includes(query));
            });
            if (clientsCache.length === 0) {
                listEl.innerHTML = '<div class="panel-empty">Клиентов пока нет — они также заводятся автоматически при указании "Заказчика" в форме проекта</div>';
                return;
            }
            if (filtered.length === 0) {
                listEl.innerHTML = '<div class="panel-empty">Ничего не найдено</div>';
                return;
            }
            listEl.innerHTML = filtered.map(c => {
                const contacts = [
                    c.contact_name ? `<span class="client-contact-item">${ICON.user} ${escapeHtml(c.contact_name)}</span>` : '',
                    c.phone ? `<span class="client-contact-item">${ICON.phone} ${escapeHtml(c.phone)}</span>` : '',
                    c.email ? `<span class="client-contact-item">${ICON.mail} ${escapeHtml(c.email)}</span>` : ''
                ].filter(Boolean).join('');
                const projects = projectsByClientId[c.id] || [];
                const projectsHtml = projects.length > 0
                    ? projects.map(p => `<a class="client-project-chip ${p.completed ? 'done' : ''}" href="project.html?id=${p.id}">${p.on_hold ? '⏸ ' : ''}${escapeHtml(p.name)}${p.completed ? ' · сдан' : ''}</a>`).join('')
                    : '<span class="client-empty-projects">Проектов пока нет</span>';
                const deals = dealsByClientId[c.id] || [];
                const dealStageLabels = { lead: 'лид', negotiation: 'переговоры', proposal_sent: 'КП отправлено', won: 'выиграна', lost: 'проиграна' };
                const dealsHtml = canAccessDeals(currentUser) ? `<div class="client-projects">${
                    deals.length > 0
                        ? deals.map(d => `<a class="client-project-chip ${d.stage === 'lost' ? 'done' : ''}" href="deals.html?deal=${d.id}">${d.commercial_approval_status === 'pending' ? '⏳ ' : ''}${escapeHtml(d.title)} · ${dealStageLabels[d.stage] || d.stage}</a>`).join('')
                        : '<span class="client-empty-projects">Сделок пока нет</span>'
                }</div>` : '';
                return `<div class="client-card">
                    <div class="client-card-head">
                        <div>
                            <div class="client-name">${escapeHtml(c.name)}</div>
                            ${contacts ? `<div class="client-contacts">${contacts}</div>` : ''}
                        </div>
                        <div class="client-actions">
                            <button class="client-icon-btn" title="Редактировать" onclick="openClientFormModal('${c.id}')">${ICON.edit}</button>
                            <button class="client-icon-btn" title="Удалить" onclick="deleteClient('${c.id}')">${ICON.trash}</button>
                        </div>
                    </div>
                    ${c.notes ? `<div class="client-notes">${escapeHtml(c.notes)}</div>` : ''}
                    <div class="client-projects">${projectsHtml}</div>
                    ${dealsHtml}
                </div>`;
            }).join('');
        }

        function openClientFormModal(id) {
            editingClientId = id || null;
            const client = id ? clientsCache.find(c => c.id === id) : null;
            document.getElementById('clientFormTitle').textContent = client ? 'Изменить клиента' : 'Новый клиент';
            document.getElementById('clientFormSubmitBtn').textContent = client ? 'Сохранить' : 'Создать';
            document.getElementById('clientFormName').value = client ? client.name : '';
            document.getElementById('clientFormContact').value = client ? (client.contact_name || '') : '';
            document.getElementById('clientFormPhone').value = client ? (client.phone || '') : '';
            document.getElementById('clientFormEmail').value = client ? (client.email || '') : '';
            document.getElementById('clientFormNotes').value = client ? (client.notes || '') : '';
            document.getElementById('clientFormModal').style.display = 'flex';
        }

        function closeClientFormModal() {
            document.getElementById('clientFormModal').style.display = 'none';
            editingClientId = null;
        }

        async function submitClientForm() {
            const name = document.getElementById('clientFormName').value.trim();
            if (!name) { showToast('Укажите название/ФИО клиента', 'error'); return; }
            const payload = {
                name,
                contact_name: document.getElementById('clientFormContact').value.trim() || null,
                phone: document.getElementById('clientFormPhone').value.trim() || null,
                email: document.getElementById('clientFormEmail').value.trim() || null,
                notes: document.getElementById('clientFormNotes').value.trim() || null
            };

            let error;
            if (editingClientId) {
                ({ error } = await supabaseClient.from('clients').update(payload).eq('id', editingClientId));
                // Если переименовали клиента — синхронизируем денормализованное имя в его проектах,
                // чтобы карточки проектов не показывали устаревшее "Заказчик: ...".
                if (!error) {
                    await supabaseClient.from('projects').update({ client_name: name }).eq('client_id', editingClientId);
                }
            } else {
                ({ error } = await supabaseClient.from('clients').insert({ ...payload, created_by: currentUser.id }));
            }
            if (error) { console.error(error); showToast(isNetworkError(error) ? 'Нет соединения — попробуйте ещё раз' : 'Не удалось сохранить клиента', 'error'); return; }
            showToast(editingClientId ? 'Клиент обновлён' : 'Клиент добавлен', 'success');
            closeClientFormModal();
            await loadClients();
        }

        async function deleteClient(id) {
            const hasProjects = (projectsByClientId[id] || []).length > 0;
            const warning = hasProjects ? '\n\nУ клиента есть проекты — связь с ними будет снята, но сами проекты не удалятся.' : '';
            if (!confirm(`Удалить клиента?${warning}`)) return;
            const { error } = await supabaseClient.from('clients').delete().eq('id', id);
            if (error) { console.error(error); showToast('Не удалось удалить клиента', 'error'); return; }
            showToast('Клиент удалён', 'success');
            await loadClients();
        }

        document.addEventListener('DOMContentLoaded', async function() {
            loadTheme();
            const ok = await requireAuth();
            if (!ok) return;
            initDeadlineReminders(currentUser);
            await loadClients();
            { const q = new URLSearchParams(location.search).get('q'); const inp = document.getElementById('clientSearch'); if (q && inp) { inp.value = q; renderClients(); } }
        });
    
