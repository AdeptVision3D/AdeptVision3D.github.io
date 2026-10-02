/* ============================================================
   Decard Studio — поведение слоя «жидкого стекла» (glass.css)
   Только оформление и навигация, на бизнес-логику страниц не влияет:
   • иконки через data-icon;
   • переключатели с плавно «переезжающей» таблеткой;
   • блик света, следящий за курсором на карточках;
   • числа в статистике плавно «накручиваются»;
   • скелетоны вместо пустого экрана при загрузке;
   • быстрый поиск и переходы по Ctrl/⌘ + K.
   Откат: убрать <script src="glass.js"> со страниц.
   ============================================================ */
(function () {
    'use strict';

    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    /* ---------- 1. Иконки по атрибуту data-icon ---------- */
    function fillIcons(root) {
        if (typeof ICON === 'undefined') return;
        (root || document).querySelectorAll('[data-icon]:empty').forEach(function (el) {
            var svg = ICON[el.getAttribute('data-icon')];
            if (svg) { el.innerHTML = svg; el.classList.add('ico'); }
        });
    }

    /* ---------- 2. Переключатели с плавной таблеткой ---------- */
    var SEG_SELECTORS = ['.view-toggle', '.app-sidebar-theme', '#analyticsTabs > div:first-child'];

    function enhanceSegmented(c) {
        if (!c || c.dataset.seg) return;
        c.dataset.seg = '1';
        c.classList.add('seg');
        var ind = document.createElement('span');
        ind.className = 'seg-indicator';
        ind.setAttribute('aria-hidden', 'true');
        c.insertBefore(ind, c.firstChild);

        var first = true;
        function update() {
            var a = c.querySelector(':scope > button.active, :scope > .active:not(.seg-indicator)');
            if (!a || !a.offsetWidth) { ind.style.opacity = '0'; return; }
            if (first) { ind.style.transition = 'none'; }
            ind.style.opacity = '1';
            ind.style.width = a.offsetWidth + 'px';
            ind.style.height = a.offsetHeight + 'px';
            ind.style.transform = 'translate(' + a.offsetLeft + 'px,' + a.offsetTop + 'px)';
            if (first) { void ind.offsetWidth; ind.style.transition = ''; first = false; }
        }
        new MutationObserver(update).observe(c, { subtree: true, attributes: true, attributeFilter: ['class'], childList: true });
        if (window.ResizeObserver) new ResizeObserver(update).observe(c);
        requestAnimationFrame(update);
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(update);
    }

    function scanSegmented() {
        SEG_SELECTORS.forEach(function (sel) {
            document.querySelectorAll(sel).forEach(enhanceSegmented);
        });
        // переключатели вида «кнопки .toggle-btn рядом» (например, кейсы)
        document.querySelectorAll('.toggle-btn').forEach(function (b) {
            if (b.parentElement && !b.parentElement.classList.contains('seg')) enhanceSegmented(b.parentElement);
        });
    }

    /* ---------- 3. Блик под курсором ---------- */
    var SHINE = '.viewfinder-card, .project-card, .stat-card, .news-widget, .approval-panel, .bug-card, .case-card, .client-card, .cp-card, .deal-card, .group-header, .person-card, .news-card, .tpl-card';
    var rafShine = 0;
    document.addEventListener('pointermove', function (e) {
        if (reduceMotion || e.pointerType === 'touch') return;
        var el = e.target && e.target.closest && e.target.closest(SHINE);
        if (!el) return;
        var x = e.clientX, y = e.clientY;
        cancelAnimationFrame(rafShine);
        rafShine = requestAnimationFrame(function () {
            var r = el.getBoundingClientRect();
            el.style.setProperty('--mx', (x - r.left) + 'px');
            el.style.setProperty('--my', (y - r.top) + 'px');
        });
    }, { passive: true });

    /* ---------- 4. Числа «накручиваются» ---------- */
    var NUM_RE = /^(\D*?)(\d[\d\s ]*)([.,]\d+)?(\D*)$/;

    function countUp(el) {
        if (el.dataset.counted) return;
        el.dataset.counted = '1';
        if (/^0(?:[.,]0+)?(?:\D.*)?$/.test(el.textContent.trim())) el.dataset.zero = '1';
        if (reduceMotion) return;
        var text = el.textContent.trim();
        var m = NUM_RE.exec(text);
        if (!m || text.length > 14) return;
        var grouped = /[\s ]/.test(m[2]);
        var target = parseFloat(m[2].replace(/[\s ]/g, '') + (m[3] ? m[3].replace(',', '.') : ''));
        if (!isFinite(target) || target === 0) return;
        var decimals = m[3] ? m[3].length - 1 : 0;
        var dec = m[3] ? m[3][0] : '.';
        var start = performance.now(), dur = 900;
        function fmt(v) {
            var s = decimals ? v.toFixed(decimals).replace('.', dec) : String(Math.round(v));
            if (grouped) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
            return m[1] + s + m[4];
        }
        el.style.minWidth = el.offsetWidth + 'px';
        (function tick(now) {
            var t = Math.min(1, (now - start) / dur);
            var eased = 1 - Math.pow(1 - t, 4);
            el.textContent = fmt(target * eased);
            if (t < 1) requestAnimationFrame(tick); else { el.textContent = text; el.style.minWidth = ''; }
        })(start);
    }

    /* ---------- 5. Скелетоны ---------- */
    var SKELETONS = [
        { sel: '.projects-grid', count: 6, cls: 'sk-card' },
        { sel: '.stats, #statsRow', count: 4, cls: 'sk-stat' }
    ];

    function addSkeletons() {
        SKELETONS.forEach(function (cfg) {
            document.querySelectorAll(cfg.sel).forEach(function (box) {
                if (box.children.length || box.dataset.skeleton) return;
                box.dataset.skeleton = '1';
                var html = '';
                for (var i = 0; i < cfg.count; i++) html += '<div class="glass-skeleton ' + cfg.cls + '" aria-hidden="true"></div>';
                box.innerHTML = html;
                // если данные так и не пришли (ошибка сети) — не оставляем «вечную загрузку»
                setTimeout(function () {
                    box.querySelectorAll(':scope > .glass-skeleton').forEach(function (n) { n.remove(); });
                }, 10000);
            });
        });
    }

    /* ---------- 6. Быстрый поиск (Ctrl/⌘ + K) ---------- */
    var palette = null, paletteItems = [], paletteIndex = 0;
    var projectsCache = { at: 0, list: [] };

    function pageItems() {
        var out = [];
        document.querySelectorAll('#appSidebar .app-nav-item').forEach(function (a) {
            var label = (a.querySelector('span:last-child') || a).textContent.trim();
            out.push({ kind: 'Раздел', label: label, href: a.getAttribute('href'), icon: a.querySelector('.app-nav-icon') ? a.querySelector('.app-nav-icon').innerHTML : '' });
        });
        return out;
    }

    function loadProjects() {
        if (typeof supabaseClient === 'undefined') return Promise.resolve([]);
        if (Date.now() - projectsCache.at < 60000) return Promise.resolve(projectsCache.list);
        var q = function (table, cols) {
            return Promise.resolve(supabaseClient.from(table).select(cols).limit(300))
                .then(function (r) { return (r && r.data) || []; })
                .catch(function () { return []; });
        };
        // клиенты и сделки подгружаем только если у роли есть к ним доступ (RLS сам отфильтрует лишнее)
        var wantCrm = !!document.querySelector('#appSidebar [data-nav-key="clients"]');
        return Promise.all([
            Promise.resolve(supabaseClient.from('projects').select('id, name').order('created_at', { ascending: false }).limit(300))
                .then(function (r) { return (r && r.data) || []; }).catch(function () { return []; }),
            wantCrm ? q('clients', 'id, name') : Promise.resolve([]),
            wantCrm ? q('deals', 'id, title') : Promise.resolve([])
        ]).then(function (res) {
            projectsCache = { at: Date.now(), list: res[0], clients: res[1], deals: res[2] };
            return projectsCache.list;
        });
    }
    function buildPalette() {
        var root = document.createElement('div');
        root.className = 'cmdk-overlay';
        root.innerHTML =
            '<div class="cmdk" role="dialog" aria-modal="true" aria-label="Быстрый поиск">' +
            '<div class="cmdk-input-row"><span class="cmdk-search-ico" data-icon="search"></span>' +
            '<input class="cmdk-input" type="text" placeholder="Куда перейти? Раздел или проект…" autocomplete="off" spellcheck="false">' +
            '<kbd class="cmdk-kbd">Esc</kbd></div>' +
            '<div class="cmdk-list" role="listbox"></div>' +
            '<div class="cmdk-foot"><span><kbd>↑</kbd><kbd>↓</kbd> выбор</span><span><kbd>Enter</kbd> открыть</span></div>' +
            '</div>';
        document.body.appendChild(root);
        fillIcons(root);
        root.addEventListener('mousedown', function (e) { if (e.target === root) closePalette(); });
        var input = root.querySelector('.cmdk-input');
        input.addEventListener('input', function () { renderPalette(input.value); });
        input.addEventListener('keydown', function (e) {
            if (e.key === 'ArrowDown') { e.preventDefault(); movePalette(1); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); movePalette(-1); }
            else if (e.key === 'Enter') { e.preventDefault(); openPaletteItem(paletteIndex); }
            else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
        });
        root.querySelector('.cmdk-list').addEventListener('click', function (e) {
            var row = e.target.closest('.cmdk-item');
            if (row) openPaletteItem(Number(row.dataset.i));
        });
        return root;
    }

    function renderPalette(q) {
        var list = palette.querySelector('.cmdk-list');
        var words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
        var all = pageItems().concat(projectsCache.list.map(function (p) {
            return { kind: 'Проект', label: p.name || 'Без названия', href: 'project.html?id=' + encodeURIComponent(p.id), icon: (typeof ICON !== 'undefined' ? ICON.frames : '') };
        }));
        (projectsCache.clients || []).forEach(function (c) {
            all.push({ kind: 'Клиент', label: c.name || 'Без имени', href: 'clients.html?q=' + encodeURIComponent(c.name || ''), icon: (typeof ICON !== 'undefined' ? ICON.briefcase : '') });
        });
        (projectsCache.deals || []).forEach(function (d) {
            all.push({ kind: 'Сделка', label: d.title || 'Без названия', href: 'deals.html?q=' + encodeURIComponent(d.title || ''), icon: (typeof ICON !== 'undefined' ? ICON.funnel : '') });
        });
        paletteItems = all.filter(function (it) {
            var hay = (it.label + ' ' + it.kind).toLowerCase();
            return words.every(function (w) { return hay.indexOf(w) !== -1; });
        }).slice(0, 40);
        paletteIndex = 0;
        if (!paletteItems.length) { list.innerHTML = '<div class="cmdk-empty">Ничего не найдено</div>'; return; }
        list.innerHTML = paletteItems.map(function (it, i) {
            return '<div class="cmdk-item' + (i === 0 ? ' active' : '') + '" role="option" data-i="' + i + '">' +
                '<span class="cmdk-item-ico">' + it.icon + '</span>' +
                '<span class="cmdk-item-label">' + esc(it.label) + '</span>' +
                '<span class="cmdk-item-kind">' + esc(it.kind) + '</span></div>';
        }).join('');
    }

    function movePalette(d) {
        if (!paletteItems.length) return;
        paletteIndex = (paletteIndex + d + paletteItems.length) % paletteItems.length;
        palette.querySelectorAll('.cmdk-item').forEach(function (n) { n.classList.toggle('active', Number(n.dataset.i) === paletteIndex); });
        var act = palette.querySelector('.cmdk-item.active');
        if (act) act.scrollIntoView({ block: 'nearest' });
    }

    function openPaletteItem(i) {
        var it = paletteItems[i];
        if (it) { closePalette(); window.location.href = it.href; }
    }

    function openPalette() {
        if (!document.getElementById('appSidebar')) return; // только после входа
        if (!palette) palette = buildPalette();
        palette.classList.add('open');
        var input = palette.querySelector('.cmdk-input');
        input.value = '';
        renderPalette('');
        input.focus();
        setTimeout(function () { input.focus(); }, 60);
        loadProjects().then(function () {
            if (palette.classList.contains('open')) renderPalette(input.value);
        });
    }

    function closePalette() { if (palette) palette.classList.remove('open'); }

    document.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K' || e.key === 'л' || e.key === 'Л')) {
            e.preventDefault();
            if (palette && palette.classList.contains('open')) closePalette(); else openPalette();
        } else if (e.key === 'Escape') {
            closePalette();
        }
    });

    function addPaletteTrigger() {
        var sb = document.getElementById('appSidebar');
        if (!sb || sb.querySelector('.cmdk-trigger')) return;
        var nav = sb.querySelector('.app-sidebar-nav');
        if (!nav) return;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cmdk-trigger';
        btn.innerHTML = '<span data-icon="search"></span><span class="cmdk-trigger-text">Поиск</span><kbd>Ctrl K</kbd>';
        btn.addEventListener('click', openPalette);
        sb.insertBefore(btn, nav);
        fillIcons(btn);
    }

    /* ---------- 7. Подсказки для новичков (показываются один раз + кнопка «Показать подсказки») ---------- */
    var TOUR_STEPS = [
        { sel: '.app-sidebar-nav', title: 'Разделы системы', text: 'Здесь всё, что вам доступно: проекты, клиенты, сделки, календарь, отпуска. Набор зависит от вашей роли.' },
        { sel: '.cmdk-trigger', title: 'Быстрый поиск', text: 'Нажмите Ctrl+K (или эту кнопку) и начните печатать: можно мгновенно перейти в нужный раздел, проект, к клиенту или сделке.' },
        { sel: '#reminderBellBtn', title: 'Колокольчик', text: 'Сюда приходят ближайшие сроки и напоминания. Если срок горит, вы увидите его здесь.' },
        { sel: '.app-sidebar-theme', title: 'Тема оформления', text: 'Светлая, тёмная или как в системе. Выбор запоминается.' }
    ];
    var tourEl = null, tourIdx = 0, tourSteps = [];

    function tourDone() { try { localStorage.setItem('decardTourDone', '1'); } catch (e) {} }

    function visible(el) { return !!(el && el.getClientRects().length && el.offsetWidth > 0); }

    function endTour() {
        if (tourEl) { tourEl.remove(); tourEl = null; }
        window.removeEventListener('resize', placeTour);
        tourDone();
    }

    function placeTour() {
        if (!tourEl) return;
        var step = tourSteps[tourIdx];
        var target = document.querySelector(step.sel);
        var ring = tourEl.querySelector('.tour-ring'), card = tourEl.querySelector('.tour-card');
        if (!visible(target)) return;
        var r = target.getBoundingClientRect(), pad = 8;
        ring.style.left = (r.left - pad) + 'px'; ring.style.top = (r.top - pad) + 'px';
        ring.style.width = (r.width + pad * 2) + 'px'; ring.style.height = (r.height + pad * 2) + 'px';
        var cw = card.offsetWidth, ch = card.offsetHeight, gap = 18;
        var left = (r.left + r.width / 2 < window.innerWidth / 2) ? r.right + pad + gap : r.left - pad - gap - cw;
        left = Math.max(12, Math.min(left, window.innerWidth - cw - 12));
        var top = Math.max(12, Math.min(r.top - pad, window.innerHeight - ch - 12));
        card.style.left = left + 'px'; card.style.top = top + 'px';
    }

    function showTourStep(i) {
        tourIdx = i;
        var step = tourSteps[i];
        var card = tourEl.querySelector('.tour-card');
        card.querySelector('.tour-step').textContent = (i + 1) + ' из ' + tourSteps.length;
        card.querySelector('.tour-title').textContent = step.title;
        card.querySelector('.tour-text').textContent = step.text;
        card.querySelector('.tour-next').textContent = (i === tourSteps.length - 1) ? 'Готово' : 'Далее';
        card.classList.remove('in'); void card.offsetWidth; card.classList.add('in');
        placeTour();
    }

    function startTour() {
        if (tourEl || window.innerWidth < 900) return;
        tourSteps = TOUR_STEPS.filter(function (s) { return visible(document.querySelector(s.sel)); });
        if (tourSteps.length < 2) return;
        tourEl = document.createElement('div');
        tourEl.className = 'tour';
        tourEl.innerHTML = '<div class="tour-veil"></div><div class="tour-ring"></div>' +
            '<div class="tour-card" role="dialog" aria-label="Подсказка"><div class="tour-step"></div><div class="tour-title"></div><div class="tour-text"></div>' +
            '<div class="tour-actions"><button type="button" class="btn btn-secondary tour-skip">Пропустить</button><button type="button" class="btn btn-primary tour-next">Далее</button></div></div>';
        document.body.appendChild(tourEl);
        tourEl.querySelector('.tour-skip').addEventListener('click', endTour);
        tourEl.querySelector('.tour-next').addEventListener('click', function () {
            if (tourIdx >= tourSteps.length - 1) endTour(); else showTourStep(tourIdx + 1);
        });
        window.addEventListener('resize', placeTour);
        showTourStep(0);
    }

    var tourScheduled = false;
    function maybeAutoTour() {
        if (tourScheduled) return;
        var path = location.pathname.split('/').pop();
        if (path !== 'index.html' && path !== '') return;
        if (!document.getElementById('appSidebar')) return;
        var done = false; try { done = localStorage.getItem('decardTourDone') === '1'; } catch (e) {}
        if (done) return;
        tourScheduled = true;
        setTimeout(function () {
            if (document.getElementById('reminderBellBtn') || true) startTour();
        }, 2200);
    }

    function addTourReplay() {
        var sb = document.getElementById('appSidebar');
        if (!sb || sb.querySelector('.tour-replay')) return;
        var foot = sb.querySelector('.app-sidebar-footer');
        if (!foot) return;
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'tour-replay'; b.textContent = 'Показать подсказки';
        b.addEventListener('click', startTour);
        foot.appendChild(b);
    }
    /* ---------- 8. Точка «есть новое» у пункта «Новости» ---------- */
    var newsDotChecked = false;
    function checkNewsDot() {
        if (newsDotChecked) return;
        var item = document.querySelector('#appSidebar [data-nav-key="news"]');
        if (!item || typeof supabaseClient === 'undefined' || typeof getNewsSeen !== 'function') return;
        newsDotChecked = true;
        if (location.pathname.split('/').pop() === 'news.html') return;
        Promise.resolve(supabaseClient.from('company_news').select('created_at').order('created_at', { ascending: false }).limit(1))
            .then(function (r) {
                var latest = r && r.data && r.data[0];
                if (latest && latest.created_at > getNewsSeen()) item.classList.add('has-news');
            })
            .catch(function () {});
    }
    /* ---------- Запуск и наблюдение за динамическим содержимым ---------- */
    function onMutations(muts) {
        for (var i = 0; i < muts.length; i++) {
            var added = muts[i].addedNodes;
            for (var j = 0; j < added.length; j++) {
                var n = added[j];
                if (n.nodeType !== 1) continue;
                if (n.matches && n.matches('.stat-number')) countUp(n);
                if (n.querySelectorAll) n.querySelectorAll('.stat-number').forEach(countUp);
            }
        }
        if (!scanQueued) {
            scanQueued = true;
            requestAnimationFrame(function () {
                scanQueued = false;
                fillIcons();
                scanSegmented();
                addPaletteTrigger();
                addTourReplay();
                maybeAutoTour(); checkNewsDot();
            });
        }
    }
    var scanQueued = false;

    function init() {
        fillIcons();
        addSkeletons();
        scanSegmented();
        addPaletteTrigger();
        addTourReplay();
        maybeAutoTour(); checkNewsDot();
        document.querySelectorAll('.stat-number').forEach(countUp);
        new MutationObserver(onMutations).observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
