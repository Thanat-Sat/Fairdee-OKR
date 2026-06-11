/* ============================================================================
   Shared Chart.js plugin: de-cluttered point value labels
   ----------------------------------------------------------------------------
   Draws the value at every point of a LINE chart inside a small colored pill,
   and fans labels apart vertically (with a leader line) when points sit close
   together so near-equal / overlapping values stay readable.

   Registered globally, so it applies to every line chart automatically.

   Per-chart configuration via options.plugins.pointValueLabels:
     false                       -> disable for this chart
     {
       formatter: (value) => str -> custom label text (defaults to the chart's
                                    own y-axis tick callback, else a smart M/K)
       skipDashed: true|false    -> skip dashed target/projection lines (default true)
       skip: (dataset, i) => bool-> custom per-dataset skip test
     }
   ============================================================================ */
(function () {
    if (typeof Chart === 'undefined') return;

    // Compact fallback formatter for when no axis formatter is available.
    function defaultFormat(v) {
        const a = Math.abs(v);
        if (a >= 1e9) return (v / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
        if (a >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
        if (a >= 1e3) return (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
        if (Number.isInteger(v)) return String(v);
        return v.toFixed(1);
    }

    // Reuse the chart's y-axis tick callback so labels carry the same units as
    // the axis (M / MB / K / % …). Falls back to defaultFormat on any error.
    function resolveFormatter(chart, opts) {
        if (opts && typeof opts.formatter === 'function') return opts.formatter;
        const scales = chart.scales || {};
        const yScale = scales.y || Object.keys(scales)
            .map(k => scales[k]).find(s => s && s.axis === 'y');
        const cb = yScale && yScale.options && yScale.options.ticks
            && yScale.options.ticks.callback;
        if (typeof cb === 'function') {
            return function (v) {
                try {
                    const r = cb.call(yScale, v, 0, []);
                    return (r === undefined || r === null) ? defaultFormat(v) : String(r);
                } catch (e) {
                    return defaultFormat(v);
                }
            };
        }
        return defaultFormat;
    }

    function rawValue(d) {
        if (d === null || d === undefined) return null;
        if (typeof d === 'object') return ('y' in d) ? d.y : null;
        return d;
    }

    const plugin = {
        id: 'pointValueLabels',
        afterDatasetsDraw(chart, args, opts) {
            if (chart.config.type !== 'line') return;
            if (opts === false || (opts && opts.enabled === false)) return;
            opts = opts || {};

            const { ctx, chartArea } = chart;
            const minGap = 17;            // min vertical space between two labels
            const baseOffset = 11;        // default lift of a label above its point
            const leaderThreshold = 16;   // draw a connector once a label moves this far
            const padX = 4.5, padY = 2.5; // pill padding
            const lineHeight = 10;
            const skipDashed = opts.skipDashed !== false;
            const format = resolveFormatter(chart, opts);

            const skip = (ds, i) => {
                const meta = chart.getDatasetMeta(i);
                if (!meta || meta.hidden) return true;
                if (!ds.borderColor) return true;
                if (typeof ds.label === 'string' && ds.label.charAt(0) === '_') return true;
                if (skipDashed && Array.isArray(ds.borderDash) && ds.borderDash.length) return true;
                if (typeof opts.skip === 'function' && opts.skip(ds, i)) return true;
                return false;
            };

            ctx.save();
            ctx.font = "600 10px 'Google Sans Text', sans-serif";

            const count = chart.data.labels ? chart.data.labels.length
                : (chart.data.datasets[0] ? chart.data.datasets[0].data.length : 0);

            for (let i = 0; i < count; i++) {
                // Gather every label-eligible point in this column.
                const items = [];
                chart.data.datasets.forEach((ds, di) => {
                    if (skip(ds, di)) return;
                    const el = chart.getDatasetMeta(di).data[i];
                    const v = rawValue(ds.data[i]);
                    if (!el || v === null || isNaN(v)) return;
                    items.push({ value: v, px: el.x, py: el.y, color: ds.borderColor });
                });
                if (!items.length) continue;

                // Ideal slot = a little above each point; push apart so none overlap.
                items.sort((a, b) => a.py - b.py);
                const slots = items.map(it => it.py - baseOffset);
                for (let k = 1; k < slots.length; k++) {
                    if (slots[k] < slots[k - 1] + minGap) slots[k] = slots[k - 1] + minGap;
                }
                // Keep the fanned-out stack inside the plot area.
                const top = chartArea.top + lineHeight / 2 + 2;
                const bottom = chartArea.bottom - lineHeight / 2 - 2;
                if (slots[slots.length - 1] > bottom) {
                    const shift = slots[slots.length - 1] - bottom;
                    for (let k = 0; k < slots.length; k++) slots[k] -= shift;
                }
                if (slots[0] < top) {
                    const shift = top - slots[0];
                    for (let k = 0; k < slots.length; k++) slots[k] += shift;
                    for (let k = 1; k < slots.length; k++) {
                        if (slots[k] < slots[k - 1] + minGap) slots[k] = slots[k - 1] + minGap;
                    }
                }

                items.forEach((it, k) => {
                    const ly = slots[k];
                    const text = format(it.value);
                    const tw = ctx.measureText(text).width;
                    const w = tw + padX * 2;
                    const h = lineHeight + padY * 2;
                    const x = it.px;

                    // Connector from the actual point to a displaced label.
                    if (Math.abs(ly - it.py) > leaderThreshold) {
                        ctx.save();
                        ctx.beginPath();
                        ctx.globalAlpha = 0.55;
                        ctx.strokeStyle = it.color;
                        ctx.lineWidth = 1;
                        ctx.setLineDash([2, 2]);
                        ctx.moveTo(x, it.py);
                        ctx.lineTo(x, ly + (ly > it.py ? -h / 2 : h / 2));
                        ctx.stroke();
                        ctx.restore();
                    }

                    // Rounded white pill with the line's color as border + text.
                    const rx = x - w / 2, ry = ly - h / 2, r = 4;
                    ctx.beginPath();
                    ctx.moveTo(rx + r, ry);
                    ctx.arcTo(rx + w, ry, rx + w, ry + h, r);
                    ctx.arcTo(rx + w, ry + h, rx, ry + h, r);
                    ctx.arcTo(rx, ry + h, rx, ry, r);
                    ctx.arcTo(rx, ry, rx + w, ry, r);
                    ctx.closePath();
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
                    ctx.fill();
                    ctx.lineWidth = 1.25;
                    ctx.strokeStyle = it.color;
                    ctx.stroke();

                    ctx.fillStyle = it.color;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(text, x, ly + 0.5);
                });
            }
            ctx.restore();
        }
    };

    Chart.register(plugin);
    window.PointValueLabelsPlugin = plugin;

    // ------------------------------------------------------------------
    // Bar value labels — draws the value above each bar. Opt-IN per chart
    // via options.plugins.barValueLabels (so it never touches a bar chart
    // that doesn't ask for it). Optional { formatter, color }.
    // ------------------------------------------------------------------
    const barPlugin = {
        id: 'barValueLabels',
        afterDatasetsDraw(chart, args, opts) {
            if (chart.config.type !== 'bar') return;
            if (!opts || opts.enabled === false) return; // opt-in
            const { ctx } = chart;
            const format = resolveFormatter(chart, opts);
            const stacked = opts.stacked === true;
            ctx.save();
            ctx.font = "600 11px 'Google Sans Text', sans-serif";
            ctx.fillStyle = opts.color || (stacked ? '#fff' : '#334155');
            ctx.textAlign = 'center';
            ctx.textBaseline = stacked ? 'middle' : 'bottom';
            chart.data.datasets.forEach((ds, di) => {
                const meta = chart.getDatasetMeta(di);
                if (!meta || meta.hidden) return;
                if (ds._skipValueLabel) return; // opt-out per dataset
                meta.data.forEach((el, i) => {
                    const v = rawValue(ds.data[i]);
                    if (!el || v === null || isNaN(v) || v === 0) return;
                    if (stacked) {
                        // Center the value inside its segment; skip segments too short to fit.
                        const top = el.y, base = (el.base !== undefined ? el.base : el.y);
                        if (Math.abs(base - top) < 14) return;
                        ctx.fillText(format(v), el.x, (top + base) / 2);
                    } else {
                        ctx.fillText(format(v), el.x, el.y - 4);
                    }
                });
            });

            // Column total above each stacked bar (opt-in via opts.totals).
            if (stacked && opts.totals) {
                ctx.fillStyle = opts.totalColor || '#1e293b';
                ctx.textBaseline = 'bottom';
                ctx.font = "700 12px 'Google Sans Text', sans-serif";
                const count = chart.data.labels ? chart.data.labels.length : 0;
                for (let i = 0; i < count; i++) {
                    let sum = 0, topY = Infinity, x = null;
                    chart.data.datasets.forEach((ds, di) => {
                        const meta = chart.getDatasetMeta(di);
                        if (!meta || meta.hidden) return;
                        const el = meta.data[i];
                        const v = rawValue(ds.data[i]);
                        if (!el || v === null || isNaN(v)) return;
                        sum += v;
                        if (el.y < topY) topY = el.y;
                        x = el.x;
                    });
                    if (x === null || !isFinite(topY) || sum === 0) continue;
                    ctx.fillText(format(sum), x, topY - 5);
                }
            }
            ctx.restore();
        }
    };

    Chart.register(barPlugin);
    window.BarValueLabelsPlugin = barPlugin;
})();
