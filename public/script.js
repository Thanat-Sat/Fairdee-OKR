// ========================================
// EMBEDDED TARGETS - EDIT THESE AS NEEDED  
// ========================================
const EMBEDDED_TARGETS = {
    // Use short KR codes that match your data file (KR-0, KR-1, KR-1.1, etc.)
    // NOT the long descriptive names
    
    "KR-0": 3824656074,
    "KR-1": 3374656074,
    "KR-1.1": 1400225810,
    "KR-1.1.1": 90,
    "KR-1.2": 80296927,
    "KR-1.2.1": 80296927,
    "KR-1.3": 635458029,
    "KR-1.3.1": 166883999,
    "KR-1.3.2": 440934031,
    "KR-1.4": 999656489,
    "KR-2": 450050000,
    "KR-2.1": 120050000,
    "KR-2.1.1": 56050000,
    "KR-2.1.2": 64000000,
    "KR-2.2": 230000000,
    "KR-2.2.1": 480000000,
    "KR-2.2.2": 25,
    "KR-2.3": 110000000,
    "KR-2.3.1": 550000000,
    "KR-2.3.2": 10,
    "KR-3.1": 25.70,
    "KR-3.2": 45,
    "KR-4.1": 2130926,
    "KR-4.1.1": 57,
    "KR-4.2": 675,
    "KR-4.2.1": 1426,
    "KR-4.2.2": 2333,
    "KR-4.2.3": 6899,
    "KR-4.2.4": 2581,
    "KR-5.1.1": 90,
    "KR-5.1.2": 90,
    "KR-5.1.3": 95,
    "KR-5.1.4": 80,
    "KR-5.2.1": 93,
    "KR-5.2.2": 0,
    "KR-5.3.1": 33,
    "KR-5.3.2": 14,
    "KR-5.5.1": 5,
    "KR-5.5.2": 3
};

console.log('✅ Embedded targets loaded:', Object.keys(EMBEDDED_TARGETS).length, 'targets');

// ========================================
// HUNTER ANALYSIS EMBEDDED TARGETS
// ========================================
// First Transacting Targets (Jan 2026 - Dec 2026) in THB
const FIRST_TRANSACTING_TARGETS = [
    7350000,    // January 2026
    8233750,    // February 2026
    9236781,    // March 2026
    10376502,   // April 2026
    11673008,   // May 2026
    13149513,   // June 2026
    14832855,   // July 2026
    16754086,   // August 2026
    18943159,   // September 2026
    21459735,   // October 2026
    24334121,   // November 2026
    27628374    // December 2026
];

// Early Retention Targets (Jan 2026 - Dec 2026) in THB
const EARLY_RETENTION_TARGETS = [
    17804622,   // January 2026
    19915423,   // February 2026
    22307400,   // March 2026
    25021175,   // April 2026
    28103597,   // May 2026
    31608733,   // June 2026
    35599042,   // July 2026
    40146723,   // August 2026
    45335311,   // September 2026
    51261526,   // October 2026
    58037444,   // November 2026
    65793035    // December 2026
];

console.log('✅ Hunter Analysis targets loaded: First Transacting (12 months), Early Retention (12 months)');

// ========================================
// MONTHLY TARGETS STORAGE
// ========================================
let monthlyTargets = new Map(); // Structure: Map<krName, Map<month, target>>

// ========================================
// HUNTER ANALYSIS STORAGE
// ========================================
let firstTransactingData = [];
let earlyRetentionData = [];

// ========================================
// END OF EMBEDDED TARGETS
// ========================================

let csvData = [];
let filteredData = [];
let allMonths = []; // All unique months found in data
let selectedMonth = ''; // Currently selected month

// ========================================
// HELPER FUNCTIONS
// ========================================

// Show upload status indicator
function showUploadStatus(elementId, status, message) {
    const statusEl = document.getElementById(elementId);
    if (!statusEl) return;
    
    // Remove all status classes
    statusEl.classList.remove('success', 'error', 'loading');
    
    // Add the appropriate class
    statusEl.classList.add(status);
    statusEl.innerHTML = message;
}

// Show dashboard (called when user clicks "View Dashboard" button)
function showDashboard() {
    if (csvData.length === 0) {
        alert('Please upload a data CSV file first.');
        return;
    }
    
    document.getElementById('uploadSection').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    
    // Render all views
    renderAll();
}

// ========================================
// FILE INPUT HANDLERS
// ========================================

// File input handler
document.getElementById('fileInput').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        processFile(file);
    }
});

// Monthly targets file input handler
document.getElementById('targetsFileInput').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        processMonthlyTargetsFile(file);
    }
});

// First Transacting file input handler
document.getElementById('firstTransactingInput').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        processFirstTransactingFile(file);
    }
});

// Early Retention file input handler
document.getElementById('earlyRetentionInput').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        processEarlyRetentionFile(file);
    }
});

// Drag and drop handlers for data file
const uploadZone = document.getElementById('uploadZone');

uploadZone.addEventListener('dragover', function(e) {
    e.preventDefault();
    this.classList.add('dragover');
});

uploadZone.addEventListener('dragleave', function() {
    this.classList.remove('dragover');
});

uploadZone.addEventListener('drop', function(e) {
    e.preventDefault();
    this.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'text/csv') {
        document.getElementById('fileInput').files = e.dataTransfer.files;
        processFile(file);
    }
});

// Drag and drop handlers for targets file
const targetsUploadZone = document.getElementById('targetsUploadZone');

targetsUploadZone.addEventListener('dragover', function(e) {
    e.preventDefault();
    this.classList.add('dragover');
});

targetsUploadZone.addEventListener('dragleave', function() {
    this.classList.remove('dragover');
});

targetsUploadZone.addEventListener('drop', function(e) {
    e.preventDefault();
    this.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'text/csv') {
        document.getElementById('targetsFileInput').files = e.dataTransfer.files;
        processMonthlyTargetsFile(file);
    }
});

// Parse date from "Month, Year" string
function parseMonthString(monthStr) {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                       'July', 'August', 'September', 'October', 'November', 'December'];
    
    if (!monthStr) return null;
    const trimmed = monthStr.trim();
    const commaIndex = trimmed.indexOf(',');
    if (commaIndex === -1) return null;
    
    const monthPart = trimmed.substring(0, commaIndex).trim();
    const yearPart = trimmed.substring(commaIndex + 1).trim();
    const monthIndex = monthNames.indexOf(monthPart);
    
    if (monthIndex === -1 || !/^\d{4}$/.test(yearPart)) return null;
    
    return new Date(parseInt(yearPart), monthIndex, 1);
}

// Get target for a KR - uses embedded targets first, then falls back to CSV data
function getTarget(row) {
    const krName = row.kr_name;
    
    // If a month is selected, try to get the monthly target first
    if (selectedMonth) {
        const monthlyTarget = getMonthlyTarget(krName, selectedMonth);
        if (monthlyTarget !== null) {
            return monthlyTarget;
        }
    }
    
    // First check embedded targets (annual targets)
    if (EMBEDDED_TARGETS.hasOwnProperty(krName)) {
        return EMBEDDED_TARGETS[krName];
    }
    
    // Fallback to CSV data if available
    if (row.ultimate_target_number) {
        let target = parseFloat(row.ultimate_target_number.toString().replace(/,/g, ""));
        if (!isNaN(target)) {
            // If the KR unit is percentage-based and target is in decimal form, multiply by 100
            const krUnitName = (row.unit_name || '').toString().toLowerCase();
            const isPercentKR = krUnitName.includes('%') || krUnitName.includes('percent');
            if (isPercentKR && Math.abs(target) <= 1) {
                target = target * 100;
            }
            return target;
        }
    }
    
    return 0;
}

// Get monthly target for a specific KR and month
function getMonthlyTarget(krName, month) {
    if (!monthlyTargets.has(krName)) return null;
    const krMonthlyTargets = monthlyTargets.get(krName);
    return krMonthlyTargets.get(month) || null;
}

// Process monthly targets CSV file
function processMonthlyTargetsFile(file) {
    showUploadStatus('targetsFileStatus', 'loading', 'Processing...');
    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        transformHeader: function(header) {
            return header.trim();
        },
        complete: function(results) {
            console.log('=== MONTHLY TARGETS PARSING ===');
            console.log('Total rows:', results.data.length);
            
            monthlyTargets.clear();
            
            results.data.forEach(row => {
                const krName = row.kr_name || row.KR || row.kr;
                const month = row.month || row.Month;
                const target = row.monthly_target || row.target || row.Monthly_Target;
                
                if (!krName || !month || !target) {
                    console.warn('Skipping row with missing data:', row);
                    return;
                }
                
                const targetValue = parseFloat(target.toString().replace(/,/g, ''));
                if (isNaN(targetValue)) {
                    console.warn('Invalid target value:', target, 'for KR:', krName);
                    return;
                }
                
                if (!monthlyTargets.has(krName)) {
                    monthlyTargets.set(krName, new Map());
                }
                
                monthlyTargets.get(krName).set(month.trim(), targetValue);
            });
            
            console.log('âœ… Monthly targets loaded for', monthlyTargets.size, 'KRs');
            
            // Show success status
            showUploadStatus('targetsFileStatus', 'success', `✓ Loaded targets for ${monthlyTargets.size} KRs from ${file.name}`);
            document.getElementById('targetsUploadZone').classList.add('uploaded');
            
            // Re-render if data is already loaded
            if (csvData.length > 0) {
                renderAll();
            }
        },
        error: function(error) {
            showUploadStatus('targetsFileStatus', 'error', `✗ Error: ${error.message}`);
        }
    });
}

// Process CSV file - NEW FORMAT (long format with months as rows)
function processFile(file) {
    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        transformHeader: function(header) {
            return header.trim();
        },
        complete: function(results) {
            console.log('=== CSV PARSING DEBUG ===');
            console.log('Total rows:', results.data.length);
            
            // Find the month column name (flexible matching)
            const headers = results.meta.fields || Object.keys(results.data[0] || {});
            console.log('Headers:', headers);
            
            const monthColumnName = headers.find(h => 
                h.toLowerCase().includes('month') && h.toLowerCase().includes('baseline')
            ) || headers.find(h => 
                h.toLowerCase().includes('month')
            );
            
            const valueColumnName = headers.find(h => 
                h.toLowerCase().includes('result_number') || h.toLowerCase().includes('sum of')
            ) || 'Sum of result_number';
            
            console.log('Month column:', monthColumnName);
            console.log('Value column:', valueColumnName);
            
            if (!monthColumnName) {
                alert('Cannot find month column in CSV. Please check file format.');
                return;
            }
            
            // Group data by KR and collect all months
            const monthSet = new Set();
            const groupedData = new Map();
            let filteredRowCount = 0; // Track how many year-to-month/YTD/yearly average rows were filtered out
            
            results.data.forEach(row => {
                const krName = row.kr_name;
                if (!krName || !krName.trim()) return;
                
                // FILTER: Skip year-to-month / YTD / cumulative rows
                // Check unit_name and other common column names that might indicate row type
                const unitName = row.unit_name || '';
                const rowType = row.type || row.result_type || row.measurement_type || row.kr_title_name || '';
                const unitNameStr = unitName.toString().toLowerCase();
                const rowTypeStr = rowType.toString().toLowerCase();
                
                // Skip if this is a year-to-month/YTD/cumulative/yearly average row
                if (unitNameStr.includes('year-to-month') || 
                    unitNameStr.includes('ytd') || 
                    unitNameStr.includes('year to month') ||
                    unitNameStr.includes('yearly average') ||
                    unitNameStr.includes('cumulative') ||
                    rowTypeStr.includes('year-to-month') || 
                    rowTypeStr.includes('ytd') || 
                    rowTypeStr.includes('year to month') ||
                    rowTypeStr.includes('yearly average') ||
                    rowTypeStr.includes('cumulative')) {
                    filteredRowCount++;
                    return; // Skip this row
                }
                
                const monthStr = row[monthColumnName];
                const valueStr = row[valueColumnName];
                
                if (monthStr) {
                    monthSet.add(monthStr.trim());
                }
                
                // Create unique key for each KR
                const krKey = `${row.goal_name}|${row.objective_name}|${krName}`;
                
                if (!groupedData.has(krKey)) {
                    groupedData.set(krKey, {
                        goal_name: row.goal_name,
                        objective_name: row.objective_name,
                        kr_name: krName,
                        kr_topic_name: row.kr_topic_name,
                        kr_title_name: row.kr_title_name,
                        kr_owner_name: row.kr_owner_name,
                        ultimate_target_number: row.ultimate_target_number,
                        unit_name: row.unit_name,
                        monthlyData: new Map()
                    });
                }
                
                // Store monthly value
                if (monthStr && valueStr) {
                    let value = parseFloat(valueStr.replace(/,/g, ''));
                    if (!isNaN(value)) {
                        // If the KR unit is percentage-based and value is in decimal form (e.g. 0.71 = 71%),
                        // multiply by 100 to convert to proper percentage
                        const krUnitName = (row.unit_name || '').toString().toLowerCase();
                        const isPercentKR = krUnitName.includes('%') || krUnitName.includes('percent');
                        if (isPercentKR && Math.abs(value) <= 1) {
                            value = value * 100;
                        }
                        groupedData.get(krKey).monthlyData.set(monthStr.trim(), value);
                    }
                }
            });
            
            console.log('✓ Filtered out year-to-month/YTD/yearly average/cumulative rows:', filteredRowCount);
            console.log('Processing monthly data rows:', results.data.length - filteredRowCount);
            
            // Convert to array and sort months chronologically
            allMonths = Array.from(monthSet).sort((a, b) => {
                const dateA = parseMonthString(a);
                const dateB = parseMonthString(b);
                if (!dateA || !dateB) return 0;
                return dateA - dateB;
            });
            
            console.log('All months found:', allMonths);
            console.log('Total unique KRs:', groupedData.size);
            
            // Convert grouped data to array
            csvData = Array.from(groupedData.values());
            
            // Default to latest month
            selectedMonth = allMonths.length > 0 ? allMonths[allMonths.length - 1] : '';
            console.log('Selected month (latest):', selectedMonth);
            
            filteredData = [...csvData];
            populateFilters();
            renderAll();
            
            // Show success status instead of auto-navigating
            showUploadStatus('dataFileStatus', 'success', `✓ Loaded ${csvData.length} KRs from ${file.name}`);
            document.getElementById('uploadZone').classList.add('uploaded');
            document.getElementById('viewDashboardSection').style.display = 'block';
        },
        error: function(error) {
            showUploadStatus('dataFileStatus', 'error', `✗ Error: ${error.message}`);
        }
    });
}

// Populate filter dropdowns
function populateFilters() {
    // Populate month dropdown
    const monthFilter = document.getElementById('monthFilter');
    monthFilter.innerHTML = '<option value="">Latest Month</option>';
    
    // Add all months in reverse chronological order (newest first)
    [...allMonths].reverse().forEach(month => {
        const opt = document.createElement('option');
        opt.value = month;
        opt.textContent = month;
        monthFilter.appendChild(opt);
    });
    
    // Set to selected month (latest by default)
    monthFilter.value = selectedMonth || '';
    
    const goals = [...new Set(csvData.map(row => row.goal_name).filter(Boolean))];
    const objectives = [...new Set(csvData.map(row => row.objective_name).filter(Boolean))];
    const topics = [...new Set(csvData.map(row => {
        const topic = row.kr_topic_name;
        return topic === 'Efficency' ? 'Efficiency' : topic;
    }).filter(Boolean))];
    const owners = [...new Set(csvData.map(row => row.kr_owner_name).filter(Boolean))];
    
    populateSelect('goalFilter', goals);
    populateSelect('objectiveFilter', objectives);
    populateSelect('topicFilter', topics);
    populateSelect('ownerFilter', owners);
}

function populateSelect(id, options) {
    const select = document.getElementById(id);
    const currentValue = select.value;
    select.innerHTML = `<option value="">${select.options[0].text}</option>`;
    options.sort().forEach(option => {
        const opt = document.createElement('option');
        opt.value = option;
        opt.textContent = option;
        select.appendChild(opt);
    });
    select.value = currentValue;
}

// Apply filters
function applyFilters() {
    const goalFilter = document.getElementById('goalFilter').value;
    const objectiveFilter = document.getElementById('objectiveFilter').value;
    const topicFilter = document.getElementById('topicFilter').value;
    const ownerFilter = document.getElementById('ownerFilter').value;
    const monthFilterValue = document.getElementById('monthFilter').value;
    
    // Update selected month
    selectedMonth = monthFilterValue || (allMonths.length > 0 ? allMonths[allMonths.length - 1] : '');
    
    filteredData = csvData.filter(row => {
        return (!goalFilter || row.goal_name === goalFilter) &&
               (!objectiveFilter || row.objective_name === objectiveFilter) &&
               (!topicFilter || row.kr_topic_name === topicFilter || (topicFilter === 'Efficiency' && row.kr_topic_name === 'Efficency')) &&
               (!ownerFilter || row.kr_owner_name === ownerFilter);
    });
    
    renderAll();
}

// Reset filters
function resetFilters() {
    document.getElementById('monthFilter').value = '';
    document.getElementById('goalFilter').value = '';
    document.getElementById('objectiveFilter').value = '';
    document.getElementById('topicFilter').value = '';
    document.getElementById('ownerFilter').value = '';
    selectedMonth = allMonths.length > 0 ? allMonths[allMonths.length - 1] : '';
    filteredData = [...csvData];
    renderAll();
}

// Switch tabs
function switchTab(button, tabId) {
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    button.classList.add('active');
    document.getElementById(tabId).classList.add('active');
}

// Render all views
function renderAll() {
    updateStats();
    renderTopMovers();
    renderGoalHighlights();
    renderOKRCards();
    renderDataTable();
    renderActionItems();
    renderMonthlyProgress();
    renderHunterAnalysis();
    if (teamPerfRawData && teamPerfRawData.length > 0) {
        renderTeamPerformanceDynamic();
    }
    if (fleetData) {
        renderFleetAnalysis();
    }
}

// Update stats
function updateStats() {
    const dataWithTargets = filteredData.filter(row => {
        const target = getTarget(row);
        return target > 0;
    });
    
    let totalProgress = 0;
    let onTrackCount = 0;
    
    dataWithTargets.forEach(row => {
        const current = getLatestValue(row);
        const target = getTarget(row);
        const progress = target > 0 && current !== null ? (current / target) * 100 : 0;
        totalProgress += progress;
        if (progress >= 75) onTrackCount++;
    });
    
    const avgProgress = dataWithTargets.length > 0 ? totalProgress / dataWithTargets.length : 0;
    
    document.getElementById('totalOKRs').textContent = filteredData.length;
    document.getElementById('avgProgress').textContent = avgProgress.toFixed(1) + '%';
    document.getElementById('onTrack').textContent = onTrackCount;
}

// Get latest value (respects selected month filter)
function getLatestValue(row) {
    if (!row.monthlyData) return null;
    
    // If a specific month is selected, use only that month
    if (selectedMonth && row.monthlyData.has(selectedMonth)) {
        return row.monthlyData.get(selectedMonth);
    }
    
    // Otherwise, use the latest available month
    for (let i = allMonths.length - 1; i >= 0; i--) {
        if (row.monthlyData.has(allMonths[i])) {
            return row.monthlyData.get(allMonths[i]);
        }
    }
    
    return null;
}

// Get previous value (relative to selected month)
function getPreviousValue(row) {
    if (!row.monthlyData) return null;
    
    let targetMonthIndex = -1;
    
    // Find the index of the selected month or latest available
    if (selectedMonth) {
        targetMonthIndex = allMonths.indexOf(selectedMonth);
    } else {
        // Find latest available month
        for (let i = allMonths.length - 1; i >= 0; i--) {
            if (row.monthlyData.has(allMonths[i])) {
                targetMonthIndex = i;
                break;
            }
        }
    }
    
    if (targetMonthIndex <= 0) return null;
    
    // Get the previous month's value
    for (let i = targetMonthIndex - 1; i >= 0; i--) {
        if (row.monthlyData.has(allMonths[i])) {
            return row.monthlyData.get(allMonths[i]);
        }
    }
    
    return null;
}

// Calculate change
function calculateChange(current, previous) {
    if (current === null || previous === null || previous === 0) return null;
    return ((current - previous) / previous) * 100;
}

// Format number
function formatNumber(num) {
    if (num === null || isNaN(num)) return 'N/A';
    if (Math.abs(num) >= 100) {
        return Math.round(num).toLocaleString('en-US', {maximumFractionDigits: 0});
    }
    return num.toLocaleString('en-US', {maximumFractionDigits: 2});
}

// Get class for number length
function getNumberLengthClass(num) {
    if (num === null || num === undefined || isNaN(num)) return '';
    const formatted = formatNumber(num);
    const length = formatted.replace(/,/g, '').length;
    if (length >= 10) return 'very-long-number';
    if (length >= 7) return 'long-number';
    return '';
}

// Get class for a pair of numbers
function getNumberPairLengthClass(num1, num2) {
    if ((num1 === null || num1 === undefined || isNaN(num1)) && 
        (num2 === null || num2 === undefined || isNaN(num2))) return '';
    
    const formatted1 = formatNumber(num1);
    const formatted2 = formatNumber(num2);
    const length1 = formatted1 === 'N/A' ? 0 : formatted1.replace(/,/g, '').length;
    const length2 = formatted2 === 'N/A' ? 0 : formatted2.replace(/,/g, '').length;
    
    const maxLength = Math.max(length1, length2);
    if (maxLength >= 9) return 'very-long-number';
    if (maxLength >= 7) return 'long-number';
    return '';
}

// Get topic class
function getTopicClass(topic) {
    if (!topic) return '';
    const topicLower = topic.toLowerCase();
    if (topicLower.includes('growth')) return 'growth';
    if (topicLower.includes('efficiency') || topicLower.includes('efficency')) return 'efficiency';
    if (topicLower.includes('service')) return 'service';
    if (topicLower.includes('experience')) return 'experience';
    return '';
}

// Get topic badge color
function getTopicBadgeColor(topic) {
    if (!topic) return 'var(--topic-default)';
    const topicLower = topic.toLowerCase();
    if (topicLower.includes('growth')) return 'var(--topic-growth)';
    if (topicLower.includes('efficiency') || topicLower.includes('efficency')) return 'var(--topic-efficiency)';
    if (topicLower.includes('service')) return 'var(--topic-service)';
    if (topicLower.includes('experience')) return 'var(--topic-experience)';
    return 'var(--topic-default)';
}

// Extract title from brackets
function extractTitle(text) {
    if (!text) return '';
    const match = text.match(/\[(.*?)\]/);
    return match ? match[1] : '';
}

// Get short title
function getShortTitle(text) {
    if (!text) return '';
    const match = text.match(/\[(.*?)\]/);
    if (match) return match[1];
    const trimmed = text.trim();
    if (trimmed.length > 50) {
        return trimmed.substring(0, 50) + '...';
    }
    return trimmed;
}

// Parse KR level
function parseKRLevel(krName) {
    if (!krName) return { level: 0, number: '', fullNumber: '' };
    const match = krName.match(/KR[\s-]*([\d.]+)/i);
    if (!match) return { level: 0, number: krName, fullNumber: krName };
    const fullNumber = match[1];
    const parts = fullNumber.split('.');
    const level = parts.length;
    return { level, number: fullNumber, fullNumber: krName };
}

// Organize KR hierarchy
function organizeKRHierarchy(krs) {
    const sortedKrs = krs.slice().sort((a, b) => {
        const aNum = parseKRLevel(a.kr_name).number;
        const bNum = parseKRLevel(b.kr_name).number;
        const aParts = aNum.split('.').map(n => parseInt(n) || 0);
        const bParts = bNum.split('.').map(n => parseInt(n) || 0);
        for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
            const aVal = aParts[i] || 0;
            const bVal = bParts[i] || 0;
            if (aVal !== bVal) return aVal - bVal;
        }
        return 0;
    });
    
    const organized = [];
    const map = new Map();
    
    sortedKrs.forEach(kr => {
        const krInfo = parseKRLevel(kr.kr_name);
        kr._krLevel = krInfo.level;
        kr._krNumber = krInfo.number;
        const node = { kr, children: [] };
        map.set(krInfo.number, node);
        const parts = krInfo.number.split('.');
        if (parts.length === 1) {
            organized.push(node);
        } else {
            let parent = null;
            for (let i = parts.length - 1; i > 0; i--) {
                const potentialParentNumber = parts.slice(0, i).join('.');
                parent = map.get(potentialParentNumber);
                if (parent) break;
            }
            if (parent) {
                parent.children.push(node);
            } else {
                organized.push(node);
            }
        }
    });
    
    return organized;
}

// Render Monthly Progress View
function renderMonthlyProgress() {
    const container = document.getElementById('monthlyProgressContainer');
    container.innerHTML = '';
    
    if (monthlyTargets.size === 0) {
        container.innerHTML = `
            <div class="no-monthly-data">
                <h3 style="margin-bottom: 1rem;">📅 Monthly Progress Tracking</h3>
                <p>Upload a monthly targets CSV file to see detailed monthly progress tracking.</p>
                <p style="margin-top: 0.5rem; font-size: 0.9rem;">
                    The CSV should have columns: <code>kr_name</code>, <code>month</code>, <code>monthly_target</code>
                </p>
            </div>
        `;
        return;
    }
    
    // NOTE: Monthly Progress view filters to show only 2026 months
    // This focuses the view on current year targets
    
    // Create grid of KR cards with monthly progress
    const grid = document.createElement('div');
    grid.className = 'monthly-grid';
    
    filteredData.forEach(row => {
        const krName = row.kr_name;
        if (!monthlyTargets.has(krName)) return; // Skip if no monthly targets
        
        const card = createMonthlyProgressCard(row);
        grid.appendChild(card);
    });
    
    if (grid.children.length === 0) {
        container.innerHTML = `
            <div class="no-monthly-data">
                No monthly targets found for the filtered KRs.
            </div>
        `;
    } else {
        container.appendChild(grid);
    }
}

// Create individual monthly progress card
function createMonthlyProgressCard(row) {
    const card = document.createElement('div');
    card.className = 'monthly-kr-card';
    
    const krName = row.kr_name;
    const krTitle = getShortTitle(row.kr_title_name || '');
    const krMonthlyTargets = monthlyTargets.get(krName);
    
    // Build header
    const header = document.createElement('div');
    header.className = 'monthly-kr-header';
    header.innerHTML = `
        <div class="monthly-kr-name">${krName}</div>
        ${krTitle ? `<div class="monthly-kr-title">${krTitle}</div>` : ''}
    `;
    card.appendChild(header);
    
    // Calculate monthly progress for each month
    const monthlyProgressBars = document.createElement('div');
    
    // Filter to only show 2026 months
    const display2026Months = allMonths.filter(month => month.includes('2026'));
    
    display2026Months.forEach(month => {
        const monthlyTarget = krMonthlyTargets?.get(month);
        const actualValue = row.monthlyData?.get(month);
        
        if (monthlyTarget === undefined && actualValue === undefined) return;
        
        const progressBar = document.createElement('div');
        progressBar.className = 'monthly-progress-bar';
        
        let progressPercent = 0;
        let progressClass = 'poor';
        let displayText = 'No data';
        let statusBadge = '';
        
        if (monthlyTarget && actualValue !== null && actualValue !== undefined) {
            progressPercent = (actualValue / monthlyTarget) * 100;
            
            // Determine status badge and class - MUST MATCH
            if (progressPercent >= 100) {
                progressClass = 'excellent';  // Green bar
                statusBadge = '<span class="status-badge achieved">✓ Achieved Target</span>';
            } else if (progressPercent >= 90) {
                progressClass = 'good';  // Yellow bar (changed from 'good' to match yellow)
                statusBadge = '<span class="status-badge slightly-under">⚠ Slightly Under Target</span>';
            } else {
                progressClass = 'poor';  // Red bar
                statusBadge = '<span class="status-badge under">✗ Under Target</span>';
            }
            
            displayText = `${progressPercent.toFixed(1)}% (${formatNumber(actualValue)} / ${formatNumber(monthlyTarget)})`;
        } else if (monthlyTarget) {
            displayText = `Target: ${formatNumber(monthlyTarget)}`;
        } else if (actualValue !== null && actualValue !== undefined) {
            displayText = `Actual: ${formatNumber(actualValue)}`;
        }
        
        const labelClass = actualValue && monthlyTarget && actualValue >= monthlyTarget ? 'over-target' : 
                          actualValue && monthlyTarget ? 'under-target' : '';
        
        progressBar.innerHTML = `
            <div class="monthly-progress-label">
                <span class="monthly-progress-label-month">${month}</span>
                <span class="monthly-progress-label-value ${labelClass}">${displayText}</span>
            </div>
            ${statusBadge}
            ${monthlyTarget ? `
                <div class="monthly-bar-container">
                    <div class="monthly-bar-fill ${progressClass}" style="width: ${Math.min(progressPercent, 100)}%"></div>
                </div>
            ` : ''}
        `;
        
        monthlyProgressBars.appendChild(progressBar);
    });
    
    card.appendChild(monthlyProgressBars);
    
    // Calculate overall stats
    const stats = document.createElement('div');
    stats.className = 'monthly-stats-grid';
    
    let totalTarget = 0;
    let totalActual = 0;
    let monthsOnTrack = 0;
    let monthsTracked = 0;
    
    // Filter to only 2026 months for stats calculation
    const statsMonths2026 = allMonths.filter(month => month.includes('2026'));
    
    statsMonths2026.forEach(month => {
        const target = krMonthlyTargets?.get(month);
        const actual = row.monthlyData?.get(month);
        
        if (target && actual !== null && actual !== undefined) {
            totalTarget += target;
            totalActual += actual;
            monthsTracked++;
            if (actual >= target) monthsOnTrack++;
        }
    });
    
    const overallProgress = totalTarget > 0 ? (totalActual / totalTarget) * 100 : 0;
    const onTrackPercent = monthsTracked > 0 ? (monthsOnTrack / monthsTracked) * 100 : 0;
    
    stats.innerHTML = `
        <div class="monthly-stat-box">
            <div class="monthly-stat-label">Overall Progress</div>
            <div class="monthly-stat-value">${overallProgress.toFixed(1)}%</div>
        </div>
        <div class="monthly-stat-box">
            <div class="monthly-stat-label">Months On Track</div>
            <div class="monthly-stat-value">${monthsOnTrack}/${monthsTracked}</div>
        </div>
        <div class="monthly-stat-box">
            <div class="monthly-stat-label">Success Rate</div>
            <div class="monthly-stat-value">${onTrackPercent.toFixed(0)}%</div>
        </div>
    `;
    
    card.appendChild(stats);
    
    return card;
}

// [CONTINUE WITH ORIGINAL FUNCTIONS - Top Movers, Cards, Table, Action Items...]

// Render Top Movers
function renderTopMovers() {
    const dataWithChanges = filteredData.map(row => {
        const current = getLatestValue(row);
        const previous = getPreviousValue(row);
        const change = calculateChange(current, previous);
        return { ...row, current, previous, change };
    }).filter(row => {
        return row.change !== null && !isNaN(row.change) && isFinite(row.change) &&
               row.current !== null && row.previous !== null &&
               row.current !== 0 && row.previous !== 0;
    });
    
    const sorted = [...dataWithChanges].sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
    const topGrowth = sorted.filter(row => row.change > 0).slice(0, 5);
    const topDrop = sorted.filter(row => row.change < 0).slice(0, 5);
    
    const topGrowthContainer = document.getElementById('topGrowth');
    topGrowthContainer.innerHTML = '';
    
    if (topGrowth.length === 0) {
        topGrowthContainer.innerHTML = '<div class="no-data" style="padding: 1.5rem;">No growth data available</div>';
    } else {
        topGrowth.forEach((item, index) => {
            const div = document.createElement('div');
            div.className = 'mover-item growth-item';
            div.innerHTML = `
                <div class="mover-rank growth-rank">#${index + 1}</div>
                <div class="mover-kr-name">${item.kr_name || 'N/A'}</div>
                <div class="mover-kr-title">${item.kr_title_name || 'No description'}</div>
                <div class="mover-stats">
                    <div class="mover-change positive">↑ ${item.change.toFixed(1)}%</div>
                    <div class="mover-details">
                        <div><strong>Current:</strong> ${formatNumber(item.current)}</div>
                        <div><strong>Previous:</strong> ${formatNumber(item.previous)}</div>
                        <div style="margin-top: 0.5rem; color: var(--text-muted); font-size: 0.8rem;">
                            ${item.goal_name} → ${item.objective_name}
                        </div>
                    </div>
                </div>
            `;
            topGrowthContainer.appendChild(div);
        });
    }
    
    const topDropContainer = document.getElementById('topDrop');
    topDropContainer.innerHTML = '';
    
    if (topDrop.length === 0) {
        topDropContainer.innerHTML = '<div class="no-data" style="padding: 1.5rem;">No declining KRs detected</div>';
    } else {
        topDrop.forEach((item, index) => {
            const div = document.createElement('div');
            div.className = 'mover-item drop-item';
            div.innerHTML = `
                <div class="mover-rank drop-rank">#${index + 1}</div>
                <div class="mover-kr-name">${item.kr_name || 'N/A'}</div>
                <div class="mover-kr-title">${item.kr_title_name || 'No description'}</div>
                <div class="mover-stats">
                    <div class="mover-change negative">↓ ${Math.abs(item.change).toFixed(1)}%</div>
                    <div class="mover-details">
                        <div><strong>Current:</strong> ${formatNumber(item.current)}</div>
                        <div><strong>Previous:</strong> ${formatNumber(item.previous)}</div>
                        <div style="margin-top: 0.5rem; color: var(--text-muted); font-size: 0.8rem;">
                            ${item.goal_name} → ${item.objective_name}
                        </div>
                    </div>
                </div>
            `;
            topDropContainer.appendChild(div);
        });
    }
}

// Render Goal Highlights
function renderGoalHighlights() {
    const container = document.getElementById('goalHighlightsContainer');
    if (!container) return;
    
    container.innerHTML = '';
    
    // Group data by Goal
    const goalData = {};
    
    filteredData.forEach(row => {
        const goalName = row.goal_name || 'Uncategorized';
        if (!goalData[goalName]) {
            goalData[goalName] = {
                goalName: goalName,
                krs: [],
                goalTitle: getShortTitle(row.kr_title_name || '')
            };
        }
        
        const current = getLatestValue(row);
        const previous = getPreviousValue(row);
        const target = getTarget(row);
        const progress = target > 0 && current !== null ? (current / target) * 100 : 0;
        const change = calculateChange(current, previous);
        
        goalData[goalName].krs.push({
            ...row,
            current,
            previous,
            target,
            progress,
            change
        });
    });
    
    // Sort goals alphabetically
    const sortedGoals = Object.keys(goalData).sort();
    
    // Generate highlights for each goal
    sortedGoals.forEach((goalName, index) => {
        const goal = goalData[goalName];
        const krsWithTargets = goal.krs.filter(kr => kr.target > 0);
        
        if (krsWithTargets.length === 0) return;
        
        // Calculate goal-level statistics
        const totalKRs = krsWithTargets.length;
        const achievedKRs = krsWithTargets.filter(kr => kr.progress >= 100).length;
        const slightlyUnderKRs = krsWithTargets.filter(kr => kr.progress >= 90 && kr.progress < 100).length;
        const underKRs = krsWithTargets.filter(kr => kr.progress < 90).length;
        
        const avgProgress = krsWithTargets.reduce((sum, kr) => sum + kr.progress, 0) / totalKRs;
        
        // Find best and worst performing KRs
        const sortedByProgress = [...krsWithTargets].sort((a, b) => b.progress - a.progress);
        const bestKR = sortedByProgress[0];
        const worstKR = sortedByProgress[sortedByProgress.length - 1];
        
        // Find biggest change
        const krsWithChange = krsWithTargets.filter(kr => kr.change !== null && !isNaN(kr.change) && isFinite(kr.change));
        const biggestGrowth = krsWithChange.length > 0 ? 
            krsWithChange.reduce((max, kr) => kr.change > max.change ? kr : max, krsWithChange[0]) : null;
        
        // Determine overall status based on achievement thresholds
        const successRate = (achievedKRs / totalKRs) * 100;
        let statusColor, statusBg, statusText;
        
        if (successRate >= 100) {
            statusColor = '#10B981';
            statusBg = '#F0FDF4';
            statusText = 'Achieved Target';
        } else if (successRate >= 90) {
            statusColor = '#F59E0B';
            statusBg = '#FFFBEB';
            statusText = 'Slightly Under Target';
        } else {
            statusColor = '#EF4444';
            statusBg = '#FEF2F2';
            statusText = 'Under Target';
        }
        
        // Generate highlight card
        const highlightCard = document.createElement('div');
        highlightCard.style.cssText = `
            display: flex;
            gap: 1rem;
            align-items: flex-start;
            padding: 1.5rem;
            background: ${statusBg};
            border-radius: 12px;
            border-left: 4px solid ${statusColor};
            margin-bottom: 1rem;
        `;
        
        highlightCard.innerHTML = `
            <div style="background: ${statusColor}; color: white; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; flex-shrink: 0; font-size: 1.2rem;">
                ${index + 1}
            </div>
            <div style="flex: 1;">
                <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem;">
                    <div style="font-weight: 700; font-size: 1.125rem; color: var(--primary);">
                        ${goalName}${goal.goalTitle ? ` - ${goal.goalTitle}` : ''}
                    </div>
                    <span style="display: inline-block; padding: 0.25rem 0.75rem; background: ${statusColor}; color: white; border-radius: 12px; font-size: 0.75rem; font-weight: 600;">
                        ${statusText}
                    </span>
                </div>
                
                <div style="color: var(--text-secondary); line-height: 1.6; margin-bottom: 1rem;">
                    <strong>${achievedKRs} of ${totalKRs} KRs (${successRate.toFixed(1)}%)</strong> have achieved their targets. 
                    Average progress across all KRs is <strong>${avgProgress.toFixed(1)}%</strong>.
                    ${slightlyUnderKRs > 0 ? ` <span style="color: #D97706;">${slightlyUnderKRs} KRs are slightly under target (90-99%)</span>,` : ''}
                    ${underKRs > 0 ? ` and <span style="color: #DC2626;">${underKRs} KRs need attention (<90%)</span>.` : '.'}
                </div>
                
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-top: 1rem;">
                    <div style="background: white; padding: 0.75rem; border-radius: 8px; border: 1px solid rgba(0,0,0,0.1);">
                        <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem;">🏆 Best Performer</div>
                        <div style="font-weight: 600; color: var(--primary); font-size: 0.9rem;">${bestKR.kr_name}</div>
                        <div style="display: flex; justify-content: space-between; margin-top: 0.5rem; font-size: 0.75rem;">
                            <div>
                                <div style="color: var(--text-muted); margin-bottom: 0.25rem;">CURRENT</div>
                                <div style="font-weight: 700; color: var(--primary); font-family: 'IBM Plex Mono', monospace;">${formatNumber(bestKR.current)}</div>
                                <div style="color: var(--text-muted); font-size: 0.7rem;">${bestKR.unit_name || ''}</div>
                            </div>
                            <div style="text-align: right;">
                                <div style="color: var(--text-muted); margin-bottom: 0.25rem;">TARGET</div>
                                <div style="font-weight: 700; color: var(--primary); font-family: 'IBM Plex Mono', monospace;">${formatNumber(bestKR.target)}</div>
                                <div style="color: var(--text-muted); font-size: 0.7rem;">${bestKR.unit_name || ''}</div>
                            </div>
                        </div>
                        <div style="color: #10B981; font-weight: 700; margin-top: 0.5rem; font-size: 0.85rem;">${bestKR.progress.toFixed(1)}% achieved</div>
                    </div>
                    
                    ${worstKR.progress < 90 ? `
                        <div style="background: white; padding: 0.75rem; border-radius: 8px; border: 1px solid rgba(0,0,0,0.1);">
                            <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem;">⚠️ Needs Focus</div>
                            <div style="font-weight: 600; color: var(--primary); font-size: 0.9rem;">${worstKR.kr_name}</div>
                            <div style="display: flex; justify-content: space-between; margin-top: 0.5rem; font-size: 0.75rem;">
                                <div>
                                    <div style="color: var(--text-muted); margin-bottom: 0.25rem;">CURRENT</div>
                                    <div style="font-weight: 700; color: var(--primary); font-family: 'IBM Plex Mono', monospace;">${formatNumber(worstKR.current)}</div>
                                    <div style="color: var(--text-muted); font-size: 0.7rem;">${worstKR.unit_name || ''}</div>
                                </div>
                                <div style="text-align: right;">
                                    <div style="color: var(--text-muted); margin-bottom: 0.25rem;">TARGET</div>
                                    <div style="font-weight: 700; color: var(--primary); font-family: 'IBM Plex Mono', monospace;">${formatNumber(worstKR.target)}</div>
                                    <div style="color: var(--text-muted); font-size: 0.7rem;">${worstKR.unit_name || ''}</div>
                                </div>
                            </div>
                            <div style="color: #EF4444; font-weight: 700; margin-top: 0.5rem; font-size: 0.85rem;">${worstKR.progress.toFixed(1)}% achieved</div>
                        </div>
                    ` : ''}
                    
                    ${biggestGrowth && biggestGrowth.change > 0 ? `
                        <div style="background: white; padding: 0.75rem; border-radius: 8px; border: 1px solid rgba(0,0,0,0.1);">
                            <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem;">📈 Biggest Growth</div>
                            <div style="font-weight: 600; color: var(--primary); font-size: 0.9rem;">${biggestGrowth.kr_name}</div>
                            <div style="display: flex; justify-content: space-between; margin-top: 0.5rem; font-size: 0.75rem;">
                                <div>
                                    <div style="color: var(--text-muted); margin-bottom: 0.25rem;">CURRENT</div>
                                    <div style="font-weight: 700; color: var(--primary); font-family: 'IBM Plex Mono', monospace;">${formatNumber(biggestGrowth.current)}</div>
                                    <div style="color: var(--text-muted); font-size: 0.7rem;">${biggestGrowth.unit_name || ''}</div>
                                </div>
                                <div style="text-align: right;">
                                    <div style="color: var(--text-muted); margin-bottom: 0.25rem;">TARGET</div>
                                    <div style="font-weight: 700; color: var(--primary); font-family: 'IBM Plex Mono', monospace;">${formatNumber(biggestGrowth.target)}</div>
                                    <div style="color: var(--text-muted); font-size: 0.7rem;">${biggestGrowth.unit_name || ''}</div>
                                </div>
                            </div>
                            <div style="color: #10B981; font-weight: 700; margin-top: 0.5rem; font-size: 0.85rem;">+${biggestGrowth.change.toFixed(1)}% change</div>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
        
        container.appendChild(highlightCard);
    });
    
    if (container.children.length === 0) {
        container.innerHTML = '<div class="no-data">No goal data available</div>';
    }
}

// Render action items
function renderActionItems() {
    const actionItemsContainer = document.getElementById('actionItemsContainer');
    actionItemsContainer.innerHTML = '';
    
    const actionItems = [];
    const dataWithChanges = filteredData.map(row => {
        const current = getLatestValue(row);
        const previous = getPreviousValue(row);
        const target = getTarget(row);
        const progress = target > 0 && current !== null ? (current / target) * 100 : 0;
        const change = calculateChange(current, previous);
        return { ...row, current, previous, target, progress, change };
    });
    
    const criticalItems = dataWithChanges.filter(row => row.progress > 0 && row.progress < 50);
    if (criticalItems.length > 0) {
        actionItems.push({
            priority: 'high',
            title: `${criticalItems.length} Critical OKRs Below 50% Progress`,
            description: `These KRs are significantly behind target and require immediate attention.`,
            owner: 'Department Heads',
            timeline: 'Immediate (This Week)',
            impact: 'High - Goal Achievement',
            relatedKRs: criticalItems.slice(0, 3).map(r => r.kr_name),
            details: 'Review resource allocation, identify blockers, create recovery plans'
        });
    }
    
    const decliningItems = dataWithChanges.filter(row => row.change !== null && row.change < -10);
    if (decliningItems.length > 0) {
        actionItems.push({
            priority: 'high',
            title: `${decliningItems.length} OKRs Showing Negative Trend`,
            description: `Performance declining compared to previous period.`,
            owner: 'Initiative Owners',
            timeline: '1-2 Weeks',
            impact: 'Medium-High - Performance',
            relatedKRs: decliningItems.slice(0, 3).map(r => r.kr_name),
            details: 'Analyze root causes and implement corrective actions'
        });
    }
    
    const dataQualityIssues = dataWithChanges.filter(row => row.current === null || row.current === 0).length;
    if (dataQualityIssues > 5) {
        actionItems.push({
            priority: 'high',
            title: `Data Quality Investigation Required`,
            description: `${dataQualityIssues} KRs with zero or null values.`,
            owner: 'Data/BI Team Lead',
            timeline: 'Immediate (24 hours)',
            impact: 'Critical - Data Integrity',
            relatedKRs: ['Multiple KRs affected'],
            details: 'Verify data sources, ETL processes, reporting mechanisms'
        });
    }
    
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    actionItems.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
    
    if (actionItems.length === 0) {
        actionItemsContainer.innerHTML = '<div class="no-data">No action items. All KRs on track!</div>';
    } else {
        actionItems.forEach((item, index) => {
            const div = document.createElement('div');
            div.className = `action-item ${item.priority}-priority`;
            div.innerHTML = `
                <div class="action-header">
                    <div class="action-title">${index + 1}. ${item.title}</div>
                    <span class="priority-badge priority-${item.priority}">${item.priority} Priority</span>
                </div>
                <div class="action-description">${item.description}</div>
                <div class="action-meta">
                    <div class="action-meta-item">
                        <span class="action-meta-label">👤 Owner:</span>
                        <span class="action-meta-value">${item.owner}</span>
                    </div>
                    <div class="action-meta-item">
                        <span class="action-meta-label">⏱ï¸ Timeline:</span>
                        <span class="action-meta-value">${item.timeline}</span>
                    </div>
                    <div class="action-meta-item">
                        <span class="action-meta-label">📊 Impact:</span>
                        <span class="action-meta-value">${item.impact}</span>
                    </div>
                </div>
                ${item.relatedKRs && item.relatedKRs.length > 0 ? `
                    <div class="related-krs">
                        <div class="related-krs-label">Related KRs:</div>
                        ${item.relatedKRs.map(kr => `<span class="related-kr-tag">${kr}</span>`).join('')}
                    </div>
                ` : ''}
                <div style="margin-top: 12px; font-size: 0.85em; color: var(--text-muted); font-style: italic;">
                    ${item.details}
                </div>
            `;
            actionItemsContainer.appendChild(div);
        });
    }
}

// [Continue with renderOKRCards - copying from original script.js...]

// Render OKR Cards
function renderOKRCards() {
    const grid = document.getElementById('okrGrid');
    grid.innerHTML = '';
    
    if (filteredData.length === 0) {
        grid.innerHTML = '<div class="no-data">No data matches your filters</div>';
        return;
    }
    
    const hierarchy = {};
    filteredData.forEach(row => {
        const goalName = row.goal_name || 'Uncategorized Goal';
        const objName = row.objective_name || 'Uncategorized Objective';
        if (!hierarchy[goalName]) hierarchy[goalName] = {};
        if (!hierarchy[goalName][objName]) {
            hierarchy[goalName][objName] = { title: row.kr_title_name || '', krs: [] };
        }
        hierarchy[goalName][objName].krs.push(row);
    });
    
    Object.keys(hierarchy).forEach(goalName => {
        const goalSection = document.createElement('div');
        goalSection.className = 'goal-section';
        const firstObjName = Object.keys(hierarchy[goalName])[0];
        const firstKR = hierarchy[goalName][firstObjName]?.krs[0];
        const goalTitle = firstKR ? getShortTitle(firstKR.kr_title_name) : '';
        const goalHeader = document.createElement('div');
        goalHeader.className = 'goal-header';
        goalHeader.innerHTML = `${goalName}${goalTitle ? ` <span style="color: var(--text-secondary); font-weight: 600; font-size: 0.8em;">- ${goalTitle}</span>` : ''}`;
        goalSection.appendChild(goalHeader);
        
        const objectivesContainer = document.createElement('div');
        objectivesContainer.className = 'objectives-container';
        
        Object.keys(hierarchy[goalName]).forEach(objName => {
            const objData = hierarchy[goalName][objName];
            const objTitle = extractTitle(objData.krs[0]?.kr_title_name || '');
            const objSection = document.createElement('div');
            objSection.className = 'objective-section';
            const objHeader = document.createElement('div');
            objHeader.className = 'objective-header';
            objHeader.innerHTML = `${objName}${objTitle ? ` - <span style="color: var(--text-secondary); font-weight: 600;">${objTitle}</span>` : ''}`;
            objSection.appendChild(objHeader);
            
            const organizedKRs = organizeKRHierarchy(objData.krs);
            
            function renderKRNode(nodes, container, indent = 0) {
                nodes.forEach(item => {
                    const row = item.kr;
                    const hasChildren = item.children && item.children.length > 0;
                    const krContainer = document.createElement('div');
                    krContainer.style.marginBottom = '1.5rem';
                    if (indent > 0) {
                        krContainer.style.marginLeft = `${indent * 1.5}rem`;
                        krContainer.style.borderLeft = '3px solid rgba(255, 107, 53, 0.3)';
                        krContainer.style.paddingLeft = '1rem';
                    }
                    
                    const latestValue = getLatestValue(row);
                    const target = getTarget(row);
                    const progress = target > 0 && latestValue !== null ? Math.min((latestValue / target) * 100, 100) : 0;
                    const numberClass = getNumberPairLengthClass(latestValue, target);
                    const card = document.createElement('div');
                    card.className = `okr-card ${getTopicClass(row.kr_topic_name)} horizontal-layout`;
                    
                    if (hasChildren) {
                        card.style.borderLeftWidth = '6px';
                        card.style.background = 'linear-gradient(135deg, rgba(255, 107, 53, 0.05), transparent)';
                        card.style.marginBottom = '1rem';
                    }
                    
                    let progressClass = '';
                    if (progress >= 75) progressClass = 'high';
                    else if (progress >= 50) progressClass = 'medium';
                    else progressClass = 'low';
                    
                    const krShortTitle = getShortTitle(row.kr_title_name || '');
                    card.innerHTML = `
                        <div class="kr-header">
                            <div class="kr-name">${row.kr_name || 'N/A'}${krShortTitle ? ` <span style="color: var(--accent); font-weight: 700;">[${krShortTitle}]</span>` : ''}</div>
                            ${row.kr_owner_name ? `<div class="kr-owner">👤 ${row.kr_owner_name}</div>` : ''}
                        </div>
                        <div class="kr-metrics">
                            <div class="kr-metric">
                                <div class="kr-metric-label">Current</div>
                                <div class="kr-metric-value ${numberClass}">${formatNumber(latestValue)}</div>
                                <div class="kr-unit">${row.unit_name || ''}</div>
                            </div>
                            <div class="kr-metric">
                                <div class="kr-metric-label">Target</div>
                                <div class="kr-metric-value ${numberClass}">${formatNumber(target)}</div>
                                <div class="kr-unit">${row.unit_name || ''}</div>
                            </div>
                        </div>
                        ${target > 0 ? `
                            <div class="progress-section" style="width: 100%;">
                                <div class="progress-bar-container">
                                    <div class="progress-bar ${progressClass}" style="width: ${progress}%"></div>
                                </div>
                                <div style="text-align: center; margin-top: 10px; color: var(--text-muted); font-size: 0.9em;">
                                    ${progress.toFixed(1)}% achieved
                                </div>
                            </div>
                        ` : ''}
                    `;
                    krContainer.appendChild(card);
                    
                    if (hasChildren) {
                        const childrenHaveChildren = item.children.some(child => child.children && child.children.length > 0);
                        if (childrenHaveChildren) {
                            const childrenContainer = document.createElement('div');
                            renderKRNode(item.children, childrenContainer, indent + 1);
                            krContainer.appendChild(childrenContainer);
                        } else {
                            const childrenGrid = document.createElement('div');
                            childrenGrid.className = 'krs-grid';
                            childrenGrid.style.marginTop = '1rem';
                            childrenGrid.style.marginLeft = `${(indent + 1) * 1.5}rem`;
                            childrenGrid.style.borderLeft = '3px solid rgba(255, 107, 53, 0.3)';
                            childrenGrid.style.paddingLeft = '1rem';
                            
                            item.children.forEach(childItem => {
                                const childRow = childItem.kr;
                                const childLatestValue = getLatestValue(childRow);
                                const childTarget = getTarget(childRow);
                                const childProgress = childTarget > 0 && childLatestValue !== null ? Math.min((childLatestValue / childTarget) * 100, 100) : 0;
                                let childProgressClass = '';
                                if (childProgress >= 75) childProgressClass = 'high';
                                else if (childProgress >= 50) childProgressClass = 'medium';
                                else childProgressClass = 'low';
                                const childKrTitle = getShortTitle(childRow.kr_title_name || '');
                                const childNumberClass = getNumberPairLengthClass(childLatestValue, childTarget);
                                const childCard = document.createElement('div');
                                childCard.className = `okr-card ${getTopicClass(childRow.kr_topic_name)} horizontal-layout`;
                                childCard.innerHTML = `
                                    <div class="kr-header">
                                        <div class="kr-name">${childRow.kr_name || 'N/A'}${childKrTitle ? ` <span style="color: var(--accent); font-weight: 700;">[${childKrTitle}]</span>` : ''}</div>
                                        ${childRow.kr_owner_name ? `<div class="kr-owner">👤 ${childRow.kr_owner_name}</div>` : ''}
                                    </div>
                                    <div class="kr-metrics">
                                        <div class="kr-metric">
                                            <div class="kr-metric-label">Current</div>
                                            <div class="kr-metric-value ${childNumberClass}">${formatNumber(childLatestValue)}</div>
                                            <div class="kr-unit">${childRow.unit_name || ''}</div>
                                        </div>
                                        <div class="kr-metric">
                                            <div class="kr-metric-label">Target</div>
                                            <div class="kr-metric-value ${childNumberClass}">${formatNumber(childTarget)}</div>
                                            <div class="kr-unit">${childRow.unit_name || ''}</div>
                                        </div>
                                    </div>
                                    ${childTarget > 0 ? `
                                        <div class="progress-section" style="width: 100%;">
                                            <div class="progress-bar-container">
                                                <div class="progress-bar ${childProgressClass}" style="width: ${childProgress}%"></div>
                                            </div>
                                            <div style="text-align: center; margin-top: 10px; color: var(--text-muted); font-size: 0.9em;">
                                                ${childProgress.toFixed(1)}% achieved
                                            </div>
                                        </div>
                                    ` : ''}
                                `;
                                childrenGrid.appendChild(childCard);
                            });
                            krContainer.appendChild(childrenGrid);
                        }
                    }
                    container.appendChild(krContainer);
                });
            }
            
            const krSection = document.createElement('div');
            renderKRNode(organizedKRs, krSection, 0);
            objSection.appendChild(krSection);
            objectivesContainer.appendChild(objSection);
        });
        
        goalSection.appendChild(objectivesContainer);
        grid.appendChild(goalSection);
    });
}

// Render data table
function renderDataTable() {
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';
    if (filteredData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="no-data">No data matches your filters</td></tr>';
        return;
    }
    
    const hierarchy = {};
    filteredData.forEach(row => {
        const goalName = row.goal_name || 'Uncategorized Goal';
        const objName = row.objective_name || 'Uncategorized Objective';
        if (!hierarchy[goalName]) hierarchy[goalName] = {};
        if (!hierarchy[goalName][objName]) {
            hierarchy[goalName][objName] = { title: extractTitle(row.kr_title_name || ''), krs: [] };
        }
        hierarchy[goalName][objName].krs.push(row);
    });
    
    Object.keys(hierarchy).forEach(goalName => {
        const firstObjName = Object.keys(hierarchy[goalName])[0];
        const firstKR = hierarchy[goalName][firstObjName]?.krs[0];
        const goalTitle = firstKR ? getShortTitle(firstKR.kr_title_name) : '';
        const goalRow = document.createElement('tr');
        goalRow.className = 'goal-row';
        goalRow.innerHTML = `<td colspan="7"><strong>📌 ${goalName}</strong>${goalTitle ? ` <span class="goal-title-text">- ${goalTitle}</span>` : ''}</td>`;
        tbody.appendChild(goalRow);
        
        Object.keys(hierarchy[goalName]).forEach(objName => {
            const objData = hierarchy[goalName][objName];
            const objTitle = extractTitle(objData.krs[0]?.kr_title_name || '');
            const objRow = document.createElement('tr');
            objRow.className = 'objective-row';
            objRow.innerHTML = `<td colspan="7"><strong>🎯 ${objName}</strong>${objTitle ? ` <span class="obj-title-text">- ${objTitle}</span>` : ''}</td>`;
            tbody.appendChild(objRow);
            
            const organizedKRs = organizeKRHierarchy(objData.krs);
            
            function renderKRRows(nodes, indent = 0) {
                nodes.forEach(item => {
                    const row = item.kr;
                    const current = getLatestValue(row);
                    const previous = getPreviousValue(row);
                    const target = getTarget(row);
                    const change = calculateChange(current, previous);
                    const progress = target > 0 && current !== null ? ((current / target) * 100) : 0;
                    let changeTrendClass = 'trend-neutral';
                    let changeDisplay = 'N/A';
                    if (change !== null && !isNaN(change) && isFinite(change)) {
                        changeTrendClass = change >= 0 ? 'trend-positive' : 'trend-negative';
                        changeDisplay = `${change >= 0 ? '↑' : '↓'} ${Math.abs(change).toFixed(1)}%`;
                    }
                    const krTitle = getShortTitle(row.kr_title_name || '');
                    const indentPadding = 1.5 + (indent * 1.5);
                    const tr = document.createElement('tr');
                    tr.className = 'kr-row';
                    const indentIndicator = indent > 0 ? '<span class="indent-indicator">└</span>' : '';
                    tr.innerHTML = `
                        <td class="col-kr" style="padding-left: ${indentPadding}rem;">
                            <div class="kr-cell">
                                ${indentIndicator}
                                <div class="kr-info">
                                    <div class="kr-name-text">${row.kr_name || ''}</div>
                                    ${krTitle ? `<div class="kr-title-text">${krTitle}</div>` : ''}
                                </div>
                            </div>
                        </td>
                        <td class="col-topic"><span class="topic-badge" style="background: ${getTopicBadgeColor(row.kr_topic_name)};">${row.kr_topic_name || ''}</span></td>
                        <td class="col-owner">${row.kr_owner_name || '<span class="unassigned">Unassigned</span>'}</td>
                        <td class="col-current"><span class="number-value">${current !== null ? formatNumber(current) : 'N/A'}</span><span class="unit-text">${row.unit_name || ''}</span></td>
                        <td class="col-target"><span class="number-value">${target > 0 ? formatNumber(target) : 'N/A'}</span><span class="unit-text">${row.unit_name || ''}</span></td>
                        <td class="col-change"><span class="trend-badge ${changeTrendClass}">${changeDisplay}</span></td>
                        <td class="col-progress">
                            ${target > 0 ? `
                                <div class="progress-cell">
                                    <div class="progress-bar-mini">
                                        <div class="progress-fill ${progress >= 100 ? 'complete' : progress >= 90 ? 'high' : 'low'}" style="width: ${Math.min(progress, 100)}%;"></div>
                                    </div>
                                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                                        <span class="progress-text ${progress >= 100 ? 'complete' : progress >= 90 ? 'high' : 'low'}">${progress.toFixed(1)}%</span>
                                        ${progress >= 100 ? 
                                            '<span class="table-status-badge achieved" title="Achieved Target">✓</span>' : 
                                         progress >= 90 ? 
                                            '<span class="table-status-badge slightly-under" title="Slightly Under Target">⚠</span>' : 
                                            '<span class="table-status-badge under" title="Under Target">✗</span>'}
                                    </div>
                                </div>
                            ` : '<span class="na-text">N/A</span>'}
                        </td>
                    `;
                    tbody.appendChild(tr);
                    if (item.children && item.children.length > 0) {
                        renderKRRows(item.children, indent + 1);
                    }
                });
            }
            renderKRRows(organizedKRs, 0);
        });
    });
}

// Reset dashboard
function resetDashboard() {
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('uploadSection').style.display = 'block';
    document.getElementById('fileInput').value = '';
    document.getElementById('targetsFileInput').value = '';
    document.getElementById('firstTransactingInput').value = '';
    document.getElementById('earlyRetentionInput').value = '';
    
    // Reset team perf inputs
    var tp1 = document.getElementById('teamPerfFileInput');
    var tp2 = document.getElementById('teamPerfFileInputMain');
    if (tp1) tp1.value = '';
    if (tp2) tp2.value = '';
    
    // Reset status indicators
    ['dataFileStatus', 'targetsFileStatus', 'firstTransactingStatus', 'earlyRetentionStatus', 'teamPerfFileStatus', 'teamPerfFileStatusMain'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.remove('success', 'error', 'loading');
            el.innerHTML = '';
        }
    });
    
    // Remove uploaded class from upload zones
    ['uploadZone', 'targetsUploadZone', 'firstTransactingUploadZone', 'earlyRetentionUploadZone'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('uploaded');
    });
    
    // Hide view dashboard button
    document.getElementById('viewDashboardSection').style.display = 'none';
    
    csvData = [];
    filteredData = [];
    allMonths = [];
    selectedMonth = '';
    monthlyTargets.clear();
    firstTransactingData = [];
    earlyRetentionData = [];
    teamPerfRawData = [];
    
    // Destroy team perf charts
    if (typeof teamPerfChartInstances !== 'undefined') {
        Object.keys(teamPerfChartInstances).forEach(function(key) {
            if (teamPerfChartInstances[key]) {
                teamPerfChartInstances[key].destroy();
                delete teamPerfChartInstances[key];
            }
        });
    }
    
    // Reset team perf display
    var tpUpload = document.getElementById('teamPerfUploadSection');
    var tpContent = document.getElementById('teamPerfDynamicContent');
    if (tpUpload) tpUpload.style.display = 'block';
    if (tpContent) { tpContent.style.display = 'none'; tpContent.innerHTML = ''; }
}

// ========================================
// HUNTER ANALYSIS FUNCTIONS
// ========================================

// Process First Transacting CSV file
function processFirstTransactingFile(file) {
    showUploadStatus('firstTransactingStatus', 'loading', 'Processing...');
    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        transformHeader: function(header) {
            return header.trim();
        },
        complete: function(results) {
            console.log('=== FIRST TRANSACTING PARSING ===');
            console.log('Total rows:', results.data.length);
            
            firstTransactingData = results.data;
            console.log('âœ… First Transacting data loaded:', firstTransactingData.length, 'rows');
            
            // Show success status
            showUploadStatus('firstTransactingStatus', 'success', `✓ Loaded ${firstTransactingData.length} rows from ${file.name}`);
            document.getElementById('firstTransactingUploadZone').classList.add('uploaded');
            
            // Only render if dashboard is already visible
            if (document.getElementById('dashboard').style.display !== 'none') {
                renderHunterAnalysis();
            }
        },
        error: function(error) {
            showUploadStatus('firstTransactingStatus', 'error', `✗ Error: ${error.message}`);
        }
    });
}

// Process Early Retention CSV file
function processEarlyRetentionFile(file) {
    showUploadStatus('earlyRetentionStatus', 'loading', 'Processing...');
    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        transformHeader: function(header) {
            return header.trim();
        },
        complete: function(results) {
            console.log('=== EARLY RETENTION PARSING ===');
            console.log('Total rows:', results.data.length);
            
            earlyRetentionData = results.data;
            console.log('âœ… Early Retention data loaded:', earlyRetentionData.length, 'rows');
            
            // Show success status
            showUploadStatus('earlyRetentionStatus', 'success', `✓ Loaded ${earlyRetentionData.length} rows from ${file.name}`);
            document.getElementById('earlyRetentionUploadZone').classList.add('uploaded');
            
            // Only render if dashboard is already visible
            if (document.getElementById('dashboard').style.display !== 'none') {
                renderHunterAnalysis();
            }
        },
        error: function(error) {
            showUploadStatus('earlyRetentionStatus', 'error', `✗ Error: ${error.message}`);
        }
    });
}

// Render Hunter Analysis View
function renderHunterAnalysis() {
    const container = document.getElementById('hunterAnalysisContainer');
    
    // Check if container exists (user might not have navigated to dashboard yet)
    if (!container) {
        console.log('Hunter Analysis container not ready yet');
        return;
    }
    
    if (firstTransactingData.length === 0 && earlyRetentionData.length === 0) {
        container.innerHTML = `
            <div style="border: 2px dashed var(--border); border-radius: 12px; padding: 3rem; background: #FAFBFC; text-align: center;">
                <div class="upload-icon" style="background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); margin: 0 auto 1.5rem; font-size: 2.5rem;">🎯</div>
                <h3 style="color: var(--primary); margin-bottom: 0.5rem; font-weight: 700;">Hunter Analysis</h3>
                <p style="color: var(--text-secondary); margin-bottom: 2rem; font-size: 0.9rem;">Upload First Transacting and Early Retention CSV files to see activation and retention trends.</p>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; max-width: 700px; margin: 0 auto;">
                    <div style="background: white; border-radius: 12px; padding: 1.5rem; box-shadow: 0 2px 8px rgba(0,0,0,0.06); border: 1px solid #E5E7EB;">
                        <div style="font-size: 2rem; margin-bottom: 0.75rem;">📈</div>
                        <div style="font-weight: 600; color: var(--primary); margin-bottom: 0.5rem;">First Transacting CSV</div>
                        <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1rem;">Format: agent_region, metric_month, Sum of monthly_premium</div>
                        <input type="file" id="hunterInTabFirstTransacting" accept=".csv" style="display:none !important;">
                        <button class="btn-upload" onclick="document.getElementById('hunterInTabFirstTransacting').click()" style="width: 100%;">
                            Choose File
                        </button>
                        <div id="hunterInTabFirstTransactingStatus" class="upload-status"></div>
                    </div>
                    <div style="background: white; border-radius: 12px; padding: 1.5rem; box-shadow: 0 2px 8px rgba(0,0,0,0.06); border: 1px solid #E5E7EB;">
                        <div style="font-size: 2rem; margin-bottom: 0.75rem;">📊</div>
                        <div style="font-weight: 600; color: var(--primary); margin-bottom: 0.5rem;">Early Retention CSV</div>
                        <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1rem;">Format: metric_month, agent_region, Sum of monthly_premium</div>
                        <input type="file" id="hunterInTabEarlyRetention" accept=".csv" style="display:none !important;">
                        <button class="btn-upload" onclick="document.getElementById('hunterInTabEarlyRetention').click()" style="width: 100%;">
                            Choose File
                        </button>
                        <div id="hunterInTabEarlyRetentionStatus" class="upload-status"></div>
                    </div>
                </div>
            </div>
        `;
        
        // Wire up in-tab file inputs
        var ftInput = document.getElementById('hunterInTabFirstTransacting');
        if (ftInput) {
            ftInput.addEventListener('change', function(e) {
                var file = e.target.files[0];
                if (file) {
                    showUploadStatus('hunterInTabFirstTransactingStatus', 'loading', 'Processing...');
                    Papa.parse(file, {
                        header: true,
                        skipEmptyLines: true,
                        transformHeader: function(header) { return header.trim(); },
                        complete: function(results) {
                            firstTransactingData = results.data;
                            showUploadStatus('hunterInTabFirstTransactingStatus', 'success', '✓ Loaded ' + firstTransactingData.length + ' rows from ' + file.name);
                            renderHunterAnalysis();
                        },
                        error: function(error) {
                            showUploadStatus('hunterInTabFirstTransactingStatus', 'error', '✗ Error: ' + error.message);
                        }
                    });
                }
            });
        }
        
        var erInput = document.getElementById('hunterInTabEarlyRetention');
        if (erInput) {
            erInput.addEventListener('change', function(e) {
                var file = e.target.files[0];
                if (file) {
                    showUploadStatus('hunterInTabEarlyRetentionStatus', 'loading', 'Processing...');
                    Papa.parse(file, {
                        header: true,
                        skipEmptyLines: true,
                        transformHeader: function(header) { return header.trim(); },
                        complete: function(results) {
                            earlyRetentionData = results.data;
                            showUploadStatus('hunterInTabEarlyRetentionStatus', 'success', '✓ Loaded ' + earlyRetentionData.length + ' rows from ' + file.name);
                            renderHunterAnalysis();
                        },
                        error: function(error) {
                            showUploadStatus('hunterInTabEarlyRetentionStatus', 'error', '✗ Error: ' + error.message);
                        }
                    });
                }
            });
        }
        
        return;
    }
    
    container.innerHTML = '';
    
    // Create header
    const header = document.createElement('div');
    header.style.cssText = 'background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); color: white; padding: 2rem; border-radius: 12px; margin-bottom: 2rem;';
    header.innerHTML = `
        <h1 style="margin: 0; font-size: 2rem; font-weight: 800;">[Hunter] Activation and Early Retention Trend</h1>
        <p style="margin: 0.5rem 0 0 0; opacity: 0.9;">Track first transacting performance and early retention metrics</p>
    `;
    container.appendChild(header);
    
    // Create charts container
    const chartsContainer = document.createElement('div');
    chartsContainer.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 2rem; max-height: 450px;';
    
    // First Transacting Chart
    if (firstTransactingData.length > 0) {
        const ftCard = createHunterChartCard('First Transacting Performance', firstTransactingData, 'firstTransacting');
        chartsContainer.appendChild(ftCard);
    }
    
    // Early Retention Chart
    if (earlyRetentionData.length > 0) {
        const erCard = createHunterChartCard('Early Retention Performance', earlyRetentionData, 'earlyRetention');
        chartsContainer.appendChild(erCard);
    }
    
    container.appendChild(chartsContainer);
    
    // Key Highlights Section
    const highlightsSection = createKeyHighlights();
    container.appendChild(highlightsSection);
}

// Create Hunter Chart Card
function createHunterChartCard(title, data, type) {
    const card = document.createElement('div');
    card.style.cssText = 'background: white; border-radius: 12px; padding: 1.5rem; box-shadow: 0 4px 12px rgba(0,0,0,0.1); border: 1px solid #E5E7EB;';
    
    const header = document.createElement('div');
    header.innerHTML = `<h3 style="margin: 0 0 1rem 0; color: var(--primary); font-size: 1.25rem;">${title}</h3>`;
    card.appendChild(header);
    
    // Create a wrapper div to contain the canvas with fixed height
    const canvasWrapper = document.createElement('div');
    canvasWrapper.style.cssText = 'position: relative; height: 300px; width: 100%;';
    
    const canvas = document.createElement('canvas');
    canvas.id = `${type}Chart`;
    canvasWrapper.appendChild(canvas);
    
    card.appendChild(canvasWrapper);
    
    // Render chart after DOM is ready
    setTimeout(() => renderHunterChart(type, data), 100);
    
    return card;
}

// Render Hunter Chart using Chart.js
function renderHunterChart(type, data) {
    const canvas = document.getElementById(`${type}Chart`);
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    // Aggregate data by month
    const monthlyData = {};
    
    data.forEach(row => {
        const month = row['metric_month: Month'] || row['metric_month'];
        if (!month) return;
        
        const gwp = parseFloat((row['Sum of monthly_premium'] || '0').replace(/,/g, ''));
        
        if (!monthlyData[month]) {
            monthlyData[month] = 0;
        }
        monthlyData[month] += gwp;
    });
    
    // Sort months chronologically - include all months but filter for targets
    const monthOrder = ['July, 2025', 'August, 2025', 'September, 2025', 'October, 2025', 'November, 2025', 'December, 2025', 'January, 2026', 'February, 2026'];
    const sortedMonths = Object.keys(monthlyData).sort((a, b) => {
        return monthOrder.indexOf(a) - monthOrder.indexOf(b);
    });
    
    const values = sortedMonths.map(m => monthlyData[m] / 1000000); // Convert to millions
    const labels = sortedMonths.map(m => m.split(',')[0].substring(0, 3)); // Short month names
    
    // Get target values (only for 2026 months)
    const targetArray = type === 'firstTransacting' ? FIRST_TRANSACTING_TARGETS : EARLY_RETENTION_TARGETS;
    const month2026Names = ['January, 2026', 'February, 2026', 'March, 2026', 'April, 2026', 'May, 2026', 'June, 2026', 
                            'July, 2026', 'August, 2026', 'September, 2026', 'October, 2026', 'November, 2026', 'December, 2026'];
    
    // Map targets to actual months in the data
    const targetValues = sortedMonths.map(month => {
        const index2026 = month2026Names.indexOf(month);
        if (index2026 !== -1 && index2026 < targetArray.length) {
            return targetArray[index2026] / 1000000; // Convert to millions
        }
        return null; // No target for 2025 months
    });
    
    // Build datasets
    const datasets = [
        {
            label: 'Actual',
            data: values,
            borderColor: '#3B82F6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            borderWidth: 3,
            pointRadius: 6,
            pointBackgroundColor: '#3B82F6',
            tension: 0.4,
            fill: true
        }
    ];
    
    // Add target line only if there are 2026 months with targets
    if (targetValues.some(v => v !== null)) {
        datasets.push({
            label: 'Target',
            data: targetValues,
            borderColor: '#10B981',
            backgroundColor: 'transparent',
            borderWidth: 2,
            pointRadius: 5,
            pointBackgroundColor: '#10B981',
            pointStyle: 'rectRot',
            tension: 0.4,
            borderDash: [5, 5],
            fill: false
        });
    }
    
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        boxWidth: 12,
                        padding: 10,
                        font: {
                            size: 12
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return 'GWP: ' + context.parsed.y.toFixed(2) + 'M THB';
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'GWP (Million THB)',
                        font: {
                            size: 11
                        }
                    },
                    ticks: {
                        callback: function(value) {
                            return value.toFixed(1) + 'M';
                        },
                        font: {
                            size: 10
                        }
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Month',
                        font: {
                            size: 11
                        }
                    },
                    ticks: {
                        font: {
                            size: 10
                        }
                    },
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

// Create Key Highlights Section
function createKeyHighlights() {
    const section = document.createElement('div');
    section.style.cssText = 'background: white; border-radius: 12px; padding: 2rem; box-shadow: 0 4px 12px rgba(0,0,0,0.1);';
    
    // Analyze the data to generate insights
    const insights = analyzeHunterData();
    
    let highlightsHTML = `
        <h2 style="margin: 0 0 1.5rem 0; color: var(--primary); font-size: 1.5rem;">Key Highlights</h2>
        <div style="display: grid; gap: 1rem;">
    `;
    
    // First Transacting Insight
    if (insights.firstTransacting) {
        const ftInsight = insights.firstTransacting;
        const statusColor = ftInsight.status === 'above' ? '#10B981' : ftInsight.status === 'below' ? '#EF4444' : '#F59E0B';
        const statusBg = ftInsight.status === 'above' ? '#F0FDF4' : ftInsight.status === 'below' ? '#FEF2F2' : '#FFFBEB';
        const statusText = ftInsight.status === 'above' ? 'Above target' : ftInsight.status === 'below' ? 'Under target' : 'Near target';
        
        highlightsHTML += `
            <div style="display: flex; gap: 1rem; align-items: flex-start; padding: 1.5rem; background: ${statusBg}; border-radius: 8px; border-left: 4px solid ${statusColor};">
                <div style="background: #3B82F6; color: white; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; flex-shrink: 0;">1</div>
                <div style="flex: 1;">
                    <div style="font-weight: 700; margin-bottom: 0.5rem; color: var(--primary);">
                        First Transacting Performance ${ftInsight.latestMonth ? 'in ' + ftInsight.latestMonth : ''}
                        <span style="display: inline-block; margin-left: 0.5rem; padding: 0.25rem 0.75rem; background: ${statusColor}; color: white; border-radius: 12px; font-size: 0.75rem; font-weight: 600;">${statusText}</span>
                    </div>
                    <div style="color: var(--text-secondary); line-height: 1.6; margin-bottom: 0.75rem;">
                        ${ftInsight.description}
                    </div>
                    ${ftInsight.details ? `
                        <div style="font-size: 0.9rem; color: var(--text-muted); margin-top: 0.5rem;">
                            ${ftInsight.details}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }
    
    // Early Retention Insight
    if (insights.earlyRetention) {
        const erInsight = insights.earlyRetention;
        const statusColor = erInsight.status === 'above' ? '#10B981' : erInsight.status === 'below' ? '#EF4444' : '#F59E0B';
        const statusBg = erInsight.status === 'above' ? '#F0FDF4' : erInsight.status === 'below' ? '#FEF2F2' : '#FFFBEB';
        const statusText = erInsight.status === 'above' ? 'Above target' : erInsight.status === 'below' ? 'Under target' : 'Near target';
        
        highlightsHTML += `
            <div style="display: flex; gap: 1rem; align-items: flex-start; padding: 1.5rem; background: ${statusBg}; border-radius: 8px; border-left: 4px solid ${statusColor};">
                <div style="background: #8B5CF6; color: white; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; flex-shrink: 0;">2</div>
                <div style="flex: 1;">
                    <div style="font-weight: 700; margin-bottom: 0.5rem; color: var(--primary);">
                        Early Retention Performance ${erInsight.latestMonth ? 'in ' + erInsight.latestMonth : ''}
                        <span style="display: inline-block; margin-left: 0.5rem; padding: 0.25rem 0.75rem; background: ${statusColor}; color: white; border-radius: 12px; font-size: 0.75rem; font-weight: 600;">${statusText}</span>
                    </div>
                    <div style="color: var(--text-secondary); line-height: 1.6; margin-bottom: 0.75rem;">
                        ${erInsight.description}
                    </div>
                    ${erInsight.details ? `
                        <div style="font-size: 0.9rem; color: var(--text-muted); margin-top: 0.5rem;">
                            ${erInsight.details}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }
    
    // Default message if no data
    if (!insights.firstTransacting && !insights.earlyRetention) {
        highlightsHTML += `
            <div style="display: flex; gap: 1rem; align-items: flex-start; padding: 1.5rem; background: #F0F9FF; border-radius: 8px; border-left: 4px solid #3B82F6;">
                <div style="background: #3B82F6; color: white; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; flex-shrink: 0;">1</div>
                <div>
                    <div style="font-weight: 700; margin-bottom: 0.5rem; color: var(--primary);">First Transacting Performance Analysis</div>
                    <div style="color: var(--text-secondary); line-height: 1.6;">
                        Monitor activation trends across regions. Track GWP performance for newly transacting agents.
                    </div>
                </div>
            </div>
            
            <div style="display: flex; gap: 1rem; align-items: flex-start; padding: 1.5rem; background: #F0FDF4; border-radius: 8px; border-left: 4px solid #10B981;">
                <div style="background: #8B5CF6; color: white; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; flex-shrink: 0;">2</div>
                <div>
                    <div style="font-weight: 700; margin-bottom: 0.5rem; color: var(--primary);">Early Retention Performance Analysis</div>
                    <div style="color: var(--text-secondary); line-height: 1.6;">
                        Track retention success for early-stage agents. Monitor GWP trends to ensure sustainable growth.
                    </div>
                </div>
            </div>
        `;
    }
    
    highlightsHTML += `</div>`;
    
    section.innerHTML = highlightsHTML;
    return section;
}

// Analyze Hunter Data to generate insights
function analyzeHunterData() {
    const insights = {};
    
    // Analyze First Transacting
    if (firstTransactingData.length > 0) {
        const monthlyTotals = {};
        
        // Aggregate by month
        firstTransactingData.forEach(row => {
            const month = row['metric_month: Month'] || row['metric_month'];
            if (!month) return;
            
            const gwp = parseFloat((row['Sum of monthly_premium'] || '0').replace(/,/g, ''));
            
            if (!monthlyTotals[month]) {
                monthlyTotals[month] = 0;
            }
            monthlyTotals[month] += gwp;
        });
        
        // Get 2026 months only
        const months2026 = ['January, 2026', 'February, 2026'];
        const latestMonth2026 = months2026.find(m => monthlyTotals[m] !== undefined);
        
        if (latestMonth2026) {
            const monthIndex = months2026.indexOf(latestMonth2026);
            const actualGWP = monthlyTotals[latestMonth2026];
            const targetGWP = FIRST_TRANSACTING_TARGETS[monthIndex];
            
            if (targetGWP) {
                const variance = actualGWP - targetGWP;
                const variancePercent = (variance / targetGWP) * 100;
                const status = variancePercent > 5 ? 'above' : variancePercent < -5 ? 'below' : 'near';
                
                const monthName = latestMonth2026.split(',')[0];
                const actualM = (actualGWP / 1000000).toFixed(2);
                const targetM = (targetGWP / 1000000).toFixed(2);
                const varianceM = Math.abs(variance / 1000000).toFixed(2);
                
                let description = '';
                if (status === 'above') {
                    description = `First Transacting GWP achieved <strong>${actualM}M THB</strong>, exceeding the target of ${targetM}M THB by <strong style="color: #10B981;">${varianceM}M THB</strong> (${Math.abs(variancePercent).toFixed(1)}% above target). Strong performance across regions contributing to activation success.`;
                } else if (status === 'below') {
                    description = `First Transacting GWP reached <strong>${actualM}M THB</strong>, falling short of the target of ${targetM}M THB by <strong style="color: #EF4444;">${varianceM}M THB</strong> (${Math.abs(variancePercent).toFixed(1)}% below target). Requires attention to improve activation performance.`;
                } else {
                    description = `First Transacting GWP achieved <strong>${actualM}M THB</strong>, closely aligned with the target of ${targetM}M THB. Performance is on track with minor variance of ${varianceM}M THB.`;
                }
                
                insights.firstTransacting = {
                    latestMonth: monthName,
                    status: status,
                    description: description,
                    details: `Monitor regional contributions and activation trends to maintain or improve performance trajectory.`
                };
            }
        }
    }
    
    // Analyze Early Retention
    if (earlyRetentionData.length > 0) {
        const monthlyTotals = {};
        
        // Aggregate by month
        earlyRetentionData.forEach(row => {
            const month = row['metric_month: Month'] || row['metric_month'];
            if (!month) return;
            
            const gwp = parseFloat((row['Sum of monthly_premium'] || '0').replace(/,/g, ''));
            
            if (!monthlyTotals[month]) {
                monthlyTotals[month] = 0;
            }
            monthlyTotals[month] += gwp;
        });
        
        // Get 2026 months only
        const months2026 = ['January, 2026', 'February, 2026'];
        const latestMonth2026 = months2026.find(m => monthlyTotals[m] !== undefined);
        
        if (latestMonth2026) {
            const monthIndex = months2026.indexOf(latestMonth2026);
            const actualGWP = monthlyTotals[latestMonth2026];
            const targetGWP = EARLY_RETENTION_TARGETS[monthIndex];
            
            if (targetGWP) {
                const variance = actualGWP - targetGWP;
                const variancePercent = (variance / targetGWP) * 100;
                const status = variancePercent > 5 ? 'above' : variancePercent < -5 ? 'below' : 'near';
                
                const monthName = latestMonth2026.split(',')[0];
                const actualM = (actualGWP / 1000000).toFixed(2);
                const targetM = (targetGWP / 1000000).toFixed(2);
                const varianceM = Math.abs(variance / 1000000).toFixed(2);
                
                let description = '';
                if (status === 'above') {
                    description = `Early Retention GWP achieved <strong>${actualM}M THB</strong>, exceeding the target of ${targetM}M THB by <strong style="color: #10B981;">${varianceM}M THB</strong> (${Math.abs(variancePercent).toFixed(1)}% above target). Reflecting strong retention and sustainable growth.`;
                } else if (status === 'below') {
                    description = `Early Retention GWP reached <strong>${actualM}M THB</strong>, falling short of the target of ${targetM}M THB by <strong style="color: #EF4444;">${varianceM}M THB</strong> (${Math.abs(variancePercent).toFixed(1)}% below target). Focus needed on retention initiatives.`;
                } else {
                    description = `Early Retention GWP achieved <strong>${actualM}M THB</strong>, closely aligned with the target of ${targetM}M THB. Retention performance is stable with variance of ${varianceM}M THB.`;
                }
                
                insights.earlyRetention = {
                    latestMonth: monthName,
                    status: status,
                    description: description,
                    details: `Track cohort performance and retention trends to ensure agents remain productive beyond activation.`
                };
            }
        }
    }
    
    return insights;
}
// ========================================
// TEAM PERFORMANCE - DYNAMIC CSV-BASED
// ========================================

let teamPerfRawData = []; // Raw parsed CSV rows
let teamPerfChartInstances = {}; // Track chart instances for cleanup

// Agent code to name mapping
const agentNameMap = {
    'FM-19134': 'ประวิทย์',
    'FM-19645': 'โมไนย',
    'FM-19729': 'Jack',
    'FM-21511': 'ตาล',
    'FM-21975': 'ถาวร',
    'FM-23273': 'เมธิชัย',
    'FM-23277': 'ปัน',
    'FM-23437': 'คนอง',
    'FM-24406': 'จงรักษ์',
    'FM-24885': 'โอ๋',
    'FM-42800': 'บ๊วย',
    'FM-20898': 'บิ๊ก',
    'FM-21461': 'ธนพร',
    'FM-23332': 'ดิน'
};

// File input handlers for Team Performance
function setupTeamPerfFileHandlers() {
    // In-tab upload
    var inTabInput = document.getElementById('teamPerfFileInput');
    if (inTabInput) {
        inTabInput.addEventListener('change', function(e) {
            var file = e.target.files[0];
            if (file) processTeamPerfFile(file, 'teamPerfFileStatus');
        });
    }
    
    // Main upload page
    var mainInput = document.getElementById('teamPerfFileInputMain');
    if (mainInput) {
        mainInput.addEventListener('change', function(e) {
            var file = e.target.files[0];
            if (file) processTeamPerfFile(file, 'teamPerfFileStatusMain');
        });
    }
    
    // Drag and drop for in-tab
    var inTabZone = document.getElementById('teamPerfUploadZone');
    if (inTabZone) {
        inTabZone.addEventListener('dragover', function(e) { e.preventDefault(); this.classList.add('dragover'); });
        inTabZone.addEventListener('dragleave', function() { this.classList.remove('dragover'); });
        inTabZone.addEventListener('drop', function(e) {
            e.preventDefault();
            this.classList.remove('dragover');
            var file = e.dataTransfer.files[0];
            if (file) processTeamPerfFile(file, 'teamPerfFileStatus');
        });
    }
    
    // Drag and drop for main upload
    var mainZone = document.getElementById('teamPerfUploadZoneMain');
    if (mainZone) {
        mainZone.addEventListener('dragover', function(e) { e.preventDefault(); this.classList.add('dragover'); });
        mainZone.addEventListener('dragleave', function() { this.classList.remove('dragover'); });
        mainZone.addEventListener('drop', function(e) {
            e.preventDefault();
            this.classList.remove('dragover');
            var file = e.dataTransfer.files[0];
            if (file) processTeamPerfFile(file, 'teamPerfFileStatusMain');
        });
    }
}

// Process team performance CSV file
function processTeamPerfFile(file, statusElementId) {
    showUploadStatus(statusElementId, 'loading', 'Processing...');
    
    // Also show status on both upload locations
    var otherStatusId = statusElementId === 'teamPerfFileStatus' ? 'teamPerfFileStatusMain' : 'teamPerfFileStatus';
    showUploadStatus(otherStatusId, 'loading', 'Processing...');
    
    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        transformHeader: function(header) { return header.trim(); },
        complete: function(results) {
            console.log('=== TEAM PERFORMANCE CSV PARSING ===');
            console.log('Total rows:', results.data.length);
            console.log('Headers:', results.meta.fields);
            
            // Detect column names flexibly
            var headers = results.meta.fields || [];
            var colMap = {};
            headers.forEach(function(h) {
                var lower = h.toLowerCase().trim();
                if (lower === 'team_name' || lower === 'teamname') colMap.team_name = h;
                if (lower === 'team_anchor_code' || lower === 'team_code' || lower === 'anchor_code') colMap.team_anchor_code = h;
                if (lower === 'agent_province' || lower === 'province') colMap.agent_province = h;
                if (lower === 'agent_region' || lower === 'region') colMap.agent_region = h;
                if (lower === 'month') colMap.month = h;
                if (lower === 'gwp') colMap.gwp = h;
                if (lower === 'active_agent' || lower === 'active_agents') colMap.active_agent = h;
                if (lower === 'sales') colMap.sales = h;
                if (lower === 'product_type_name' || lower === 'product_type' || lower === 'product') colMap.product_type_name = h;
            });
            
            console.log('Column mapping:', colMap);
            
            // Normalize data using detected columns
            teamPerfRawData = results.data.map(function(row) {
                return {
                    team_name: row[colMap.team_name] || '',
                    team_anchor_code: row[colMap.team_anchor_code] || '',
                    agent_province: row[colMap.agent_province] || '',
                    agent_region: row[colMap.agent_region] || '',
                    month: row[colMap.month] || '',
                    gwp: row[colMap.gwp] || '0',
                    active_agent: row[colMap.active_agent] || '0',
                    sales: row[colMap.sales] || '0',
                    product_type_name: row[colMap.product_type_name] || ''
                };
            }).filter(function(row) { return row.team_name && row.month; });
            
            console.log('Normalized rows:', teamPerfRawData.length);
            if (teamPerfRawData.length > 0) {
                console.log('Sample row:', teamPerfRawData[0]);
            }
            
            var msg = '✔ Loaded ' + teamPerfRawData.length + ' rows from ' + file.name;
            showUploadStatus(statusElementId, 'success', msg);
            showUploadStatus(otherStatusId, 'success', msg);
            
            // Show dashboard section if visible
            var viewBtn = document.getElementById('viewDashboardSection');
            if (viewBtn) viewBtn.style.display = 'block';
            
            // Render
            renderTeamPerformanceDynamic();
        },
        error: function(error) {
            var msg = '✗ Error: ' + error.message;
            showUploadStatus(statusElementId, 'error', msg);
            showUploadStatus(otherStatusId, 'error', msg);
        }
    });
}

// Get the selected month in YYYY-MM format for team perf filtering
function getTeamPerfSelectedMonth() {
    // The main month filter uses "Month, Year" format like "January, 2026"
    // Team perf CSV uses "YYYY-MM" format like "2026-01"
    if (!selectedMonth) return null;
    
    var parsed = parseMonthString(selectedMonth);
    if (!parsed) return null;
    
    var year = parsed.getFullYear();
    var month = (parsed.getMonth() + 1).toString().padStart(2, '0');
    return year + '-' + month;
}

// Convert YYYY-MM to display string
function formatYYYYMM(yyyymm) {
    if (!yyyymm) return '';
    var parts = yyyymm.split('-');
    var monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December'];
    var monthIdx = parseInt(parts[1]) - 1;
    return monthNames[monthIdx] + ' ' + parts[0];
}

// Short month format
function formatYYYYMMShort(yyyymm) {
    if (!yyyymm) return '';
    var parts = yyyymm.split('-');
    var monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var monthIdx = parseInt(parts[1]) - 1;
    return monthNames[monthIdx] + " '" + parts[0].slice(2);
}

// Main render function for dynamic team performance
function renderTeamPerformanceDynamic() {
    var uploadSection = document.getElementById('teamPerfUploadSection');
    var dynamicContent = document.getElementById('teamPerfDynamicContent');
    
    if (!dynamicContent) return;
    
    if (teamPerfRawData.length === 0) {
        if (uploadSection) uploadSection.style.display = 'block';
        dynamicContent.style.display = 'none';
        return;
    }
    
    // Hide upload, show content
    if (uploadSection) uploadSection.style.display = 'none';
    dynamicContent.style.display = 'block';
    
    // Destroy old charts
    Object.keys(teamPerfChartInstances).forEach(function(key) {
        if (teamPerfChartInstances[key]) {
            teamPerfChartInstances[key].destroy();
            delete teamPerfChartInstances[key];
        }
    });
    
    // Determine selected month
    var selectedYYYYMM = getTeamPerfSelectedMonth();
    
    // Get all available months from data
    var allTeamMonths = {};
    teamPerfRawData.forEach(function(row) {
        var m = row.month;
        if (m) allTeamMonths[m] = true;
    });
    var sortedTeamMonths = Object.keys(allTeamMonths).sort();
    
    // If no month selected via main filter, use latest
    if (!selectedYYYYMM || sortedTeamMonths.indexOf(selectedYYYYMM) === -1) {
        selectedYYYYMM = sortedTeamMonths[sortedTeamMonths.length - 1];
    }
    
    // Find previous month
    var selectedIdx = sortedTeamMonths.indexOf(selectedYYYYMM);
    var prevYYYYMM = selectedIdx > 0 ? sortedTeamMonths[selectedIdx - 1] : null;
    
    // Filter data for selected month
    var monthData = teamPerfRawData.filter(function(row) { return row.month === selectedYYYYMM; });
    var prevMonthData = prevYYYYMM ? teamPerfRawData.filter(function(row) { return row.month === prevYYYYMM; }) : [];
    
    // Aggregate by team type
    var focusTeams = {};
    var midtierTeams = {};
    var nonFocusTeams = {};
    
    monthData.forEach(function(row) {
        var teamName = (row.team_name || '').toLowerCase().replace(/\s+/g, '_');
        var code = row.team_anchor_code || 'unknown';
        var province = row.agent_province || '';
        var gwp = parseFloat(String(row.gwp || '0').replace(/,/g, ''));
        var activeAgent = parseInt(String(row.active_agent || '0').replace(/,/g, ''));
        var sales = parseInt(String(row.sales || '0').replace(/,/g, ''));
        
        if (isNaN(gwp)) gwp = 0;
        if (isNaN(activeAgent)) activeAgent = 0;
        if (isNaN(sales)) sales = 0;
        
        var target;
        if (teamName === 'focus_team') {
            target = focusTeams;
        } else if (teamName === 'midtier') {
            target = midtierTeams;
        } else {
            target = nonFocusTeams;
        }
        
        if (!target[code]) {
            target[code] = { code: code, province: province, gwp: 0, activeAgent: 0, sales: 0 };
        }
        target[code].gwp += gwp;
        target[code].activeAgent += activeAgent;
        target[code].sales += sales;
        // Keep last province seen
        if (province) target[code].province = province;
    });
    
    // Convert to sorted arrays
    var focusArr = Object.values(focusTeams).sort(function(a, b) { return b.gwp - a.gwp; });
    var midtierArr = Object.values(midtierTeams).sort(function(a, b) { return b.gwp - a.gwp; });
    
    var totalFocusGwp = focusArr.reduce(function(s, t) { return s + t.gwp; }, 0);
    var totalMidtierGwp = midtierArr.reduce(function(s, t) { return s + t.gwp; }, 0);
    var totalActiveAgentFocus = focusArr.reduce(function(s, t) { return s + t.activeAgent; }, 0);
    var totalActiveAgentMidtier = midtierArr.reduce(function(s, t) { return s + t.activeAgent; }, 0);
    var totalSalesFocus = focusArr.reduce(function(s, t) { return s + t.sales; }, 0);
    var totalSalesMidtier = midtierArr.reduce(function(s, t) { return s + t.sales; }, 0);
    
    // Previous month totals for comparison
    var prevFocusGwp = 0;
    var prevMidtierGwp = 0;
    prevMonthData.forEach(function(row) {
        var teamName = (row.team_name || '').toLowerCase().replace(/\s+/g, '_');
        var gwp = parseFloat(String(row.gwp || '0').replace(/,/g, ''));
        if (isNaN(gwp)) gwp = 0;
        if (teamName === 'focus_team') prevFocusGwp += gwp;
        else if (teamName === 'midtier') prevMidtierGwp += gwp;
    });
    
    var focusChange = prevFocusGwp > 0 ? ((totalFocusGwp - prevFocusGwp) / prevFocusGwp * 100) : 0;
    var midtierChange = prevMidtierGwp > 0 ? ((totalMidtierGwp - prevMidtierGwp) / prevMidtierGwp * 100) : 0;
    
    // Build monthly trend data (last 6 months up to selected)
    var trendMonths = [];
    for (var i = Math.max(0, selectedIdx - 5); i <= selectedIdx; i++) {
        trendMonths.push(sortedTeamMonths[i]);
    }
    
    var focusTrend = [];
    var midtierTrend = [];
    trendMonths.forEach(function(m) {
        var fTotal = 0;
        var mTotal = 0;
        teamPerfRawData.forEach(function(row) {
            if (row.month !== m) return;
            var tn = (row.team_name || '').toLowerCase().replace(/\s+/g, '_');
            var gwp = parseFloat(String(row.gwp || '0').replace(/,/g, ''));
            if (isNaN(gwp)) gwp = 0;
            if (tn === 'focus_team') fTotal += gwp;
            else if (tn === 'midtier') mTotal += gwp;
        });
        focusTrend.push(fTotal / 1000000);
        midtierTrend.push(mTotal / 1000000);
    });
    
    var displayMonth = formatYYYYMM(selectedYYYYMM);
    var focusGwpMB = (totalFocusGwp / 1000000).toFixed(2);
    var midtierGwpMB = (totalMidtierGwp / 1000000).toFixed(2);
    
    // Build HTML
    var html = '';
    
    // Re-upload button + month selector
    html += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">';
    html += '<div style="display: flex; align-items: center; gap: 1rem;">';
    html += '<label style="font-weight: 600; font-size: 0.875rem; color: var(--text-primary);">📅 View Month:</label>';
    html += '<select id="teamPerfMonthSelect" onchange="onTeamPerfMonthChange()" class="filter-select month-select" style="width: auto; min-width: 180px;">';
    sortedTeamMonths.forEach(function(m) {
        var sel = m === selectedYYYYMM ? ' selected' : '';
        html += '<option value="' + m + '"' + sel + '>' + formatYYYYMM(m) + '</option>';
    });
    html += '</select>';
    html += '</div>';
    html += '<button class="btn-reset" onclick="resetTeamPerfData()" style="font-size: 0.85rem; padding: 0.5rem 1rem;">📁 Upload New Team Data</button>';
    html += '</div>';
    
    // Metrics cards
    html += '<div class="metrics-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">';
    
    html += '<div class="metric-card">';
    html += '<div class="metric-label">Focus Team GWP</div>';
    html += '<div class="metric-value">' + focusGwpMB + ' MB</div>';
    html += '<div class="metric-subtitle">' + displayMonth;
    if (focusChange !== 0) {
        var changeClass = focusChange >= 0 ? 'positive' : '';
        var arrow = focusChange >= 0 ? '↑' : '↓';
        html += ' <span class="metric-change ' + changeClass + '">' + arrow + ' ' + Math.abs(focusChange).toFixed(1) + '% MoM</span>';
    }
    html += '</div></div>';
    
    html += '<div class="metric-card">';
    html += '<div class="metric-label">Mid-Tier GWP</div>';
    html += '<div class="metric-value">' + midtierGwpMB + ' MB</div>';
    html += '<div class="metric-subtitle">' + displayMonth;
    if (midtierChange !== 0) {
        var mChangeClass = midtierChange >= 0 ? 'positive' : '';
        var mArrow = midtierChange >= 0 ? '↑' : '↓';
        html += ' <span class="metric-change ' + mChangeClass + '">' + mArrow + ' ' + Math.abs(midtierChange).toFixed(1) + '% MoM</span>';
    }
    html += '</div></div>';
    
    html += '<div class="metric-card">';
    html += '<div class="metric-label">Focus Active Agents</div>';
    html += '<div class="metric-value">' + totalActiveAgentFocus.toLocaleString() + '</div>';
    html += '<div class="metric-subtitle">Total Sales: ' + totalSalesFocus.toLocaleString() + '</div>';
    html += '</div>';
    
    html += '<div class="metric-card">';
    html += '<div class="metric-label">Mid-Tier Active Agents</div>';
    html += '<div class="metric-value">' + totalActiveAgentMidtier.toLocaleString() + '</div>';
    html += '<div class="metric-subtitle">Total Sales: ' + totalSalesMidtier.toLocaleString() + '</div>';
    html += '</div>';
    
    html += '</div>';
    
    // Charts section
    html += '<div class="chart-section" style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 2rem;">';
    
    html += '<div class="chart-card">';
    html += '<h3 class="chart-title">Focus Team GWP Trend (Last 6 Months)</h3>';
    html += '<div style="position: relative; height: 350px;"><canvas id="dynFocusTrendChart"></canvas></div>';
    html += '</div>';
    
    html += '<div class="chart-card">';
    html += '<h3 class="chart-title">Mid-Tier GWP Trend (Last 6 Months)</h3>';
    html += '<div style="position: relative; height: 350px;"><canvas id="dynMidtierTrendChart"></canvas></div>';
    html += '</div>';
    
    html += '</div>';
    
    // Distribution charts
    html += '<div class="chart-section" style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 2rem;">';
    
    html += '<div class="chart-card">';
    html += '<h3 class="chart-title">Focus Team Distribution - ' + displayMonth + '</h3>';
    html += '<div style="position: relative; height: 350px;"><canvas id="dynFocusDistChart"></canvas></div>';
    html += '</div>';
    
    html += '<div class="chart-card">';
    html += '<h3 class="chart-title">Mid-Tier Distribution - ' + displayMonth + '</h3>';
    html += '<div style="position: relative; height: 350px;"><canvas id="dynMidtierDistChart"></canvas></div>';
    html += '</div>';
    
    html += '</div>';
    
    // Key Highlights
    html += '<div class="insights-section" style="background: var(--card-bg); border-radius: 12px; padding: 2rem; box-shadow: var(--shadow-md); border: 1px solid var(--border); margin-bottom: 2rem;">';
    html += '<h2 style="font-size: 1.5rem; font-weight: 800; margin-bottom: 1.5rem; color: var(--primary);">📊 Key Highlights - ' + displayMonth + '</h2>';
    
    // Top performer focus
    if (focusArr.length > 0) {
        var topFocus = focusArr[0];
        var topFocusName = agentNameMap[topFocus.code] || topFocus.code;
        html += buildHighlightItem(1, 
            '<span style="font-weight: 700; color: var(--accent);">Focus Team total GWP: ' + focusGwpMB + ' MB</span> across ' + focusArr.length + ' teams. ' +
            'Top performer: <span style="font-weight: 700; color: var(--accent);">' + topFocusName + ' (' + topFocus.province + ') at ' + (topFocus.gwp / 1000000).toFixed(2) + ' MB</span>.' +
            (focusChange !== 0 ? ' MoM change: <span style="font-weight: 700; color: ' + (focusChange >= 0 ? 'var(--success)' : '#EF4444') + ';">' + (focusChange >= 0 ? '+' : '') + focusChange.toFixed(1) + '%</span>' : '')
        );
    }
    
    // Top performer midtier
    if (midtierArr.length > 0) {
        var topMid = midtierArr[0];
        var topMidName = agentNameMap[topMid.code] || topMid.code;
        html += buildHighlightItem(2, 
            '<span style="font-weight: 700; color: var(--accent);">Mid-Tier total GWP: ' + midtierGwpMB + ' MB</span> across ' + midtierArr.length + ' teams. ' +
            'Top performer: <span style="font-weight: 700; color: var(--accent);">' + topMidName + ' (' + topMid.province + ') at ' + (topMid.gwp / 1000000).toFixed(2) + ' MB</span>.' +
            (midtierChange !== 0 ? ' MoM change: <span style="font-weight: 700; color: ' + (midtierChange >= 0 ? 'var(--success)' : '#EF4444') + ';">' + (midtierChange >= 0 ? '+' : '') + midtierChange.toFixed(1) + '%</span>' : '')
        );
    }
    
    // Trend insight
    if (trendMonths.length >= 2) {
        var firstFocus = focusTrend[0];
        var lastFocus = focusTrend[focusTrend.length - 1];
        var trendGrowth = firstFocus > 0 ? ((lastFocus - firstFocus) / firstFocus * 100).toFixed(1) : 0;
        html += buildHighlightItem(3, 
            '<span style="font-weight: 700; color: var(--accent);">Trend over ' + trendMonths.length + ' months:</span> Focus teams moved from ' + 
            firstFocus.toFixed(2) + ' MB (' + formatYYYYMMShort(trendMonths[0]) + ') to ' + lastFocus.toFixed(2) + ' MB (' + formatYYYYMMShort(trendMonths[trendMonths.length - 1]) + 
            '), representing <span style="font-weight: 700; color: var(--accent);">' + (trendGrowth >= 0 ? '+' : '') + trendGrowth + '% growth</span>.'
        );
    }
    
    html += '</div>';
    
    // Focus Teams Detail Table
    html += buildTeamTable('Focus Team Performance Detail - ' + displayMonth, focusArr, totalFocusGwp);
    
    // Mid-Tier Teams Detail Table
    if (midtierArr.length > 0) {
        html += buildTeamTable('Mid-Tier Team Performance Detail - ' + displayMonth, midtierArr, totalMidtierGwp);
    }
    
    dynamicContent.innerHTML = html;
    
    // Render charts after DOM update
    setTimeout(function() {
        renderDynTrendChart('dynFocusTrendChart', trendMonths, focusTrend, '#FF6B35', 'Focus Team GWP');
        renderDynTrendChart('dynMidtierTrendChart', trendMonths, midtierTrend, '#00D9A3', 'Mid-Tier GWP');
        renderDynDistChart('dynFocusDistChart', focusArr, '#FF6B35');
        renderDynDistChart('dynMidtierDistChart', midtierArr, '#00D9A3');
    }, 100);
}

function buildHighlightItem(num, content) {
    return '<div class="insight-item" style="display: flex; gap: 1rem; padding: 1.25rem; background: var(--bg); border-radius: 12px; margin-bottom: 1rem; border-left: 4px solid var(--accent);">' +
        '<div style="flex-shrink: 0; width: 40px; height: 40px; background: linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%); color: white; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 1.25rem;">' + num + '</div>' +
        '<div style="flex: 1;"><p style="font-size: 1rem; line-height: 1.7; color: var(--text-primary);">' + content + '</p></div>' +
        '</div>';
}

function buildTeamTable(title, teams, totalGwp) {
    var html = '<div class="table-section" style="background: var(--card-bg); border-radius: 12px; padding: 2rem; box-shadow: var(--shadow-md); border: 1px solid var(--border); overflow-x: auto; margin-bottom: 2rem;">';
    html += '<h2 style="font-size: 1.5rem; font-weight: 800; margin-bottom: 1rem; color: var(--primary);">' + title + '</h2>';
    html += '<table class="data-table"><thead><tr>';
    html += '<th>Rank</th><th>Team Name</th><th>Code</th><th>Province</th><th>GWP (MB)</th><th>Active Agents</th><th>Sales</th><th>GWP/Agent</th><th>% of Total</th>';
    html += '</tr></thead><tbody>';
    
    teams.forEach(function(team, idx) {
        var name = agentNameMap[team.code] || team.code;
        var gwpMB = (team.gwp / 1000000).toFixed(2);
        var pct = totalGwp > 0 ? (team.gwp / totalGwp * 100).toFixed(1) : '0.0';
        var gwpPerAgent = team.activeAgent > 0 ? (team.gwp / team.activeAgent).toFixed(0) : 'N/A';
        
        html += '<tr>';
        html += '<td>' + (idx + 1) + '</td>';
        html += '<td style="font-weight: 600; color: var(--text-primary);">' + name + '</td>';
        html += '<td style="font-family: \'IBM Plex Mono\', monospace; font-size: 0.85rem; color: var(--text-secondary);">' + team.code + '</td>';
        html += '<td>' + team.province + '</td>';
        html += '<td style="font-family: \'IBM Plex Mono\', monospace; font-weight: 600; color: var(--accent);">' + gwpMB + ' MB</td>';
        html += '<td style="font-family: \'IBM Plex Mono\', monospace;">' + team.activeAgent.toLocaleString() + '</td>';
        html += '<td style="font-family: \'IBM Plex Mono\', monospace;">' + team.sales.toLocaleString() + '</td>';
        html += '<td style="font-family: \'IBM Plex Mono\', monospace;">' + (gwpPerAgent === 'N/A' ? gwpPerAgent : parseFloat(gwpPerAgent).toLocaleString()) + '</td>';
        html += '<td>' + pct + '%</td>';
        html += '</tr>';
    });
    
    // Total row
    var totalGwpMB = (totalGwp / 1000000).toFixed(2);
    var totalAgents = teams.reduce(function(s, t) { return s + t.activeAgent; }, 0);
    var totalSales = teams.reduce(function(s, t) { return s + t.sales; }, 0);
    html += '<tr style="background: var(--bg); font-weight: 700; border-top: 2px solid var(--accent);">';
    html += '<td></td><td>Total</td><td></td><td></td>';
    html += '<td style="font-family: \'IBM Plex Mono\', monospace; color: var(--accent);">' + totalGwpMB + ' MB</td>';
    html += '<td style="font-family: \'IBM Plex Mono\', monospace;">' + totalAgents.toLocaleString() + '</td>';
    html += '<td style="font-family: \'IBM Plex Mono\', monospace;">' + totalSales.toLocaleString() + '</td>';
    html += '<td></td><td>100%</td>';
    html += '</tr>';
    
    html += '</tbody></table></div>';
    return html;
}

function renderDynTrendChart(canvasId, months, values, color, label) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    
    var ctx = canvas.getContext('2d');
    var labels = months.map(function(m) { return formatYYYYMMShort(m); });
    
    teamPerfChartInstances[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: label,
                data: values,
                borderColor: color,
                backgroundColor: color + '1A',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointRadius: 5,
                pointHoverRadius: 7,
                pointBackgroundColor: color,
                pointBorderColor: '#fff',
                pointBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true, position: 'bottom', labels: { usePointStyle: true, padding: 15 } },
                tooltip: {
                    callbacks: {
                        label: function(context) { return context.dataset.label + ': ' + context.parsed.y.toFixed(2) + ' MB'; }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    title: { display: true, text: 'GWP (Million Baht)' },
                    ticks: { callback: function(v) { return v.toFixed(1) + 'M'; } },
                    grid: { color: 'rgba(0,0,0,0.05)' }
                },
                x: { grid: { display: false } }
            }
        }
    });
}

function renderDynDistChart(canvasId, teams, baseColor) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    
    var ctx = canvas.getContext('2d');
    var topTeams = teams.slice(0, 10);
    var labels = topTeams.map(function(t) { return agentNameMap[t.code] || t.code; });
    var data = topTeams.map(function(t) { return (t.gwp / 1000000); });
    
    // Generate gradient colors
    var colors = topTeams.map(function(_, i) {
        var opacity = 0.9 - (i * 0.06);
        if (opacity < 0.3) opacity = 0.3;
        return baseColor + Math.round(opacity * 255).toString(16).padStart(2, '0');
    });
    
    teamPerfChartInstances[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'GWP (MB)',
                data: data,
                backgroundColor: colors,
                borderColor: baseColor,
                borderWidth: 2,
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            var team = topTeams[context.dataIndex];
                            return [
                                'Team: ' + (agentNameMap[team.code] || team.code),
                                'Province: ' + team.province,
                                'GWP: ' + (team.gwp / 1000000).toFixed(2) + ' MB'
                            ];
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: 'GWP (MB)' },
                    grid: { color: 'rgba(0,0,0,0.05)' }
                },
                x: { grid: { display: false }, ticks: { maxRotation: 45, minRotation: 0 } }
            }
        }
    });
}

// Handle team performance month change independently
function onTeamPerfMonthChange() {
    var select = document.getElementById('teamPerfMonthSelect');
    if (!select) return;
    var yyyymm = select.value;
    
    // Convert to "Month, Year" format and update the global selectedMonth
    // so it syncs with the main filter
    var monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December'];
    var parts = yyyymm.split('-');
    var monthIdx = parseInt(parts[1]) - 1;
    var newSelectedMonth = monthNames[monthIdx] + ', ' + parts[0];
    
    // Update the main month filter if it exists and has this option
    var mainFilter = document.getElementById('monthFilter');
    if (mainFilter) {
        for (var i = 0; i < mainFilter.options.length; i++) {
            if (mainFilter.options[i].value === newSelectedMonth) {
                mainFilter.value = newSelectedMonth;
                selectedMonth = newSelectedMonth;
                break;
            }
        }
    }
    
    // If the main filter doesn't have this month, set a temporary override
    // by directly setting selectedMonth to the matched format
    if (selectedMonth !== newSelectedMonth) {
        // Store as global so team perf can use it
        selectedMonth = newSelectedMonth;
    }
    
    renderTeamPerformanceDynamic();
}

function resetTeamPerfData() {
    teamPerfRawData = [];
    
    // Destroy charts
    Object.keys(teamPerfChartInstances).forEach(function(key) {
        if (teamPerfChartInstances[key]) {
            teamPerfChartInstances[key].destroy();
            delete teamPerfChartInstances[key];
        }
    });
    
    var uploadSection = document.getElementById('teamPerfUploadSection');
    var dynamicContent = document.getElementById('teamPerfDynamicContent');
    if (uploadSection) uploadSection.style.display = 'block';
    if (dynamicContent) {
        dynamicContent.style.display = 'none';
        dynamicContent.innerHTML = '';
    }
    
    // Reset file inputs and statuses
    var input1 = document.getElementById('teamPerfFileInput');
    var input2 = document.getElementById('teamPerfFileInputMain');
    if (input1) input1.value = '';
    if (input2) input2.value = '';
    
    ['teamPerfFileStatus', 'teamPerfFileStatusMain'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) { el.classList.remove('success', 'error', 'loading'); el.innerHTML = ''; }
    });
}

// Initialize file handlers on DOM ready
setupTeamPerfFileHandlers();

console.log('✅ Dynamic Team Performance module loaded');

// ========================================
// FLEET ANALYSIS - GOOGLE SHEETS INTEGRATION
// ========================================

let fleetData = null; // { targets: [], actuals: [], months: [] }
let fleetChartInstances = {};
let fleetSaleTrackingData = []; // Raw rows from sale-tracking tab

// Extract spreadsheet ID and GID from URL
function parseSheetUrl(url) {
    var match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    var spreadsheetId = match ? match[1] : null;
    
    var gidMatch = url.match(/gid=(\d+)/);
    var gid = gidMatch ? gidMatch[1] : '0';
    
    return { spreadsheetId: spreadsheetId, gid: gid };
}

// Fetch data from Google Sheets
function fetchFleetData() {
    var urlInput = document.getElementById('fleetSheetUrl');
    var sheetNameInput = document.getElementById('fleetSheetName');
    var statusEl = document.getElementById('fleetFetchStatus');
    
    if (!urlInput || !urlInput.value.trim()) {
        showUploadStatus('fleetFetchStatus', 'error', '✗ Please enter a Google Sheet URL');
        return;
    }
    
    var parsed = parseSheetUrl(urlInput.value.trim());
    if (!parsed.spreadsheetId) {
        showUploadStatus('fleetFetchStatus', 'error', '✗ Invalid Google Sheet URL');
        return;
    }
    
    showUploadStatus('fleetFetchStatus', 'loading', '🔄 Fetching data from Google Sheets...');
    
    var sheetName = (sheetNameInput && sheetNameInput.value.trim()) || 'summary';
    
    // Use the Google Sheets CSV export URL
    var csvUrl = 'https://docs.google.com/spreadsheets/d/' + parsed.spreadsheetId + '/gviz/tq?tqx=out:csv&gid=' + parsed.gid;
    
    console.log('Fetching summary:', csvUrl);
    
    // Also fetch sale-tracking tab (gid=653258568)
    var saleTrackingUrl = 'https://docs.google.com/spreadsheets/d/' + parsed.spreadsheetId + '/gviz/tq?tqx=out:csv&gid=653258568';
    
    // Fetch both tabs in parallel
    Promise.all([
        fetch(csvUrl).then(function(r) { 
            if (!r.ok) throw new Error('HTTP ' + r.status + ' - Make sure the sheet is shared publicly');
            return r.text(); 
        }),
        fetch(saleTrackingUrl).then(function(r) { 
            if (!r.ok) { console.warn('Sale-tracking tab not accessible'); return ''; }
            return r.text(); 
        }).catch(function() { return ''; })
    ])
    .then(function(results) {
        var summaryCSV = results[0];
        var saleTrackingCSV = results[1];
        
        console.log('=== FLEET CSV FETCHED ===');
        console.log('Summary length:', summaryCSV.length);
        console.log('Sale-tracking length:', saleTrackingCSV.length);
        
        // Parse summary
        Papa.parse(summaryCSV, {
            header: false,
            skipEmptyLines: true,
            complete: function(summaryResults) {
                console.log('Summary parsed rows:', summaryResults.data.length);
                
                for (var i = 0; i < Math.min(summaryResults.data.length, 25); i++) {
                    console.log('Row ' + (i+1) + ':', summaryResults.data[i]);
                }
                
                // Parse sale-tracking if available
                if (saleTrackingCSV) {
                    Papa.parse(saleTrackingCSV, {
                        header: true,
                        skipEmptyLines: true,
                        transformHeader: function(h) { return h.trim(); },
                        complete: function(stResults) {
                            console.log('Sale-tracking parsed rows:', stResults.data.length);
                            fleetSaleTrackingData = stResults.data;
                            processFleetSheetData(summaryResults.data);
                        },
                        error: function() {
                            processFleetSheetData(summaryResults.data);
                        }
                    });
                } else {
                    processFleetSheetData(summaryResults.data);
                }
            },
            error: function(error) {
                showUploadStatus('fleetFetchStatus', 'error', '✗ CSV parse error: ' + error.message);
            }
        });
    })
    .catch(function(error) {
        console.error('Fetch error:', error);
        showUploadStatus('fleetFetchStatus', 'error', '✗ ' + error.message);
    });
}

// Process the raw sheet data
// Rows 10-21 (1-indexed) = indices 9-20
// Column C = index 2 (targets), Column D = index 3 (actuals)
function processFleetSheetData(rows) {
    console.log('=== PROCESSING FLEET SHEET ===');
    console.log('Total rows:', rows.length);
    for (var d = 0; d < Math.min(rows.length, 25); d++) {
        console.log('Row ' + (d+1) + ':', rows[d]);
    }
    
    var targets = [];
    var actuals = [];
    var months = [];
    var policies = [];
    var aovs = [];
    
    // Smart parsing: scan all rows, find data rows by looking for month patterns in column A
    // Format: "2025-Aug", "2026-Jan", etc. or "YYYY-Mon"
    var monthMap = { 'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
                     'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11 };
    var monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December'];
    
    // Detect which columns are Target and GWP by finding header row
    var targetCol = 1;  // Default: column B (index 1)
    var gwpCol = 2;     // Default: column C (index 2)
    var policyCol = -1;
    var aovCol = -1;
    
    // Scan for header row
    for (var h = 0; h < Math.min(rows.length, 10); h++) {
        var hRow = rows[h];
        if (!hRow) continue;
        for (var c = 0; c < hRow.length; c++) {
            var cellLower = String(hRow[c] || '').toLowerCase().trim();
            if (cellLower === 'target') targetCol = c;
            if (cellLower === 'net premium' || cellLower === 'gwp' || cellLower === 'net_premium') gwpCol = c;
            if (cellLower === 'policy' || cellLower === 'policies') policyCol = c;
            if (cellLower === 'aov') aovCol = c;
        }
    }
    console.log('Detected columns - Target:', targetCol, 'GWP:', gwpCol, 'Policy:', policyCol, 'AOV:', aovCol);
    
    // Scan all rows for month data
    for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        if (!row || !row[0]) continue;
        
        var cellA = String(row[0]).trim();
        
        // Skip header rows and total rows
        if (cellA.toLowerCase() === 'month' || cellA.toLowerCase().indexOf('total') !== -1) continue;
        
        // Try to parse "YYYY-Mon" format (e.g., "2026-Jan", "2025-Aug")
        var match = cellA.match(/(\d{4})-(\w{3})/);
        if (!match) continue;
        
        var year = parseInt(match[1]);
        var monAbbr = match[2].toLowerCase();
        var monthIdx = monthMap[monAbbr];
        
        if (monthIdx === undefined || isNaN(year)) continue;
        
        var monthLabel = monthNames[monthIdx] + ', ' + year;
        
        var targetVal = parseFloat(String(row[targetCol] || '0').replace(/,/g, '').replace(/"/g, ''));
        var gwpVal = parseFloat(String(row[gwpCol] || '0').replace(/,/g, '').replace(/"/g, ''));
        
        months.push(monthLabel);
        targets.push(isNaN(targetVal) ? 0 : targetVal);
        actuals.push(isNaN(gwpVal) ? 0 : gwpVal);
        
        if (policyCol >= 0) {
            var polVal = parseInt(String(row[policyCol] || '0').replace(/,/g, ''));
            policies.push(isNaN(polVal) ? 0 : polVal);
        }
        if (aovCol >= 0) {
            var aovVal = parseFloat(String(row[aovCol] || '0').replace(/,/g, ''));
            aovs.push(isNaN(aovVal) ? 0 : aovVal);
        }
    }
    
    console.log('Fleet months:', months);
    console.log('Fleet targets:', targets);
    console.log('Fleet actuals:', actuals);
    console.log('Fleet policies:', policies);
    
    if (months.length === 0) {
        showUploadStatus('fleetFetchStatus', 'error', '✗ No month data found. Check sheet format (Column A should have "YYYY-Mon" like "2026-Jan").');
        return;
    }
    
    // Detect main year (the year with most months)
    var yearCounts = {};
    months.forEach(function(m) {
        var y = m.split(', ')[1];
        yearCounts[y] = (yearCounts[y] || 0) + 1;
    });
    var mainYear = Object.keys(yearCounts).sort(function(a, b) { return yearCounts[b] - yearCounts[a]; })[0];
    
    fleetData = {
        targets: targets,
        actuals: actuals,
        months: months,
        policies: policies,
        aovs: aovs,
        year: parseInt(mainYear) || 2026
    };
    
    showUploadStatus('fleetFetchStatus', 'success', '✔ Data loaded: ' + months.length + ' months of Fleet GWP data (includes historical)');
    
    renderFleetAnalysis();
}
function renderFleetAnalysis() {
    var container = document.getElementById('fleetDynamicContent');
    if (!container || !fleetData) return;
    
    // Destroy old charts
    Object.keys(fleetChartInstances).forEach(function(key) {
        if (fleetChartInstances[key]) {
            fleetChartInstances[key].destroy();
            delete fleetChartInstances[key];
        }
    });
    
    var targets = fleetData.targets;
    var actuals = fleetData.actuals;
    var months = fleetData.months;
    var policies = fleetData.policies || [];
    var aovs = fleetData.aovs || [];
    
    // Determine the "current" month (last month with non-zero actual data)
    var currentMonthIdx = -1;
    for (var i = actuals.length - 1; i >= 0; i--) {
        if (actuals[i] > 0) {
            currentMonthIdx = i;
            break;
        }
    }
    
    // If month filter is set, try to match
    if (selectedMonth) {
        for (var j = 0; j < months.length; j++) {
            if (months[j] === selectedMonth) {
                currentMonthIdx = j;
                break;
            }
        }
    }
    
    if (currentMonthIdx < 0) currentMonthIdx = 0;
    
    var currentTarget = targets[currentMonthIdx] || 0;
    var currentActual = actuals[currentMonthIdx] || 0;
    var prevActual = currentMonthIdx > 0 ? (actuals[currentMonthIdx - 1] || 0) : 0;
    var momGrowth = prevActual > 0 ? ((currentActual - prevActual) / prevActual * 100) : 0;
    var variance = currentActual - currentTarget;
    var currentMonthFull = months[currentMonthIdx] || ''; // e.g. "January, 2026"
    var currentMonthName = currentMonthFull ? currentMonthFull.split(',')[0].trim() : '';
    
    // Calculate YTD
    var ytdTarget = 0;
    var ytdActual = 0;
    for (var k = 0; k <= currentMonthIdx; k++) {
        ytdTarget += targets[k] || 0;
        ytdActual += actuals[k] || 0;
    }
    
    // Detect unit scale (MB = millions, or raw)
    var maxVal = Math.max.apply(null, targets.concat(actuals).filter(function(v) { return v > 0; }));
    var scaleFactor = 1;
    var scaleLabel = '';
    if (maxVal > 1000000) {
        scaleFactor = 1000000;
        scaleLabel = 'MB';
    } else if (maxVal > 1000) {
        scaleFactor = 1000;
        scaleLabel = 'K';
    } else {
        scaleLabel = '';
    }
    
    // If values are already in MB scale (< 100), don't divide
    if (maxVal < 500) {
        scaleFactor = 1;
        scaleLabel = 'MB';
    }
    
    function fmt(val) {
        var scaled = val / scaleFactor;
        if (scaled === 0) return '0.0' + scaleLabel;
        return scaled.toFixed(1) + scaleLabel;
    }
    
    var html = '';
    
    // Header
    html += '<div style="background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); color: white; padding: 2rem; border-radius: 12px; margin-bottom: 2rem;">';
    html += '<h1 style="margin: 0; font-size: 2rem; font-weight: 800;">Fleet GWP</h1>';
    html += '<p style="margin: 0.5rem 0 0 0; opacity: 0.9;">Data pulled from Google Sheets — ' + (fleetData.year || '') + '</p>';
    html += '</div>';
    
    // Metric cards
    html += '<div class="metrics-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">';
    
    html += '<div class="metric-card">';
    html += '<div class="metric-label">Current GWP (' + currentMonthName + ')</div>';
    html += '<div class="metric-value" style="color: #2563EB;">' + fmt(currentActual) + '</div>';
    html += '<div class="metric-subtitle">Target: ' + fmt(currentTarget);
    if (momGrowth !== 0) {
        var momColor = momGrowth >= 0 ? '#10B981' : '#EF4444';
        var momArrow = momGrowth >= 0 ? '↑' : '↓';
        html += ' <span class="metric-change" style="background: ' + (momGrowth >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)') + '; color: ' + momColor + ';">' + momArrow + ' ' + Math.abs(momGrowth).toFixed(1) + '% MoM</span>';
    }
    html += '</div></div>';
    
    html += '<div class="metric-card">';
    html += '<div class="metric-label">Variance</div>';
    var varColor = variance >= 0 ? '#10B981' : '#EF4444';
    html += '<div class="metric-value" style="color: ' + varColor + ';">' + (variance >= 0 ? '+' : '') + fmt(variance) + '</div>';
    html += '<div class="metric-subtitle">' + (variance >= 0 ? 'Exceeded target' : 'Below target') + '</div>';
    html += '</div>';
    
    html += '<div class="metric-card">';
    html += '<div class="metric-label">YTD Actual</div>';
    html += '<div class="metric-value">' + fmt(ytdActual) + '</div>';
    html += '<div class="metric-subtitle">YTD Target: ' + fmt(ytdTarget) + '</div>';
    html += '</div>';
    
    html += '<div class="metric-card">';
    html += '<div class="metric-label">MoM Growth</div>';
    var momClass = momGrowth >= 0 ? '#10B981' : '#EF4444';
    html += '<div class="metric-value" style="color: ' + momClass + ';">' + (momGrowth >= 0 ? '+' : '') + momGrowth.toFixed(1) + '%</div>';
    html += '<div class="metric-subtitle">' + (prevActual > 0 ? fmt(prevActual) + ' → ' + fmt(currentActual) : 'No previous data') + '</div>';
    html += '</div>';
    
    // Policies card (if data available)
    var policies = fleetData.policies || [];
    var aovs = fleetData.aovs || [];
    if (policies.length > currentMonthIdx && policies[currentMonthIdx] > 0) {
        html += '<div class="metric-card">';
        html += '<div class="metric-label">Policies (' + currentMonthName + ')</div>';
        html += '<div class="metric-value" style="color: #7C3AED;">' + policies[currentMonthIdx].toLocaleString() + '</div>';
        var prevPol = currentMonthIdx > 0 ? (policies[currentMonthIdx - 1] || 0) : 0;
        if (prevPol > 0) {
            var polChange = ((policies[currentMonthIdx] - prevPol) / prevPol * 100);
            var polColor = polChange >= 0 ? '#10B981' : '#EF4444';
            var polArrow = polChange >= 0 ? '↑' : '↓';
            html += '<div class="metric-subtitle">Prev: ' + prevPol.toLocaleString() + ' <span class="metric-change" style="background: ' + (polChange >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)') + '; color: ' + polColor + ';">' + polArrow + ' ' + Math.abs(polChange).toFixed(1) + '%</span></div>';
        }
        html += '</div>';
    }
    
    // AOV card
    if (aovs.length > currentMonthIdx && aovs[currentMonthIdx] > 0) {
        html += '<div class="metric-card">';
        html += '<div class="metric-label">Avg Order Value (' + currentMonthName + ')</div>';
        html += '<div class="metric-value" style="color: #0891B2;">' + Math.round(aovs[currentMonthIdx]).toLocaleString() + '</div>';
        html += '<div class="metric-subtitle">Per policy</div>';
        html += '</div>';
    }
    
    html += '</div>';
    
    // Chart
    html += '<div class="chart-card" style="margin-bottom: 2rem;">';
    html += '<h3 class="chart-title">Fleet GWP — Target vs Actual</h3>';
    html += '<div style="position: relative; height: 400px;"><canvas id="fleetGwpChart"></canvas></div>';
    html += '</div>';
    
    // Monthly breakdown table
    html += '<div class="table-section" style="background: var(--card-bg); border-radius: 12px; padding: 2rem; box-shadow: var(--shadow-md); border: 1px solid var(--border); overflow-x: auto; margin-bottom: 2rem;">';
    html += '<h2 style="font-size: 1.5rem; font-weight: 800; margin-bottom: 1rem; color: var(--primary);">Monthly Breakdown</h2>';
    html += '<table class="data-table"><thead><tr>';
    html += '<th>Month</th><th>Target</th><th>Net Premium</th><th>Variance</th><th>% Achievement</th><th>Policy</th><th>AOV</th><th>MoM Change</th><th>Status</th>';
    html += '</tr></thead><tbody>';
    
    months.forEach(function(month, idx) {
        var t = targets[idx] || 0;
        var a = actuals[idx] || 0;
        var v = a - t;
        var pct = t > 0 ? (a / t * 100) : 0;
        var prevA = idx > 0 ? (actuals[idx - 1] || 0) : 0;
        var mom = prevA > 0 ? ((a - prevA) / prevA * 100) : 0;
        var isCurrent = idx === currentMonthIdx;
        var isFuture = a === 0 && idx > currentMonthIdx;
        
        var statusBadge = '';
        var rowStyle = '';
        if (isCurrent) {
            rowStyle = 'background: rgba(37, 99, 235, 0.05); font-weight: 600;';
        }
        if (isFuture) {
            rowStyle = 'opacity: 0.4;';
            statusBadge = '<span style="color: var(--text-muted);">—</span>';
        } else if (a > 0) {
            if (pct >= 100) {
                statusBadge = '<span class="table-status-badge achieved" title="Achieved">✔</span>';
            } else if (pct >= 90) {
                statusBadge = '<span class="table-status-badge slightly-under" title="Near Target">⚠</span>';
            } else {
                statusBadge = '<span class="table-status-badge under" title="Under Target">✗</span>';
            }
        } else {
            statusBadge = '<span style="color: var(--text-muted);">—</span>';
        }
        
        var momDisplay = '';
        if (idx > 0 && a > 0 && prevA > 0) {
            var momCol = mom >= 0 ? '#10B981' : '#EF4444';
            var momArr = mom >= 0 ? '↑' : '↓';
            momDisplay = '<span style="color: ' + momCol + '; font-weight: 600;">' + momArr + ' ' + Math.abs(mom).toFixed(1) + '%</span>';
        } else {
            momDisplay = '<span style="color: var(--text-muted);">—</span>';
        }
        
        var monthLabel = month.split(',')[0];
        var monthLabel = month;
        if (isCurrent) monthLabel = '<span style="background: #FEF08A; padding: 0.15rem 0.5rem; border-radius: 4px;">' + month + '</span>';
        
        var polCell = (policies.length > idx && policies[idx] > 0) ? policies[idx].toLocaleString() : '—';
        var aovCell = (aovs.length > idx && aovs[idx] > 0) ? Math.round(aovs[idx]).toLocaleString() : '—';
        
        html += '<tr style="' + rowStyle + '">';
        html += '<td>' + monthLabel + '</td>';
        html += '<td style="font-family: \'IBM Plex Mono\', monospace;">' + fmt(t) + '</td>';
        html += '<td style="font-family: \'IBM Plex Mono\', monospace; font-weight: 600; color: #2563EB;">' + (a > 0 ? fmt(a) : '<span style="color: var(--text-muted);">—</span>') + '</td>';
        html += '<td style="font-family: \'IBM Plex Mono\', monospace; color: ' + (v >= 0 ? '#10B981' : '#EF4444') + ';">' + (a > 0 ? (v >= 0 ? '+' : '') + fmt(v) : '—') + '</td>';
        html += '<td style="font-family: \'IBM Plex Mono\', monospace;">' + (a > 0 ? pct.toFixed(1) + '%' : '—') + '</td>';
        html += '<td style="font-family: \'IBM Plex Mono\', monospace;">' + polCell + '</td>';
        html += '<td style="font-family: \'IBM Plex Mono\', monospace;">' + aovCell + '</td>';
        html += '<td>' + momDisplay + '</td>';
        html += '<td>' + statusBadge + '</td>';
        html += '</tr>';
    });
    
    // Total row
    var totalPolicies = policies.reduce(function(s, p, i) { return i <= currentMonthIdx ? s + p : s; }, 0);
    html += '<tr style="background: var(--bg); font-weight: 700; border-top: 2px solid var(--accent);">';
    html += '<td>YTD Total</td>';
    html += '<td style="font-family: \'IBM Plex Mono\', monospace;">' + fmt(ytdTarget) + '</td>';
    html += '<td style="font-family: \'IBM Plex Mono\', monospace; color: #2563EB;">' + fmt(ytdActual) + '</td>';
    var ytdVar = ytdActual - ytdTarget;
    html += '<td style="font-family: \'IBM Plex Mono\', monospace; color: ' + (ytdVar >= 0 ? '#10B981' : '#EF4444') + ';">' + (ytdVar >= 0 ? '+' : '') + fmt(ytdVar) + '</td>';
    var ytdPct = ytdTarget > 0 ? (ytdActual / ytdTarget * 100) : 0;
    html += '<td style="font-family: \'IBM Plex Mono\', monospace;">' + ytdPct.toFixed(1) + '%</td>';
    html += '<td style="font-family: \'IBM Plex Mono\', monospace;">' + (totalPolicies > 0 ? totalPolicies.toLocaleString() : '') + '</td>';
    html += '<td></td><td></td><td></td>';
    html += '</tr>';
    
    html += '</tbody></table></div>';
    
    // Key Highlights
    html += buildFleetHighlights(currentMonthIdx, currentMonthFull, currentActual, currentTarget, prevActual, momGrowth, ytdActual, ytdTarget);
    
    container.innerHTML = html;
    
    // Render chart
    setTimeout(function() { renderFleetChart(months, targets, actuals, currentMonthIdx, scaleFactor, scaleLabel); }, 100);
}

function buildFleetHighlights(currentMonthIdx, currentMonthName, currentActual, currentTarget, prevActual, momGrowth, ytdActual, ytdTarget) {
    var variance = currentActual - currentTarget;
    var exceeded = variance >= 0;
    
    // Detect unit scale
    var maxVal = Math.max(currentActual, currentTarget, prevActual);
    var scaleFactor = 1;
    var scaleLabel = '';
    if (maxVal > 1000000) { scaleFactor = 1000000; scaleLabel = 'M THB'; }
    else if (maxVal > 1000) { scaleFactor = 1000; scaleLabel = 'K'; }
    else { scaleLabel = 'MB'; }
    if (maxVal < 500) { scaleFactor = 1; scaleLabel = 'MB'; }
    
    function fmt(v) { return (v / scaleFactor).toFixed(2) + scaleLabel; }
    
    // Analyze sale-tracking data for leads and conversions
    var saleStats = analyzeSaleTracking(currentMonthName);
    
    var statusColor = exceeded ? '#10B981' : '#EF4444';
    var statusBg = exceeded ? '#F0FDF4' : '#FEF2F2';
    var momColor = momGrowth >= 0 ? '#10B981' : '#EF4444';
    
    var html = '<div style="background: var(--card-bg); border-radius: 12px; padding: 2rem; box-shadow: var(--shadow-md); border: 1px solid var(--border); margin-bottom: 2rem;">';
    html += '<h2 style="font-size: 1.75rem; font-weight: 800; margin-bottom: 1.5rem; color: var(--primary); border-bottom: 3px solid #e5e7eb; padding-bottom: 1rem;">Key Highlight :</h2>';
    
    // Main GWP insight card - matching screenshot style
    html += '<div style="display: flex; gap: 1rem; padding: 1.5rem; background: #f9fafb; border-radius: 12px; margin-bottom: 1.5rem; border-left: 5px solid #DC2626;">';
    html += '<div style="flex-shrink: 0; width: 36px; height: 36px; background: #DC2626; color: white; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 1.1rem;">1</div>';
    html += '<div style="flex: 1;">';
    html += '<p style="font-size: 1.05rem; line-height: 2; color: var(--text-primary); margin: 0;">';
    html += '<strong>Total actual GWP reached ' + fmt(currentActual) + '</strong><br>';
    html += '<strong>Total GWP ' + (exceeded ? 'exceeded' : 'fell short of') + ' target by ' + fmt(Math.abs(variance)) + '</strong><br>';
    html += '<strong>MoM Growth <span style="color: ' + momColor + ';">' + (momGrowth >= 0 ? '+' : '') + momGrowth.toFixed(0) + '%</span></strong>';
    html += '</p>';
    
    // Sale-tracking insights (Lead Volume + Conversion Rate)
    if (saleStats.currentLeads > 0) {
        html += '<div style="margin-top: 1.25rem; padding-top: 1rem; border-top: 1px solid #e5e7eb;">';
        
        // Lead Volume
        html += '<p style="font-size: 0.95rem; line-height: 1.8; color: #4B5563; margin: 0 0 0.5rem 0;">';
        html += '- <strong>Lead Volume:</strong> ';
        if (saleStats.prevLeads > 0) {
            var leadGrowth = ((saleStats.currentLeads - saleStats.prevLeads) / saleStats.prevLeads * 100).toFixed(0);
            html += 'The number of incoming leads ';
            if (parseInt(leadGrowth) > 0) {
                html += 'surged from ' + saleStats.prevLeads + ' to ' + saleStats.currentLeads + ', representing a <strong>' + leadGrowth + '% growth</strong>.';
            } else {
                html += 'went from ' + saleStats.prevLeads + ' to ' + saleStats.currentLeads + ' (' + leadGrowth + '%).';
            }
        } else {
            html += 'Total incoming leads: <strong>' + saleStats.currentLeads + '</strong>.';
        }
        html += '</p>';
        
        // Conversion Rate
        html += '<p style="font-size: 0.95rem; line-height: 1.8; color: #4B5563; margin: 0;">';
        html += '- <strong>Conversion Rate:</strong> ';
        html += 'We successfully closed <strong>' + saleStats.closedCases + ' cases</strong>, ';
        var convRate = saleStats.currentLeads > 0 ? (saleStats.closedCases / saleStats.currentLeads * 100).toFixed(0) : 0;
        html += 'resulting in a <strong>' + convRate + '% conversion rate</strong> out of the ' + saleStats.currentLeads + ' leads.';
        html += '</p>';
        
        html += '</div>';
    }
    
    html += '</div></div>';
    
    // YTD insight card
    var ytdVar = ytdActual - ytdTarget;
    var ytdExceeded = ytdVar >= 0;
    var ytdColor = ytdExceeded ? '#10B981' : '#EF4444';
    
    html += '<div style="display: flex; gap: 1rem; padding: 1.5rem; background: #f9fafb; border-radius: 12px; margin-bottom: 1rem; border-left: 5px solid #6366F1;">';
    html += '<div style="flex-shrink: 0; width: 36px; height: 36px; background: #6366F1; color: white; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 1.1rem;">2</div>';
    html += '<div style="flex: 1;">';
    html += '<p style="font-size: 1.05rem; line-height: 2; color: var(--text-primary); margin: 0;">';
    html += '<strong>YTD Performance:</strong> Actual ' + fmt(ytdActual) + ' vs Target ' + fmt(ytdTarget) + ' ';
    html += '(<strong style="color: ' + ytdColor + ';">' + (ytdExceeded ? '+' : '') + fmt(ytdVar) + '</strong>)';
    
    // YTD achievement percentage
    var ytdPct = ytdTarget > 0 ? (ytdActual / ytdTarget * 100) : 0;
    html += '<br><strong>Achievement: <span style="color: ' + ytdColor + ';">' + ytdPct.toFixed(1) + '%</span></strong>';
    html += '</p>';
    html += '</div></div>';
    
    html += '</div>';
    return html;
}

// Analyze sale-tracking data for a given month
function analyzeSaleTracking(monthName) {
    var result = { currentLeads: 0, prevLeads: 0, closedCases: 0 };
    
    if (!fleetSaleTrackingData || fleetSaleTrackingData.length === 0) return result;
    
    console.log('=== ANALYZING SALE TRACKING for month:', monthName, '===');
    
    // Find the column that contains check-premium month (เดือนเช็คเบี้ย)
    // From the sheet: column headers include เดือนเช็คเบี้ย and สรุปสถานะกรมธรรม์
    var headers = Object.keys(fleetSaleTrackingData[0] || {});
    console.log('Sale-tracking headers:', headers);
    
    // Match month format: "2026-Jan" -> need to convert from "January, 2026" to "2026-Jan"
    var monthMap2 = { 'January': 'Jan', 'February': 'Feb', 'March': 'Mar', 'April': 'Apr',
                     'May': 'May', 'June': 'Jun', 'July': 'Jul', 'August': 'Aug',
                     'September': 'Sep', 'October': 'Oct', 'November': 'Nov', 'December': 'Dec' };
    
    var parts = monthName ? monthName.split(',') : [];
    var monthAbbr = parts[0] ? monthMap2[parts[0].trim()] : '';
    var year = parts[1] ? parts[1].trim() : '';
    var targetMonthStr = year + '-' + monthAbbr; // e.g., "2026-Jan"
    
    // Also compute previous month
    var monthNamesFull = ['January', 'February', 'March', 'April', 'May', 'June',
                         'July', 'August', 'September', 'October', 'November', 'December'];
    var monthAbbrArr = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var curMonIdx = monthNamesFull.indexOf(parts[0] ? parts[0].trim() : '');
    var prevMonthStr = '';
    if (curMonIdx >= 0) {
        if (curMonIdx === 0) {
            prevMonthStr = (parseInt(year) - 1) + '-Dec';
        } else {
            prevMonthStr = year + '-' + monthAbbrArr[curMonIdx - 1];
        }
    }
    
    console.log('Target month string:', targetMonthStr, 'Prev month string:', prevMonthStr);
    
    // Find the right column names (they may have different names due to sheet structure)
    var premiumMonthCol = '';
    var statusCol = '';
    
    headers.forEach(function(h) {
        var hLower = h.toLowerCase().trim();
        // เดือนเช็คเบี้ย = premium check month
        if (h.indexOf('เดือนเช็คเบี้ย') !== -1 && h.indexOf('week') === -1) {
            premiumMonthCol = h;
        }
        // สรุปสถานะกรมธรรม์ = policy status summary  
        if (h.indexOf('สรุปสถานะกรมธรรม์') !== -1 || h.indexOf('สรุปสถานะ') !== -1) {
            statusCol = h;
        }
    });
    
    console.log('Premium month col:', premiumMonthCol, 'Status col:', statusCol);
    
    if (!premiumMonthCol) {
        // Try alternative: use เดือนแจ้งงาน or another month column
        headers.forEach(function(h) {
            if (!premiumMonthCol && h.indexOf('เดือนแจ้งงาน') !== -1 && h.indexOf('ครั้งแรก') === -1 && h.indexOf('ล่าสุด') === -1) {
                premiumMonthCol = h;
            }
        });
    }
    
    if (!premiumMonthCol) {
        console.warn('Could not find premium month column');
        return result;
    }
    
    // Count leads and closed cases
    fleetSaleTrackingData.forEach(function(row) {
        var rowMonth = String(row[premiumMonthCol] || '').trim();
        var rowStatus = String(row[statusCol] || '').trim();
        
        if (rowMonth === targetMonthStr) {
            result.currentLeads++;
            if (rowStatus === 'Complete' || rowStatus.indexOf('Complete') !== -1) {
                result.closedCases++;
            }
        }
        
        if (prevMonthStr && rowMonth === prevMonthStr) {
            result.prevLeads++;
        }
    });
    
    console.log('Sale tracking results:', result);
    return result;
}

function renderFleetChart(months, targets, actuals, currentMonthIdx, scaleFactor, scaleLabel) {
    var canvas = document.getElementById('fleetGwpChart');
    if (!canvas) return;
    
    var ctx = canvas.getContext('2d');
    var labels = months.map(function(m, idx) {
        var short = m.split(',')[0].substring(0, 3) + ' ' + (m.split(',')[1] || '').trim();
        if (idx === currentMonthIdx) return short;
        return short;
    });
    
    var scaledTargets = targets.map(function(v) { return v / scaleFactor; });
    var scaledActuals = actuals.map(function(v) { return v / scaleFactor; });
    
    // Split actuals into actual data and future (0s after current month)
    var actualDataPoints = scaledActuals.map(function(v, i) {
        if (i <= currentMonthIdx) return v;
        return null;
    });
    
    // Target line - show full year with dashed for future
    var targetSolid = scaledTargets.map(function(v, i) {
        return v;
    });
    
    // Data point labels
    var datasets = [
        {
            label: 'Target',
            data: targetSolid,
            borderColor: '#10B981',
            backgroundColor: 'transparent',
            borderWidth: 2.5,
            pointRadius: 6,
            pointBackgroundColor: '#10B981',
            pointStyle: 'rectRot',
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
            tension: 0.3,
            borderDash: [6, 3],
            fill: false,
            datalabels: { display: true }
        },
        {
            label: 'Actual',
            data: actualDataPoints,
            borderColor: '#2563EB',
            backgroundColor: 'rgba(37, 99, 235, 0.05)',
            borderWidth: 3,
            pointRadius: 7,
            pointBackgroundColor: '#2563EB',
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
            tension: 0.3,
            fill: false,
            spanGaps: false
        }
    ];
    
    fleetChartInstances['fleetGwpChart'] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        usePointStyle: true,
                        padding: 20,
                        font: { size: 13, family: "'Manrope', sans-serif", weight: '600' }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(10, 14, 39, 0.95)',
                    padding: 14,
                    titleFont: { size: 14, family: "'Manrope', sans-serif" },
                    bodyFont: { size: 13, family: "'IBM Plex Mono', monospace" },
                    callbacks: {
                        label: function(context) {
                            if (context.parsed.y === null) return null;
                            return context.dataset.label + ': ' + context.parsed.y.toFixed(1) + scaleLabel;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: 'GWP (' + scaleLabel + ')', font: { size: 12, weight: '600' } },
                    ticks: {
                        callback: function(value) { return value.toFixed(1) + scaleLabel; },
                        font: { family: "'IBM Plex Mono', monospace" }
                    },
                    grid: { color: 'rgba(0, 0, 0, 0.05)' }
                },
                x: {
                    grid: { display: false },
                    ticks: {
                        font: { family: "'Manrope', sans-serif", size: 11 },
                        callback: function(value, index) {
                            var label = labels[index];
                            if (index === currentMonthIdx) return '▶ ' + label;
                            return label;
                        }
                    }
                }
            }
        },
        plugins: [{
            // Custom plugin to highlight current month on x-axis
            id: 'currentMonthHighlight',
            afterDraw: function(chart) {
                var xScale = chart.scales.x;
                var yScale = chart.scales.y;
                var ctx = chart.ctx;
                
                if (currentMonthIdx >= 0 && currentMonthIdx < labels.length) {
                    var x = xScale.getPixelForValue(currentMonthIdx);
                    var yTop = yScale.top;
                    var yBottom = yScale.bottom;
                    
                    // Draw highlight band
                    ctx.save();
                    ctx.fillStyle = 'rgba(254, 240, 138, 0.3)';
                    ctx.fillRect(x - 25, yTop, 50, yBottom - yTop);
                    ctx.restore();
                }
            }
        },
        {
            // Custom plugin to show data labels
            id: 'dataLabels',
            afterDatasetsDraw: function(chart) {
                var ctx = chart.ctx;
                chart.data.datasets.forEach(function(dataset, datasetIndex) {
                    var meta = chart.getDatasetMeta(datasetIndex);
                    meta.data.forEach(function(element, index) {
                        var value = dataset.data[index];
                        if (value === null || value === undefined) return;
                        
                        var x = element.x;
                        var y = element.y;
                        
                        ctx.save();
                        ctx.fillStyle = dataset.borderColor;
                        ctx.font = '600 11px "IBM Plex Mono", monospace';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'bottom';
                        ctx.fillText(value.toFixed(1) + scaleLabel, x, y - 10);
                        ctx.restore();
                    });
                });
            }
        }]
    });
}

console.log('✅ Fleet Analysis module loaded');