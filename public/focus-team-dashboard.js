window.addEventListener('load', function() {
    if (typeof Chart !== 'undefined') {
        Chart.defaults.font.family = "'Google Sans Text', sans-serif";
    }
});

// ============================================================================
// FOCUS TEAM DATA PROCESSING MODULE
// ============================================================================

class FocusTeamDataProcessor {
    constructor() {
        this.rawData = [];
        this.teamData = {};
        this.months = [];
        this.teams = []; // Team anchor codes with names
        this.targets = {}; // Store targets
        
        // Mapping of team anchor codes to Thai names
        this.teamNames = {
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
            'FM-28595': 'พิมพาภรณ์',
            'FM-21461': 'ธนพร',
            'FM-23332': 'ดิน',
            'FM-20898': 'บิ๊ก',
            'non focus team': '-'
        };

        // Tier classification
        this.teamTiers = {
            'FM-19867': 'focus',
            'FM-19729': 'focus',
            'FM-21975': 'focus',
            'FM-21511': 'focus',
            'FM-23437': 'focus',
            'FM-19134': 'focus',
            'FM-23277': 'focus',
            'FM-23273': 'focus',
            'FM-19119': 'focus',
            'FM-42800': 'focus',
            'FM-28595': 'mid',
            'FM-21461': 'mid',
            'FM-23332': 'mid',
            'FM-20898': 'mid'
        };
    }

    // Get the correct display name for a team code
    sortTeams() {
        this.teams = this.teams
            .filter(t => t.code.toLowerCase() !== 'non focus team')
            .sort((a, b) => {
                const tierA = this.getTeamTier(a.code) === 'mid' ? 1 : 0;
                const tierB = this.getTeamTier(b.code) === 'mid' ? 1 : 0;
                if (tierA !== tierB) return tierA - tierB;
                return a.code.localeCompare(b.code);
            });
    }

    getTeamTier(code) {
        const trimmedCode = (code || '').trim();
        return this.teamTiers[trimmedCode] || 'focus';
    }

    inferTeamTier(teamName) {
        const normalized = (teamName || '').toLowerCase().replace(/[\s-]+/g, '_');
        if (normalized === 'focus_team') return 'focus';
        if (normalized === 'mid_tier_team' || normalized === 'midtier_team') return 'mid';
        return null;
    }

    getTeamDisplayName(code) {
        if (!code) return '-';
        const trimmedCode = code.trim();
        // Check if it's in our mapping
        if (this.teamNames[trimmedCode]) {
            return this.teamNames[trimmedCode];
        }
        // Handle non-focus team variations
        if (trimmedCode.toLowerCase().includes('non') && trimmedCode.toLowerCase().includes('focus')) {
            return '-';
        }
        // Return the code itself as fallback
        return trimmedCode;
    }

    parseCSV(csvText) {
        const lines = csvText.trim().split('\n');
        if (lines.length < 2) return [];
        
        // Parse header to find column indices
        const header = this.parseCSVLine(lines[0]);
        const teamNameIdx = header.indexOf('team_name');
        const anchorCodeIdx = header.indexOf('team_anchor_code');
        const agentRegionIdx = header.indexOf('agent_region'); // Use agent_region for team name
        const monthIdx = header.indexOf('month');
        const gwpIdx = header.indexOf('gwp');
        
        console.log('CSV Header:', header);
        console.log('Column indices - anchor:', anchorCodeIdx, 'region:', agentRegionIdx, 'month:', monthIdx, 'gwp:', gwpIdx);
        
        if (anchorCodeIdx === -1 || monthIdx === -1 || gwpIdx === -1) {
            console.error('Required columns not found. Expected: team_anchor_code, month, gwp');
            return [];
        }
        
        // Parse data rows
        const data = [];
        for (let i = 1; i < lines.length; i++) {
            const values = this.parseCSVLine(lines[i]);
            if (values.length >= Math.max(anchorCodeIdx, monthIdx, gwpIdx) + 1) {
                const row = {
                    anchorCode: values[anchorCodeIdx],
                    teamName: teamNameIdx >= 0 ? values[teamNameIdx] : '',
                    agentName: agentRegionIdx >= 0 ? values[agentRegionIdx] : '',
                    month: values[monthIdx],
                    gwp: values[gwpIdx]
                };
                data.push(row);
            }
        }
        
        console.log(`Parsed ${data.length} rows from CSV`);
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

    extractGWP(value) {
        const cleanValue = value.toString()
            .replace(/["à¸¿$,\s]/g, '')
            .replace(/[^\d.-]/g, '');
        return parseFloat(cleanValue) || 0;
    }

    parseMonth(monthStr) {
        // YYYY-M or YYYY-MM format
        if (monthStr.match(/^\d{4}-\d{1,2}$/)) {
            const parts = monthStr.split('-');
            return parts[0] + '-' + parts[1].padStart(2, '0');
        }

        // Parse "July, 2025" format if present
        if (monthStr.includes(',')) {
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
        
        return null;
    }

    formatMonthLabel(monthStr) {
        const [year, month] = monthStr.split('-');
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                           'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${monthNames[parseInt(month) - 1]} ${year.slice(2)}`;
    }

    processData(csvText) {
        const data = this.parseCSV(csvText);
        
        if (data.length === 0) {
            console.error('No data parsed from CSV');
            return null;
        }
        
        this.rawData = data;
        this.teamData = {};

        // Get unique team anchors with their names
        const teamsMap = new Map();
        data.forEach(row => {
            const anchorCode = row.anchorCode.trim();
            const inferredTier = this.inferTeamTier(row.teamName);
            if (anchorCode && inferredTier) {
                this.teamTiers[anchorCode] = inferredTier;
            }
            if (anchorCode && !teamsMap.has(anchorCode)) {
                // Use getTeamDisplayName for correct name lookup
                const displayName = this.getTeamDisplayName(anchorCode);
                teamsMap.set(anchorCode, displayName);
            }
        });
        
        this.teams = Array.from(teamsMap.entries())
            .filter(([code]) => code.toLowerCase() !== 'non focus team')
            .map(([code, name]) => ({ code, name }))
            .sort((a, b) => {
                const tierA = this.getTeamTier(a.code) === 'mid' ? 1 : 0;
                const tierB = this.getTeamTier(b.code) === 'mid' ? 1 : 0;
                if (tierA !== tierB) return tierA - tierB;
                return a.code.localeCompare(b.code);
            });
        
        console.log('Teams found:', this.teams.length);

        // Process data - aggregate by team anchor and month
        let processedCount = 0;
        data.forEach(row => {
            const month = this.parseMonth(row.month);
            const anchorCode = row.anchorCode.trim();
            const gwp = this.extractGWP(row.gwp);

            if (!month || !anchorCode) return;

            if (!this.teamData[anchorCode]) {
                this.teamData[anchorCode] = {};
            }

            if (!this.teamData[anchorCode][month]) {
                this.teamData[anchorCode][month] = 0;
            }

            this.teamData[anchorCode][month] += gwp;
            processedCount++;
        });
        
        console.log(`Processed ${processedCount} rows into teamData`);

        // Get unique sorted months
        const monthsSet = new Set();
        Object.values(this.teamData).forEach(teamMonths => {
            Object.keys(teamMonths).forEach(month => monthsSet.add(month));
        });
        this.months = Array.from(monthsSet).sort();
        console.log('Months found:', this.months);

        // Update centralized data store
        if (window.dashboardDataStore) {
            window.dashboardDataStore.updateFocusTeamData(this.teamData, this.months, this.teams);
            console.log('Focus Team data saved to central store');
        }

        return this.teamData;
    }

    async loadTargets() {
        console.log('=== LOADING FOCUS TEAM TARGETS FROM FIRESTORE ===');
        if (!window.targetsDB) {
            console.log('Waiting for targetsDB...');
            await new Promise(resolve => setTimeout(resolve, 100));
            return this.loadTargets();
        }

        try {
            console.log('Calling targetsDB.getAllTargets()...');
            const result = await targetsDB.getAllTargets();
            console.log('Raw result from Firestore:', result);
            
            if (result.success && result.targets) {
                this.targets = {};
                // Filter for focus_team targets only
                const focusTeamTargets = result.targets.filter(t => t.type === 'focus_team');
                console.log(`Found ${focusTeamTargets.length} focus team targets out of ${result.targets.length} total`);
                
                focusTeamTargets.forEach(target => {
                    const key = `${target.month}-${target.name}`;
                    this.targets[key] = target.value;
                    console.log(`  Loaded: ${key} = ${target.value}`);
                });
                console.log('Final targets object:', this.targets);
                return true;
            } else {
                console.log('No targets found or result.success was false');
            }
        } catch (error) {
            console.error('Error loading targets:', error);
        }
        return false;
    }

    getTarget(month, anchorCode) {
        const key = `${month}-${anchorCode}`;
        return this.targets[key] || null;
    }

    getLastNMonths(n = 2) {
        if (this.months.length === 0) return [];
        const effective = window.getEffectiveMonth ? window.getEffectiveMonth(this.months) : this.months[this.months.length - 1];
        const idx = effective ? this.months.indexOf(effective) : this.months.length - 1;
        const end = idx < 0 ? this.months.length : idx + 1;
        return this.months.slice(Math.max(0, end - n), end);
    }

    calculateGrowth(latestMonth, previousMonth, anchorCode) {
        const latestValue = this.teamData[anchorCode]?.[latestMonth] || 0;
        const previousValue = this.teamData[anchorCode]?.[previousMonth] || 0;
        
        if (previousValue === 0) return null;
        return ((latestValue - previousValue) / previousValue) * 100;
    }

    calculateEOYTotal(anchorCode) {
        const year = this.months.length > 0 ? this.months[this.months.length - 1].split('-')[0] : null;
        if (!year) return 0;

        const yearMonths = this.months.filter(m => m.startsWith(year));
        
        let total = 0;
        yearMonths.forEach(month => {
            if (this.teamData[anchorCode] && this.teamData[anchorCode][month]) {
                total += this.teamData[anchorCode][month];
            }
        });
        return total;
    }

    calculateEOYTarget(anchorCode) {
        const year = this.months.length > 0 ? this.months[this.months.length - 1].split('-')[0] : null;
        if (!year) return null;

        const yearMonths = this.months.filter(m => m.startsWith(year));
        
        let total = 0;
        yearMonths.forEach(month => {
            const target = this.getTarget(month, anchorCode);
            if (target) {
                total += target;
            }
        });
        return total || null;
    }

    calculatePercentage(actual, target) {
        if (!target || target === 0) return null;
        return (actual / target) * 100;
    }
}

// ============================================================================
// UI MODULE - FOCUS TEAM
// ============================================================================

class FocusTeamUI {
    constructor(dataProcessor) {
        this.dataProcessor = dataProcessor;
    }

    formatNumber(num) {
        return num.toLocaleString('en-US', { maximumFractionDigits: 0 });
    }

    formatPercentage(num) {
        if (num === null || isNaN(num)) return '\u2014';
        return num.toFixed(2) + '%';
    }

    getPercentageClass(percentage) {
        if (percentage === null) return 'neutral';
        if (percentage >= 100) return 'success';
        if (percentage >= 80) return 'warning';
        return 'danger';
    }

    getGrowthClass(growth) {
        if (growth === null) return 'neutral';
        if (growth > 0) return 'success';
        if (growth === 0) return 'neutral';
        return 'danger';
    }

    async render() {
        await this.dataProcessor.loadTargets();

        if (this.dataProcessor.months.length === 0 || this.dataProcessor.teams.length === 0) {
            console.log('No data to render');
            document.getElementById('noDataSection').style.display = 'flex';
            document.getElementById('dashboardContent').style.display = 'none';
            return;
        }

        this.renderTable();
        this.renderTierCharts();

        document.getElementById('noDataSection').style.display = 'none';
        document.getElementById('dashboardContent').style.display = 'block';
    }

    formatMB(num) {
        if (!num) return '0.0MB';
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'MB';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toFixed(0);
    }

    formatMonthLabel(monthStr) {
        const [year, month] = monthStr.split('-');
        const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return `${names[parseInt(month)-1]} ${year.slice(2)}`;
    }

    getDaysInMonth(monthStr) {
        const [year, month] = monthStr.split('-').map(Number);
        return new Date(year, month, 0).getDate();
    }

    calcRunRate(actual, dayOfMonth, daysInMonth) {
        if (!dayOfMonth || dayOfMonth <= 0) return null;
        return actual * (daysInMonth / Math.min(dayOfMonth, daysInMonth));
    }

    initRunRateControls() {
        const checkbox  = document.getElementById('ftShowRunRate');
        const inputsDiv = document.getElementById('ftRunRateInputs');
        const dayInput  = document.getElementById('ftRunRateDay');
        if (this._runRateWired) return;
        this._runRateWired = true;

        const syncFromGlobal = () => {
            if (!window.globalRunRate || !window.globalRunRate.get) return;
            const s = window.globalRunRate.get();
            if (checkbox) checkbox.checked = !!s.enabled;
            const parsed = window.globalRunRate.parseDate(s.date);
            if (parsed && dayInput) dayInput.value = parsed.day;
            if (inputsDiv) inputsDiv.style.display = s.enabled ? 'flex' : 'none';
        };
        syncFromGlobal();

        if (window.globalRunRate && window.globalRunRate.subscribe) {
            window.globalRunRate.subscribe(() => {
                syncFromGlobal();
                this.renderTierCharts();
            });
        }

        if (!checkbox) return;
        checkbox.addEventListener('change', () => {
            if (window.globalRunRate) window.globalRunRate.set({ enabled: checkbox.checked });
        });
        dayInput.addEventListener('input', () => {
            const v = parseInt(dayInput.value, 10);
            if (isNaN(v) || v < 1 || v > 31) return;
            if (window.globalRunRate) {
                const cur = window.globalRunRate.get();
                const parsed = window.globalRunRate.parseDate(cur.date) || { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };
                const y = parsed.year;
                const m = String(parsed.month).padStart(2, '0');
                const d = String(v).padStart(2, '0');
                window.globalRunRate.set({ date: `${y}-${m}-${d}` });
            }
        });
    }

    buildTierChart(canvasId, teams, month, titleEl, bannerEl, showRunRate, runRateDay) {
        const labels     = teams.map(t => this.dataProcessor.getTeamDisplayName(t.code));
        const rawActuals = teams.map(t => this.dataProcessor.teamData[t.code]?.[month] || 0);
        const targets    = teams.map(t => this.dataProcessor.getTarget(month, t.code) || null);

        // Apply run rate
        let actuals = rawActuals;
        let isRunRate = false;
        if (showRunRate && runRateDay > 0) {
            const daysInMonth = this.getDaysInMonth(month);
            actuals = rawActuals.map(v => this.calcRunRate(v, runRateDay, daysInMonth) ?? v);
            isRunRate = true;
        }

        // Per-agent above/below count
        let aboveCount = 0, belowCount = 0;
        actuals.forEach((a, i) => {
            if (targets[i] === null) return;
            a >= targets[i] ? aboveCount++ : belowCount++;
        });
        const totalWithTarget = aboveCount + belowCount;

        // Title & banner
        const tierLabel = canvasId === 'focusTeamChart' ? 'Focus team' : 'Mid Tier team';
        const rrSuffix  = isRunRate ? ` (Run Rate day ${runRateDay})` : '';
        if (titleEl) titleEl.textContent = `${tierLabel} performance in ${this.formatMonthLabel(month)}${rrSuffix}`;
        if (bannerEl && totalWithTarget > 0) {
            bannerEl.innerHTML =
                `<span style="margin-right:1.25rem;">↑ ${aboveCount} above target</span>` +
                `<span>↓ ${belowCount} below target</span>`;
            bannerEl.style.background = belowCount === 0 ? '#22c55e' : aboveCount > belowCount ? '#f59e0b' : '#ef4444';
        }

        const existing = Chart.getChart(canvasId);
        if (existing) existing.destroy();

        // Run rate = blue solid; target = orange dashed
        const actualColor = isRunRate ? '#3b82f6' : '#3b82f6';
        const actualLabel = isRunRate ? `Run Rate (day ${runRateDay})` : 'Actual';
        const self = this;

        new Chart(document.getElementById(canvasId).getContext('2d'), {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Target',
                        data: targets,
                        borderColor: '#f59e0b',
                        backgroundColor: 'transparent',
                        borderWidth: 2,
                        borderDash: [6, 4],
                        tension: 0,
                        spanGaps: true,
                        pointStyle: 'rectRot',
                        pointBackgroundColor: '#f59e0b',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 1.5,
                        pointRadius: 5
                    },
                    {
                        label: actualLabel,
                        data: actuals,
                        borderColor: '#3b82f6',
                        backgroundColor: 'transparent',
                        borderWidth: 2.5,
                        tension: 0,
                        pointStyle: isRunRate ? 'rectRot' : 'circle',
                        pointBackgroundColor: '#3b82f6',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2,
                        pointRadius: isRunRate ? 7 : 6
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 32, right: 10, bottom: 4, left: 10 } },
                plugins: {
                    legend: {
                        position: 'top', align: 'end',
                        labels: { usePointStyle: true, font: { family: 'Google Sans Text', size: 11 }, padding: 12 }
                    },
                    tooltip: {
                        callbacks: { label: ctx => `${ctx.dataset.label}: ${self.formatMB(ctx.parsed.y)}` }
                    }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { font: { family: 'Google Sans Text', size: 10 }, color: '#64748b' } },
                    y: {
                        grid: { color: '#f1f5f9' },
                        ticks: { font: { family: 'Google Sans Text', size: 10 }, color: '#94a3b8', callback: v => self.formatMB(v) }
                    }
                }
            },
            plugins: [{
                id: 'valueLabels',
                afterDraw(chart) {
                    const ctx = chart.ctx;
                    const meta0 = chart.getDatasetMeta(0); // target
                    const meta1 = chart.getDatasetMeta(1); // actual / run rate

                    targets.forEach((tgt, i) => {
                        const ptT = meta0.data[i];
                        const ptA = meta1.data[i];
                        const tgtVal = targets[i];
                        const actVal = actuals[i];

                        // Determine label positions — separate them if too close
                        const gap = ptT && ptA ? Math.abs(ptT.y - ptA.y) : 999;
                        const THRESHOLD = 18;

                        // Target label: prefer above; if close push it further up
                        if (ptT && tgtVal !== null) {
                            const yT = gap < THRESHOLD ? ptT.y - 22 : ptT.y - 12;
                            ctx.save();
                            ctx.fillStyle = '#b45309';
                            ctx.font = 'bold 9px "Google Sans Text"';
                            ctx.textAlign = 'center';
                            ctx.fillText(self.formatMB(tgtVal), ptT.x, yT);
                            ctx.restore();
                        }

                        // Actual / run rate label: prefer above; if close push below
                        if (ptA && actVal !== null) {
                            const yA = gap < THRESHOLD ? ptA.y + 18 : ptA.y - 12;
                            const suffix = isRunRate ? ' ✦' : '';
                            ctx.save();
                            ctx.fillStyle = '#1e40af';
                            ctx.font = 'bold 9px "Google Sans Text"';
                            ctx.textAlign = 'center';
                            ctx.fillText(self.formatMB(actVal) + suffix, ptA.x, yA);
                            ctx.restore();
                        }
                    });
                }
            }]
        });
    }

    renderTierCharts() {
        const months = this.dataProcessor.getLastNMonths(2);
        const month  = months[months.length - 1];
        if (!month) return;

        const showRunRate = document.getElementById('ftShowRunRate')?.checked || false;
        const runRateDay  = parseInt(document.getElementById('ftRunRateDay')?.value || '22', 10);

        const focusTeams = this.dataProcessor.teams.filter(t => this.dataProcessor.getTeamTier(t.code) === 'focus');
        const midTeams   = this.dataProcessor.teams.filter(t => this.dataProcessor.getTeamTier(t.code) === 'mid');

        this.buildTierChart('focusTeamChart', focusTeams, month,
            document.getElementById('focusChartTitle'),
            document.getElementById('focusChartBanner'),
            showRunRate, runRateDay);

        this.buildTierChart('midTierChart', midTeams, month,
            document.getElementById('midChartTitle'),
            document.getElementById('midChartBanner'),
            showRunRate, runRateDay);

        document.getElementById('tierChartsSection').style.display = 'block';
        document.getElementById('refreshFocusChart').onclick = () => this.renderTierCharts();
        document.getElementById('refreshMidChart').onclick   = () => this.renderTierCharts();

        this.initRunRateControls();
    }

    renderTable() {
        const lastTwoMonths = this.dataProcessor.getLastNMonths(2);
        
        // Render header
        this.renderTableHeader(lastTwoMonths);
        
        // Render body
        this.renderTableBody(lastTwoMonths);
    }

    renderTableHeader(months) {
        const thead = document.getElementById('focusTeamTableHead');
        
        if (!thead) {
            console.error('ERROR: Element with id "focusTeamTableHead" not found in HTML');
            alert('Dashboard setup error: Missing table header element.');
            return;
        }
        
        // Style the table for rounded corners
        const table = thead.closest('table');
        if (table) {
            table.style.borderRadius = '12px';
            table.style.overflow = 'hidden';
            table.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
        }
        
        thead.innerHTML = '';
        
        // First header row
        const headerRow1 = document.createElement('tr');
        headerRow1.style.backgroundColor = '#1e293b'; // Dark navy to match other dashboards
        headerRow1.style.color = 'white';
        
        const thTeam = document.createElement('th');
        thTeam.textContent = 'Team';
        thTeam.rowSpan = 2;
        thTeam.style.padding = '16px 12px';
        thTeam.style.textAlign = 'left';
        thTeam.style.borderRight = '1px solid rgba(255,255,255,0.1)';
        thTeam.style.fontWeight = '600';
        thTeam.style.borderTopLeftRadius = '12px'; // Top-left corner
        headerRow1.appendChild(thTeam);
        
        const thAgentCode = document.createElement('th');
        thAgentCode.textContent = 'Agent code';
        thAgentCode.rowSpan = 2;
        thAgentCode.style.padding = '16px 12px';
        thAgentCode.style.textAlign = 'left';
        thAgentCode.style.borderRight = '1px solid rgba(255,255,255,0.1)';
        thAgentCode.style.fontWeight = '600';
        headerRow1.appendChild(thAgentCode);
        
        // Month columns
        months.forEach(month => {
            const th = document.createElement('th');
            th.textContent = this.dataProcessor.formatMonthLabel(month);
            th.colSpan = 2;
            th.style.padding = '16px 12px';
            th.style.textAlign = 'center';
            th.style.borderRight = '1px solid rgba(255,255,255,0.1)';
            th.style.fontWeight = '600';
            headerRow1.appendChild(th);
        });
        
        const thGrowth = document.createElement('th');
        thGrowth.textContent = 'Growth';
        thGrowth.rowSpan = 2;
        thGrowth.style.padding = '16px 12px';
        thGrowth.style.textAlign = 'center';
        thGrowth.style.backgroundColor = '#10b981'; // Green accent
        thGrowth.style.color = 'white';
        thGrowth.style.borderRight = '1px solid rgba(255,255,255,0.1)';
        thGrowth.style.fontWeight = '600';
        headerRow1.appendChild(thGrowth);
        
        const thEOY = document.createElement('th');
        thEOY.textContent = 'Total in EOY';
        thEOY.colSpan = 2;
        thEOY.style.padding = '16px 12px';
        thEOY.style.textAlign = 'center';
        thEOY.style.backgroundColor = '#FF6B35'; // Orange accent to match other dashboards
        thEOY.style.color = 'white';
        thEOY.style.fontWeight = '600';
        thEOY.style.borderTopRightRadius = '12px'; // Top-right corner
        headerRow1.appendChild(thEOY);
        
        thead.appendChild(headerRow1);
        
        // Second header row
        const headerRow2 = document.createElement('tr');
        headerRow2.style.backgroundColor = '#1e293b';
        headerRow2.style.color = 'white';
        
        months.forEach(() => {
            const thTarget = document.createElement('th');
            thTarget.textContent = 'TARGET';
            thTarget.style.padding = '12px';
            thTarget.style.textAlign = 'center';
            thTarget.style.borderRight = '1px solid rgba(255,255,255,0.1)';
            thTarget.style.fontSize = '0.75rem';
            thTarget.style.fontWeight = '500';
            thTarget.style.letterSpacing = '0.05em';
            thTarget.style.color = '#94a3b8';
            headerRow2.appendChild(thTarget);
            
            const thActual = document.createElement('th');
            thActual.textContent = 'ACTUAL';
            thActual.style.padding = '12px';
            thActual.style.textAlign = 'center';
            thActual.style.borderRight = '1px solid rgba(255,255,255,0.1)';
            thActual.style.fontSize = '0.75rem';
            thActual.style.fontWeight = '500';
            thActual.style.letterSpacing = '0.05em';
            thActual.style.color = '#94a3b8';
            headerRow2.appendChild(thActual);
        });
        
        const thEOYTarget = document.createElement('th');
        thEOYTarget.textContent = 'TARGET';
        thEOYTarget.style.padding = '12px';
        thEOYTarget.style.textAlign = 'center';
        thEOYTarget.style.backgroundColor = '#FF6B35';
        thEOYTarget.style.color = 'white';
        thEOYTarget.style.borderRight = '1px solid rgba(255,255,255,0.1)';
        thEOYTarget.style.fontSize = '0.75rem';
        thEOYTarget.style.fontWeight = '500';
        thEOYTarget.style.letterSpacing = '0.05em';
        headerRow2.appendChild(thEOYTarget);
        
        const thEOYActual = document.createElement('th');
        thEOYActual.textContent = 'ACTUAL';
        thEOYActual.style.padding = '12px';
        thEOYActual.style.textAlign = 'center';
        thEOYActual.style.backgroundColor = '#FF6B35';
        thEOYActual.style.color = 'white';
        thEOYActual.style.fontSize = '0.75rem';
        thEOYActual.style.fontWeight = '500';
        thEOYActual.style.letterSpacing = '0.05em';
        headerRow2.appendChild(thEOYActual);
        
        thead.appendChild(headerRow2);
    }

    renderTableBody(months) {
        const tbody = document.getElementById('focusTeamTableBody');
        
        if (!tbody) {
            console.error('ERROR: Element with id "focusTeamTableBody" not found in HTML');
            alert('Dashboard setup error: Missing table body element.');
            return;
        }
        
        tbody.innerHTML = '';

        console.log('=== RENDERING FOCUS TEAM TABLE ===');
        console.log('Months to render:', months);

        this.dataProcessor.teams.forEach((team, index) => {
            const row = document.createElement('tr');
            row.style.backgroundColor = index % 2 === 0 ? 'white' : '#f8fafc';
            row.style.borderBottom = '1px solid #e2e8f0';
            
            // Team name with tier badge
            const tdName = document.createElement('td');
            tdName.style.padding = '10px 12px';
            tdName.style.borderRight = '1px solid #e2e8f0';

            const tier = this.dataProcessor.getTeamTier(team.code);
            const isFocus = tier === 'focus';
            const badgeColor  = isFocus ? '#6366f1' : '#f59e0b';
            const badgeBg     = isFocus ? '#ede9fe' : '#fef3c7';
            const badgeLabel  = isFocus ? 'Focus' : 'Mid Tier';

            tdName.innerHTML = `
                <div style="display:flex;align-items:center;gap:0.5rem;">
                    <span style="font-weight:500;color:#475569;">${this.dataProcessor.getTeamDisplayName(team.code)}</span>
                    <span style="font-size:0.68rem;font-weight:700;padding:2px 7px;border-radius:999px;background:${badgeBg};color:${badgeColor};white-space:nowrap;">${badgeLabel}</span>
                </div>`;
            row.appendChild(tdName);
            
            // Agent code
            const tdCode = document.createElement('td');
            tdCode.textContent = team.code;
            tdCode.style.padding = '14px 12px';
            tdCode.style.fontFamily = '"Google Sans Text", monospace';
            tdCode.style.borderRight = '1px solid #e2e8f0';
            tdCode.style.color = '#334155';
            tdCode.style.fontSize = '0.9rem';
            row.appendChild(tdCode);
            
            // Monthly data
            months.forEach(month => {
                const target = this.dataProcessor.getTarget(month, team.code);
                const actual = this.dataProcessor.teamData[team.code]?.[month] || 0;
                const percentage = this.dataProcessor.calculatePercentage(actual, target);
                
                // Target cell
                const tdTarget = document.createElement('td');
                tdTarget.textContent = target ? this.formatNumber(target) : '';
                tdTarget.style.padding = '14px 12px';
                tdTarget.style.textAlign = 'right';
                tdTarget.style.borderRight = '1px solid #e2e8f0';
                tdTarget.style.color = '#64748b';
                tdTarget.style.fontSize = '0.9rem';
                row.appendChild(tdTarget);
                
                // Actual cell with percentage
                const tdActual = document.createElement('td');
                tdActual.style.padding = '14px 12px';
                tdActual.style.textAlign = 'right';
                tdActual.style.borderRight = '1px solid #e2e8f0';
                
                const actualDiv = document.createElement('div');
                actualDiv.textContent = this.formatNumber(actual);
                actualDiv.style.color = '#1e293b';
                actualDiv.style.fontWeight = '600';
                actualDiv.style.fontSize = '0.95rem';
                tdActual.appendChild(actualDiv);
                
                if (target) {
                    const percentDiv = document.createElement('div');
                    percentDiv.textContent = this.formatPercentage(percentage);
                    percentDiv.style.fontSize = '0.75rem';
                    percentDiv.style.marginTop = '4px';
                    
                    if (percentage >= 100) {
                        percentDiv.style.color = '#10b981';
                    } else if (percentage >= 80) {
                        percentDiv.style.color = '#f59e0b';
                    } else {
                        percentDiv.style.color = '#ef4444';
                    }
                    
                    tdActual.appendChild(percentDiv);
                }
                
                row.appendChild(tdActual);
            });
            
            // Growth
            const growth = months.length >= 2 ? 
                this.dataProcessor.calculateGrowth(months[1], months[0], team.code) : null;
            const tdGrowth = document.createElement('td');
            tdGrowth.textContent = this.formatPercentage(growth);
            tdGrowth.style.padding = '14px 12px';
            tdGrowth.style.textAlign = 'center';
            tdGrowth.style.fontWeight = '700';
            tdGrowth.style.fontSize = '0.95rem';
            tdGrowth.style.backgroundColor = '#f0fdf4';
            tdGrowth.style.borderRight = '1px solid #e2e8f0';
            
            if (growth !== null) {
                if (growth > 0) {
                    tdGrowth.style.color = '#10b981';
                } else if (growth < 0) {
                    tdGrowth.style.color = '#ef4444';
                } else {
                    tdGrowth.style.color = '#64748b';
                }
            }
            
            row.appendChild(tdGrowth);
            
            // EOY Target
            const eoyTarget = this.dataProcessor.calculateEOYTarget(team.code);
            const tdEOYTarget = document.createElement('td');
            tdEOYTarget.textContent = eoyTarget ? this.formatNumber(eoyTarget) : '';
            tdEOYTarget.style.padding = '14px 12px';
            tdEOYTarget.style.textAlign = 'right';
            tdEOYTarget.style.backgroundColor = '#fff7ed';
            tdEOYTarget.style.borderRight = '1px solid #fed7aa';
            tdEOYTarget.style.color = '#64748b';
            tdEOYTarget.style.fontSize = '0.9rem';
            row.appendChild(tdEOYTarget);
            
            // EOY Actual
            const eoyActual = this.dataProcessor.calculateEOYTotal(team.code);
            const eoyPercentage = this.dataProcessor.calculatePercentage(eoyActual, eoyTarget);
            const tdEOYActual = document.createElement('td');
            tdEOYActual.style.padding = '14px 12px';
            tdEOYActual.style.textAlign = 'right';
            tdEOYActual.style.backgroundColor = '#fff7ed';
            
            const eoyActualDiv = document.createElement('div');
            eoyActualDiv.textContent = this.formatNumber(eoyActual);
            eoyActualDiv.style.color = '#1e293b';
            eoyActualDiv.style.fontWeight = '700';
            eoyActualDiv.style.fontSize = '0.95rem';
            tdEOYActual.appendChild(eoyActualDiv);
            
            if (eoyTarget) {
                const eoyPercentDiv = document.createElement('div');
                eoyPercentDiv.textContent = this.formatPercentage(eoyPercentage);
                eoyPercentDiv.style.fontSize = '0.75rem';
                eoyPercentDiv.style.marginTop = '4px';
                
                if (eoyPercentage >= 100) {
                    eoyPercentDiv.style.color = '#10b981';
                } else if (eoyPercentage >= 80) {
                    eoyPercentDiv.style.color = '#f59e0b';
                } else {
                    eoyPercentDiv.style.color = '#ef4444';
                }
                
                tdEOYActual.appendChild(eoyPercentDiv);
            }
            
            row.appendChild(tdEOYActual);
            
            tbody.appendChild(row);
        });
    }
}

// ============================================================================
// TARGET MODAL FUNCTIONS
// ============================================================================

function openFocusTeamTargetsModal() {
    const latestMonth = focusTeamDataProcessor.months[focusTeamDataProcessor.months.length - 1];
    if (!latestMonth) {
        alert('Please upload data first');
        return;
    }

    document.getElementById('focusTeamTargetMonth').value = latestMonth;
    
    // Clear existing inputs
    const targetsContainer = document.getElementById('focusTeamTargetsContainer');
    targetsContainer.innerHTML = '';
    
    // Create input fields for each team
    focusTeamDataProcessor.teams.forEach((team, index) => {
        const target = focusTeamDataProcessor.getTarget(latestMonth, team.code);
        
        const formGroup = document.createElement('div');
        formGroup.className = 'form-group';
        
        const label = document.createElement('label');
        label.className = 'form-label';
        label.textContent = `${team.code} - ${team.name || 'N/A'}`;
        label.style.fontSize = '0.9em';
        
        const input = document.createElement('input');
        input.type = 'number';
        input.id = `team${index}Target`;
        input.className = 'form-input';
        input.placeholder = 'e.g., 5000000';
        input.step = '1';
        input.value = target || '';
        input.dataset.teamCode = team.code;
        
        formGroup.appendChild(label);
        formGroup.appendChild(input);
        targetsContainer.appendChild(formGroup);
    });
    
    document.getElementById('focusTeamTargetsModal').style.display = 'flex';
}

function closeFocusTeamTargetsModal() {
    document.getElementById('focusTeamTargetsModal').style.display = 'none';
}

async function saveFocusTeamTargets() {
    const month = document.getElementById('focusTeamTargetMonth').value;
    
    console.log('=== SAVING FOCUS TEAM TARGETS ===');
    console.log('Month:', month);
    
    if (!month) {
        alert('Please select a month');
        return;
    }

    const targets = [];
    const targetsContainer = document.getElementById('focusTeamTargetsContainer');
    const inputs = targetsContainer.querySelectorAll('input[type="number"]');
    
    inputs.forEach(input => {
        const teamCode = input.dataset.teamCode;
        const value = parseFloat(input.value);
        if (teamCode) {
            targets.push({ name: teamCode, value: value });
        }
    });
    
    console.log('Targets to save:', targets);
    
    try {
        for (const target of targets) {
            if (target.value && !isNaN(target.value)) {
                const targetData = {
                    type: 'focus_team',
                    name: target.name,
                    month: month,
                    value: target.value,
                    unit: 'THB'
                };
                console.log('Saving target:', targetData);
                await targetsDB.saveTarget(targetData);
            }
        }
        
        console.log('All targets saved successfully');
        closeFocusTeamTargetsModal();
        
        // Reload targets and re-render the table
        console.log('Reloading targets...');
        await focusTeamDataProcessor.loadTargets();
        console.log('Re-rendering table...');
        focusTeamUI.renderTable();
        
        alert('Focus team targets saved successfully!');
    } catch (error) {
        console.error('Error saving targets:', error);
        alert('Error saving targets. Please try again.');
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

const focusTeamDataProcessor = new FocusTeamDataProcessor();
let focusTeamUI = null;

function initializeFocusTeamDashboard() {
    if (!window.targetsDB) {
        console.log('Waiting for targetsDB...');
        setTimeout(initializeFocusTeamDashboard, 100);
        return;
    }
    
    focusTeamUI = new FocusTeamUI(focusTeamDataProcessor);
    console.log('Focus team dashboard initialized');
    
    // Auto-load data from store
    autoLoadData();
}

// Auto-load data from data store on page load
function autoLoadData() {
    console.log('Focus team dashboard loaded, checking for stored data...');
    
    function checkDataStore() {
        if (!window.dashboardDataStore) {
            console.log('Waiting for data store...');
            setTimeout(checkDataStore, 100);
            return;
        }
        
        console.log('Fetching fresh focus team data from Google Sheets...');
        fetchFocusTeamSheetData();
    }

    checkDataStore();
}

// ============================================================================
// AUTO-FETCH FROM GOOGLE SHEETS
// ============================================================================

const FOCUS_SHEET_ID = '1M51L7xRu_Y8MRO5ziDVZ4pbWtqi0Mxb1-oJ6WyfwKU0';
const FOCUS_GID = '233478706';

function showLoadingBar() {
    var b = document.getElementById('loadingBar');
    if (b) b.classList.add('active');
}
function hideLoadingBar() {
    var b = document.getElementById('loadingBar');
    if (b) b.classList.remove('active');
}

function fetchFocusTeamSheetData() {
    const url = `https://docs.google.com/spreadsheets/d/${FOCUS_SHEET_ID}/export?format=csv&gid=${FOCUS_GID}`;
    document.getElementById('noDataSection').style.display = 'flex';
    document.getElementById('dashboardContent').style.display = 'none';
    showLoadingBar();

    fetch(url)
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
        .then(csv => {
            const result = focusTeamDataProcessor.processData(csv);
            if (!result || result.length === 0) {
                hideLoadingBar();
                document.getElementById('noDataSection').style.display = 'flex';
                document.getElementById('dashboardContent').style.display = 'none';
                return;
            }
            // Render immediately, then re-render with targets
            hideLoadingBar();
            document.getElementById('noDataSection').style.display = 'none';
            document.getElementById('dashboardContent').style.display = 'block';
            focusTeamUI.render();
            console.log('Focus team data fetched and rendered');
            focusTeamDataProcessor.loadTargets().then(() => {
                focusTeamUI.render();
            });
        })
        .catch(err => {
            hideLoadingBar();
            console.error('Focus team sheet fetch failed:', err);
            document.getElementById('noDataSection').style.display = 'flex';
        });
}

// Listen for data updates
window.addEventListener('dashboardDataUpdated', function(event) {
    console.log('ðŸ“Š Focus team data updated, reloading...');
    const allData = event.detail;
    
    if (allData.focusTeam && allData.focusTeam.teams && allData.focusTeam.months && allData.focusTeam.teamList) {
        focusTeamDataProcessor.teamData = allData.focusTeam.teams;
        focusTeamDataProcessor.months = allData.focusTeam.months;
        focusTeamDataProcessor.teams = allData.focusTeam.teamList;
        focusTeamDataProcessor.sortTeams();

        focusTeamDataProcessor.loadTargets().then(() => {
            focusTeamUI.render();
        });
    }
});

// Listen for month changes from parent frame
window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'monthChange' && focusTeamUI) {
        focusTeamUI.render();
    }
});

initializeFocusTeamDashboard();
