window.addEventListener('load', function() {
    if (typeof Chart !== 'undefined') {
        Chart.defaults.font.family = "'Google Sans Text', sans-serif";
    }
});

// ============================================================================
// DATA PROCESSING MODULE - CHANNEL OVERVIEW
// ============================================================================

class DataProcessor {
    constructor() {
        this.rawData = [];
        this.monthlyData = {};
        this.channels = {
            'Team Agent': [],
            'IG': [],
            'FD/AO': []
        };
        this.targets = {}; // Store targets by month and channel
    }

    parseCSVLine(line) {
        const values = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current.trim());
        
        return values;
    }

    async loadTargets() {
        if (!window.targetsDB) {
            console.log('targetsDB not available yet');
            return;
        }

        // Use getAllTargets to avoid Firestore composite index requirement
        const result = await targetsDB.getAllTargets();
        if (result.success) {
            this.targets = {};
            result.targets
                .filter(t => t.type === 'channel')
                .forEach(target => {
                    const key = `${target.month}-${target.name}`;
                    this.targets[key] = target.value;
                });
            console.log('✅ Channel targets loaded:', Object.keys(this.targets));
        }
    }

    getTarget(month, channelName) {
        const key = `${month}-${channelName}`;
        return this.targets[key] || null;
    }

    getSortedMonths() {
        return Object.keys(this.monthlyData).sort();
    }

    getLastNMonths(n = 7) {
        const allMonths = this.getSortedMonths();
        if (allMonths.length === 0) return [];
        const effective = window.getEffectiveMonth ? window.getEffectiveMonth(allMonths) : allMonths[allMonths.length - 1];
        const idx = effective ? allMonths.indexOf(effective) : allMonths.length - 1;
        const end = idx < 0 ? allMonths.length : idx + 1;
        return allMonths.slice(Math.max(0, end - n), end);
    }

    getLatestMonth() {
        const months = this.getSortedMonths();
        if (months.length === 0) return null;
        return window.getEffectiveMonth ? window.getEffectiveMonth(months) : months[months.length - 1];
    }

    getPreviousMonth() {
        const months = this.getSortedMonths();
        const latest = this.getLatestMonth();
        if (!latest) return null;
        const idx = months.indexOf(latest);
        return idx > 0 ? months[idx - 1] : null;
    }

    calculateMoMGrowth(current, previous) {
        if (!previous || previous === 0) return null;
        return ((current - previous) / previous) * 100;
    }

    getSelectedYear() {
        const m = this.getLatestMonth();
        return m ? m.split('-')[0] : null;
    }

    getYTDMonths() {
        const year = this.getSelectedYear();
        const latest = this.getLatestMonth();
        if (!year || !latest) return [];
        const lastNum = parseInt(latest.split('-')[1], 10);
        const out = [];
        for (let i = 1; i <= lastNum; i++) {
            out.push(`${year}-${String(i).padStart(2, '0')}`);
        }
        return out;
    }

    getQuarterMonths(year, quarter) {
        const start = (quarter - 1) * 3 + 1;
        const out = [];
        for (let i = 0; i < 3; i++) {
            out.push(`${year}-${String(start + i).padStart(2, '0')}`);
        }
        return out;
    }

    getCurrentQuarter() {
        const m = this.getLatestMonth();
        if (!m) return null;
        return Math.ceil(parseInt(m.split('-')[1], 10) / 3);
    }

    getYearMonths(year) {
        const out = [];
        for (let i = 1; i <= 12; i++) {
            out.push(`${year}-${String(i).padStart(2, '0')}`);
        }
        return out;
    }

    getActualForChannel(month, channel) {
        const data = this.monthlyData[month];
        if (!data) return null;
        if (channel === 'All') return data['Total'] || 0;
        return data[channel] != null ? data[channel] : null;
    }

    getTargetForChannel(month, channel) {
        if (channel === 'All') {
            const subs = ['Team Agent', 'IG', 'FD/AO'];
            let sum = 0, has = false;
            subs.forEach(s => {
                const t = this.getTarget(month, s);
                if (t) { sum += t; has = true; }
            });
            return has ? sum : null;
        }
        return this.getTarget(month, channel);
    }

    // Linear projection run rate: average × period length
    calculateQuarterRunRate(year, quarter, channel) {
        const months = this.getQuarterMonths(year, quarter);
        const ytd = this.getYTDMonths();

        let tSum = 0, tHas = false;
        months.forEach(m => {
            const t = this.getTargetForChannel(m, channel);
            if (t != null) { tSum += t; tHas = true; }
        });

        const completed = months.filter(m => ytd.includes(m));
        let aSum = 0, aCount = 0;
        completed.forEach(m => {
            const a = this.getActualForChannel(m, channel);
            if (a != null) { aSum += a; aCount++; }
        });
        let actual = null;
        if (aCount > 0) actual = (aSum / aCount) * 3;

        return { target: tHas ? tSum : null, actual };
    }

    calculateEOYRunRate(year, channel) {
        const yearMonths = this.getYearMonths(year);
        const ytd = this.getYTDMonths();

        let tSum = 0, tHas = false;
        yearMonths.forEach(m => {
            const t = this.getTargetForChannel(m, channel);
            if (t != null) { tSum += t; tHas = true; }
        });

        let aSum = 0, aCount = 0;
        ytd.forEach(m => {
            const a = this.getActualForChannel(m, channel);
            if (a != null) { aSum += a; aCount++; }
        });
        const actual = aCount > 0 ? (aSum / aCount) * 12 : null;

        return { target: tHas ? tSum : null, actual };
    }

    formatMonthLabel(monthStr) {
        const [year, month] = monthStr.split('-');
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                           'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${monthNames[parseInt(month) - 1]} ${year}`;
    }

    getChartData() {
        const months = this.getLastNMonths(7);

        const targetDataset = (label, channelName, color) => ({
            label: `${label} Target`,
            data: months.map(m => this.getTarget(m, channelName)),
            borderColor: color,
            backgroundColor: 'transparent',
            borderDash: [6, 4],
            borderWidth: 2,
            tension: 0.4,
            fill: false,
            pointRadius: 3,
            pointHoverRadius: 5,
            spanGaps: true
        });

        return {
            labels: months.map(m => this.formatMonthLabel(m)),
            datasets: [
                {
                    label: 'Team Agent',
                    data: months.map(m => this.monthlyData[m]['Team Agent']),
                    borderColor: '#6366F1',
                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                    tension: 0.4,
                    fill: true,
                    borderWidth: 2.5,
                    pointRadius: 4,
                    pointHoverRadius: 6
                },
                targetDataset('Team Agent', 'Team Agent', '#6366F1'),
                {
                    label: 'IG',
                    data: months.map(m => this.monthlyData[m]['IG']),
                    borderColor: '#EC4899',
                    backgroundColor: 'rgba(236, 72, 153, 0.1)',
                    tension: 0.4,
                    fill: true,
                    borderWidth: 2.5,
                    pointRadius: 4,
                    pointHoverRadius: 6
                },
                targetDataset('IG', 'IG', '#EC4899'),
                {
                    label: 'FD/AO',
                    data: months.map(m => this.monthlyData[m]['FD/AO']),
                    borderColor: '#10B981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    tension: 0.4,
                    fill: true,
                    borderWidth: 2.5,
                    pointRadius: 4,
                    pointHoverRadius: 6
                },
                targetDataset('FD/AO', 'FD/AO', '#10B981')
            ]
        };
    }
}

// ============================================================================
// UI MODULE - CHANNEL OVERVIEW
// ============================================================================

class DashboardUI {
    constructor(dataProcessor) {
        this.dataProcessor = dataProcessor;
        this.chart = null;
    }

    getRunRateState() {
        if (window.globalRunRate && window.globalRunRate.get) return window.globalRunRate.get();
        return { enabled: false, date: '' };
    }

    daysInMonth(monthStr) {
        if (!monthStr) return 31;
        const [y, m] = monthStr.split('-').map(Number);
        return new Date(y, m, 0).getDate();
    }

    calcRunRate(actual, day, daysInMonth) {
        if (actual == null || !day || day < 1 || !daysInMonth) return null;
        const safeDay = Math.min(day, daysInMonth);
        return (actual / safeDay) * daysInMonth;
    }

    setupRunRateControls() {
        if (this._runRateBound) return;
        this._runRateBound = true;
        if (window.globalRunRate && window.globalRunRate.subscribe) {
            window.globalRunRate.subscribe(() => this.renderChart());
        }
    }

    formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toFixed(0);
    }

    formatPercentage(num) {
        if (num === null || isNaN(num)) return '—';
        const sign = num > 0 ? '+' : '';
        return `${sign}${num.toFixed(1)}%`;
    }

    calculateTargetPercentage(actual, target) {
        if (!target || target === 0) return null;
        return (actual / target) * 100;
    }

    updateKPI(valueId, changeId, current, previous, channelName, month) {
        const valueElement = document.getElementById(valueId);
        const changeElement = document.getElementById(changeId);
        
        if (valueElement) {
            const target = this.dataProcessor.getTarget(month, channelName);
            if (target) {
                const targetPercentage = this.calculateTargetPercentage(current, target);
                valueElement.innerHTML = `
                    <div style="display: flex; flex-direction: column; gap: 0.25rem;">
                        <div>${this.formatNumber(current)}</div>
                        <div style="font-size: 0.75rem; opacity: 0.7;">
                            Target: ${this.formatNumber(target)} (${targetPercentage ? targetPercentage.toFixed(1) + '%' : '—'})
                        </div>
                    </div>
                `;
            } else {
                valueElement.textContent = this.formatNumber(current);
            }
        }
        
        if (changeElement) {
            const growth = this.dataProcessor.calculateMoMGrowth(current, previous);
            const badge = changeElement.querySelector('.change-badge');
            
            if (badge) {
                badge.textContent = `MoM ${this.formatPercentage(growth)}`;
                badge.classList.remove('positive', 'negative', 'neutral');
                
                if (growth === null) {
                    badge.classList.add('neutral');
                } else if (growth > 0) {
                    badge.classList.add('positive');
                } else if (growth < 0) {
                    badge.classList.add('negative');
                } else {
                    badge.classList.add('neutral');
                }
            }
        }
    }

    async render() {
        await this.dataProcessor.loadTargets();
        
        const latestMonth = this.dataProcessor.getLatestMonth();
        const previousMonth = this.dataProcessor.getPreviousMonth();
        
        if (!latestMonth) {
            console.log('No data to render');
            document.getElementById('noDataSection').style.display = 'flex';
            document.getElementById('dashboardContent').style.display = 'none';
            return;
        }

        const currentData = this.dataProcessor.monthlyData[latestMonth];
        const previousData = previousMonth ? this.dataProcessor.monthlyData[previousMonth] : null;

        this.updateKPI('totalGWP', 'totalChange', currentData['Total'], previousData ? previousData['Total'] : 0, 'Total', latestMonth);
        this.updateKPI('teamGWP', 'teamChange', currentData['Team Agent'], previousData ? previousData['Team Agent'] : 0, 'Team Agent', latestMonth);
        this.updateKPI('igGWP', 'igChange', currentData['IG'], previousData ? previousData['IG'] : 0, 'IG', latestMonth);
        this.updateKPI('fdGWP', 'fdChange', currentData['FD/AO'], previousData ? previousData['FD/AO'] : 0, 'FD/AO', latestMonth);

        this.setupRunRateControls();
        this.renderChart();
        this.renderTable();

        document.getElementById('noDataSection').style.display = 'none';
        document.getElementById('dashboardContent').style.display = 'block';
    }

    applyRunRateToChartData(chartData) {
        // chartData.datasets: alternating actual/target per channel (0/1 Team Agent, 2/3 IG, 4/5 FD/AO)
        const rr = this.getRunRateState();
        if (!rr.enabled) return null;
        const parsed = window.globalRunRate.parseDate(rr.date);
        if (!parsed) return null;

        const months = this.dataProcessor.getLastNMonths(7);
        const projIdx = months.indexOf(parsed.monthKey);
        if (projIdx === -1) return null;  // selected month not in displayed window — nothing to project

        const projMonth = months[projIdx];
        const dim = this.daysInMonth(projMonth);
        const day = Math.max(1, Math.min(dim, parsed.day));

        const actualIdxs = [0, 2, 4];
        const projectedTotal = { actual: 0, target: 0 };
        actualIdxs.forEach(i => {
            const arr = chartData.datasets[i].data;
            const raw = arr[projIdx];
            const projected = this.calcRunRate(raw, day, dim);
            if (projected != null) {
                projectedTotal.actual += projected;
                arr[projIdx] = projected;
            }
            const targets = chartData.datasets[i + 1].data;
            if (targets[projIdx] != null) projectedTotal.target += targets[projIdx];

            // Highlight only the projected point with an amber diamond
            const radii  = arr.map((_, idx) => (idx === projIdx ? 8 : 4));
            const styles = arr.map((_, idx) => (idx === projIdx ? 'rectRot' : 'circle'));
            const ptBg   = arr.map((_, idx) => (idx === projIdx ? '#f59e0b' : chartData.datasets[i].borderColor));
            chartData.datasets[i].pointRadius = radii;
            chartData.datasets[i].pointHoverRadius = radii.map(r => r + 1);
            chartData.datasets[i].pointStyle = styles;
            chartData.datasets[i].pointBackgroundColor = ptBg;
            chartData.datasets[i].label = `${chartData.datasets[i].label} (Run Rate)`;
        });

        return { day, daysInMonth: dim, projMonth, projectedTotal };
    }

    renderChart() {
        const ctx = document.getElementById('trendChart').getContext('2d');

        if (this.chart) {
            this.chart.destroy();
        }

        const chartData = this.dataProcessor.getChartData();
        const banner = document.getElementById('chRunRateBanner');
        const rrMeta = this.applyRunRateToChartData(chartData);
        if (banner) {
            banner.textContent = rrMeta
                ? `→ projected for ${rrMeta.projMonth} (day ${rrMeta.day}/${rrMeta.daysInMonth}): ${this.formatNumber(rrMeta.projectedTotal.actual)} total`
                : '';
        }

        const self = this;
        this.chart = new Chart(ctx, {
            type: 'line',
            data: chartData,
            plugins: [{
                id: 'channelValueLabels',
                afterDatasetsDraw(chart) {
                    const ctx2 = chart.ctx;
                    // Only label the three actual lines (indices 0, 2, 4)
                    const actualConfigs = [
                        { idx: 0, color: '#4338CA' }, // Team Agent
                        { idx: 2, color: '#BE185D' }, // IG
                        { idx: 4, color: '#047857' }  // FD/AO
                    ];
                    actualConfigs.forEach(cfg => {
                        const meta = chart.getDatasetMeta(cfg.idx);
                        const data = chart.data.datasets[cfg.idx].data;
                        if (!meta || !meta.data) return;
                        meta.data.forEach((pt, i) => {
                            const val = data[i];
                            if (val == null || !Number.isFinite(val)) return;
                            ctx2.save();
                            ctx2.fillStyle = cfg.color;
                            ctx2.font = 'bold 10px "Google Sans Text"';
                            ctx2.textAlign = 'center';
                            ctx2.textBaseline = 'bottom';
                            ctx2.fillText(self.formatNumber(val), pt.x, pt.y - 8);
                            ctx2.restore();
                        });
                    });
                }
            }],
            options: {
                responsive: true,
                maintainAspectRatio: false,
                spanGaps: true,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        align: 'end',
                        labels: {
                            font: { family: 'Google Sans Text', size: 12 },
                            color: '#5F6C7B',
                            usePointStyle: false,
                            boxWidth: 24,
                            boxHeight: 2,
                            padding: 16,
                            generateLabels: function(chart) {
                                const datasets = chart.data.datasets;
                                return [
                                    { text: 'Team Agent', fillStyle: 'transparent', strokeStyle: '#6366F1', lineWidth: 2.5, lineDash: [], hidden: false, datasetIndex: 0 },
                                    { text: 'IG',         fillStyle: 'transparent', strokeStyle: '#EC4899', lineWidth: 2.5, lineDash: [], hidden: false, datasetIndex: 2 },
                                    { text: 'FD/AO',      fillStyle: 'transparent', strokeStyle: '#10B981', lineWidth: 2.5, lineDash: [], hidden: false, datasetIndex: 4 },
                                    { text: 'Target',     fillStyle: 'transparent', strokeStyle: '#94A3B8', lineWidth: 1.5, lineDash: [6, 4], hidden: false, datasetIndex: 1 },
                                ];
                            }
                        }
                    },
                    tooltip: {
                        backgroundColor: '#0A0E27',
                        padding: 12,
                        titleFont: { size: 13, weight: '600' },
                        bodyFont: { size: 13 },
                        displayColors: true,
                        boxWidth: 8,
                        boxHeight: 8,
                        usePointStyle: true,
                        callbacks: {
                            label: function(context) {
                                const value = context.parsed.y;
                                const formatted = value >= 1000000 ? 
                                    (value / 1000000).toFixed(2) + 'M' :
                                    value >= 1000 ? 
                                    (value / 1000).toFixed(2) + 'K' :
                                    value.toFixed(0);
                                return context.dataset.label + ': ' + formatted;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { font: { family: 'Google Sans Text', size: 11 }, color: '#94A3B8' }
                    },
                    y: {
                        grid: { color: '#E8ECF0', drawBorder: false },
                        ticks: {
                            font: { family: 'Google Sans Text', size: 11 },
                            color: '#94A3B8',
                            callback: function(value) {
                                if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
                                else if (value >= 1000) return (value / 1000).toFixed(0) + 'K';
                                return value;
                            }
                        }
                    }
                },
                interaction: { intersect: false, mode: 'index' }
            }
        });
    }

    formatMB(num) {
        if (num == null || !Number.isFinite(num)) return '—';
        return (num / 1000000).toFixed(1) + 'MB';
    }

    formatPctCell(actual, target) {
        if (actual == null || !target || target === 0) return { text: '—', color: '#94A3B8' };
        const pct = (actual / target) * 100;
        return { text: pct.toFixed(1) + '%', color: pct >= 100 ? '#10B981' : '#EF4444' };
    }

    buildGwpSectionHeader(label, colCount) {
        return `<tr><td colspan="${colCount}" style="background: #1E3A5F; color: #fff; text-align: center; font-weight: 700; padding: 0.625rem; font-size: 0.95rem; font-style: italic;">${label}</td></tr>`;
    }

    buildGwpChannelBlock(label, channelKey, ytdMonths, year, quarter) {
        const dp = this.dataProcessor;
        const cellPad = 'padding: 0.5rem 1rem;';
        const numAlign = 'text-align: right;';
        const labelStyle = `${cellPad} text-align: left; color: #0A0E27; font-weight: 600;`;
        const numStyle = `${cellPad} ${numAlign} color: #0A0E27; font-family: 'Google Sans Text', monospace; font-size: 0.8125rem;`;

        // Channel header row: light blue band + month/run-rate column titles in gray
        let html = `<tr>
            <th style="${cellPad} text-align: left; background: #DBEAFE; color: #0A0E27; font-weight: 700;">${label}</th>`;
        ytdMonths.forEach(m => {
            html += `<th style="${cellPad} ${numAlign} background: #E5E7EB; color: #0A0E27; font-weight: 600; font-size: 0.8125rem;">${dp.formatMonthLabel(m)}</th>`;
        });
        html += `<th style="${cellPad} ${numAlign} background: #E5E7EB; color: #0A0E27; font-weight: 600; font-size: 0.8125rem;">Q${quarter} run rate</th>`;
        html += `<th style="${cellPad} ${numAlign} background: #E5E7EB; color: #0A0E27; font-weight: 600; font-size: 0.8125rem;">EOY run rate</th>`;
        html += `</tr>`;

        const qRR = dp.calculateQuarterRunRate(year, quarter, channelKey);
        const eRR = dp.calculateEOYRunRate(year, channelKey);

        // Target row
        html += `<tr><td style="${labelStyle}">Target</td>`;
        ytdMonths.forEach(m => {
            html += `<td style="${numStyle}">${this.formatMB(dp.getTargetForChannel(m, channelKey))}</td>`;
        });
        html += `<td style="${numStyle}">${this.formatMB(qRR.target)}</td>`;
        html += `<td style="${numStyle}">${this.formatMB(eRR.target)}</td></tr>`;

        // Actual row
        html += `<tr><td style="${labelStyle}">Actual</td>`;
        ytdMonths.forEach(m => {
            html += `<td style="${numStyle}">${this.formatMB(dp.getActualForChannel(m, channelKey))}</td>`;
        });
        html += `<td style="${numStyle}">${this.formatMB(qRR.actual)}</td>`;
        html += `<td style="${numStyle}">${this.formatMB(eRR.actual)}</td></tr>`;

        // % row (italic, colored)
        html += `<tr><td style="${cellPad}"></td>`;
        ytdMonths.forEach(m => {
            const p = this.formatPctCell(dp.getActualForChannel(m, channelKey), dp.getTargetForChannel(m, channelKey));
            html += `<td style="${cellPad} ${numAlign} font-style: italic; color: ${p.color}; font-weight: 600;">${p.text}</td>`;
        });
        const pq = this.formatPctCell(qRR.actual, qRR.target);
        html += `<td style="${cellPad} ${numAlign} font-style: italic; color: ${pq.color}; font-weight: 600;">${pq.text}</td>`;
        const pe = this.formatPctCell(eRR.actual, eRR.target);
        html += `<td style="${cellPad} ${numAlign} font-style: italic; color: ${pe.color}; font-weight: 600;">${pe.text}</td></tr>`;

        // Spacer row
        html += `<tr><td colspan="${ytdMonths.length + 3}" style="height: 0.5rem;"></td></tr>`;

        return html;
    }

    renderTable() {
        const dp = this.dataProcessor;
        const thead = document.getElementById('channelTableHead');
        const tbody = document.getElementById('channelTableBody');
        if (!thead || !tbody) return;

        const year = dp.getSelectedYear();
        const ytdMonths = dp.getYTDMonths();
        const quarter = dp.getCurrentQuarter();
        if (!year || ytdMonths.length === 0) {
            thead.innerHTML = '';
            tbody.innerHTML = '';
            return;
        }

        const colCount = ytdMonths.length + 3; // label + months + Q + EOY

        thead.innerHTML = '';
        let html = '';
        html += this.buildGwpSectionHeader('Agency channel', colCount);
        html += this.buildGwpChannelBlock('All account', 'All', ytdMonths, year, quarter);
        html += this.buildGwpSectionHeader('Sub channel', colCount);
        html += this.buildGwpChannelBlock('Team Agent', 'Team Agent', ytdMonths, year, quarter);
        html += this.buildGwpChannelBlock('FD/AO', 'FD/AO', ytdMonths, year, quarter);
        html += this.buildGwpChannelBlock('IG', 'IG', ytdMonths, year, quarter);
        tbody.innerHTML = html;
    }

    openTargetsModal() {
        const latestMonth = this.dataProcessor.getLatestMonth();
        if (!latestMonth) {
            alert('Please upload data first');
            return;
        }

        document.getElementById('targetMonth').value = latestMonth;
        
        // Load existing targets
        const teamTarget = this.dataProcessor.getTarget(latestMonth, 'Team Agent');
        const igTarget = this.dataProcessor.getTarget(latestMonth, 'IG');
        const fdTarget = this.dataProcessor.getTarget(latestMonth, 'FD/AO');
        
        document.getElementById('teamAgentTarget').value = teamTarget || '';
        document.getElementById('igTarget').value = igTarget || '';
        document.getElementById('fdaoTarget').value = fdTarget || '';
        
        document.getElementById('targetsModal').style.display = 'flex';
    }

    closeTargetsModal() {
        document.getElementById('targetsModal').style.display = 'none';
    }

    async saveTargets() {
        const month = document.getElementById('targetMonth').value;
        const teamTarget = parseFloat(document.getElementById('teamAgentTarget').value);
        const igTarget = parseFloat(document.getElementById('igTarget').value);
        const fdaoTarget = parseFloat(document.getElementById('fdaoTarget').value);

        if (!month) {
            alert('Please select a month');
            return;
        }

        const targets = [
            { name: 'Team Agent', value: teamTarget },
            { name: 'IG', value: igTarget },
            { name: 'FD/AO', value: fdaoTarget }
        ];

        for (const target of targets) {
            if (target.value && !isNaN(target.value)) {
                await targetsDB.saveTarget({
                    type: 'channel',
                    name: target.name,
                    month: month,
                    value: target.value,
                    unit: 'THB'
                });
            }
        }

        this.closeTargetsModal();
        await this.render();
    }
}

// ============================================================================
// TARGET MODAL FUNCTIONS
// ============================================================================

function openTargetsModal() {
    if (dashboardUI) {
        dashboardUI.openTargetsModal();
    }
}

function closeTargetsModal() {
    if (dashboardUI) {
        dashboardUI.closeTargetsModal();
    }
}

async function saveTargets() {
    if (dashboardUI) {
        await dashboardUI.saveTargets();
    }
}

// ============================================================================
// APPLICATION INITIALIZATION WITH AUTO-LOAD
// ============================================================================

// Check if loaded in iframe and hide header
if (window.self !== window.top) {
    const header = document.getElementById('dashboardHeader');
    if (header) {
        header.style.display = 'none';
    }
}

const dataProcessor = new DataProcessor();
let dashboardUI = null;

function initializeChannelDashboard() {
    if (!window.targetsDB) {
        console.log('Waiting for targetsDB...');
        setTimeout(initializeChannelDashboard, 100);
        return;
    }
    
    dashboardUI = new DashboardUI(dataProcessor);
    console.log('Channel dashboard initialized');
    
    // Auto-load data from store
    autoLoadData();
}

// Auto-load data from data store on page load
function autoLoadData() {
    console.log('Channel dashboard loaded, checking for stored data...');
    
    function checkDataStore() {
        if (!window.dashboardDataStore) {
            console.log('Waiting for data store...');
            setTimeout(checkDataStore, 100);
            return;
        }
        
        console.log('Fetching fresh channel data from Google Sheets...');
        fetchChannelSheetData();
    }

        function showLoadingBar() {
        var b = document.getElementById('loadingBar');
        if (b) b.classList.add('active');
    }
    function hideLoadingBar() {
        var b = document.getElementById('loadingBar');
        if (b) b.classList.remove('active');
    }

    function fetchChannelSheetData() {
        const SHEET_ID = '1M51L7xRu_Y8MRO5ziDVZ4pbWtqi0Mxb1-oJ6WyfwKU0';
        const GID = '1126458530';
        const url = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/export?format=csv&gid=' + GID;
        showLoadingBar();
        fetch(url)
            .then(function(r) { return r.text(); })
            .then(function(csv) {
                processChannelCSV(csv);
            })
            .catch(function(err) {
                hideLoadingBar();
                console.error('Failed to fetch channel data:', err);
                document.getElementById('noDataSection').style.display = 'flex';
                document.getElementById('dashboardContent').style.display = 'none';
            });
    }

    function parseChannelCSVLine(line) {
        var values = [], current = '', inQuotes = false;
        for (var i = 0; i < line.length; i++) {
            var ch = line[i];
            if (ch === '"') { inQuotes = !inQuotes; }
            else if (ch === ',' && !inQuotes) { values.push(current.trim()); current = ''; }
            else { current += ch; }
        }
        values.push(current.trim());
        return values;
    }

    function classifyChannelRow(channelValue) {
        var ch = channelValue.toString().toLowerCase();
        if (ch.includes('mlm')) return 'Team Agent';
        if (ch.includes('inspection_garage') || ch.includes('inspection garage')) return 'IG';
        if (ch.includes('direct_agent') || ch.includes('direct agent') ||
            ch.includes('ao_agent') || ch.includes('ao agent')) return 'FD/AO';
        return 'Unknown';
    }

    function parseChannelMonth(val) {
        if (!val) return null;
        var clean = val.toString().replace(/"/g, '').trim();
        var parts = clean.split(',');
        if (parts.length < 2) return null;
        // Handle "February 1, 2019" or "February, 2019" — take only first word as month name
        var monthWord = parts[0].trim().split(/\s+/)[0];
        var year = parts[parts.length - 1].trim();
        var monthMap = { January:'01', February:'02', March:'03', April:'04', May:'05', June:'06',
                         July:'07', August:'08', September:'09', October:'10', November:'11', December:'12' };
        var mNum = monthMap[monthWord];
        if (!mNum || !year) return null;
        return year + '-' + mNum;
    }

    function processChannelCSV(csvText) {
        var nl = String.fromCharCode(10);
        var lines = csvText.split(nl).filter(function(l) { return l.trim(); });
        if (lines.length < 2) return;
        var headers = parseChannelCSVLine(lines[0]);
        var monthlyData = {};
        for (var i = 1; i < lines.length; i++) {
            var values = parseChannelCSVLine(lines[i]);
            var row = {};
            headers.forEach(function(h, idx) { row[h] = values[idx] || ''; });
            var month = parseChannelMonth(row.sale_month || row.SaleMonth || row.month || row.Month || '');
            var channelRaw = row.gropued || row.channel || row.Channel || '';
            var channel = classifyChannelRow(channelRaw);
            var gwpRaw = row.premium_without_tax_local_amt || row.GWP || row.gwp || row.premium || '0';
            var gwp = parseFloat(gwpRaw.toString().replace(/[,"']/g, '')) || 0;
            if (!month || channel === 'Unknown') continue;
            if (!monthlyData[month]) {
                monthlyData[month] = { 'Team Agent': 0, 'IG': 0, 'FD/AO': 0, 'Total': 0 };
            }
            monthlyData[month][channel] += gwp;
            monthlyData[month]['Total'] += gwp;
        }
        var months = Object.keys(monthlyData).sort();
        window.dashboardDataStore.updateChannelData(monthlyData, months);
        dataProcessor.monthlyData = monthlyData;
        dataProcessor.loadTargets().then(function() {
            hideLoadingBar();
            dashboardUI.render();
            console.log('Channel data fetched and rendered from Google Sheets');
        });
    }

    checkDataStore();
}

// Listen for data updates
window.addEventListener('dashboardDataUpdated', function(event) {
    console.log('📊 Channel data updated, reloading...');
    const allData = event.detail;
    
    if (allData.channel && allData.channel.data && allData.channel.months) {
        dataProcessor.monthlyData = allData.channel.data;
        
        dataProcessor.loadTargets().then(() => {
            dashboardUI.render();
        });
    }
});

// Listen for month changes from parent frame
window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'monthChange' && dashboardUI) {
        dashboardUI.render();
    }
});

initializeChannelDashboard();
