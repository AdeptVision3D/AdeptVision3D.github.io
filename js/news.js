        let currentUser = null;
        let editingNewsId = null;
        let newsCache = [];

        async function requireAuth() {
            const user = await initAuthedPage();
            if (!user) return false;
            document.getElementById('addNewsBtn').style.display = canManageNews(currentUser) ? '' : 'none';
            return true;
        }

        async function loadNews() {
            const { data, error } = await supabaseClient
                .from('company_news')
                .select('*')
                .order('pinned', { ascending: false })
                .order('created_at', { ascending: false });
            if (error) {
                console.error(error);
                document.getElementById('newsList').innerHTML = '<div class="panel-empty">Не удалось загрузить новости</div>';
                return;
            }
            // Джойним автора вручную (не через nested select) — так принято во всём проекте
            const { data: profiles, error: profErr } = await supabaseClient.from('profiles').select('id, full_name');
            if (profErr) console.error(profErr);
            const nameById = {};
            (profiles || []).forEach(p => { nameById[p.id] = p.full_name; });
            newsCache = (data || []).map(n => ({ ...n, authorName: nameById[n.created_by] || 'Неизвестно' }));
            markNewsSeen(newsCache.reduce((m, n) => (n.created_at > m ? n.created_at : m), ''));
            renderNews();
        }

        function renderNews() {
            const canManage = canManageNews(currentUser);
            const listEl = document.getElementById('newsList');
            if (newsCache.length === 0) {
                listEl.innerHTML = '<div class="panel-empty">Пока новостей нет' + (canManage ? ' — станьте первым, кто что-то объявит' : '') + '</div>';
                return;
            }
            listEl.innerHTML = newsCache.map(n => {
                const date = new Date(n.created_at).toLocaleString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                const authorName = n.authorName;
                const actions = canManage ? `
                    <div class="news-actions">
                        <button class="news-icon-btn" title="${n.pinned ? 'Открепить' : 'Закрепить'}" onclick="toggleNewsPin('${n.id}', ${!n.pinned})">${ICON.pin}</button>
                        <button class="news-icon-btn" title="Редактировать" onclick="openNewsFormModal('${n.id}')">${ICON.edit}</button>
                        <button class="news-icon-btn" title="Удалить" onclick="deleteNews('${n.id}')">${ICON.trash}</button>
                    </div>` : '';
                return `<div class="news-card ${n.pinned ? 'pinned' : ''}">
                    <div class="news-card-head">
                        <div>
                            <div class="news-title">${n.pinned ? `<span class="news-pin-badge">${ICON.pin}</span>` : ''}${escapeHtml(n.title)}</div>
                            <div class="news-meta">${escapeHtml(authorName)} · ${date}</div>
                        </div>
                        ${actions}
                    </div>
                    <div class="news-body">${escapeHtml(n.body)}</div>
                </div>`;
            }).join('');
        }

        function openNewsFormModal(id) {
            editingNewsId = id || null;
            const item = id ? newsCache.find(n => n.id === id) : null;
            document.getElementById('newsFormTitle').textContent = item ? 'Редактировать новость' : 'Новая новость';
            document.getElementById('newsFormSubmitBtn').textContent = item ? 'Сохранить' : 'Опубликовать';
            document.getElementById('newsFormTitleInput').value = item ? item.title : '';
            document.getElementById('newsFormBody').value = item ? item.body : '';
            document.getElementById('newsFormPinned').checked = item ? item.pinned : false;
            document.getElementById('newsFormModal').style.display = 'flex';
        }

        function closeNewsFormModal() {
            document.getElementById('newsFormModal').style.display = 'none';
            editingNewsId = null;
        }

        async function submitNewsForm() {
            const title = document.getElementById('newsFormTitleInput').value.trim();
            const body = document.getElementById('newsFormBody').value.trim();
            const pinned = document.getElementById('newsFormPinned').checked;
            if (!title || !body) { showToast('Заполните заголовок и текст', 'error'); return; }

            let error;
            if (editingNewsId) {
                ({ error } = await supabaseClient.from('company_news').update({ title, body, pinned, updated_at: new Date().toISOString() }).eq('id', editingNewsId));
            } else {
                ({ error } = await supabaseClient.from('company_news').insert({ title, body, pinned, created_by: currentUser.id }));
            }
            if (error) { console.error(error); showToast(isNetworkError(error) ? 'Нет соединения — попробуйте ещё раз' : 'Не удалось сохранить новость', 'error'); return; }
            showToast(editingNewsId ? 'Новость обновлена' : 'Новость опубликована', 'success');
            closeNewsFormModal();
            await loadNews();
        }

        async function toggleNewsPin(id, pinned) {
            const { error } = await supabaseClient.from('company_news').update({ pinned }).eq('id', id);
            if (error) { console.error(error); showToast('Не удалось обновить', 'error'); return; }
            await loadNews();
        }

        async function deleteNews(id) {
            if (!confirm('Удалить эту новость безвозвратно?')) return;
            const { error } = await supabaseClient.from('company_news').delete().eq('id', id);
            if (error) { console.error(error); showToast('Не удалось удалить', 'error'); return; }
            showToast('Новость удалена', 'success');
            await loadNews();
        }

        document.addEventListener('DOMContentLoaded', async function() {
            loadTheme();
            const ok = await requireAuth();
            if (!ok) return;
            initDeadlineReminders(currentUser);
            await loadNews();
        });
    
