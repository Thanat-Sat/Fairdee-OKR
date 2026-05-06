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
// MONTH SELECTOR
// ============================================================================

function formatMonthDisplay(monthStr) {
    if (!monthStr) return '';
    const [year, month] = monthStr.split('-');
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                   'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return names[parseInt(month) - 1] + ' ' + year;
}

function populateMonthSelector() {
    const select = document.getElementById('globalMonthSelect');
    if (!select || !window.dashboardDataStore) return;

    const months = window.dashboardDataStore.getAvailableMonths();
    if (months.length === 0) return;

    select.innerHTML = '';
    months.slice().reverse().forEach(month => {
        const opt = document.createElement('option');
        opt.value = month;
        opt.textContent = formatMonthDisplay(month);
        select.appendChild(opt);
    });

    const saved = localStorage.getItem('dashboard_selected_month');
    const latest = months[months.length - 1];
    const current = (saved && months.includes(saved)) ? saved : latest;
    select.value = current;
    localStorage.setItem('dashboard_selected_month', current);
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

    const select = document.getElementById('globalMonthSelect');
    if (select) {
        select.addEventListener('change', function() {
            localStorage.setItem('dashboard_selected_month', this.value);
            broadcastMonthChange(this.value);
        });
    }
}

// Re-populate when data is uploaded
window.addEventListener('dashboardDataUpdated', function() {
    populateMonthSelector();
});

initMonthSelector();

// ============================================================================
// REFRESH FUNCTIONALITY
// ============================================================================

function refreshAllDashboards() {
    const refreshBtn = document.getElementById('refreshBtn');
    const svg = refreshBtn.querySelector('svg');
    
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
