        let currentUser = null;
        let errorsCache = [];
        let profileNameMap = {};

        async function requireAuth() {
            return !!(await initAuthedPage());
        }

        // Единый источник списка страниц — BUG_PAGE_LABELS в common.js (используется
        // и в форме bugs.html). Здесь дополняем только страницами, которых нет в форме
        // "сообщить об ошибке" (их нельзя выбрать вручную, но ошибки на них всё равно
        // логируются автоматически), чтобы не держать вторую копию всего списка.
        const PAGE_LABELS_ERR = {
            ...BUG_PAGE_LABELS,
            'login.html': 'Вход',
            'bugs.html': 'Сообщить об ошибке',
            'error-console.html': 'Консоль ошибок',
            'deals.html': 'Сделки'
        };

        async function loadErrors() {
            const { data: logs, error } = await supabaseClient
                .from('error_logs')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(300);
            if (error) { console.error(error); showToast('Не удалось загрузить лог ошибок', 'error'); return; }
            errorsCache = logs || [];

            const userIds = [...new Set(errorsCache.map(e => e.user_id).filter(Boolean))];
            profileNameMap = {};
            if (userIds.length > 0) {
                const { data: profiles, error: profErr } = await supabaseClient.from('profiles').select('id, full_name').in('id', userIds);
                if (profErr) console.error(profErr);
                (profiles || []).forEach(p => { profileNameMap[p.id] = p.full_name; });
            }
            renderErrors();
        }

        async function refreshErrors() {
            document.getElementById('errCountLabel').textContent = 'Загрузка…';
            await loadErrors();
            showToast('Обновлено', 'success');
        }

        function fmtErrTime(iso) {
            return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        }

        let errorFilter = 'active'; // active | resolved | all — по умолчанию показываем только непофикшенные
        function setErrorFilter(filter) {
            errorFilter = filter;
            document.querySelectorAll('.err-filter-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.filter === filter));
            renderErrors();
        }

        function renderErrors() {
            const query = (document.getElementById('errSearch').value || '').trim().toLowerCase();
            let filtered = errorFilter === 'active' ? errorsCache.filter(e => !e.resolved)
                : errorFilter === 'resolved' ? errorsCache.filter(e => e.resolved)
                : errorsCache;
            if (query) filtered = filtered.filter(e => (e.message || '').toLowerCase().includes(query) || (e.page || '').toLowerCase().includes(query));

            const activeCount = errorsCache.filter(e => !e.resolved).length;
            document.getElementById('errCountLabel').textContent = `Активных ошибок: ${activeCount} · всего за последние 300 записей: ${errorsCache.length}${query ? ` · показано: ${filtered.length}` : ''}`;

            const panel = document.getElementById('errorsPanel');
            if (filtered.length === 0) {
                let emptyText = 'Ничего не найдено по запросу';
                if (!query) {
                    emptyText = errorFilter === 'active' ? 'Активных ошибок нет — всё разобрано 🎉'
                        : errorFilter === 'resolved' ? 'Решённых ошибок пока нет'
                        : 'Ошибок пока не зафиксировано — это хороший знак';
                }
                panel.innerHTML = `<div class="panel-empty">${emptyText}</div>`;
                return;
            }

            panel.innerHTML = filtered.map((e, idx) => {
                const who = e.user_id ? (profileNameMap[e.user_id] || 'Бывший сотрудник') : 'Гость / до входа';
                const pageLabel = PAGE_LABELS_ERR[e.page] || e.page || '—';
                const stackId = `errStack${idx}`;
                const resolvedInfo = e.resolved ? `<div class="err-sub">✓ Решено ${e.resolved_at ? fmtErrTime(e.resolved_at) : ''}${e.resolved_by && profileNameMap[e.resolved_by] ? ' · ' + escapeHtml(profileNameMap[e.resolved_by]) : ''}</div>` : '';
                return `
                <div class="err-row ${e.resolved ? 'resolved' : ''}">
                    <div class="err-top">
                        <div style="min-width:0;">
                            <div class="err-message">${escapeHtml(e.message)}</div>
                            <div class="err-sub">${escapeHtml(pageLabel)} · ${escapeHtml(who)}</div>
                            ${resolvedInfo}
                        </div>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span class="err-meta">${fmtErrTime(e.created_at)}</span>
                            <button class="err-resolve-btn ${e.resolved ? 'is-resolved' : ''}" onclick="toggleErrorResolved('${e.id}', ${!e.resolved})">${e.resolved ? '✓ Решено' : 'Отметить решённой'}</button>
                            <button class="err-del-btn" title="Удалить запись" onclick="deleteErrorLog('${e.id}')">${ICON.trash}</button>
                        </div>
                    </div>
                    ${e.stack ? `<button class="err-stack-toggle" onclick="toggleStack('${stackId}')">Показать стек</button><div class="err-stack" id="${stackId}">${escapeHtml(e.stack)}</div>` : ''}
                </div>`;
            }).join('');
        }

        async function toggleErrorResolved(id, resolved) {
            const payload = resolved
                ? { resolved: true, resolved_at: new Date().toISOString(), resolved_by: currentUser.id }
                : { resolved: false, resolved_at: null, resolved_by: null };
            const { error } = await supabaseClient.from('error_logs').update(payload).eq('id', id);
            if (error) { console.error(error); showToast('Не удалось обновить статус', 'error'); return; }
            const item = errorsCache.find(e => e.id === id);
            if (item) Object.assign(item, payload);
            showToast(resolved ? 'Отмечено решённой' : 'Возвращено в активные', 'success');
            renderErrors();
        }

        function toggleStack(id) {
            const el = document.getElementById(id);
            if (el) el.classList.toggle('open');
        }

        async function deleteErrorLog(id) {
            const { error } = await supabaseClient.from('error_logs').delete().eq('id', id);
            if (error) { console.error(error); showToast('Не удалось удалить запись', 'error'); return; }
            errorsCache = errorsCache.filter(e => e.id !== id);
            renderErrors();
        }

        async function clearOldErrors() {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - 30);
            if (!confirm('Удалить все записи об ошибках старше 30 дней?')) return;
            const { error } = await supabaseClient.from('error_logs').delete().lt('created_at', cutoff.toISOString());
            if (error) { console.error(error); showToast('Не удалось очистить лог', 'error'); return; }
            showToast('Старые записи удалены', 'success');
            await loadErrors();
        }

        document.addEventListener('DOMContentLoaded', async function() {
            loadTheme();
            const ok = await requireAuth();
            if (!ok) return;
            initDeadlineReminders(currentUser);

            if (!hasAdminAccess(currentUser)) {
                document.getElementById('noAccess').style.display = 'block';
                return;
            }
            document.getElementById('pageContainer').style.display = 'block';
            await loadErrors();
        });
    
