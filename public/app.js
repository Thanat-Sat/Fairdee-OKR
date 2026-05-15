// ============================================================================
// AUTHENTICATION CHECK
// ============================================================================

// Wait for authManager to be available before using it
function initializeApp() {
    if (!window.authManager) {
        console.log('Waiting for authManager to initialize...');
        setTimeout(initializeApp, 100);
        return;
    }
    
    console.log('authManager ready, setting up authentication...');
    
    // Check authentication
    authManager.onAuthStateChanged((user) => {
        if (!user) {
            window.location.href = 'login.html';
        } else {
            // Display user email
            const userEmailEl = document.getElementById('userEmail');
            if (userEmailEl) {
                userEmailEl.textContent = user.email;
            }
        }
    });

    // Sign out functionality
    const signOutBtn = document.getElementById('signOutBtn');
    if (signOutBtn) {
        signOutBtn.addEventListener('click', async () => {
            const result = await authManager.signOut();
            if (result.success) {
                window.location.href = 'login.html';
            }
        });
    }
    
    // Refresh functionality
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', refreshAllDashboards);
    }
}

// Start initialization
initializeApp();

// ============================================================================
// GOOGLE SHEETS SYNC INDICATOR
// ============================================================================

const GOOGLE_SHEET_DATASETS = [
    { key: 'channel', label: 'Channel' },
    { key: 'mlm', label: 'MLM' },
    { key: 'focusTeam', label: 'Focus Team' },
    { key: 'agency', label: 'Agency' },
    { key: 'segment', label: 'Segment' },
    { key: 'renewal', label: 'Renewal' },
    { key: 'cohortCsv', label: 'Performance Recap' }
];

function formatSyncTime(isoString) {
    const date = isoString ? new Date(isoString) : null;
    if (!date || Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function setGoogleSheetSyncStatus(status, text) {
    const statusEl = document.getElementById('googleSheetSyncStatus');
    if (!statusEl) return;

    statusEl.classList.remove('sheet-sync-loading', 'sheet-sync-success', 'sheet-sync-warning');
    statusEl.classList.add(`sheet-sync-${status}`);
    statusEl.innerHTML = `<span class="sheet-sync-dot"></span><span>${text}</span>`;
}

let _mmBannerHideTimer = null;
function setMmProgressBanner(state, title, pct) {
    const banner = document.getElementById('mmProgressBanner');
    const titleEl = document.getElementById('mmProgressBannerTitle');
    const fillEl = document.getElementById('mmProgressBannerFill');
    if (!banner) return;

    if (titleEl && typeof title === 'string') titleEl.textContent = title;
    if (fillEl && typeof pct === 'number') {
        fillEl.style.width = Math.max(0, Math.min(100, pct)) + '%';
    }

    if (state === 'show') {
        if (_mmBannerHideTimer) { clearTimeout(_mmBannerHideTimer); _mmBannerHideTimer = null; }
        banner.classList.remove('fade-out', 'is-complete');
        banner.classList.add('visible');
    } else if (state === 'complete') {
        banner.classList.add('visible', 'is-complete');
        banner.classList.remove('fade-out');
    } else if (state === 'hide') {
        banner.classList.add('fade-out');
        banner.classList.remove('is-complete');
        _mmBannerHideTimer = setTimeout(() => {
            banner.classList.remove('visible', 'fade-out');
            _mmBannerHideTimer = null;
        }, 240);
    }
}

// Track which datasets have completed a fresh fetch in THIS session
const sessionFetchedKeys = new Set();
let sessionSyncedAt = null;

function updateGoogleSheetSyncIndicator() {
    const total = GOOGLE_SHEET_DATASETS.length;
    const done = sessionFetchedKeys.size;
    const pct = total ? Math.round((done / total) * 100) : 0;

    if (done >= total) {
        const t = formatSyncTime(sessionSyncedAt);
        const syncText = 'Google Sheets synced' + (t ? ` at ${t}` : '');
        setGoogleSheetSyncStatus('success', syncText);
        setMmProgressBanner('complete', syncText, 100);
        setTimeout(() => setMmProgressBanner('hide'), 1200);
        return;
    }

    const loadingText = `Fetching Google Sheets · ${done} of ${total}`;
    setGoogleSheetSyncStatus('loading', `Fetching Google Sheets ${done}/${total}...`);
    setMmProgressBanner('show', loadingText, pct);
}

function recordFetchedKey(key) {
    if (!key) return;
    const known = GOOGLE_SHEET_DATASETS.find(d => d.key === key);
    if (!known) return;
    sessionFetchedKeys.add(key);
    if (sessionFetchedKeys.size >= GOOGLE_SHEET_DATASETS.length) {
        sessionSyncedAt = new Date().toISOString();
    }
    updateGoogleSheetSyncIndicator();
}

function resetSyncTracking() {
    sessionFetchedKeys.clear();
    sessionSyncedAt = null;
    updateGoogleSheetSyncIndicator();
}

updateGoogleSheetSyncIndicator();

// ============================================================================
// MONTH SELECTOR
// ============================================================================

function formatMonthDisplay(monthStr) {
    if (!monthStr) return '';
    const [year, month] = monthStr.split('-');
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                   'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return names[parseInt(month) - 1] + ' ' + year;
}

function getMonthParts(monthStr) {
    if (!/^\d{4}-\d{2}$/.test(monthStr || '')) return null;
    const [year, month] = monthStr.split('-');
    return { year, month };
}

function getSelectableYears(months) {
    const currentYear = new Date().getFullYear();
    if (!months || months.length === 0) return [String(currentYear)];

    const years = months
        .map(month => parseInt(String(month).slice(0, 4), 10))
        .filter(year => !Number.isNaN(year));

    if (years.length === 0) return [String(currentYear)];

    const minYear = Math.min(...years);
    const maxYear = Math.max(...years, currentYear);
    const selectableYears = [];
    for (let year = minYear; year <= maxYear; year++) {
        selectableYears.push(String(year));
    }
    return selectableYears;
}

function getSelectedMonthFromControls() {
    const monthSelect = document.getElementById('globalMonthSelect');
    const yearSelect = document.getElementById('globalYearSelect');
    if (!monthSelect || !yearSelect || !monthSelect.value || !yearSelect.value) return '';
    return `${yearSelect.value}-${monthSelect.value}`;
}

function setSelectedMonth(month) {
    if (!month) return;
    localStorage.setItem('dashboard_selected_month', month);
    broadcastMonthChange(month);
}

function populateMonthSelector() {
    const monthSelect = document.getElementById('globalMonthSelect');
    const yearSelect = document.getElementById('globalYearSelect');
    if (!monthSelect || !yearSelect || !window.dashboardDataStore) return;

    const months = window.dashboardDataStore.getAvailableMonths();
    const selectableYears = getSelectableYears(months);
    const savedParts = getMonthParts(localStorage.getItem('dashboard_selected_month'));
    const latestParts = getMonthParts(months[months.length - 1]);
    const now = new Date();
    const fallbackParts = latestParts || {
        year: String(now.getFullYear()),
        month: String(now.getMonth() + 1).padStart(2, '0')
    };
    const selectedParts = savedParts || fallbackParts;

    yearSelect.innerHTML = '';
    selectableYears.slice().reverse().forEach(year => {
        const opt = document.createElement('option');
        opt.value = year;
        opt.textContent = year;
        yearSelect.appendChild(opt);
    });

    if (!selectableYears.includes(selectedParts.year)) {
        const opt = document.createElement('option');
        opt.value = selectedParts.year;
        opt.textContent = selectedParts.year;
        yearSelect.insertBefore(opt, yearSelect.firstChild);
    }

    monthSelect.value = selectedParts.month;
    yearSelect.value = selectedParts.year;
    localStorage.setItem('dashboard_selected_month', `${selectedParts.year}-${selectedParts.month}`);
}

function broadcastMonthChange(month) {
    document.querySelectorAll('iframe').forEach(iframe => {
        try {
            iframe.contentWindow.postMessage({ type: 'monthChange', month }, '*');
        } catch (e) {}
    });
}

function initMonthSelector() {
    if (!window.dashboardDataStore) {
        setTimeout(initMonthSelector, 200);
        return;
    }
    populateMonthSelector();

    const monthSelect = document.getElementById('globalMonthSelect');
    const yearSelect = document.getElementById('globalYearSelect');
    const handleChange = function() {
        setSelectedMonth(getSelectedMonthFromControls());
    };

    if (monthSelect) {
        monthSelect.addEventListener('change', handleChange);
    }
    if (yearSelect) {
        yearSelect.addEventListener('change', handleChange);
    }
}

// Re-populate when data is uploaded
window.addEventListener('dashboardDataUpdated', function() {
    populateMonthSelector();
});

window.addEventListener('message', function(event) {
    if (!event.data || event.data.type !== 'dashboardDataUpdated') return;
    recordFetchedKey(event.data.key);
    populateMonthSelector();
    document.querySelectorAll('iframe').forEach(iframe => {
        if (iframe.contentWindow === event.source) return;
        try {
            iframe.contentWindow.postMessage({ type: 'dashboardDataUpdated', key: event.data.key }, '*');
        } catch (e) {}
    });
});

initMonthSelector();

// ============================================================================
// REFRESH FUNCTIONALITY
// ============================================================================

function refreshAllDashboards() {
    const refreshBtn = document.getElementById('refreshBtn');
    const svg = refreshBtn.querySelector('svg');
    resetSyncTracking();

    // Add spinning animation
    svg.style.animation = 'spin 1s linear infinite';
    refreshBtn.disabled = true;
    refreshBtn.style.opacity = '0.6';
    
    // Get all iframes
    const iframes = [
        'executiveFrame',
        'recapFrame',
        'channelFrame',
        'mlmFrame',
        'focusFrame',
        'agencyFrame',
        'segmentFrame',
        'renewalFrame',
        'targetsFrame'
    ];
    
    // Reload each iframe
    iframes.forEach(frameId => {
        const iframe = document.getElementById(frameId);
        if (iframe) {
            iframe.src = iframe.src;
        }
    });
    
    // Show success message and reset button after 1.5 seconds
    setTimeout(() => {
        svg.style.animation = '';
        refreshBtn.disabled = false;
        refreshBtn.style.opacity = '1';
        updateGoogleSheetSyncIndicator();
        
        // Optional: Show a brief success indicator
        const originalText = refreshBtn.innerHTML;
        refreshBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg> Refreshed!';
        
        setTimeout(() => {
            refreshBtn.innerHTML = originalText;
        }, 2000);
    }, 1500);
}

// ============================================================================
// TAB SWITCHING LOGIC
// ============================================================================

document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', function() {
        const targetTab = this.dataset.tab;
        
        // Update active tab
        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        this.classList.add('active');
        
        // Get all content elements
        const allContainers = [
            document.getElementById('executiveContainer'),
            document.getElementById('recapContainer'),
            document.getElementById('channelContainer'),
            document.getElementById('mlmContainer'),
            document.getElementById('focusContainer'),
            document.getElementById('agencyContainer'),
            document.getElementById('segmentContainer'),
            document.getElementById('renewalContainer'),
            document.getElementById('targetsContainer')
        ];
        
        // Fade out all content
        allContainers.forEach(el => {
            if (el && el.style.display !== 'none') {
                el.classList.add('fade-out');
            }
        });
        
        // After fade out, hide and show new content
        setTimeout(() => {
            // Hide all content
            allContainers.forEach(el => {
                if (el) {
                    el.style.display = 'none';
                    el.classList.remove('fade-out', 'fade-in');
                }
            });
            
            // Show content based on tab
            let targetElement = null;
            
            if (targetTab === 'executive') {
                targetElement = document.getElementById('executiveContainer');
            } else if (targetTab === 'recap') {
                targetElement = document.getElementById('recapContainer');
            } else if (targetTab === 'overview') {
                targetElement = document.getElementById('channelContainer');
            } else if (targetTab === 'mlm') {
                targetElement = document.getElementById('mlmContainer');
            } else if (targetTab === 'focusteam') {
                targetElement = document.getElementById('focusContainer');
            } else if (targetTab === 'agency') {
                targetElement = document.getElementById('agencyContainer');
            } else if (targetTab === 'segment') {
                targetElement = document.getElementById('segmentContainer');
            } else if (targetTab === 'renewal') {
                targetElement = document.getElementById('renewalContainer');
            } else if (targetTab === 'targets') {
                targetElement = document.getElementById('targetsContainer');
            }
            
            // Show and fade in the target element
            if (targetElement) {
                targetElement.style.display = 'block';
                // Force reflow to ensure animation triggers
                targetElement.offsetHeight;
                targetElement.classList.add('fade-in');

                // Broadcast current month to newly visible iframe
                const currentMonth = localStorage.getItem('dashboard_selected_month');
                if (currentMonth) {
                    setTimeout(() => broadcastMonthChange(currentMonth), 150);
                }
            }
        }, 300); // Match the CSS transition duration
    });
});
