        let currentUser = null;
        let planCache = [];
        let editingPlanId = null;

        const CP_STATUSES = [
            { key: 'idea', label: 'Идея' },
            { key: 'planned', label: 'Запланировано' },
            { key: 'ready', label: 'Готово' },
            { key: 'published', label: 'Опубликовано' }
        ];
        const CP_CHANNEL_LABELS = { instagram: 'Instagram', website: 'Сайт', vk: 'VK', telegram: 'Telegram', other: 'Другое' };

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

        async function loadPlan() {
            const { data, error } = await supabaseClient.from('content_plan').select('*').order('planned_date', { ascending: true, nullsFirst: false });
            if (error) { console.error(error); document.getElementById('planBoard').innerHTML = '<div class="panel-empty">Не удалось загрузить контент-план</div>'; return; }
            planCache = data || [];
            renderBoard();
        }

        function renderBoard() {
            const board = document.getElementById('planBoard');
            const today = todayIso();
            board.innerHTML = `<div class="cp-board">${CP_STATUSES.map(s => {
                const items = planCache.filter(p => p.status === s.key);
                const cardsHtml = items.length > 0 ? items.map(p => {
                    const overdue = p.planned_date && p.planned_date < today && p.status !== 'published';
                    return `<div class="cp-card" onclick="openPlanModal('${p.id}')">
                        <div class="cp-card-title">${escapeHtml(p.title)}</div>
                        <div class="cp-card-meta">
                            <span class="cp-chip">${CP_CHANNEL_LABELS[p.channel] || p.channel}</span>
                            ${p.planned_date ? `<span class="cp-chip ${overdue ? 'overdue' : ''}">${formatDateRu(p.planned_date)}</span>` : ''}
                        </div>
                    </div>`;
                }).join('') : '<div class="cp-col-empty">Пусто</div>';
                return `<div class="cp-col">
                    <div class="cp-col-head"><span>${s.label}</span><span class="cp-col-count">${items.length}</span></div>
                    ${cardsHtml}
                </div>`;
            }).join('')}</div>`;
        }

        function openPlanModal(id) {
            editingPlanId = id;
            const item = id ? planCache.find(p => p.id === id) : null;
            document.getElementById('planFormTitle').textContent = item ? 'Публикация' : 'Новая публикация';
            document.getElementById('planTitle').value = item ? item.title : '';
            document.getElementById('planChannel').value = item ? item.channel : 'instagram';
            document.getElementById('planDate').value = item ? (item.planned_date || '') : '';
            document.getElementById('planStatus').value = item ? item.status : 'idea';
            document.getElementById('planNote').value = item ? (item.note || '') : '';
            document.getElementById('planDeleteBtn').style.display = item ? '' : 'none';
            document.getElementById('planFormModal').style.display = 'flex';
        }
        function closePlanModal() {
            document.getElementById('planFormModal').style.display = 'none';
            editingPlanId = null;
        }

        async function submitPlanForm() {
            const title = document.getElementById('planTitle').value.trim();
            if (!title) { showToast('Укажите название/тему', 'error'); return; }
            const payload = {
                title,
                channel: document.getElementById('planChannel').value,
                planned_date: document.getElementById('planDate').value || null,
                status: document.getElementById('planStatus').value,
                note: document.getElementById('planNote').value.trim() || null
            };
            let error;
            if (editingPlanId) {
                ({ error } = await supabaseClient.from('content_plan').update(payload).eq('id', editingPlanId));
            } else {
                ({ error } = await supabaseClient.from('content_plan').insert({ ...payload, created_by: currentUser.id }));
            }
            if (error) { console.error(error); showToast('Не удалось сохранить', 'error'); return; }
            showToast('Сохранено', 'success');
            closePlanModal();
            await loadPlan();
        }

        async function deletePlanItem() {
            if (!editingPlanId || !confirm('Удалить эту публикацию из плана?')) return;
            const { error } = await supabaseClient.from('content_plan').delete().eq('id', editingPlanId);
            if (error) { console.error(error); showToast('Не удалось удалить', 'error'); return; }
            showToast('Удалено', 'success');
            closePlanModal();
            await loadPlan();
        }

        document.addEventListener('DOMContentLoaded', async function() {
            loadTheme();
            const ok = await requireAuth();
            if (!ok) return;
            initDeadlineReminders(currentUser);
            await loadPlan();
        });
    
