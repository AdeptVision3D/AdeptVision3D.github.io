        let currentUser = null;

        async function requireAuth() {
            return !!(await initAuthedPage());
        }

        function canManageStages() { return currentUser && (hasAdminAccess(currentUser) || ['lead', 'art_director', 'ceo'].includes(currentUser.role)); }
        function canDeleteComments() { return currentUser && (hasAdminAccess(currentUser) || ['art_director', 'ceo'].includes(currentUser.role)); }

        const urlParams = new URLSearchParams(window.location.search);
        const projectId = urlParams.get('project');
        const frameId = urlParams.get('frame');
        // Фикс: сразу ставим правильную ссылку "Назад" по projectId из URL,
        // а не ждём успешной загрузки кадра (иначе при ошибке загрузки кнопка
        // вела на жёстко зашитый несуществующий id=1)
        document.addEventListener('DOMContentLoaded', function() {
            const backBtn = document.getElementById('backBtn');
            if (backBtn) backBtn.href = `project.html?id=${projectId || ''}`;
        });

        // Шаблон для ПЕРВИЧНОГО заполнения нового кадра (используется только один раз,
        // когда у кадра ещё нет своих этапов в базе — дальше каждый кадр живёт своей жизнью)
        const seedTemplate = [
            { number: 1, title: "Бриф и референсы", location: "pureref, ArchDaily/Behance/Pinterest", output: "Утверждённый мудборд + ТЗ", tasks: ["Собрать у заказчика референсы", "Согласовать стиль и настроение", "Определить ключевые ракурсы", "Зафиксировать формат кадра", "Утвердить мудборд"], qc: "Утверждённый мудборд + ТЗ", warning: "Начинать моделинг/свет без зафиксированного ракурса и референса — потом весь сетап переделывается." },
            { number: 2, title: "Сцена, камера, композиция", location: "3ds Max", output: "Утверждённый ракурс", tasks: ["Проверить масштаб сцены", "Настроить камеру (фокусное, высоту)", "Построить композицию по правилам третей", "Проверить читаемость геометрии", "Убедиться, что ключевые элементы не обрезаны", "Сохранить финальный camera preset"], qc: "Утверждённый ракурс, читается архитектура, нет случайных обрезаний", warning: "Ракурс «красивый», но не читается геометрия, либо ключевые элементы обрезаны краем кадра." },
            { number: 3, title: "Свет (Sun/Sky/HDRI)", location: "3ds Max / Corona", output: "Световой сценарий", tasks: ["Выбрать тип освещения (Sun+Sky / HDRI)", "Настроить направление и интенсивность света", "Проверить экспозицию и тон-маппинг", "Настроить LightMix", "Проверить читаемость планов", "Сохранить световые пресеты"], qc: "Свет соответствует референсам, нет пересветов, читаются планы", warning: "Гнаться за художественностью через интенсивность Sun/Sky вместо экспозиции/тон-маппинга." },
            { number: 4, title: "Материалы и детализация", location: "3ds Max / Corona", output: "Референс-приближенная сцена", tasks: ["Проверить физически корректный масштаб текстур", "Проверить UV и направление волокон", "Настроить roughness", "Проверить IOR", "Убрать заметный тайлинг", "Проверить соответствие референсу", "Проверить поведение материала в финальном освещении"], qc: "Материалы согласованы с финальным световым сценарием", warning: "Менять материал раньше света — материалы настраиваются после финального светового сценария." },
            { number: 5, title: "Оптимизация и рендер-сетап", location: "3ds Max / Corona", output: "Финальный рендер + пассы", tasks: ["Удалить невидимые объекты", "Оптимизировать геометрию", "Проверить карты и текстуры на размер", "Настроить Corona Denoiser", "Настроить Render Elements", "Проверить сцену на ошибки Corona", "Запустить тестовый рендер"], qc: "Сцена оптимизирована, рендер без артефактов", warning: "Экономить время на оптимизации сцены — потом это утраивает время рендера и повышает риск артефактов." },
            { number: 6, title: "Базовая цветокоррекция и постобработка", location: "Photoshop / Camera Raw", output: "Выровненный, чистый кадр", tasks: ["Открыть рендер в Camera Raw", "Настроить баланс белого", "Скорректировать экспозицию", "Настроить контраст и чёткость", "Убрать шумы (при необходимости)", "Проверить цвета на соответствие референсу"], qc: "Выровненный, чистый кадр, готовый к вставке людей", warning: "Слишком агрессивная обработка, потеря деталей в светах/тенях." },
            { number: 7, title: "Подготовка под людей", location: "Photoshop / скетч", output: "Разметка мест, поз, сценария", tasks: ["Определить места для людей", "Сделать скетч поз и сценария", "Согласовать количество персонажей", "Определить стиль одежды", "Согласовать сценарий с заказчиком"], qc: "Согласованный скетч сценария с людьми", warning: "Финальная генерация до согласования композиции." },
            { number: 8, title: "Генерация людей", location: "Lovart / Gemini / GPT image", output: "Готовые cutout-фигуры", tasks: ["Подготовить промпт с описанием ракурса и света", "Сгенерировать варианты в Lovart/Gemini/GPT", "Проверить соответствие ракурсу сцены", "Проверить освещение на фигурах", "Вырезать фигуры (удалить фон)", "Сохранить в PNG с прозрачностью"], qc: "Готовые cutout-фигуры, соответствующие сцене", warning: "Ракурс/свет фигуры не совпадает со сценой." },
            { number: 9, title: "Композитинг людей", location: "Photoshop", output: "Вписанные фигуры с тенями/цветом", tasks: ["Вставить фигуры в сцену", "Настроить размер и перспективу", "Добавить контактные тени", "Скорректировать цвет (Hue/Saturation)", "Проверить интеграцию с окружением", "Добавить размытие в движении (при необходимости)"], qc: "Вписанные фигуры с тенями и цветовой интеграцией", warning: "Идеально вырезанная фигура без контактной тени и без Hue/Saturation-сверки с рендером — «приклеенный» вид виден сразу." },
            { number: 10, title: "Финал и сдача", location: "Photoshop / Camera Raw", output: "Готовый кадр под формат сдачи", tasks: ["Финальная цветокоррекция", "Настроить тональный контраст", "Проверить кадр на артефакты", "Подготовить под требуемый формат", "Экспортировать в нужном разрешении", "Проверить файл перед сдачей"], qc: "Готовый кадр под формат сдачи", warning: "Несогласованный тональный контраст с назначением кадра." }
        ];

        let expandedStageIds = [];
        let currentCommentsStageId = null;
        let currentTaskComment = null;
        // Текущий статус кадра (для автостатусов) и кэш сотрудников (для @упоминаний)
        let currentFrameStatus = 'not_started';
        let allProfilesForMentions = [];

        // Главное хранилище в памяти: массив этапов кадра, у каждого — свой массив задач.
        // Загружается из frame_stages/frame_tasks и обновляется при каждом действии.
        let stagesData = [];

        function toggleWarnings() {
            const hidden = document.body.classList.toggle('hide-warnings');
            localStorage.setItem('decardHideWarnings', hidden ? '1' : '0');
            updateWarningsToggleLabel(hidden);
        }
        function loadWarningsPref() {
            const hidden = localStorage.getItem('decardHideWarnings') === '1';
            document.body.classList.toggle('hide-warnings', hidden);
            updateWarningsToggleLabel(hidden);
        }
        function updateWarningsToggleLabel(hidden) {
            const btn = document.getElementById('warningsToggleBtn');
            if (btn) btn.innerHTML = `${ICON.warning}<span class="btn-text"> ${hidden ? 'Показать предупреждения' : 'Скрыть предупреждения'}</span>`;
        }

        // ====== РАБОТА С ДАННЫМИ ЧЕРЕЗ SUPABASE ======

        async function getFrame() {
            const { data, error } = await supabaseClient.from('frames').select('*').eq('id', frameId).single();
            if (error) { console.error(error); return null; }
            return data;
        }

        // Список сотрудников для автокомплита "@" и подсветки упоминаний в комментариях
        async function loadProfilesForMentions() {
            const { data, error } = await supabaseClient.from('profiles').select('id, full_name').eq('is_active', true);
            if (error) { console.error(error); return; }
            allProfilesForMentions = data || [];
        }

        async function completeFrame() {
            // completed_at фиксируем вместе со статусом — по нему считаем "сдано в срок/с опозданием"
            const { error } = await supabaseClient.from('frames').update({ status: 'done', completed_at: new Date().toISOString() }).eq('id', frameId);
            if (error) { console.error(error); showToast('Не удалось завершить кадр', 'error'); return; }
            currentFrameStatus = 'done';
            await logActivity('frame_complete', 'Кадр отмечен как завершённый');
            showToast('Кадр завершён!', 'success');
            setTimeout(() => { window.location.href = `project.html?id=${projectId}`; }, 1000);
        }

        // ====== Автостатусы: статус кадра сам подстраивается под прогресс задач ======
        // Не мешает ручному "Завершить кадр" — просто держит статус в согласии с чеклистом,
        // чтобы не забывали вручную переключать "В работу"/"Готов".
        async function maybeAutoUpdateFrameStatus(totalTasks, completedTasks) {
            if (totalTasks === 0) return;
            const allDone = completedTasks === totalTasks;
            if (allDone && currentFrameStatus !== 'done') {
                const { error } = await supabaseClient.from('frames').update({ status: 'done', completed_at: new Date().toISOString() }).eq('id', frameId);
                if (error) { console.error(error); return; }
                currentFrameStatus = 'done';
                showToast('Все задачи выполнены — кадр автоматически отмечен как готов', 'success');
                logActivity('frame_auto_status', 'Кадр автоматически переведён в статус «Готов» — все задачи выполнены');
            } else if (!allDone && currentFrameStatus === 'done') {
                const { error } = await supabaseClient.from('frames').update({ status: 'in_progress', completed_at: null }).eq('id', frameId);
                if (error) { console.error(error); return; }
                currentFrameStatus = 'in_progress';
                showToast('Статус кадра автоматически возвращён «В работе»', 'warning');
                logActivity('frame_auto_status', 'Кадр автоматически возвращён в статус «В работе» — не все задачи выполнены');
            }
        }

        // Если у кадра ещё нет своих этапов в базе — создаём их один раз из шаблона
        async function seedFrameStagesIfNeeded() {
            const { data: existing, error } = await supabaseClient.from('frame_stages').select('id').eq('frame_id', frameId).limit(1);
            if (error) { console.error(error); return; }
            if (existing && existing.length > 0) return; // уже заполнено раньше

            const stageRows = seedTemplate.map(s => ({
                frame_id: frameId, stage_number: s.number, title: s.title, location: s.location,
                output: s.output, qc: s.qc, warning: s.warning, stage_type: 'base', is_custom: false
            }));
            const { data: insertedStages, error: stageError } = await supabaseClient.from('frame_stages').insert(stageRows).select();
            if (stageError) { console.error(stageError); showToast('Ошибка создания этапов кадра', 'error'); return; }

            const taskRows = [];
            insertedStages.forEach(stageRow => {
                const template = seedTemplate.find(s => s.number === stageRow.stage_number);
                template.tasks.forEach((taskText, i) => {
                    taskRows.push({ frame_stage_id: stageRow.id, task_index: i, text: taskText, checked: false });
                });
            });
            const { error: taskError } = await supabaseClient.from('frame_tasks').insert(taskRows);
            if (taskError) { console.error(taskError); showToast('Ошибка создания задач кадра', 'error'); }
        }

        // Загружает все этапы кадра вместе с их задачами и комментариями (к этапам и к задачам)
        async function loadStagesData() {
            const { data: stages, error } = await withRetry(() => supabaseClient.from('frame_stages').select('*').eq('frame_id', frameId).order('stage_number', { ascending: true }));
            if (error) {
                console.error(error);
                showToast(isNetworkError(error) ? 'Нет соединения — проверьте сеть и обновите страницу' : 'Ошибка загрузки этапов', 'error');
                stagesData = []; return;
            }
            const stageIds = stages.map(s => s.id);
            let tasks = [];
            let comments = [];
            if (stageIds.length > 0) {
                const { data: taskData, error: taskErr } = await supabaseClient.from('frame_tasks').select('*').in('frame_stage_id', stageIds).order('task_index', { ascending: true });
                if (taskErr) { console.error(taskErr); showToast('Ошибка загрузки задач', 'error'); }
                tasks = taskData || [];

                const { data: commentData, error: commentErr } = await supabaseClient.from('frame_comments').select('*').in('frame_stage_id', stageIds);
                if (commentErr) console.error(commentErr);
                comments = commentData || [];
            }
            stagesData = stages.map(s => {
                const stageTasks = tasks.filter(t => t.frame_stage_id === s.id).map(t => ({
                    ...t, comments: comments.filter(c => c.frame_task_id === t.id)
                }));
                const stageComments = comments.filter(c => c.frame_stage_id === s.id && !c.frame_task_id);
                return { ...s, tasks: stageTasks, comments: stageComments };
            });
        }

        async function reloadAndRender() {
            await loadStagesData();
            renderStages();
        }

        // Пишет запись в лог изменений кадра. Не блокирует основное действие при ошибке.
        async function logActivity(actionType, description) {
            const { error } = await supabaseClient.from('frame_activity_log').insert({ frame_id: frameId, action_type: actionType, description: description, actor_name: currentUser ? currentUser.full_name : null });
            if (error) console.error('Ошибка записи в лог:', error);
        }

        async function openLogModal() {
            const listEl = document.getElementById('logModalList');
            listEl.innerHTML = `<p style="color: var(--text-secondary); font-size: 13px; text-align: center; padding: 20px 0;">${randomLoadingPhrase()}</p>`;
            document.getElementById('logModal').classList.add('active');
            const { data, error } = await supabaseClient.from('frame_activity_log').select('*').eq('frame_id', frameId).order('created_at', { ascending: false }).limit(200);
            if (error) { console.error(error); listEl.innerHTML = '<p style="color: var(--danger); font-size: 13px;">Не удалось загрузить лог</p>'; return; }
            if (!data || data.length === 0) { listEl.innerHTML = '<p style="color: var(--text-secondary); font-size: 13px; text-align: center; padding: 40px 0;">Изменений пока нет</p>'; return; }
            listEl.innerHTML = data.map(entry => {
                const time = new Date(entry.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                return `<div class="log-entry"><div class="log-time">${time}${entry.actor_name ? ' · ' + escapeHtml(entry.actor_name) : ''}</div><div class="log-desc">${escapeHtml(entry.description)}</div></div>`;
            }).join('');
        }
        function closeLogModal() { document.getElementById('logModal').classList.remove('active'); }

        // Экспорт текущего чек-листа кадра в PDF-отчёт
        function exportFramePDF() {
            const container = document.querySelector('.container');
            const frameName = (document.getElementById('frameTitle').textContent || 'kadr').replace(/[^a-zA-Zа-яА-Я0-9]+/g, '_');
            document.body.classList.add('exporting-pdf');
            showToast('Формируется PDF...', 'success');
            html2pdf().set({
                margin: 10,
                filename: `${frameName}_report.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2 },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            }).from(container).save().then(() => {
                document.body.classList.remove('exporting-pdf');
                logActivity('export_pdf', 'Кадр экспортирован в PDF-отчёт');
            }).catch(err => {
                console.error(err);
                document.body.classList.remove('exporting-pdf');
                showToast('Не удалось создать PDF', 'error');
            });
        }

        function toggleStageExpand(stageId) {
            // Точечно переключаем класс у конкретной карточки, а не пересобираем всю сетку —
            // иначе элемент каждый раз создаётся заново и CSS-анимация не успевает проиграться.
            const index = expandedStageIds.indexOf(stageId);
            const cardEl = document.getElementById(`stage-${stageId}`);
            if (index > -1) {
                expandedStageIds.splice(index, 1);
                if (cardEl) cardEl.classList.remove('expanded');
            } else {
                expandedStageIds.push(stageId);
                if (cardEl) cardEl.classList.add('expanded');
            }
        }
        function expandAll() {
            expandedStageIds = stagesData.map(s => s.id);
            document.querySelectorAll('.stage-card').forEach(c => c.classList.add('expanded'));
            showToast('Все этапы развёрнуты', 'success');
        }
        function collapseAll() {
            expandedStageIds = [];
            document.querySelectorAll('.stage-card').forEach(c => c.classList.remove('expanded'));
            showToast('Все этапы свёрнуты', 'success');
        }

        function searchStages() {
            const query = document.getElementById('searchInput').value.toLowerCase();
            const cards = document.querySelectorAll('.stage-card');
            let count = 0;
            cards.forEach(card => {
                const title = card.querySelector('.stage-title').textContent.toLowerCase();
                if (title.includes(query)) { card.style.display = ''; count++; } else { card.style.display = 'none'; }
            });
            document.getElementById('searchResults').textContent = query ? `Найдено: ${count}` : '';
        }

        function getStageStatus(stage) {
            const total = stage.tasks.length;
            const completed = stage.tasks.filter(t => t.checked).length;
            if (total === 0 || completed === 0) return 'not-started';
            if (completed === total) return 'done';
            return 'in-progress';
        }

        function updateStageProgress(stageId) {
            const stage = stagesData.find(s => s.id === stageId);
            const cardEl = document.getElementById(`stage-${stageId}`);
            if (!stage || !cardEl) return;
            const total = stage.tasks.length;
            const completed = stage.tasks.filter(t => t.checked).length;
            const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
            const progressText = cardEl.querySelector('.stage-progress');
            const progressRing = cardEl.querySelector('.stage-progress-container .progress-ring');
            if (progressText) progressText.textContent = `Прогресс: ${completed}/${total}`;
            if (progressRing) { progressRing.style.setProperty('--percent', percent); progressRing.querySelector('.progress-ring-label').textContent = `${percent}%`; }
        }

        async function updateOverallProgress() {
            let totalTasks = 0, completedTasks = 0;
            stagesData.forEach(stage => { totalTasks += stage.tasks.length; completedTasks += stage.tasks.filter(t => t.checked).length; });
            const percent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
            const overallRing = document.getElementById('overallProgressRing');
            if (overallRing) { overallRing.style.setProperty('--percent', percent); overallRing.querySelector('.progress-ring-label').textContent = `${percent}%`; }
            const overallText = document.getElementById('overallProgressText');
            if (overallText) overallText.textContent = `Общий прогресс: ${completedTasks}/${totalTasks}`;
            await maybeAutoUpdateFrameStatus(totalTasks, completedTasks);
        }

        function refreshStageStatusBadge(stageId) {
            const cardEl = document.getElementById(`stage-${stageId}`);
            const stage = stagesData.find(s => s.id === stageId);
            if (!cardEl || !stage) return;
            const status = getStageStatus(stage);
            const badge = cardEl.querySelector('.stage-status');
            if (!badge) return;
            badge.className = 'stage-status';
            if (status === 'in-progress') { badge.classList.add('status-in-progress'); badge.innerHTML = '<span class="badge-dot"></span>В работе'; }
            else if (status === 'done') { badge.classList.add('status-done'); badge.innerHTML = '<span class="badge-dot"></span>Готово'; }
            else { badge.classList.add('status-not-started'); badge.innerHTML = '<span class="badge-dot"></span>Не начато'; }
        }

        // ====== ЗАДАЧИ: отметка, редактирование текста, добавление, удаление ======

        async function toggleTask(taskId, stageId) {
            const stage = stagesData.find(s => s.id === stageId);
            const task = stage.tasks.find(t => t.id === taskId);
            const newChecked = !task.checked;
            const { error } = await supabaseClient.from('frame_tasks').update({ checked: newChecked, checked_at: newChecked ? new Date().toISOString() : null }).eq('id', taskId);
            if (error) { console.error(error); showToast('Не удалось сохранить отметку', 'error'); return; }
            task.checked = newChecked;
            const checkbox = document.getElementById(`task-${taskId}`);
            if (checkbox) { checkbox.checked = newChecked; const item = checkbox.closest('.checklist-item'); if (item) item.classList.toggle('checked', newChecked); }
            updateStageProgress(stageId);
            updateOverallProgress();
            refreshStageStatusBadge(stageId);
            logActivity('task_toggle', `${newChecked ? 'Отмечена' : 'Снята отметка с'} задача «${task.text}» (этап «${stage.title}»)`);
        }

        async function editTaskText(taskId, stageId, newText) {
            const trimmed = newText.trim();
            if (!trimmed) { showToast('Текст задачи не может быть пустым', 'error'); reloadAndRender(); return; }
            const { error } = await supabaseClient.from('frame_tasks').update({ text: trimmed }).eq('id', taskId);
            if (error) { console.error(error); showToast('Не удалось сохранить текст', 'error'); return; }
            const stage = stagesData.find(s => s.id === stageId);
            const task = stage.tasks.find(t => t.id === taskId);
            const oldText = task.text;
            task.text = trimmed;
            showToast('Текст задачи обновлён', 'success');
            logActivity('task_edit', `Изменён текст задачи в этапе «${stage.title}»: «${oldText}» → «${trimmed}»`);
        }

        async function addTask(stageId) {
            const stage = stagesData.find(s => s.id === stageId);
            // Фикс: индекс новой задачи считаем от максимального существующего,
            // а не от количества задач — иначе после удаления задачи из середины
            // этапа новый task_index мог совпасть с уже существующим и сортировка "плыла"
            const nextIndex = stage.tasks.length > 0 ? Math.max(...stage.tasks.map(t => t.task_index)) + 1 : 0;
            const { data, error } = await supabaseClient.from('frame_tasks').insert({ frame_stage_id: stageId, task_index: nextIndex, text: `Новая задача ${nextIndex + 1}`, checked: false }).select().single();
            if (error) { console.error(error); showToast('Не удалось добавить задачу', 'error'); return; }
            stage.tasks.push(data);
            if (!expandedStageIds.includes(stageId)) expandedStageIds.push(stageId);
            renderStages();
            showToast('Задача добавлена', 'success');
            logActivity('task_add', `Добавлена задача «${data.text}» в этап «${stage.title}»`);
        }

        async function deleteTask(taskId, stageId) {
            const stage = stagesData.find(s => s.id === stageId);
            if (stage.tasks.length <= 1) { showToast('Нельзя удалить единственную задачу этапа', 'error'); return; }
            if (!confirm('Удалить эту задачу?')) return;
            const taskBeingDeleted = stage.tasks.find(t => t.id === taskId);
            const { error } = await supabaseClient.from('frame_tasks').delete().eq('id', taskId);
            if (error) { console.error(error); showToast('Не удалось удалить задачу', 'error'); return; }
            stage.tasks = stage.tasks.filter(t => t.id !== taskId);
            if (!expandedStageIds.includes(stageId)) expandedStageIds.push(stageId);
            renderStages();
            showToast('Задача удалена', 'warning');
            logActivity('task_delete', `Удалена задача «${taskBeingDeleted.text}» из этапа «${stage.title}»`);
        }

        // ====== ЭТАПЫ: отметить все / сбросить / добавить свой / удалить свой ======

        async function markAllTasks(stageId) {
            const stage = stagesData.find(s => s.id === stageId);
            const { error } = await supabaseClient.from('frame_tasks').update({ checked: true, checked_at: new Date().toISOString() }).eq('frame_stage_id', stageId);
            if (error) { console.error(error); showToast('Не удалось отметить задачи', 'error'); return; }
            if (!expandedStageIds.includes(stageId)) expandedStageIds.push(stageId);
            await reloadAndRender();
            showToast('Все задачи отмечены', 'success');
            logActivity('stage_mark_all', `Отмечены все задачи этапа «${stage.title}»`);
        }

        function confirmResetStage(stageId) {
            const stage = stagesData.find(s => s.id === stageId);
            if (!confirm(`Сбросить все отметки в этапе «${stage.title}»?`)) return;
            resetStage(stageId);
        }

        async function resetStage(stageId) {
            const stage = stagesData.find(s => s.id === stageId);
            const { error } = await supabaseClient.from('frame_tasks').update({ checked: false, checked_at: null }).eq('frame_stage_id', stageId);
            if (error) { console.error(error); showToast('Не удалось сбросить этап', 'error'); return; }
            if (!expandedStageIds.includes(stageId)) expandedStageIds.push(stageId);
            await reloadAndRender();
            showToast('Этап сброшен', 'warning');
            logActivity('stage_reset', `Сброшены все отметки этапа «${stage.title}»`);
        }

        function openAddStageModal() {
            document.getElementById('newStageTitle').value = '';
            document.getElementById('newStageType').value = 'base';
            document.getElementById('addStageModal').classList.add('active');
        }
        function closeAddStageModal() { document.getElementById('addStageModal').classList.remove('active'); }

        async function submitAddStage() {
            const title = document.getElementById('newStageTitle').value.trim();
            const type = document.getElementById('newStageType').value;
            if (!title) { showToast('Введите название этапа', 'error'); return; }

            const nextNumber = stagesData.length > 0 ? Math.max(...stagesData.map(s => s.stage_number)) + 1 : 1;
            const warningByType = {
                base: 'Дополнительный этап — согласуйте с тимлидом перед стартом.',
                free_revision: 'Бесплатная правка — уточните лимит бесплатных правок по проекту.',
                paid_revision: 'Платная правка — требует подтверждения бюджета у заказчика.'
            };
            // Фикс: если тип вдруг не совпал ни с одним ключом — берём базовый текст,
            // а не пишем undefined в базу
            const warningText = warningByType[type] || warningByType.base;
            const { data: newStage, error } = await supabaseClient.from('frame_stages').insert({
                frame_id: frameId, stage_number: nextNumber, title: title,
                location: 'Правки', output: 'Правки внесены', qc: 'Правки согласованы',
                warning: warningText, stage_type: type, is_custom: true
            }).select().single();
            if (error) { console.error(error); showToast('Не удалось создать этап', 'error'); return; }

            const defaultTasks = ['Внести правки', 'Проверить результат', 'Согласовать с заказчиком/тимлидом'];
            const taskRows = defaultTasks.map((text, i) => ({ frame_stage_id: newStage.id, task_index: i, text, checked: false }));
            const { error: taskError } = await supabaseClient.from('frame_tasks').insert(taskRows);
            if (taskError) { console.error(taskError); showToast('Этап создан, но задачи не удалось добавить', 'warning'); }

            closeAddStageModal();
            await reloadAndRender();
            expandedStageIds.push(newStage.id);
            renderStages();
            showToast('Этап добавлен', 'success');
            const typeLabel = { base: 'базовый', free_revision: 'бесплатная правка', paid_revision: 'платная правка' }[type];
            logActivity('stage_add', `Добавлен этап «${title}» (тип: ${typeLabel})`);
        }

        function confirmDeleteStage(stageId) {
            const stage = stagesData.find(s => s.id === stageId);
            if (!stage.is_custom) { showToast('Базовые этапы пайплайна удалять нельзя', 'error'); return; }
            if (!confirm(`Удалить этап «${stage.title}»? Это действие нельзя отменить.`)) return;
            deleteStage(stageId);
        }

        async function deleteStage(stageId) {
            const stage = stagesData.find(s => s.id === stageId);
            // Дублируем проверку и здесь (не только в confirmDeleteStage) —
            // защита на случай прямого вызова функции, а не только клика по кнопке
            if (!stage.is_custom) { showToast('Базовые этапы пайплайна удалять нельзя', 'error'); return; }
            const { error } = await supabaseClient.from('frame_stages').delete().eq('id', stageId);
            if (error) { console.error(error); showToast('Не удалось удалить этап', 'error'); return; }
            await reloadAndRender();
            showToast('Этап удалён', 'warning');
            logActivity('stage_delete', `Удалён этап «${stage.title}»`);
        }

        // ====== Комментарии ======

        function openCommentsModal(stageId) {
            currentCommentsStageId = stageId;
            const stage = stagesData.find(s => s.id === stageId);
            document.getElementById('commentsModalTitle').textContent = `Комментарии: ${stage.title}`;
            document.getElementById('modalCommentInput').value = '';
            renderCommentsInto('commentsModalList', stage.comments);
            document.getElementById('commentsModal').classList.add('active');
        }
        function closeCommentsModal() { document.getElementById('commentsModal').classList.remove('active'); currentCommentsStageId = null; }

        function renderCommentsInto(elementId, comments) {
            const el = document.getElementById(elementId);
            if (!comments || comments.length === 0) {
                el.innerHTML = '<p style="color: var(--text-secondary); font-size: 13px; text-align: center; padding: 20px 0;">Нет комментариев</p>';
                return;
            }
            el.innerHTML = comments.map(c => {
                const date = new Date(c.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
                const deleteBtn = canDeleteComments() ? `<button onclick="deleteComment('${c.id}')" style="background:none;border:none;color:var(--danger);cursor:pointer;margin-left:auto;display:inline-flex;align-items:center;">${ICON.trash}</button>` : '';
                return `<div class="comment"><div class="comment-meta"><strong>${escapeHtml(c.author_name)}</strong><span>${date}</span>${deleteBtn}</div><div class="comment-text">${highlightMentions(escapeHtml(c.text), allProfilesForMentions)}</div></div>`;
            }).join('');
        }

        async function deleteComment(commentId) {
            if (!confirm('Удалить этот комментарий?')) return;
            const { error } = await supabaseClient.from('frame_comments').delete().eq('id', commentId);
            if (error) { console.error(error); showToast('Не удалось удалить комментарий', 'error'); return; }
            await reloadAndRender();
            if (currentCommentsStageId) openCommentsModal(currentCommentsStageId);
            if (currentTaskComment) openTaskCommentModal(currentTaskComment.taskId, currentTaskComment.stageId);
            showToast('Комментарий удалён', 'warning');
        }

        async function addModalComment() {
            if (!currentCommentsStageId) return;
            const input = document.getElementById('modalCommentInput');
            const text = input.value.trim();
            if (!text) return;
            const stage = stagesData.find(s => s.id === currentCommentsStageId);
            const mentions = extractMentions(text, allProfilesForMentions);
            const { data, error } = await supabaseClient.from('frame_comments').insert({ frame_stage_id: currentCommentsStageId, frame_task_id: null, author_id: currentUser.id, author_name: currentUser.full_name, text: text, mentions: mentions }).select().single();
            if (error) { console.error(error); showToast('Не удалось добавить комментарий', 'error'); return; }
            input.value = '';
            stage.comments.push(data);
            renderCommentsInto('commentsModalList', stage.comments);
            refreshCommentsButtonLabel(stage.id);
            showToast('Комментарий добавлен', 'success');
            logActivity('comment_add', `Добавлен комментарий к этапу «${stage.title}»: «${text}»`);
        }

        function openTaskCommentModal(taskId, stageId) {
            currentTaskComment = { taskId, stageId };
            const stage = stagesData.find(s => s.id === stageId);
            const task = stage.tasks.find(t => t.id === taskId);
            document.getElementById('taskCommentTitle').textContent = `Комментарии: ${task.text}`;
            document.getElementById('taskCommentInput').value = '';
            renderCommentsInto('taskCommentsList', task.comments);
            document.getElementById('taskCommentModal').classList.add('active');
        }
        function closeTaskCommentModal() { document.getElementById('taskCommentModal').classList.remove('active'); currentTaskComment = null; }

        async function addTaskComment() {
            if (!currentTaskComment) return;
            const input = document.getElementById('taskCommentInput');
            const text = input.value.trim();
            if (!text) return;
            const stage = stagesData.find(s => s.id === currentTaskComment.stageId);
            const task = stage.tasks.find(t => t.id === currentTaskComment.taskId);
            const mentions = extractMentions(text, allProfilesForMentions);
            const { data, error } = await supabaseClient.from('frame_comments').insert({ frame_stage_id: currentTaskComment.stageId, frame_task_id: currentTaskComment.taskId, author_id: currentUser.id, author_name: currentUser.full_name, text: text, mentions: mentions }).select().single();
            if (error) { console.error(error); showToast('Не удалось добавить комментарий', 'error'); return; }
            input.value = '';
            task.comments.push(data);
            renderCommentsInto('taskCommentsList', task.comments);
            refreshTaskCommentButton(task.id, stage.id);
            showToast('Комментарий добавлен', 'success');
            logActivity('comment_add', `Добавлен комментарий к задаче «${task.text}»: «${text}»`);
        }

        // Точечно обновляем подписи на кнопках комментариев, не перерисовывая всю страницу
        function refreshCommentsButtonLabel(stageId) {
            const cardEl = document.getElementById(`stage-${stageId}`);
            const stage = stagesData.find(s => s.id === stageId);
            if (!cardEl || !stage) return;
            const btn = cardEl.querySelector('.comments-compact-btn');
            if (btn) { btn.innerHTML = `${ICON.comment} Комментарии (${stage.comments.length})`; btn.classList.toggle('has-comments', stage.comments.length > 0); }
        }
        function refreshTaskCommentButton(taskId, stageId) {
            const stage = stagesData.find(s => s.id === stageId);
            const task = stage.tasks.find(t => t.id === taskId);
            const btn = document.querySelector(`.task-comment-btn[onclick*="'${taskId}'"]`);
            if (btn) { btn.innerHTML = `${ICON.comment}${task.comments.length > 0 ? ' (' + task.comments.length + ')' : ''}`; btn.classList.toggle('has-comment', task.comments.length > 0); }
        }

        // ====== Рендер ======

        function renderStageCard(stage) {
            const total = stage.tasks.length;
            const completedCount = stage.tasks.filter(t => t.checked).length;
            const progressPercent = total > 0 ? Math.round((completedCount / total) * 100) : 0;
            const stageStatus = getStageStatus(stage);
            let statusClass = 'status-not-started', statusText = 'Не начато';
            if (stageStatus === 'in-progress') { statusClass = 'status-in-progress'; statusText = 'В работе'; }
            else if (stageStatus === 'done') { statusClass = 'status-done'; statusText = 'Готово'; }

            let cardClass = 'stage-card viewfinder-card';
            if (stage.stage_type === 'free_revision') cardClass += ' custom-free';
            else if (stage.stage_type === 'paid_revision') cardClass += ' custom-paid';
            else if (stage.is_custom) cardClass += ' custom-base';
            if (expandedStageIds.includes(stage.id)) cardClass += ' expanded';

            let revisionBadge = '';
            if (stage.stage_type === 'free_revision') revisionBadge = '<span class="revision-badge revision-free"><span class="badge-dot"></span>Бесплатная правка</span>';
            else if (stage.stage_type === 'paid_revision') revisionBadge = '<span class="revision-badge revision-paid"><span class="badge-dot"></span>Платная правка</span>';
            else if (stage.is_custom) revisionBadge = '<span class="revision-badge revision-base"><span class="badge-dot"></span>Доп. этап</span>';

            const tasksHtml = stage.tasks.map(task => {
                return `<div class="checklist-item ${task.checked ? 'checked' : ''}">
                    <input type="checkbox" id="task-${task.id}" ${task.checked ? 'checked' : ''} onclick="event.stopPropagation(); toggleTask('${task.id}', '${stage.id}')">
                    <input type="text" class="task-edit-input" value="${escapeHtml(task.text)}" onclick="event.stopPropagation()" onchange="editTaskText('${task.id}', '${stage.id}', this.value)">
                    <button class="task-delete-btn" onclick="event.stopPropagation(); deleteTask('${task.id}', '${stage.id}')" title="Удалить задачу">${ICON.trash}</button>
                    <button class="task-comment-btn ${task.comments.length > 0 ? 'has-comment' : ''}" onclick="event.stopPropagation(); openTaskCommentModal('${task.id}', '${stage.id}')" title="Комментарии к задаче">${ICON.comment}${task.comments.length > 0 ? ' (' + task.comments.length + ')' : ''}</button>
                </div>`;
            }).join('');

            const deleteStageBtn = (stage.is_custom && canManageStages()) ? `<button class="delete-stage-btn" onclick="event.stopPropagation(); confirmDeleteStage('${stage.id}')">${ICON.trash} Удалить этап</button>` : '';

            return `<div class="${cardClass}" id="stage-${stage.id}" onclick="toggleStageExpand('${stage.id}')">
                <div class="stage-header">
                    <div class="stage-header-left"><div class="stage-number">Этап ${stage.stage_number}</div><div class="stage-title">${escapeHtml(stage.title)}</div>${revisionBadge}</div>
                    <span class="stage-status ${statusClass}"><span class="badge-dot"></span>${statusText}</span>
                    <span class="expand-icon">▼</span>
                </div>
                <div class="stage-content">
                    <div class="stage-content-inner">
                        <div class="stage-meta">${deleteStageBtn}<span class="stage-location" style="display:inline-flex;align-items:center;gap:5px;">${ICON.pin} ${escapeHtml(stage.location || '')}</span><span class="stage-output"><strong>На выходе:</strong> ${escapeHtml(stage.output || '')}</span></div>
                        <div class="quick-actions" onclick="event.stopPropagation()">
                            <button class="btn-small" onclick="markAllTasks('${stage.id}')">✓ Отметить всё</button>
                            <button class="btn-small" onclick="confirmResetStage('${stage.id}')">↺ Сбросить</button>
                        </div>
                        <div class="checklist" onclick="event.stopPropagation">
                            ${tasksHtml}
                            <button class="add-task-btn" onclick="event.stopPropagation(); addTask('${stage.id}')">+ Добавить задачу</button>
                        </div>
                        <div class="stage-progress-container" style="display:flex; align-items:center; gap:12px;">
                            <span class="progress-ring small" style="--percent:${progressPercent}"><span class="progress-ring-label">${progressPercent}%</span></span>
                            <div class="stage-progress">Прогресс: ${completedCount}/${total}</div>
                        </div>
                        <button class="comments-compact-btn ${stage.comments.length > 0 ? 'has-comments' : ''}" onclick="openCommentsModal('${stage.id}'); event.stopPropagation()">${ICON.comment} Комментарии (${stage.comments.length})</button>
                        <div class="qc-section" onclick="event.stopPropagation()"><div class="qc-title">Критерий перехода</div><div class="qc-text">${escapeHtml(stage.qc || '')}</div></div>
                        <div class="warning-box" onclick="event.stopPropagation()"><div class="warning-text">${ICON.warning}<span>${escapeHtml(stage.warning || '')}</span></div></div>
                    </div>
                </div>
            </div>`;
        }

        function renderStages() {
            const grid = document.getElementById('stagesGrid');
            grid.innerHTML = stagesData.map(stage => renderStageCard(stage)).join('');
            grid.innerHTML += canManageStages() ? `<div class="add-stage-wrap"><button class="add-stage-btn" onclick="openAddStageModal()">+ Добавить этап</button></div>` : '';
            updateOverallProgress();
        }

        document.addEventListener('DOMContentLoaded', async function() {
            loadTheme();
            loadWarningsPref();
            document.getElementById('frameTitle').textContent = randomLoadingPhrase();
            const ok = await requireAuth();
            if (!ok) return;
            initDeadlineReminders(currentUser);
            const frame = await getFrame();
            if (frame) {
                document.getElementById('frameTitle').textContent = frame.name;
                document.getElementById('backBtn').href = `project.html?id=${projectId}`;
                currentFrameStatus = frame.status || 'not_started';
            } else {
                document.getElementById('frameTitle').textContent = 'Кадр не найден';
            }
            await loadProfilesForMentions();
            attachMentionAutocomplete(document.getElementById('modalCommentInput'), () => allProfilesForMentions);
            attachMentionAutocomplete(document.getElementById('taskCommentInput'), () => allProfilesForMentions);
            await seedFrameStagesIfNeeded();
            await loadStagesData();
            renderStages();
            showToast('Добро пожаловать!', 'success');
        });
    
