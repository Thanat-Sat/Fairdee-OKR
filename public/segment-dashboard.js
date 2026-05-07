// ============================================================================
// SEGMENT DATA PROCESSING MODULE
// ============================================================================

class SegmentDataProcessor {
    constructor() {
        this.rawData = [];
        this.segmentData = {};
        this.months = [];
        this.segments = ['1. Enterprise', '2. Extra Large', '3. Large', '4. Medium', '5. Small', '6. Micro'];
    }

    parseCSV(csvText) {
        const lines = csvText.trim().split('\n');
        
        // Parse header to get months
        const headerLine = lines[0];
        const headers = this.parseCSVLine(headerLine);
        
        // Extract months (skip first 2 columns: "Sum of monthly_premium" and "gwp_segment")
        const months = [];
        for (let i = 2; i < headers.length - 1; i++) { // -1 to skip "Row totals"
            const month = this.parseMonth(headers[i]);
            if (month) {
                months.push(month);
            }
        }
        this.months = months;
        
        // Parse data rows
        const data = [];
        for (let i = 1; i < lines.length; i++) {
            if (lines[i].includes('Totals for')) continue; // Skip total rows
            
            const values = this.parseCSVLine(lines[i]);
            if (values.length > 2 && values[0] === '2. First Transacting Agent') {
                const segment = values[1];
                const counts = [];
                
                // Extract counts for each month (skip first 2 columns and last column)
                for (let j = 2; j < values.length - 1; j++) {
                    counts.push(this.extractNumber(values[j]));
                }
                
                data.push({
                    segment,
                    counts
                });
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
        if (!value || value === '') return 0;
        const cleanValue = value.toString()
            .replace(/["']/g, '') // Remove quotes
            .replace(/,/g, '') // Remove commas
            .replace(/\s/g, '') // Remove spaces
            .replace(/[^\d.-]/g, ''); // Keep only digits, dots, and minus
        const num = parseInt(cleanValue);
        return isNaN(num) ? 0 : num;
    }

    processData(csvText) {
        const data = this.parseCSV(csvText);
        this.segmentData = {};
        
        // Organize data by segment
        data.forEach(row => {
            this.segmentData[row.segment] = row.counts;
        });
        
        // Update centralized data store
        if (window.dashboardDataStore) {
            try {
                window.dashboardDataStore.updateSegmentData(this.segmentData, this.months);
                console.log("✓ Segment data saved to central store");
                console.log("Segments:", Object.keys(this.segmentData));
                console.log("Months:", this.months);
            } catch (error) {
                console.error("Error saving to data store:", error);
            }
        } else {
            console.warn("⚠ Dashboard data store not found - data will not be saved");
            console.warn("Make sure dashboard-data-store.js is loaded before this file");
        }

        return this.segmentData;
    }

    getLastNMonths(n = 6) {
        if (this.months.length === 0) return [];
        const effective = window.getEffectiveMonth ? window.getEffectiveMonth(this.months) : this.months[this.months.length - 1];
        const idx = effective ? this.months.indexOf(effective) : this.months.length - 1;
        const end = idx < 0 ? this.months.length : idx + 1;
        return this.months.slice(Math.max(0, end - n), end);
    }

    calculateMonthTotal(monthIndex) {
        let total = 0;
        this.segments.forEach(segment => {
            if (this.segmentData[segment] && this.segmentData[segment][monthIndex] !== undefined) {
                total += this.segmentData[segment][monthIndex];
            }
        });
        return total;
    }

    calculateGrowthRate(currentIndex) {
        if (currentIndex === 0) return null;
        
        const current = this.calculateMonthTotal(currentIndex);
        const previous = this.calculateMonthTotal(currentIndex - 1);
        
        if (previous === 0) return null;
        
        return ((current - previous) / previous) * 100;
    }

    // Verify data store integration
    verifyDataStore() {
        console.log("=== Data Store Verification ===");
        console.log("Data store exists:", !!window.dashboardDataStore);
        
        if (window.dashboardDataStore) {
            const allData = window.dashboardDataStore.getAllData();
            console.log("Segment data in store:", !!allData.segment);
            
            if (allData.segment) {
                console.log("Stored segments:", Object.keys(allData.segment.segments));
                console.log("Stored months:", allData.segment.months);
                console.log("Last updated:", allData.lastUpdated.segment);
            }
        }
        console.log("===============================");
    }
}

// ============================================================================
// UI MODULE - SEGMENT
// ============================================================================

class SegmentUI {
    constructor(dataProcessor) {
        this.dataProcessor = dataProcessor;
    }

    formatNumber(num) {
        return num.toLocaleString('en-US', { maximumFractionDigits: 0 });
    }

    formatPercentage(num, decimals = 2) {
        if (num === null || isNaN(num)) return '–';
        return num.toFixed(decimals) + '%';
    }

    getGrowthClass(num) {
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

        this.renderTable();

        document.getElementById('noDataSection').style.display = 'none';
        document.getElementById('dashboardContent').style.display = 'block';
    }

    renderTable() {
        const lastSixMonths = this.dataProcessor.getLastNMonths(6);
        const startIndex = lastSixMonths.length > 0 ? this.dataProcessor.months.indexOf(lastSixMonths[0]) : 0;
        
        this.renderTableHeader(lastSixMonths);
        this.renderTableBody(lastSixMonths, startIndex);
    }

    renderTableHeader(months) {
        const thead = document.getElementById('segmentTableHead');
        
        const headerRow = document.createElement('tr');
        
        // Segment column
        const thSegment = document.createElement('th');
        thSegment.className = 'segment-header';
        thSegment.textContent = 'Segment';
        headerRow.appendChild(thSegment);
        
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

    renderTableBody(months, startIndex) {
        const tbody = document.getElementById('segmentTableBody');
        tbody.innerHTML = '';

        // Render each segment
        this.dataProcessor.segments.forEach(segment => {
            const tr = document.createElement('tr');
            
            // Segment name
            const tdSegment = document.createElement('td');
            tdSegment.className = 'segment-name';
            tdSegment.textContent = segment;
            tr.appendChild(tdSegment);
            
            // Monthly values
            months.forEach((month, index) => {
                const absoluteIndex = startIndex + index;
                const value = this.dataProcessor.segmentData[segment] 
                    ? this.dataProcessor.segmentData[segment][absoluteIndex] || 0
                    : 0;
                
                const td = document.createElement('td');
                td.className = 'data-cell';
                td.textContent = this.formatNumber(value);
                tr.appendChild(td);
            });
            
            tbody.appendChild(tr);
        });

        // Total activation row
        const totalRow = document.createElement('tr');
        totalRow.className = 'total-row';
        
        const tdTotal = document.createElement('td');
        tdTotal.className = 'segment-name total-label';
        tdTotal.textContent = 'Total activation';
        totalRow.appendChild(tdTotal);
        
        months.forEach((month, index) => {
            const absoluteIndex = startIndex + index;
            const total = this.dataProcessor.calculateMonthTotal(absoluteIndex);
            
            const td = document.createElement('td');
            td.className = 'data-cell total-cell';
            td.textContent = this.formatNumber(total);
            totalRow.appendChild(td);
        });
        
        tbody.appendChild(totalRow);

        // Growth rate row
        const growthRow = document.createElement('tr');
        growthRow.className = 'growth-row';
        
        const tdGrowthLabel = document.createElement('td');
        tdGrowthLabel.className = 'segment-name';
        tdGrowthLabel.textContent = '';
        growthRow.appendChild(tdGrowthLabel);
        
        months.forEach((month, index) => {
            const absoluteIndex = startIndex + index;
            const growthRate = this.dataProcessor.calculateGrowthRate(absoluteIndex);
            const growthClass = this.getGrowthClass(growthRate);
            
            const td = document.createElement('td');
            td.className = `data-cell growth-cell ${growthClass}`;
            td.textContent = this.formatPercentage(growthRate);
            growthRow.appendChild(td);
        });
        
        tbody.appendChild(growthRow);
    }
}

// ============================================================================
// APPLICATION INITIALIZATION
// ============================================================================

// Check if loaded in iframe and hide header
if (window.self !== window.top) {
    const header = document.getElementById('dashboardHeader');
    if (header) {
        header.style.display = 'none';
    }
}

const segmentDataProcessor = new SegmentDataProcessor();
const segmentUI = new SegmentUI(segmentDataProcessor);

// Auto-load data from store on page load
window.addEventListener('load', function() {
    console.log('Segment dashboard loaded, checking for stored data...');
    
    // Wait for data store to be available
    function checkDataStore() {
        if (!window.dashboardDataStore) {
            console.log('Waiting for data store...');
            setTimeout(checkDataStore, 100);
            return;
        }
        
        console.log('Fetching fresh segment data from Google Sheets...');
        fetchSegmentSheetData();
    }

        function showLoadingBar() {
        var b = document.getElementById('loadingBar');
        if (b) b.classList.add('active');
    }
    function hideLoadingBar() {
        var b = document.getElementById('loadingBar');
        if (b) b.classList.remove('active');
    }

    function fetchSegmentSheetData() {
        const SHEET_ID = '1M51L7xRu_Y8MRO5ziDVZ4pbWtqi0Mxb1-oJ6WyfwKU0';
        const GID = '1253670765';
        const url = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/export?format=csv&gid=' + GID;
        showLoadingBar();
        fetch(url)
            .then(function(r) { return r.text(); })
            .then(function(csv) {
                parseSegmentFlatCSV(csv);
            })
            .catch(function(err) {
                hideLoadingBar();
                console.error('Failed to fetch segment data:', err);
                document.getElementById('noDataSection').style.display = 'flex';
                document.getElementById('dashboardContent').style.display = 'none';
            });
    }

    function parseSegCSVLine(line) {
        var values = [], current = '', inQuotes = false;
        for (var i = 0; i < line.length; i++) {
            var ch = line[i];
            if (ch === '"') { inQuotes = !inQuotes; }
            else if (ch === ',' && !inQuotes) { values.push(current); current = ''; }
            else { current += ch; }
        }
        values.push(current);
        return values;
    }

    function parseSegMonth(str) {
        var parts = str.split(',');
        if (parts.length < 2) return null;
        var monthMap = { January:'01', February:'02', March:'03', April:'04', May:'05', June:'06',
                         July:'07', August:'08', September:'09', October:'10', November:'11', December:'12' };
        var mNum = monthMap[parts[0].trim()];
        var year = parts[parts.length - 1].trim();
        if (!mNum || !year) return null;
        return year + '-' + mNum;
    }

    // The sheet is a flat/long format: month, segment, row_type, count
    function parseSegmentFlatCSV(csvText) {
        var nl = String.fromCharCode(10);
        var lines = csvText.split(nl).filter(function(l) { return l.trim(); });
        if (lines.length < 2) { hideLoadingBar(); return; }

        var monthToSegToCount = {};

        for (var i = 1; i < lines.length; i++) {
            var vals = parseSegCSVLine(lines[i]);
            if (vals.length < 4) continue;
            var monthRaw = vals[0].replace(/"/g, '').trim();
            var segment = vals[1].trim();
            var countStr = vals[3].replace(/[,"'\s]/g, '');
            var count = parseInt(countStr) || 0;

            var month = parseSegMonth(monthRaw);
            if (!month || !segment || segment === 'gwp_segment') continue;

            if (!monthToSegToCount[month]) monthToSegToCount[month] = {};
            monthToSegToCount[month][segment] = (monthToSegToCount[month][segment] || 0) + count;
        }

        var months = Object.keys(monthToSegToCount).sort();
        if (months.length === 0) {
            hideLoadingBar();
            document.getElementById('noDataSection').style.display = 'flex';
            document.getElementById('dashboardContent').style.display = 'none';
            return;
        }

        var allSegs = {};
        months.forEach(function(m) { Object.keys(monthToSegToCount[m]).forEach(function(s) { allSegs[s] = true; }); });

        var segmentData = {};
        Object.keys(allSegs).forEach(function(seg) {
            segmentData[seg] = months.map(function(m) { return monthToSegToCount[m][seg] || 0; });
        });

        segmentDataProcessor.segmentData = segmentData;
        segmentDataProcessor.months = months;
        window.dashboardDataStore.updateSegmentData(segmentData, months);

        hideLoadingBar();
        segmentUI.render();
        console.log('Segment data fetched and rendered from Google Sheets');
    }

    checkDataStore();
});

// Listen for month changes from parent frame
window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'monthChange' && segmentUI) {
        segmentUI.render();
    }
});

// Listen for data updates
window.addEventListener('dashboardDataUpdated', function(event) {
    console.log('📊 Segment data updated, reloading...');
    const allData = event.detail;

    if (allData.segment && allData.segment.segments && allData.segment.months) {
        segmentDataProcessor.segmentData = allData.segment.segments;
        segmentDataProcessor.months = allData.segment.months;
        segmentUI.render();
    }
});

// ============================================================================
// TARGETS MODAL
// ============================================================================

const SEGMENT_NAMES = ['1. Enterprise', '2. Extra Large', '3. Large', '4. Medium', '5. Small', '6. Micro'];

async function openSegmentTargetsModal() {
    const months = segmentDataProcessor.months || [];
    const latest = (window.getEffectiveMonth ? window.getEffectiveMonth(months) : null) || months[months.length - 1] || '';
    document.getElementById('segmentTargetMonth').value = latest;

    const container = document.getElementById('segmentTargetsContainer');
    container.innerHTML = '';

    let existing = {};
    if (window.targetsDB) {
        const result = await targetsDB.getAllTargets();
        if (result.success) {
            result.targets
                .filter(t => t.type === 'segment' && t.month === latest)
                .forEach(t => { existing[t.name] = t.value; });
        }
    }

    SEGMENT_NAMES.forEach((seg, idx) => {
        const inputId = 'segmentTarget_' + idx;
        const safeLabel = seg.replace(/"/g, '&quot;');
        const valueAttr = existing[seg] != null ? `value="${existing[seg]}"` : '';
        container.insertAdjacentHTML('beforeend', `
            <div class="form-group">
                <label class="form-label">${safeLabel}</label>
                <input type="number" id="${inputId}" data-segment="${safeLabel}" class="form-input" placeholder="e.g., 50" step="1" min="0" ${valueAttr}>
            </div>
        `);
    });

    document.getElementById('segmentTargetsModal').style.display = 'flex';
}

function closeSegmentTargetsModal() {
    document.getElementById('segmentTargetsModal').style.display = 'none';
}

async function saveSegmentTargets() {
    const month = document.getElementById('segmentTargetMonth').value;
    if (!month) { alert('Please select a month'); return; }
    if (!window.targetsDB) { alert('Targets DB not ready'); return; }

    const inputs = document.querySelectorAll('#segmentTargetsContainer input[type="number"]');
    for (const input of inputs) {
        const raw = input.value;
        const val = parseFloat(raw);
        const name = input.dataset.segment;
        if (raw !== '' && !isNaN(val) && name) {
            await targetsDB.saveTarget({ type: 'segment', name, month, value: val, unit: 'count' });
        }
    }
    closeSegmentTargetsModal();
}
