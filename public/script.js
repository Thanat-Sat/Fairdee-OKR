window.addEventListener('load', function() {
    if (typeof Chart !== 'undefined') {
        Chart.defaults.font.family = "'Google Sans Text', sans-serif";
    }
});

// ========================================
// LESS IS BETTER KRs
// For these KRs, being UNDER the target = achieved (lower is better)
// Progress = (target / current) * 100  — inverted formula
// ========================================
const LESS_IS_BETTER_KRS = new Set([
    'KR-5.3.1',
    'KR-5.3.2',
    //'KR-5.5.2',
    'KR-5.2.2',
   //'KR-5.4.1',
    'KR-5.4.2'
]);

// Per-KR overrides set from the Settings tab and persisted to Firestore.
// Map<kr_name, { percent: bool, lowerBetter: bool }>. When an override exists it wins
// over the hardcoded defaults below.
let krConfigOverrides = new Map();

function defaultIsLowerBetter(krName) {
    return LESS_IS_BETTER_KRS.has(krName);
}

function krIsLowerBetter(krName) {
    const o = krConfigOverrides.get(krName);
    if (o && typeof o.lowerBetter === 'boolean') return o.lowerBetter;
    return defaultIsLowerBetter(krName);
}

// Central progress calculation — handles both normal and "less is better" KRs
function calculateProgress(krName, current, target) {
    if (target === null || target === undefined || current === null || current === undefined) return 0;
    if (krIsLowerBetter(krName)) {
        // Lower current = better. Formula: (target / actual) * 100
        // e.g. target=40, actual=42 → (40/42)*100 = 95.2%
        // e.g. target=0.2, actual=-86 → actual<=0, treat as fully achieved (100%)
        if (current <= 0) return 100;
        return (target / current) * 100;
    }
    if (!target || target === 0) return 0;
    return (current / target) * 100;
}

// ========================================
// MONTHLY TARGETS STORAGE
// ========================================
let monthlyTargets = new Map(); // Structure: Map<krName, Map<month, target>>

let firstTransactingData = [];
let earlyRetentionData = [];
// ========================================
// END OF EMBEDDED TARGETS
// ========================================

// KRs whose values are percentages and should render with a "%" suffix
// next to current/target wherever they appear.
const PERCENTAGE_KRS = new Set([
    '1.1.1',
    '3.2',
    '5.1.1', '5.1.2', '5.1.3', '5.1.4',
    '5.2.1', '5.2.2',
    '5.3.1', '5.3.2',
    '5.4.1'
]);

// Default percent detection (ignores Settings overrides): hardcoded list + unit text.
function defaultIsPercent(krName, row) {
    if (!krName) return false;
    const info = parseKRLevel(krName);
    if (PERCENTAGE_KRS.has(info.number)) return true;
    const r = row || (Array.isArray(csvData) ? csvData.find(x => x.kr_name === krName) : null);
    if (r) {
        const u = (r.unit_name || '').toString().toLowerCase();
        if (u.includes('%') || u.includes('percent')) return true;
    }
    return false;
}

// Override-aware percent check used everywhere a KR is rendered.
function krIsPercent(krName, row) {
    const o = krConfigOverrides.get(krName);
    if (o && typeof o.percent === 'boolean') return o.percent;
    return defaultIsPercent(krName, row);
}

function isPercentageKR(krName) {
    if (!krName) return false;
    return krIsPercent(krName, null);
}

// Render a KR current/target value, appending "%" for percentage-typed KRs.
function formatKRValue(value, krName) {
    if (value === null || value === undefined || (typeof value === 'number' && isNaN(value))) {
        return 'N/A';
    }
    const formatted = formatNumber(value);
    return isPercentageKR(krName) ? formatted + '%' : formatted;
}

let csvData = [];
let filteredData = [];
let allMonths = []; // All unique months found in data
let selectedMonth = ''; // Currently selected month

// ========================================
// LOADING PROGRESS TRACKER
// ========================================
let _loadedCount = 0;
// OKR (Firestore) and Fleet. The Hunter, Team Performance and segment
// contribution fetches were removed: their tabs have no button in
// okr-dashboard.html and nothing embeds them, and the sheet tabs they read
// were deleted upstream — so they only ever reported failures.
const _totalSources = 2;
const _sheetFetchStatusIds = [
    'dataFileStatus',
    'fleetFetchStatus'
];

function _formatSyncTime(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function _setOkrSheetSyncStatus(status, text) {
    var statusEl = document.getElementById('okrSheetSyncStatus');
    if (!statusEl) return;

    statusEl.classList.remove('sheet-sync-loading', 'sheet-sync-success', 'sheet-sync-warning');
    statusEl.classList.add('sheet-sync-' + status);
    statusEl.innerHTML = '<span class="sheet-sync-dot"></span><span>' + text + '</span>';
}

function _setOkrProgressBanner(state, title, pct) {
    var banner = document.getElementById('okrProgressBanner');
    var titleEl = document.getElementById('okrProgressBannerTitle');
    var fillEl = document.getElementById('okrProgressBannerFill');
    if (!banner) return;

    if (titleEl && typeof title === 'string') titleEl.textContent = title;
    if (fillEl && typeof pct === 'number') fillEl.style.width = Math.max(0, Math.min(100, pct)) + '%';

    if (state === 'show') {
        banner.classList.remove('fade-out', 'is-complete');
        banner.classList.add('visible');
    } else if (state === 'complete') {
        banner.classList.add('visible', 'is-complete');
        banner.classList.remove('fade-out');
    } else if (state === 'hide') {
        banner.classList.add('fade-out');
        banner.classList.remove('is-complete');
        setTimeout(function() {
            banner.classList.remove('visible', 'fade-out');
        }, 240);
    }
}

// Show banner on initial load
_setOkrProgressBanner('show', 'Fetching data · 0 of ' + _totalSources, 0);

function _getOkrFetchErrorCount() {
    return _sheetFetchStatusIds.reduce(function(count, id) {
        var el = document.getElementById(id);
        return count + (el && el.classList.contains('error') ? 1 : 0);
    }, 0);
}

function _markSourceLoaded() {
    _loadedCount = Math.min(_loadedCount + 1, _totalSources);
    var pct = Math.round((_loadedCount / _totalSources) * 100);
    var fill = document.getElementById('dataLoadingFill');
    var countEl = document.getElementById('dataLoadingCount');
    var textEl = document.getElementById('dataLoadingText');
    if (fill) fill.style.width = pct + '%';
    if (countEl) countEl.textContent = _loadedCount + ' / ' + _totalSources;
    if (_loadedCount < _totalSources) {
        _setOkrSheetSyncStatus('loading', 'Fetching data ' + _loadedCount + ' / ' + _totalSources);
        _setOkrProgressBanner('show', 'Fetching data · ' + _loadedCount + ' of ' + _totalSources, pct);
    }
    if (_loadedCount >= _totalSources) {
        var errorCount = _getOkrFetchErrorCount();
        var syncText = errorCount
            ? 'Data sync complete with ' + errorCount + ' issue' + (errorCount === 1 ? '' : 's')
            : 'Data synced at ' + _formatSyncTime(new Date());
        if (textEl) textEl.textContent = syncText;
        _setOkrSheetSyncStatus(errorCount ? 'warning' : 'success', syncText);
        _setOkrProgressBanner('complete', syncText, 100);
        setTimeout(function() {
            var bar = document.getElementById('dataLoadingBar');
            if (bar) bar.style.display = 'none';
            _setOkrProgressBanner('hide');
        }, 1200);
    }
}

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

    // Prepend a small icon based on status (matches the page's icon set)
    const icons = window.ICONS || {};
    let iconHtml = '';
    if (status === 'success') iconHtml = icons.check || icons['check-circle'] || '';
    else if (status === 'error') iconHtml = icons.x || icons['x-circle'] || '';
    else if (status === 'loading') iconHtml = icons.refresh || '';

    statusEl.innerHTML = iconHtml
        ? '<span style="display: inline-flex; align-items: center; gap: 0.4rem;"><span style="display: inline-flex;">' + iconHtml + '</span>' + message + '</span>'
        : message;
}

// Show dashboard — kept for compatibility but dashboard is now always visible
function showDashboard() {
    renderAll();
}

// ========================================
// FILE INPUT HANDLERS
// ========================================

// OKR, First Transacting, and Early Retention data are all loaded automatically from Google Sheets

// Parse date from "Month, Year" or "YYYY-MM-DD" string
function parseMonthString(monthStr) {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                       'July', 'August', 'September', 'October', 'November', 'December'];
    
    if (!monthStr) return null;
    const trimmed = monthStr.trim();
    
    // Handle ISO format: "2026-01-01" or "2026-01"
    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
    if (isoMatch) {
        return new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, 1);
    }
    
    // Handle "Month, Year" format
    const commaIndex = trimmed.indexOf(',');
    if (commaIndex === -1) return null;
    
    const monthPart = trimmed.substring(0, commaIndex).trim();
    const yearPart = trimmed.substring(commaIndex + 1).trim();
    const monthIndex = monthNames.indexOf(monthPart);
    
    if (monthIndex === -1 || !/^\d{4}$/.test(yearPart)) return null;
    
    return new Date(parseInt(yearPart), monthIndex, 1);
}

// Get target for a KR - uses monthly targets file, then falls back to CSV data
function getTarget(row) {
    const krName = row.kr_name;

    // If a month is selected, try to get the monthly target first
    if (selectedMonth) {
        const monthlyTarget = getMonthlyTarget(krName, selectedMonth);
        if (monthlyTarget !== null) {
            return monthlyTarget;
        }
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

// Normalize any month string to a canonical format "YYYY-MM" for matching
function normalizeMonth(monthStr) {
    if (!monthStr) return null;
    const trimmed = monthStr.trim();
    
    // Handle "2026-01-01" or "2026-01" format
    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
    if (isoMatch) {
        return `${isoMatch[1]}-${isoMatch[2]}`;
    }
    
    // Handle "January, 2026" or "January 2026" format
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                        'July', 'August', 'September', 'October', 'November', 'December'];
    for (let i = 0; i < monthNames.length; i++) {
        if (trimmed.toLowerCase().startsWith(monthNames[i].toLowerCase())) {
            const yearMatch = trimmed.match(/(\d{4})/);
            if (yearMatch) {
                return `${yearMatch[1]}-${String(i + 1).padStart(2, '0')}`;
            }
        }
    }
    
    return trimmed; // fallback: return as-is
}

// Get monthly target for a specific KR and month
function getMonthlyTarget(krName, month) {
    if (!monthlyTargets.has(krName)) return null;
    const krMonthlyTargets = monthlyTargets.get(krName);
    
    // Direct match first
    if (krMonthlyTargets.has(month)) return krMonthlyTargets.get(month);
    
    // Normalize and try matching
    const normalizedInput = normalizeMonth(month);
    for (const [key, value] of krMonthlyTargets.entries()) {
        if (normalizeMonth(key) === normalizedInput) {
            return value;
        }
    }
    return null;
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
                const target = row.monthly_target || row.target || row.Monthly_Target || row['Monthly Target'];
                
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
            
            console.log('✅ Monthly targets loaded for', monthlyTargets.size, 'KRs');
            
            // Show success status
            showUploadStatus('targetsFileStatus', 'success', `Loaded targets for ${monthlyTargets.size} KRs from ${file.name}`);
            const _tuz = document.getElementById('targetsUploadZone');
            if (_tuz) _tuz.classList.add('uploaded');
            
            // Re-render if data is already loaded
            if (csvData.length > 0) {
                renderAll();
            }
        },
        error: function(error) {
            showUploadStatus('targetsFileStatus', 'error', `Error: ${error.message}`);
        }
    });
}

// ========================================
// COLUMN NAME RESOLVER
// Supports both old snake_case and new Title Case CSV formats
// ========================================
function resolveColumns(headers) {
    const find = (...candidates) => headers.find(h => candidates.some(c => h.trim().toLowerCase() === c.toLowerCase())) || null;

    return {
        kr_name:               find('kr_name', 'KR', 'kr'),
        goal_name:             find('goal_name', 'Goal'),
        objective_name:        find('objective_name', 'Objective'),
        kr_topic_name:         find('kr_topic_name', 'Topic'),
        kr_title_name:         find('kr_title_name', 'Title'),
        kr_owner_name:         find('kr_owner_name', 'Owner'),
        ultimate_target_number:find('ultimate_target_number', 'Yearly Target', 'yearly_target'),
        unit_name:             find('unit_name', 'Unit'),
        result_number:         find('result_number', 'Result'),
        monthly_target:        find('monthly_target', 'Monthly Target', 'Monthly_Target'),
        month:                 headers.find(h => h.toLowerCase().includes('month') && h.toLowerCase().includes('baseline'))
                            || headers.find(h => h.toLowerCase() === 'month')
                            || headers.find(h => h.toLowerCase().includes('month')),
    };
}

// Shared OKR data processor — accepts PapaParse results and a source label
function processOKRParsedData(results, sourceName) {
    console.log('=== CSV PARSING DEBUG ===');
    console.log('Total rows:', results.data.length);

    const headers = results.meta.fields || Object.keys(results.data[0] || {});
    console.log('Headers:', headers);

    const cols = resolveColumns(headers);
    console.log('Resolved columns:', cols);

    const monthColumnName = cols.month;
    const valueColumnName = cols.result_number || headers.find(h =>
        h.toLowerCase().includes('result_number') || h.toLowerCase().includes('sum of')
    ) || 'Sum of result_number';

    console.log('Month column:', monthColumnName);
    console.log('Value column:', valueColumnName);

    if (!monthColumnName) {
        console.error('Headers received:', headers);
        showUploadStatus('dataFileStatus', 'error', 'Cannot find month column. Headers: ' + headers.slice(0, 8).join(', '));
        return;
    }

    const monthSet = new Set();
    const groupedData = new Map();
    let filteredRowCount = 0;

    monthlyTargets.clear();

    // Accumulators: collect ALL values per (krKey, month) and per (krName, month)
    // so KRs split into sub-rows (e.g. KR-5.1.4: Type-1 / Non-Type-1 API / Non-Type-1 non-API)
    // can be averaged at the end instead of the last sub-row overwriting earlier ones.
    const valueAccumulators = new Map();   // krKey -> Map<month, number[]>
    const targetAccumulators = new Map();  // krName -> Map<month, number[]>

    results.data.forEach(row => {
        const krName = row[cols.kr_name] || row.kr_name;
        if (!krName || !krName.trim()) return;

        const unitName = row[cols.unit_name] || row.unit_name || '';
        const rowType = row.type || row.result_type || row.measurement_type || '';
        const unitNameStr = unitName.toString().toLowerCase();
        const rowTypeStr = rowType.toString().toLowerCase();

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
            return;
        }

        if (krName.trim() === 'KR-5.2.1' && unitNameStr.includes('rating out of')) {
            filteredRowCount++;
            return;
        }

        const monthStr = row[monthColumnName];
        const valueStr = row[valueColumnName];

        if (monthStr) {
            monthSet.add(monthStr.trim());
        }

        const goalName     = row[cols.goal_name]               || row.goal_name               || '';
        const objName      = row[cols.objective_name]          || row.objective_name          || '';
        const topicName    = row[cols.kr_topic_name]           || row.kr_topic_name           || '';
        const titleName    = row[cols.kr_title_name]           || row.kr_title_name           || '';
        const ownerName    = row[cols.kr_owner_name]           || row.kr_owner_name           || '';
        const yearlyTarget = row[cols.ultimate_target_number]  || row.ultimate_target_number  || '';
        const unitNameVal  = row[cols.unit_name]               || row.unit_name               || '';

        const krKey = `${goalName}|${objName}|${krName}`;

        if (!groupedData.has(krKey)) {
            groupedData.set(krKey, {
                goal_name: goalName,
                objective_name: objName,
                kr_name: krName,
                kr_topic_name: topicName,
                kr_title_name: titleName,
                kr_owner_name: ownerName,
                ultimate_target_number: yearlyTarget,
                unit_name: unitNameVal,
                monthlyData: new Map()
            });
        }

        const krUnitName = unitNameVal.toString().toLowerCase();
        const isPercentKR = krUnitName.includes('%') || krUnitName.includes('percent');

        // Store monthly result value (accumulate; we'll average after the loop)
        if (monthStr && valueStr) {
            let value = parseFloat(valueStr.toString().replace(/,/g, ''));
            if (!isNaN(value)) {
                if (isPercentKR && Math.abs(value) <= 1) value = value * 100;
                if (!valueAccumulators.has(krKey)) valueAccumulators.set(krKey, new Map());
                const monthMap = valueAccumulators.get(krKey);
                const m = monthStr.trim();
                if (!monthMap.has(m)) monthMap.set(m, []);
                monthMap.get(m).push(value);
            }
        }

        // Extract monthly target from the same row (accumulate; average after the loop)
        const monthlyTargetStr = row[cols.monthly_target] || row.monthly_target || '';
        if (monthlyTargetStr && monthStr) {
            let monthlyTargetVal = parseFloat(monthlyTargetStr.toString().replace(/,/g, ''));
            if (!isNaN(monthlyTargetVal)) {
                if (isPercentKR && Math.abs(monthlyTargetVal) <= 1) monthlyTargetVal = monthlyTargetVal * 100;
                const krTrimmed = krName.trim();
                if (!targetAccumulators.has(krTrimmed)) targetAccumulators.set(krTrimmed, new Map());
                const monthMap = targetAccumulators.get(krTrimmed);
                const m = monthStr.trim();
                if (!monthMap.has(m)) monthMap.set(m, []);
                monthMap.get(m).push(monthlyTargetVal);
            }
        }
    });

    // Average accumulated values into the final monthlyData / monthlyTargets stores.
    // KRs with a single sub-row reduce to that one value (avg of 1 = same).
    valueAccumulators.forEach((monthMap, krKey) => {
        const entry = groupedData.get(krKey);
        if (!entry) return;
        monthMap.forEach((values, month) => {
            const avg = values.reduce((s, v) => s + v, 0) / values.length;
            entry.monthlyData.set(month, avg);
        });
    });
    targetAccumulators.forEach((monthMap, krName) => {
        if (!monthlyTargets.has(krName)) monthlyTargets.set(krName, new Map());
        const krTargetMap = monthlyTargets.get(krName);
        monthMap.forEach((values, month) => {
            const avg = values.reduce((s, v) => s + v, 0) / values.length;
            krTargetMap.set(month, avg);
        });
    });

    console.log('Filtered rows:', filteredRowCount);
    console.log('Monthly targets loaded for', monthlyTargets.size, 'KRs');

    allMonths = Array.from(monthSet).sort((a, b) => {
        const dateA = parseMonthString(a);
        const dateB = parseMonthString(b);
        if (!dateA || !dateB) return 0;
        return dateA - dateB;
    });

    console.log('All months found:', allMonths);
    console.log('Total unique KRs:', groupedData.size);

    csvData = Array.from(groupedData.values());
    selectedMonth = allMonths.length > 0 ? allMonths[allMonths.length - 1] : '';
    filteredData = [...csvData];
    populateFilters();
    renderAll();

    showUploadStatus('dataFileStatus', 'success', `Loaded ${csvData.length} KRs from ${sourceName}`);
    document.getElementById('viewDashboardSection').style.display = 'block';
    _markSourceLoaded();
}

// Fetch OKR data from Firestore (okr_data/okr-2026), a daily mirror of the Redshift
// table written by the GitHub Action. The document is readable ONLY by a signed-in
// @fairdee.co.th user (enforced by Firestore security rules), so the numbers are not
// publicly accessible. There is deliberately NO public-Google-Sheet fallback here —
// that would defeat the access control.
let _okrDataLoaded = false;
function fetchOKRData() {
    if (typeof db === 'undefined' || !db) {
        showUploadStatus('dataFileStatus', 'error', 'Firestore not available.');
        _markSourceLoaded();
        return;
    }

    // The Firestore read requires an authenticated @fairdee.co.th user. If nobody is
    // signed in yet, wait — onAuthStateChanged (below) calls this again after sign-in.
    const user = (typeof auth !== 'undefined' && auth) ? auth.currentUser : null;
    if (!user) {
        showUploadStatus('dataFileStatus', 'loading', 'Sign in with your @fairdee.co.th account to load OKR data…');
        return;
    }

    if (_okrDataLoaded) return; // already loaded this session
    showUploadStatus('dataFileStatus', 'loading', 'Loading OKR data…');

    db.collection('okr_data').doc('okr-2026').get()
        .then(function(snap) {
            if (!snap.exists) throw new Error('okr_data/okr-2026 not found — run the refresh workflow');
            const payload = snap.data() || {};
            const rows = payload.rows || [];
            if (!rows.length) throw new Error('no rows in okr_data');
            _okrDataLoaded = true;
            const fields = Object.keys(rows[0]);
            // Reuse the exact same processing path as the CSV/Sheet source.
            processOKRParsedData({ data: rows, meta: { fields: fields } }, 'Redshift mirror');
        })
        .catch(function(err) {
            console.error('OKR Firestore load failed:', err);
            showUploadStatus('dataFileStatus', 'error', 'Could not load OKR data: ' + (err && err.message || err));
            _markSourceLoaded();
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
        // Format ISO dates (e.g. "2026-01-01") nicely for display
        const parsed = parseMonthString(month);
        if (parsed && /^\d{4}-\d{2}/.test(month.trim())) {
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                               'July', 'August', 'September', 'October', 'November', 'December'];
            opt.textContent = `${monthNames[parsed.getMonth()]}, ${parsed.getFullYear()}`;
        } else {
            opt.textContent = month;
        }
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
    // Charts created while a tab is hidden render at zero size — redraw on show.
    if (tabId === 'teamPerformance' && typeof refreshSegContributionChart === 'function') {
        setTimeout(refreshSegContributionChart, 50);
    }
}

// Render all views
function renderAll() {
    updateStats();
    setupRunRateControls();
    renderTopMovers();
    renderExecutiveSummary();
    renderKRStatusOverview();
    renderGoalHighlights();
    renderOKRCards();
    renderDataTable();
    renderActionItems();
    renderSettings();
    renderMonthlyProgress();
    if (teamPerfRawData && teamPerfRawData.length > 0) {
        renderTeamPerformanceDynamic();
    }
    if (fleetData) {
        renderFleetAnalysis();
    }
}

// Update stats
function updateStats() {
    // Header summary counters were removed; keep this hook for existing filter flow.
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

// True for KRs whose value is a ratio/percentage — summing months is meaningless,
// so year-to-date uses an average. Override-aware (Settings tab), then unit/hardcoded.
function isPercentKR(row) {
    return krIsPercent(row && row.kr_name, row);
}

// Build a YTD unit label from the monthly one, e.g. "GWP in monthly" -> "GWP YTD".
function ytdUnitLabel(unitName) {
    const u = (unitName || '').toString().trim();
    if (!u) return 'YTD';
    if (/monthly/i.test(u)) {
        return u.replace(/\bin\s+monthly\b/i, 'YTD').replace(/\bmonthly\b/i, 'YTD').trim();
    }
    return `${u} (YTD)`;
}

// Year-to-date actual: sum of the row's monthly values from the start of the
// effective month's year up to and including that month (selected or latest).
function getYTDValue(row) {
    if (!row || !row.monthlyData) return null;
    const effMonth = getEffectiveMonthForRow(row);
    const effNorm = normalizeMonth(effMonth);
    if (!effNorm) return null;
    const effYear = effNorm.slice(0, 4);
    let sum = 0;
    let found = false;
    for (const m of allMonths) {
        const norm = normalizeMonth(m);
        if (!norm || norm.slice(0, 4) !== effYear || norm > effNorm) continue;
        if (row.monthlyData.has(m)) {
            sum += row.monthlyData.get(m);
            found = true;
        }
    }
    return found ? sum : null;
}

// True year-to-date, INDEPENDENT of the month selector: always sums from the start
// of the latest data year up to the latest available month. Used by the executive
// summary's YTD block so it reflects the real YTD regardless of the selected month.
function getYTDValueUnbound(row) {
    if (!row || !row.monthlyData) return null;
    let latest = null;
    for (let i = allMonths.length - 1; i >= 0; i--) {
        if (row.monthlyData.has(allMonths[i])) { latest = allMonths[i]; break; }
    }
    const effNorm = normalizeMonth(latest);
    if (!effNorm) return null;
    const effYear = effNorm.slice(0, 4);
    let sum = 0;
    let found = false;
    for (const m of allMonths) {
        const norm = normalizeMonth(m);
        if (!norm || norm.slice(0, 4) !== effYear || norm > effNorm) continue;
        if (row.monthlyData.has(m)) {
            sum += row.monthlyData.get(m);
            found = true;
        }
    }
    return found ? sum : null;
}

// Year-to-date average of the row's monthly values (start of year up to the effective
// month). Used for percentage/rate KRs, where summing months is meaningless.
function getYTDAverage(row) {
    if (!row || !row.monthlyData) return null;
    const effMonth = getEffectiveMonthForRow(row);
    const effNorm = normalizeMonth(effMonth);
    if (!effNorm) return null;
    const effYear = effNorm.slice(0, 4);
    let sum = 0;
    let count = 0;
    for (const m of allMonths) {
        const norm = normalizeMonth(m);
        if (!norm || norm.slice(0, 4) !== effYear || norm > effNorm) continue;
        if (row.monthlyData.has(m)) {
            const v = row.monthlyData.get(m);
            if (typeof v === 'number' && !isNaN(v)) { sum += v; count++; }
        }
    }
    return count > 0 ? sum / count : null;
}

// ========================================
// FULL YEAR TARGETS (settable per KR, persisted to Firestore)
// The source sheet has no annual target, so users set it via the "Set Full Year Targets"
// modal. We store them in the existing `targets` collection (which already has working
// security rules) tagged with type 'okr_full_year', rather than a brand-new collection.
// ========================================
let fullYearTargets = new Map(); // Map<kr_name, number>

// Dedicated collection for ALL OKR-dashboard config — kept separate from the shared
// `targets` collection (which holds channel/monthly-metrics business data).
// Doc kinds (distinguished by `type` and id prefix):
//   fyt__<KR>  type 'okr_full_year'     — full-year target per KR
//   cfg__<KR>  type 'okr_kr_config'     — per-KR display config (% / lower-is-better)
//   access     type 'okr_settings_access' — Settings-page allowed-email list
const OKR_SETTINGS_COLLECTION = 'okr_settings';
const FULL_YEAR_TARGET_TYPE = 'okr_full_year';
const KR_CONFIG_TYPE = 'okr_kr_config';
const SETTINGS_ACCESS_TYPE = 'okr_settings_access';
const SETTINGS_ACCESS_DOC_ID = 'access';

// '/' is not allowed in doc ids, so encode the KR name.
function fyTargetDocId(krName) { return 'fyt__' + encodeURIComponent((krName || '').toString().trim()); }
function krConfigDocId(krName) { return 'cfg__' + encodeURIComponent((krName || '').toString().trim()); }

function getFullYearTarget(row) {
    const v = fullYearTargets.get(row.kr_name);
    return (typeof v === 'number' && !isNaN(v)) ? v : null;
}

// Build a full-year unit label from the monthly one, e.g. "GWP in monthly" -> "GWP full year".
function fullYearUnitLabel(unitName) {
    const u = (unitName || '').toString().trim();
    if (!u) return 'Full year';
    if (/monthly/i.test(u)) {
        return u.replace(/\bin\s+monthly\b/i, 'full year').replace(/\bmonthly\b/i, 'full year').trim();
    }
    return `${u} (full year)`;
}

// Escape a string for safe use inside a double-quoted HTML attribute.
function escAttr(str) {
    return (str === null || str === undefined ? '' : String(str))
        .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// One read of the okr_settings collection populates all three in-memory stores.
async function loadOkrSettings() {
    if (typeof db === 'undefined' || !db) return;
    try {
        const snap = await db.collection(OKR_SETTINGS_COLLECTION).get();
        fullYearTargets.clear();
        krConfigOverrides.clear();
        settingsAllowedExtra.clear();
        snap.forEach(doc => {
            const d = doc.data() || {};
            if (d.type === FULL_YEAR_TARGET_TYPE) {
                const value = typeof d.value === 'number' ? d.value : parseFloat(d.value);
                if (d.name && !isNaN(value)) fullYearTargets.set(d.name, value);
            } else if (d.type === KR_CONFIG_TYPE) {
                if (d.name) krConfigOverrides.set(d.name, { percent: !!d.percent, lowerBetter: !!d.lowerBetter });
            } else if (d.type === SETTINGS_ACCESS_TYPE || doc.id === SETTINGS_ACCESS_DOC_ID) {
                (Array.isArray(d.emails) ? d.emails : []).forEach(e => {
                    const v = String(e || '').trim().toLowerCase();
                    if (v) settingsAllowedExtra.add(v);
                });
            }
        });
        applySettingsAccess();
        if (csvData && csvData.length) renderAll();
    } catch (e) {
        console.warn('Could not load OKR settings from Firestore:', e);
    }
}

// Persist a batch of full-year targets. Updates the UI optimistically, then writes to
// Firestore. `updates` is an array of { krName, value } — value === null clears the target.
async function saveFullYearTargetsBatch(updates) {
    if (!updates || !updates.length) return;
    updates.forEach(u => {
        if (u.value === null || u.value === undefined) fullYearTargets.delete(u.krName);
        else fullYearTargets.set(u.krName, u.value);
    });
    renderAll();
    if (typeof db === 'undefined' || !db) {
        console.warn('Firestore not available; full year targets not persisted.');
        return;
    }
    const user = (typeof auth !== 'undefined' && auth) ? auth.currentUser : null;
    try {
        await Promise.all(updates.map(u => {
            const ref = db.collection(OKR_SETTINGS_COLLECTION).doc(fyTargetDocId(u.krName));
            if (u.value === null || u.value === undefined) return ref.delete();
            return ref.set({
                type: FULL_YEAR_TARGET_TYPE,
                name: u.krName,
                value: u.value,
                updatedBy: user ? user.uid : null,
                updatedByEmail: user ? (user.email || null) : null,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        }));
    } catch (e) {
        console.error('Failed to save full year targets:', e);
        alert('Could not save full year targets: ' + (e && (e.message || e.code) || 'unknown error') +
            '\n\nThey may reset on reload.');
    }
}

// Persist a batch of KR config overrides. `updates` is an array of
// { krName, percent, lowerBetter } or { krName, remove: true } to revert to defaults.
async function saveKRConfigBatch(updates) {
    if (!updates || !updates.length) return;
    updates.forEach(u => {
        if (u.remove) krConfigOverrides.delete(u.krName);
        else krConfigOverrides.set(u.krName, { percent: !!u.percent, lowerBetter: !!u.lowerBetter });
    });
    renderAll();
    if (typeof db === 'undefined' || !db) {
        console.warn('Firestore not available; KR config not persisted.');
        return;
    }
    const user = (typeof auth !== 'undefined' && auth) ? auth.currentUser : null;
    try {
        await Promise.all(updates.map(u => {
            const ref = db.collection(OKR_SETTINGS_COLLECTION).doc(krConfigDocId(u.krName));
            if (u.remove) return ref.delete();
            return ref.set({
                type: KR_CONFIG_TYPE,
                name: u.krName,
                percent: !!u.percent,
                lowerBetter: !!u.lowerBetter,
                updatedBy: user ? user.uid : null,
                updatedByEmail: user ? (user.email || null) : null,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        }));
    } catch (e) {
        console.error('Failed to save KR config:', e);
        alert('Could not save KR settings: ' + (e && (e.message || e.code) || 'unknown error'));
    }
}

// ----- Settings page access control -----
// Two permanent admins (hardcoded) plus extra emails managed from the Settings page.
const SETTINGS_ADMIN_EMAILS = new Set([
    'thanat.s@fairdee.co.th',
    'nichakan@fairdee.co.th'
]);
let settingsAllowedExtra = new Set(); // lowercased emails loaded from Firestore

function canAccessSettings() {
    const email = ((typeof auth !== 'undefined' && auth && auth.currentUser && auth.currentUser.email) || '').toLowerCase();
    if (!email) return false;
    return SETTINGS_ADMIN_EMAILS.has(email) || settingsAllowedExtra.has(email);
}
// Show/hide the Settings tab based on the signed-in user.
function applySettingsAccess() {
    const tab = document.getElementById('settingsTab');
    if (tab) tab.style.display = canAccessSettings() ? '' : 'none';
}

// Persist the extra allowed-emails list to Firestore.
async function saveSettingsAccess(emails) {
    settingsAllowedExtra = new Set(emails.map(e => String(e || '').trim().toLowerCase()).filter(Boolean));
    applySettingsAccess();
    if (typeof db === 'undefined' || !db) return;
    const user = (typeof auth !== 'undefined' && auth) ? auth.currentUser : null;
    try {
        await db.collection(OKR_SETTINGS_COLLECTION).doc(SETTINGS_ACCESS_DOC_ID).set({
            type: SETTINGS_ACCESS_TYPE,
            emails: Array.from(settingsAllowedExtra),
            updatedBy: user ? user.uid : null,
            updatedByEmail: user ? (user.email || null) : null,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    } catch (e) {
        console.error('Failed to save settings access list:', e);
        alert('Could not save the access list: ' + (e && (e.message || e.code) || 'unknown error'));
    }
}

// Load all OKR settings AND the OKR data once the user is authenticated
// (both Firestore reads need the auth token / @fairdee.co.th claim).
(function initOkrSettings() {
    if (typeof auth !== 'undefined' && auth) {
        auth.onAuthStateChanged(function(user) {
            if (user) {
                loadOkrSettings();
                if (typeof fetchOKRData === 'function') fetchOKRData();
            }
        });
    } else {
        loadOkrSettings();
    }
})();

// ============================================================================
// SETTINGS TAB — configure per-KR: show as %, lower-is-better, and full-year target.
// ============================================================================
function renderSettings() {
    const container = document.getElementById('settingsContainer');
    if (!container) return;

    // Access-controlled page.
    if (!canAccessSettings()) {
        container.innerHTML = '<div class="settings-empty">You don\'t have access to this page.</div>';
        return;
    }

    // One row per unique KR (in data order).
    const seen = new Set();
    const krs = [];
    (csvData || []).forEach(row => {
        if (!row.kr_name || seen.has(row.kr_name)) return;
        seen.add(row.kr_name);
        krs.push(row);
    });

    // Access-control section: admins (locked) + editable extra emails.
    const adminChips = Array.from(SETTINGS_ADMIN_EMAILS).map(e =>
        `<span class="settings-chip locked" title="Built-in admin">${escAttr(e)}</span>`).join('');
    const extraChips = Array.from(settingsAllowedExtra).map(e =>
        `<span class="settings-chip" data-email="${escAttr(e)}">${escAttr(e)}<button type="button" class="settings-chip-x" aria-label="Remove">&times;</button></span>`).join('');
    const accessHTML = `
        <div class="settings-card">
            <h2 class="settings-title">Access control</h2>
            <p class="settings-sub">These users can open this Settings page. The two built-in admins can't be removed. Adding or removing an email saves automatically.</p>
            <div class="settings-emails" id="settingsEmails">${adminChips}${extraChips}</div>
            <div class="settings-email-add">
                <input type="email" id="settingsEmailInput" placeholder="name@fairdee.co.th">
                <button type="button" class="btn-set-targets" id="settingsEmailAddBtn">Add email</button>
            </div>
        </div>`;

    if (!krs.length) {
        container.innerHTML = accessHTML +
            '<div class="settings-empty">Load data first to configure KRs.</div>';
        wireSettingsAccessUI(container);
        return;
    }

    const rowsHTML = krs.map(row => {
        const kr = row.kr_name;
        const title = getShortTitle(row.kr_title_name || '');
        const pct = krIsPercent(kr, row);
        const low = krIsLowerBetter(kr);
        const fy = fullYearTargets.has(kr) ? fullYearTargets.get(kr) : '';
        return `
            <tr class="settings-row" data-kr="${escAttr(kr)}">
                <td class="settings-kr">
                    <span class="settings-kr-name">${escAttr(kr)}</span>
                    ${title ? `<span class="settings-kr-title">${escAttr(title)}</span>` : ''}
                </td>
                <td class="settings-center"><input type="checkbox" class="settings-pct" ${pct ? 'checked' : ''}></td>
                <td class="settings-center"><input type="checkbox" class="settings-low" ${low ? 'checked' : ''}></td>
                <td class="settings-center"><input type="number" class="settings-fy" value="${fy}" step="any" inputmode="decimal" placeholder="—"></td>
            </tr>`;
    }).join('');

    container.innerHTML = accessHTML + `
        <div class="settings-card">
            <div class="settings-head">
                <div>
                    <h2 class="settings-title">KR Settings</h2>
                    <p class="settings-sub">Choose which KRs display as a percentage, which are "lower is better", and set each KR's target. The Target column is the full-year total for non-% KRs, and the YTD-average target for % KRs (leave blank to use the monthly target).</p>
                </div>
                <button type="button" class="btn-set-targets" id="settingsSaveBtn">Save changes</button>
            </div>
            <div class="settings-table-wrap">
                <table class="settings-table">
                    <thead>
                        <tr>
                            <th>KR</th>
                            <th class="settings-center">Show as %</th>
                            <th class="settings-center">Lower is better</th>
                            <th class="settings-center">Target<br><span class="settings-th-sub">full-year / YTD-avg</span></th>
                        </tr>
                    </thead>
                    <tbody>${rowsHTML}</tbody>
                </table>
            </div>
        </div>`;

    wireSettingsAccessUI(container);

    container.querySelector('#settingsSaveBtn').addEventListener('click', saveSettings);
}

// Wire the "Add email" / remove-chip controls of the access section.
// Adding/removing persists to Firestore immediately (independent of the KR Save button).
function wireSettingsAccessUI(container) {
    const emailsEl = container.querySelector('#settingsEmails');
    const input = container.querySelector('#settingsEmailInput');
    const addBtn = container.querySelector('#settingsEmailAddBtn');
    if (!emailsEl || !input || !addBtn) return;

    function currentEmails() {
        return Array.from(emailsEl.querySelectorAll('.settings-chip[data-email]'))
            .map(c => c.getAttribute('data-email'));
    }
    async function persist() {
        const prev = addBtn.textContent;
        addBtn.disabled = true; addBtn.textContent = 'Saving...';
        await saveSettingsAccess(currentEmails());
        addBtn.disabled = false; addBtn.textContent = prev;
    }

    async function addEmail() {
        const email = (input.value || '').trim().toLowerCase();
        if (!email) return;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { alert('Please enter a valid email address.'); return; }
        if (SETTINGS_ADMIN_EMAILS.has(email) || emailsEl.querySelector(`.settings-chip[data-email="${CSS.escape(email)}"]`)) {
            input.value = '';
            return; // already present
        }
        const chip = document.createElement('span');
        chip.className = 'settings-chip';
        chip.setAttribute('data-email', email);
        chip.innerHTML = `${escAttr(email)}<button type="button" class="settings-chip-x" aria-label="Remove">&times;</button>`;
        emailsEl.appendChild(chip);
        input.value = '';
        await persist();
    }

    addBtn.addEventListener('click', addEmail);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addEmail(); } });
    emailsEl.addEventListener('click', async e => {
        const x = e.target.closest('.settings-chip-x');
        if (x) { x.closest('.settings-chip').remove(); await persist(); }
    });
}

async function saveSettings() {
    const container = document.getElementById('settingsContainer');
    if (!container) return;
    const btn = container.querySelector('#settingsSaveBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

    const cfgUpdates = [];
    const fyUpdates = [];

    container.querySelectorAll('.settings-row').forEach(tr => {
        const kr = tr.getAttribute('data-kr');
        const row = (csvData || []).find(r => r.kr_name === kr) || null;
        const pct = tr.querySelector('.settings-pct').checked;
        const low = tr.querySelector('.settings-low').checked;

        // KR config: store an override only when it differs from the computed default.
        const matchesDefault = (pct === defaultIsPercent(kr, row) && low === defaultIsLowerBetter(kr));
        const cur = krConfigOverrides.get(kr);
        if (matchesDefault) {
            if (cur) cfgUpdates.push({ krName: kr, remove: true });
        } else if (!cur || cur.percent !== pct || cur.lowerBetter !== low) {
            cfgUpdates.push({ krName: kr, percent: pct, lowerBetter: low });
        }

        // Target — full-year total for additive KRs, YTD-avg target for % KRs. Same field.
        const raw = (tr.querySelector('.settings-fy').value || '').trim();
        const had = fullYearTargets.has(kr);
        if (raw === '') {
            if (had) fyUpdates.push({ krName: kr, value: null });
        } else {
            const val = parseFloat(raw.replace(/,/g, ''));
            if (!isNaN(val) && (!had || fullYearTargets.get(kr) !== val)) fyUpdates.push({ krName: kr, value: val });
        }
    });

    // Collect the access-list emails from the chips.
    const emails = Array.from(container.querySelectorAll('.settings-chip[data-email]'))
        .map(c => c.getAttribute('data-email'));

    // Each save call re-renders; run config first, then targets, then the access list.
    await saveKRConfigBatch(cfgUpdates);
    await saveFullYearTargetsBatch(fyUpdates);
    await saveSettingsAccess(emails);
    renderSettings();
}

// Build the YTD metric box(es) for a KR card.
// - Percentage/rate KRs get a single "YTD avg" box (averaging months, not summing).
// - Additive KRs get a "YTD" (sum) box plus the Full Year Target box.
// Returns '' when there's no monthly history to summarise.
function buildYTDMetricsHTML(row) {
    if (isPercentKR(row)) {
        const ytdAvg = getYTDAverage(row);
        if (ytdAvg === null) return '';
        // YTD-avg target: settable (Settings tab) with a fallback to the KR's monthly target.
        const setTgt = getFullYearTarget(row);
        const monthlyTgt = getTarget(row);
        const ytdAvgTarget = (setTgt && setTgt > 0) ? setTgt : (monthlyTgt > 0 ? monthlyTgt : null);
        const numberClass = getNumberPairLengthClass(ytdAvg, ytdAvgTarget !== null ? ytdAvgTarget : ytdAvg);
        const unit = ytdUnitLabel(row.unit_name);
        return `
            <div class="kr-metric">
                <div class="kr-metric-label">YTD avg</div>
                <div class="kr-metric-value ${numberClass}">${formatKRValue(ytdAvg, row.kr_name)}</div>
                <div class="kr-unit">${unit}</div>
            </div>
            <div class="kr-metric">
                <div class="kr-metric-label">YTD avg target</div>
                <div class="kr-metric-value ${numberClass}">${ytdAvgTarget !== null ? formatKRValue(ytdAvgTarget, row.kr_name) : '<span class="fy-unset">—</span>'}</div>
                <div class="kr-unit">${unit}</div>
            </div>
        `;
    }
    const ytdValue = getYTDValue(row);
    if (ytdValue === null) return '';
    const fyTarget = getFullYearTarget(row);
    const numberClass = getNumberPairLengthClass(ytdValue, fyTarget !== null ? fyTarget : ytdValue);
    const ytdUnit = ytdUnitLabel(row.unit_name);
    const fyUnit = fullYearUnitLabel(row.unit_name);
    const krAttr = escAttr(row.kr_name);
    return `
        <div class="kr-metric">
            <div class="kr-metric-label">YTD</div>
            <div class="kr-metric-value ${numberClass}">${formatKRValue(ytdValue, row.kr_name)}</div>
            <div class="kr-unit">${ytdUnit}</div>
        </div>
        <div class="kr-metric kr-fytarget" data-kr="${krAttr}">
            <div class="kr-metric-label">Full Year Target</div>
            <div class="kr-metric-value ${numberClass}">${fyTarget !== null ? formatKRValue(fyTarget, row.kr_name) : '<span class="fy-unset">—</span>'}</div>
            <div class="kr-unit">${fyUnit}</div>
        </div>
    `;
}

// Build the progress section for a KR card: a Monthly bar (actual vs monthly target,
// with run-rate projection) and, when a full-year target is set, a YTD bar
// (year-to-date actual vs the settable full-year target). Returns '' if neither applies.
function buildProgressSection(row) {
    const current = getLatestValue(row);
    const target = getTarget(row);
    const displayedMonth = getEffectiveMonthForRow(row);
    const projection = computeRunRateProjection(row, displayedMonth);
    const barClass = p => (p >= 75 ? 'high' : p >= 50 ? 'medium' : 'low');
    let bars = '';

    // Monthly progress
    if (target > 0) {
        const progress = Math.min(calculateProgress(row.kr_name, current, target), 100);
        bars += `
            <div class="progress-block">
                <div class="progress-block-head">
                    <span class="progress-block-label">Monthly</span>
                    <span class="progress-block-pct">${progress.toFixed(1)}% achieved${projection ? ` <span class="run-rate-projection ${projection.projectionClass}">→ projected ${projection.projectedPercent.toFixed(1)}% (day ${projection.day}/${projection.daysInMonth})</span>` : ''}</span>
                </div>
                <div class="progress-bar-container">
                    ${projection ? `<div class="progress-bar-projection ${projection.projectionBarClass}" style="width: ${Math.min(projection.projectedPercent, 100)}%" title="Run rate projection: ${projection.projectedPercent.toFixed(1)}%"></div>` : ''}
                    <div class="progress-bar ${barClass(progress)}" style="width: ${progress}%"></div>
                </div>
            </div>`;
    }

    if (isPercentKR(row)) {
        // Percentage/rate KRs: YTD average vs the YTD-avg target (settable, else monthly target).
        const ytdAvg = getYTDAverage(row);
        const setTgt = getFullYearTarget(row);
        const ytdAvgTarget = (setTgt && setTgt > 0) ? setTgt : target;
        if (ytdAvg !== null && ytdAvgTarget > 0) {
            const ytdProgress = Math.min(calculateProgress(row.kr_name, ytdAvg, ytdAvgTarget), 100);
            bars += `
                <div class="progress-block">
                    <div class="progress-block-head">
                        <span class="progress-block-label">YTD avg</span>
                        <span class="progress-block-pct">${ytdProgress.toFixed(1)}% achieved</span>
                    </div>
                    <div class="progress-bar-container">
                        <div class="progress-bar ${barClass(ytdProgress)}" style="width: ${ytdProgress}%"></div>
                    </div>
                </div>`;
        }
    } else {
        // Additive KRs: YTD sum vs the settable full-year target. The bar always shows;
        // when no full-year target is set yet it renders empty with a prompt.
        const ytdValue = getYTDValue(row);
        if (ytdValue !== null) {
            const fyTarget = getFullYearTarget(row);
            const hasTarget = fyTarget && fyTarget > 0;
            const ytdProgress = hasTarget ? Math.min(calculateProgress(row.kr_name, ytdValue, fyTarget), 100) : 0;
            const caption = hasTarget
                ? `${ytdProgress.toFixed(1)}% of full year`
                : `<span class="progress-muted">No full year target set</span>`;
            bars += `
                <div class="progress-block">
                    <div class="progress-block-head">
                        <span class="progress-block-label">YTD</span>
                        <span class="progress-block-pct">${caption}</span>
                    </div>
                    <div class="progress-bar-container">
                        <div class="progress-bar ${barClass(ytdProgress)}" style="width: ${ytdProgress}%"></div>
                    </div>
                </div>`;
        }
    }

    return bars ? `<div class="progress-section" style="width: 100%;">${bars}</div>` : '';
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

// Like getShortTitle but without the 50-char truncation — used where the full title should show.
function getFullTitle(text) {
    if (!text) return '';
    const match = text.match(/\[(.*?)\]/);
    if (match) return match[1];
    return text.trim();
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

// Run rate state for the monthly progress view
const runRateState = {
    enabled: false,
    month: null,
    day: new Date().getDate()
};

function daysInMonthFromLabel(monthLabel) {
    if (!monthLabel) return 31;
    const d = new Date(monthLabel.replace(', ', ' 1, '));
    if (isNaN(d.getTime())) return 31;
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

function getDefaultRunRateMonth() {
    const now = new Date();
    const monthName = now.toLocaleString('en-US', { month: 'long' });
    const candidate = `${monthName}, ${now.getFullYear()}`;
    const months2026 = allMonths.filter(m => m.includes('2026'));
    if (months2026.includes(candidate)) return candidate;
    return months2026[months2026.length - 1] || allMonths[allMonths.length - 1] || null;
}

// Scope: Goal 1 KRs only (number "1" or starts with "1."), excluding KR-1.1.1
function isRunRateEligibleKR(krName) {
    const info = parseKRLevel(krName);
    const num = info.number || '';
    return (num === '1' || num.startsWith('1.')) && num !== '1.1.1';
}

// Returns the month label that getLatestValue/getTarget effectively used for this row
function getEffectiveMonthForRow(row) {
    if (!row || !row.monthlyData) return null;
    if (selectedMonth && row.monthlyData.has(selectedMonth)) return selectedMonth;
    for (let i = allMonths.length - 1; i >= 0; i--) {
        if (row.monthlyData.has(allMonths[i])) return allMonths[i];
    }
    return null;
}

// Compute run rate projection for a row at a given month. Returns null when not applicable.
function computeRunRateProjection(row, displayedMonth) {
    if (!runRateState.enabled) return null;
    if (!displayedMonth) return null;
    if (!isRunRateEligibleKR(row.kr_name)) return null;
    if (!row.monthlyData) return null;
    const actualValue = row.monthlyData.get(displayedMonth);
    if (actualValue === null || actualValue === undefined) return null;
    const krMonthlyTargets = monthlyTargets.get(row.kr_name);
    const monthlyTarget = krMonthlyTargets?.get(displayedMonth);
    if (!monthlyTarget) return null;
    const day = Math.max(1, parseInt(runRateState.day, 10) || 1);
    const daysInMonth = daysInMonthFromLabel(displayedMonth);
    // Data lags 1 day → effective elapsed = day - 1
    const safeDay = Math.max(0, Math.min(day - 1, daysInMonth));
    if (safeDay <= 0) return null;
    const projectedActual = (actualValue / safeDay) * daysInMonth;
    const projectedPercent = calculateProgress(row.kr_name, projectedActual, monthlyTarget);
    let projectionClass = 'under';
    let projectionBarClass = 'poor';
    if (projectedPercent >= 100) { projectionClass = 'over'; projectionBarClass = 'excellent'; }
    else if (projectedPercent >= 90) { projectionClass = ''; projectionBarClass = 'good'; }
    return {
        actualValue, monthlyTarget,
        projectedActual, projectedPercent,
        projectionClass, projectionBarClass,
        day: safeDay, daysInMonth, month: displayedMonth
    };
}

// Convert a run-rate month label ("June, 2026") to YYYY-MM ("2026-06")
function monthLabelToYYYYMM(label) {
    if (!label) return '';
    const d = new Date(String(label).replace(', ', ' 1, '));
    if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function setupRunRateControls() {
    const panel = document.getElementById('runRateControls');
    const checkbox = document.getElementById('runRateCheckbox');
    const monthSelect = document.getElementById('runRateMonthSelect');
    const dayInput = document.getElementById('runRateDayInput');
    const daysSuffix = document.getElementById('runRateDaysSuffix');
    if (!panel || !checkbox || !monthSelect || !dayInput) return;

    // Panel is global (above all tabs). Show whenever monthly targets are available.
    panel.style.display = monthlyTargets.size > 0 ? 'flex' : 'none';

    // Populate month options with 2026 months
    const months2026 = allMonths.filter(m => m.includes('2026'));
    const existing = Array.from(monthSelect.options).map(o => o.value).join('|');
    const next = months2026.join('|');
    if (existing !== next) {
        monthSelect.innerHTML = '';
        months2026.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = m;
            monthSelect.appendChild(opt);
        });
    }

    if (!runRateState.month || !months2026.includes(runRateState.month)) {
        runRateState.month = getDefaultRunRateMonth();
    }
    if (runRateState.month) monthSelect.value = runRateState.month;

    const refreshDayBounds = () => {
        const maxDay = daysInMonthFromLabel(monthSelect.value);
        dayInput.max = maxDay;
        if (parseInt(dayInput.value, 10) > maxDay) dayInput.value = maxDay;
        if (parseInt(dayInput.value, 10) < 1) dayInput.value = 1;
        if (daysSuffix) daysSuffix.textContent = `of ${maxDay}`;
    };

    dayInput.value = runRateState.day;
    refreshDayBounds();

    checkbox.checked = runRateState.enabled;
    panel.dataset.active = String(runRateState.enabled);

    const refreshAllViews = () => {
        renderMonthlyProgress();
        if (typeof renderOKRCards === 'function') renderOKRCards();
        if (typeof renderDataTable === 'function') renderDataTable();
        // KAM Analysis (team performance) cards/charts also respond to run rate
        if (typeof renderTeamPerformanceDynamic === 'function' && teamPerfRawData && teamPerfRawData.length) {
            renderTeamPerformanceDynamic();
        }
    };

    if (!panel.dataset.bound) {
        panel.dataset.bound = '1';
        checkbox.addEventListener('change', () => {
            runRateState.enabled = checkbox.checked;
            panel.dataset.active = String(runRateState.enabled);
            refreshAllViews();
        });
        monthSelect.addEventListener('change', () => {
            runRateState.month = monthSelect.value;
            refreshDayBounds();
            runRateState.day = parseInt(dayInput.value, 10) || 1;
            if (runRateState.enabled) refreshAllViews();
        });
        dayInput.addEventListener('input', () => {
            const maxDay = daysInMonthFromLabel(monthSelect.value);
            let v = parseInt(dayInput.value, 10);
            if (isNaN(v)) return;
            v = Math.min(maxDay, Math.max(1, v));
            runRateState.day = v;
            if (runRateState.enabled) refreshAllViews();
        });
    }
}

// Render Monthly Progress View
function renderMonthlyProgress() {
    const container = document.getElementById('monthlyProgressContainer');
    container.innerHTML = '';

    if (monthlyTargets.size === 0) {
        container.innerHTML = `
            <div class="no-monthly-data">
                <h3 style="margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;"><span style="display: inline-flex; color: var(--accent);">${(window.ICONS && window.ICONS.calendar) || ''}</span> Monthly Progress Tracking</h3>
                <p>Upload a monthly targets CSV file to see detailed monthly progress tracking.</p>
                <p style="margin-top: 0.5rem; font-size: 0.9rem;">
                    The CSV should have columns: <code>kr_name</code>, <code>month</code>, <code>monthly_target</code>
                </p>
            </div>
        `;
        return;
    }

    setupRunRateControls();

    // NOTE: Monthly Progress view filters to show only 2026 months
    // This focuses the view on current year targets

    // Create grid of KR cards with monthly progress
    const grid = document.createElement('div');
    grid.className = 'monthly-grid';

    const runRateOptions = runRateState.enabled
        ? { month: runRateState.month, day: runRateState.day }
        : null;

    // Group rows by kr_name so KRs split into multiple sub-rows
    // (e.g. KR-5.1.4 has Non Type-1 API / Non Type-1 non API / Type-1)
    // render as ONE card with each month's actual averaged across sub-rows.
    const rowsByKR = new Map();
    filteredData.forEach(row => {
        if (!rowsByKR.has(row.kr_name)) rowsByKR.set(row.kr_name, []);
        rowsByKR.get(row.kr_name).push(row);
    });

    rowsByKR.forEach((rows, krName) => {
        if (!monthlyTargets.has(krName)) return; // Skip if no monthly targets

        let displayRow = rows[0];
        if (rows.length > 1) {
            const monthsSeen = new Set();
            rows.forEach(r => {
                if (r.monthlyData) r.monthlyData.forEach((_v, m) => monthsSeen.add(m));
            });
            const averagedMonthlyData = new Map();
            monthsSeen.forEach(month => {
                const values = rows
                    .map(r => r.monthlyData?.get(month))
                    .filter(v => typeof v === 'number' && !isNaN(v));
                if (values.length === 0) return;
                const avg = values.reduce((s, v) => s + v, 0) / values.length;
                averagedMonthlyData.set(month, avg);
            });
            displayRow = Object.assign({}, rows[0], { monthlyData: averagedMonthlyData });
        }

        const card = createMonthlyProgressCard(displayRow, runRateOptions);
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
function createMonthlyProgressCard(row, runRateOptions = null) {
    const card = document.createElement('div');
    card.className = 'monthly-kr-card';

    const krName = row.kr_name;
    const krTitle = getShortTitle(row.kr_title_name || '');
    const krMonthlyTargets = monthlyTargets.get(krName);
    
    // Build header
    const header = document.createElement('div');
    header.className = 'monthly-kr-header';
    header.innerHTML = `
        <div class="monthly-kr-header__left">
            <div class="monthly-kr-name">${krName}</div>
            ${krTitle ? `<div class="monthly-kr-title">${krTitle}</div>` : ''}
        </div>
        <div class="monthly-kr-header__legend" title="How to read each month's value">
            <span class="monthly-kr-header__legend-key">% achieved</span>
            <span>(actual / target)</span>
        </div>
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
        let projectionPercent = null;
        let projectionBarClass = 'poor';
        let projectionRowHtml = '';

        if (monthlyTarget && actualValue !== null && actualValue !== undefined) {
            progressPercent = calculateProgress(krName, actualValue, monthlyTarget);

            // Determine status badge and class - MUST MATCH
            if (progressPercent >= 100) {
                progressClass = 'excellent';  // Green bar
                statusBadge = '<span class="status-badge achieved" style="display: inline-flex; align-items: center; gap: 0.25rem;">' + ((window.ICONS && window.ICONS.check) || '') + ' Achieved Target</span>';
            } else if (progressPercent >= 90) {
                progressClass = 'good';  // Yellow bar
                statusBadge = '<span class="status-badge slightly-under" style="display: inline-flex; align-items: center; gap: 0.25rem;">' + ((window.ICONS && window.ICONS.alert) || '') + ' Slightly Under Target</span>';
            } else {
                progressClass = 'poor';  // Red bar
                statusBadge = '<span class="status-badge under" style="display: inline-flex; align-items: center; gap: 0.25rem;">' + ((window.ICONS && window.ICONS.x) || '') + ' Under Target</span>';
            }

            displayText = `${progressPercent.toFixed(1)}% (${formatNumber(actualValue)} / ${formatNumber(monthlyTarget)})`;

            // Run rate projection for the selected month (rendered on its own row below)
            // Scope: Goal 1 KRs only (number starts with "1." or equals "1"), excluding KR-1.1.1
            const _krInfoForRunRate = parseKRLevel(krName);
            const _krNum = _krInfoForRunRate.number || '';
            const _runRateAllowed = (_krNum === '1' || _krNum.startsWith('1.')) && _krNum !== '1.1.1';
            if (runRateOptions && runRateOptions.month === month && _runRateAllowed) {
                const day = Math.max(1, parseInt(runRateOptions.day, 10) || 1);
                const daysInMonth = daysInMonthFromLabel(month);
                // Data lags 1 day → effective elapsed = day - 1
                const safeDay = Math.max(0, Math.min(day - 1, daysInMonth));
                if (safeDay > 0) {
                    const projectedActual = (actualValue / safeDay) * daysInMonth;
                    const projectedPercent = calculateProgress(krName, projectedActual, monthlyTarget);
                    let projectionClass = 'under';
                    if (projectedPercent >= 100) { projectionClass = 'over'; projectionBarClass = 'excellent'; }
                    else if (projectedPercent >= 90) { projectionClass = ''; projectionBarClass = 'good'; }
                    else { projectionBarClass = 'poor'; }
                    projectionPercent = projectedPercent;
                    projectionRowHtml = `
                        <div class="monthly-progress-projection-row">
                            <span class="run-rate-projection-label">Run rate (data through day ${safeDay}/${daysInMonth})</span>
                            <span class="run-rate-projection ${projectionClass}">→ projected ${projectedPercent.toFixed(1)}% (${formatNumber(projectedActual)})</span>
                        </div>
                    `;
                }
            }
        } else if (monthlyTarget) {
            displayText = `Target: ${formatNumber(monthlyTarget)}`;
        } else if (actualValue !== null && actualValue !== undefined) {
            displayText = `Actual: ${formatNumber(actualValue)}`;
        }
        
        // For less-is-better KRs, "on track" means actual <= target
        const isOnTrack = LESS_IS_BETTER_KRS.has(krName)
            ? (actualValue && monthlyTarget && actualValue <= monthlyTarget)
            : (actualValue && monthlyTarget && actualValue >= monthlyTarget);
        const labelClass = isOnTrack ? 'over-target' : (actualValue && monthlyTarget ? 'under-target' : '');
        
        progressBar.innerHTML = `
            <div class="monthly-progress-label">
                <span class="monthly-progress-label-month">${month}</span>
                <span class="monthly-progress-label-value ${labelClass}">${displayText}</span>
            </div>
            ${projectionRowHtml}
            ${statusBadge}
            ${monthlyTarget ? `
                <div class="monthly-bar-container">
                    ${projectionPercent !== null ? `<div class="monthly-bar-projection ${projectionBarClass}" style="width: ${Math.min(projectionPercent, 100)}%" title="Run rate projection: ${projectionPercent.toFixed(1)}%"></div>` : ''}
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
            const isOnTrack = LESS_IS_BETTER_KRS.has(krName) ? actual <= target : actual >= target;
            if (isOnTrack) monthsOnTrack++;
        }
    });
    
    const overallProgress = totalTarget > 0 ? calculateProgress(krName, totalActual, totalTarget) : 0;
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
                        <div><strong>Current:</strong> ${formatKRValue(item.current, item.kr_name)}</div>
                        <div><strong>Previous:</strong> ${formatKRValue(item.previous, item.kr_name)}</div>
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
                        <div><strong>Current:</strong> ${formatKRValue(item.current, item.kr_name)}</div>
                        <div><strong>Previous:</strong> ${formatKRValue(item.previous, item.kr_name)}</div>
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

// ---- Shared Executive Summary computation (used by dashboard, PDF, and email) ----
// Channels and the hard-coded YTD full-year targets (the sheet has no reliable annual
// target). Kept here as the single source of truth so all three surfaces agree.
var EXEC_SUMMARY_CATEGORIES = [
    { key: 'agency', label: 'Agency (MLM/FD/AO)', krNumbers: ['1.1', '1.2', '1.3'], color: '#2563EB', r: 37,  g: 99,  b: 235 },
    { key: 'ig',     label: 'IG',                 krNumbers: ['1.4'],                color: '#7C3AED', r: 124, g: 58,  b: 237 },
    { key: 'eb',     label: 'Corporate (EB)',     krNumbers: ['2'],                  color: '#EA580C', r: 234, g: 88,  b: 12  }
];
var YTD_FY_TARGET_OVERRIDE = { agency: 1949096767, ig: 1178626610, eb: 450050000 };
var YTD_TOTAL_TARGET = 3824656074;

// Compute the executive summary buckets + overall for a given mode.
// isYTD=false -> latest month vs monthly target; isYTD=true -> YTD vs full-year target
// (with the hard-coded per-channel and total targets above).
function computeExecSummary(isYTD) {
    function matchKR(row, numbers) {
        return numbers.indexOf(parseKRLevel(row.kr_name).number) !== -1;
    }
    var buckets = EXEC_SUMMARY_CATEGORIES.map(function (cat) {
        var rows = filteredData.filter(function (r) { return matchKR(r, cat.krNumbers); });
        var totalCurrent = 0, totalTarget = 0, unit = '';
        rows.forEach(function (r) {
            // YTD block is unbound from the month selector — always true year-to-date.
            var c = isYTD ? getYTDValueUnbound(r) : getLatestValue(r);
            var t = isYTD ? getFullYearTarget(r) : getTarget(r);
            if (typeof c === 'number' && !isNaN(c)) totalCurrent += c;
            if (typeof t === 'number' && !isNaN(t)) totalTarget += t;
            if (!unit && r.unit_name) unit = r.unit_name;
        });
        if (isYTD && Object.prototype.hasOwnProperty.call(YTD_FY_TARGET_OVERRIDE, cat.key)) {
            totalTarget = YTD_FY_TARGET_OVERRIDE[cat.key];
        }
        return {
            key: cat.key, label: cat.label, krNumbers: cat.krNumbers, krs: cat.krNumbers,
            color: cat.color, r: cat.r, g: cat.g, b: cat.b,
            rows: rows, totalCurrent: totalCurrent, totalTarget: totalTarget,
            pct: totalTarget > 0 ? (totalCurrent / totalTarget) * 100 : 0, unit: unit
        };
    });
    var valid = buckets.filter(function (b) { return b.rows.length > 0; });
    var overallCurrent = valid.reduce(function (s, b) { return s + b.totalCurrent; }, 0);
    var overallTarget = isYTD ? YTD_TOTAL_TARGET : valid.reduce(function (s, b) { return s + b.totalTarget; }, 0);
    var overallUnit = '';
    for (var i = 0; i < valid.length; i++) { if (valid[i].unit) { overallUnit = valid[i].unit; break; } }
    return {
        buckets: valid,
        overallCurrent: overallCurrent,
        overallTarget: overallTarget,
        overallPct: overallTarget > 0 ? (overallCurrent / overallTarget) * 100 : 0,
        overallUnit: overallUnit
    };
}

// Render Executive Summary (Agency = KR 1.1+1.2+1.3, IG = KR 1.4, EB = KR 2)
// Shows BOTH a monthly block (latest month vs monthly target) and a
// year-to-date block (this year's actual vs full-year target), stacked.
function renderExecutiveSummary() {
    const container = document.getElementById('executiveSummaryContainer');
    if (!container) return;

    // Build one full summary block (header row + channel cards) for a given mode.
    // isYTD=false -> latest month vs monthly target; isYTD=true -> YTD vs full-year target.
    function buildBlock(isYTD) {
        const summary = computeExecSummary(isYTD);
        const validBuckets = summary.buckets;
        if (validBuckets.length === 0) return '';

        const overallCurrent = summary.overallCurrent;
        const overallTarget  = summary.overallTarget;
        const overallPct     = summary.overallPct;
        const overallUnit    = summary.overallUnit;

        const overallColor = overallPct >= 100 ? '#10B981' : overallPct >= 90 ? '#F59E0B' : '#EF4444';
        const overallLabel = isYTD
            ? `${overallPct.toFixed(1)}% to target`
            : overallPct >= 100
                ? `Exceeding target by ${(overallPct - 100).toFixed(1)}%`
                : overallPct >= 90
                    ? `Slightly under target (${overallPct.toFixed(1)}%)`
                    : `Under target (${overallPct.toFixed(1)}%)`;
        const overallToGo = Math.max(0, overallTarget - overallCurrent);

        const targetWord   = isYTD ? 'yearly target' : 'monthly target';
        const heroLabel    = isYTD ? 'GWP — Actual YTD' : 'GWP Total';
        const heroUnit     = isYTD ? ytdUnitLabel(overallUnit) : overallUnit;
        const overallTitle = isYTD ? 'GWP Actual YTD — All Channels' : 'GWP Total — All Channels';
        const targetLead   = isYTD ? 'Yearly target' : 'Target';
        const sectionTitle = isYTD ? 'Year to date' : 'This month';
        const sectionSub   = isYTD ? 'Actual YTD vs full-year target' : 'Latest month vs monthly target';

        const cards = validBuckets.map(b => {
            const isAbove = b.pct >= 100;
            const isSlight = b.pct >= 90 && b.pct < 100;
            const badgeColor = isAbove ? '#10B981' : isSlight ? '#F59E0B' : '#EF4444';
            const badgeBg    = isAbove ? '#F0FDF4' : isSlight ? '#FFFBEB' : '#FEF2F2';
            const badgeText  = isAbove ? 'Above Target' : isSlight ? 'Near Target' : 'Below Target';
            const barWidth = Math.max(0, Math.min(100, b.pct));
            const toGo = Math.max(0, b.totalTarget - b.totalCurrent);
            const hasTarget = b.totalTarget > 0;
            const targetLine = isYTD
                ? `${targetLead}: ${hasTarget ? formatNumber(b.totalTarget) + (b.unit ? ' ' + b.unit : '') : '— not set'}`
                : `(${formatNumber(b.totalTarget)}${b.unit ? ' ' + b.unit : ''})`;

            return `
                <div style="background: white; border-radius: 16px; padding: 1.75rem 2rem; box-shadow: 0 2px 6px rgba(0,0,0,0.06); border: 1px solid #E5E7EB; display: flex; flex-direction: column; gap: 1rem;">
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap;">
                        <div style="font-weight: 800; font-size: 1.35rem; color: ${b.color}; letter-spacing: -0.01em;">${b.label}</div>
                        <span style="display: inline-block; padding: 0.35rem 0.9rem; background: ${badgeBg}; color: ${badgeColor}; border: 1px solid ${badgeColor}; border-radius: 999px; font-size: 0.8rem; font-weight: 700; white-space: nowrap;">
                            ${badgeText}
                        </span>
                    </div>
                    <div style="color: var(--text-secondary); font-size: 1rem; line-height: 1.4;">
                        Achieved <strong style="color: ${badgeColor}; font-size: 1.1rem;">${b.pct.toFixed(1)}%</strong> of ${targetWord}
                        <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.15rem;">${targetLine}</div>
                    </div>
                    <div style="background: ${b.color}; color: white; border-radius: 12px; padding: 1rem 1.25rem; font-weight: 700; display: flex; justify-content: space-between; align-items: baseline; gap: 0.75rem; flex-wrap: wrap;">
                        <span style="font-size: 1.05rem; opacity: 0.95;">${heroLabel}</span>
                        <span style="font-family: 'Google Sans Text', sans-serif; font-size: 1.65rem; font-weight: 800; letter-spacing: -0.02em;">
                            ${formatNumber(b.totalCurrent)}${b.unit ? ' <span style="font-size: 0.85rem; font-weight: 500; opacity: 0.85;">' + b.unit + '</span>' : ''}
                        </span>
                    </div>
                    <div style="height: 8px; background: #F1F5F9; border-radius: 999px; overflow: hidden;">
                        <div style="width: ${barWidth}%; height: 100%; background: ${badgeColor}; transition: width 0.4s ease;"></div>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; font-size: 0.78rem; color: var(--text-muted);">
                        <span>Includes ${b.rows.length} KR${b.rows.length === 1 ? '' : 's'}: ${b.krNumbers.map(n => 'KR ' + n).join(', ')}</span>
                        ${isYTD && hasTarget ? `<span style="font-weight: 700; color: ${badgeColor}; white-space: nowrap;">${formatNumber(toGo)}${b.unit ? ' ' + b.unit : ''} to go</span>` : ''}
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 1rem;">
                <span style="font-size: 1rem; font-weight: 800; color: var(--primary); letter-spacing: -0.01em;">${sectionTitle}</span>
                <span style="font-size: 0.78rem; color: var(--text-muted);">${sectionSub}</span>
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.75rem;">
                <div style="flex: 1; min-width: 280px;">
                    <div style="font-size: 0.85rem; color: var(--text-muted); font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 0.5rem;">${overallTitle}</div>
                    <div style="font-size: 2.75rem; font-weight: 800; color: var(--primary); font-family: 'Google Sans Text', sans-serif; line-height: 1.05; letter-spacing: -0.02em;">
                        ${formatNumber(overallCurrent)}${heroUnit ? ' <span style="font-size: 1.25rem; color: var(--text-secondary); font-weight: 600;">' + heroUnit + '</span>' : ''}
                    </div>
                    <div style="font-size: 0.95rem; color: var(--text-secondary); margin-top: 0.5rem;">
                        ${targetLead}: <strong style="color: var(--primary);">${formatNumber(overallTarget)}${overallUnit ? ' ' + overallUnit : ''}</strong>
                        ${isYTD && overallTarget > 0 ? ` &nbsp;·&nbsp; <strong style="color: ${overallColor};">${formatNumber(overallToGo)}${overallUnit ? ' ' + overallUnit : ''}</strong> to go` : ''}
                    </div>
                </div>
                <span style="display: inline-block; padding: 0.6rem 1.25rem; background: ${overallColor}; color: white; border-radius: 999px; font-size: 0.95rem; font-weight: 700; white-space: nowrap;">
                    ${overallLabel}
                </span>
            </div>
            <div style="display: grid; grid-template-columns: repeat(${validBuckets.length}, 1fr); gap: 1.25rem;">
                ${cards}
            </div>
        `;
    }

    const monthlyBlock = buildBlock(false);
    const ytdBlock = buildBlock(true);

    if (!monthlyBlock && !ytdBlock) {
        container.innerHTML = '<div class="no-data">No KR data available for the executive summary.</div>';
        return;
    }

    const divider = (monthlyBlock && ytdBlock)
        ? '<div style="height: 1px; background: #E5E7EB; margin: 2rem 0;"></div>'
        : '';

    container.innerHTML = monthlyBlock + divider + ytdBlock;
}

// Render KR Status Overview (counts of achieved / slightly under / under)
function renderKRStatusOverview() {
    const container = document.getElementById('krStatusContainer');
    if (!container) return;

    const krsWithTargets = filteredData
        .map(row => ({
            row,
            progress: calculateProgress(row.kr_name, getLatestValue(row), getTarget(row)),
            target: getTarget(row)
        }))
        .filter(item => item.target > 0);

    const total = krsWithTargets.length;
    if (total === 0) {
        container.innerHTML = '<div class="no-data">No KR data available.</div>';
        return;
    }

    const achieved = krsWithTargets.filter(k => k.progress >= 100);
    const slightlyUnder = krsWithTargets.filter(k => k.progress >= 90 && k.progress < 100);
    const under = krsWithTargets.filter(k => k.progress < 90);

    const buckets = [
        {
            label: 'Achieved',
            sublabel: '≥ 100% of target',
            count: achieved.length,
            color: '#10B981',
            bg: '#F0FDF4',
            icon: (window.ICONS && window.ICONS['check-circle']) || '',
            krs: achieved
        },
        {
            label: 'Slightly Under',
            sublabel: '90% – 99% of target',
            count: slightlyUnder.length,
            color: '#F59E0B',
            bg: '#FFFBEB',
            icon: (window.ICONS && window.ICONS.alert) || '',
            krs: slightlyUnder
        },
        {
            label: 'Under Target',
            sublabel: '< 90% of target',
            count: under.length,
            color: '#EF4444',
            bg: '#FEF2F2',
            icon: (window.ICONS && window.ICONS['alert-octagon']) || '',
            krs: under
        }
    ];

    const cards = buckets.map(b => {
        const pctOfTotal = (b.count / total) * 100;
        const krList = b.krs
            .map(k => {
                const title = getShortTitle(k.row.kr_title_name || '') || '';
                return `
                    <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 0.75rem; padding: 0.4rem 0; border-bottom: 1px dashed rgba(15,23,42,0.08);">
                        <div style="flex: 1; min-width: 0;">
                            <div style="font-size: 0.8rem; font-weight: 700; color: var(--primary); line-height: 1.3;">${k.row.kr_name || ''}</div>
                            ${title ? `<div style="font-size: 0.7rem; color: var(--text-secondary); line-height: 1.35; margin-top: 0.1rem; white-space: normal; word-break: break-word;" title="${title.replace(/"/g, '&quot;')}">${title}</div>` : ''}
                        </div>
                        <div style="font-size: 0.85rem; font-weight: 700; color: ${b.color}; white-space: nowrap; padding-top: 0.05rem;">${k.progress.toFixed(0)}%</div>
                    </div>
                `;
            })
            .join('');
        const moreText = '';

        return `
            <div style="background: ${b.bg}; border-radius: 12px; padding: 1.25rem 1.5rem; border-left: 4px solid ${b.color};">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.5rem;">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <span style="font-size: 1.4rem; color: ${b.color}; display: inline-flex;">${b.icon}</span>
                        <div>
                            <div style="font-weight: 700; color: var(--primary); font-size: 1rem;">${b.label}</div>
                            <div style="font-size: 0.75rem; color: var(--text-muted);">${b.sublabel}</div>
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 2rem; font-weight: 800; color: ${b.color}; font-family: 'Google Sans Text', sans-serif; line-height: 1;">${b.count}</div>
                        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.15rem;">${pctOfTotal.toFixed(1)}% of total</div>
                    </div>
                </div>
                <div style="height: 6px; background: white; border-radius: 999px; overflow: hidden; margin: 0.75rem 0;">
                    <div style="width: ${pctOfTotal}%; height: 100%; background: ${b.color}; transition: width 0.4s ease;"></div>
                </div>
                <div style="margin-top: 0.5rem;">
                    ${krList || '<span style="font-size: 0.75rem; color: var(--text-muted); font-style: italic;">No KRs in this bucket</span>'}
                    ${moreText}
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = `
        <div style="background: white; border-radius: 16px; padding: 1.5rem; border: 1px solid #E5E7EB; box-shadow: 0 1px 3px rgba(0,0,0,0.06);">
            <div style="display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1.25rem;">
                <div style="font-size: 0.85rem; color: var(--text-muted); font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase;">Tracking ${total} KR${total === 1 ? '' : 's'} with targets</div>
                <div style="font-size: 0.85rem; color: var(--text-secondary);">
                    Success rate: <strong style="color: var(--primary);">${((achieved.length / total) * 100).toFixed(1)}%</strong>
                </div>
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem;">
                ${cards}
            </div>
        </div>
    `;
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
        const progress = calculateProgress(row.kr_name, current, target);
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
        } else if (successRate >= 90 || (totalKRs - achievedKRs) <= 1) {
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
                        <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem; display: inline-flex; align-items: center; gap: 0.35rem;"><span style="display: inline-flex; color: #10B981;">${(window.ICONS && window.ICONS.trophy) || ''}</span> Best Performer</div>
                        <div style="font-weight: 600; color: var(--primary); font-size: 0.9rem;">${bestKR.kr_name}</div>
                        <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.15rem; font-style: italic; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${getShortTitle(bestKR.kr_title_name || '')}</div>
                        <div style="display: flex; justify-content: space-between; margin-top: 0.5rem; font-size: 0.75rem;">
                            <div>
                                <div style="color: var(--text-muted); margin-bottom: 0.25rem;">CURRENT</div>
                                <div style="font-weight: 700; color: var(--primary); font-family: 'Google Sans Text', sans-serif;">${formatKRValue(bestKR.current, bestKR.kr_name)}</div>
                                <div style="color: var(--text-muted); font-size: 0.7rem;">${bestKR.unit_name || ''}</div>
                            </div>
                            <div style="text-align: right;">
                                <div style="color: var(--text-muted); margin-bottom: 0.25rem;">TARGET</div>
                                <div style="font-weight: 700; color: var(--primary); font-family: 'Google Sans Text', sans-serif;">${formatKRValue(bestKR.target, bestKR.kr_name)}</div>
                                <div style="color: var(--text-muted); font-size: 0.7rem;">${bestKR.unit_name || ''}</div>
                            </div>
                        </div>
                        <div style="color: #10B981; font-weight: 700; margin-top: 0.5rem; font-size: 0.85rem;">${bestKR.progress.toFixed(1)}% achieved</div>
                    </div>
                    
                    ${worstKR.progress < 90 ? `
                        <div style="background: white; padding: 0.75rem; border-radius: 8px; border: 1px solid rgba(0,0,0,0.1);">
                            <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem; display: inline-flex; align-items: center; gap: 0.35rem;"><span style="display: inline-flex; color: #EF4444;">${(window.ICONS && window.ICONS.alert) || ''}</span> Needs Focus</div>
                            <div style="font-weight: 600; color: var(--primary); font-size: 0.9rem;">${worstKR.kr_name}</div>
                            <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.15rem; font-style: italic; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${getShortTitle(worstKR.kr_title_name || '')}</div>
                            <div style="display: flex; justify-content: space-between; margin-top: 0.5rem; font-size: 0.75rem;">
                                <div>
                                    <div style="color: var(--text-muted); margin-bottom: 0.25rem;">CURRENT</div>
                                    <div style="font-weight: 700; color: var(--primary); font-family: 'Google Sans Text', sans-serif;">${formatKRValue(worstKR.current, worstKR.kr_name)}</div>
                                    <div style="color: var(--text-muted); font-size: 0.7rem;">${worstKR.unit_name || ''}</div>
                                </div>
                                <div style="text-align: right;">
                                    <div style="color: var(--text-muted); margin-bottom: 0.25rem;">TARGET</div>
                                    <div style="font-weight: 700; color: var(--primary); font-family: 'Google Sans Text', sans-serif;">${formatKRValue(worstKR.target, worstKR.kr_name)}</div>
                                    <div style="color: var(--text-muted); font-size: 0.7rem;">${worstKR.unit_name || ''}</div>
                                </div>
                            </div>
                            <div style="color: #EF4444; font-weight: 700; margin-top: 0.5rem; font-size: 0.85rem;">${worstKR.progress.toFixed(1)}% achieved</div>
                        </div>
                    ` : ''}
                    
                    ${biggestGrowth && biggestGrowth.change > 0 ? `
                        <div style="background: white; padding: 0.75rem; border-radius: 8px; border: 1px solid rgba(0,0,0,0.1);">
                            <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem; display: inline-flex; align-items: center; gap: 0.35rem;"><span style="display: inline-flex; color: #10B981;">${(window.ICONS && window.ICONS['trending-up']) || ''}</span> Biggest Growth</div>
                            <div style="font-weight: 600; color: var(--primary); font-size: 0.9rem;">${biggestGrowth.kr_name}</div>
                            <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.15rem; font-style: italic; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${getShortTitle(biggestGrowth.kr_title_name || '')}</div>
                            <div style="display: flex; justify-content: space-between; margin-top: 0.5rem; font-size: 0.75rem;">
                                <div>
                                    <div style="color: var(--text-muted); margin-bottom: 0.25rem;">CURRENT</div>
                                    <div style="font-weight: 700; color: var(--primary); font-family: 'Google Sans Text', sans-serif;">${formatKRValue(biggestGrowth.current, biggestGrowth.kr_name)}</div>
                                    <div style="color: var(--text-muted); font-size: 0.7rem;">${biggestGrowth.unit_name || ''}</div>
                                </div>
                                <div style="text-align: right;">
                                    <div style="color: var(--text-muted); margin-bottom: 0.25rem;">TARGET</div>
                                    <div style="font-weight: 700; color: var(--primary); font-family: 'Google Sans Text', sans-serif;">${formatKRValue(biggestGrowth.target, biggestGrowth.kr_name)}</div>
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
        const progress = calculateProgress(row.kr_name, current, target);
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
                        <span class="action-meta-label" style="display: inline-flex; align-items: center; gap: 0.3rem;"><span style="display: inline-flex;">${(window.ICONS && window.ICONS.user) || ''}</span> Owner:</span>
                        <span class="action-meta-value">${item.owner}</span>
                    </div>
                    <div class="action-meta-item">
                        <span class="action-meta-label">⏱️ Timeline:</span>
                        <span class="action-meta-value">${item.timeline}</span>
                    </div>
                    <div class="action-meta-item">
                        <span class="action-meta-label" style="display: inline-flex; align-items: center; gap: 0.3rem;"><span style="display: inline-flex;">${(window.ICONS && window.ICONS['bar-chart']) || ''}</span> Impact:</span>
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
        const goalTitle = firstKR ? getFullTitle(firstKR.kr_title_name) : '';
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
                    const progress = Math.min(calculateProgress(row.kr_name, latestValue, target), 100);
                    const numberClass = getNumberPairLengthClass(latestValue, target);
                    const _displayedMonth = getEffectiveMonthForRow(row);
                    const projection = computeRunRateProjection(row, _displayedMonth);
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
                            ${row.kr_owner_name ? `<div class="kr-owner" style="display: inline-flex; align-items: center; gap: 0.35rem;"><span style="display: inline-flex;">${(window.ICONS && window.ICONS.user) || ''}</span> ${row.kr_owner_name}</div>` : ''}
                        </div>
                        <div class="kr-metrics">
                            <div class="kr-metric">
                                <div class="kr-metric-label">Monthly</div>
                                <div class="kr-metric-value ${numberClass}">${formatKRValue(latestValue, row.kr_name)}</div>
                                <div class="kr-unit">${row.unit_name || ''}</div>
                            </div>
                            <div class="kr-metric">
                                <div class="kr-metric-label">Target</div>
                                <div class="kr-metric-value ${numberClass}">${formatKRValue(target, row.kr_name)}</div>
                                <div class="kr-unit">${row.unit_name || ''}</div>
                            </div>
                            ${buildYTDMetricsHTML(row)}
                        </div>
                        ${buildProgressSection(row)}
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
                                const _childDisplayedMonth = getEffectiveMonthForRow(childRow);
                                const childProjection = computeRunRateProjection(childRow, _childDisplayedMonth);
                                const childCard = document.createElement('div');
                                childCard.className = `okr-card ${getTopicClass(childRow.kr_topic_name)} horizontal-layout`;
                                childCard.innerHTML = `
                                    <div class="kr-header">
                                        <div class="kr-name">${childRow.kr_name || 'N/A'}${childKrTitle ? ` <span style="color: var(--accent); font-weight: 700;">[${childKrTitle}]</span>` : ''}</div>
                                        ${childRow.kr_owner_name ? `<div class="kr-owner" style="display: inline-flex; align-items: center; gap: 0.35rem;"><span style="display: inline-flex;">${(window.ICONS && window.ICONS.user) || ''}</span> ${childRow.kr_owner_name}</div>` : ''}
                                    </div>
                                    <div class="kr-metrics">
                                        <div class="kr-metric">
                                            <div class="kr-metric-label">Monthly</div>
                                            <div class="kr-metric-value ${childNumberClass}">${formatKRValue(childLatestValue, childRow.kr_name)}</div>
                                            <div class="kr-unit">${childRow.unit_name || ''}</div>
                                        </div>
                                        <div class="kr-metric">
                                            <div class="kr-metric-label">Target</div>
                                            <div class="kr-metric-value ${childNumberClass}">${formatKRValue(childTarget, childRow.kr_name)}</div>
                                            <div class="kr-unit">${childRow.unit_name || ''}</div>
                                        </div>
                                        ${buildYTDMetricsHTML(childRow)}
                                    </div>
                                    ${buildProgressSection(childRow)}
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
        goalRow.innerHTML = `<td colspan="7"><strong> ${goalName}</strong>${goalTitle ? ` <span class="goal-title-text">- ${goalTitle}</span>` : ''}</td>`;
        tbody.appendChild(goalRow);
        
        Object.keys(hierarchy[goalName]).forEach(objName => {
            const objData = hierarchy[goalName][objName];
            const objTitle = extractTitle(objData.krs[0]?.kr_title_name || '');
            const objRow = document.createElement('tr');
            objRow.className = 'objective-row';
            objRow.innerHTML = `<td colspan="7"><strong style="display: inline-flex; align-items: center; gap: 0.4rem;"><span style="display: inline-flex; color: var(--accent);">${(window.ICONS && window.ICONS.target) || ''}</span> ${objName}</strong>${objTitle ? ` <span class="obj-title-text">- ${objTitle}</span>` : ''}</td>`;
            tbody.appendChild(objRow);
            
            const organizedKRs = organizeKRHierarchy(objData.krs);
            
            function renderKRRows(nodes, indent = 0) {
                nodes.forEach(item => {
                    const row = item.kr;
                    const current = getLatestValue(row);
                    const previous = getPreviousValue(row);
                    const target = getTarget(row);
                    const change = calculateChange(current, previous);
                    const progress = calculateProgress(row.kr_name, current, target);
                    const _tblDisplayedMonth = getEffectiveMonthForRow(row);
                    const tblProjection = computeRunRateProjection(row, _tblDisplayedMonth);
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
                        <td class="col-current">
                            ${tblProjection ? `
                                <div class="run-rate-current ${tblProjection.projectionClass}">
                                    <span class="number-value">${formatKRValue(tblProjection.projectedActual, row.kr_name)}</span><span class="unit-text">${row.unit_name || ''}</span>
                                    <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: 500; margin-top: 0.15rem;">(Run Rate)</div>
                                </div>
                            ` : `
                                <span class="number-value">${current !== null ? formatKRValue(current, row.kr_name) : 'N/A'}</span><span class="unit-text">${row.unit_name || ''}</span>
                            `}
                        </td>
                        <td class="col-target"><span class="number-value">${target > 0 ? formatKRValue(target, row.kr_name) : 'N/A'}</span><span class="unit-text">${row.unit_name || ''}</span></td>
                        <td class="col-change"><span class="trend-badge ${changeTrendClass}">${changeDisplay}</span></td>
                        <td class="col-progress">
                            ${target > 0 ? `
                                <div class="progress-cell">
                                    <div class="progress-bar-mini">
                                        ${tblProjection ? `<div class="progress-fill-projection ${tblProjection.projectionBarClass}" style="width: ${Math.min(tblProjection.projectedPercent, 100)}%;" title="Run rate projection: ${tblProjection.projectedPercent.toFixed(1)}%"></div>` : ''}
                                        <div class="progress-fill ${progress >= 100 ? 'complete' : progress >= 90 ? 'high' : 'low'}" style="width: ${Math.min(progress, 100)}%;"></div>
                                    </div>
                                    <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                                        <span class="progress-text ${progress >= 100 ? 'complete' : progress >= 90 ? 'high' : 'low'}">${progress.toFixed(1)}%</span>
                                        ${progress >= 100 ?
                                            '<span class="table-status-badge achieved" title="Achieved Target" style="display: inline-flex; align-items: center; justify-content: center;">' + ((window.ICONS && window.ICONS.check) || '') + '</span>' :
                                         progress >= 90 ?
                                            '<span class="table-status-badge slightly-under" title="Slightly Under Target" style="display: inline-flex; align-items: center; justify-content: center;">' + ((window.ICONS && window.ICONS.alert) || '') + '</span>' :
                                            '<span class="table-status-badge under" title="Under Target" style="display: inline-flex; align-items: center; justify-content: center;">' + ((window.ICONS && window.ICONS.x) || '') + '</span>'}
                                        ${tblProjection ? `<span class="run-rate-projection ${tblProjection.projectionClass}" style="font-size: 0.75rem;">→ ${tblProjection.projectedPercent.toFixed(1)}% proj.</span>` : ''}
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

// Export Table View to PDF with Goal Highlights and progress bars
function exportTableToPDF() {
    var btn = document.querySelector('.btn-export-pdf');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Generating PDF...';
    }
    
    try {
        var { jsPDF } = window.jspdf;
        var doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        
        var pageWidth = doc.internal.pageSize.getWidth();
        var pageHeight = doc.internal.pageSize.getHeight();
        var now = new Date();
        var dateStr = now.getDate() + ' ' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][now.getMonth()] + ' ' + now.getFullYear();
        var monthFilter = document.getElementById('monthFilter');
        var selectedMonth = monthFilter ? (monthFilter.options[monthFilter.selectedIndex]?.text || 'Latest') : 'Latest';
        
        // =============================================
        // Helper: draw header on each new page section
        // =============================================
        function drawPageHeader(title) {
            doc.setFillColor(15, 23, 42);
            doc.rect(0, 0, pageWidth, 25, 'F');
            doc.setFillColor(79, 70, 229);
            doc.rect(0, 25, pageWidth, 1.2, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(14);
            doc.setTextColor(255, 255, 255);
            doc.text(title, 14, 11);
            doc.setFontSize(8);
            doc.setTextColor(180, 195, 220);
            doc.text('Generated: ' + dateStr + '  |  Month: ' + selectedMonth + '  |  KRs: ' + filteredData.length, 14, 19);
        }
        
        // =============================================
        // PAGE 1: Executive Summary (Agency / IG / EB)
        // =============================================
        drawPageHeader('OKR Dashboard - Executive Summary');

        var execCategories = [
            { label: 'Agency (MLM/FD/AO)', krs: ['1.1', '1.2', '1.3'], r: 37,  g: 99,  b: 235 },
            { label: 'IG',                 krs: ['1.4'],                r: 124, g: 58,  b: 237 },
            { label: 'Corporate (EB)',     krs: ['2'],                  r: 234, g: 88,  b: 12  }
        ];

        function matchKRPDF(row, numbers) {
            var info = parseKRLevel(row.kr_name);
            return numbers.indexOf(info.number) !== -1;
        }

        var execBuckets = execCategories.map(function(cat) {
            var rows = filteredData.filter(function(r) { return matchKRPDF(r, cat.krs); });
            var totalCurrent = 0, totalTarget = 0, unit = '';
            rows.forEach(function(r) {
                var c = getLatestValue(r);
                var t = getTarget(r);
                if (typeof c === 'number' && !isNaN(c)) totalCurrent += c;
                if (typeof t === 'number' && !isNaN(t)) totalTarget += t;
                if (!unit && r.unit_name) unit = r.unit_name;
            });
            return {
                label: cat.label, r: cat.r, g: cat.g, b: cat.b,
                rows: rows, totalCurrent: totalCurrent, totalTarget: totalTarget,
                pct: totalTarget > 0 ? (totalCurrent / totalTarget) * 100 : 0,
                unit: unit, krs: cat.krs
            };
        });

        var validExecBuckets = execBuckets.filter(function(b) { return b.rows.length > 0; });

        if (validExecBuckets.length === 0) {
            doc.setFont('helvetica', 'italic'); doc.setFontSize(10); doc.setTextColor(148, 163, 184);
            doc.text('No KR data available for the executive summary.', pageWidth / 2, pageHeight / 2, { align: 'center' });
        } else {
            var overallCurrent = validExecBuckets.reduce(function(s, b) { return s + b.totalCurrent; }, 0);
            var overallTarget  = validExecBuckets.reduce(function(s, b) { return s + b.totalTarget;  }, 0);
            var overallPct = overallTarget > 0 ? (overallCurrent / overallTarget) * 100 : 0;
            var overallUnit = '';
            for (var ui = 0; ui < validExecBuckets.length; ui++) { if (validExecBuckets[ui].unit) { overallUnit = validExecBuckets[ui].unit; break; } }

            var oR, oG, oB, oLabel;
            if (overallPct >= 100)     { oR = 16;  oG = 185; oB = 129; oLabel = 'Exceeding target by ' + (overallPct - 100).toFixed(1) + '%'; }
            else if (overallPct >= 90) { oR = 245; oG = 158; oB = 11;  oLabel = 'Slightly under target (' + overallPct.toFixed(1) + '%)'; }
            else                       { oR = 239; oG = 68;  oB = 68;  oLabel = 'Under target (' + overallPct.toFixed(1) + '%)'; }

            // Hero: overall total
            var heroY = 32;
            doc.setFillColor(248, 250, 252);
            doc.roundedRect(14, heroY, pageWidth - 28, 30, 3, 3, 'F');
            doc.setDrawColor(226, 232, 240);
            doc.roundedRect(14, heroY, pageWidth - 28, 30, 3, 3, 'S');

            doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(100, 116, 139);
            doc.text('GWP TOTAL - ALL CHANNELS', 20, heroY + 8);

            doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(15, 23, 42);
            doc.text(formatNumber(overallCurrent) + (overallUnit ? '  ' + overallUnit : ''), 20, heroY + 18);

            doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(71, 85, 105);
            doc.text('Target: ' + formatNumber(overallTarget) + (overallUnit ? ' ' + overallUnit : ''), 20, heroY + 25);

            // Status pill on the right
            doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
            var pillW = doc.getTextWidth(oLabel) + 8;
            var pillX = pageWidth - 14 - pillW - 6;
            doc.setFillColor(oR, oG, oB);
            doc.roundedRect(pillX, heroY + 12, pillW, 8, 4, 4, 'F');
            doc.setTextColor(255, 255, 255);
            doc.text(oLabel, pillX + pillW / 2, heroY + 17.5, { align: 'center' });

            // Three category cards
            var cardsY = heroY + 36;
            var cardW = (pageWidth - 28 - 6 * (validExecBuckets.length - 1)) / validExecBuckets.length;
            var cardH = 50;

            validExecBuckets.forEach(function(b, i) {
                var cx = 14 + i * (cardW + 6);

                var badgeR, badgeG, badgeB, badgeTxt;
                if (b.pct >= 100)     { badgeR = 16;  badgeG = 185; badgeB = 129; badgeTxt = 'Above Target'; }
                else if (b.pct >= 90) { badgeR = 245; badgeG = 158; badgeB = 11;  badgeTxt = 'Near Target'; }
                else                  { badgeR = 239; badgeG = 68;  badgeB = 68;  badgeTxt = 'Below Target'; }

                doc.setFillColor(255, 255, 255);
                doc.roundedRect(cx, cardsY, cardW, cardH, 2, 2, 'F');
                doc.setDrawColor(226, 232, 240);
                doc.roundedRect(cx, cardsY, cardW, cardH, 2, 2, 'S');

                // Title
                doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(b.r, b.g, b.b);
                doc.text(b.label, cx + 4, cardsY + 7);

                // Status badge
                doc.setFontSize(6.5);
                var badgeW = doc.getTextWidth(badgeTxt) + 4;
                doc.setFillColor(badgeR, badgeG, badgeB);
                doc.roundedRect(cx + cardW - badgeW - 4, cardsY + 3.5, badgeW, 5, 1.5, 1.5, 'F');
                doc.setTextColor(255, 255, 255);
                doc.text(badgeTxt, cx + cardW - badgeW / 2 - 4, cardsY + 7, { align: 'center' });

                // Achievement line
                doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(71, 85, 105);
                doc.text('Achieved ' + b.pct.toFixed(1) + '% of monthly target', cx + 4, cardsY + 13);
                doc.setTextColor(148, 163, 184); doc.setFontSize(6.5);
                doc.text('(' + formatNumber(b.totalTarget) + (b.unit ? ' ' + b.unit : '') + ')', cx + 4, cardsY + 17);

                // GWP Total bar
                var barY = cardsY + 21;
                doc.setFillColor(b.r, b.g, b.b);
                doc.roundedRect(cx + 4, barY, cardW - 8, 10, 1.5, 1.5, 'F');
                doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(255, 255, 255);
                doc.text('GWP Total', cx + 6, barY + 6.5);
                doc.setFontSize(10);
                doc.text(formatNumber(b.totalCurrent) + (b.unit ? ' ' + b.unit : ''), cx + cardW - 6, barY + 6.5, { align: 'right' });

                // Mini progress bar
                var miniBarY = cardsY + 35;
                doc.setFillColor(241, 245, 249);
                doc.roundedRect(cx + 4, miniBarY, cardW - 8, 2, 1, 1, 'F');
                var fillW = (cardW - 8) * Math.max(0, Math.min(100, b.pct)) / 100;
                if (fillW > 0) {
                    doc.setFillColor(badgeR, badgeG, badgeB);
                    doc.roundedRect(cx + 4, miniBarY, fillW, 2, 1, 1, 'F');
                }

                // Footnote
                doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); doc.setTextColor(148, 163, 184);
                var krLabel = b.rows.length + ' KR' + (b.rows.length === 1 ? '' : 's') + ': ' + b.krs.map(function(n) { return 'KR ' + n; }).join(', ');
                doc.text(krLabel, cx + 4, cardsY + cardH - 3);
            });
        }

        // =============================================
        // PAGE 2: Yearly GWP — Actual YTD vs Full-Year Target
        // =============================================
        doc.addPage();
        drawPageHeader('OKR Dashboard - Yearly GWP (Year to Date)');

        var ytd = computeExecSummary(true);
        var ytdBuckets = ytd.buckets;

        if (ytdBuckets.length === 0) {
            doc.setFont('helvetica', 'italic'); doc.setFontSize(10); doc.setTextColor(148, 163, 184);
            doc.text('No KR data available for the yearly GWP summary.', pageWidth / 2, pageHeight / 2, { align: 'center' });
        } else {
            var yCurrent = ytd.overallCurrent;
            var yTarget  = ytd.overallTarget;
            var yPct     = ytd.overallPct;
            var yUnit    = ytd.overallUnit;
            var yToGo    = Math.max(0, yTarget - yCurrent);
            var yYtdUnit = ytdUnitLabel(yUnit);

            var yR, yG, yB;
            if (yPct >= 100)     { yR = 16;  yG = 185; yB = 129; }
            else if (yPct >= 90) { yR = 245; yG = 158; yB = 11;  }
            else                 { yR = 239; yG = 68;  yB = 68;  }
            var yLabel = yPct.toFixed(1) + '% to target';

            // Hero: overall YTD total
            var yHeroY = 32;
            doc.setFillColor(248, 250, 252);
            doc.roundedRect(14, yHeroY, pageWidth - 28, 30, 3, 3, 'F');
            doc.setDrawColor(226, 232, 240);
            doc.roundedRect(14, yHeroY, pageWidth - 28, 30, 3, 3, 'S');

            doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(100, 116, 139);
            doc.text('GWP ACTUAL YTD - ALL CHANNELS', 20, yHeroY + 8);

            doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(15, 23, 42);
            doc.text(formatNumber(yCurrent) + (yYtdUnit ? '  ' + yYtdUnit : ''), 20, yHeroY + 18);

            doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(71, 85, 105);
            doc.text('Yearly target: ' + formatNumber(yTarget) + (yUnit ? ' ' + yUnit : '') +
                '   |   ' + formatNumber(yToGo) + (yUnit ? ' ' + yUnit : '') + ' to go', 20, yHeroY + 25);

            // Status pill on the right
            doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
            var yPillW = doc.getTextWidth(yLabel) + 8;
            var yPillX = pageWidth - 14 - yPillW - 6;
            doc.setFillColor(yR, yG, yB);
            doc.roundedRect(yPillX, yHeroY + 12, yPillW, 8, 4, 4, 'F');
            doc.setTextColor(255, 255, 255);
            doc.text(yLabel, yPillX + yPillW / 2, yHeroY + 17.5, { align: 'center' });

            // Three category cards
            var yCardsY = yHeroY + 36;
            var yCardW = (pageWidth - 28 - 6 * (ytdBuckets.length - 1)) / ytdBuckets.length;
            var yCardH = 50;

            ytdBuckets.forEach(function(b, i) {
                var cx = 14 + i * (yCardW + 6);

                var badgeR, badgeG, badgeB, badgeTxt;
                if (b.pct >= 100)     { badgeR = 16;  badgeG = 185; badgeB = 129; badgeTxt = 'Above Target'; }
                else if (b.pct >= 90) { badgeR = 245; badgeG = 158; badgeB = 11;  badgeTxt = 'Near Target'; }
                else                  { badgeR = 239; badgeG = 68;  badgeB = 68;  badgeTxt = 'Below Target'; }

                doc.setFillColor(255, 255, 255);
                doc.roundedRect(cx, yCardsY, yCardW, yCardH, 2, 2, 'F');
                doc.setDrawColor(226, 232, 240);
                doc.roundedRect(cx, yCardsY, yCardW, yCardH, 2, 2, 'S');

                doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(b.r, b.g, b.b);
                doc.text(b.label, cx + 4, yCardsY + 7);

                doc.setFontSize(6.5);
                var badgeW = doc.getTextWidth(badgeTxt) + 4;
                doc.setFillColor(badgeR, badgeG, badgeB);
                doc.roundedRect(cx + yCardW - badgeW - 4, yCardsY + 3.5, badgeW, 5, 1.5, 1.5, 'F');
                doc.setTextColor(255, 255, 255);
                doc.text(badgeTxt, cx + yCardW - badgeW / 2 - 4, yCardsY + 7, { align: 'center' });

                doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(71, 85, 105);
                doc.text('Achieved ' + b.pct.toFixed(1) + '% of yearly target', cx + 4, yCardsY + 13);
                doc.setTextColor(148, 163, 184); doc.setFontSize(6.5);
                doc.text('Yearly target: ' + formatNumber(b.totalTarget) + (b.unit ? ' ' + b.unit : ''), cx + 4, yCardsY + 17);

                var yBarY = yCardsY + 21;
                doc.setFillColor(b.r, b.g, b.b);
                doc.roundedRect(cx + 4, yBarY, yCardW - 8, 10, 1.5, 1.5, 'F');
                doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(255, 255, 255);
                doc.text('GWP Actual YTD', cx + 6, yBarY + 6.5);
                doc.setFontSize(10);
                doc.text(formatNumber(b.totalCurrent) + (b.unit ? ' ' + b.unit : ''), cx + yCardW - 6, yBarY + 6.5, { align: 'right' });

                var yMiniBarY = yCardsY + 35;
                doc.setFillColor(241, 245, 249);
                doc.roundedRect(cx + 4, yMiniBarY, yCardW - 8, 2, 1, 1, 'F');
                var yFillW = (yCardW - 8) * Math.max(0, Math.min(100, b.pct)) / 100;
                if (yFillW > 0) {
                    doc.setFillColor(badgeR, badgeG, badgeB);
                    doc.roundedRect(cx + 4, yMiniBarY, yFillW, 2, 1, 1, 'F');
                }

                doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); doc.setTextColor(148, 163, 184);
                var yToGoCard = Math.max(0, b.totalTarget - b.totalCurrent);
                doc.text(formatNumber(yToGoCard) + (b.unit ? ' ' + b.unit : '') + ' to go', cx + 4, yCardsY + yCardH - 3);
            });
        }

        // =============================================
        // PAGE 3: KR Status Overview
        // =============================================
        doc.addPage();
        drawPageHeader('OKR Dashboard - KR Status Overview');

        var krsWithTargetsPDF = filteredData
            .map(function(row) {
                return {
                    row: row,
                    progress: calculateProgress(row.kr_name, getLatestValue(row), getTarget(row)),
                    target: getTarget(row)
                };
            })
            .filter(function(item) { return item.target > 0; });

        var totalKRPDF = krsWithTargetsPDF.length;

        if (totalKRPDF === 0) {
            doc.setFont('helvetica', 'italic'); doc.setFontSize(10); doc.setTextColor(148, 163, 184);
            doc.text('No KR data available.', pageWidth / 2, pageHeight / 2, { align: 'center' });
        } else {
            var achievedList = krsWithTargetsPDF.filter(function(k) { return k.progress >= 100; });
            var slightlyList = krsWithTargetsPDF.filter(function(k) { return k.progress >= 90 && k.progress < 100; });
            var underList    = krsWithTargetsPDF.filter(function(k) { return k.progress < 90; });

            var statusBuckets = [
                { label: 'Achieved',        sublabel: '>= 100% of target', count: achievedList.length, r: 16,  g: 185, b: 129, bgR: 240, bgG: 253, bgB: 244, krs: achievedList },
                { label: 'Slightly Under',  sublabel: '90% - 99% of target', count: slightlyList.length, r: 245, g: 158, b: 11,  bgR: 255, bgG: 251, bgB: 235, krs: slightlyList },
                { label: 'Under Target',    sublabel: '< 90% of target',     count: underList.length,    r: 239, g: 68,  b: 68,  bgR: 254, bgG: 242, bgB: 242, krs: underList    }
            ];

            // Header summary line
            doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(100, 116, 139);
            doc.text('TRACKING ' + totalKRPDF + ' KR' + (totalKRPDF === 1 ? '' : 's') + ' WITH TARGETS', 14, 36);
            doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(15, 23, 42);
            doc.text('Success rate: ' + ((achievedList.length / totalKRPDF) * 100).toFixed(1) + '%', pageWidth - 14, 36, { align: 'right' });

            var bucketY = 42;
            var bucketW = (pageWidth - 28 - 12) / 3;
            var bucketH = pageHeight - bucketY - 15;

            statusBuckets.forEach(function(b, i) {
                var bx = 14 + i * (bucketW + 6);

                doc.setFillColor(b.bgR, b.bgG, b.bgB);
                doc.roundedRect(bx, bucketY, bucketW, bucketH, 2, 2, 'F');
                doc.setFillColor(b.r, b.g, b.b);
                doc.rect(bx, bucketY, 1.8, bucketH, 'F');

                // Label + sublabel
                doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(15, 23, 42);
                doc.text(b.label, bx + 6, bucketY + 8);
                doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(100, 116, 139);
                doc.text(b.sublabel, bx + 6, bucketY + 13);

                // Count
                var pctOfTotal = totalKRPDF > 0 ? (b.count / totalKRPDF) * 100 : 0;
                doc.setFont('helvetica', 'bold'); doc.setFontSize(28); doc.setTextColor(b.r, b.g, b.b);
                doc.text(String(b.count), bx + bucketW - 6, bucketY + 12, { align: 'right' });
                doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(148, 163, 184);
                doc.text(pctOfTotal.toFixed(1) + '% of total', bx + bucketW - 6, bucketY + 17, { align: 'right' });

                // Progress bar
                var pbY = bucketY + 22;
                doc.setFillColor(255, 255, 255);
                doc.roundedRect(bx + 6, pbY, bucketW - 12, 2.5, 1.25, 1.25, 'F');
                var pbFillW = (bucketW - 12) * pctOfTotal / 100;
                if (pbFillW > 0) {
                    doc.setFillColor(b.r, b.g, b.b);
                    doc.roundedRect(bx + 6, pbY, pbFillW, 2.5, 1.25, 1.25, 'F');
                }

                // KR list
                var listY = bucketY + 31;
                doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(b.r, b.g, b.b);
                doc.text('KEY RESULTS', bx + 6, listY);

                var krY = listY + 5;
                if (b.krs.length === 0) {
                    doc.setFont('helvetica', 'italic'); doc.setFontSize(7); doc.setTextColor(148, 163, 184);
                    doc.text('No KRs in this bucket', bx + 6, krY);
                } else {
                    // Show ALL KRs. Pick a row height that fits the bucket; shrink if needed.
                    var bottomLimit = bucketY + bucketH - 4;
                    var available = bottomLimit - krY;
                    var rowH = 6;                                     // default: name + title on two lines
                    if (b.krs.length * rowH > available) {
                        rowH = Math.max(3.6, available / b.krs.length); // shrink to fit, floor at 3.6mm
                    }
                    var compact = rowH < 5.4;                          // very tight → drop the title line
                    for (var k = 0; k < b.krs.length; k++) {
                        var krItem = b.krs[k];
                        var krName = krItem.row.kr_name || '';
                        var krTitle = getShortTitle(krItem.row.kr_title_name || '') || '';
                        var pctStr = krItem.progress.toFixed(0) + '%';

                        // KR name (bold)
                        doc.setFont('helvetica', 'bold'); doc.setFontSize(compact ? 6 : 6.8); doc.setTextColor(15, 23, 42);
                        doc.text(krName.length > 24 ? krName.substring(0, 24) + '...' : krName, bx + 6, krY);

                        // % (right, colored)
                        doc.setFont('helvetica', 'bold'); doc.setFontSize(compact ? 6 : 7); doc.setTextColor(b.r, b.g, b.b);
                        doc.text(pctStr, bx + bucketW - 6, krY, { align: 'right' });

                        // Title (smaller, muted) on the line below — only when we have vertical room
                        if (krTitle && !compact) {
                            doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); doc.setTextColor(100, 116, 139);
                            doc.text(krTitle.length > 42 ? krTitle.substring(0, 42) + '...' : krTitle, bx + 6, krY + 2.6);
                        }
                        krY += rowH;
                        if (krY > bottomLimit) break; // safety guard against extreme cases
                    }
                }
            });
        }

        // =============================================
        // PAGE 3+: Goal Performance Highlights
        // =============================================
        doc.addPage();
        drawPageHeader('OKR Dashboard - Goal Performance Highlights');

        // Build goal data (same logic as renderGoalHighlights)
        var goalData = {};
        filteredData.forEach(function(row) {
            var goalName = row.goal_name || 'Uncategorized';
            if (!goalData[goalName]) {
                goalData[goalName] = { goalName: goalName, krs: [], goalTitle: getShortTitle(row.kr_title_name || '') };
            }
            var current = getLatestValue(row);
            var previous = getPreviousValue(row);
            var target = getTarget(row);
            var progress = calculateProgress(row.kr_name, current, target);
            var change = calculateChange(current, previous);
            goalData[goalName].krs.push({
                kr_name: row.kr_name, kr_title_name: row.kr_title_name,
                unit_name: row.unit_name, current: current, previous: previous,
                target: target, progress: progress, change: change
            });
        });
        
        var sortedGoals = Object.keys(goalData).sort();
        var cursorY = 32;
        
        sortedGoals.forEach(function(goalName, gIdx) {
            var goal = goalData[goalName];
            var krsWithTargets = goal.krs.filter(function(kr) { return kr.target > 0; });
            if (krsWithTargets.length === 0) return;
            
            var totalKRs = krsWithTargets.length;
            var achievedKRs = krsWithTargets.filter(function(kr) { return kr.progress >= 100; }).length;
            var slightlyUnderKRs = krsWithTargets.filter(function(kr) { return kr.progress >= 90 && kr.progress < 100; }).length;
            var underKRs = krsWithTargets.filter(function(kr) { return kr.progress < 90; }).length;
            var avgProgress = krsWithTargets.reduce(function(s, kr) { return s + kr.progress; }, 0) / totalKRs;
            var successRate = (achievedKRs / totalKRs) * 100;
            
            var sorted = krsWithTargets.slice().sort(function(a, b) { return b.progress - a.progress; });
            var bestKR = sorted[0];
            var worstKR = sorted[sorted.length - 1];
            var krsWithChange = krsWithTargets.filter(function(kr) { return kr.change !== null && !isNaN(kr.change) && isFinite(kr.change); });
            var biggestGrowth = krsWithChange.length > 0 ? krsWithChange.reduce(function(max, kr) { return kr.change > max.change ? kr : max; }, krsWithChange[0]) : null;
            
            // Status colors
            var statusText, statusR, statusG, statusB, bgR, bgG, bgB;
            if (successRate >= 100) { statusText = 'Achieved'; statusR = 16; statusG = 185; statusB = 129; bgR = 240; bgG = 253; bgB = 244; }
            else if (successRate >= 90 || (totalKRs - achievedKRs) <= 1) { statusText = 'Slightly Under'; statusR = 245; statusG = 158; statusB = 11; bgR = 255; bgG = 251; bgB = 235; }
            else { statusText = 'Under Target'; statusR = 239; statusG = 68; statusB = 68; bgR = 254; bgG = 242; bgB = 242; }
            
            // Check if we need a new page (each goal card ~48mm)
            var cardHeight = 48;
            if (cursorY + cardHeight > pageHeight - 15) {
                doc.addPage();
                drawPageHeader('OKR Dashboard - Goal Performance Highlights (cont.)');
                cursorY = 32;
            }
            
            var cardX = 14;
            var cardW = pageWidth - 28;
            
            // Card background
            doc.setFillColor(bgR, bgG, bgB);
            doc.roundedRect(cardX, cursorY, cardW, cardHeight, 2, 2, 'F');
            
            // Left accent bar
            doc.setFillColor(statusR, statusG, statusB);
            doc.rect(cardX, cursorY, 1.5, cardHeight, 'F');
            
            // Goal number badge
            doc.setFillColor(statusR, statusG, statusB);
            doc.circle(cardX + 8, cursorY + 6, 4, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(255, 255, 255);
            doc.text(String(gIdx + 1), cardX + 8, cursorY + 7.5, { align: 'center' });
            
            // Goal name + status badge
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(15, 23, 42);
            var goalLabel = goalName + (goal.goalTitle ? ' - ' + goal.goalTitle : '');
            if (goalLabel.length > 70) goalLabel = goalLabel.substring(0, 70) + '...';
            doc.text(goalLabel, cardX + 16, cursorY + 7.5);
            
            // Status badge
            var labelW = doc.getTextWidth(goalLabel);
            var badgeX = cardX + 16 + labelW + 3;
            doc.setFontSize(7);
            var badgeW = doc.getTextWidth(statusText) + 5;
            doc.setFillColor(statusR, statusG, statusB);
            doc.roundedRect(badgeX, cursorY + 3, badgeW, 6, 2, 2, 'F');
            doc.setTextColor(255, 255, 255);
            doc.text(statusText, badgeX + badgeW / 2, cursorY + 7, { align: 'center' });
            
            // Summary line
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor(71, 85, 105);
            var summaryLine = achievedKRs + ' of ' + totalKRs + ' KRs (' + successRate.toFixed(1) + '%) achieved. Avg progress: ' + avgProgress.toFixed(1) + '%.';
            if (slightlyUnderKRs > 0) summaryLine += ' ' + slightlyUnderKRs + ' slightly under (90-99%).';
            if (underKRs > 0) summaryLine += ' ' + underKRs + ' need attention (<90%).';
            doc.text(summaryLine, cardX + 16, cursorY + 14);
            
            // Three mini cards
            var miniY = cursorY + 18;
            var miniW = (cardW - 22) / 3;
            var miniH = 26;
            var miniCards = [];
            
            miniCards.push({
                label: 'BEST PERFORMER', kr: bestKR.kr_name,
                title: getShortTitle(bestKR.kr_title_name || ''),
                current: bestKR.current, target: bestKR.target, unit: bestKR.unit_name || '',
                value: bestKR.progress.toFixed(1) + '% achieved', vR: 22, vG: 163, vB: 74
            });
            if (worstKR.progress < 90) {
                miniCards.push({
                    label: 'NEEDS FOCUS', kr: worstKR.kr_name,
                    title: getShortTitle(worstKR.kr_title_name || ''),
                    current: worstKR.current, target: worstKR.target, unit: worstKR.unit_name || '',
                    value: worstKR.progress.toFixed(1) + '% achieved', vR: 239, vG: 68, vB: 68
                });
            }
            if (biggestGrowth && biggestGrowth.change > 0) {
                miniCards.push({
                    label: 'BIGGEST GROWTH', kr: biggestGrowth.kr_name,
                    title: getShortTitle(biggestGrowth.kr_title_name || ''),
                    current: biggestGrowth.current, target: biggestGrowth.target, unit: biggestGrowth.unit_name || '',
                    value: '+' + biggestGrowth.change.toFixed(1) + '% change', vR: 22, vG: 163, vB: 74
                });
            }
            
            miniCards.forEach(function(mc, mcIdx) {
                var mx = cardX + 6 + mcIdx * (miniW + 3);
                doc.setFillColor(255, 255, 255);
                doc.roundedRect(mx, miniY, miniW, miniH, 1.5, 1.5, 'F');
                doc.setDrawColor(226, 232, 240);
                doc.roundedRect(mx, miniY, miniW, miniH, 1.5, 1.5, 'S');
                
                doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); doc.setTextColor(148, 163, 184);
                doc.text(mc.label, mx + 3, miniY + 4);
                
                doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(15, 23, 42);
                doc.text(mc.kr.length > 20 ? mc.kr.substring(0, 20) + '...' : mc.kr, mx + 3, miniY + 8.5);
                
                if (mc.title) {
                    doc.setFont('helvetica', 'italic'); doc.setFontSize(6); doc.setTextColor(100, 116, 139);
                    doc.text(mc.title.length > 30 ? mc.title.substring(0, 30) + '...' : mc.title, mx + 3, miniY + 12);
                }
                
                doc.setFont('courier', 'bold'); doc.setFontSize(9); doc.setTextColor(15, 23, 42);
                doc.text(formatNumber(mc.current), mx + 3, miniY + 17.5);
                doc.text(formatNumber(mc.target), mx + miniW - 3, miniY + 17.5, { align: 'right' });
                
                doc.setFont('helvetica', 'normal'); doc.setFontSize(4.5); doc.setTextColor(148, 163, 184);
                doc.text('CURRENT', mx + 3, miniY + 21);
                doc.text('TARGET', mx + miniW - 3, miniY + 21, { align: 'right' });
                
                doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(mc.vR, mc.vG, mc.vB);
                doc.text(mc.value, mx + 3, miniY + 24.5);
            });
            
            cursorY += cardHeight + 4;
        });
        
        // =============================================
        // NEW PAGE: Table with progress bars
        // =============================================
        doc.addPage();
        drawPageHeader('OKR Dashboard - Table View');
        
        var tableRows = [];
        var progressMap = {};
        var rowIdx = 0;
        var hierarchy = {};
        
        filteredData.forEach(function(row) {
            var gn = row.goal_name || 'Uncategorized Goal';
            var on = row.objective_name || 'Uncategorized Objective';
            if (!hierarchy[gn]) hierarchy[gn] = {};
            if (!hierarchy[gn][on]) hierarchy[gn][on] = { krs: [] };
            hierarchy[gn][on].krs.push(row);
        });
        
        Object.keys(hierarchy).forEach(function(gn) {
            tableRows.push({ type: 'goal', data: [{ content: '[GOAL] ' + gn, colSpan: 7, styles: { fontStyle: 'bold', fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 8.5 } }] });
            rowIdx++;
            
            Object.keys(hierarchy[gn]).forEach(function(on) {
                tableRows.push({ type: 'obj', data: [{ content: '  [OBJ] ' + on, colSpan: 7, styles: { fontStyle: 'bold', fillColor: [241, 245, 249], textColor: [51, 65, 85], fontSize: 8 } }] });
                rowIdx++;
                
                var organized = organizeKRHierarchy(hierarchy[gn][on].krs);
                function addKR(nodes, indent) {
                    nodes.forEach(function(item) {
                        var r = item.kr;
                        var cur = getLatestValue(r);
                        var prev = getPreviousValue(r);
                        var tgt = getTarget(r);
                        var chg = calculateChange(cur, prev);
                        var prog = tgt > 0 && cur !== null ? ((cur / tgt) * 100) : 0;
                        
                        var chgStr = 'N/A';
                        if (chg !== null && !isNaN(chg) && isFinite(chg)) chgStr = (chg >= 0 ? '+' : '') + chg.toFixed(1) + '%';
                        
                        var pfx = indent > 0 ? '  > ' : '';
                        var krT = getShortTitle(r.kr_title_name || '');
                        var krL = pfx + (r.kr_name || '');
                        if (krT) krL += '\n' + (indent > 0 ? '     ' : '') + krT;
                        
                        progressMap[rowIdx] = { progress: prog, hasTarget: tgt > 0 };
                        
                        // Store current/target data for custom rendering
                        var curDisplay = cur !== null ? formatNumber(cur) : 'N/A';
                        var tgtDisplay = tgt > 0 ? formatNumber(tgt) : 'N/A';
                        var curUnit = cur !== null ? (r.unit_name || '') : '';
                        var tgtUnit = tgt > 0 ? (r.unit_name || '') : '';
                        
                        tableRows.push({ type: 'kr', data: [
                            krL, r.kr_topic_name || '', r.kr_owner_name || 'Unassigned',
                            '', '', // empty - will draw custom
                            chgStr, ''
                        ], _cur: curDisplay, _curUnit: curUnit, _tgt: tgtDisplay, _tgtUnit: tgtUnit, _rowIdx: rowIdx });
                        rowIdx++;
                        if (item.children && item.children.length > 0) addKR(item.children, indent + 1);
                    });
                }
                addKR(organized, 0);
            });
        });
        
        // Build value map for custom current/target rendering
        var valueMap = {};
        tableRows.forEach(function(r) {
            if (r._rowIdx !== undefined) {
                valueMap[r._rowIdx] = { cur: r._cur, curUnit: r._curUnit, tgt: r._tgt, tgtUnit: r._tgtUnit };
            }
        });
        
        doc.autoTable({
            startY: 30,
            head: [['Key Result', 'Topic', 'Owner', 'Current', 'Target', 'Change', 'Progress']],
            body: tableRows.map(function(r) { return r.data; }),
            theme: 'grid',
            styles: { font: 'helvetica', fontSize: 7.5, cellPadding: { top: 3, bottom: 3, left: 2, right: 2 }, lineColor: [226, 232, 240], lineWidth: 0.2, overflow: 'linebreak' },
            headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8, halign: 'center' },
            columnStyles: {
                0: { cellWidth: 72 }, 1: { cellWidth: 28, halign: 'center' }, 2: { cellWidth: 28 },
                3: { cellWidth: 28, halign: 'right' }, 4: { cellWidth: 28, halign: 'right' },
                5: { cellWidth: 22, halign: 'center' }, 6: { cellWidth: 34, halign: 'center' }
            },
            didParseCell: function(data) {
                if (data.section === 'body' && data.column.index === 5) {
                    var t = data.cell.text.join('');
                    if (t.indexOf('+') === 0) data.cell.styles.textColor = [22, 163, 74];
                    else if (t.indexOf('-') === 0) data.cell.styles.textColor = [220, 38, 38];
                }
            },
            didDrawCell: function(data) {
                // Custom render for Current (col 3) and Target (col 4)
                if (data.section === 'body' && (data.column.index === 3 || data.column.index === 4)) {
                    var vData = valueMap[data.row.index];
                    if (vData) {
                        var cx = data.cell.x, cy = data.cell.y, cw = data.cell.width, ch = data.cell.height;
                        var isTarget = data.column.index === 4;
                        var numStr = isTarget ? vData.tgt : vData.cur;
                        var unitStr = isTarget ? vData.tgtUnit : vData.curUnit;
                        
                        // Big bold number
                        doc.setFont('courier', 'bold');
                        doc.setFontSize(9.5);
                        doc.setTextColor(15, 23, 42);
                        doc.text(numStr, cx + cw - 3, cy + ch / 2 - (unitStr ? 1 : 1), { align: 'right' });
                        
                        // Small muted unit below
                        if (unitStr) {
                            doc.setFont('helvetica', 'normal');
                            doc.setFontSize(5.5);
                            doc.setTextColor(148, 163, 184);
                            doc.text(unitStr, cx + cw - 3, cy + ch / 2 + 3.5, { align: 'right' });
                        }
                    }
                }
                // Progress bar (col 6)
                if (data.section === 'body' && data.column.index === 6) {
                    var pData = progressMap[data.row.index];
                    if (pData && pData.hasTarget) {
                        var cx = data.cell.x, cy = data.cell.y, cw = data.cell.width, ch = data.cell.height;
                        var bx = cx + 2, bw = cw - 4, bh = 3, by = cy + (ch / 2) - 5;
                        var p = pData.progress, fw = Math.min(p / 100, 1) * bw;
                        
                        doc.setFillColor(226, 232, 240);
                        doc.roundedRect(bx, by, bw, bh, 1, 1, 'F');
                        
                        if (p >= 100) doc.setFillColor(22, 163, 74);
                        else if (p >= 90) doc.setFillColor(245, 158, 11);
                        else doc.setFillColor(239, 68, 68);
                        if (fw > 0) doc.roundedRect(bx, by, Math.max(fw, 1.5), bh, 1, 1, 'F');
                        
                        if (p >= 100) { doc.setTextColor(22, 163, 74); doc.setFont('helvetica', 'bold'); }
                        else if (p >= 90) { doc.setTextColor(245, 158, 11); doc.setFont('helvetica', 'bold'); }
                        else { doc.setTextColor(239, 68, 68); doc.setFont('helvetica', 'normal'); }
                        doc.setFontSize(7);
                        doc.text(p.toFixed(1) + '%', cx + cw / 2, by + bh + 5, { align: 'center' });
                    } else if (pData && !pData.hasTarget) {
                        doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(148, 163, 184);
                        doc.text('N/A', data.cell.x + data.cell.width / 2, data.cell.y + data.cell.height / 2 + 1, { align: 'center' });
                    }
                }
            },
            margin: { left: 14, right: 14 }
        });
        
        // Page numbers
        var tp = doc.internal.getNumberOfPages();
        for (var i = 1; i <= tp; i++) {
            doc.setPage(i);
            doc.setFontSize(7); doc.setTextColor(148, 163, 184);
            doc.text('OKR Dashboard  |  Page ' + i + ' of ' + tp, pageWidth / 2, pageHeight - 6, { align: 'center' });
        }
        
        doc.save('OKR_Report_' + now.toISOString().slice(0, 10) + '.pdf');

    } catch (err) {
        console.error('PDF export error:', err);
        alert('Error generating PDF: ' + err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span style="margin-right: 0.4rem; display: inline-flex;">' + ((window.ICONS && window.ICONS.refresh) || '') + '</span> Export to PDF';
        }
    }
}

// ============================================================================
// SEND EMAIL — opens a modal, generates the PDF, opens user's email client
// with a plain-text summary that mirrors the PDF content.
// ============================================================================

var EMAIL_RECIPIENTS_STORAGE_KEY = 'okrDashboard.recentEmailRecipients';
var EMAIL_OPEN_IN_STORAGE_KEY    = 'okrDashboard.emailOpenIn'; // 'gmail' | 'mailto'

function getCurrentSelectedMonthLabel() {
    var monthFilter = document.getElementById('monthFilter');
    if (monthFilter && monthFilter.selectedIndex >= 0) {
        return monthFilter.options[monthFilter.selectedIndex].text || 'Latest';
    }
    return 'Latest';
}

function loadRecentEmailRecipients() {
    try {
        var raw = localStorage.getItem(EMAIL_RECIPIENTS_STORAGE_KEY);
        if (!raw) return [];
        var list = JSON.parse(raw);
        return Array.isArray(list) ? list.slice(0, 8) : [];
    } catch (e) { return []; }
}

function saveRecentEmailRecipients(emails) {
    try {
        var existing = loadRecentEmailRecipients();
        var merged = emails.concat(existing.filter(function(e) { return emails.indexOf(e) === -1; })).slice(0, 8);
        localStorage.setItem(EMAIL_RECIPIENTS_STORAGE_KEY, JSON.stringify(merged));
    } catch (e) { /* localStorage unavailable, ignore */ }
}

function renderRecentEmailChips() {
    var container = document.getElementById('emailRecentChips');
    if (!container) return;
    var recents = loadRecentEmailRecipients();
    if (recents.length === 0) {
        container.innerHTML = '';
        return;
    }
    container.innerHTML = '<span style="font-size: 0.7rem; color: var(--text-muted); margin-right: 0.25rem; align-self: center;">RECENT:</span>' +
        recents.map(function(e) {
            return '<span class="email-recent-chip" onclick="addRecipientFromChip(this)">' + e + '</span>';
        }).join('');
}

function addRecipientFromChip(el) {
    var email = el.textContent.trim();
    var ta = document.getElementById('emailRecipients');
    var current = (ta.value || '').trim();
    var separators = /[,;\n]/;
    var existing = current.split(separators).map(function(s) { return s.trim(); }).filter(Boolean);
    if (existing.indexOf(email) !== -1) return; // already there
    ta.value = current ? (current.replace(/[\s,;]+$/, '') + ', ' + email) : email;
    ta.focus();
}

function openEmailModal() {
    var modal = document.getElementById('emailModal');
    if (!modal) return;

    // Pre-fill the subject with month + date
    var subjectEl = document.getElementById('emailSubject');
    var monthLabel = getCurrentSelectedMonthLabel();
    var today = new Date();
    var dateStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    subjectEl.value = 'OKR Dashboard Report — ' + monthLabel + ' — ' + dateStr;

    // Restore saved "Open in" preference (defaults to gmail)
    var openInEl = document.getElementById('emailOpenIn');
    if (openInEl) {
        var saved = null;
        try { saved = localStorage.getItem(EMAIL_OPEN_IN_STORAGE_KEY); } catch (e) {}
        openInEl.value = (saved === 'mailto' || saved === 'gmail') ? saved : 'gmail';
    }

    // Clear any prior error
    var errEl = document.getElementById('emailModalError');
    errEl.style.display = 'none';
    errEl.textContent = '';

    renderRecentEmailChips();

    modal.style.display = 'flex';
}

function closeEmailModal() {
    var modal = document.getElementById('emailModal');
    if (modal) modal.style.display = 'none';
}

function parseRecipients(raw) {
    if (!raw) return { valid: [], invalid: [] };
    var parts = raw.split(/[,;\n]/).map(function(s) { return s.trim(); }).filter(Boolean);
    var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    var valid = [];
    var invalid = [];
    parts.forEach(function(p) {
        if (emailRe.test(p)) {
            if (valid.indexOf(p) === -1) valid.push(p);
        } else {
            invalid.push(p);
        }
    });
    return { valid: valid, invalid: invalid };
}

// Build the plain-text email body that mirrors the PDF content.
function buildDashboardEmailBody(intro) {
    var lines = [];
    var monthLabel = getCurrentSelectedMonthLabel();
    var today = new Date();
    var dateStr = today.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });

    if (intro && intro.trim()) {
        lines.push(intro.trim());
        lines.push('');
        lines.push('---');
        lines.push('');
    }

    lines.push('OKR DASHBOARD REPORT');
    lines.push('Generated: ' + dateStr + '  |  Month: ' + monthLabel + '  |  KRs: ' + filteredData.length);
    lines.push('');

    // ---------- Executive Summary ----------
    lines.push('==============================');
    lines.push('EXECUTIVE SUMMARY');
    lines.push('==============================');

    var execCategories = [
        { label: 'Agency (MLM/FD/AO)', krs: ['1.1', '1.2', '1.3'] },
        { label: 'IG',                 krs: ['1.4'] },
        { label: 'Corporate (EB)',     krs: ['2'] }
    ];
    function matchKREmail(row, numbers) {
        var info = parseKRLevel(row.kr_name);
        return numbers.indexOf(info.number) !== -1;
    }
    var execBuckets = execCategories.map(function(cat) {
        var rows = filteredData.filter(function(r) { return matchKREmail(r, cat.krs); });
        var totalCurrent = 0, totalTarget = 0, unit = '';
        rows.forEach(function(r) {
            var c = getLatestValue(r);
            var t = getTarget(r);
            if (typeof c === 'number' && !isNaN(c)) totalCurrent += c;
            if (typeof t === 'number' && !isNaN(t)) totalTarget += t;
            if (!unit && r.unit_name) unit = r.unit_name;
        });
        return {
            label: cat.label, rows: rows, totalCurrent: totalCurrent, totalTarget: totalTarget,
            pct: totalTarget > 0 ? (totalCurrent / totalTarget) * 100 : 0, unit: unit, krs: cat.krs
        };
    });
    var validExec = execBuckets.filter(function(b) { return b.rows.length > 0; });

    if (validExec.length === 0) {
        lines.push('(No KR data available)');
    } else {
        var overallCurrent = validExec.reduce(function(s, b) { return s + b.totalCurrent; }, 0);
        var overallTarget  = validExec.reduce(function(s, b) { return s + b.totalTarget;  }, 0);
        var overallPct = overallTarget > 0 ? (overallCurrent / overallTarget) * 100 : 0;
        var overallUnit = '';
        for (var u = 0; u < validExec.length; u++) { if (validExec[u].unit) { overallUnit = validExec[u].unit; break; } }
        var overallLabel = overallPct >= 100
            ? 'Exceeding target by ' + (overallPct - 100).toFixed(1) + '%'
            : overallPct >= 90 ? 'Slightly under target (' + overallPct.toFixed(1) + '%)'
                               : 'Under target (' + overallPct.toFixed(1) + '%)';

        lines.push('GWP Total - All Channels: ' + formatNumber(overallCurrent) + (overallUnit ? ' ' + overallUnit : ''));
        lines.push('Target:                   ' + formatNumber(overallTarget)  + (overallUnit ? ' ' + overallUnit : ''));
        lines.push('Status:                   ' + overallLabel);
        lines.push('');

        validExec.forEach(function(b) {
            var status = b.pct >= 100 ? 'ABOVE TARGET' : b.pct >= 90 ? 'NEAR TARGET' : 'BELOW TARGET';
            lines.push('- ' + b.label + '  [' + status + ']');
            lines.push('    GWP Total:    ' + formatNumber(b.totalCurrent) + (b.unit ? ' ' + b.unit : ''));
            lines.push('    Target:       ' + formatNumber(b.totalTarget)  + (b.unit ? ' ' + b.unit : ''));
            lines.push('    Achievement:  ' + b.pct.toFixed(1) + '% of monthly target');
            lines.push('    KRs:          ' + b.krs.map(function(n) { return 'KR ' + n; }).join(', '));
            lines.push('');
        });
    }

    // ---------- Yearly GWP (Year to Date) ----------
    lines.push('==============================');
    lines.push('YEARLY GWP (YEAR TO DATE)');
    lines.push('==============================');

    var ytdSummary = computeExecSummary(true);
    if (ytdSummary.buckets.length === 0) {
        lines.push('(No KR data available)');
    } else {
        var yOverallUnit = ytdSummary.overallUnit;
        var yYtdUnitTxt = ytdUnitLabel(yOverallUnit);
        var yToGoTxt = Math.max(0, ytdSummary.overallTarget - ytdSummary.overallCurrent);
        lines.push('GWP Actual YTD - All Channels: ' + formatNumber(ytdSummary.overallCurrent) + (yYtdUnitTxt ? ' ' + yYtdUnitTxt : ''));
        lines.push('Yearly target:                 ' + formatNumber(ytdSummary.overallTarget)  + (yOverallUnit ? ' ' + yOverallUnit : ''));
        lines.push('Progress:                      ' + ytdSummary.overallPct.toFixed(1) + '% to target');
        lines.push('To go:                         ' + formatNumber(yToGoTxt) + (yOverallUnit ? ' ' + yOverallUnit : ''));
        lines.push('');

        ytdSummary.buckets.forEach(function(b) {
            var status = b.pct >= 100 ? 'ABOVE TARGET' : b.pct >= 90 ? 'NEAR TARGET' : 'BELOW TARGET';
            var bToGo = Math.max(0, b.totalTarget - b.totalCurrent);
            lines.push('- ' + b.label + '  [' + status + ']');
            lines.push('    GWP Actual YTD: ' + formatNumber(b.totalCurrent) + (b.unit ? ' ' + b.unit : ''));
            lines.push('    Yearly target:  ' + formatNumber(b.totalTarget)  + (b.unit ? ' ' + b.unit : ''));
            lines.push('    Achievement:    ' + b.pct.toFixed(1) + '% of yearly target');
            lines.push('    To go:          ' + formatNumber(bToGo) + (b.unit ? ' ' + b.unit : ''));
            lines.push('    KRs:            ' + b.krs.map(function(n) { return 'KR ' + n; }).join(', '));
            lines.push('');
        });
    }

    // ---------- KR Status Overview ----------
    lines.push('==============================');
    lines.push('KR STATUS OVERVIEW');
    lines.push('==============================');

    var krsWithTargets = filteredData
        .map(function(row) {
            return {
                row: row,
                progress: calculateProgress(row.kr_name, getLatestValue(row), getTarget(row)),
                target: getTarget(row)
            };
        })
        .filter(function(item) { return item.target > 0; });

    var totalKR = krsWithTargets.length;
    if (totalKR === 0) {
        lines.push('(No KR data available)');
    } else {
        var achievedList = krsWithTargets.filter(function(k) { return k.progress >= 100; });
        var slightlyList = krsWithTargets.filter(function(k) { return k.progress >= 90 && k.progress < 100; });
        var underList    = krsWithTargets.filter(function(k) { return k.progress < 90; });
        var successRate  = ((achievedList.length / totalKR) * 100).toFixed(1);

        lines.push('Tracking ' + totalKR + ' KR' + (totalKR === 1 ? '' : 's') + ' with targets  |  Success rate: ' + successRate + '%');
        lines.push('');
        lines.push('  Achieved        (>= 100%): ' + achievedList.length);
        lines.push('  Slightly Under  (90-99%):  ' + slightlyList.length);
        lines.push('  Under Target    (< 90%):   ' + underList.length);
        lines.push('');

        function listBucket(title, items) {
            if (items.length === 0) return;
            lines.push(title + ':');
            items.forEach(function(k) {
                var krT = getShortTitle(k.row.kr_title_name || '') || '';
                var line = '  - ' + (k.row.kr_name || '(unnamed)') + '  ' + k.progress.toFixed(0) + '%';
                if (krT) line += '\n      ' + krT;
                lines.push(line);
            });
            lines.push('');
        }
        listBucket('ACHIEVED',       achievedList);
        listBucket('SLIGHTLY UNDER', slightlyList);
        listBucket('UNDER TARGET',   underList);
    }

    // ---------- Goal Performance Highlights ----------
    lines.push('==============================');
    lines.push('GOAL PERFORMANCE HIGHLIGHTS');
    lines.push('==============================');

    var goalData = {};
    filteredData.forEach(function(row) {
        var goalName = row.goal_name || 'Uncategorized';
        if (!goalData[goalName]) goalData[goalName] = { goalName: goalName, krs: [] };
        var current = getLatestValue(row);
        var target  = getTarget(row);
        var progress = calculateProgress(row.kr_name, current, target);
        goalData[goalName].krs.push({ kr_name: row.kr_name, current: current, target: target, progress: progress });
    });

    var sortedGoals = Object.keys(goalData).sort();
    var hasAny = false;
    sortedGoals.forEach(function(goalName) {
        var goal = goalData[goalName];
        var withTargets = goal.krs.filter(function(kr) { return kr.target > 0; });
        if (withTargets.length === 0) return;
        hasAny = true;

        var achievedCount = withTargets.filter(function(kr) { return kr.progress >= 100; }).length;
        var avgProgress   = withTargets.reduce(function(s, kr) { return s + kr.progress; }, 0) / withTargets.length;
        var rate = (achievedCount / withTargets.length) * 100;
        var status = rate >= 100 ? 'ACHIEVED' : (rate >= 90 || (withTargets.length - achievedCount) <= 1) ? 'SLIGHTLY UNDER' : 'UNDER TARGET';

        lines.push('- ' + goalName + '  [' + status + ']');
        lines.push('    ' + achievedCount + ' of ' + withTargets.length + ' KRs achieved (' + rate.toFixed(1) + '%). Avg progress: ' + avgProgress.toFixed(1) + '%.');
        lines.push('');
    });
    if (!hasAny) lines.push('(No goals with targets)');

    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('For detailed interactive charts and comprehensive analysis, please refer to the full website attached to this email, logging in with your FairDee Google account.');
    lines.push('');
    lines.push('Supporting dashboard: https://fairdee-okr.web.app/index.html');
    lines.push('');
    lines.push('Best regards,');

    return lines.join('\n');
}

// Build a rich-HTML version of the email body (mirrors the PDF's colored cards).
// Uses inline styles + table layout so Gmail / Outlook / Apple Mail render it consistently.
function buildDashboardEmailHTML(intro) {
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    var monthLabel = getCurrentSelectedMonthLabel();
    var today = new Date();
    var dateStr = today.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });

    // ---------- Executive Summary data ----------
    var execCategories = [
        { label: 'Agency (MLM/FD/AO)', krs: ['1.1', '1.2', '1.3'], color: '#2563EB' },
        { label: 'IG',                 krs: ['1.4'],                color: '#7C3AED' },
        { label: 'Corporate (EB)',     krs: ['2'],                  color: '#EA580C' }
    ];
    function matchKREmail(row, numbers) {
        var info = parseKRLevel(row.kr_name);
        return numbers.indexOf(info.number) !== -1;
    }
    var execBuckets = execCategories.map(function(cat) {
        var rows = filteredData.filter(function(r) { return matchKREmail(r, cat.krs); });
        var totalCurrent = 0, totalTarget = 0, unit = '';
        rows.forEach(function(r) {
            var c = getLatestValue(r);
            var t = getTarget(r);
            if (typeof c === 'number' && !isNaN(c)) totalCurrent += c;
            if (typeof t === 'number' && !isNaN(t)) totalTarget += t;
            if (!unit && r.unit_name) unit = r.unit_name;
        });
        return {
            label: cat.label, color: cat.color, rows: rows,
            totalCurrent: totalCurrent, totalTarget: totalTarget,
            pct: totalTarget > 0 ? (totalCurrent / totalTarget) * 100 : 0,
            unit: unit, krs: cat.krs
        };
    });
    var validExec = execBuckets.filter(function(b) { return b.rows.length > 0; });

    // ---------- KR Status data ----------
    var krsWithTargets = filteredData
        .map(function(row) {
            return {
                row: row,
                progress: calculateProgress(row.kr_name, getLatestValue(row), getTarget(row)),
                target: getTarget(row)
            };
        })
        .filter(function(item) { return item.target > 0; });
    var totalKR = krsWithTargets.length;
    var achievedList = krsWithTargets.filter(function(k) { return k.progress >= 100; });
    var slightlyList = krsWithTargets.filter(function(k) { return k.progress >= 90 && k.progress < 100; });
    var underList    = krsWithTargets.filter(function(k) { return k.progress < 90; });

    // ---------- Goal data ----------
    var goalData = {};
    filteredData.forEach(function(row) {
        var goalName = row.goal_name || 'Uncategorized';
        if (!goalData[goalName]) goalData[goalName] = { goalName: goalName, krs: [] };
        var current = getLatestValue(row);
        var target  = getTarget(row);
        var progress = calculateProgress(row.kr_name, current, target);
        goalData[goalName].krs.push({ kr_name: row.kr_name, current: current, target: target, progress: progress });
    });

    // ---------- Build HTML ----------
    var html = '';

    // Resolve a presentable "Month Year" string for the salutation.
    // Use the selected month from the filter; fall back to latest available month;
    // last resort: current month/year.
    function resolveMonthYear() {
        if (monthLabel && monthLabel !== 'Latest') return monthLabel;
        if (typeof allMonths !== 'undefined' && allMonths.length > 0) {
            var raw = allMonths[allMonths.length - 1];
            var m = /^(\d{4})-(\d{2})$/.exec(raw);
            if (m) {
                var names = ['January','February','March','April','May','June','July','August','September','October','November','December'];
                return names[parseInt(m[2], 10) - 1] + ' ' + m[1];
            }
            return raw;
        }
        return today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    var monthYear = resolveMonthYear();

    // Reusable section banner (full-width, navy stripe with white uppercase title)
    function sectionBanner(title) {
        return '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin: 36px 0 16px;">' +
            '<tr><td style="background: #1E3A8A; color: #ffffff; padding: 12px 18px; border-radius: 8px; ' +
                'font-size: 13px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase;">' +
                esc(title) +
            '</td></tr></table>';
    }

    // Wrapper
    html += '<div style="font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, Arial, sans-serif; color: #0F172A; max-width: 760px; margin: 0 auto; line-height: 1.5;">';

    // ===== Salutation =====
    html += '<div style="margin: 0 0 24px; font-size: 14px; color: #334155; line-height: 1.65;">' +
        '<p style="margin: 0 0 12px;">Dear Leadership Team,</p>' +
        '<p style="margin: 0 0 12px;">I&rsquo;m pleased to share the monthly update on the Company OKRs for <strong>' + esc(monthYear) + '</strong>.</p>' +
        '<p style="margin: 0;">This report is intended to provide an overview of our performance against OKRs, highlight important business trends observed over the past period, and summarize key achievements and areas requiring attention across the organization.</p>' +
    '</div>';

    // Optional custom intro from the modal (shown after the salutation)
    if (intro && intro.trim()) {
        html += '<p style="margin: 0 0 24px; padding: 12px 16px; background: #F8FAFC; border-left: 3px solid #2563EB; border-radius: 6px; font-size: 14px; color: #334155;">' + esc(intro).replace(/\n/g, '<br>') + '</p>';
    }

    // Header banner
    html += '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin-bottom: 20px;">' +
        '<tr><td style="background: #1E3A8A; color: #ffffff; padding: 28px 32px; border-radius: 12px; text-align: center;">' +
            '<div style="font-size: 22px; font-weight: 800; letter-spacing: -0.01em;">OKR Dashboard Report</div>' +
            '<div style="margin-top: 8px; font-size: 13px; opacity: 0.85;">Generated: ' + esc(dateStr) + ' &nbsp;|&nbsp; Month: ' + esc(monthLabel) + ' &nbsp;|&nbsp; KRs tracked: ' + filteredData.length + '</div>' +
        '</td></tr></table>';

    // ===== Section: Business Performance Overview =====
    html += sectionBanner('Business Performance Overview');

    // =========================================
    // Executive Summary
    // =========================================
    html += '<h2 style="margin: 28px 0 12px; font-size: 18px; color: #0F172A; border-left: 4px solid #2563EB; padding-left: 10px;">Executive Summary</h2>';

    if (validExec.length === 0) {
        html += '<p style="color: #64748B; font-style: italic;">No KR data available for the executive summary.</p>';
    } else {
        var overallCurrent = validExec.reduce(function(s, b) { return s + b.totalCurrent; }, 0);
        var overallTarget  = validExec.reduce(function(s, b) { return s + b.totalTarget;  }, 0);
        var overallPct = overallTarget > 0 ? (overallCurrent / overallTarget) * 100 : 0;
        var overallUnit = '';
        for (var u = 0; u < validExec.length; u++) { if (validExec[u].unit) { overallUnit = validExec[u].unit; break; } }

        var oColor, oBg, oLabel;
        if (overallPct >= 100) {
            oColor = '#10B981'; oBg = '#ECFDF5';
            oLabel = 'Exceeding target by ' + (overallPct - 100).toFixed(1) + '%';
        } else if (overallPct >= 90) {
            oColor = '#F59E0B'; oBg = '#FFFBEB';
            oLabel = 'Slightly under target (' + overallPct.toFixed(1) + '%)';
        } else {
            oColor = '#EF4444'; oBg = '#FEF2F2';
            oLabel = 'Under target (' + overallPct.toFixed(1) + '%)';
        }

        // Hero box
        html += '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; background: #F8FAFC; border: 1px solid #E5E7EB; border-radius: 12px; margin-bottom: 16px;">' +
            '<tr><td style="padding: 22px 26px;">' +
                '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;"><tr>' +
                    '<td style="vertical-align: top;">' +
                        '<div style="font-size: 11px; font-weight: 700; letter-spacing: 0.08em; color: #64748B; text-transform: uppercase; margin-bottom: 6px;">GWP Total &mdash; All Channels</div>' +
                        '<div style="font-size: 28px; font-weight: 800; color: #0F172A; letter-spacing: -0.02em; line-height: 1.1;">' + esc(formatNumber(overallCurrent)) + (overallUnit ? ' <span style="font-size: 14px; color: #64748B; font-weight: 600;">' + esc(overallUnit) + '</span>' : '') + '</div>' +
                        '<div style="font-size: 13px; color: #475569; margin-top: 6px;">Target: <strong>' + esc(formatNumber(overallTarget)) + (overallUnit ? ' ' + esc(overallUnit) : '') + '</strong></div>' +
                    '</td>' +
                    '<td style="vertical-align: top; text-align: right; white-space: nowrap;">' +
                        '<span style="display: inline-block; padding: 8px 16px; background: ' + oColor + '; color: #ffffff; border-radius: 999px; font-size: 13px; font-weight: 700;">' + esc(oLabel) + '</span>' +
                    '</td>' +
                '</tr></table>' +
            '</td></tr>' +
        '</table>';

        // Category cards — table-based for email-client compatibility
        html += '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: separate; border-spacing: 8px 0; margin-bottom: 20px;"><tr>';
        validExec.forEach(function(b) {
            var badgeColor, badgeBg, badgeTxt;
            if (b.pct >= 100)     { badgeColor = '#10B981'; badgeBg = '#ECFDF5'; badgeTxt = 'Above Target'; }
            else if (b.pct >= 90) { badgeColor = '#F59E0B'; badgeBg = '#FFFBEB'; badgeTxt = 'Near Target'; }
            else                  { badgeColor = '#EF4444'; badgeBg = '#FEF2F2'; badgeTxt = 'Below Target'; }

            html += '<td style="vertical-align: top; width: 33%; background: #ffffff; border: 1px solid #E5E7EB; border-radius: 12px; padding: 18px 20px;">' +
                '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin-bottom: 10px;"><tr>' +
                    '<td style="font-weight: 800; font-size: 15px; color: ' + b.color + ';">' + esc(b.label) + '</td>' +
                    '<td style="text-align: right; white-space: nowrap;"><span style="display: inline-block; padding: 4px 10px; background: ' + badgeBg + '; color: ' + badgeColor + '; border: 1px solid ' + badgeColor + '; border-radius: 999px; font-size: 10px; font-weight: 700;">' + esc(badgeTxt) + '</span></td>' +
                '</tr></table>' +
                '<div style="font-size: 13px; color: #475569; margin-bottom: 4px;">Achieved <strong style="color: ' + badgeColor + ';">' + b.pct.toFixed(1) + '%</strong> of monthly target</div>' +
                '<div style="font-size: 11px; color: #94A3B8; margin-bottom: 14px;">(' + esc(formatNumber(b.totalTarget)) + (b.unit ? ' ' + esc(b.unit) : '') + ')</div>' +
                '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; background: ' + b.color + '; border-radius: 8px;"><tr>' +
                    '<td style="padding: 12px 14px; color: #ffffff; font-size: 12px; font-weight: 700;">GWP Total</td>' +
                    '<td style="padding: 12px 14px; color: #ffffff; font-size: 17px; font-weight: 800; text-align: right; letter-spacing: -0.02em;">' + esc(formatNumber(b.totalCurrent)) + (b.unit ? ' <span style="font-size: 11px; font-weight: 500; opacity: 0.85;">' + esc(b.unit) + '</span>' : '') + '</td>' +
                '</tr></table>' +
                '<div style="font-size: 10px; color: #94A3B8; margin-top: 10px;">' + b.rows.length + ' KR' + (b.rows.length === 1 ? '' : 's') + ': ' + b.krs.map(function(n) { return 'KR ' + esc(n); }).join(', ') + '</div>' +
            '</td>';
        });
        html += '</tr></table>';
    }

    // =========================================
    // Yearly GWP (Year to Date)
    // =========================================
    html += '<h2 style="margin: 28px 0 12px; font-size: 18px; color: #0F172A; border-left: 4px solid #10B981; padding-left: 10px;">Yearly GWP &mdash; Year to Date</h2>';

    var ytdHtml = computeExecSummary(true);
    if (ytdHtml.buckets.length === 0) {
        html += '<p style="color: #64748B; font-style: italic;">No KR data available for the yearly GWP summary.</p>';
    } else {
        var yCur = ytdHtml.overallCurrent, yTgt = ytdHtml.overallTarget, yPct = ytdHtml.overallPct, yUnit = ytdHtml.overallUnit;
        var yToGo = Math.max(0, yTgt - yCur);
        var yYtdUnit = ytdUnitLabel(yUnit);
        var yColor = yPct >= 100 ? '#10B981' : yPct >= 90 ? '#F59E0B' : '#EF4444';
        var yLabelTxt = yPct.toFixed(1) + '% to target';

        // Hero box
        html += '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; background: #F8FAFC; border: 1px solid #E5E7EB; border-radius: 12px; margin-bottom: 16px;">' +
            '<tr><td style="padding: 22px 26px;">' +
                '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;"><tr>' +
                    '<td style="vertical-align: top;">' +
                        '<div style="font-size: 11px; font-weight: 700; letter-spacing: 0.08em; color: #64748B; text-transform: uppercase; margin-bottom: 6px;">GWP Actual YTD &mdash; All Channels</div>' +
                        '<div style="font-size: 28px; font-weight: 800; color: #0F172A; letter-spacing: -0.02em; line-height: 1.1;">' + esc(formatNumber(yCur)) + (yYtdUnit ? ' <span style="font-size: 14px; color: #64748B; font-weight: 600;">' + esc(yYtdUnit) + '</span>' : '') + '</div>' +
                        '<div style="font-size: 13px; color: #475569; margin-top: 6px;">Yearly target: <strong>' + esc(formatNumber(yTgt)) + (yUnit ? ' ' + esc(yUnit) : '') + '</strong> &middot; <strong style="color: ' + yColor + ';">' + esc(formatNumber(yToGo)) + (yUnit ? ' ' + esc(yUnit) : '') + '</strong> to go</div>' +
                    '</td>' +
                    '<td style="vertical-align: top; text-align: right; white-space: nowrap;">' +
                        '<span style="display: inline-block; padding: 8px 16px; background: ' + yColor + '; color: #ffffff; border-radius: 999px; font-size: 13px; font-weight: 700;">' + esc(yLabelTxt) + '</span>' +
                    '</td>' +
                '</tr></table>' +
            '</td></tr>' +
        '</table>';

        // Category cards
        html += '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: separate; border-spacing: 8px 0; margin-bottom: 20px;"><tr>';
        ytdHtml.buckets.forEach(function(b) {
            var badgeColor, badgeBg, badgeTxt;
            if (b.pct >= 100)     { badgeColor = '#10B981'; badgeBg = '#ECFDF5'; badgeTxt = 'Above Target'; }
            else if (b.pct >= 90) { badgeColor = '#F59E0B'; badgeBg = '#FFFBEB'; badgeTxt = 'Near Target'; }
            else                  { badgeColor = '#EF4444'; badgeBg = '#FEF2F2'; badgeTxt = 'Below Target'; }
            var bToGo = Math.max(0, b.totalTarget - b.totalCurrent);

            html += '<td style="vertical-align: top; width: 33%; background: #ffffff; border: 1px solid #E5E7EB; border-radius: 12px; padding: 18px 20px;">' +
                '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin-bottom: 10px;"><tr>' +
                    '<td style="font-weight: 800; font-size: 15px; color: ' + b.color + ';">' + esc(b.label) + '</td>' +
                    '<td style="text-align: right; white-space: nowrap;"><span style="display: inline-block; padding: 4px 10px; background: ' + badgeBg + '; color: ' + badgeColor + '; border: 1px solid ' + badgeColor + '; border-radius: 999px; font-size: 10px; font-weight: 700;">' + esc(badgeTxt) + '</span></td>' +
                '</tr></table>' +
                '<div style="font-size: 13px; color: #475569; margin-bottom: 4px;">Achieved <strong style="color: ' + badgeColor + ';">' + b.pct.toFixed(1) + '%</strong> of yearly target</div>' +
                '<div style="font-size: 11px; color: #94A3B8; margin-bottom: 14px;">Yearly target: ' + esc(formatNumber(b.totalTarget)) + (b.unit ? ' ' + esc(b.unit) : '') + '</div>' +
                '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; background: ' + b.color + '; border-radius: 8px;"><tr>' +
                    '<td style="padding: 12px 14px; color: #ffffff; font-size: 12px; font-weight: 700;">GWP Actual YTD</td>' +
                    '<td style="padding: 12px 14px; color: #ffffff; font-size: 17px; font-weight: 800; text-align: right; letter-spacing: -0.02em;">' + esc(formatNumber(b.totalCurrent)) + (b.unit ? ' <span style="font-size: 11px; font-weight: 500; opacity: 0.85;">' + esc(b.unit) + '</span>' : '') + '</td>' +
                '</tr></table>' +
                '<div style="font-size: 10px; color: #94A3B8; margin-top: 10px;">' + esc(formatNumber(bToGo)) + (b.unit ? ' ' + esc(b.unit) : '') + ' to go &middot; ' + b.krs.map(function(n) { return 'KR ' + esc(n); }).join(', ') + '</div>' +
            '</td>';
        });
        html += '</tr></table>';
    }

    // =========================================
    // KR Status Overview
    // =========================================
    html += '<h2 style="margin: 28px 0 12px; font-size: 18px; color: #0F172A; border-left: 4px solid #2563EB; padding-left: 10px;">KR Status Overview</h2>';

    if (totalKR === 0) {
        html += '<p style="color: #64748B; font-style: italic;">No KR data available.</p>';
    } else {
        var successRate = ((achievedList.length / totalKR) * 100).toFixed(1);
        html += '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin-bottom: 12px;"><tr>' +
            '<td style="font-size: 12px; color: #64748B; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase;">Tracking ' + totalKR + ' KR' + (totalKR === 1 ? '' : 's') + ' with targets</td>' +
            '<td style="font-size: 12px; color: #0F172A; text-align: right;">Success rate: <strong>' + successRate + '%</strong></td>' +
        '</tr></table>';

        var buckets = [
            { label: 'Achieved',       sublabel: '&ge; 100% of target',   count: achievedList.length, color: '#10B981', bg: '#F0FDF4', krs: achievedList },
            { label: 'Slightly Under', sublabel: '90% &ndash; 99% of target', count: slightlyList.length, color: '#F59E0B', bg: '#FFFBEB', krs: slightlyList },
            { label: 'Under Target',   sublabel: '&lt; 90% of target',    count: underList.length,    color: '#EF4444', bg: '#FEF2F2', krs: underList    }
        ];

        html += '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: separate; border-spacing: 8px 0; margin-bottom: 20px;"><tr>';
        buckets.forEach(function(b) {
            var pctOfTotal = totalKR > 0 ? (b.count / totalKR) * 100 : 0;
            html += '<td style="vertical-align: top; width: 33%; background: ' + b.bg + '; border-left: 4px solid ' + b.color + '; border-radius: 12px; padding: 16px 18px;">' +
                '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin-bottom: 12px;"><tr>' +
                    '<td style="vertical-align: top;">' +
                        '<div style="font-weight: 700; color: #0F172A; font-size: 14px;">' + esc(b.label) + '</div>' +
                        '<div style="font-size: 10px; color: #64748B; margin-top: 2px;">' + b.sublabel + '</div>' +
                    '</td>' +
                    '<td style="vertical-align: top; text-align: right;">' +
                        '<div style="font-size: 28px; font-weight: 800; color: ' + b.color + '; line-height: 1;">' + b.count + '</div>' +
                        '<div style="font-size: 10px; color: #94A3B8; margin-top: 2px;">' + pctOfTotal.toFixed(1) + '% of total</div>' +
                    '</td>' +
                '</tr></table>';

            // Progress bar (table-based for email clients)
            var fillW = Math.max(0, Math.min(100, pctOfTotal));
            html += '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; background: #ffffff; border-radius: 999px; height: 6px; overflow: hidden; margin-bottom: 12px;"><tr>' +
                '<td style="background: ' + b.color + '; width: ' + fillW.toFixed(1) + '%; height: 6px; font-size: 0; line-height: 0;">&nbsp;</td>' +
                '<td style="width: ' + (100 - fillW).toFixed(1) + '%; height: 6px; font-size: 0; line-height: 0;">&nbsp;</td>' +
            '</tr></table>';

            // KR list (show ALL KRs in the bucket — no truncation)
            if (b.krs.length === 0) {
                html += '<div style="font-size: 11px; color: #94A3B8; font-style: italic;">No KRs in this bucket</div>';
            } else {
                html += '<div style="font-size: 10px; font-weight: 700; color: ' + b.color + '; letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 6px;">Key Results</div>';
                for (var k = 0; k < b.krs.length; k++) {
                    var krItem = b.krs[k];
                    var krTitle = getShortTitle(krItem.row.kr_title_name || '') || '';
                    html += '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin-bottom: 4px; padding-bottom: 4px; border-bottom: 1px solid rgba(15,23,42,0.06);"><tr>' +
                        '<td style="vertical-align: top;">' +
                            '<div style="font-size: 11px; font-weight: 700; color: #0F172A; line-height: 1.3;">' + esc(krItem.row.kr_name || '') + '</div>' +
                            (krTitle ? '<div style="font-size: 10px; color: #64748B; line-height: 1.35; margin-top: 1px; word-break: break-word;">' + esc(krTitle) + '</div>' : '') +
                        '</td>' +
                        '<td style="vertical-align: top; color: ' + b.color + '; font-weight: 700; text-align: right; white-space: nowrap; font-size: 12px;">' + krItem.progress.toFixed(0) + '%</td>' +
                    '</tr></table>';
                }
            }
            html += '</td>';
        });
        html += '</tr></table>';
    }

    // ===== Section: Monthly OKR Highlights =====
    html += sectionBanner('Monthly OKR Highlights');

    // =========================================
    // Goal Performance Highlights
    // =========================================
    html += '<h2 style="margin: 28px 0 12px; font-size: 18px; color: #0F172A; border-left: 4px solid #2563EB; padding-left: 10px;">Goal Performance Highlights</h2>';

    var sortedGoals = Object.keys(goalData).sort();
    var anyGoal = false;
    sortedGoals.forEach(function(goalName) {
        var goal = goalData[goalName];
        var withTargets = goal.krs.filter(function(kr) { return kr.target > 0; });
        if (withTargets.length === 0) return;
        anyGoal = true;

        var achievedCount = withTargets.filter(function(kr) { return kr.progress >= 100; }).length;
        var avgProgress   = withTargets.reduce(function(s, kr) { return s + kr.progress; }, 0) / withTargets.length;
        var rate = (achievedCount / withTargets.length) * 100;

        var gColor, gBg, gLabel;
        if (rate >= 100) { gColor = '#10B981'; gBg = '#F0FDF4'; gLabel = 'Achieved Target'; }
        else if (rate >= 90 || (withTargets.length - achievedCount) <= 1) { gColor = '#F59E0B'; gBg = '#FFFBEB'; gLabel = 'Slightly Under Target'; }
        else { gColor = '#EF4444'; gBg = '#FEF2F2'; gLabel = 'Under Target'; }

        html += '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; background: ' + gBg + '; border-left: 4px solid ' + gColor + '; border-radius: 8px; margin-bottom: 10px;">' +
            '<tr><td style="padding: 14px 18px;">' +
                '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;"><tr>' +
                    '<td style="font-weight: 700; color: #0F172A; font-size: 14px;">' + esc(goalName) + '</td>' +
                    '<td style="text-align: right; white-space: nowrap;"><span style="display: inline-block; padding: 3px 10px; background: ' + gColor + '; color: #ffffff; border-radius: 999px; font-size: 10px; font-weight: 700;">' + esc(gLabel) + '</span></td>' +
                '</tr></table>' +
                '<div style="font-size: 12px; color: #475569; margin-top: 6px;"><strong>' + achievedCount + ' of ' + withTargets.length + '</strong> KRs achieved (' + rate.toFixed(1) + '%). Avg progress: <strong>' + avgProgress.toFixed(1) + '%</strong>.</div>' +
            '</td></tr>' +
        '</table>';
    });
    if (!anyGoal) html += '<p style="color: #64748B; font-style: italic;">No goals with targets.</p>';

    // =========================================
    // Table View (full KR hierarchy) — hidden from email per request.
    // Set INCLUDE_TABLE_VIEW = true to bring it back.
    // =========================================
    var INCLUDE_TABLE_VIEW = false;
    if (INCLUDE_TABLE_VIEW) {
    html += '<h2 style="margin: 32px 0 12px; font-size: 18px; color: #0F172A; border-left: 4px solid #2563EB; padding-left: 10px;">Table View</h2>';

    var tvHierarchy = {};
    filteredData.forEach(function(row) {
        var gn = row.goal_name || 'Uncategorized Goal';
        var on = row.objective_name || 'Uncategorized Objective';
        if (!tvHierarchy[gn]) tvHierarchy[gn] = {};
        if (!tvHierarchy[gn][on]) tvHierarchy[gn][on] = { krs: [] };
        tvHierarchy[gn][on].krs.push(row);
    });

    var tvGoalNames = Object.keys(tvHierarchy);
    if (tvGoalNames.length === 0) {
        html += '<p style="color: #64748B; font-style: italic;">No KR data available.</p>';
    } else {
        // Table header (sticky-styled)
        html += '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; font-size: 12px; border: 1px solid #E2E8F0; border-radius: 8px; overflow: hidden;">';
        html += '<thead><tr style="background: #1E3A8A; color: #ffffff;">' +
            '<th align="left"  style="padding: 10px 12px; font-weight: 700; font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase;">Key Result</th>' +
            '<th align="left"  style="padding: 10px 12px; font-weight: 700; font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase;">Topic</th>' +
            '<th align="left"  style="padding: 10px 12px; font-weight: 700; font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase;">Owner</th>' +
            '<th align="right" style="padding: 10px 12px; font-weight: 700; font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase;">Current</th>' +
            '<th align="right" style="padding: 10px 12px; font-weight: 700; font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase;">Target</th>' +
            '<th align="right" style="padding: 10px 12px; font-weight: 700; font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase;">Change</th>' +
            '<th align="left"  style="padding: 10px 12px; font-weight: 700; font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; min-width: 140px;">Progress</th>' +
        '</tr></thead><tbody>';

        tvGoalNames.forEach(function(gn) {
            // Goal row
            html += '<tr><td colspan="7" style="background: #0F172A; color: #ffffff; padding: 10px 14px; font-weight: 800; font-size: 12px;">' + esc(gn) + '</td></tr>';

            Object.keys(tvHierarchy[gn]).forEach(function(on) {
                // Objective row
                html += '<tr><td colspan="7" style="background: #F1F5F9; color: #334155; padding: 8px 14px 8px 24px; font-weight: 700; font-size: 11px;">' + esc(on) + '</td></tr>';

                var organized = organizeKRHierarchy(tvHierarchy[gn][on].krs);

                function addKRRow(nodes, indent) {
                    nodes.forEach(function(item) {
                        var r = item.kr;
                        var cur = getLatestValue(r);
                        var prev = getPreviousValue(r);
                        var tgt = getTarget(r);
                        var chg = calculateChange(cur, prev);
                        var prog = tgt > 0 && cur !== null ? ((cur / tgt) * 100) : 0;

                        var chgStr = 'N/A';
                        var chgColor = '#94A3B8';
                        if (chg !== null && !isNaN(chg) && isFinite(chg)) {
                            chgStr = (chg >= 0 ? '+' : '') + chg.toFixed(1) + '%';
                            chgColor = chg >= 0 ? '#10B981' : '#EF4444';
                        }

                        // KR name + title (sub-KRs indented and prefixed)
                        var krTitle = getShortTitle(r.kr_title_name || '');
                        var indentPx = indent * 16;
                        var krNameHtml = '<div style="font-weight: 700; color: #0F172A;">' +
                            (indent > 0 ? '<span style="color: #94A3B8;">&rsaquo;&nbsp;</span>' : '') +
                            esc(r.kr_name || '') + '</div>' +
                            (krTitle ? '<div style="font-size: 10px; color: #64748B; font-style: italic; margin-top: 2px;">' + esc(krTitle) + '</div>' : '');

                        // Progress bar + status colour
                        var progColor, progBadgeBg, progBadgeText;
                        if (tgt <= 0)              { progColor = '#94A3B8'; progBadgeBg = '#F1F5F9'; progBadgeText = '—'; }
                        else if (prog >= 100)      { progColor = '#10B981'; progBadgeBg = '#F0FDF4'; progBadgeText = prog.toFixed(1) + '%'; }
                        else if (prog >= 90)       { progColor = '#F59E0B'; progBadgeBg = '#FFFBEB'; progBadgeText = prog.toFixed(1) + '%'; }
                        else                       { progColor = '#EF4444'; progBadgeBg = '#FEF2F2'; progBadgeText = prog.toFixed(1) + '%'; }

                        var fillW = Math.max(0, Math.min(100, prog));
                        var progressHtml = '';
                        if (tgt > 0) {
                            progressHtml =
                                '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;"><tr>' +
                                    '<td style="width: 64%; padding-right: 8px;">' +
                                        '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; background: #F1F5F9; border-radius: 999px; height: 6px; overflow: hidden;"><tr>' +
                                            '<td style="background: ' + progColor + '; width: ' + fillW.toFixed(1) + '%; height: 6px; font-size: 0; line-height: 0;">&nbsp;</td>' +
                                            '<td style="width: ' + (100 - fillW).toFixed(1) + '%; height: 6px; font-size: 0; line-height: 0;">&nbsp;</td>' +
                                        '</tr></table>' +
                                    '</td>' +
                                    '<td style="width: 36%; text-align: right; white-space: nowrap;">' +
                                        '<span style="display: inline-block; padding: 2px 8px; background: ' + progBadgeBg + '; color: ' + progColor + '; border: 1px solid ' + progColor + '; border-radius: 999px; font-size: 10px; font-weight: 700;">' + progBadgeText + '</span>' +
                                    '</td>' +
                                '</tr></table>';
                        } else {
                            progressHtml = '<span style="color: #94A3B8; font-size: 11px;">No target</span>';
                        }

                        var unit = r.unit_name || '';
                        var curHtml = cur !== null
                            ? '<span style="font-family: \'Google Sans Text\', monospace; font-weight: 600; color: #0F172A;">' + esc(formatNumber(cur)) + '</span>' +
                              (unit ? '<div style="font-size: 9px; color: #94A3B8; margin-top: 1px;">' + esc(unit) + '</div>' : '')
                            : '<span style="color: #94A3B8;">N/A</span>';
                        var tgtHtml = tgt > 0
                            ? '<span style="font-family: \'Google Sans Text\', monospace; font-weight: 600; color: #0F172A;">' + esc(formatNumber(tgt)) + '</span>' +
                              (unit ? '<div style="font-size: 9px; color: #94A3B8; margin-top: 1px;">' + esc(unit) + '</div>' : '')
                            : '<span style="color: #94A3B8;">N/A</span>';

                        html += '<tr style="background: #ffffff; border-bottom: 1px solid #F1F5F9;">' +
                            '<td style="padding: 10px 12px; vertical-align: top; padding-left: ' + (12 + indentPx) + 'px;">' + krNameHtml + '</td>' +
                            '<td style="padding: 10px 12px; vertical-align: top; color: #475569;">' + esc(r.kr_topic_name || '') + '</td>' +
                            '<td style="padding: 10px 12px; vertical-align: top; color: #475569;">' + esc(r.kr_owner_name || 'Unassigned') + '</td>' +
                            '<td style="padding: 10px 12px; vertical-align: top; text-align: right;">' + curHtml + '</td>' +
                            '<td style="padding: 10px 12px; vertical-align: top; text-align: right;">' + tgtHtml + '</td>' +
                            '<td style="padding: 10px 12px; vertical-align: top; text-align: right; color: ' + chgColor + '; font-weight: 600;">' + esc(chgStr) + '</td>' +
                            '<td style="padding: 10px 12px; vertical-align: middle;">' + progressHtml + '</td>' +
                        '</tr>';

                        if (item.children && item.children.length > 0) addKRRow(item.children, indent + 1);
                    });
                }
                addKRRow(organized, 0);
            });
        });

        html += '</tbody></table>';
    }
    } // end INCLUDE_TABLE_VIEW

    // Closing block (above everything else's footer)
    html += '<div style="margin-top: 36px; padding-top: 20px; border-top: 1px solid #E2E8F0; font-size: 14px; color: #334155; line-height: 1.65;">' +
        '<p style="margin: 0 0 12px;">For detailed interactive charts and comprehensive analysis, please refer to the full website attached to this email, logging in with your FairDee Google account.</p>' +
        '<p style="margin: 0 0 20px;">Supporting dashboard: <a href="https://fairdee-okr.web.app/index.html" style="color: #2563EB; text-decoration: underline; font-weight: 600;">https://fairdee-okr.web.app/index.html</a></p>' +
        '<p style="margin: 0;">Best regards,</p>' +
    '</div>';

    html += '</div>'; // close wrapper
    return html;
}

function sendDashboardEmail() {
    var errEl = document.getElementById('emailModalError');
    errEl.style.display = 'none';
    errEl.textContent = '';

    var rawRecipients = document.getElementById('emailRecipients').value;
    var subject = document.getElementById('emailSubject').value.trim();
    var intro = document.getElementById('emailIntro').value;

    var parsed = parseRecipients(rawRecipients);
    if (parsed.valid.length === 0) {
        errEl.textContent = 'Please enter at least one valid email address.';
        errEl.style.display = 'block';
        return;
    }
    if (parsed.invalid.length > 0) {
        errEl.textContent = 'Invalid email(s): ' + parsed.invalid.join(', ');
        errEl.style.display = 'block';
        return;
    }
    if (!subject) {
        errEl.textContent = 'Subject cannot be empty.';
        errEl.style.display = 'block';
        return;
    }

    // 1) Generate and download the PDF (re-uses existing export)
    try {
        exportTableToPDF();
    } catch (e) {
        console.error('PDF generation failed', e);
        errEl.textContent = 'Failed to generate PDF: ' + e.message;
        errEl.style.display = 'block';
        return;
    }

    // 2) Remember recipients for quick-add next time
    saveRecentEmailRecipients(parsed.valid);

    // 3) Build rich HTML body + plain-text fallback
    var htmlBody = buildDashboardEmailHTML(intro);
    var textBody = buildDashboardEmailBody(intro);

    // 4) Copy the rich HTML to the clipboard (so the user can paste into Gmail / Outlook compose).
    //    Falls back gracefully if the modern Clipboard API isn't available.
    function copyHtmlToClipboard() {
        if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
            try {
                var item = new ClipboardItem({
                    'text/html':  new Blob([htmlBody], { type: 'text/html' }),
                    'text/plain': new Blob([textBody], { type: 'text/plain' })
                });
                return navigator.clipboard.write([item]);
            } catch (e) { /* fall through */ }
        }
        // Legacy fallback: select a contentEditable div and execCommand('copy')
        return new Promise(function(resolve, reject) {
            try {
                var holder = document.createElement('div');
                holder.contentEditable = 'true';
                holder.style.position = 'fixed';
                holder.style.left = '-9999px';
                holder.style.top = '0';
                holder.innerHTML = htmlBody;
                document.body.appendChild(holder);
                var range = document.createRange();
                range.selectNodeContents(holder);
                var sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
                var ok = document.execCommand('copy');
                sel.removeAllRanges();
                document.body.removeChild(holder);
                ok ? resolve() : reject(new Error('execCommand copy returned false'));
            } catch (err) { reject(err); }
        });
    }

    // Determine and persist the "Open in" preference
    var openInEl = document.getElementById('emailOpenIn');
    var openIn = openInEl ? openInEl.value : 'gmail';
    try { localStorage.setItem(EMAIL_OPEN_IN_STORAGE_KEY, openIn); } catch (e) { /* ignore */ }

    function buildComposeUrl(includeBody) {
        if (openIn === 'gmail') {
            // Gmail compose in browser. If the user signed in via Firebase Auth with a
            // Fairdee Google account, hint Gmail to use that account.
            var authuser = '';
            try {
                if (typeof auth !== 'undefined' && auth && auth.currentUser && auth.currentUser.email) {
                    authuser = '&authuser=' + encodeURIComponent(auth.currentUser.email);
                }
            } catch (e) {}
            var url = 'https://mail.google.com/mail/?view=cm&fs=1'
                + authuser
                + '&to='  + encodeURIComponent(parsed.valid.join(','))
                + '&su='  + encodeURIComponent(subject);
            if (includeBody && includeBody.length > 0) {
                url += '&body=' + encodeURIComponent(includeBody);
            }
            return url;
        }
        // Default: mailto:
        var mailtoUrl = 'mailto:' + parsed.valid.join(',')
            + '?subject=' + encodeURIComponent(subject);
        if (includeBody && includeBody.length > 0) {
            mailtoUrl += '&body=' + encodeURIComponent(includeBody);
        }
        return mailtoUrl;
    }

    function openCompose(url) {
        if (openIn === 'gmail') {
            // Open Gmail in a new tab so the dashboard stays put.
            window.open(url, '_blank', 'noopener');
        } else {
            window.location.href = url;
        }
    }

    copyHtmlToClipboard().then(function() {
        // Build URL with recipients + subject (body is on the clipboard for paste)
        var url = buildComposeUrl(null);

        // Open after a small delay so the PDF download triggers first
        setTimeout(function() { openCompose(url); }, 300);

        closeEmailModal();
        showEmailSentToast(parsed.valid.length, openIn);
    }).catch(function(err) {
        console.error('Clipboard copy failed', err);
        errEl.innerHTML = 'Could not copy the formatted report to your clipboard. ' +
            'Your browser may have blocked clipboard access. ' +
            '<br>Falling back to plain-text email body.';
        errEl.style.display = 'block';

        // Plain-text fallback: include the text body in the URL itself
        var truncated = textBody.length > 1900 ? textBody.substring(0, 1900) + '\n\n[Summary truncated. See attached PDF.]' : textBody;
        var fallbackUrl = buildComposeUrl(truncated);
        setTimeout(function() { openCompose(fallbackUrl); }, 600);
    });
}

// Lightweight toast confirming the report was copied and email opened
function showEmailSentToast(recipientCount, openIn) {
    var existing = document.getElementById('emailSentToast');
    if (existing) existing.remove();

    var clientLabel = openIn === 'gmail' ? 'Gmail (new tab)' : 'your default email app';

    var toast = document.createElement('div');
    toast.id = 'emailSentToast';
    toast.style.cssText = 'position: fixed; bottom: 24px; right: 24px; background: #0F172A; color: white; ' +
        'padding: 14px 20px; border-radius: 12px; box-shadow: 0 10px 30px rgba(15,23,42,0.25); ' +
        'font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 13px; max-width: 360px; ' +
        'z-index: 2000; line-height: 1.5; animation: fadeIn 0.25s ease-out;';
    toast.innerHTML =
        '<div style="display: flex; align-items: flex-start; gap: 10px;">' +
            '<span style="color: #10B981; display: inline-flex; margin-top: 2px;">' + ((window.ICONS && window.ICONS['check-circle']) || '') + '</span>' +
            '<div>' +
                '<div style="font-weight: 700; margin-bottom: 4px;">Report ready to send</div>' +
                '<div style="color: #CBD5E1; font-size: 12px;">' +
                    'Opening ' + clientLabel + '. PDF downloaded &mdash; the formatted report is on your clipboard. ' +
                    '<strong>Paste (Cmd/Ctrl + V) into the email body</strong>, attach the PDF, and send to ' + recipientCount + ' recipient' + (recipientCount === 1 ? '' : 's') + '.' +
                '</div>' +
            '</div>' +
        '</div>';
    document.body.appendChild(toast);
    setTimeout(function() {
        toast.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(8px)';
        setTimeout(function() { toast.remove(); }, 500);
    }, 7000);
}

// Reset dashboard
function resetDashboard() {
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('uploadSection').style.display = 'block';
    document.getElementById('firstTransactingInput').value = '';
    document.getElementById('earlyRetentionInput').value = '';
    
    // Reset team perf inputs
    var tp1 = document.getElementById('teamPerfFileInput');
    var tp2 = document.getElementById('teamPerfFileInputMain');
    if (tp1) tp1.value = '';
    if (tp2) tp2.value = '';
    
    // Reset status indicators
    ['dataFileStatus', 'targetsFileStatus', 'firstTransactingStatus', 'earlyRetentionStatus', 'teamPerfFileStatus', 'teamPerfFileStatusMain', 'fleetFetchStatus'].forEach(id => {
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

    // Reset loading bar
    _loadedCount = 0;
    var bar = document.getElementById('dataLoadingBar');
    var fill = document.getElementById('dataLoadingFill');
    var countEl = document.getElementById('dataLoadingCount');
    var textEl = document.getElementById('dataLoadingText');
    if (bar) bar.style.display = 'flex';
    if (fill) fill.style.width = '0%';
    if (countEl) countEl.textContent = '0 / ' + _totalSources;
    if (textEl) textEl.textContent = 'Fetching data...';
    _setOkrSheetSyncStatus('loading', 'Fetching data...');
    _setOkrProgressBanner('show', 'Fetching data · 0 of ' + _totalSources, 0);

    // Re-fetch all data (OKR from the Firestore Redshift mirror; others from Sheets)
    _okrDataLoaded = false; // allow a manual refresh to reload
    fetchOKRData();
    fetchFleetData();
}

// ========================================
// TEAM PERFORMANCE - DYNAMIC CSV-BASED
// ========================================

let teamPerfRawData = []; // Raw parsed CSV rows
let teamPerfChartInstances = {}; // Track chart instances for cleanup

// Agent code to name mapping
const agentNameMap = {
    // Focus Team
    'FM-19867': 'ทรงวุฒิ',
    'FM-19729': 'Jack',
    'FM-21975': 'ถาวร',
    'FM-21511': 'ตาล',
    'FM-23437': 'คนอง',
    'FM-19134': 'ประวิทย์',
    'FM-23277': 'ปัน',
    'FM-23273': 'เมธิชัย',
    'FM-19119': 'คมกฤษณ์',
    'FM-42800': 'บ๊วย',
    // Mid Tier
    'FM-28595': 'พิมพาภรณ์',
    'FM-21461': 'ธนพร',
    'FM-23332': 'ดิน',
    'FM-20898': 'บิ๊ก'
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
            
            var msg = 'Loaded ' + teamPerfRawData.length + ' rows from ' + file.name;
            showUploadStatus(statusElementId, 'success', msg);
            showUploadStatus(otherStatusId, 'success', msg);
            
            // Show dashboard section if visible
            var viewBtn = document.getElementById('viewDashboardSection');
            if (viewBtn) viewBtn.style.display = 'block';
            
            // Render
            renderTeamPerformanceDynamic();
        },
        error: function(error) {
            var msg = 'Error: ' + error.message;
            showUploadStatus(statusElementId, 'error', msg);
            showUploadStatus(otherStatusId, 'error', msg);
        }
    });
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

// Diagonal-hatched yellow pattern used to mark run-rate-projected portions.
function makeRunRateHatch(ctx) {
    try {
        var c = document.createElement('canvas');
        c.width = 8; c.height = 8;
        var cx = c.getContext('2d');
        cx.fillStyle = '#FCE6A8';          // light yellow base
        cx.fillRect(0, 0, 8, 8);
        cx.strokeStyle = '#E8A33D';        // amber stripes
        cx.lineWidth = 2;
        cx.beginPath(); cx.moveTo(0, 8); cx.lineTo(8, 0);
        cx.moveTo(-2, 2); cx.lineTo(2, -2);
        cx.moveTo(6, 10); cx.lineTo(10, 6); cx.stroke();
        return ctx.createPattern(c, 'repeat') || '#F4C66B';
    } catch (e) {
        return '#F4C66B'; // solid amber fallback
    }
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

// Fetch Fleet data from Google Sheets
function fetchFleetData() {
    var FLEET_SHEET_ID = '1BcCiO2TiHhJfWDj62RJ_8U1bmAjIpqxgSpTJjkWsTTg';
    var csvUrl = 'https://docs.google.com/spreadsheets/d/' + FLEET_SHEET_ID + '/gviz/tq?tqx=out:csv&sheet=summary';

    showUploadStatus('fleetFetchStatus', 'loading', 'Fetching Fleet data...');
    
    // Also fetch sale-tracking tab (gid=653258568)
    var saleTrackingUrl = 'https://docs.google.com/spreadsheets/d/' + FLEET_SHEET_ID + '/gviz/tq?tqx=out:csv&gid=653258568';
    
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
                showUploadStatus('fleetFetchStatus', 'error', 'CSV parse error: ' + error.message);
                _markSourceLoaded();
            }
        });
    })
    .catch(function(error) {
        console.error('Fetch error:', error);
        showUploadStatus('fleetFetchStatus', 'error', '' + error.message);
        _markSourceLoaded();
    });
}

// Process the raw sheet data
// Rows 10-21 (1-indexed) = indices 9-20
// Column C = index 2 (targets), Column D = index 3 (actuals)
function processFleetSheetData(rows) {
    _markSourceLoaded();
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
        showUploadStatus('fleetFetchStatus', 'error', 'No month data found. Check sheet format (Column A should have "YYYY-Mon" like "2026-Jan").');
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
    
    showUploadStatus('fleetFetchStatus', 'success', 'Data loaded: ' + months.length + ' months of Fleet GWP data (includes historical)');
    
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
                statusBadge = '<span class="table-status-badge achieved" title="Achieved" style="display: inline-flex; align-items: center; justify-content: center;">' + ((window.ICONS && window.ICONS.check) || '') + '</span>';
            } else if (pct >= 90) {
                statusBadge = '<span class="table-status-badge slightly-under" title="Near Target" style="display: inline-flex; align-items: center; justify-content: center;">' + ((window.ICONS && window.ICONS.alert) || '') + '</span>';
            } else {
                statusBadge = '<span class="table-status-badge under" title="Under Target" style="display: inline-flex; align-items: center; justify-content: center;">' + ((window.ICONS && window.ICONS.x) || '') + '</span>';
            }
        } else {
            statusBadge = '<span style="color: var(--text-muted);">—</span>';
        }

        var momDisplay = '';
        if (idx > 0 && a > 0 && prevA > 0) {
            var momCol = mom >= 0 ? '#10B981' : '#EF4444';
            var momArr = mom >= 0 ? '↑' : '↓';
            momDisplay = '<span style=”color: ' + momCol + '; font-weight: 600;”>' + momArr + ' ' + Math.abs(mom).toFixed(1) + '%</span>';
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
        html += '<td style="font-family: \'Google Sans Text\', monospace;">' + fmt(t) + '</td>';
        html += '<td style="font-family: \'Google Sans Text\', monospace; font-weight: 600; color: #2563EB;">' + (a > 0 ? fmt(a) : '<span style="color: var(--text-muted);">—</span>') + '</td>';
        html += '<td style="font-family: \'Google Sans Text\', monospace; color: ' + (v >= 0 ? '#10B981' : '#EF4444') + ';">' + (a > 0 ? (v >= 0 ? '+' : '') + fmt(v) : '—') + '</td>';
        html += '<td style="font-family: \'Google Sans Text\', monospace;">' + (a > 0 ? pct.toFixed(1) + '%' : '—') + '</td>';
        html += '<td style="font-family: \'Google Sans Text\', monospace;">' + polCell + '</td>';
        html += '<td style="font-family: \'Google Sans Text\', monospace;">' + aovCell + '</td>';
        html += '<td>' + momDisplay + '</td>';
        html += '<td>' + statusBadge + '</td>';
        html += '</tr>';
    });
    
    // Total row
    var totalPolicies = policies.reduce(function(s, p, i) { return i <= currentMonthIdx ? s + p : s; }, 0);
    html += '<tr style="background: var(--bg); font-weight: 700; border-top: 2px solid var(--accent);">';
    html += '<td>YTD Total</td>';
    html += '<td style="font-family: \'Google Sans Text\', monospace;">' + fmt(ytdTarget) + '</td>';
    html += '<td style="font-family: \'Google Sans Text\', monospace; color: #2563EB;">' + fmt(ytdActual) + '</td>';
    var ytdVar = ytdActual - ytdTarget;
    html += '<td style="font-family: \'Google Sans Text\', monospace; color: ' + (ytdVar >= 0 ? '#10B981' : '#EF4444') + ';">' + (ytdVar >= 0 ? '+' : '') + fmt(ytdVar) + '</td>';
    var ytdPct = ytdTarget > 0 ? (ytdActual / ytdTarget * 100) : 0;
    html += '<td style="font-family: \'Google Sans Text\', monospace;">' + ytdPct.toFixed(1) + '%</td>';
    html += '<td style="font-family: \'Google Sans Text\', monospace;">' + (totalPolicies > 0 ? totalPolicies.toLocaleString() : '') + '</td>';
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
                        font: { size: 13, family: "'Google Sans Text', sans-serif", weight: '600' }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(10, 14, 39, 0.95)',
                    padding: 14,
                    titleFont: { size: 14, family: "'Google Sans Text', sans-serif" },
                    bodyFont: { size: 13, family: "'Google Sans Text', sans-serif" },
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
                    grace: '15%',
                    title: { display: true, text: 'GWP (' + scaleLabel + ')', font: { size: 12, weight: '600' } },
                    ticks: {
                        callback: function(value) { return value.toFixed(1) + scaleLabel; },
                        font: { family: "'Google Sans Text', sans-serif" }
                    },
                    grid: { color: 'rgba(0, 0, 0, 0.05)' }
                },
                x: {
                    grid: { display: false },
                    ticks: {
                        font: { family: "'Google Sans Text', sans-serif", size: 11 },
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
        }]
    });
}

console.log('✅ Fleet Analysis module loaded');

/* ============================================================================
   Contribution GWP (Segmentation) — KAM Analysis tab
   Stacked-bar chart + detailed table (Month / %Growth / %Contribution),
   auto-fetched from the segmentation tab of the OKR Google Sheet.
   ============================================================================ */
                                    // which renderTeamPerformanceDynamic wipes wholesale

// owner_type -> display config (order = stack order, bottom to top).
// Colors follow the dashboard theme: orange accent / teal success / neutral slate.
var SEG_TYPES = [
    { key: 'NON_FOCUS',    label: 'Non-Keyman',   color: '#64748B', textColor: '#ffffff' },
    { key: 'KEYMAN',       label: 'Keyman',       color: '#00D9A3', textColor: '#0A0E27' },
    { key: 'FOCUS_KEYMAN', label: 'Focus Keyman', color: '#FF6B35', textColor: '#ffffff' }
];

function segFmtMoney(v) { return Math.round(v).toLocaleString('en-US'); }
function segFmtM(v) { return (v / 1e6).toFixed(1) + 'M'; }
function segFmtPct(v) { return (v === null || isNaN(v)) ? '–' : v.toFixed(2) + '%'; }
function segCurrentYYYYMM() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

// Re-draw the segmentation chart with the cached data. Called when the KAM
// Analysis tab becomes visible, since a chart created while the tab is
// display:none renders into a zero-size canvas.
function refreshSegContributionChart() {
    if (!segContribData) return;
    // Recreate from scratch (renderSegContributionChart destroys any existing
    // instance first) so the canvas sizes to the now-visible container. Force the
    // draw — this is only called when the tab is meant to be visible (switchTab, or
    // embed mode), and offsetParent can misreport inside an iframe.
    renderSegContributionChart(segContribData.months, segContribData.byMonth, true);
}

function renderSegContributionChart(months, byMonth, force) {
    var canvas = document.getElementById('segContributionChart');
    if (!canvas) return;
    // Skip rendering while the tab is hidden (zero-size container) — a chart built
    // then gets an oversized canvas that overflows the card. The switchTab hook
    // (refreshSegContributionChart) renders it once the tab becomes visible, passing
    // force=true to bypass this guard (offsetParent is unreliable inside iframes).
    if (!force && canvas.offsetParent === null) return;
    if (segContribChartInstance) {
        segContribChartInstance.destroy();
    }

    var totals = months.map(function(m) {
        return SEG_TYPES.reduce(function(s, t) { return s + (byMonth[m][t.key] || 0); }, 0);
    });

    // Two-line x labels: "May 2026" / "Σ 144.6M"
    var labels = months.map(function(m, i) { return [formatYYYYMM(m), 'Total ' + segFmtM(totals[i])]; });

    var datasets = SEG_TYPES.map(function(t) {
        return {
            label: t.label,
            data: months.map(function(m) { return byMonth[m][t.key] || 0; }),
            backgroundColor: t.color,
            _textColor: t.textColor,
            borderRadius: 4,
            maxBarThickness: 70
        };
    });

    // Inline plugin: per-segment values (M) + month-over-month %growth above each bar
    var segLabelsPlugin = {
        id: 'segLabels',
        afterDatasetsDraw: function(chart) {
            var ctx = chart.ctx;
            ctx.save();
            // Segment values
            ctx.font = "600 11px 'Google Sans Text', sans-serif";
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            chart.data.datasets.forEach(function(ds, di) {
                var meta = chart.getDatasetMeta(di);
                if (!meta || meta.hidden) return;
                ctx.fillStyle = ds._textColor || '#334155';
                meta.data.forEach(function(el, i) {
                    var v = ds.data[i];
                    if (!el || !v) return;
                    var top = el.y, base = (el.base !== undefined ? el.base : el.y);
                    if (Math.abs(base - top) < 16) return; // too short to label
                    ctx.fillText(segFmtM(v), el.x, (top + base) / 2);
                });
            });
            // %Growth above each bar (total MoM)
            ctx.font = "700 13px 'Google Sans Text', sans-serif";
            ctx.textBaseline = 'bottom';
            var count = chart.data.labels.length;
            for (var i = 0; i < count; i++) {
                var sum = 0, topY = Infinity, x = null;
                chart.data.datasets.forEach(function(ds, di) {
                    var meta = chart.getDatasetMeta(di);
                    if (!meta || meta.hidden) return;
                    var el = meta.data[i];
                    if (!el) return;
                    sum += ds.data[i] || 0;
                    if (el.y < topY) topY = el.y;
                    x = el.x;
                });
                if (x === null || !isFinite(topY) || i === 0) continue;
                var prev = 0;
                chart.data.datasets.forEach(function(ds) { prev += ds.data[i - 1] || 0; });
                if (prev <= 0) continue;
                var growth = (sum - prev) / prev * 100;
                ctx.fillStyle = growth >= 0 ? '#2e9e5b' : '#d64545';
                ctx.fillText((growth >= 0 ? '+' : '') + growth.toFixed(1) + '%', x, topY - 6);
            }
            ctx.restore();
        }
    };

    segContribChartInstance = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: { labels: labels, datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 30 } },
            plugins: {
                legend: { display: true, position: 'top', reverse: true, labels: { usePointStyle: true, padding: 16, boxWidth: 10 } },
                barValueLabels: { enabled: false },
                tooltip: {
                    callbacks: {
                        label: function(c) { return c.dataset.label + ': ' + segFmtMoney(c.parsed.y); }
                    }
                }
            },
            scales: {
                y: {
                    stacked: true, beginAtZero: true,
                    ticks: { callback: function(v) { return segFmtM(v); } },
                    grid: { color: 'rgba(0,0,0,0.05)' }
                },
                x: { stacked: true, grid: { display: false }, ticks: { font: { weight: '600' } } }
            }
        },
        plugins: [segLabelsPlugin]
    });
}

function renderSegContributionTable(months, byMonth) {
    var container = document.getElementById('segContributionTableContainer');
    if (!container) return;

    var n = months.length;
    var monthShort = months.map(function(m) { return formatYYYYMMShort(m); });
    var totals = months.map(function(m) {
        return SEG_TYPES.reduce(function(s, t) { return s + (byMonth[m][t.key] || 0); }, 0);
    });

    // Display rows ordered top-of-stack first (Focus Keyman, Keyman, Non-Keyman)
    var rowTypes = SEG_TYPES.slice().reverse();

    var html = '<div class="table-section" style="background: var(--card-bg); border-radius: 12px; padding: 1.5rem 2rem; box-shadow: var(--shadow-md); border: 1px solid var(--border); overflow-x: auto;">';
    html += '<table class="data-table" style="font-size: 0.85rem;">';

    // Group header row
    html += '<thead><tr>';
    html += '<th rowspan="2" style="vertical-align: middle; background: var(--primary); color: #fff;">Agent Type</th>';
    html += '<th colspan="' + n + '" style="text-align: center; background: var(--primary); color: #fff;">Month</th>';
    html += '<th colspan="' + (n - 1) + '" style="text-align: center; background: #FF6B35; color: #fff;">%Growth</th>';
    html += '<th colspan="' + n + '" style="text-align: center; background: #00D9A3; color: #0A0E27;">%Contribution</th>';
    html += '</tr><tr>';
    monthShort.forEach(function(m) { html += '<th style="text-align: right; background: #1A1F3A; color: #fff;">' + m + '</th>'; });
    monthShort.slice(1).forEach(function(m) { html += '<th style="text-align: right; background: #FF8C5E; color: #fff;">' + m + '</th>'; });
    monthShort.forEach(function(m) { html += '<th style="text-align: right; background: #33E0B5; color: #0A0E27;">' + m + '</th>'; });
    html += '</tr></thead><tbody>';

    rowTypes.forEach(function(t) {
        var vals = months.map(function(m) { return byMonth[m][t.key] || 0; });
        html += '<tr>';
        html += '<td style="font-weight: 600; color: var(--text-primary);">' + t.label + '</td>';
        // Month values
        vals.forEach(function(v) {
            html += '<td style="text-align: right; font-family: \'Google Sans Text\', monospace;">' + segFmtMoney(v) + '</td>';
        });
        // %Growth (MoM)
        for (var i = 1; i < n; i++) {
            var g = vals[i - 1] > 0 ? (vals[i] - vals[i - 1]) / vals[i - 1] * 100 : null;
            var gc = g === null ? 'var(--text-secondary)' : (g >= 0 ? '#2e9e5b' : '#d64545');
            html += '<td style="text-align: right; font-family: \'Google Sans Text\', monospace; color: ' + gc + ';">' + segFmtPct(g) + '</td>';
        }
        // %Contribution
        vals.forEach(function(v, i) {
            var pct = totals[i] > 0 ? v / totals[i] * 100 : 0;
            html += '<td style="text-align: right; font-family: \'Google Sans Text\', monospace;">' + pct.toFixed(2) + '%</td>';
        });
        html += '</tr>';
    });

    // Grand Total row
    html += '<tr style="background: var(--bg); font-weight: 700; border-top: 2px solid var(--accent);">';
    html += '<td>Grand Total</td>';
    totals.forEach(function(v) {
        html += '<td style="text-align: right; font-family: \'Google Sans Text\', monospace;">' + segFmtMoney(v) + '</td>';
    });
    for (var i = 1; i < n; i++) {
        var g = totals[i - 1] > 0 ? (totals[i] - totals[i - 1]) / totals[i - 1] * 100 : null;
        var gc = g === null ? 'var(--text-secondary)' : (g >= 0 ? '#2e9e5b' : '#d64545');
        html += '<td style="text-align: right; font-family: \'Google Sans Text\', monospace; color: ' + gc + ';">' + segFmtPct(g) + '</td>';
    }
    months.forEach(function() {
        html += '<td style="text-align: right; font-family: \'Google Sans Text\', monospace;">100%</td>';
    });
    html += '</tr>';

    html += '</tbody></table></div>';
    container.innerHTML = html;
}

console.log('✅ Segmentation Contribution module loaded');

// ---- Universal controls bridge (KAM workspace header drives this embed) ----
function yyyymmToMonthLabel(yyyymm) {
    var p = String(yyyymm).split('-');
    var names = ['January', 'February', 'March', 'April', 'May', 'June',
                 'July', 'August', 'September', 'October', 'November', 'December'];
    var idx = parseInt(p[1], 10) - 1;
    if (idx < 0 || idx > 11 || !p[0]) return '';
    return names[idx] + ', ' + p[0];
}
function _reRenderTeamPerf() {
    if (typeof renderTeamPerformanceDynamic === 'function' && teamPerfRawData && teamPerfRawData.length) {
        renderTeamPerformanceDynamic();
    }
}
window.addEventListener('message', function (e) {
    var d = e.data || {};
    if (d.type === 'monthChange' && d.month) {
        var label = yyyymmToMonthLabel(d.month);
        if (!label) return;
        selectedMonth = label;
        runRateState.month = label;
        var mf = document.getElementById('monthFilter');
        if (mf) { for (var i = 0; i < mf.options.length; i++) { if (mf.options[i].value === label) { mf.value = label; break; } } }
        _reRenderTeamPerf();
    } else if (d.type === 'runRateChange') {
        runRateState.enabled = !!d.enabled;
        if (d.day) runRateState.day = parseInt(d.day, 10) || runRateState.day;
        if (d.month) { var lbl = yyyymmToMonthLabel(d.month); if (lbl) runRateState.month = lbl; }
        // keep the (hidden) internal panel in sync
        var cb = document.getElementById('runRateCheckbox'); if (cb) cb.checked = runRateState.enabled;
        var di = document.getElementById('runRateDayInput'); if (di) di.value = runRateState.day;
        var ms = document.getElementById('runRateMonthSelect'); if (ms && runRateState.month) ms.value = runRateState.month;
        var panel = document.getElementById('runRateControls'); if (panel) panel.dataset.active = String(runRateState.enabled);
        _reRenderTeamPerf();
    }
});

// Auto-fetch all data on page load
fetchOKRData();
fetchFleetData();
