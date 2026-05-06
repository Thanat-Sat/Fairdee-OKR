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

        this.renderChart();
        this.renderTable();

        document.getElementById('noDataSection').style.display = 'none';
        document.getElementById('dashboardContent').style.display = 'block';
    }

    renderChart() {
        const ctx = document.getElementById('trendChart').getContext('2d');
        
        if (this.chart) {
            this.chart.destroy();
        }

        const chartData = this.dataProcessor.getChartData();

        this.chart = new Chart(ctx, {
            type: 'line',
            data: chartData,
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

    renderTable() {
        const months = this.dataProcessor.getLastNMonths(7);
        const channels = ['Team Agent', 'IG', 'FD/AO'];
        const channelColors = { 'Team Agent': '#6366F1', 'IG': '#EC4899', 'FD/AO': '#10B981' };

        const thead = document.getElementById('channelTableHead');
        const tbody = document.getElementById('channelTableBody');
        if (!thead || !tbody) return;

        const headerStyle = 'padding: 0.625rem 1rem; text-align: left; font-size: 0.75rem; font-weight: 600; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #E8ECF0; white-space: nowrap;';
        const cellStyle = 'padding: 0.75rem 1rem; border-bottom: 1px solid #F1F5F9; vertical-align: middle;';
        const monoStyle = 'font-family: "Google Sans Text", monospace; font-size: 0.8125rem;';

        // Build header
        let headerRow = `<tr>
            <th style="${headerStyle}">Month</th>`;
        for (const ch of channels) {
            headerRow += `<th style="${headerStyle} color: ${channelColors[ch]};">${ch}</th>`;
        }
        headerRow += `<th style="${headerStyle}">Total</th><th style="${headerStyle}">MoM %</th></tr>`;
        thead.innerHTML = headerRow;

        // Build rows
        let rows = '';
        months.forEach((month, idx) => {
            const data = this.dataProcessor.monthlyData[month];
            if (!data) return;

            const prevMonth = idx > 0 ? months[idx - 1] : null;
            const prevData = prevMonth ? this.dataProcessor.monthlyData[prevMonth] : null;
            const total = data['Total'] || (data['Team Agent'] + data['IG'] + data['FD/AO']);
            const prevTotal = prevData ? (prevData['Total'] || (prevData['Team Agent'] + prevData['IG'] + prevData['FD/AO'])) : null;
            const mom = this.dataProcessor.calculateMoMGrowth(total, prevTotal);

            const rowBg = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';

            let row = `<tr style="background: ${rowBg};">
                <td style="${cellStyle} font-weight: 600; color: #0A0E27;">${this.dataProcessor.formatMonthLabel(month)}</td>`;

            for (const ch of channels) {
                const val = data[ch] || 0;
                const target = this.dataProcessor.getTarget(month, ch);
                const targetPct = target ? ((val / target) * 100).toFixed(1) : null;
                const color = channelColors[ch];
                row += `<td style="${cellStyle}">
                    <div style="${monoStyle} color: #0A0E27;">${this.formatNumber(val)}</div>
                    ${target ? `<div style="font-size: 0.7rem; color: #94A3B8; margin-top: 2px;">vs ${this.formatNumber(target)} (${targetPct}%)</div>` : ''}
                </td>`;
            }

            const momColor = mom === null ? '#94A3B8' : mom > 0 ? '#10B981' : mom < 0 ? '#EF4444' : '#94A3B8';
            const momSign = mom !== null && mom > 0 ? '+' : '';
            row += `<td style="${cellStyle} ${monoStyle} font-weight: 600; color: #0A0E27;">${this.formatNumber(total)}</td>
                <td style="${cellStyle} ${monoStyle} font-weight: 600; color: ${momColor};">${mom !== null ? momSign + mom.toFixed(1) + '%' : '—'}</td>
            </tr>`;
            rows += row;
        });

        tbody.innerHTML = rows;
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
        
        const allData = window.dashboardDataStore.getAllData();
        
        if (allData.channel && allData.channel.data && allData.channel.months) {
            console.log('✓ Loading channel data from storage');
            
            // Load data into processor
            dataProcessor.monthlyData = allData.channel.data;
            
            // Load targets
            dataProcessor.loadTargets().then(() => {
                // Render the dashboard
                dashboardUI.render();
                console.log('✓ Channel dashboard rendered with stored data');
            });
        } else {
            console.log('No channel data in storage — fetching from Google Sheets...');
            fetchChannelSheetData();
        }
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
