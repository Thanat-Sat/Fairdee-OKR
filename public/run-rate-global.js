// Global Run Rate state — shared across dashboards via localStorage.
// Exposes:
//   window.globalRunRate.get()          → { enabled, date }
//   window.globalRunRate.set(patch)     → partial update, persists + notifies
//   window.globalRunRate.subscribe(fn)  → fn(state) on every change, returns unsubscribe
//   window.globalRunRate.applyToMonthBars(monthKey, actualToDate)
//       → projected value if the picked date falls in monthKey, else null
//   window.mountRunRatePanel(containerId, opts?)
//       → renders a Show-Run-Rate checkbox + Today Date picker into the container
(function () {
    const KEY = 'fairdee_run_rate_v1';

    function todayIso() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function load() {
        const defaults = {
            enabled: false,
            date: todayIso(),
            applyTo: { month: true, quarter: false, eoy: false }
        };
        try {
            const raw = localStorage.getItem(KEY);
            if (!raw) return defaults;
            const parsed = JSON.parse(raw);
            return {
                ...defaults,
                ...parsed,
                applyTo: { ...defaults.applyTo, ...(parsed.applyTo || {}) }
            };
        } catch (e) {
            return defaults;
        }
    }

    let state = load();
    const subs = new Set();
    const notify = () => subs.forEach(fn => { try { fn({ ...state }); } catch (e) { console.error(e); } });

    // Cross-tab / cross-iframe sync via storage events
    window.addEventListener('storage', (e) => {
        if (e.key !== KEY || !e.newValue) return;
        try {
            const next = JSON.parse(e.newValue);
            state = { ...state, ...next };
            notify();
        } catch {}
    });

    function set(patch) {
        const nextApplyTo = patch.applyTo ? { ...state.applyTo, ...patch.applyTo } : state.applyTo;
        state = { ...state, ...patch, applyTo: nextApplyTo };
        try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
        notify();
    }

    function parseDate(dateStr) {
        if (!dateStr) return null;
        const parts = String(dateStr).split('-').map(Number);
        if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
        return {
            year: parts[0],
            month: parts[1],
            day: parts[2],
            monthKey: `${parts[0]}-${String(parts[1]).padStart(2, '0')}`
        };
    }

    function daysInMonth(monthKey) {
        if (!monthKey) return 31;
        const [y, m] = monthKey.split('-').map(Number);
        return new Date(y, m, 0).getDate();
    }

    // Data in the source database lags by 1 day — the picked "today" represents day N,
    // but actuals only reflect through day N-1. Use elapsed = day - 1 for projection.
    function effectiveElapsedDays(parsed, dim) {
        if (!parsed) return 0;
        const e = parsed.day - 1;
        return Math.max(0, Math.min(dim, e));
    }

    // Project actual-to-date into a full-month value if the picked date falls in monthKey.
    // Returns null when run rate is disabled or the month doesn't match.
    function projectForMonth(monthKey, actualToDate) {
        if (!state.enabled) return null;
        if (actualToDate == null || !Number.isFinite(actualToDate)) return null;
        const parsed = parseDate(state.date);
        if (!parsed || parsed.monthKey !== monthKey) return null;
        const dim = daysInMonth(monthKey);
        const elapsed = effectiveElapsedDays(parsed, dim);
        if (elapsed <= 0) return null;
        return (actualToDate / elapsed) * dim;
    }

    function projectAssumingPickedDay(monthKey, actualToDate) {
        if (!state.enabled) return null;
        if (actualToDate == null || !Number.isFinite(actualToDate)) return null;
        const parsed = parseDate(state.date);
        if (!parsed) return null;
        const dim = daysInMonth(monthKey);
        const elapsed = effectiveElapsedDays(parsed, dim);
        if (elapsed <= 0) return null;
        return (actualToDate / elapsed) * dim;
    }

    function setScopeGroupVisible(visible) {
        document.querySelectorAll('[data-rr-scope-group]').forEach(el => {
            el.style.display = visible ? 'inline-flex' : 'none';
        });
    }

    window.globalRunRate = {
        get: () => ({ ...state }),
        set,
        subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); },
        parseDate,
        daysInMonth,
        effectiveElapsedDays,
        projectForMonth,
        projectAssumingPickedDay,
        setScopeGroupVisible
    };

    // ---- Panel builder ----
    window.mountRunRatePanel = function (containerId, opts = {}) {
        const target = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
        if (!target) return;

        const label = opts.label || 'Show Run Rate';
        target.innerHTML = `
            <div style="display:inline-flex; align-items:center; gap:0.5rem; flex-wrap:nowrap; margin:0;">
                <label style="display:inline-flex; align-items:center; gap:0.35rem; cursor:pointer; font-weight:600; color:#1e293b; font-size:0.8125rem; user-select:none; white-space:nowrap;">
                    <input type="checkbox" data-rr-cb style="width:14px; height:14px; accent-color:#f59e0b; cursor:pointer;">
                    ${label}
                </label>
                <div data-rr-inputs style="display:none; align-items:center; gap:0.5rem; background:#fffbeb; border:1px solid #fde68a; border-radius:6px; padding:0.2rem 0.5rem; white-space:nowrap;">
                    <input type="date" data-rr-date style="padding:0.15rem 0.35rem; border:1px solid #fcd34d; border-radius:5px; font-family:'Google Sans Text',monospace; font-size:0.8125rem; font-weight:600; background:white; color:#1e293b;">
                </div>
            </div>`;

        const cb = target.querySelector('[data-rr-cb]');
        const inputs = target.querySelector('[data-rr-inputs]');
        const dateInput = target.querySelector('[data-rr-date]');

        const sync = (s) => {
            cb.checked = s.enabled;
            dateInput.value = s.date;
            inputs.style.display = s.enabled ? 'inline-flex' : 'none';
        };
        sync(window.globalRunRate.get());

        cb.addEventListener('change', () => window.globalRunRate.set({ enabled: cb.checked }));
        dateInput.addEventListener('change', () => window.globalRunRate.set({ date: dateInput.value || todayIso() }));
        dateInput.addEventListener('input',  () => window.globalRunRate.set({ date: dateInput.value || todayIso() }));

        window.globalRunRate.subscribe(sync);
    };

    // Mount a compact "Apply: Month / Quarter / EOY" chip next to a table title.
    // Only the listed scopes are shown (default all three). Visible regardless of enabled state.
    window.mountRunRateScopePanel = function (containerId, opts = {}) {
        const target = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
        if (!target) return;
        const scopes = opts.scopes || ['month', 'quarter', 'eoy'];
        const labels = { month: 'Month', quarter: 'Quarter', eoy: 'EOY' };
        const scopeStyle = 'display:inline-flex; align-items:center; gap:0.25rem; cursor:pointer; font-size:0.75rem; color:#92400e; font-weight:600;';
        const scopeCb = 'width:13px; height:13px; accent-color:#f59e0b; cursor:pointer;';
        target.innerHTML = `
            <span style="display:inline-flex; align-items:center; gap:0.4rem; background:#fffbeb; border:1px solid #fde68a; border-radius:6px; padding:0.2rem 0.55rem; white-space:nowrap;">
                <span style="font-size:0.7rem; color:#92400e; font-weight:700; text-transform:uppercase; letter-spacing:0.04em;">Run rate apply</span>
                ${scopes.map(k => `<label style="${scopeStyle}"><input type="checkbox" data-rr-scope="${k}" style="${scopeCb}">${labels[k]}</label>`).join('')}
            </span>`;
        const boxes = {};
        scopes.forEach(k => { boxes[k] = target.querySelector(`[data-rr-scope="${k}"]`); });
        const sync = (s) => {
            scopes.forEach(k => { if (boxes[k]) boxes[k].checked = !!s.applyTo[k]; });
        };
        sync(window.globalRunRate.get());
        scopes.forEach(k => {
            if (!boxes[k]) return;
            boxes[k].addEventListener('change', () => {
                window.globalRunRate.set({ applyTo: { [k]: boxes[k].checked } });
            });
        });
        window.globalRunRate.subscribe(sync);
    };
})();
