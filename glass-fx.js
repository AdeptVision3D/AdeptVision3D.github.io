/* ============================================================
   Decard Studio — эффекты «жидкого стекла», часть 2 (glass.css / glass.js)
   • плавающая подсветка строк списков (скользит от строки к строке);
   • преломление света на краях стекла (боковая панель, окна, поиск) — Chromium;
   • смена темы «волной» от кнопки;
   • световые пятна фона слегка следуют за курсором;
   • «магнитные» главные кнопки.
   Только оформление. Откат: убрать <script src="glass-fx.js"> со страниц.
   ============================================================ */
(function () {
    'use strict';

    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var root = document.documentElement;
    var lastPointer = { x: window.innerWidth / 2, y: 80 };
    document.addEventListener('pointerdown', function (e) { lastPointer = { x: e.clientX, y: e.clientY }; }, true);

    /* ---------- 1. Скользящая подсветка строк ---------- */
    var ROW = '.approval-row, .reminder-item, .activity-item, .news-widget-item, .err-row, .my-row, .mgr-row, ' +
              '.person-row, .log-entry, .payment-row, .tpl-item-row, .vac-my-row, .vac-holiday-list-row, ' +
              '.client-contact-item, .checklist-item-row, .event-invitee-row, .vac-grid tbody tr:not(.vac-team-header-row)';

    var glow = null, glowCur = null, glowVisible = false, glowRaf = 0;

    function ensureGlow() {
        if (glow) return glow;
        glow = document.createElement('div');
        glow.className = 'row-glow';
        glow.setAttribute('aria-hidden', 'true');
        document.body.appendChild(glow);
        return glow;
    }

    function hideGlow() {
        glowCur = null;
        if (glow && glowVisible) { glow.style.opacity = '0'; glowVisible = false; }
    }

    function placeGlow(el, x) {
        var g = ensureGlow();
        var r = el.getBoundingClientRect();
        if (!r.width || !r.height) return hideGlow();
        var rad = getComputedStyle(el).borderTopLeftRadius;
        g.style.borderRadius = (!rad || rad === '0px') ? '10px' : rad;
        if (!glowVisible) {               // первое появление — без «пролёта» из старого места
            g.style.transition = 'none';
            g.style.width = r.width + 'px';
            g.style.height = r.height + 'px';
            g.style.transform = 'translate(' + r.left + 'px,' + r.top + 'px)';
            void g.offsetWidth;
            g.style.transition = '';
        } else {
            g.style.width = r.width + 'px';
            g.style.height = r.height + 'px';
            g.style.transform = 'translate(' + r.left + 'px,' + r.top + 'px)';
        }
        g.style.setProperty('--gx', (x - r.left) + 'px');
        g.style.opacity = '1';
        glowVisible = true;
    }

    document.addEventListener('pointermove', function (e) {
        if (reduce || e.pointerType === 'touch') return;
        var el = e.target && e.target.closest && e.target.closest(ROW);
        if (!el) { hideGlow(); return; }
        var x = e.clientX;
        cancelAnimationFrame(glowRaf);
        glowRaf = requestAnimationFrame(function () { glowCur = el; placeGlow(el, x); });
    }, { passive: true });
    document.addEventListener('scroll', hideGlow, true);
    document.addEventListener('pointerleave', hideGlow);
    document.addEventListener('mouseleave', hideGlow);

    /* ---------- 2. Фон слегка следует за курсором + магнитные кнопки ---------- */
    var pxv = 0, pyv = 0, parRaf = 0, magnet = null;

    function releaseMagnet() { if (magnet) { magnet.style.translate = ''; magnet = null; } }

    document.addEventListener('pointermove', function (e) {
        if (reduce || e.pointerType === 'touch') return;
        pxv = (e.clientX / window.innerWidth - 0.5) * 2;
        pyv = (e.clientY / window.innerHeight - 0.5) * 2;
        if (!parRaf) parRaf = requestAnimationFrame(function () {
            parRaf = 0;
            root.style.setProperty('--px', pxv.toFixed(3));
            root.style.setProperty('--py', pyv.toFixed(3));
        });

        var b = e.target && e.target.closest && e.target.closest('.btn-primary');
        if (magnet && magnet !== b) releaseMagnet();
        if (b && !b.disabled) {
            var r = b.getBoundingClientRect();
            var dx = (e.clientX - (r.left + r.width / 2)) / r.width;
            var dy = (e.clientY - (r.top + r.height / 2)) / r.height;
            b.style.translate = (dx * 8).toFixed(1) + 'px ' + (dy * 9).toFixed(1) + 'px';
            magnet = b;
        }
    }, { passive: true });
    document.addEventListener('mouseleave', releaseMagnet);

    /* ---------- 3. Смена темы «волной» от нажатой кнопки ---------- */
    function wrapTheme() {
        if (typeof window.setTheme !== 'function' || window.setTheme.__wave) return;
        var orig = window.setTheme;
        var wrapped = function (theme) {
            if (reduce || !document.startViewTransition) return orig(theme);
            var x = lastPointer.x, y = lastPointer.y;
            var radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
            root.classList.add('theme-vt');
            var vt;
            try { vt = document.startViewTransition(function () { orig(theme); }); }
            catch (err) { root.classList.remove('theme-vt'); return orig(theme); }
            if (vt.updateCallbackDone) vt.updateCallbackDone.catch(function () {});
            vt.ready.then(function () {
                root.animate(
                    { clipPath: ['circle(0px at ' + x + 'px ' + y + 'px)', 'circle(' + radius + 'px at ' + x + 'px ' + y + 'px)'] },
                    { duration: 800, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', pseudoElement: '::view-transition-new(root)' }
                );
            }).catch(function () {});
            vt.finished.then(function () { root.classList.remove('theme-vt'); }, function () { root.classList.remove('theme-vt'); });
        };
        wrapped.__wave = true;
        window.setTheme = wrapped;
    }

    /* ---------- 4. Преломление на краях стекла (Chromium) ---------- */
    var isChromium = !!(navigator.userAgentData && navigator.userAgentData.brands &&
        navigator.userAgentData.brands.some(function (b) { return /Chromium|Google Chrome|Microsoft Edge/.test(b.brand); }));

    var LENS = '#appSidebar, .cmdk, .employee-modal-box, .modal-content, .modal > div';
    var SVGNS = 'http://www.w3.org/2000/svg';
    var defs = null, lensId = 0;

    function ensureDefs() {
        if (defs) return defs;
        var svg = document.createElementNS(SVGNS, 'svg');
        svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
        svg.setAttribute('aria-hidden', 'true');
        svg.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none';
        defs = document.createElementNS(SVGNS, 'defs');
        svg.appendChild(defs);
        document.body.appendChild(svg);
        return defs;
    }

    // Карта смещения: вдоль кромки стекла пиксели «подтягиваются» из глубины — получается линза
    function bevelMap(w, h, r, bezel) {
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        var ctx = c.getContext('2d');
        var img = ctx.createImageData(w, h), d = img.data;
        var hx = w / 2, hy = h / 2, ix = hx - r, iy = hy - r;
        for (var y = 0; y < h; y++) {
            for (var x = 0; x < w; x++) {
                var px = x + 0.5 - hx, py = y + 0.5 - hy;
                var qx = Math.abs(px) - ix, qy = Math.abs(py) - iy;
                var dist, nx, ny;
                if (qx > 0 && qy > 0) {
                    var len = Math.sqrt(qx * qx + qy * qy) || 1;
                    dist = r - len; nx = (qx / len) * (px < 0 ? -1 : 1); ny = (qy / len) * (py < 0 ? -1 : 1);
                } else if (qx > qy) {
                    dist = r - qx; nx = px < 0 ? -1 : 1; ny = 0;
                } else {
                    dist = r - qy; nx = 0; ny = py < 0 ? -1 : 1;
                }
                var R = 128, G = 128;
                if (dist < bezel) {
                    var t = Math.max(0, dist) / bezel;
                    var m = Math.pow(1 - t, 2.2);
                    R = 128 - nx * m * 127;
                    G = 128 - ny * m * 127;
                }
                var i = (y * w + x) * 4;
                d[i] = R; d[i + 1] = G; d[i + 2] = 128; d[i + 3] = 255;
            }
        }
        ctx.putImageData(img, 0, 0);
        return c.toDataURL('image/png');
    }

    function applyLens(el) {
        var rect = el.getBoundingClientRect();
        var w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
        if (w < 40 || h < 40 || w > 1400 || h > 1600) return;
        var st = el.__lens;
        if (st && Math.abs(st.w - w) < 3 && Math.abs(st.h - h) < 3) return;
        var radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 20;
        var bezel = Math.min(26, Math.max(14, Math.round(Math.min(w, h) * 0.07)));
        var id = el.__lensId || (el.__lensId = 'lg-' + (++lensId));
        var filter = document.getElementById(id);
        if (!filter) {
            filter = document.createElementNS(SVGNS, 'filter');
            filter.setAttribute('id', id);
            filter.setAttribute('filterUnits', 'userSpaceOnUse');
            filter.setAttribute('color-interpolation-filters', 'sRGB');
            ensureDefs().appendChild(filter);
        }
        filter.setAttribute('x', '0'); filter.setAttribute('y', '0');
        filter.setAttribute('width', w); filter.setAttribute('height', h);
        filter.innerHTML = '';
        var img = document.createElementNS(SVGNS, 'feImage');
        img.setAttribute('href', bevelMap(w, h, Math.min(radius, w / 2, h / 2), bezel));
        img.setAttribute('x', '0'); img.setAttribute('y', '0');
        img.setAttribute('width', w); img.setAttribute('height', h);
        img.setAttribute('preserveAspectRatio', 'none');
        img.setAttribute('result', 'map');
        var disp = document.createElementNS(SVGNS, 'feDisplacementMap');
        disp.setAttribute('in', 'SourceGraphic'); disp.setAttribute('in2', 'map');
        disp.setAttribute('scale', '44');
        disp.setAttribute('xChannelSelector', 'R'); disp.setAttribute('yChannelSelector', 'G');
        filter.appendChild(img); filter.appendChild(disp);
        var value = 'url(#' + id + ') blur(11px) saturate(175%) brightness(1.04)';
        el.style.setProperty('-webkit-backdrop-filter', value);
        el.style.setProperty('backdrop-filter', value);
        el.__lens = { w: w, h: h };
        void rect;
    }

    var lensTimers = new WeakMap();
    function watchLens(el) {
        if (el.__lensWatched) return;
        el.__lensWatched = true;
        var run = function () {
            clearTimeout(lensTimers.get(el));
            lensTimers.set(el, setTimeout(function () { applyLens(el); }, 120));
        };
        if (window.ResizeObserver) new ResizeObserver(run).observe(el);
        run();
    }

    var lensScanQueued = false;
    function scanLens() {
        if (lensScanQueued) return;
        lensScanQueued = true;
        requestAnimationFrame(function () {
            lensScanQueued = false;
            document.querySelectorAll(LENS).forEach(watchLens);
        });
    }

    /* ---------- 5. Карточка проекта «раскрывается» в страницу проекта ---------- */
    var lastProjectCard = null;
    document.addEventListener('pointerdown', function (e) {
        var card = e.target && e.target.closest && e.target.closest('.project-card');
        if (card) lastProjectCard = card;
    }, true);
    window.addEventListener('pageswap', function (e) {
        if (reduce || !e.viewTransition || !lastProjectCard) return;
        var to = e.activation && e.activation.entry && e.activation.entry.url;
        if (to && /project\.html/.test(to)) lastProjectCard.style.viewTransitionName = 'proj-card';
    });
    window.addEventListener('pageshow', function () {
        if (lastProjectCard) lastProjectCard.style.viewTransitionName = '';
    });
    /* ---------- Запуск ---------- */
    function init() {
        wrapTheme();
        if (isChromium && !reduce) {
            root.classList.add('has-refract');
            scanLens();
            new MutationObserver(scanLens).observe(document.body, { childList: true, subtree: true });
        }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
