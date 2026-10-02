        let currentUser = null;

        async function requireAuth() {
            return !!(await initAuthedPage());
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

        // ====== Мои проекты (я в команде проекта — project_members) ======
        async function loadMyProjects() {
            const { data: memberships, error } = await withRetry(() => supabaseClient
                .from('project_members')
                .select('project_id')
                .eq('user_id', currentUser.id));
            if (error) { console.error(error); return []; }
            if (!memberships || memberships.length === 0) return [];
            const projectIds = memberships.map(m => m.project_id);
            const { data: projects, error: projErr } = await supabaseClient
                .from('projects')
                .select('*')
                .in('id', projectIds)
                .order('created_at', { ascending: false });
            if (projErr) { console.error(projErr); return []; }
            return projects || [];
        }

        function renderMyProjects(projects) {
            document.getElementById('myProjectsCount').textContent = projects.length;
            const panel = document.getElementById('myProjectsPanel');
            if (projects.length === 0) {
                panel.innerHTML = '<div class="panel-empty">Вы пока не назначены ни в одну команду проекта — назначает руководитель кнопкой "Команда" на карточке проекта.</div>';
                return;
            }
            panel.innerHTML = projects.map(p => `
                <div class="my-row">
                    <div>
                        <div class="my-row-title">${escapeHtml(p.name)}</div>
                        <div class="my-row-sub">${p.deadline ? 'Дедлайн: ' + formatDateRu(p.deadline) : 'Без дедлайна'}</div>
                    </div>
                    <div class="my-row-actions">
                        ${p.completed ? `<span class="status-badge status-done"><span class="badge-dot"></span>Завершён</span>` : ''}
                        <a href="project.html?id=${p.id}" class="btn btn-primary" style="padding:6px 14px; font-size:13px;">Открыть</a>
                    </div>
                </div>
            `).join('');
        }

        // ====== Мои кадры (frames.assigned_to = я), по всем проектам сразу ======
        async function loadMyFrames() {
            const { data: frames, error } = await withRetry(() => supabaseClient
                .from('frames')
                .select('*')
                .eq('assigned_to', currentUser.id)
                .order('is_priority', { ascending: false })
                .order('created_at', { ascending: false }));
            if (error) { console.error(error); return []; }
            if (!frames || frames.length === 0) return [];
            const projectIds = [...new Set(frames.map(f => f.project_id))];
            const { data: projects } = await supabaseClient.from('projects').select('id, name').in('id', projectIds);
            return frames.map(f => ({ ...f, projectName: (projects || []).find(p => p.id === f.project_id)?.name || '' }));
        }

        function renderMyFrames(frames) {
            document.getElementById('myFramesCount').textContent = frames.length;
            const panel = document.getElementById('myFramesPanel');
            if (frames.length === 0) {
                panel.innerHTML = '<div class="panel-empty">Пока ни один кадр не назначен лично вам — назначить может руководитель проекта на странице проекта.</div>';
                return;
            }
            panel.innerHTML = frames.map(f => `
                <div class="my-row">
                    <div>
                        <div class="my-row-title">${escapeHtml(f.name)}</div>
                        <div class="my-row-sub">${escapeHtml(f.projectName)}</div>
                    </div>
                    <div class="my-row-actions">
                        ${f.is_priority ? `<span class="priority-badge">${ICON.warning} Горит</span>` : ''}
                        <span class="status-badge ${getFrameStatusClass(f.status)}"><span class="badge-dot"></span>${getFrameStatusLabel(f.status)}</span>
                        <a href="frame.html?project=${f.project_id}&frame=${f.id}" class="btn btn-primary" style="padding:6px 14px; font-size:13px;">Открыть</a>
                    </div>
                </div>
            `).join('');
        }

        // ====== Мои встречи — где я организатор или приглашённый, начиная с сегодня ======
        async function loadMyEvents() {
            const [{ data: organized, error: orgErr }, { data: inviteRows, error: invErr }] = await Promise.all([
                supabaseClient.from('company_events').select('*').eq('organizer_id', currentUser.id),
                supabaseClient.from('company_event_invitees').select('event_id').eq('user_id', currentUser.id)
            ]);
            if (orgErr) console.error(orgErr);
            if (invErr) console.error(invErr);
            const inviteIds = [...new Set((inviteRows || []).map(r => r.event_id))];
            let invited = [];
            if (inviteIds.length > 0) {
                const { data, error } = await supabaseClient.from('company_events').select('*').in('id', inviteIds);
                if (error) console.error(error);
                invited = data || [];
            }
            const byId = {};
            [...(organized || []), ...invited].forEach(e => { byId[e.id] = { ...e, isOrganizer: e.organizer_id === currentUser.id }; });
            const todayStr = todayIso();
            return Object.values(byId)
                .filter(e => e.event_date >= todayStr)
                .sort((a, b) => a.event_date.localeCompare(b.event_date) || (a.event_time || '').localeCompare(b.event_time || ''));
        }

        function renderMyEvents(events) {
            document.getElementById('myEventsCount').textContent = events.length;
            const panel = document.getElementById('myEventsPanel');
            if (events.length === 0) {
                panel.innerHTML = '<div class="panel-empty">Ближайших встреч нет</div>';
                return;
            }
            panel.innerHTML = events.map(e => {
                const date = new Date(e.event_date + 'T00:00:00').toLocaleDateString('ru-RU', { day: '2-digit', month: 'long' });
                const timeLabel = e.event_time ? `, ${e.event_time.slice(0, 5)}` : '';
                return `
                    <div class="my-row">
                        <div>
                            <div class="my-row-title">${escapeHtml(e.title)}</div>
                            <div class="my-row-sub">${date}${timeLabel}${e.isOrganizer ? ' · вы организатор' : ' · вы приглашены'}</div>
                        </div>
                        <div class="my-row-actions">
                            <a href="calendar.html" class="btn btn-primary" style="padding:6px 14px; font-size:13px;">В календарь</a>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // ====== Упоминания (@Имя Фамилия) в комментариях, по всем кадрам ======
        async function loadMyMentions() {
            const { data: comments, error } = await withRetry(() => supabaseClient
                .from('frame_comments')
                .select('*')
                .contains('mentions', [currentUser.id])
                .order('created_at', { ascending: false })
                .limit(30));
            if (error) { console.error(error); return []; }
            if (!comments || comments.length === 0) return [];

            const stageIds = [...new Set(comments.map(c => c.frame_stage_id).filter(Boolean))];
            const { data: stages } = await supabaseClient.from('frame_stages').select('id, frame_id, title').in('id', stageIds);
            const frameIds = [...new Set((stages || []).map(s => s.frame_id))];
            const { data: frames } = await supabaseClient.from('frames').select('id, name, project_id').in('id', frameIds);
            const projectIds = [...new Set((frames || []).map(f => f.project_id))];
            const { data: projects } = await supabaseClient.from('projects').select('id, name').in('id', projectIds);

            return comments.map(c => {
                const stage = (stages || []).find(s => s.id === c.frame_stage_id);
                const frame = stage ? (frames || []).find(f => f.id === stage.frame_id) : null;
                const project = frame ? (projects || []).find(p => p.id === frame.project_id) : null;
                return {
                    ...c,
                    stageTitle: stage ? stage.title : '',
                    frameId: frame ? frame.id : null,
                    frameName: frame ? frame.name : '',
                    projectId: project ? project.id : null,
                    projectName: project ? project.name : ''
                };
            });
        }

        function renderMyMentions(mentions) {
            document.getElementById('myMentionsCount').textContent = mentions.length;
            const panel = document.getElementById('myMentionsPanel');
            if (mentions.length === 0) {
                panel.innerHTML = '<div class="panel-empty">Пока никто вас не упоминал в комментариях (наберите @Имя в комментарии к этапу или задаче, чтобы упомянуть коллегу).</div>';
                return;
            }
            panel.innerHTML = mentions.map(c => {
                const date = new Date(c.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
                return `
                    <div class="my-row" style="align-items:flex-start;">
                        <div style="min-width:0; flex:1;">
                            <div class="my-row-title">${escapeHtml(c.author_name)} <span style="font-weight:400; color:var(--text-secondary); font-size:12px;">· ${date}</span></div>
                            <div class="my-row-sub">${escapeHtml(c.projectName)} · ${escapeHtml(c.frameName)}${c.stageTitle ? ' · ' + escapeHtml(c.stageTitle) : ''}</div>
                            <div class="mention-comment">${escapeHtml(c.text)}</div>
                        </div>
                        <div class="my-row-actions">
                            ${c.frameId ? `<a href="frame.html?project=${c.projectId}&frame=${c.frameId}" class="btn btn-primary" style="padding:6px 14px; font-size:13px;">Открыть кадр</a>` : ''}
                        </div>
                    </div>
                `;
            }).join('');
        }

        document.addEventListener('DOMContentLoaded', async function() {
            loadTheme();
            const ok = await requireAuth();
            if (!ok) return;
            initDeadlineReminders(currentUser);
            const [projects, frames, mentions, events] = await Promise.all([loadMyProjects(), loadMyFrames(), loadMyMentions(), loadMyEvents()]);
            renderMyProjects(projects);
            renderMyFrames(frames);
            renderMyMentions(mentions);
            renderMyEvents(events);
        });
    
