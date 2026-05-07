window.addEventListener('load', function() {
    if (typeof Chart !== 'undefined') {
        Chart.defaults.font.family = "'Google Sans Text', sans-serif";
    }
});

// ============================================================================
// RENEWAL RATE DATA PROCESSING MODULE
// ============================================================================

class RenewalDataProcessor {
    constructor() {
        this.rawData = [];
        this.channelData = {};
        this.months = [];
        this.channels = {
            'mlm_agent': 'MLM Agent',
            'direct_agent': 'Direct Agent',
            'ao_agent': 'AO Agent',
            'inspection_garage': 'Inspection Garage',
            'corporate_non_eb': 'Corporate Non-EB'
        };
    }

    parseCSV(csvText) {
        const lines = csvText.trim().split('\n');
        const data = [];
        
        // Skip header line (line 0)
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const values = this.parseCSVLine(line);
            if (values.length >= 3) {
                const month = this.parseMonth(values[0]);
                const channel = values[1].trim();
                const rate = this.parsePercentage(values[2]);
                
                if (month && channel && rate !== null) {
                    data.push({
                        month,
                        channel,
                        rate
                    });
                }
            }
        }
        
        this.rawData = data;
        return data;
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

    parseMonth(monthStr) {
        // Format: "January, 2025" -> "2025-01"
        const parts = monthStr.replace(/"/g, '').split(',');
        if (parts.length !== 2) return null;
        
        const monthName = parts[0].trim();
        const year = parts[1].trim();
        
        const monthMap = {
            'January': '01', 'February': '02', 'March': '03', 'April': '04',
            'May': '05', 'June': '06', 'July': '07', 'August': '08',
            'September': '09', 'October': '10', 'November': '11', 'December': '12'
        };
        
        const monthNum = monthMap[monthName];
        if (!monthNum) return null;
        
        return `${year}-${monthNum}`;
    }

    formatMonthLabel(monthStr) {
        const [year, month] = monthStr.split('-');
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                           'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${monthNames[parseInt(month) - 1]} ${year}`;
    }

    parsePercentage(value) {
        // Remove % sign and convert to number
        const cleanValue = value.replace('%', '').trim();
        const num = parseFloat(cleanValue);
        return isNaN(num) ? null : num;
    }

    processData(csvText) {
        const data = this.parseCSV(csvText);
        
        // Get unique months and sort them
        const monthSet = new Set();
        data.forEach(row => monthSet.add(row.month));
        this.months = Array.from(monthSet).sort();
        
        // Organize data by channel
        this.channelData = {};
        Object.keys(this.channels).forEach(channel => {
            this.channelData[channel] = {};
        });
        
        data.forEach(row => {
            if (this.channelData[row.channel]) {
                this.channelData[row.channel][row.month] = row.rate;
            }
        });
        
        // Update centralized data store
        if (window.dashboardDataStore) {
            window.dashboardDataStore.updateRenewalData(this.channelData, this.months);
            console.log("Renewal data saved to central store");
        }

        return this.channelData;
    }

    getLatestMonth() {
        return this.months[this.months.length - 1];
    }

    getPreviousMonth() {
        return this.months[this.months.length - 2];
    }

    getChannelRate(channel, month) {
        return this.channelData[channel]?.[month] ?? null;
    }

    getLatestRate(channel) {
        const latestMonth = this.getLatestMonth();
        return this.getChannelRate(channel, latestMonth);
    }

    getPreviousRate(channel) {
        const prevMonth = this.getPreviousMonth();
        return this.getChannelRate(channel, prevMonth);
    }

    calculateChange(channel) {
        const latest = this.getLatestRate(channel);
        const previous = this.getPreviousRate(channel);
        
        if (latest === null || previous === null || previous === 0) {
            return null;
        }
        
        return latest - previous;
    }

    getLastNMonths(n = 12) {
        if (this.months.length === 0) return [];
        const effective = window.getEffectiveMonth ? window.getEffectiveMonth(this.months) : this.months[this.months.length - 1];
        const idx = effective ? this.months.indexOf(effective) : this.months.length - 1;
        const end = idx < 0 ? this.months.length : idx + 1;
        return this.months.slice(Math.max(0, end - n), end);
    }
}

// ============================================================================
// UI MODULE - RENEWAL RATE
// ============================================================================

class RenewalUI {
    constructor(dataProcessor) {
        this.dataProcessor = dataProcessor;
        this.chart = null;
    }

    formatPercentage(num, decimals = 2) {
        if (num === null || isNaN(num)) return '—';
        return num.toFixed(decimals) + '%';
    }

    getChangeClass(num) {
        if (num === null) return 'neutral';
        if (num > 0) return 'positive';
        if (num < 0) return 'negative';
        return 'neutral';
    }

    render() {
        if (this.dataProcessor.months.length === 0) {
            console.log('No data to render');
            document.getElementById('noDataSection').style.display = 'flex';
            document.getElementById('dashboardContent').style.display = 'none';
            return;
        }

        this.renderKPIs();
        this.renderChart();
        this.renderTable();

        document.getElementById('noDataSection').style.display = 'none';
        document.getElementById('dashboardContent').style.display = 'block';
    }

    renderKPIs() {
        const channels = ['mlm_agent', 'direct_agent', 'ao_agent', 'inspection_garage'];
        const elementIds = ['mlm', 'direct', 'ao', 'ig'];
        
        channels.forEach((channel, index) => {
            const rate = this.dataProcessor.getLatestRate(channel);
            const change = this.dataProcessor.calculateChange(channel);
            const changeClass = this.getChangeClass(change);
            
            // Update rate
            const rateElement = document.getElementById(`${elementIds[index]}Rate`);
            if (rateElement) {
                rateElement.textContent = this.formatPercentage(rate);
            }
            
            // Update change
            const changeElement = document.getElementById(`${elementIds[index]}Change`);
            if (changeElement) {
                const badge = changeElement.querySelector('.change-badge');
                if (badge) {
                    badge.className = `change-badge ${changeClass}`;
                    const arrow = change > 0 ? '↑' : change < 0 ? '↓' : '';
                    badge.textContent = `${arrow} ${this.formatPercentage(Math.abs(change))} vs prev month`;
                }
            }
        });
    }

    renderChart() {
        const ctx = document.getElementById('renewalChart');
        if (!ctx) return;

        const lastTwelveMonths = this.dataProcessor.getLastNMonths(12);
        const labels = lastTwelveMonths.map(month => this.dataProcessor.formatMonthLabel(month));

        const datasets = [
            {
                label: 'MLM Agent',
                data: lastTwelveMonths.map(month => this.dataProcessor.getChannelRate('mlm_agent', month)),
                borderColor: '#FF6B35',
                backgroundColor: 'rgba(255, 107, 53, 0.1)',
                borderWidth: 2.5,
                tension: 0.4,
                pointRadius: 4,
                pointHoverRadius: 6
            },
            {
                label: 'Direct Agent',
                data: lastTwelveMonths.map(month => this.dataProcessor.getChannelRate('direct_agent', month)),
                borderColor: '#4ECDC4',
                backgroundColor: 'rgba(78, 205, 196, 0.1)',
                borderWidth: 2.5,
                tension: 0.4,
                pointRadius: 4,
                pointHoverRadius: 6
            },
            {
                label: 'AO Agent',
                data: lastTwelveMonths.map(month => this.dataProcessor.getChannelRate('ao_agent', month)),
                borderColor: '#95E1D3',
                backgroundColor: 'rgba(149, 225, 211, 0.1)',
                borderWidth: 2.5,
                tension: 0.4,
                pointRadius: 4,
                pointHoverRadius: 6
            },
            {
                label: 'Inspection Garage',
                data: lastTwelveMonths.map(month => this.dataProcessor.getChannelRate('inspection_garage', month)),
                borderColor: '#F38181',
                backgroundColor: 'rgba(243, 129, 129, 0.1)',
                borderWidth: 2.5,
                tension: 0.4,
                pointRadius: 4,
                pointHoverRadius: 6
            }
        ];

        if (this.chart) {
            this.chart.destroy();
        }

        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: 'rgba(17, 24, 39, 0.95)',
                        padding: 12,
                        titleColor: '#F9FAFB',
                        bodyColor: '#F9FAFB',
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                        borderWidth: 1,
                        displayColors: true,
                        callbacks: {
                            label: function(context) {
                                return context.dataset.label + ': ' + (context.parsed.y ? context.parsed.y.toFixed(2) + '%' : 'N/A');
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            font: {
                                family: "'Google Sans Text', monospace",
                                size: 11
                            },
                            color: '#6B7280'
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)',
                            drawBorder: false
                        },
                        ticks: {
                            font: {
                                family: "'Google Sans Text', monospace",
                                size: 11
                            },
                            color: '#6B7280',
                            callback: function(value) {
                                return value + '%';
                            }
                        }
                    }
                }
            }
        });
    }

    renderTable() {
        const lastSixMonths = this.dataProcessor.getLastNMonths(6);
        
        this.renderTableHeader(lastSixMonths);
        this.renderTableBody(lastSixMonths);
    }

    renderTableHeader(months) {
        const thead = document.getElementById('renewalTableHead');
        
        const headerRow = document.createElement('tr');
        
        // Channel column
        const thChannel = document.createElement('th');
        thChannel.className = 'channel-header';
        thChannel.textContent = 'Channel';
        headerRow.appendChild(thChannel);
        
        // Month columns
        months.forEach(month => {
            const th = document.createElement('th');
            th.className = 'month-header';
            th.textContent = this.dataProcessor.formatMonthLabel(month);
            headerRow.appendChild(th);
        });
        
        thead.innerHTML = '';
        thead.appendChild(headerRow);
    }

    renderTableBody(months) {
        const tbody = document.getElementById('renewalTableBody');
        tbody.innerHTML = '';

        // Render each channel
        const channels = ['mlm_agent', 'direct_agent', 'ao_agent', 'inspection_garage'];
        
        channels.forEach(channel => {
            const tr = document.createElement('tr');
            
            // Channel name
            const tdChannel = document.createElement('td');
            tdChannel.className = 'channel-name';
            tdChannel.textContent = this.dataProcessor.channels[channel];
            tr.appendChild(tdChannel);
            
            // Monthly values
            months.forEach(month => {
                const rate = this.dataProcessor.getChannelRate(channel, month);
                
                const td = document.createElement('td');
                td.className = 'data-cell';
                td.textContent = this.formatPercentage(rate);
                tr.appendChild(td);
            });
            
            tbody.appendChild(tr);
        });
    }

    reset() {
        document.getElementById('uploadSection').style.display = 'flex';
        document.getElementById('dashboardContent').style.display = 'none';
        
        if (this.chart) {
            this.chart.destroy();
            this.chart = null;
        }
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

const renewalDataProcessor = new RenewalDataProcessor();
const renewalUI = new RenewalUI(renewalDataProcessor);

// Auto-load data from data store on page load
window.addEventListener('load', function() {
    console.log('Renewal dashboard loaded, checking for stored data...');
    
    function checkDataStore() {
        if (!window.dashboardDataStore) {
            console.log('Waiting for data store...');
            setTimeout(checkDataStore, 100);
            return;
        }
        
        console.log('Fetching fresh renewal data from Google Sheets...');
        fetchRenewalSheetData();
    }

        function showLoadingBar() {
        var b = document.getElementById('loadingBar');
        if (b) b.classList.add('active');
    }
    function hideLoadingBar() {
        var b = document.getElementById('loadingBar');
        if (b) b.classList.remove('active');
    }

    function fetchRenewalSheetData() {
        var SHEET_ID = '1M51L7xRu_Y8MRO5ziDVZ4pbWtqi0Mxb1-oJ6WyfwKU0';
        var GID = '544634047';
        var url = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/export?format=csv&gid=' + GID;
        showLoadingBar();
        fetch(url)
            .then(function(r) { return r.text(); })
            .then(function(csv) {
                renewalDataProcessor.processData(csv);
                hideLoadingBar();
                renewalUI.render();
                console.log('Renewal data fetched and rendered from Google Sheets');
            })
            .catch(function(err) {
                hideLoadingBar();
                console.error('Failed to fetch renewal data:', err);
                document.getElementById('noDataSection').style.display = 'flex';
                document.getElementById('dashboardContent').style.display = 'none';
            });
    }

    checkDataStore();
});

// Listen for data updates
// Listen for month changes from parent frame
window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'monthChange' && renewalUI) {
        renewalUI.render();
    }
});

window.addEventListener('dashboardDataUpdated', function(event) {
    console.log('📊 Renewal data updated, reloading...');
    const allData = event.detail;

    if (allData.renewal && allData.renewal.channels && allData.renewal.months) {
        renewalDataProcessor.channelData = allData.renewal.channels;
        renewalDataProcessor.months = allData.renewal.months;
        renewalUI.render();
    }
});

// ============================================================================
// TARGETS MODAL
// ============================================================================

const RENEWAL_CHANNELS = ['mlm_agent', 'direct_agent', 'ao_agent', 'inspection_garage'];

async function openRenewalTargetsModal() {
    const months = renewalDataProcessor.months || [];
    const latest = (window.getEffectiveMonth ? window.getEffectiveMonth(months) : null) || months[months.length - 1] || '';
    document.getElementById('renewalTargetMonth').value = latest;

    if (window.targetsDB) {
        const result = await targetsDB.getAllTargets();
        if (result.success) {
            const existing = {};
            result.targets
                .filter(t => t.type === 'renewal' && t.month === latest)
                .forEach(t => { existing[t.name] = t.value; });
            RENEWAL_CHANNELS.forEach(ch => {
                const el = document.getElementById('renewalTarget_' + ch);
                if (el) el.value = existing[ch] != null ? existing[ch] : '';
            });
        }
    }

    document.getElementById('renewalTargetsModal').style.display = 'flex';
}

function closeRenewalTargetsModal() {
    document.getElementById('renewalTargetsModal').style.display = 'none';
}

async function saveRenewalTargets() {
    const month = document.getElementById('renewalTargetMonth').value;
    if (!month) { alert('Please select a month'); return; }
    if (!window.targetsDB) { alert('Targets DB not ready'); return; }

    for (const ch of RENEWAL_CHANNELS) {
        const raw = document.getElementById('renewalTarget_' + ch).value;
        const val = parseFloat(raw);
        if (raw !== '' && !isNaN(val)) {
            await targetsDB.saveTarget({ type: 'renewal', name: ch, month, value: val, unit: 'percent' });
        }
    }
    closeRenewalTargetsModal();
}
