// ============================================================================
// EXECUTIVE SUMMARY DASHBOARD - SINGLE PAGE (NO TABS)
// ============================================================================

class ExecutiveSummary {
    constructor() {
        this.data = {
            channels: [],
            regions: [],
            focusTeams: [],
            monthlyTrend: [],
            agency: null,
            segment: null,
            renewal: null
        };
        
        // Team name mapping for Focus Teams
        this.teamNames = {
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
            'non focus team': '-'
        };
    }

    // Get the correct display name for a team code
    getTeamDisplayName(code) {
        if (!code) return '-';
        const trimmedCode = code.trim();
        if (this.teamNames[trimmedCode]) {
            return this.teamNames[trimmedCode];
        }
        if (trimmedCode.toLowerCase().includes('non') && trimmedCode.toLowerCase().includes('focus')) {
            return '-';
        }
        return trimmedCode;
    }

    formatNumber(num) {
        if (num === null || num === undefined || !Number.isFinite(num)) return '—';
        return num.toLocaleString('en-US', { maximumFractionDigits: 0 });
    }

    formatPercentage(num) {
        if (num === null || num === undefined || !Number.isFinite(num)) return '—';
        return num.toFixed(1) + '%';
    }

    formatCurrency(num) {
        return '฿' + this.formatNumber(num);
    }

    // Load data from centralized store
    async loadData() {
        console.log('Loading executive summary data from central store...');
        
        if (!window.dashboardDataStore) {
            console.warn('Dashboard data store not available');
            return false;
        }

        const storeData = window.dashboardDataStore.getAllData();
        
        // Process Overview Data (Channel, MLM, Regional, Focus Team)
        this.processOverviewData(storeData);
        
        // Store Agency, Segment, Renewal data
        this.data.agency = storeData.agency;
        this.data.segment = storeData.segment;
        this.data.renewal = storeData.renewal;

        console.log('Executive summary data loaded:', this.data);
        return true;
    }

    processOverviewData(storeData) {
        // Process Channel data for channels
        this.data.channels = [];
        if (storeData.channel && storeData.channel.data) {
            const channelData = storeData.channel;
            const allMonths = Object.keys(channelData.data).sort();
            const latestMonth = (window.getEffectiveMonth ? window.getEffectiveMonth(allMonths) : null) || allMonths[allMonths.length - 1];
            const year = latestMonth ? latestMonth.split('-')[0] : null;

            const channelNames = ['Team Agent', 'IG', 'FD/AO'];
            channelNames.forEach(name => {
                const current = channelData.data[latestMonth]?.[name] || 0;

                // Calculate YTD (all months in current year)
                let ytd = 0;
                if (year) {
                    allMonths.filter(m => m.startsWith(year)).forEach(month => {
                        ytd += channelData.data[month]?.[name] || 0;
                    });
                }

                this.data.channels.push({
                    name,
                    current,
                    target: current * 1.05, // Simulated target
                    ytd
                });
            });
        }

        // Process Regional data
        this.data.regions = [];
        if (storeData.regional) {
            const regionalData = storeData.regional;
            const _regionalEffective = (window.getEffectiveMonth ? window.getEffectiveMonth(regionalData.months) : null) || regionalData.months[regionalData.months.length - 1];
            const year = _regionalEffective ? _regionalEffective.split('-')[0] : null;
            
            Object.keys(regionalData.regions).forEach(regionName => {
                const regionData = regionalData.regions[regionName];
                
                // Calculate YTD
                let ytd = 0;
                if (year) {
                    regionalData.months.filter(m => m.startsWith(year)).forEach(month => {
                        ytd += regionData[month] || 0;
                    });
                }
                
                const estimatedTarget = ytd > 0 ? ytd * 1.2 : 0; // Simulated target
                
                this.data.regions.push({
                    name: regionName,
                    ytd: ytd,
                    target: estimatedTarget,
                    achievement: estimatedTarget > 0 ? (ytd / estimatedTarget) * 100 : 0
                });
            });
            
            // Sort by achievement
            this.data.regions.sort((a, b) => b.achievement - a.achievement);
        }

        // Process Focus Team data
        this.data.focusTeams = [];
        if (storeData.focusTeam) {
            const focusData = storeData.focusTeam;
            const _focusEffective = (window.getEffectiveMonth ? window.getEffectiveMonth(focusData.months) : null) || focusData.months[focusData.months.length - 1];
            const year = _focusEffective ? _focusEffective.split('-')[0] : null;
            
            focusData.teamList.forEach(team => {
                const teamData = focusData.teams[team.code];
                
                // Calculate YTD
                let ytd = 0;
                if (year && teamData) {
                    focusData.months.filter(m => m.startsWith(year)).forEach(month => {
                        ytd += teamData[month] || 0;
                    });
                }
                
                const estimatedTarget = ytd > 0 ? ytd * 1.15 : 0; // Simulated target
                
                // Use correct team display name from mapping
                const displayName = this.getTeamDisplayName(team.code);
                
                this.data.focusTeams.push({
                    name: `${displayName} (${team.code})`,
                    code: team.code,
                    ytd: ytd,
                    target: estimatedTarget,
                    achievement: estimatedTarget > 0 ? (ytd / estimatedTarget) * 100 : 0
                });
            });
            
            // Sort by achievement
            this.data.focusTeams.sort((a, b) => b.achievement - a.achievement);
        }

        // Process Monthly Trend (from MLM or Regional data)
        this.data.monthlyTrend = [];
        if (storeData.mlm) {
            const mlmData = storeData.mlm;
            const lastSixMonths = mlmData.months.slice(-6);

            lastSixMonths.forEach(month => {
                let total = 0;
                Object.keys(mlmData.teams).forEach(team => {
                    total += mlmData.teams[team][month] || 0;
                });

                const [year, monthNum] = month.split('-');
                const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                                   'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                const monthLabel = `${monthNames[parseInt(monthNum) - 1]} ${year}`;

                this.data.monthlyTrend.push({
                    monthKey: month,
                    month: monthLabel,
                    value: total
                });
            });
        }
    }

    renderOverview() {
        this.renderKPIs();
        this.renderChannelPerformance();
        this.renderFocusTeamPerformance();
        this.renderMonthlyTrend();
    }

    renderKPIs() {
        // Calculate KPIs
        const totalYTD = this.data.channels.reduce((sum, ch) => sum + ch.ytd, 0);
        const totalTarget = this.data.channels.reduce((sum, ch) => sum + ch.target, 0) * 12; // Annualized
        const currentMonth = this.data.channels.reduce((sum, ch) => sum + ch.current, 0);

        // Calculate real previous month total from channel data
        let previousMonth = 0;
        const storeData = window.dashboardDataStore ? window.dashboardDataStore.getAllData() : null;
        if (storeData && storeData.channel && storeData.channel.data) {
            const allMonths = Object.keys(storeData.channel.data).sort();
            const effectiveMonth = window.getEffectiveMonth ? window.getEffectiveMonth(allMonths) : allMonths[allMonths.length - 1];
            const prevIdx = effectiveMonth ? allMonths.indexOf(effectiveMonth) - 1 : -1;
            if (prevIdx >= 0) {
                const prevMonthData = storeData.channel.data[allMonths[prevIdx]];
                previousMonth = ['Team Agent', 'IG', 'FD/AO'].reduce((sum, ch) => sum + (prevMonthData?.[ch] || 0), 0);
            }
        }

        const monthlyGrowth = previousMonth > 0 ? ((currentMonth - previousMonth) / previousMonth) * 100 : 0;
        const targetAchievement = totalTarget > 0 ? (totalYTD / totalTarget) * 100 : null;

        // Total GWP
        document.getElementById('totalGWP').textContent = this.formatCurrency(totalYTD);
        document.getElementById('totalGWPTrend').textContent = `Current Month: ${this.formatCurrency(currentMonth)}`;
        document.getElementById('totalGWPTrend').className = 'kpi-trend';

        // Target Achievement
        document.getElementById('targetAchievement').textContent = this.formatPercentage(targetAchievement);
        const achievementCard = document.getElementById('targetAchievementCard');
        if (targetAchievement >= 90) {
            achievementCard.className = 'kpi-card success';
        } else if (targetAchievement >= 75) {
            achievementCard.className = 'kpi-card warning';
        } else {
            achievementCard.className = 'kpi-card danger';
        }

        // Monthly Growth
        document.getElementById('monthlyGrowth').textContent = this.formatPercentage(monthlyGrowth);
        document.getElementById('monthlyGrowthTrend').textContent = monthlyGrowth >= 0 ? '' : '';
        document.getElementById('monthlyGrowthTrend').className = monthlyGrowth >= 0 ? 'kpi-trend up' : 'kpi-trend down';
        const growthCard = document.getElementById('monthlyGrowthCard');
        growthCard.className = monthlyGrowth >= 0 ? 'kpi-card success' : 'kpi-card danger';

        // Active Focus Teams
        document.getElementById('activeAgents').textContent = this.data.focusTeams.length;
        document.getElementById('activeAgentsTrend').textContent = 'Total Teams';
    }

    renderChannelPerformance() {
        const tbody = document.getElementById('channelTableBody');
        tbody.innerHTML = '';

        if (this.data.channels.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem; color: #64748b;">No channel data available. Upload data in Channel Overview dashboard.</td></tr>';
            return;
        }

        this.data.channels.forEach(channel => {
            const achievement = channel.target > 0 ? (channel.current / channel.target) * 100 : null;
            const row = document.createElement('tr');

            // Channel name
            const tdName = document.createElement('td');
            tdName.textContent = channel.name;
            tdName.style.fontWeight = '600';
            row.appendChild(tdName);

            // Current
            const tdCurrent = document.createElement('td');
            tdCurrent.textContent = this.formatCurrency(channel.current);
            tdCurrent.style.textAlign = 'right';
            tdCurrent.style.fontFamily = '"Google Sans Text", monospace';
            row.appendChild(tdCurrent);

            // Target
            const tdTarget = document.createElement('td');
            tdTarget.textContent = this.formatCurrency(channel.target);
            tdTarget.style.textAlign = 'right';
            tdTarget.style.fontFamily = '"Google Sans Text", monospace';
            tdTarget.style.color = '#64748b';
            row.appendChild(tdTarget);

            // Achievement %
            const tdAchievement = document.createElement('td');
            tdAchievement.textContent = this.formatPercentage(achievement);
            tdAchievement.style.textAlign = 'center';
            tdAchievement.style.fontWeight = '700';
            if (achievement >= 100) {
                tdAchievement.style.color = '#10b981';
            } else if (achievement >= 80) {
                tdAchievement.style.color = '#f59e0b';
            } else {
                tdAchievement.style.color = '#ef4444';
            }
            row.appendChild(tdAchievement);

            // Progress bar
            const tdProgress = document.createElement('td');
            const progressBar = document.createElement('div');
            progressBar.className = 'performance-bar';
            const progressFill = document.createElement('div');
            progressFill.className = achievement >= 100 ? 'performance-fill success' : 
                                    achievement >= 80 ? 'performance-fill warning' : 
                                    'performance-fill danger';
            progressFill.style.width = Math.min(achievement, 100) + '%';
            progressBar.appendChild(progressFill);
            tdProgress.appendChild(progressBar);
            row.appendChild(tdProgress);

            tbody.appendChild(row);
        });
    }

    renderRegionalPerformance() {
        const tbody = document.getElementById('regionalTableBody');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (this.data.regions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 2rem; color: #64748b;">No regional data available.</td></tr>';
            return;
        }

        // Sort by achievement descending and take top 5
        const topRegions = [...this.data.regions]
            .sort((a, b) => b.achievement - a.achievement)
            .slice(0, 5);

        topRegions.forEach((region, index) => {
            const row = document.createElement('tr');

            // Rank & Name
            const tdName = document.createElement('td');
            const rankSpan = document.createElement('span');
            rankSpan.textContent = `${index + 1}. `;
            rankSpan.style.color = '#64748b';
            rankSpan.style.fontWeight = '700';
            tdName.appendChild(rankSpan);
            tdName.appendChild(document.createTextNode(region.name));
            tdName.style.fontWeight = '600';
            row.appendChild(tdName);

            // YTD
            const tdYTD = document.createElement('td');
            tdYTD.textContent = this.formatCurrency(region.ytd);
            tdYTD.style.textAlign = 'right';
            tdYTD.style.fontFamily = '"Google Sans Text", monospace';
            row.appendChild(tdYTD);

            // Achievement
            const tdAchievement = document.createElement('td');
            tdAchievement.textContent = this.formatPercentage(region.achievement);
            tdAchievement.style.textAlign = 'center';
            tdAchievement.style.fontWeight = '700';
            if (region.achievement >= 100) {
                tdAchievement.style.color = '#10b981';
            } else if (region.achievement >= 80) {
                tdAchievement.style.color = '#f59e0b';
            } else {
                tdAchievement.style.color = '#ef4444';
            }
            row.appendChild(tdAchievement);

            tbody.appendChild(row);
        });
    }

    renderFocusTeamPerformance() {
        const tbody = document.getElementById('focusTeamTableBody');
        tbody.innerHTML = '';

        if (this.data.focusTeams.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 2rem; color: #64748b;">No focus team data available. Upload data in Focus Team dashboard.</td></tr>';
            return;
        }

        // Sort by achievement descending and take top 5
        const topTeams = [...this.data.focusTeams]
            .sort((a, b) => b.achievement - a.achievement)
            .slice(0, 5);

        topTeams.forEach((team, index) => {
            const row = document.createElement('tr');

            // Rank & Name
            const tdName = document.createElement('td');
            const rankSpan = document.createElement('span');
            rankSpan.textContent = `${index + 1}. `;
            rankSpan.style.color = '#64748b';
            rankSpan.style.fontWeight = '700';
            tdName.appendChild(rankSpan);
            tdName.appendChild(document.createTextNode(team.name));
            tdName.style.fontWeight = '600';
            row.appendChild(tdName);

            // YTD
            const tdYTD = document.createElement('td');
            tdYTD.textContent = this.formatCurrency(team.ytd);
            tdYTD.style.textAlign = 'right';
            tdYTD.style.fontFamily = '"Google Sans Text", monospace';
            row.appendChild(tdYTD);

            // Achievement
            const tdAchievement = document.createElement('td');
            tdAchievement.textContent = this.formatPercentage(team.achievement);
            tdAchievement.style.textAlign = 'center';
            tdAchievement.style.fontWeight = '700';
            if (team.achievement >= 100) {
                tdAchievement.style.color = '#10b981';
            } else if (team.achievement >= 80) {
                tdAchievement.style.color = '#f59e0b';
            } else {
                tdAchievement.style.color = '#ef4444';
            }
            row.appendChild(tdAchievement);

            tbody.appendChild(row);
        });
    }

    renderMonthlyTrend() {
        const container = document.getElementById('trendChart');
        container.innerHTML = '';

        if (this.data.monthlyTrend.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 2rem; color: #64748b;">No trend data available. Upload data in dashboards to see trends.</div>';
            return;
        }

        // Apply global run rate: project the picked-date's month
        const rr = (window.globalRunRate && window.globalRunRate.get) ? window.globalRunRate.get() : { enabled: false };
        const displayed = this.data.monthlyTrend.map(m => {
            const projected = (rr.enabled && window.globalRunRate.projectForMonth)
                ? window.globalRunRate.projectForMonth(m.monthKey, m.value)
                : null;
            return { ...m, displayValue: projected != null ? projected : m.value, isProjected: projected != null };
        });

        const maxValue = Math.max(...displayed.map(m => m.displayValue || 0)) || 1;

        const chartContainer = document.createElement('div');
        chartContainer.style.display = 'flex';
        chartContainer.style.alignItems = 'flex-end';
        chartContainer.style.justifyContent = 'space-around';
        chartContainer.style.height = '200px';
        chartContainer.style.gap = '1rem';
        chartContainer.style.padding = '1rem 0';

        displayed.forEach(month => {
            const barContainer = document.createElement('div');
            barContainer.style.flex = '1';
            barContainer.style.display = 'flex';
            barContainer.style.flexDirection = 'column';
            barContainer.style.alignItems = 'center';
            barContainer.style.gap = '0.5rem';

            const bar = document.createElement('div');
            bar.style.width = '100%';
            bar.style.borderRadius = '4px 4px 0 0';
            bar.style.height = `${(month.displayValue / maxValue) * 150}px`;
            bar.style.transition = 'height 0.3s ease';
            if (month.isProjected) {
                bar.style.backgroundColor = '#f59e0b';
                bar.style.backgroundImage = 'repeating-linear-gradient(45deg, rgba(255,255,255,0.35) 0, rgba(255,255,255,0.35) 6px, rgba(255,255,255,0) 6px, rgba(255,255,255,0) 12px)';
                bar.title = 'Projected via run rate';
            } else {
                bar.style.backgroundColor = '#FF6B35';
            }

            const value = document.createElement('div');
            value.textContent = this.formatCurrency(month.displayValue);
            value.style.fontSize = '0.75rem';
            value.style.fontWeight = '700';
            value.style.color = month.isProjected ? '#92400e' : '#1e293b';
            value.style.fontFamily = '"Google Sans Text", monospace';
            if (month.isProjected) value.textContent += ' →';

            const label = document.createElement('div');
            label.textContent = month.month + (month.isProjected ? ' (proj.)' : '');
            label.style.fontSize = '0.75rem';
            label.style.color = month.isProjected ? '#92400e' : '#64748b';
            label.style.fontWeight = '600';

            barContainer.appendChild(value);
            barContainer.appendChild(bar);
            barContainer.appendChild(label);
            chartContainer.appendChild(barContainer);
        });

        container.appendChild(chartContainer);
    }

    renderAgency() {
        const container = document.getElementById('agencyContent');
        
        if (!this.data.agency) {
            container.innerHTML = '<div style="text-align: center; padding: 2rem; color: #64748b;">No agency data available. Upload data in Agency Performance dashboard.</div>';
            return;
        }

        // Render agency metrics summary
        const agencyData = this.data.agency;
        const latestMonth = (window.getEffectiveMonth ? window.getEffectiveMonth(agencyData.months) : null) || agencyData.months[agencyData.months.length - 1];
        const metrics = agencyData.metrics[latestMonth];

        if (!metrics) {
            container.innerHTML = '<div style="text-align: center; padding: 2rem; color: #64748b;">No agency metrics available for the latest month.</div>';
            return;
        }

        container.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
                <div style="padding: 1rem; background: #f8fafc; border-radius: 8px;">
                    <div style="font-size: 0.75rem; color: #64748b; margin-bottom: 0.5rem;">TOTAL AGENTS</div>
                    <div style="font-size: 1.5rem; font-weight: 700; color: #1e293b;">${this.formatNumber(metrics.totalAgents)}</div>
                </div>
                <div style="padding: 1rem; background: #f8fafc; border-radius: 8px;">
                    <div style="font-size: 0.75rem; color: #64748b; margin-bottom: 0.5rem;">NEW AGENTS</div>
                    <div style="font-size: 1.5rem; font-weight: 700; color: #1e293b;">${this.formatNumber(metrics.newAgents)}</div>
                </div>
                <div style="padding: 1rem; background: #f8fafc; border-radius: 8px;">
                    <div style="font-size: 0.75rem; color: #64748b; margin-bottom: 0.5rem;">ACTIVE AGENTS</div>
                    <div style="font-size: 1.5rem; font-weight: 700; color: #1e293b;">${this.formatNumber(metrics.activeAgents)}</div>
                </div>
                <div style="padding: 1rem; background: #f8fafc; border-radius: 8px;">
                    <div style="font-size: 0.75rem; color: #64748b; margin-bottom: 0.5rem;">ACTIVITY RATE</div>
                    <div style="font-size: 1.5rem; font-weight: 700; color: #10b981;">${this.formatPercentage(metrics.activityRate)}</div>
                </div>
            </div>
        `;
    }

    renderSegment() {
        const container = document.getElementById('segmentContent');
        
        if (!this.data.segment) {
            container.innerHTML = '<div style="text-align: center; padding: 2rem; color: #64748b;">No segment data available. Upload data in Segment Activation dashboard.</div>';
            return;
        }

        // Render segment activation summary
        const segmentData = this.data.segment;
        const segments = segmentData.segments;
        const _segEffective = window.getEffectiveMonth ? window.getEffectiveMonth(segmentData.months) : null;
        const latestMonthIndex = _segEffective ? segmentData.months.indexOf(_segEffective) : segmentData.months.length - 1;

        let totalActivation = 0;
        Object.keys(segments).forEach(segment => {
            totalActivation += segments[segment][latestMonthIndex] || 0;
        });

        let html = '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem;">';
        
        Object.keys(segments).forEach(segment => {
            const count = segments[segment][latestMonthIndex] || 0;
            const percentage = totalActivation > 0 ? (count / totalActivation) * 100 : 0;
            
            html += `
                <div style="padding: 1rem; background: #f8fafc; border-radius: 8px;">
                    <div style="font-size: 0.75rem; color: #64748b; margin-bottom: 0.5rem;">${segment}</div>
                    <div style="font-size: 1.5rem; font-weight: 700; color: #1e293b;">${this.formatNumber(count)}</div>
                    <div style="font-size: 0.75rem; color: #10b981; margin-top: 0.25rem;">${this.formatPercentage(percentage)}</div>
                </div>
            `;
        });
        
        html += '</div>';
        container.innerHTML = html;
    }

    renderRenewal() {
        const container = document.getElementById('renewalContent');
        
        if (!this.data.renewal) {
            container.innerHTML = '<div style="text-align: center; padding: 2rem; color: #64748b;">No renewal data available. Upload data in Renewal Rate dashboard.</div>';
            return;
        }

        // Render renewal rates summary
        const renewalData = this.data.renewal;
        const latestMonth = (window.getEffectiveMonth ? window.getEffectiveMonth(renewalData.months) : null) || renewalData.months[renewalData.months.length - 1];
        const channels = renewalData.channels;

        let html = '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">';
        
        Object.keys(channels).forEach(channel => {
            const rate = channels[channel][latestMonth];
            const channelNames = {
                'mlm_agent': 'MLM Agent',
                'direct_agent': 'Direct Agent',
                'ao_agent': 'AO Agent',
                'inspection_garage': 'Inspection Garage'
            };
            
            html += `
                <div style="padding: 1rem; background: #f8fafc; border-radius: 8px;">
                    <div style="font-size: 0.75rem; color: #64748b; margin-bottom: 0.5rem;">${channelNames[channel] || channel}</div>
                    <div style="font-size: 1.5rem; font-weight: 700; color: #10b981;">${rate ? rate.toFixed(2) + '%' : ''}</div>
                </div>
            `;
        });
        
        html += '</div>';
        container.innerHTML = html;
    }

    async render() {
        await this.loadData();
        
        // Render all sections on one page
        this.renderOverview();
        this.renderAgency();
        this.renderSegment();
        this.renderRenewal();
    }
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

const executiveSummary = new ExecutiveSummary();

// Listen for data updates from other dashboards
window.addEventListener('dashboardDataUpdated', async (event) => {
    console.log('Dashboard data updated, refreshing Executive Summary...');
    await executiveSummary.render();
});

// Listen for month changes from parent frame
window.addEventListener('message', async function(event) {
    if (event.data && event.data.type === 'monthChange') {
        await executiveSummary.render();
    }
    if (event.data && event.data.type === 'dashboardDataUpdated') {
        await executiveSummary.render();
    }
});

// Initialize when page loads
window.addEventListener('DOMContentLoaded', async () => {
    console.log('Executive Summary Dashboard loading...');
    if (window.globalRunRate && window.globalRunRate.subscribe) {
        window.globalRunRate.subscribe(() => {
            if (executiveSummary && executiveSummary.renderMonthlyTrend) {
                executiveSummary.renderMonthlyTrend();
            }
        });
    }
    await executiveSummary.render();
    console.log('Executive Summary Dashboard ready');
});
