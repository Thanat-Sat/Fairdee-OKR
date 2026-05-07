// ============================================================================
// AGENCY DATA PROCESSING MODULE
// ============================================================================

class AgencyDataProcessor {
    constructor() {
        this.statusData = null;
        this.agentsData = null;
        this.processedData = {};
        this.months = [];
    }

    parseCSV(csvText) {
        const lines = csvText.trim().split('\n');
        const data = [];
        
        for (let i = 1; i < lines.length; i++) {
            const values = this.parseCSVLine(lines[i]);
            data.push(values);
        }
        
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
        const parts = monthStr.split(',');
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

    extractNumber(value) {
        const cleanValue = value.toString()
            .replace(/["Ã Â¸Â¿$,\s]/g, '')
            .replace(/[^\d.-]/g, '');
        return parseInt(cleanValue) || 0;
    }

    extractPercentage(value) {
        const cleanValue = value.toString()
            .replace(/["%\s]/g, '')
            .replace(/[^\d.-]/g, '');
        return parseFloat(cleanValue) || 0;
    }

    processStatusData(csvText) {
        const data = this.parseCSV(csvText);
        const statusData = {};
        
        data.forEach(row => {
            if (row.length < 3) return;
            
            const month = this.parseMonth(row[0]);
            const status = row[1];
            const count = this.extractNumber(row[2]);
            
            if (!month) return;
            
            if (!statusData[month]) {
                statusData[month] = {
                    'Non Activated': 0,
                    'First Transacting': 0,
                    'Retained': 0,
                    'Churned': 0,
                    'Resurrected': 0
                };
            }
            
            if (status.includes('Non Activated')) {
                statusData[month]['Non Activated'] = count;
            } else if (status.includes('First Transacting')) {
                statusData[month]['First Transacting'] = count;
            } else if (status.includes('Retained')) {
                statusData[month]['Retained'] = count;
            } else if (status.includes('Churned')) {
                statusData[month]['Churned'] = count;
            } else if (status.includes('Resurrected')) {
                statusData[month]['Resurrected'] = count;
            }
        });
        
        this.statusData = statusData;
        return statusData;
    }

    processAgentsData(csvText) {
        const data = this.parseCSV(csvText);
        const agentsData = {};
        
        data.forEach(row => {
            if (row.length < 3) return;
            
            const month = this.parseMonth(row[0]);
            const nonLicense = this.extractNumber(row[1]);
            const license = this.extractNumber(row[2]);
            
            if (!month) return;
            
            agentsData[month] = {
                nonLicense,
                license,
                total: nonLicense + license
            };
        });
        
        this.agentsData = agentsData;
        return agentsData;
    }

    processAllData() {
        if (!this.statusData || !this.agentsData) {
            throw new Error('Both data sources are required');
        }

        // Get all unique months
        const statusMonths = Object.keys(this.statusData);
        const agentsMonths = Object.keys(this.agentsData);
        const allMonths = [...new Set([...statusMonths, ...agentsMonths])].sort();
        
        this.months = allMonths;
        
        // Process combined data
        this.processedData = {};
        
        allMonths.forEach((month, index) => {
            const prevMonth = index > 0 ? allMonths[index - 1] : null;
            
            const status = this.statusData[month] || {};
            const agents = this.agentsData[month] || { total: 0, nonLicense: 0, license: 0 };
            const prevAgents = prevMonth ? (this.agentsData[prevMonth] || { total: 0 }) : { total: 0 };
            
            // Calculate metrics
            const totalAgents = agents.total;
            const newAgents = totalAgents - prevAgents.total;
            const existingAgents = prevAgents.total;
            
            const activeAgents = (status['First Transacting'] || 0) + 
                                (status['Retained'] || 0) + 
                                (status['Resurrected'] || 0);
            
            const firstTransacting = status['First Transacting'] || 0;
            
            // Calculate rates
            const acquisitionRate = prevAgents.total > 0 ? (newAgents / prevAgents.total) * 100 : 0;
            const activityRate = totalAgents > 0 ? (activeAgents / totalAgents) * 100 : 0;
            const activationRate = totalAgents > 0 ? (firstTransacting / totalAgents) * 100 : 0;
            
            // Calculate MoM growth rates using formula: (current / previous) - 1
            // Result is already in decimal form, multiply by 100 to get percentage
            const acquisitionGrowth = index > 0 && this.processedData[prevMonth] && this.processedData[prevMonth].acquisitionRate > 0 ? 
                ((acquisitionRate / this.processedData[prevMonth].acquisitionRate) - 1) * 100 : 0;
            
            const activityGrowth = index > 0 && this.processedData[prevMonth] && this.processedData[prevMonth].activityRate > 0 ? 
                ((activityRate / this.processedData[prevMonth].activityRate) - 1) * 100 : 0;
            
            const activationGrowth = index > 0 && this.processedData[prevMonth] && this.processedData[prevMonth].activationRate > 0 ? 
                ((activationRate / this.processedData[prevMonth].activationRate) - 1) * 100 : 0;
            
            this.processedData[month] = {
                totalAgents,
                newAgents,
                existingAgents,
                acquisitionRate,
                acquisitionGrowth,
                activeAgents,
                activityRate,
                activityGrowth,
                firstTransacting,
                activationRate,
                activationGrowth
            };
        });
        
        // Update centralized data store
        if (window.dashboardDataStore) {
            window.dashboardDataStore.updateAgencyData(this.processedData, this.months);
            console.log("Agency data saved to central store");
        }

        return this.processedData;
    }

    getLastNMonths(n = 6) {
        if (this.months.length === 0) return [];
        const effective = window.getEffectiveMonth ? window.getEffectiveMonth(this.months) : this.months[this.months.length - 1];
        const idx = effective ? this.months.indexOf(effective) : this.months.length - 1;
        const end = idx < 0 ? this.months.length : idx + 1;
        return this.months.slice(Math.max(0, end - n), end);
    }
}

// ============================================================================
// UI MODULE - AGENCY
// ============================================================================

class AgencyUI {
    constructor(dataProcessor) {
        this.dataProcessor = dataProcessor;
    }

    formatNumber(num) {
        return num.toLocaleString('en-US', { maximumFractionDigits: 0 });
    }

    formatPercentage(num, decimals = 2) {
        return num.toFixed(decimals) + '%';
    }

    formatGrowth(num) {
        const sign = num > 0 ? '+' : '';
        return sign + num.toFixed(2) + '%';
    }

    getGrowthClass(num) {
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

        this.renderTable();

        document.getElementById('noDataSection').style.display = 'none';
        document.getElementById('dashboardContent').style.display = 'block';
    }

    renderTable() {
        const lastSixMonths = this.dataProcessor.getLastNMonths(6);
        
        this.renderTableHeader(lastSixMonths);
        this.renderTableBody(lastSixMonths);
    }

    renderTableHeader(months) {
        const thead = document.getElementById('agencyTableHead');
        
        const headerRow = document.createElement('tr');
        
        // Account type column
        const thAccount = document.createElement('th');
        thAccount.className = 'account-header';
        thAccount.textContent = 'All account';
        headerRow.appendChild(thAccount);
        
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
        const tbody = document.getElementById('agencyTableBody');
        tbody.innerHTML = '';

        const metrics = [
            { 
                label: 'Total agent', 
                key: 'totalAgents',
                format: (v) => this.formatNumber(v)
            },
            { 
                label: 'New agent', 
                key: 'newAgents',
                format: (v) => this.formatNumber(v)
            },
            { 
                label: 'Existing agent', 
                key: 'existingAgents',
                format: (v) => this.formatNumber(v)
            },
            { 
                label: 'Acquisition rate', 
                key: 'acquisitionRate',
                format: (v) => this.formatPercentage(v),
                growthKey: 'acquisitionGrowth'
            },
            { 
                label: 'Active agent', 
                key: 'activeAgents',
                format: (v) => this.formatNumber(v)
            },
            { 
                label: 'Activity rate', 
                key: 'activityRate',
                format: (v) => this.formatPercentage(v),
                growthKey: 'activityGrowth'
            },
            { 
                label: '# of First transacting', 
                key: 'firstTransacting',
                format: (v) => this.formatNumber(v)
            },
            { 
                label: '% Activation rate', 
                key: 'activationRate',
                format: (v) => this.formatPercentage(v),
                growthKey: 'activationGrowth'
            }
        ];

        metrics.forEach(metric => {
            const tr = document.createElement('tr');
            
            // Label column
            const tdLabel = document.createElement('td');
            tdLabel.className = 'metric-label';
            tdLabel.textContent = metric.label;
            tr.appendChild(tdLabel);
            
            // Data columns
            months.forEach((month, index) => {
                const monthData = this.dataProcessor.processedData[month];
                const value = monthData[metric.key];
                
                const td = document.createElement('td');
                td.className = 'data-cell';
                
                if (metric.growthKey && index > 0) {
                    const growth = monthData[metric.growthKey];
                    const growthClass = this.getGrowthClass(growth);
                    
                    td.innerHTML = `
                        <div class="cell-content">
                            <div class="cell-value">${metric.format(value)}</div>
                            <div class="cell-growth ${growthClass}">${this.formatGrowth(growth)}</div>
                        </div>
                    `;
                } else {
                    td.innerHTML = `<div class="cell-value">${metric.format(value)}</div>`;
                }
                
                tr.appendChild(td);
            });
            
            tbody.appendChild(tr);
        });
    }

}

// ============================================================================
// APPLICATION INITIALIZATION
// ============================================================================


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

const agencyDataProcessor = new AgencyDataProcessor();
const agencyUI = new AgencyUI(agencyDataProcessor);

// Auto-load data from data store on page load
window.addEventListener('load', function() {
    console.log('Agency dashboard loaded, checking for stored data...');
    
    function checkDataStore() {
        if (!window.dashboardDataStore) {
            console.log('Waiting for data store...');
            setTimeout(checkDataStore, 100);
            return;
        }
        
        console.log('Fetching fresh agency data from Google Sheets...');
        fetchAgencySheetData();
    }

        function showLoadingBar() {
        var b = document.getElementById('loadingBar');
        if (b) b.classList.add('active');
    }
    function hideLoadingBar() {
        var b = document.getElementById('loadingBar');
        if (b) b.classList.remove('active');
    }

    function fetchAgencySheetData() {
        var SHEET_ID = '1M51L7xRu_Y8MRO5ziDVZ4pbWtqi0Mxb1-oJ6WyfwKU0';
        var statusUrl = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/export?format=csv&gid=1243827715';
        var agentsUrl = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/export?format=csv&gid=110469784';
        showLoadingBar();
        Promise.all([fetch(statusUrl).then(function(r) { return r.text(); }),
                     fetch(agentsUrl).then(function(r) { return r.text(); })])
            .then(function(results) {
                agencyDataProcessor.processStatusData(results[0]);
                agencyDataProcessor.processAgentsData(results[1]);
                agencyDataProcessor.processAllData();
                hideLoadingBar();
                agencyUI.render();
                console.log('Agency data fetched and rendered from Google Sheets');
            })
            .catch(function(err) {
                hideLoadingBar();
                console.error('Failed to fetch agency data:', err);
                document.getElementById('noDataSection').style.display = 'flex';
                document.getElementById('dashboardContent').style.display = 'none';
            });
    }

    checkDataStore();
});

// Listen for month changes from parent frame
window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'monthChange' && agencyUI) {
        agencyUI.render();
    }
});

// Listen for data updates
window.addEventListener('dashboardDataUpdated', function(event) {
    console.log('ðŸ“Š Agency data updated, reloading...');
    const allData = event.detail;

    if (allData.agency && allData.agency.metrics && allData.agency.months) {
        agencyDataProcessor.processedData = allData.agency.metrics;
        agencyDataProcessor.months = allData.agency.months;
        agencyUI.render();
    }
});

// ============================================================================
// TARGETS MODAL
// ============================================================================

const AGENCY_METRICS = [
    { key: 'totalAgents',     unit: 'count' },
    { key: 'newAgents',       unit: 'count' },
    { key: 'acquisitionRate', unit: 'percent' },
    { key: 'activeAgents',    unit: 'count' }
];

async function openAgencyTargetsModal() {
    const months = agencyDataProcessor.months || [];
    const latest = (window.getEffectiveMonth ? window.getEffectiveMonth(months) : null) || months[months.length - 1] || '';
    document.getElementById('agencyTargetMonth').value = latest;

    if (window.targetsDB) {
        const result = await targetsDB.getAllTargets();
        if (result.success) {
            const existing = {};
            result.targets
                .filter(t => t.type === 'agency' && t.month === latest)
                .forEach(t => { existing[t.name] = t.value; });
            AGENCY_METRICS.forEach(m => {
                const el = document.getElementById('agencyTarget_' + m.key);
                if (el) el.value = existing[m.key] != null ? existing[m.key] : '';
            });
        }
    }

    document.getElementById('agencyTargetsModal').style.display = 'flex';
}

function closeAgencyTargetsModal() {
    document.getElementById('agencyTargetsModal').style.display = 'none';
}

async function saveAgencyTargets() {
    const month = document.getElementById('agencyTargetMonth').value;
    if (!month) { alert('Please select a month'); return; }
    if (!window.targetsDB) { alert('Targets DB not ready'); return; }

    for (const m of AGENCY_METRICS) {
        const raw = document.getElementById('agencyTarget_' + m.key).value;
        const val = parseFloat(raw);
        if (raw !== '' && !isNaN(val)) {
            await targetsDB.saveTarget({ type: 'agency', name: m.key, month, value: val, unit: m.unit });
        }
    }
    closeAgencyTargetsModal();
}
