        let currentUser = null;
        let bugsCache = [];

        const STATUS_LABELS = { new: 'Новое', in_progress: 'В работе', resolved: 'Решено' };

        // Справочники категорий/срочности/страниц вынесены в common.js (BUG_*) —
        // используются и здесь, и в колокольчике напоминаний.
        const PAGE_OPTIONS = BUG_PAGE_OPTIONS;
        const PAGE_LABELS = BUG_PAGE_LABELS;
        const CATEGORY_OPTIONS = BUG_CATEGORY_OPTIONS;
        const CATEGORY_LABELS = BUG_CATEGORY_LABELS;
        const PRIORITY_OPTIONS = BUG_PRIORITY_OPTIONS;
        const PRIORITY_LABELS = BUG_PRIORITY_LABELS;
        const PRIORITY_RANK = BUG_PRIORITY_RANK;

        async function requireAuth() {
            const user = await initAuthedPage();
            if (!user) return false;
            document.getElementById('reportBugBtn').innerHTML = `${ICON.bug} + Сообщить об ошибке`;
            return true;
        }

        async function loadBugs() {
            const { data, error } = await supabaseClient
                .from('bug_reports')
                .select('*')
                .order('created_at', { ascending: false });
            if (error) {
                console.error(error);
                document.getElementById('bugsList').innerHTML = '<div class="panel-empty">Не удалось загрузить список</div>';
                return;
            }
            const { data: profiles, error: profErr } = await supabaseClient.from('profiles').select('id, full_name');
            if (profErr) console.error(profErr);
            const nameById = {};
            (profiles || []).forEach(p => { nameById[p.id] = p.full_name; });
            bugsCache = (data || []).map(b => ({ ...b, authorName: nameById[b.reported_by] || 'Неизвестно', resolverName: b.resolved_by ? (nameById[b.resolved_by] || 'Неизвестно') : null }));
            renderBugs();
        }

        function bugCardHtml(b, canManage) {
            const date = new Date(b.created_at).toLocaleString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            // Удалять может автор, либо art_director/ceo/admin — ровно как в RLS-политике
            // bug_reports_delete (lead туда намеренно не входит: он может менять статус,
            // но не удалять чужие сообщения). Раньше здесь стояла canManageEmployeesRole(),
            // которая включает lead — кнопка показывалась, но удаление падало на RLS.
            const canDelete = hasAdminAccess(currentUser) || ['art_director', 'ceo'].includes(currentUser.role) || b.reported_by === currentUser.id;
            let actions = '';
            if (canManage) {
                if (b.status === 'new') actions += `<button class="btn btn-secondary" style="padding:6px 12px; font-size:12px;" onclick="setBugStatus('${b.id}', 'in_progress')">Взять в работу</button>`;
                if (b.status !== 'resolved') actions += `<button class="btn btn-primary" style="padding:6px 12px; font-size:12px;" onclick="setBugStatus('${b.id}', 'resolved')">Отметить решённым</button>`;
                if (b.status === 'resolved') actions += `<button class="btn btn-secondary" style="padding:6px 12px; font-size:12px;" onclick="setBugStatus('${b.id}', 'new')">Переоткрыть</button>`;
            }
            if (canDelete) actions += `<button class="news-icon-btn" title="Удалить" onclick="deleteBug('${b.id}')">${ICON.trash}</button>`;
            return `<div class="bug-card ${b.status === 'resolved' ? 'is-resolved' : ''}">
                <div class="bug-card-head">
                    <div>
                        <span class="bug-priority ${b.priority}">${PRIORITY_LABELS[b.priority] || b.priority}</span>
                        <span class="bug-status ${b.status}">${STATUS_LABELS[b.status]}</span>
                        <div class="bug-category" style="margin-top:6px;">${escapeHtml(CATEGORY_LABELS[b.category] || b.category)}</div>
                        <div class="bug-meta">${escapeHtml(b.authorName)} · ${date}${b.resolverName ? ' · решил(а): ' + escapeHtml(b.resolverName) : ''}</div>
                        <span class="bug-page">${escapeHtml(PAGE_LABELS[b.page] || b.page || 'Не указано')}</span>
                    </div>
                    <div class="bug-actions">${actions}</div>
                </div>
                ${b.description ? `<div class="bug-body">${escapeHtml(b.description)}</div>` : ''}
            </div>`;
        }

        function renderBugs() {
            const canManage = canManageProjectsRole(currentUser);
            const listEl = document.getElementById('bugsList');
            if (bugsCache.length === 0) {
                listEl.innerHTML = '<div class="panel-empty">Сообщений об ошибках пока нет — если что-то работает не так, нажмите «Сообщить об ошибке»</div>';
                return;
            }
            // В активных — сначала самые срочные, среди равных по срочности — сначала новые
            const byPriorityThenDate = (a, b) => (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]) || (new Date(b.created_at) - new Date(a.created_at));
            const active = bugsCache.filter(b => b.status !== 'resolved').sort(byPriorityThenDate);
            const resolved = bugsCache.filter(b => b.status === 'resolved');
            let html = '';
            html += `<div class="section-title">Активные (${active.length})</div>`;
            html += active.length ? active.map(b => bugCardHtml(b, canManage)).join('') : '<div class="panel-empty">Активных сообщений нет</div>';
            if (resolved.length) {
                html += `<div class="section-title">Решённые (${resolved.length})</div>`;
                html += resolved.map(b => bugCardHtml(b, canManage)).join('');
            }
            listEl.innerHTML = html;
        }

        function guessCurrentPage() {
            try {
                if (!document.referrer) return 'other';
                const url = new URL(document.referrer);
                if (url.origin !== window.location.origin) return 'other';
                const file = url.pathname.split('/').pop() || 'index.html';
                return PAGE_OPTIONS.some(o => o.value === file) ? file : 'other';
            } catch (e) { return 'other'; }
        }

        function openBugFormModal() {
            const guessedPage = guessCurrentPage();
            document.getElementById('bugFormPage').innerHTML = PAGE_OPTIONS.map(o => `<option value="${o.value}" ${o.value === guessedPage ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('');
            document.getElementById('bugFormCategory').innerHTML = '<option value="">— выберите —</option>' + CATEGORY_OPTIONS.map(o => `<option value="${o.value}">${escapeHtml(o.label)}</option>`).join('');
            document.getElementById('bugFormPriority').innerHTML = PRIORITY_OPTIONS.map(o => `<option value="${o.value}" ${o.value === 'medium' ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('');
            document.getElementById('bugFormDescription').value = '';
            document.getElementById('bugFormModal').style.display = 'flex';
        }

        function closeBugFormModal() {
            document.getElementById('bugFormModal').style.display = 'none';
        }

        async function submitBugForm() {
            const page = document.getElementById('bugFormPage').value;
            const category = document.getElementById('bugFormCategory').value;
            const priority = document.getElementById('bugFormPriority').value;
            const description = document.getElementById('bugFormDescription').value.trim();
            if (!category) { showToast('Выберите, что случилось', 'error'); return; }
            const { error } = await supabaseClient.from('bug_reports').insert({
                reported_by: currentUser.id, page, category, priority, description: description || null
            });
            if (error) { console.error(error); showToast(isNetworkError(error) ? 'Нет соединения — попробуйте ещё раз' : 'Не удалось отправить сообщение', 'error'); return; }
            showToast('Спасибо, сообщение отправлено', 'success');
            closeBugFormModal();
            await loadBugs();
        }

        async function setBugStatus(id, status) {
            const update = { status };
            if (status === 'resolved') update.resolved_by = currentUser.id;
            if (status === 'new') update.resolved_by = null;
            const { error } = await supabaseClient.from('bug_reports').update(update).eq('id', id);
            if (error) { console.error(error); showToast('Не удалось обновить статус', 'error'); return; }
            await loadBugs();
        }

        async function deleteBug(id) {
            if (!confirm('Удалить это сообщение безвозвратно?')) return;
            const { error } = await supabaseClient.from('bug_reports').delete().eq('id', id);
            if (error) { console.error(error); showToast('Не удалось удалить', 'error'); return; }
            showToast('Сообщение удалено', 'success');
            await loadBugs();
        }

        document.addEventListener('DOMContentLoaded', async function() {
            loadTheme();
            const ok = await requireAuth();
            if (!ok) return;
            initDeadlineReminders(currentUser);
            await loadBugs();
        });
    
