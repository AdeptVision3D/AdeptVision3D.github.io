        let currentUser = null;
        let dealsCache = [];
        let clientsCache = [];
        let managersCache = [];
        let templatesCache = [];
        let viewMode = 'all';
        let editingDealId = null;
        let currentFreeItems = [];
        let currentChecklist = [];
        let editingTemplateId = null;
        let currentTemplateItems = [];

        const DEAL_STAGES = [
            { key: 'lead', label: 'Лид' },
            { key: 'negotiation', label: 'Переговоры' },
            { key: 'proposal_sent', label: 'КП отправлено' },
            { key: 'won', label: 'Выиграна' },
            { key: 'lost', label: 'Проиграна' }
        ];
        const ACTIVITY_KIND_LABELS = { note: 'Заметка', call: 'Звонок', message: 'Сообщение', meeting: 'Встреча', system: 'Система' };

        async function requireAuth() {
            const user = await initAuthedPage();
            if (!user) return false;
            if (!canAccessDeals(currentUser)) {
                window.location.href = 'index.html';
                return false;
            }
            viewMode = currentUser.role === 'manager' ? 'my' : 'all';
            document.getElementById('templatesBtn').style.display = canManageDealTemplates(currentUser) ? '' : 'none';
            return true;
        }

        function setViewMode(mode) {
            viewMode = mode;
            renderBoard();
        }

        async function loadAll() {
            const [{ data: deals, error: dealsErr }, { data: clients, error: clientsErr }, { data: managers, error: mgrErr }, { data: templates, error: tplErr }] = await Promise.all([
                supabaseClient.from('deals').select('*').order('updated_at', { ascending: false }),
                supabaseClient.from('clients').select('id, name').order('name', { ascending: true }),
                supabaseClient.from('profiles').select('id, full_name, role').eq('is_active', true).order('full_name', { ascending: true }),
                supabaseClient.from('deal_templates').select('*').order('title', { ascending: true })
            ]);
            if (dealsErr || clientsErr || mgrErr || tplErr) {
                console.error(dealsErr || clientsErr || mgrErr || tplErr);
                document.getElementById('dealsBoard').innerHTML = '<div class="panel-empty">Не удалось загрузить сделки</div>';
                return;
            }
            dealsCache = deals || [];
            clientsCache = clients || [];
            managersCache = managers || [];
            templatesCache = templates || [];
            renderBoard();

            // Если пришли по ссылке из колокольчика — сразу открыть нужную сделку.
            const params = new URLSearchParams(window.location.search);
            const dealParam = params.get('deal');
            if (dealParam && dealsCache.some(d => d.id === dealParam)) {
                openDealModal(dealParam);
            }
        }

        function clientNameById(id) {
            const c = clientsCache.find(c => c.id === id);
            return c ? c.name : '—';
        }
        function managerNameById(id) {
            const m = managersCache.find(m => m.id === id);
            return m ? m.full_name : '—';
        }

        function renderBoard() {
            const query = document.getElementById('dealSearch').value.trim().toLowerCase();
            document.getElementById('viewMyBtn').classList.toggle('active', viewMode === 'my');
            document.getElementById('viewAllBtn').classList.toggle('active', viewMode === 'all');

            let filtered = dealsCache;
            if (viewMode === 'my') filtered = filtered.filter(d => d.manager_id === currentUser.id);
            if (query) {
                filtered = filtered.filter(d => [d.title, clientNameById(d.client_id)].some(v => (v || '').toLowerCase().includes(query)));
            }

            const board = document.getElementById('dealsBoard');
            if (dealsCache.length === 0) {
                board.innerHTML = '<div class="panel-empty">Сделок пока нет — начните с кнопки «+ Новая сделка»</div>';
                return;
            }

            board.innerHTML = `<div class="deals-board">${DEAL_STAGES.map(stage => {
                const items = filtered.filter(d => d.stage === stage.key);
                const cardsHtml = items.length > 0
                    ? items.map(d => renderDealCard(d)).join('')
                    : '<div class="deal-col-empty">Пусто</div>';
                return `<div class="deal-col ${stage.key === 'lost' ? 'lost' : ''}">
                    <div class="deal-col-head"><span>${stage.label}</span><span class="deal-col-count">${items.length}</span></div>
                    ${cardsHtml}
                </div>`;
            }).join('')}</div>`;
        }

        function renderDealCard(d) {
            const checklist = Array.isArray(d.checklist) ? d.checklist : [];
            const checklistDone = checklist.filter(i => i.done).length;
            const hasCommercial = d.commercial_approval_status !== 'none';
            const approvalChip = d.commercial_approval_status === 'pending' ? '<span class="deal-chip pending">⏳ Ждёт решения</span>'
                : d.commercial_approval_status === 'approved' ? '<span class="deal-chip approved">✓ Согласовано</span>'
                : d.commercial_approval_status === 'rejected' ? '<span class="deal-chip rejected">✗ Отклонено</span>' : '';
            const followupOverdue = d.next_followup_date && daysUntilDate(d.next_followup_date) <= 0 && d.stage !== 'won' && d.stage !== 'lost';
            return `<div class="deal-card" onclick="openDealModal('${d.id}')">
                <div class="deal-card-title">${escapeHtml(d.title)}</div>
                <div class="deal-card-client">${escapeHtml(clientNameById(d.client_id))}${d.source ? ' · ' + DEAL_SOURCE_LABELS[d.source] + (d.source === 'other' && d.source_note ? ' (' + escapeHtml(d.source_note) + ')' : '') : ''}</div>
                <div class="deal-card-row">
                    ${d.price ? `<span class="deal-chip price">${Number(d.price).toLocaleString('ru-RU')} ₽</span>` : ''}
                    ${hasCommercial ? approvalChip : ''}
                    ${checklist.length > 0 ? `<span class="deal-chip checklist">☑ ${checklistDone}/${checklist.length}</span>` : ''}
                    ${viewMode === 'all' ? `<span class="deal-chip manager">${escapeHtml(managerNameById(d.manager_id))}</span>` : ''}
                    ${followupOverdue ? '<span class="deal-chip followup">Пора связаться</span>' : ''}
                </div>
                ${d.next_action && d.stage !== 'won' && d.stage !== 'lost' ? `<div class="deal-card-client" style="margin-top:6px;">→ ${escapeHtml(d.next_action)}</div>` : ''}
            </div>`;
        }

        // ===================== Модалка сделки =====================

        function populateClientSelect(selectedId) {
            const sel = document.getElementById('dealClientSelect');
            sel.innerHTML = '<option value="">— выбрать клиента —</option><option value="__new__">+ Новый клиент</option>'
                + clientsCache.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
            sel.value = selectedId && clientsCache.some(c => c.id === selectedId) ? selectedId : '';
            onDealClientChange();
        }
        function onDealClientChange() {
            const isNew = document.getElementById('dealClientSelect').value === '__new__';
            document.getElementById('dealClientNewBox').style.display = isNew ? '' : 'none';
            document.getElementById('dealClientDuplicateHint').style.display = 'none';
        }

        // Проверка на дубль по телефону "на лету", пока менеджер печатает —
        // не блокирует, просто подсказывает, если похожий клиент уже есть.
        let dealClientDuplicateMatch = null;
        let dealClientPhoneCheckTimer = null;
        function onDealClientNewPhoneInput() {
            clearTimeout(dealClientPhoneCheckTimer);
            dealClientPhoneCheckTimer = setTimeout(async () => {
                const phone = document.getElementById('dealClientNewPhone').value;
                const hint = document.getElementById('dealClientDuplicateHint');
                if (normalizePhoneDigits(phone).length < 10) { hint.style.display = 'none'; dealClientDuplicateMatch = null; return; }
                const matches = await findClientsByPhone(phone);
                if (matches.length > 0) {
                    dealClientDuplicateMatch = matches[0];
                    hint.textContent = `⚠ Уже есть клиент с таким телефоном: «${matches[0].name}». При сохранении можно будет использовать его вместо нового.`;
                    hint.style.display = '';
                } else {
                    dealClientDuplicateMatch = null;
                    hint.style.display = 'none';
                }
            }, 400);
        }

        function populateManagerSelect(selectedId) {
            const field = document.getElementById('dealManagerField');
            const sel = document.getElementById('dealManagerSelect');
            const canReassign = canManageProjectsRole(currentUser);
            if (!canReassign) {
                field.style.display = 'none';
                sel.innerHTML = `<option value="${currentUser.id}">${escapeHtml(currentUser.full_name)}</option>`;
                sel.value = currentUser.id;
                return;
            }
            field.style.display = '';
            const eligible = managersCache.filter(m => ['manager', 'lead', 'art_director', 'ceo'].includes(m.role) || m.id === currentUser.id);
            sel.innerHTML = eligible.map(m => `<option value="${m.id}">${escapeHtml(m.full_name)}</option>`).join('');
            sel.value = selectedId || currentUser.id;
        }

        function populateTemplateSelect() {
            const sel = document.getElementById('dealTemplateSelect');
            sel.innerHTML = '<option value="">— без шаблона —</option>' + templatesCache.map(t => `<option value="${t.id}">${escapeHtml(t.title)}</option>`).join('');
        }
        function onDealTemplateChange() {
            const id = document.getElementById('dealTemplateSelect').value;
            const tpl = templatesCache.find(t => t.id === id);
            if (!tpl) return;
            if (currentChecklist.length > 0 && !confirm('Заменить текущий чек-лист пунктами из шаблона?')) return;
            currentChecklist = (tpl.checklist || []).map(text => ({ text, done: false }));
            renderChecklistList();
        }

        function renderFreeItemsList() {
            const el = document.getElementById('dealFreeItemsList');
            if (currentFreeItems.length === 0) { el.innerHTML = ''; return; }
            el.innerHTML = currentFreeItems.map((item, i) => `
                <div class="free-item-row">
                    <input type="text" class="field-input" placeholder="Что именно" value="${escapeHtml(item.title || '')}" oninput="currentFreeItems[${i}].title = this.value">
                    <input type="text" class="field-input" placeholder="Заметка (необязательно)" value="${escapeHtml(item.note || '')}" oninput="currentFreeItems[${i}].note = this.value" style="max-width:180px;">
                    <button type="button" class="row-remove-btn" onclick="removeFreeItemRow(${i})">${ICON.trash}</button>
                </div>`).join('');
        }
        function addFreeItemRow() { currentFreeItems.push({ title: '', note: '' }); renderFreeItemsList(); }
        function removeFreeItemRow(i) { currentFreeItems.splice(i, 1); renderFreeItemsList(); }

        function renderChecklistList() {
            const section = document.getElementById('dealChecklistSection');
            const el = document.getElementById('dealChecklistList');
            if (currentChecklist.length === 0) { section.style.display = 'none'; el.innerHTML = ''; return; }
            section.style.display = '';
            el.innerHTML = currentChecklist.map((item, i) => `
                <div class="checklist-item-row">
                    <label class="${item.done ? 'done' : ''}">
                        <input type="checkbox" ${item.done ? 'checked' : ''} onchange="toggleChecklistItem(${i})">
                        ${escapeHtml(item.text)}
                    </label>
                </div>`).join('');
        }
        function toggleChecklistItem(i) {
            currentChecklist[i].done = !currentChecklist[i].done;
            renderChecklistList();
            if (editingDealId) {
                supabaseClient.from('deals').update({ checklist: currentChecklist }).eq('id', editingDealId).then(({ error }) => {
                    if (error) { console.error(error); showToast('Не удалось сохранить чек-лист', 'error'); }
                });
            }
        }

function populateSourceSelect(selected) {
            const sel = document.getElementById('dealSource');
            sel.innerHTML = '<option value="">— не указан —</option>' + Object.keys(DEAL_SOURCE_LABELS).map(k => `<option value="${k}">${DEAL_SOURCE_LABELS[k]}</option>`).join('');
            sel.value = selected || '';
            onDealSourceChange();
        }
        function onDealSourceChange() {
            document.getElementById('dealSourceNote').style.display = document.getElementById('dealSource').value === 'other' ? '' : 'none';
        }
        function populateLostReasonSelect(selected) {
            const sel = document.getElementById('dealLostReasonCategory');
            sel.innerHTML = '<option value="">— выбрать причину —</option>' + Object.keys(DEAL_LOST_REASON_LABELS).map(k => `<option value="${k}">${DEAL_LOST_REASON_LABELS[k]}</option>`).join('');
            sel.value = selected || '';
        }

        function renderStageRow(deal) {
            const row = document.getElementById('dealStageRow');
            row.innerHTML = DEAL_STAGES.map(s => `<button type="button" class="stage-btn ${s.key === 'lost' ? 'lost-btn' : ''} ${deal.stage === s.key ? 'active' : ''}" onclick="changeDealStage('${s.key}')">${s.label}</button>`).join('');
            document.getElementById('dealLostReasonField').style.display = deal.stage === 'lost' ? '' : 'none';
            populateLostReasonSelect(deal.lost_reason_category);
            document.getElementById('dealLostReason').value = deal.lost_reason || '';
        }
        async function changeDealStage(stageKey) {
            if (!editingDealId) return;
            const { error } = await supabaseClient.from('deals').update({ stage: stageKey }).eq('id', editingDealId);
            if (error) { console.error(error); showToast('Не удалось сменить стадию', 'error'); return; }
            showToast(stageKey === 'lost' ? 'Стадия обновлена — укажите ниже причину отказа' : 'Стадия обновлена', 'success');
            await loadAll();
            openDealModal(editingDealId);
        }
        async function saveLostReason() {
            if (!editingDealId) return;
            const category = document.getElementById('dealLostReasonCategory').value || null;
            const comment = document.getElementById('dealLostReason').value.trim() || null;
            const { error } = await supabaseClient.from('deals').update({ lost_reason_category: category, lost_reason: comment }).eq('id', editingDealId);
            if (error) { console.error(error); showToast('Не удалось сохранить причину', 'error'); return; }
            showToast('Причина сохранена', 'success');
            await loadAll();
        }

        function renderApprovalBox(deal) {
            const box = document.getElementById('dealApprovalBox');
            if (deal.commercial_approval_status === 'none') { box.style.display = 'none'; return; }
            box.style.display = '';
            const canApprove = canApproveCommercial(currentUser) && deal.commercial_approval_status === 'pending';
            if (deal.commercial_approval_status === 'pending') {
                box.className = 'approval-box pending';
                box.innerHTML = `<div class="approval-box-head">⏳ Ждёт согласования скидки/бесплатных условий</div>
                    <div>Пока условия не одобрены, сделку не стоит переводить в проект.</div>
                    ${canApprove ? `<div style="margin-top:10px; display:flex; gap:8px;">
                        <button class="btn btn-primary" onclick="approveDeal()" style="padding:6px 14px; font-size:12.5px;">Одобрить</button>
                        <button class="btn btn-danger" onclick="rejectDeal()" style="padding:6px 14px; font-size:12.5px;">Отклонить</button>
                    </div>` : ''}`;
            } else if (deal.commercial_approval_status === 'approved') {
                box.className = 'approval-box approved';
                box.innerHTML = `<div class="approval-box-head">✓ Условия согласованы</div><div>Одобрил: ${escapeHtml(managerNameById(deal.approved_by))}</div>`;
            } else {
                box.className = 'approval-box rejected';
                box.innerHTML = `<div class="approval-box-head">✗ Условия отклонены</div><div>${escapeHtml(deal.rejection_note || 'Без комментария')} — ${escapeHtml(managerNameById(deal.rejected_by))}</div>`;
            }
        }
        async function approveDeal() {
            const { error } = await supabaseClient.from('deals').update({ commercial_approval_status: 'approved', approved_by: currentUser.id, rejected_by: null, rejection_note: null }).eq('id', editingDealId);
            if (error) { console.error(error); showToast('Не удалось согласовать', 'error'); return; }
            showToast('Условия согласованы', 'success');
            await loadAll();
            openDealModal(editingDealId);
        }
        async function rejectDeal() {
            const note = prompt('Причина отказа в скидке/бесплатном условии:', '') || '';
            const { error } = await supabaseClient.from('deals').update({ commercial_approval_status: 'rejected', rejected_by: currentUser.id, rejection_note: note || null, approved_by: null }).eq('id', editingDealId);
            if (error) { console.error(error); showToast('Не удалось отклонить', 'error'); return; }
            showToast('Условия отклонены', 'warning');
            await loadAll();
            openDealModal(editingDealId);
        }

        let dealPaymentsCache = [];
        async function renderPaymentsSection(deal) {
            const section = document.getElementById('dealPaymentsSection');
            if (!deal) { section.style.display = 'none'; return; }
            section.style.display = '';
            document.getElementById('dealPaymentAddRow').style.display = canAddDealPayment(currentUser) ? '' : 'none';
            document.querySelector('#dealPaymentsSection button[onclick="addDealPayment()"]').style.display = canAddDealPayment(currentUser) ? '' : 'none';
            document.getElementById('dealPaymentDate').value = todayIso();

            const { data, error } = await supabaseClient.from('deal_payments').select('*').eq('deal_id', deal.id).order('payment_date', { ascending: false });
            if (error) { console.error(error); document.getElementById('dealPaymentsList').innerHTML = '<div class="activity-empty">Не удалось загрузить платежи</div>'; return; }
            dealPaymentsCache = data || [];

            const received = dealPaymentsCache.reduce((sum, p) => sum + Number(p.amount), 0);
            const price = Number(deal.price) || 0;
            const remaining = Math.max(0, price - received);
            document.getElementById('dealPaymentsSummary').innerHTML = price > 0
                ? `Получено: <b>${received.toLocaleString('ru-RU')} ₽</b> из ${price.toLocaleString('ru-RU')} ₽ ${remaining > 0 ? `· Остаток: <b>${remaining.toLocaleString('ru-RU')} ₽</b>` : '· <span style="color: var(--success, #1a9e5c);">Оплачено полностью</span>'}`
                : `Получено: <b>${received.toLocaleString('ru-RU')} ₽</b>`;

            const canEdit = canEditDealPayment(currentUser);
            document.getElementById('dealPaymentsList').innerHTML = dealPaymentsCache.length === 0
                ? '<div class="activity-empty">Оплат пока нет</div>'
                : dealPaymentsCache.map(p => `<div class="payment-row">
                    <div>
                        <span class="payment-row-amount">${Number(p.amount).toLocaleString('ru-RU')} ₽</span>
                        <span class="payment-row-meta"> · ${new Date(p.payment_date).toLocaleDateString('ru-RU')}${p.note ? ' · ' + escapeHtml(p.note) : ''}</span>
                    </div>
                    ${canEdit ? `<button class="row-remove-btn" onclick="deleteDealPayment('${p.id}')">${ICON.trash}</button>` : ''}
                </div>`).join('');
        }
        async function addDealPayment() {
            const amount = Number(document.getElementById('dealPaymentAmount').value);
            if (!amount || amount <= 0) { showToast('Укажите сумму оплаты', 'error'); return; }
            const date = document.getElementById('dealPaymentDate').value || todayIso();
            const note = document.getElementById('dealPaymentNote').value.trim() || null;
            const { error } = await supabaseClient.from('deal_payments').insert({ deal_id: editingDealId, amount, payment_date: date, note, created_by: currentUser.id });
            if (error) { console.error(error); showToast('Не удалось внести оплату', 'error'); return; }
            document.getElementById('dealPaymentAmount').value = '';
            document.getElementById('dealPaymentNote').value = '';
            showToast('Оплата внесена', 'success');
            const deal = dealsCache.find(d => d.id === editingDealId);
            await renderPaymentsSection(deal);
        }
        async function deleteDealPayment(id) {
            if (!confirm('Удалить запись об оплате?')) return;
            const { error } = await supabaseClient.from('deal_payments').delete().eq('id', id);
            if (error) { console.error(error); showToast('Не удалось удалить', 'error'); return; }
            const deal = dealsCache.find(d => d.id === editingDealId);
            await renderPaymentsSection(deal);
        }

        async function renderActivityFeed() {
            const el = document.getElementById('dealActivityFeed');
            el.innerHTML = '<div class="activity-empty">Загрузка...</div>';
            const { data, error } = await supabaseClient.from('deal_activities').select('*').eq('deal_id', editingDealId).order('created_at', { ascending: false });
            if (error) { console.error(error); el.innerHTML = '<div class="activity-empty">Не удалось загрузить историю</div>'; return; }
            if (!data || data.length === 0) { el.innerHTML = '<div class="activity-empty">Записей пока нет</div>'; return; }
            el.innerHTML = data.map(a => {
                const canDelete = a.author_id === currentUser.id || canManageProjectsRole(currentUser);
                const when = new Date(a.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
                return `<div class="activity-item">
                    <div class="activity-item-head">
                        <span>${ACTIVITY_KIND_LABELS[a.kind] || a.kind} · ${escapeHtml(managerNameById(a.author_id))} · ${when}</span>
                        ${canDelete ? `<button class="row-remove-btn" onclick="deleteActivity('${a.id}')">${ICON.trash}</button>` : ''}
                    </div>
                    <div class="activity-item-content">${escapeHtml(a.content)}</div>
                </div>`;
            }).join('');
        }
        async function addActivity() {
            const content = document.getElementById('dealActivityContent').value.trim();
            if (!content) { showToast('Напишите, что было обсуждено', 'error'); return; }
            const kind = document.getElementById('dealActivityKind').value;
            const { error } = await supabaseClient.from('deal_activities').insert({ deal_id: editingDealId, author_id: currentUser.id, kind, content });
            if (error) { console.error(error); showToast('Не удалось добавить запись', 'error'); return; }
            document.getElementById('dealActivityContent').value = '';
            await renderActivityFeed();
        }
        async function deleteActivity(id) {
            if (!confirm('Удалить запись?')) return;
            const { error } = await supabaseClient.from('deal_activities').delete().eq('id', id);
            if (error) { console.error(error); showToast('Не удалось удалить', 'error'); return; }
            await renderActivityFeed();
        }

        function openDealModal(id) {
            editingDealId = id;
            const deal = id ? dealsCache.find(d => d.id === id) : null;

            document.getElementById('dealFormTitle').textContent = deal ? 'Сделка' : 'Новая сделка';
            document.getElementById('dealFormSubmitBtn').textContent = deal ? 'Сохранить' : 'Создать';
            document.getElementById('dealFormSubmitBtn').style.display = deal ? 'none' : '';
            document.getElementById('dealTitle').value = deal ? deal.title : '';
            document.getElementById('dealFollowup').value = deal ? (deal.next_followup_date || '') : '';
            document.getElementById('dealNextAction').value = deal ? (deal.next_action || '') : '';
            populateSourceSelect(deal ? deal.source : null);
            document.getElementById('dealSourceNote').value = deal ? (deal.source_note || '') : '';
            document.getElementById('dealClientNew').value = '';
            document.getElementById('dealClientNewPhone').value = '';
            document.getElementById('dealClientDuplicateHint').style.display = 'none';
            dealClientDuplicateMatch = null;
            document.getElementById('dealPrice').value = deal && deal.price != null ? deal.price : '';
            document.getElementById('dealDiscountPercent').value = deal ? deal.discount_percent : 0;
            document.getElementById('dealDiscountAmount').value = deal ? deal.discount_amount : 0;
            document.getElementById('dealDiscountReason').value = deal ? (deal.discount_reason || '') : '';
            currentFreeItems = deal && Array.isArray(deal.free_items) ? JSON.parse(JSON.stringify(deal.free_items)) : [];
            currentChecklist = deal && Array.isArray(deal.checklist) ? JSON.parse(JSON.stringify(deal.checklist)) : [];

            populateClientSelect(deal ? deal.client_id : null);
            populateManagerSelect(deal ? deal.manager_id : currentUser.id);
            populateTemplateSelect();
            document.getElementById('dealTemplateSelect').value = deal ? (deal.template_id || '') : '';
            document.getElementById('dealTemplateField').style.display = deal ? 'none' : '';
            renderFreeItemsList();
            renderChecklistList();

            document.getElementById('dealStageSection').style.display = deal ? '' : 'none';
            if (deal) renderStageRow(deal);
            renderApprovalBox(deal || { commercial_approval_status: 'none' });

            document.getElementById('dealActivitySection').style.display = deal ? '' : 'none';
            if (deal) renderActivityFeed();
            renderPaymentsSection(deal);

            const canManage = canManageProjectsRole(currentUser);
            document.getElementById('dealDeleteBtn').style.display = (deal && canManage) ? '' : 'none';
            document.getElementById('dealConvertBtn').style.display = (deal && !deal.project_id && deal.commercial_approval_status !== 'pending' && deal.commercial_approval_status !== 'rejected') ? '' : 'none';

            document.getElementById('dealFormModal').style.display = 'flex';

            // "Создать" остаётся видимой кнопкой создания только для новой сделки;
            // для существующей — правки полей сохраняются отдельной кнопкой ниже.
            if (deal) {
                document.getElementById('dealFormSubmitBtn').style.display = '';
                document.getElementById('dealFormSubmitBtn').textContent = 'Сохранить изменения';
            }
        }

        function closeDealModal() {
            document.getElementById('dealFormModal').style.display = 'none';
            editingDealId = null;
            // Убираем ?deal=... из адресной строки, чтобы повторный заход не переоткрывал её сам.
            if (window.location.search.includes('deal=')) {
                window.history.replaceState({}, '', window.location.pathname);
            }
        }

        async function submitDealForm() {
            const title = document.getElementById('dealTitle').value.trim();
            if (!title) { showToast('Укажите название сделки', 'error'); return; }

            const clientSelectValue = document.getElementById('dealClientSelect').value;
            let clientId = null;
            if (clientSelectValue === '__new__') {
                const newName = document.getElementById('dealClientNew').value.trim();
                if (!newName) { showToast('Укажите название нового клиента', 'error'); return; }
                const newPhone = document.getElementById('dealClientNewPhone').value.trim();
                if (dealClientDuplicateMatch && !confirm(`Использовать существующего клиента «${dealClientDuplicateMatch.name}» вместо создания нового с этим телефоном?\n\nОК — использовать существующего.\nОтмена — всё равно создать нового.`)) {
                    // Явно отказались от подставленного клиента — создаём нового, как ввели.
                    const client = await findOrCreateClientByName(newName, currentUser.id, newPhone);
                    clientId = client ? client.id : null;
                } else if (dealClientDuplicateMatch) {
                    clientId = dealClientDuplicateMatch.id;
                } else {
                    const client = await findOrCreateClientByName(newName, currentUser.id, newPhone);
                    clientId = client ? client.id : null;
                }
            } else if (clientSelectValue) {
                clientId = clientSelectValue;
            }
            if (!clientId) { showToast('Выберите или укажите клиента', 'error'); return; }

            const managerId = document.getElementById('dealManagerSelect').value || currentUser.id;
            const price = document.getElementById('dealPrice').value ? Number(document.getElementById('dealPrice').value) : null;
            const discountPercent = Number(document.getElementById('dealDiscountPercent').value) || 0;
            const discountAmount = Number(document.getElementById('dealDiscountAmount').value) || 0;
            const discountReason = document.getElementById('dealDiscountReason').value.trim() || null;
            const nextFollowup = document.getElementById('dealFollowup').value || null;
            const nextAction = document.getElementById('dealNextAction').value.trim() || null;
            const source = document.getElementById('dealSource').value || null;
            const sourceNote = source === 'other' ? (document.getElementById('dealSourceNote').value.trim() || null) : null;
            const freeItems = currentFreeItems.filter(i => (i.title || '').trim()).map(i => ({ title: i.title.trim(), note: (i.note || '').trim() }));

            const payload = {
                client_id: clientId, title, manager_id: managerId, source, source_note: sourceNote,
                price, discount_percent: discountPercent, discount_amount: discountAmount, discount_reason: discountReason,
                free_items: freeItems, next_followup_date: nextFollowup, next_action: nextAction
            };

            if (editingDealId) {
                const { error } = await supabaseClient.from('deals').update(payload).eq('id', editingDealId);
                if (error) { console.error(error); showToast(isNetworkError(error) ? 'Нет соединения — попробуйте ещё раз' : 'Не удалось сохранить сделку', 'error'); return; }
                showToast('Сделка обновлена', 'success');
                closeDealModal();
                await loadAll();
            } else {
                payload.created_by = currentUser.id;
                payload.template_id = document.getElementById('dealTemplateSelect').value || null;
                payload.checklist = currentChecklist;
                const { data, error } = await supabaseClient.from('deals').insert(payload).select().single();
                if (error) { console.error(error); showToast(isNetworkError(error) ? 'Нет соединения — попробуйте ещё раз' : 'Не удалось создать сделку', 'error'); return; }
                showToast('Сделка создана', 'success');
                await loadAll();
                openDealModal(data.id);
            }
        }

        async function deleteDealFromModal() {
            if (!editingDealId) return;
            if (!confirm('Удалить сделку целиком? Это удалит и всю историю переписки по ней.')) return;
            const { error } = await supabaseClient.from('deals').delete().eq('id', editingDealId);
            if (error) { console.error(error); showToast('Не удалось удалить сделку', 'error'); return; }
            showToast('Сделка удалена', 'warning');
            closeDealModal();
            await loadAll();
        }

        async function convertDealToProject() {
            const deal = dealsCache.find(d => d.id === editingDealId);
            if (!deal) return;
            if (!confirm('Создать проект из этой сделки? Коммерческие условия будут перенесены в заметку проекта.')) return;

            const clientName = clientNameById(deal.client_id);
            const lines = [];
            if (deal.price) lines.push(`Стоимость: ${Number(deal.price).toLocaleString('ru-RU')} ₽`);
            if (deal.discount_percent > 0 || deal.discount_amount > 0) {
                lines.push(`Скидка: ${deal.discount_percent > 0 ? deal.discount_percent + '%' : ''}${deal.discount_percent > 0 && deal.discount_amount > 0 ? ' + ' : ''}${deal.discount_amount > 0 ? Number(deal.discount_amount).toLocaleString('ru-RU') + ' ₽' : ''}${deal.discount_reason ? ' (' + deal.discount_reason + ')' : ''} — согласовано`);
            }
            if (Array.isArray(deal.free_items) && deal.free_items.length > 0) {
                lines.push('Бесплатно по договорённости: ' + deal.free_items.map(i => i.title + (i.note ? ` (${i.note})` : '')).join('; ') + ' — согласовано');
            }
            const notes = lines.length > 0 ? lines.join('\n') : null;

            const isManagerNotAdmin = currentUser.role === 'manager' && !currentUser.is_admin;
            const payload = { name: deal.title, client_name: clientName, client_id: deal.client_id, notes, completed: false, created_by: currentUser.id };
            if (isManagerNotAdmin) payload.approval_status = 'pending';

            const { data: project, error } = await supabaseClient.from('projects').insert(payload).select().single();
            if (error) { console.error(error); showToast('Не удалось создать проект', 'error'); return; }

            await supabaseClient.from('deals').update({ project_id: project.id, stage: 'won' }).eq('id', deal.id);
            showToast(isManagerNotAdmin ? 'Проект создан и отправлен на согласование директору' : 'Проект создан из сделки', 'success');
            closeDealModal();
            window.location.href = `project.html?id=${project.id}`;
        }

        // ===================== Шаблоны =====================

        function openTemplatesModal() {
            renderTemplatesList();
            document.getElementById('templatesModal').style.display = 'flex';
        }
        function closeTemplatesModal() {
            document.getElementById('templatesModal').style.display = 'none';
        }
        function renderTemplatesList() {
            const el = document.getElementById('templatesList');
            if (templatesCache.length === 0) { el.innerHTML = '<div class="panel-empty">Шаблонов пока нет</div>'; return; }
            el.innerHTML = templatesCache.map(t => `
                <div class="tpl-card">
                    <div class="tpl-card-head">
                        <span class="tpl-card-title">${escapeHtml(t.title)}</span>
                        <div class="client-actions">
                            <button class="client-icon-btn" title="Редактировать" onclick="openTemplateEditForm('${t.id}')">${ICON.edit}</button>
                            <button class="client-icon-btn" title="Удалить" onclick="deleteTemplate('${t.id}')">${ICON.trash}</button>
                        </div>
                    </div>
                    <ul>${(t.checklist || []).map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>
                </div>`).join('');
        }

        function renderTemplateItemsList() {
            const el = document.getElementById('templateItemsList');
            el.innerHTML = currentTemplateItems.map((text, i) => `
                <div class="tpl-item-row">
                    <input type="text" class="field-input" value="${escapeHtml(text)}" oninput="currentTemplateItems[${i}] = this.value">
                    <button type="button" class="row-remove-btn" onclick="removeTemplateItemRow(${i})">${ICON.trash}</button>
                </div>`).join('');
        }
        function addTemplateItemRow() { currentTemplateItems.push(''); renderTemplateItemsList(); }
        function removeTemplateItemRow(i) { currentTemplateItems.splice(i, 1); renderTemplateItemsList(); }

        function openTemplateEditForm(id) {
            editingTemplateId = id || null;
            const tpl = id ? templatesCache.find(t => t.id === id) : null;
            document.getElementById('templateFormTitle').textContent = tpl ? 'Изменить шаблон' : 'Новый шаблон';
            document.getElementById('templateFormTitle_').value = tpl ? tpl.title : '';
            currentTemplateItems = tpl ? [...(tpl.checklist || [])] : [];
            renderTemplateItemsList();
            document.getElementById('templateFormModal').style.display = 'flex';
        }
        function closeTemplateEditForm() {
            document.getElementById('templateFormModal').style.display = 'none';
            editingTemplateId = null;
        }
        async function submitTemplateForm() {
            const title = document.getElementById('templateFormTitle_').value.trim();
            if (!title) { showToast('Укажите название шаблона', 'error'); return; }
            const checklist = currentTemplateItems.map(t => t.trim()).filter(Boolean);
            const payload = { title, checklist };
            let error;
            if (editingTemplateId) {
                ({ error } = await supabaseClient.from('deal_templates').update(payload).eq('id', editingTemplateId));
            } else {
                ({ error } = await supabaseClient.from('deal_templates').insert({ ...payload, created_by: currentUser.id }));
            }
            if (error) { console.error(error); showToast('Не удалось сохранить шаблон', 'error'); return; }
            showToast('Шаблон сохранён', 'success');
            closeTemplateEditForm();
            const { data } = await supabaseClient.from('deal_templates').select('*').order('title', { ascending: true });
            templatesCache = data || [];
            renderTemplatesList();
        }
        async function deleteTemplate(id) {
            if (!confirm('Удалить шаблон? На уже созданные сделки это не повлияет.')) return;
            const { error } = await supabaseClient.from('deal_templates').delete().eq('id', id);
            if (error) { console.error(error); showToast('Не удалось удалить шаблон', 'error'); return; }
            templatesCache = templatesCache.filter(t => t.id !== id);
            renderTemplatesList();
        }

        document.addEventListener('DOMContentLoaded', async function() {
            loadTheme();
            const ok = await requireAuth();
            if (!ok) return;
            initDeadlineReminders(currentUser);
            await loadAll();
            { const q = new URLSearchParams(location.search).get('q'); const inp = document.getElementById('dealSearch'); if (q && inp) { inp.value = q; renderBoard(); } }
        });
    
