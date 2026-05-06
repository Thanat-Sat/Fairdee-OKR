// ============================================================================
// CENTRALIZED DASHBOARD DATA STORE
// ============================================================================

class DashboardDataStore {
    constructor() {
        this.STORAGE_KEY = 'dashboard_data_v1';
        this.data = this.loadFromStorage();
    }

    loadFromStorage() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                console.log('✅ Data loaded from localStorage');
                return parsed;
            }
        } catch (error) {
            console.error('Error loading from storage:', error);
        }

        // Default empty structure
        return {
            channel: null,
            mlm: null,
            regional: null,
            segment: null,
            agency: null,
            renewal: null,
            focusTeam: null,
            cohortCsv: null,
            lastUpdated: {}
        };
    }

    saveToStorage() {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.data));
            console.log('✅ Data saved to localStorage');
            
            // Dispatch event to notify other dashboards
            window.dispatchEvent(new CustomEvent('dashboardDataUpdated', { 
                detail: this.data 
            }));
        } catch (error) {
            console.error('Error saving to storage:', error);
        }
    }

    // Channel data
    updateChannelData(channelData, months) {
        this.data.channel = { data: channelData, months };
        this.data.lastUpdated.channel = new Date().toISOString();
        this.saveToStorage();
    }

    // MLM data
    updateMLMData(mlmData, months) {
        this.data.mlm = { teams: mlmData, months };
        this.data.lastUpdated.mlm = new Date().toISOString();
        this.saveToStorage();
    }

    // Regional data
    updateRegionalData(regionalData, months) {
        this.data.regional = { regions: regionalData, months };
        this.data.lastUpdated.regional = new Date().toISOString();
        this.saveToStorage();
    }

    // Segment data
    updateSegmentData(segmentData, months) {
        this.data.segment = { segments: segmentData, months };
        this.data.lastUpdated.segment = new Date().toISOString();
        this.saveToStorage();
    }

    // Agency data
    updateAgencyData(agencyData, months) {
        this.data.agency = { metrics: agencyData, months };
        this.data.lastUpdated.agency = new Date().toISOString();
        this.saveToStorage();
    }

    // Renewal data
    updateRenewalData(renewalData, months) {
        this.data.renewal = { channels: renewalData, months };
        this.data.lastUpdated.renewal = new Date().toISOString();
        this.saveToStorage();
    }

    // Focus Team data
    updateFocusTeamData(teamData, months, teamList) {
        this.data.focusTeam = { teams: teamData, months, teamList };
        this.data.lastUpdated.focusTeam = new Date().toISOString();
        this.saveToStorage();
    }

    // MoM Cohort CSV (raw text)
    updateCohortCsvData(csvText) {
        this.data.cohortCsv = { text: csvText };
        this.data.lastUpdated.cohortCsv = new Date().toISOString();
        this.saveToStorage();
    }

    // Get all data
    getAllData() {
        return this.data;
    }

    // Get all available months across all datasets (sorted ascending)
    getAvailableMonths() {
        const monthSet = new Set();
        ['mlm', 'regional', 'segment', 'agency', 'renewal', 'focusTeam'].forEach(key => {
            if (this.data[key] && this.data[key].months) {
                this.data[key].months.forEach(m => monthSet.add(m));
            }
        });
        if (this.data.channel && this.data.channel.data) {
            Object.keys(this.data.channel.data).forEach(m => monthSet.add(m));
        }
        return Array.from(monthSet).sort();
    }

    setSelectedMonth(month) {
        if (month) {
            localStorage.setItem('dashboard_selected_month', month);
        } else {
            localStorage.removeItem('dashboard_selected_month');
        }
    }

    getSelectedMonth() {
        return localStorage.getItem('dashboard_selected_month');
    }

    // Clear all data
    clearData() {
        this.data = {
            channel: null,
            mlm: null,
            regional: null,
            segment: null,
            agency: null,
            renewal: null,
            focusTeam: null,
            cohortCsv: null,
            lastUpdated: {}
        };
        this.saveToStorage();
    }
}

// Create global instance
window.dashboardDataStore = new DashboardDataStore();
console.log('📊 Dashboard Data Store initialized');

// Global utility: resolve the effective (selected) month from an array of available months
window.getEffectiveMonth = function(availableMonths) {
    if (!availableMonths || availableMonths.length === 0) return null;
    const selected = localStorage.getItem('dashboard_selected_month');
    if (selected && availableMonths.includes(selected)) return selected;
    if (selected && /^\d{4}-\d{2}$/.test(selected)) {
        const priorMonths = availableMonths.filter(month => month <= selected);
        if (priorMonths.length > 0) return priorMonths[priorMonths.length - 1];
        return availableMonths[0];
    }
    return availableMonths[availableMonths.length - 1];
};
