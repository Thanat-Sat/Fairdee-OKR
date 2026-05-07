// ============================================================================
// PERFORMANCE RECAP DASHBOARD
// ============================================================================

// Set global Chart.js font to Google Sans Text
if (typeof Chart !== 'undefined') {
    Chart.defaults.font.family = "'Google Sans Text', sans-serif";
}
window.addEventListener('load', function() {
    if (typeof Chart !== 'undefined') {
        Chart.defaults.font.family = "'Google Sans Text', sans-serif";
    }
});

class PerformanceRecap {
    constructor() {
        this.data = {
            segment: null,
            mlm: null,
            channel: null,
            focusTeam: null
        };
        this.chart = null;
        this.selectedMonth = null;
        this.targets = {}; // channel targets from Firestore, keyed "YYYY-MM-ChannelName"
        this.segments = ['1. Enterprise', '2. Extra Large', '3. Large', '4. Medium', '5. Small', '6. Micro'];
        // Cohort CSV data keyed by month string e.g. "3/1/2026"
        this.cohortData = {}; // { "3/1/2026": { "1. Enterprise": { first, retained, resurrected, total }, ... }, totals: { first, retained, resurrected, total } }
        this.cohortMonths = []; // sorted list of month keys from CSV
        // Run rate state
        this.showRunRate = false;
        this.runRateDay = 22;
    }

    // Get days in month for a "YYYY-MM" string
    getDaysInMonth(monthStr) {
        const [year, month] = monthStr.split('-').map(Number);
        return new Date(year, month, 0).getDate();
    }

    // Calculate projected full-month value given actual-so-far and day of month
    calcRunRate(actual, dayOfMonth, daysInMonth) {
        if (!dayOfMonth || dayOfMonth <= 0) return null;
        const day = Math.min(dayOfMonth, daysInMonth);
        return actual * (daysInMonth / day);
    }

    // Wire up run-rate checkbox and day input (called once from render)
    initRunRateControls() {
        const checkbox  = document.getElementById('showRunRate');
        const inputsDiv = document.getElementById('runRateInputs');
        const dayInput  = document.getElementById('runRateDay');

        if (!checkbox) return;

        checkbox.checked = this.showRunRate;
        dayInput.value   = this.runRateDay;
        inputsDiv.style.display = this.showRunRate ? 'flex' : 'none';

        checkbox.addEventListener('change', () => {
            this.showRunRate = checkbox.checked;
            inputsDiv.style.display = this.showRunRate ? 'flex' : 'none';
            this.renderChart();
        });

        dayInput.addEventListener('input', () => {
            const v = parseInt(dayInput.value, 10);
            if (!isNaN(v) && v >= 1 && v <= 31) {
                this.runRateDay = v;
                this.renderChart();
            }
        });
    }

    formatNumber(num) {
        if (num === null || num === undefined || isNaN(num)) return '—';
        return num.toLocaleString('en-US', { maximumFractionDigits: 0 });
    }

    formatCurrency(num) {
        if (num === null || num === undefined || isNaN(num)) return '—';
        if (Math.abs(num) >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (Math.abs(num) >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toFixed(0);
    }

    formatCurrencyTHB(num) {
        if (num === null || num === undefined || isNaN(num)) return '—';
        return num.toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' THB';
    }

    formatMonthLabel(monthStr) {
        if (!monthStr) return '';
        const [year, month] = monthStr.split('-');
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                           'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${monthNames[parseInt(month) - 1]}-${year.slice(2)}`;
    }

    formatMonthFull(monthStr) {
        if (!monthStr) return '';
        const [year, month] = monthStr.split('-');
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                           'July', 'August', 'September', 'October', 'November', 'December'];
        return `${monthNames[parseInt(month) - 1]} ${year}`;
    }

    getMonthShortName(monthStr) {
        if (!monthStr) return '';
        const [year, month] = monthStr.split('-');
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                           'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return monthNames[parseInt(month) - 1];
    }

    getMonthDisplay(monthStr) {
        if (!monthStr) return '';
        const [year, month] = monthStr.split('-');
        return `${month}/${year}`;
    }

    // Load data from centralized store
    async loadData() {
        console.log('Loading performance recap data from central store...');
        
        if (!window.dashboardDataStore) {
            console.warn('Dashboard data store not available');
            return false;
        }

        const storeData = window.dashboardDataStore.getAllData();
        
        this.data.segment = storeData.segment;
        this.data.mlm = storeData.mlm;
        this.data.channel = storeData.channel;
        this.data.focusTeam = storeData.focusTeam;

        // Load cohort CSV from store and parse it
        if (storeData.cohortCsv && storeData.cohortCsv.text) {
            this.parseCohortCSV(storeData.cohortCsv.text);
        }

        console.log('Performance recap data loaded:', this.data);
        return this.data.mlm !== null || this.data.channel !== null;
    }

    // Load channel targets from Firestore (waits for targetsDB to be ready)
    async loadChannelTargets() {
        await new Promise(resolve => {
            const wait = () => {
                if (window.targetsDB) { resolve(); return; }
                setTimeout(wait, 100);
            };
            // Give up after 5 seconds so we don't hang forever
            setTimeout(resolve, 5000);
            wait();
        });

        if (!window.targetsDB) return;

        try {
            const result = await window.targetsDB.getAllTargets();
            if (result.success) {
                this.targets = {};
                result.targets
                    .filter(t => t.type === 'channel')
                    .forEach(t => {
                        this.targets[`${t.month}-${t.name}`] = t.value;
                    });
                console.log('Channel targets loaded for recap:', Object.keys(this.targets).length);
            }
        } catch (e) {
            console.warn('Could not load channel targets:', e);
        }
    }

    // Get total target for a month (sum across all channels)
    getMonthlyTarget(month) {
        const channels = ['Team Agent', 'IG', 'FD/AO'];
        const values = channels.map(ch => this.targets[`${month}-${ch}`] || 0);
        const total = values.reduce((a, b) => a + b, 0);
        return total > 0 ? total : null;
    }

    // Get available months from the data
    getAvailableMonths() {
        const months = new Set();
        
        if (this.data.mlm && this.data.mlm.months) {
            this.data.mlm.months.forEach(m => months.add(m));
        }
        if (this.data.channel && this.data.channel.months) {
            this.data.channel.months.forEach(m => months.add(m));
        }
        if (this.data.segment && this.data.segment.months) {
            this.data.segment.months.forEach(m => months.add(m));
        }
        
        return Array.from(months).sort();
    }

    // Calculate total GWP for a month
    calculateMonthlyGWP(month) {
        let total = 0;
        
        if (this.data.mlm && this.data.mlm.teams) {
            Object.keys(this.data.mlm.teams).forEach(team => {
                total += this.data.mlm.teams[team][month] || 0;
            });
        }
        else if (this.data.channel && this.data.channel.data) {
            if (this.data.channel.data[month]) {
                total = this.data.channel.data[month]['Total'] || 0;
            }
        }
        
        return total;
    }

    // Get last N months from available data
    getLastNMonths(n = 6) {
        const months = this.getAvailableMonths();
        return months.slice(-n);
    }

    // Populate month selector
    populateMonthSelector() {
        const select = document.getElementById('monthSelect');
        const months = this.getAvailableMonths();
        
        select.innerHTML = '';
        months.slice().reverse().forEach(month => {
            const option = document.createElement('option');
            option.value = month;
            option.textContent = this.formatMonthFull(month);
            select.appendChild(option);
        });
        
        if (months.length > 0) {
            const globalMonth = window.getEffectiveMonth ? window.getEffectiveMonth(months) : null;
            this.selectedMonth = (globalMonth && months.includes(globalMonth)) ? globalMonth : months[months.length - 1];
            select.value = this.selectedMonth;
        }
        
        select.addEventListener('change', (e) => {
            this.selectedMonth = e.target.value;
            this.updateDashboard();
        });
    }

    // Update title based on selected month
    updateTitle() {
        const title = document.getElementById('recapTitle');
        const monthName = this.getMonthShortName(this.selectedMonth);
        title.textContent = `${monthName} Performance Recap`;
    }

    // Render the GWP trend chart
    renderChart() {
        const ctx = document.getElementById('gwpChart').getContext('2d');
        const allMonths = this.getAvailableMonths().filter(m => m <= this.selectedMonth);
        const months = allMonths.slice(-6);
        
        if (this.chart) {
            this.chart.destroy();
        }

        // Use channel Total if available, otherwise fall back to calculated GWP
        const actualData = months.map(m => {
            if (this.data.channel && this.data.channel.data && this.data.channel.data[m]) {
                return this.data.channel.data[m]['Total'] || 0;
            }
            return this.calculateMonthlyGWP(m);
        });

        // Use real Firestore channel targets; null entries cause spanGaps to skip the point
        const targetData = months.map(m => this.getMonthlyTarget(m));

        const labels = months.map(m => this.formatMonthLabel(m));
        const selectedMonthIndex = months.indexOf(this.selectedMonth);

        // Run rate: replace the selected month's actual value with the projected run rate
        let runRateValue = null;
        if (this.showRunRate && selectedMonthIndex >= 0) {
            const daysInMonth = this.getDaysInMonth(this.selectedMonth);
            runRateValue = this.calcRunRate(actualData[selectedMonthIndex], this.runRateDay, daysInMonth);
            if (runRateValue !== null) {
                actualData[selectedMonthIndex] = runRateValue;
            }
            const projLabel = document.getElementById('runRateProjected');
            if (projLabel) projLabel.textContent = `→ projected ${this.formatCurrency(runRateValue)} MB`;
        } else {
            const projLabel = document.getElementById('runRateProjected');
            if (projLabel) projLabel.textContent = '';
        }

        // Growth uses whatever is in actualData (actual or run rate)
        let growthPercent = null;
        if (selectedMonthIndex > 0) {
            const current  = actualData[selectedMonthIndex];
            const previous = actualData[selectedMonthIndex - 1];
            if (previous > 0) growthPercent = ((current - previous) / previous) * 100;
        }

        const self = this;

        // Per-point styles: amber diamond for the run rate point, blue circle otherwise
        const ptRadius = months.map((_, i) =>
            (runRateValue !== null && i === selectedMonthIndex) ? 9 : 5);
        const ptStyle  = months.map((_, i) =>
            (runRateValue !== null && i === selectedMonthIndex) ? 'rectRot' : 'circle');
        const ptColor  = months.map((_, i) =>
            (runRateValue !== null && i === selectedMonthIndex) ? '#f59e0b' : '#3b82f6');

        const datasets = [
            {
                label: runRateValue !== null ? `GWP (run rate day ${this.runRateDay})` : 'Actual GWP',
                data: actualData,
                borderColor: '#3b82f6',
                backgroundColor: 'transparent',
                borderWidth: 2.5,
                fill: false,
                tension: 0.3,
                pointRadius: ptRadius,
                pointStyle: ptStyle,
                pointBackgroundColor: ptColor,
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointHoverRadius: ptRadius.map(r => r + 2)
            },
            {
                label: 'Target GWP',
                data: targetData,
                borderColor: '#22c55e',
                backgroundColor: 'transparent',
                borderWidth: 2,
                borderDash: [6, 4],
                fill: false,
                tension: 0.3,
                spanGaps: true,
                pointRadius: 4,
                pointBackgroundColor: '#22c55e',
                pointBorderColor: '#fff',
                pointBorderWidth: 1
            }
        ];

        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    padding: {
                        top: 30,
                        right: 15,
                        bottom: 10,
                        left: 10
                    }
                },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            usePointStyle: true,
                            padding: 20,
                            font: {
                                size: 12,
                                family: 'Google Sans Text'
                            },
                            generateLabels: function(chart) {
                                const items = Chart.defaults.plugins.legend.labels.generateLabels(chart);
                                if (runRateValue !== null) {
                                    items.push({
                                        text: `Run Rate (day ${self.runRateDay})`,
                                        fillStyle: '#f59e0b',
                                        strokeStyle: '#fff',
                                        lineWidth: 2,
                                        pointStyle: 'rectRot',
                                        hidden: false
                                    });
                                }
                                return items;
                            }
                        }
                    },
                    tooltip: {
                        backgroundColor: '#1e293b',
                        padding: 12,
                        titleFont: { size: 13, weight: '600' },
                        bodyFont: { size: 12 },
                        callbacks: {
                            label: function(context) {
                                const value = context.parsed.y;
                                return `${context.dataset.label}: ${self.formatCurrency(value)} MB`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { 
                            font: { family: 'Google Sans Text', size: 11 }, 
                            color: '#64748b',
                            padding: 8
                        }
                    },
                    y: {
                        grid: { color: '#f1f5f9' },
                        ticks: {
                            font: { family: 'Google Sans Text', size: 11 },
                            color: '#64748b',
                            padding: 8,
                            callback: function(value) {
                                if (value >= 1000000) return (value / 1000000).toFixed(0) + ' MB';
                                if (value >= 1000) return (value / 1000).toFixed(0) + 'K';
                                return value;
                            }
                        }
                    }
                },
                interaction: { intersect: false, mode: 'index' }
            },
            plugins: [{
                id: 'customLabels',
                afterDraw: function(chart) {
                    const ctx = chart.ctx;
                    const meta = chart.getDatasetMeta(0);

                    // Draw arrow FIRST so value labels render on top of it
                    if (growthPercent !== null && selectedMonthIndex > 0) {
                        const currentPoint  = meta.data[selectedMonthIndex];
                        const previousPoint = meta.data[selectedMonthIndex - 1];

                        if (currentPoint && previousPoint) {
                            const midX  = (currentPoint.x + previousPoint.x) / 2;
                            const topY  = Math.min(currentPoint.y, previousPoint.y) - 38;

                            // Arrow tip stops 30px above the current dot (clear of the label)
                            const endX  = currentPoint.x;
                            const endY  = currentPoint.y - 30;
                            const ctrlX = midX;
                            const ctrlY = topY + 14;

                            ctx.save();

                            // Growth label
                            ctx.fillStyle = '#dc2626';
                            ctx.font = 'bold 12px "Google Sans Text"';
                            ctx.textAlign = 'center';
                            ctx.fillText(`${growthPercent.toFixed(0)}% growth`, midX, topY);

                            // Curve
                            ctx.strokeStyle = '#dc2626';
                            ctx.lineWidth = 1.5;
                            ctx.beginPath();
                            ctx.moveTo(previousPoint.x + 15, previousPoint.y - 8);
                            ctx.quadraticCurveTo(ctrlX, ctrlY, endX, endY);
                            ctx.stroke();

                            // Arrowhead aligned to the curve's tangent at the endpoint
                            const angle   = Math.atan2(endY - ctrlY, endX - ctrlX);
                            const headLen = 10;
                            ctx.beginPath();
                            ctx.moveTo(endX, endY);
                            ctx.lineTo(
                                endX - headLen * Math.cos(angle - Math.PI / 6),
                                endY - headLen * Math.sin(angle - Math.PI / 6)
                            );
                            ctx.lineTo(
                                endX - headLen * Math.cos(angle + Math.PI / 6),
                                endY - headLen * Math.sin(angle + Math.PI / 6)
                            );
                            ctx.closePath();
                            ctx.fillStyle = '#dc2626';
                            ctx.fill();

                            ctx.restore();
                        }
                    }

                    // Draw value labels LAST so they always appear on top
                    meta.data.forEach((point, index) => {
                        const value = actualData[index];
                        const x = point.x;
                        const y = point.y;
                        const isRunRate = runRateValue !== null && index === selectedMonthIndex;
                        const suffix = isRunRate ? ' MB ✦' : ' MB';
                        const text = self.formatCurrency(value) + suffix;

                        ctx.save();
                        ctx.font = 'bold 10px "Google Sans Text"';
                        ctx.textAlign = 'center';

                        // White knockout behind text so it's readable over any line/arrow
                        const tw = ctx.measureText(text).width;
                        ctx.fillStyle = 'rgba(255,255,255,0.85)';
                        ctx.fillRect(x - tw / 2 - 2, y - 24, tw + 4, 13);

                        ctx.fillStyle = isRunRate ? '#b45309' : '#1e293b';
                        ctx.fillText(text, x, y - 13);
                        ctx.restore();
                    });
                }
            }]
        });
    }

    // -----------------------------------------------------------------------
    // COHORT CSV PARSING
    // -----------------------------------------------------------------------

    // Parse the MoM cohort CSV and store into this.cohortData
    parseCohortCSV(csvText) {
        const lines = csvText.trim().split('\n');
        if (lines.length < 2) return;

        // Parse a single CSV line handling quoted fields
        const parseLine = (line) => {
            const values = [];
            let cur = '', inQ = false;
            for (const ch of line) {
                if (ch === '"') { inQ = !inQ; }
                else if (ch === ',' && !inQ) { values.push(cur.trim()); cur = ''; }
                else { cur += ch; }
            }
            values.push(cur.trim());
            return values;
        };

        const header = parseLine(lines[0]);
        const normalizedHeader = header.map(h => h.toLowerCase().trim());
        // Supports both:
        // Wide: Month, gwp_segment, "2. First Transacting Agent", "3. Retained Agent", "5. Resurrected Agent", "Row totals"
        // Long: Month, gwp_segment, cohort/type, value, unit
        const colMonth = header.findIndex(h => h.toLowerCase().includes('month'));
        const colSeg   = header.findIndex(h => h.toLowerCase().includes('gwp_segment') || h.toLowerCase().includes('segment'));
        const colFirst = header.findIndex(h => h.includes('First'));
        const colRet   = header.findIndex(h => h.includes('Retained'));
        const colRes   = header.findIndex(h => h.includes('Resurrect'));
        const colTotal = header.findIndex(h => h.toLowerCase().includes('row total') || h.toLowerCase() === 'row totals');
        const colCohort = header.findIndex(h => /cohort|agent|type|category|status/i.test(h) && h !== header[colSeg]);
        const colValue = normalizedHeader.findIndex((h, idx) =>
            idx !== colMonth &&
            idx !== colSeg &&
            idx !== colCohort &&
            (
                ['value', 'amount', 'gwp', 'net_premium', 'premium'].includes(h) ||
                h.includes('value') ||
                h.includes('amount') ||
                h.includes('gwp') ||
                h.includes('diff') ||
                h.includes('sum')
            )
        );
        const colUnit = normalizedHeader.findIndex(h => h === 'unit' || h.includes('unit'));
        const isLongFormat = colMonth >= 0 && colSeg >= 0 && colCohort >= 0 && colValue >= 0 &&
            (colFirst < 0 || colRet < 0 || colRes < 0);

        // Helper: parse "2.6 MB" or value + unit columns into THB
        const parseValue = (val, unit = '') => {
            if (!val || val.trim() === '' || val.trim() === 'NaN') return 0;
            const raw = String(val).trim();
            const unitText = `${unit || ''} ${raw}`.toLowerCase();
            const num = parseFloat(raw.replace(/[^0-9.\-]/g, ''));
            if (isNaN(num)) return 0;
            if (unitText.includes('mb') || unitText.includes('million')) return num * 1000000;
            if (unitText.includes('k')) return num * 1000;
            return num;
        };

        const normalizeMonthKey = (monthRaw) => {
            const raw = String(monthRaw || '').trim();
            if (!raw) return null;

            const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
            if (dmy) return `${parseInt(dmy[1], 10)}/1/${dmy[3]}`;

            const ymd = raw.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/);
            if (ymd) return `${parseInt(ymd[2], 10)}/1/${ymd[1]}`;

            const parsed = new Date(raw);
            if (!isNaN(parsed)) return `${parsed.getMonth() + 1}/1/${parsed.getFullYear()}`;

            return raw;
        };

        const metricKey = (label) => {
            const text = String(label || '').toLowerCase();
            if (text.includes('first')) return 'first';
            if (text.includes('retain')) return 'retained';
            if (text.includes('resurrect')) return 'resurrected';
            if (text.includes('total')) return 'total';
            return null;
        };

        this.cohortData = {};
        this.cohortMonths = [];

        if (isLongFormat) {
            for (let i = 1; i < lines.length; i++) {
                const vals = parseLine(lines[i]);
                const monthKey = normalizeMonthKey(vals[colMonth]);
                const segRaw = vals[colSeg]?.trim();
                const metric = metricKey(vals[colCohort]);
                if (!monthKey || !segRaw || !metric) continue;

                if (!this.cohortData[monthKey]) {
                    this.cohortData[monthKey] = {};
                    this.cohortMonths.push(monthKey);
                }
                if (!this.cohortData[monthKey][segRaw]) {
                    this.cohortData[monthKey][segRaw] = { first: 0, retained: 0, resurrected: 0, total: 0 };
                }

                const value = parseValue(vals[colValue], colUnit >= 0 ? vals[colUnit] : '');
                this.cohortData[monthKey][segRaw][metric] += value;
                if (metric !== 'total') {
                    this.cohortData[monthKey][segRaw].total += value;
                }
            }

            Object.keys(this.cohortData).forEach(monthKey => {
                const totals = { first: 0, retained: 0, resurrected: 0, total: 0 };
                Object.keys(this.cohortData[monthKey]).forEach(segment => {
                    const row = this.cohortData[monthKey][segment];
                    totals.first += row.first || 0;
                    totals.retained += row.retained || 0;
                    totals.resurrected += row.resurrected || 0;
                    totals.total += row.total || 0;
                });
                this.cohortData[monthKey].__totals = totals;
            });

            this.cohortMonths = Array.from(new Set(this.cohortMonths)).sort((a, b) => new Date(a) - new Date(b));
            console.log('Long-format cohort data parsed for months:', this.cohortMonths);
            return;
        }

        for (let i = 1; i < lines.length; i++) {
            const vals = parseLine(lines[i]);
            if (!vals[colMonth]) continue;

            const monthRaw = vals[colMonth].trim();
            const segRaw   = colSeg >= 0 ? vals[colSeg]?.trim() : '';

            // Skip grand totals row
            if (monthRaw.toLowerCase().includes('grand')) continue;

            const isTotal = monthRaw.toLowerCase().startsWith('totals for');

            if (isTotal) {
                // Extract the actual month from "Totals for 3/1/2026"
                const mKey = monthRaw.replace(/totals for /i, '').trim();
                if (this.cohortData[mKey]) {
                    this.cohortData[mKey].__totals = {
                        first:       parseValue(vals[colFirst]),
                        retained:    parseValue(vals[colRet]),
                        resurrected: parseValue(vals[colRes]),
                        total:       parseValue(vals[colTotal])
                    };
                }
                continue;
            }

            if (!this.cohortData[monthRaw]) {
                this.cohortData[monthRaw] = {};
                this.cohortMonths.push(monthRaw);
            }

            if (segRaw) {
                this.cohortData[monthRaw][segRaw] = {
                    first:       parseValue(vals[colFirst]),
                    retained:    parseValue(vals[colRet]),
                    resurrected: parseValue(vals[colRes]),
                    total:       parseValue(vals[colTotal])
                };
            }
        }

        // Sort cohortMonths chronologically (format M/D/YYYY)
        this.cohortMonths.sort((a, b) => new Date(a) - new Date(b));

        console.log('Cohort data parsed for months:', this.cohortMonths);
    }

    // Convert selected dashboard month "YYYY-MM" → CSV month key "M/1/YYYY"
    selectedMonthToCohortKey(monthStr) {
        if (!monthStr) return null;
        const [year, month] = monthStr.split('-');
        return `${parseInt(month)}/1/${year}`;
    }

    // -----------------------------------------------------------------------
    // COHORT DATA FOR TABLE — uses real CSV data when available
    // -----------------------------------------------------------------------

    // Generate cohort/segment data for the table
    generateCohortSegmentData() {
        const months = this.getAvailableMonths();
        const selectedIndex = months.indexOf(this.selectedMonth);

        if (selectedIndex < 1) return null;

        const currentMonth  = this.selectedMonth;
        const currentTotal  = this.calculateMonthlyGWP(currentMonth);
        const previousMonth = months[selectedIndex - 1];
        const previousTotal = this.calculateMonthlyGWP(previousMonth);
        const totalChange   = currentTotal - previousTotal;

        // Try to look up real cohort CSV data for the selected month
        const cohortKey = this.selectedMonthToCohortKey(currentMonth);
        const realMonthData = cohortKey ? this.cohortData[cohortKey] : null;

        const data = {};

        if (realMonthData) {
            // Use real data from uploaded CSV
            this.segments.forEach(segment => {
                const row = realMonthData[segment];
                if (row) {
                    data[segment] = { ...row };
                } else {
                    data[segment] = { first: 0, retained: 0, resurrected: 0, total: 0 };
                }
            });

            // Use real totals from CSV if available
            const realTotals = realMonthData.__totals || null;
            const grandFirst       = realTotals ? realTotals.first       : this.segments.reduce((s, seg) => s + (data[seg]?.first || 0), 0);
            const grandRetained    = realTotals ? realTotals.retained    : this.segments.reduce((s, seg) => s + (data[seg]?.retained || 0), 0);
            const grandResurrected = realTotals ? realTotals.resurrected : this.segments.reduce((s, seg) => s + (data[seg]?.resurrected || 0), 0);
            const grandTotal       = realTotals ? realTotals.total       : this.segments.reduce((s, seg) => s + (data[seg]?.total || 0), 0);

            return {
                data,
                currentMonth,
                totalChange: grandTotal, // use CSV total for title
                grandTotals: { first: grandFirst, retained: grandRetained, resurrected: grandResurrected, total: grandTotal },
                isRealData: true
            };
        }

        // Fallback: estimated breakdown (no CSV uploaded or no matching month)
        const segmentWeights = {
            '1. Enterprise': 0.05, '2. Extra Large': 0.18, '3. Large': 0.28,
            '4. Medium': 0.12,     '5. Small': 0.22,       '6. Micro': 0.15
        };

        this.segments.forEach(segment => {
            const segmentShare = totalChange * segmentWeights[segment];
            const firstVal       = segmentShare * (Math.random() * 0.3 - 0.15);
            const retainedVal    = segmentShare * (0.7 + Math.random() * 0.3);
            const resurrectedVal = segmentShare - firstVal - retainedVal;
            data[segment] = { first: firstVal, retained: retainedVal, resurrected: resurrectedVal, total: firstVal + retainedVal + resurrectedVal };
        });

        return { data, currentMonth, totalChange, isRealData: false };
    }

    // Render the cohort/segment breakdown table
    renderTable() {
        const thead = document.getElementById('recapTableHead');
        const tbody = document.getElementById('recapTableBody');
        const tableTitle = document.getElementById('tableTitle');
        
        const cohortData = this.generateCohortSegmentData();
        
        if (!cohortData) {
            tableTitle.textContent = 'Insufficient data for MoM analysis';
            thead.innerHTML = '';
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: #64748b;">Need at least 2 months of data</td></tr>';
            return;
        }
        
        const badge = cohortData.isRealData
            ? '<span style="font-size:0.7rem;font-weight:600;background:#dcfce7;color:#16a34a;border-radius:4px;padding:2px 7px;margin-left:8px;vertical-align:middle;">✓ CSV Data</span>'
            : '<span style="font-size:0.7rem;font-weight:600;background:#fef3c7;color:#92400e;border-radius:4px;padding:2px 7px;margin-left:8px;vertical-align:middle;">⚠ Estimated</span>';

        tableTitle.innerHTML = `Identifying MoM growth without seasonality ${this.formatCurrency(cohortData.totalChange)} THB by Cohort and Segment${badge}`;
        
        // Build header
        thead.innerHTML = `
            <tr>
                <th style="width: 70px;">Month</th>
                <th style="width: 100px;">gwp_segment</th>
                <th class="col-first">2. First Transacting Agent</th>
                <th class="col-retained">3. Retained Agent</th>
                <th class="col-resurrected">5. Resurrected Agent</th>
                <th>Row totals</th>
            </tr>
        `;
        
        // Build body
        let html = '';
        let grandTotal = cohortData.grandTotals || { first: 0, retained: 0, resurrected: 0, total: 0 };

        // If no pre-computed grandTotals, sum from segment data
        if (!cohortData.grandTotals) {
            this.segments.forEach(segment => {
                const s = cohortData.data[segment];
                grandTotal.first       += s.first;
                grandTotal.retained    += s.retained;
                grandTotal.resurrected += s.resurrected;
                grandTotal.total       += s.total;
            });
        }
        
        const monthDisplay = this.getMonthDisplay(this.selectedMonth);
        
        this.segments.forEach((segment, idx) => {
            const segData = cohortData.data[segment];
            
            html += `
                <tr>
                    ${idx === 0 ? `<td rowspan="${this.segments.length}" class="month-cell">${monthDisplay}</td>` : ''}
                    <td class="segment-name">${segment}</td>
                    <td class="col-first ${segData.first < 0 ? 'negative' : 'positive'}">${this.formatCurrencyTHB(segData.first)}</td>
                    <td class="col-retained ${segData.retained < 0 ? 'negative' : 'positive'}">${this.formatCurrencyTHB(segData.retained)}</td>
                    <td class="col-resurrected ${segData.resurrected < 0 ? 'negative' : 'positive'}">${this.formatCurrencyTHB(segData.resurrected)}</td>
                    <td class="${segData.total < 0 ? 'negative' : ''}">${this.formatCurrencyTHB(segData.total)}</td>
                </tr>
            `;
        });
        
        // Totals row
        html += `
            <tr class="total-row">
                <td class="month-cell">Totals for ${monthDisplay}</td>
                <td></td>
                <td class="col-first ${grandTotal.first < 0 ? 'negative' : 'positive'}">${this.formatCurrencyTHB(grandTotal.first)}</td>
                <td class="col-retained ${grandTotal.retained < 0 ? 'negative' : 'positive'}">${this.formatCurrencyTHB(grandTotal.retained)}</td>
                <td class="col-resurrected ${grandTotal.resurrected < 0 ? 'negative' : 'positive'}">${this.formatCurrencyTHB(grandTotal.resurrected)}</td>
                <td><strong>${this.formatCurrencyTHB(grandTotal.total)}</strong></td>
            </tr>
        `;
        
        tbody.innerHTML = html;
    }

    // Generate insights based on data
    generateInsights() {
        const months = this.getAvailableMonths();
        const selectedIndex = months.indexOf(this.selectedMonth);
        
        if (selectedIndex < 1) {
            document.getElementById('insight1').innerHTML = 'Need at least 2 months of data to generate insights.';
            document.getElementById('insight2').innerHTML = '';
            return;
        }
        
        const currentMonth = this.selectedMonth;
        const previousMonth = months[selectedIndex - 1];
        
        const currentTotal = this.calculateMonthlyGWP(currentMonth);
        const previousTotal = this.calculateMonthlyGWP(previousMonth);
        const totalChange = currentTotal - previousTotal;

        // Try to get real cohort totals
        const cohortKey = this.selectedMonthToCohortKey(currentMonth);
        const realMonthData = cohortKey ? this.cohortData[cohortKey] : null;
        const realTotals = realMonthData?.__totals;

        // Use real data if available for the total MoM change display
        const displayChange = realTotals ? realTotals.total : totalChange;
        const retainedVal   = realTotals ? realTotals.retained    : totalChange * 0.52;
        const firstVal      = realTotals ? realTotals.first       : totalChange * 0.10;
        const resurrectedVal= realTotals ? realTotals.resurrected : totalChange * 0.38;
        
        const isPositive = displayChange >= 0;
        const changeWord = isPositive ? 'increased' : 'decreased';
        const changeClass = isPositive ? 'highlight-green' : 'highlight-orange';

        // Largest segment contribution (from real data if available)
        let largeSegContrib = Math.abs(displayChange) * 0.52;
        if (realMonthData) {
            const largeSegs = ['1. Enterprise', '2. Extra Large', '3. Large'];
            largeSegContrib = largeSegs.reduce((sum, seg) => {
                return sum + Math.abs(realMonthData[seg]?.total || 0);
            }, 0);
        }
        
        // Insight 1
        const insight1 = `Agency MoM GWP ${changeWord} by <span class="${changeClass}">${this.formatCurrency(Math.abs(displayChange))} THB</span>, primarily driven by the <strong>retention cohort</strong>` +
            (realTotals ? ` (${this.formatCurrency(Math.abs(retainedVal))} THB)` : '') +
            `. Notably, agents in <strong>above the large segment (monthly GWP above 180K THB)</strong> accounted for over 50% of the total growth, contributing approx <span class="${changeClass}">${this.formatCurrency(largeSegContrib)} THB</span>.`;
        
        // Insight 2
        const igGrowth  = Math.abs(displayChange) * 0.52;
        const mlmGrowth = Math.abs(displayChange) * 0.48;
        const insight2 = `From further investigation, This growth is driven by two main components:<br>
        <span class="${changeClass}">IG growth: THB ${this.formatCurrency(igGrowth)}</span>, primarily from higher TPB volumes and improved AXA commission rates.<br>
        <span class="${changeClass}">MLM and FD/AO growth: THB ${this.formatCurrency(mlmGrowth)}</span>, largely driven by focus team movements, with a strong contribution from above the large agents redeemed incentive trip to Austria.`;
        
        document.getElementById('insight1').innerHTML = insight1;
        document.getElementById('insight2').innerHTML = insight2;
    }

    // Update all dashboard components
    updateDashboard() {
        this.updateTitle();
        this.renderChart();
        this.renderTable();
        this.generateInsights();
    }

    async render() {
        const hasData = await this.loadData();

        if (!hasData) {
            document.getElementById('noDataSection').style.display = 'flex';
            document.getElementById('dashboardContent').style.display = 'none';
            return;
        }

        document.getElementById('noDataSection').style.display = 'none';
        document.getElementById('dashboardContent').style.display = 'block';

        // Load targets before rendering chart
        await this.loadChannelTargets();

        this.populateMonthSelector();
        this.initRunRateControls();
        this.updateDashboard();
    }
}

// ============================================================================
// COHORT CSV UPLOAD HANDLER
// ============================================================================

function initCohortUpload() {
    const fileInput  = document.getElementById('cohortFileInput');
    const uploadZone = document.getElementById('cohortUploadZone');
    if (!fileInput || !uploadZone) return;

    const handleFile = (file) => {
        if (!file || !file.name.endsWith('.csv')) {
            alert('Please upload a valid CSV file.');
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                performanceRecap.parseCohortCSV(e.target.result);

                // Update UI to show success
                uploadZone.classList.add('uploaded');
                document.getElementById('cohortUploadIcon').textContent = '✓';
                document.getElementById('cohortUploadIcon').classList.add('success');
                document.getElementById('cohortUploadTitle').textContent = 'Cohort CSV Loaded';
                document.getElementById('cohortUploadSub').textContent = file.name;
                const btn = document.getElementById('cohortUploadBtn');
                btn.textContent = 'Replace';
                btn.classList.remove('clear-btn');
                btn.onclick = (ev) => { ev.stopPropagation(); fileInput.click(); };
                // Make zone non-clickable for open (replace button handles it)
                uploadZone.onclick = null;

                // Re-render table with real data
                performanceRecap.renderTable();
                performanceRecap.generateInsights();

                console.log('Cohort CSV loaded successfully');
            } catch (err) {
                console.error('Error parsing cohort CSV:', err);
                alert('Error reading CSV file. Please check the format.');
            }
        };
        reader.readAsText(file);
    };

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) handleFile(e.target.files[0]);
    });

    // Drag and drop
    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('drag-over');
    });
    uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
    });
}

// ============================================================================
// INITIALIZATION
// ============================================================================

// Check if loaded in iframe and hide header
if (window.self !== window.top) {
    const header = document.getElementById('dashboardHeader');
    if (header) {
        header.style.display = 'none';
    }
}

const performanceRecap = new PerformanceRecap();

// Listen for data updates
window.addEventListener('dashboardDataUpdated', async (event) => {
    console.log('Dashboard data updated, refreshing Performance Recap...');
    await performanceRecap.render();
});

// Listen for month changes from parent frame
window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'monthChange') {
        const month = event.data.month;
        const months = performanceRecap.getAvailableMonths ? performanceRecap.getAvailableMonths() : [];
        if (month && months.includes(month)) {
            performanceRecap.selectedMonth = month;
            const select = document.getElementById('monthSelect');
            if (select) select.value = month;
            performanceRecap.updateDashboard();
        }
    }
});

// Initialize when page loads
window.addEventListener('DOMContentLoaded', async () => {
    console.log('Performance Recap Dashboard loading...');
    
    function showLoadingBar() {
        var b = document.getElementById('loadingBar');
        if (b) b.classList.add('active');
    }
    function hideLoadingBar() {
        var b = document.getElementById('loadingBar');
        if (b) b.classList.remove('active');
    }

    function checkDataStore() {
        if (!window.dashboardDataStore) {
            console.log('Waiting for data store...');
            setTimeout(checkDataStore, 100);
            return;
        }

        var storeData = window.dashboardDataStore.getAllData();
        if (!storeData.cohortCsv || !storeData.cohortCsv.text) {
            console.log('No cohort CSV in storage — fetching from Google Sheets...');
            var SHEET_ID = '1M51L7xRu_Y8MRO5ziDVZ4pbWtqi0Mxb1-oJ6WyfwKU0';
            var GID = '374336501';
            var url = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/export?format=csv&gid=' + GID;
            showLoadingBar();
            fetch(url)
                .then(function(r) { return r.text(); })
                .then(function(csv) {
                    window.dashboardDataStore.updateCohortCsvData(csv);
                    hideLoadingBar();
                    performanceRecap.render();
                    console.log('Cohort CSV fetched and recap rendered from Google Sheets');
                })
                .catch(function(err) {
                    hideLoadingBar();
                    console.error('Failed to fetch cohort CSV:', err);
                    performanceRecap.render();
                });
        } else {
            performanceRecap.render();
        }
        console.log('Performance Recap Dashboard ready');
    }

    checkDataStore();
});
