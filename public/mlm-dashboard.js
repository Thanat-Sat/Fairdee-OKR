// ============================================================================
// MLM DATA PROCESSING MODULE
// ============================================================================

class MLMDataProcessor {
    constructor() {
        this.rawData = [];
        this.mlmData = {};
        this.months = [];
        this.teams = []; // Will be populated from CSV data
        this.targets = {}; // Store targets
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
        return `${monthNames[parseInt(month) - 1]} ${year}`;
    }

    async loadTargets() {
        console.log('=== LOADING MLM TARGETS FROM FIRESTORE ===');
        if (!window.targetsDB) {
            console.log('Waiting for targetsDB...');
            await new Promise(resolve => setTimeout(resolve, 100));
            return this.loadTargets();
        }

        try {
            console.log('Calling targetsDB.getAllTargets() to avoid index requirement...');
            const result = await targetsDB.getAllTargets();
            console.log('Raw result from Firestore:', result);
            
            if (result.success && result.targets) {
                this.targets = {};
                // Filter for MLM targets only
                const mlmTargets = result.targets.filter(t => t.type === 'mlm');
                console.log(`Found ${mlmTargets.length} MLM targets out of ${result.targets.length} total`);
                
                mlmTargets.forEach(target => {
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

    getTarget(month, teamName) {
        const key = `${month}-${teamName}`;
        return this.targets[key] || null;
    }

    getEffectiveMonth() {
        return (window.getEffectiveMonth ? window.getEffectiveMonth(this.months) : null) || this.months[this.months.length - 1] || null;
    }

    buildMonthKey(year, monthNumber) {
        return `${year}-${String(monthNumber).padStart(2, '0')}`;
    }

    getYearForPeriod(referenceMonth = null) {
        const baseMonth = referenceMonth || this.getEffectiveMonth();
        if (!baseMonth) return new Date().getFullYear();
        return parseInt(baseMonth.split('-')[0], 10);
    }

    getQuarterInfo(referenceMonth = null) {
        const monthStr = referenceMonth || this.getEffectiveMonth();
        if (!monthStr) {
            const year = new Date().getFullYear();
            return {
                quarter: 1,
                year,
                allMonths: [this.buildMonthKey(year, 1), this.buildMonthKey(year, 2), this.buildMonthKey(year, 3)],
                months: []
            };
        }

        const [yearStr, monthStrNum] = monthStr.split('-');
        const year = parseInt(yearStr, 10);
        const monthNum = parseInt(monthStrNum, 10);

        let quarter;
        let startMonth;
        if (monthNum >= 1 && monthNum <= 3) {
            quarter = 1;
            startMonth = 1;
        } else if (monthNum >= 4 && monthNum <= 6) {
            quarter = 2;
            startMonth = 4;
        } else if (monthNum >= 7 && monthNum <= 9) {
            quarter = 3;
            startMonth = 7;
        } else {
            quarter = 4;
            startMonth = 10;
        }

        const allMonths = [0, 1, 2].map(offset => this.buildMonthKey(year, startMonth + offset));
        const months = allMonths.filter(m => this.months.includes(m));
        return { quarter, year, allMonths, months };
    }

    getEOYMonths(referenceMonth = null) {
        const year = this.getYearForPeriod(referenceMonth);
        return Array.from({ length: 12 }, (_, index) => this.buildMonthKey(year, index + 1));
    }

    getLastNMonths(n = 6) {
        if (this.months.length === 0) return [];
        const effective = this.getEffectiveMonth();
        const idx = effective ? this.months.indexOf(effective) : this.months.length - 1;
        const end = idx < 0 ? this.months.length : idx + 1;
        return this.months.slice(Math.max(0, end - n), end);
    }

    calculateMonthTotal(month) {
        let total = 0;
        this.teams.forEach(team => {
            if (this.mlmData[team] && this.mlmData[team][month]) {
                total += this.mlmData[team][month];
            }
        });
        return total;
    }

    getCurrentQuarterInfo() {
        return this.getQuarterInfo();
    }

    calculateQuarterTotal(team, referenceMonth = null) {
        const quarterInfo = this.getQuarterInfo(referenceMonth);
        
        let total = 0;
        quarterInfo.months.forEach(month => {
            if (this.mlmData[team] && this.mlmData[team][month]) {
                total += this.mlmData[team][month];
            }
        });
        return total;
    }

    calculateQuarterTarget(team, referenceMonth = null) {
        const quarterInfo = this.getQuarterInfo(referenceMonth);
        
        let total = 0;
        quarterInfo.allMonths.forEach(month => {
            const target = this.getTarget(month, team);
            if (target) {
                total += target;
            }
        });
        return total || null;
    }

    calculateEOYTotal(team, referenceMonth = null) {
        const year = String(this.getYearForPeriod(referenceMonth) || '');
        if (!year) return 0;

        const yearMonths = this.months.filter(m => m.startsWith(year));
        
        let total = 0;
        yearMonths.forEach(month => {
            if (this.mlmData[team] && this.mlmData[team][month]) {
                total += this.mlmData[team][month];
            }
        });
        return total;
    }

    calculateEOYTarget(team, referenceMonth = null) {
        const yearMonths = this.getEOYMonths(referenceMonth);
        
        let total = 0;
        yearMonths.forEach(month => {
            const target = this.getTarget(month, team);
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
// UI MODULE - MLM
// ============================================================================

class MLMUI {
    constructor(dataProcessor) {
        this.dataProcessor = dataProcessor;
        this.showRunRate = false;
        this.runRateSelections = {
            month: true,
            quarter: false,
            eoy: false
        };
        this.runRateDate = this.getDefaultRunRateDate();
        this._runRateWired = false;
    }

    getDefaultRunRateDate() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    parseInputDate(dateStr) {
        if (!dateStr) return null;
        const parts = dateStr.split('-').map(Number);
        if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
        return new Date(parts[0], parts[1] - 1, parts[2]);
    }

    formatMonthKeyFromDate(date) {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }

    getDaysInMonth(monthStr) {
        const [year, month] = monthStr.split('-').map(Number);
        return new Date(year, month, 0).getDate();
    }

    calcRunRate(actual, elapsedDays, daysInMonth) {
        const day = Math.max(1, Math.min(elapsedDays, daysInMonth));
        return actual * (daysInMonth / day);
    }

    getRunRateDateInfo() {
        const fallbackMonth = this.dataProcessor.getEffectiveMonth();
        const fallbackDate = fallbackMonth ? `${fallbackMonth}-01` : this.getDefaultRunRateDate();
        const date = this.parseInputDate(this.runRateDate) || this.parseInputDate(fallbackDate) || new Date();
        const monthKey = this.formatMonthKeyFromDate(date);
        const dayOfMonth = date.getDate();
        return { date, monthKey, dayOfMonth };
    }

    getRunRateQuarterInfo() {
        const { monthKey } = this.getRunRateDateInfo();
        return this.dataProcessor.getQuarterInfo(monthKey);
    }

    isRunRateEnabled(scope) {
        return this.showRunRate && !!this.runRateSelections[scope];
    }

    getPeriodProjection(team, startDate, endDate, months, currentMonthKey, projectionDate) {
        const actualToDate = months.reduce((sum, month) => {
            if (month < currentMonthKey) {
                return sum + (this.dataProcessor.mlmData[team]?.[month] || 0);
            }
            if (month === currentMonthKey) {
                return sum + (this.dataProcessor.mlmData[team]?.[month] || 0);
            }
            return sum;
        }, 0);

        const totalDays = Math.floor((endDate - startDate) / 86400000) + 1;
        const elapsedUntil = new Date(Math.min(endDate.getTime(), projectionDate.getTime()));
        const elapsedDays = Math.max(1, Math.min(totalDays, Math.floor((elapsedUntil - startDate) / 86400000) + 1));
        return actualToDate * (totalDays / elapsedDays);
    }

    getQuarterDisplay(team) {
        const defaultQuarterInfo = this.dataProcessor.getCurrentQuarterInfo();
        const actual = this.dataProcessor.calculateQuarterTotal(team);

        if (!this.isRunRateEnabled('quarter')) {
            return { actual, quarterInfo: defaultQuarterInfo, isRunRate: false };
        }

        const { date, monthKey } = this.getRunRateDateInfo();
        const quarterInfo = this.dataProcessor.getQuarterInfo(monthKey);
        const startMonth = parseInt(quarterInfo.allMonths[0].split('-')[1], 10);
        const startDate = new Date(quarterInfo.year, startMonth - 1, 1);
        const endDate = new Date(quarterInfo.year, startMonth + 2, 0);
        const projection = this.getPeriodProjection(team, startDate, endDate, quarterInfo.allMonths, monthKey, date);
        return { actual: projection, quarterInfo, isRunRate: true };
    }

    getEOYDisplay(team) {
        const actual = this.dataProcessor.calculateEOYTotal(team);
        if (!this.isRunRateEnabled('eoy')) {
            return { actual, isRunRate: false };
        }

        const { date, monthKey } = this.getRunRateDateInfo();
        const year = date.getFullYear();
        const startDate = new Date(year, 0, 1);
        const endDate = new Date(year, 11, 31);
        const yearMonths = this.dataProcessor.getEOYMonths(monthKey);
        const projection = this.getPeriodProjection(team, startDate, endDate, yearMonths, monthKey, date);
        return { actual: projection, isRunRate: true };
    }

    initRunRateControls() {
        if (this._runRateWired) return;
        this._runRateWired = true;
        const cb = document.getElementById('mlmShowRunRate');
        const inputs = document.getElementById('mlmRunRateInputs');
        const monthInput = document.getElementById('mlmRunRateMonth');
        const quarterInput = document.getElementById('mlmRunRateQuarter');
        const eoyInput = document.getElementById('mlmRunRateEOY');
        const dateInput = document.getElementById('mlmRunRateDate');
        if (!cb) return;
        if (dateInput && !dateInput.value) {
            dateInput.value = this.runRateDate;
        }
        cb.addEventListener('change', () => {
            this.showRunRate = cb.checked;
            inputs.style.display = cb.checked ? 'flex' : 'none';
            this.renderTable();
        });
        const bindSelection = (input, key) => {
            if (!input) return;
            input.checked = !!this.runRateSelections[key];
            input.addEventListener('change', () => {
                this.runRateSelections[key] = input.checked;
                if (this.showRunRate) this.renderTable();
            });
        };
        bindSelection(monthInput, 'month');
        bindSelection(quarterInput, 'quarter');
        bindSelection(eoyInput, 'eoy');
        if (dateInput) {
            const syncDate = () => {
                this.runRateDate = dateInput.value || this.getDefaultRunRateDate();
                if (this.showRunRate) this.renderTable();
            };
            dateInput.addEventListener('change', syncDate);
            dateInput.addEventListener('input', syncDate);
        }
    }

    formatNumber(num) {
        return num.toLocaleString('en-US', { maximumFractionDigits: 0 });
    }

    formatPercentage(num) {
        if (num === null || isNaN(num)) return '';
        return num.toFixed(2) + '%';
    }

    getPercentageClass(percentage) {
        if (percentage === null) return '';
        return percentage >= 100 ? 'positive' : 'negative';
    }

    async render() {
        await this.dataProcessor.loadTargets();
        
        if (this.dataProcessor.months.length === 0 || this.dataProcessor.teams.length === 0) {
            console.log('No data to render');
            document.getElementById('noDataSection').style.display = 'flex';
            document.getElementById('dashboardContent').style.display = 'none';
            return;
        }

        this.initRunRateControls();
        this.renderTable();

        document.getElementById('noDataSection').style.display = 'none';
        document.getElementById('dashboardContent').style.display = 'block';
    }

    renderTable() {
        const lastSixMonths = this.dataProcessor.getLastNMonths(6);
        
        // Render header
        this.renderTableHeader(lastSixMonths);
        
        // Render body
        this.renderTableBody(lastSixMonths);
    }

    renderTableHeader(months) {
        const thead = document.getElementById('mlmTableHead');
        
        if (!thead) {
            console.error('ERROR: Element with id "mlmTableHead" not found in HTML');
            alert('Dashboard setup error: Missing table header element. Please check your HTML file.');
            return;
        }
        
        const headerRow = document.createElement('tr');
        
        // Team column
        const thTeam = document.createElement('th');
        thTeam.className = 'team-header';
        thTeam.textContent = '';
        thTeam.rowSpan = 2;
        headerRow.appendChild(thTeam);
        
        // Row type column (Target/Actual)
        const thRowType = document.createElement('th');
        thRowType.className = 'row-type-header';
        thRowType.textContent = '';
        thRowType.rowSpan = 2;
        headerRow.appendChild(thRowType);
        
        // Month columns
        months.forEach(month => {
            const th = document.createElement('th');
            th.className = 'month-header';
            th.textContent = this.dataProcessor.formatMonthLabel(month);
            headerRow.appendChild(th);
        });
        
        // Q Total column - dynamic based on current quarter
        const quarterInfo = this.isRunRateEnabled('quarter')
            ? this.getRunRateQuarterInfo()
            : this.dataProcessor.getCurrentQuarterInfo();
        const thQ = document.createElement('th');
        thQ.className = 'total-header';
        thQ.textContent = `Total in Q${quarterInfo.quarter}`;
        thQ.rowSpan = 2;
        headerRow.appendChild(thQ);
        
        // EOY Total column
        const thEOY = document.createElement('th');
        thEOY.className = 'total-header';
        thEOY.textContent = 'Total in EOY';
        thEOY.rowSpan = 2;
        headerRow.appendChild(thEOY);
        
        thead.innerHTML = '';
        thead.appendChild(headerRow);
    }

    renderTableBody(months) {
        const tbody = document.getElementById('mlmTableBody');
        
        if (!tbody) {
            console.error('ERROR: Element with id "mlmTableBody" not found in HTML');
            alert('Dashboard setup error: Missing table body element. Please check your HTML file.');
            return;
        }
        
        tbody.innerHTML = '';

        console.log('=== RENDERING MLM TABLE ===');
        console.log('Months to render:', months);
        console.log('All targets in memory:', this.dataProcessor.targets);

        this.dataProcessor.teams.forEach(team => {
            console.log(`\n--- Rendering team: ${team} ---`);
            
            // Target row
            const targetRow = document.createElement('tr');
            targetRow.className = 'target-row';
            
            const tdTeamTarget = document.createElement('td');
            tdTeamTarget.className = 'team-name';
            tdTeamTarget.textContent = team;
            tdTeamTarget.rowSpan = 3;
            targetRow.appendChild(tdTeamTarget);

            const tdLabelTarget = document.createElement('td');
            tdLabelTarget.className = 'row-label';
            tdLabelTarget.textContent = 'Target';
            targetRow.appendChild(tdLabelTarget);
            
            months.forEach(month => {
                const targetValue = this.dataProcessor.getTarget(month, team);
                console.log(`  ${month} - ${team}: ${targetValue}`);
                const td = document.createElement('td');
                td.className = 'data-cell target-cell';
                td.textContent = targetValue ? this.formatNumber(targetValue) : '';
                targetRow.appendChild(td);
            });
            
            const quarterReferenceMonth = this.isRunRateEnabled('quarter')
                ? this.getRunRateDateInfo().monthKey
                : null;
            const quarterTarget = this.dataProcessor.calculateQuarterTarget(team, quarterReferenceMonth);
            const tdQTarget = document.createElement('td');
            tdQTarget.className = 'data-cell target-cell total-cell';
            tdQTarget.textContent = quarterTarget ? this.formatNumber(quarterTarget) : '';
            targetRow.appendChild(tdQTarget);
            
            const eoyReferenceMonth = this.isRunRateEnabled('eoy')
                ? this.getRunRateDateInfo().monthKey
                : null;
            const eoyTarget = this.dataProcessor.calculateEOYTarget(team, eoyReferenceMonth);
            const tdEOYTarget = document.createElement('td');
            tdEOYTarget.className = 'data-cell target-cell total-cell';
            tdEOYTarget.textContent = eoyTarget ? this.formatNumber(eoyTarget) : '';
            targetRow.appendChild(tdEOYTarget);

            tbody.appendChild(targetRow);

            // Actual row
            const actualRow = document.createElement('tr');
            actualRow.className = 'actual-row';

            const tdLabelActual = document.createElement('td');
            tdLabelActual.className = 'row-label';
            tdLabelActual.textContent = this.showRunRate ? 'Actual / Run Rate*' : 'Actual';
            actualRow.appendChild(tdLabelActual);

            const { monthKey: runRateMonthKey, dayOfMonth } = this.getRunRateDateInfo();

            months.forEach(month => {
                const rawValue = this.dataProcessor.mlmData[team]?.[month] || 0;
                const isRunRate = this.isRunRateEnabled('month') && month === runRateMonthKey && months.includes(runRateMonthKey);

                let displayValue = rawValue;
                if (isRunRate) {
                    const daysInMonth = this.getDaysInMonth(month);
                    displayValue = this.calcRunRate(rawValue, dayOfMonth, daysInMonth);
                }

                const td = document.createElement('td');
                td.className = 'data-cell actual-cell';
                if (isRunRate) {
                    td.style.background = '#fffbeb';
                    td.style.color = '#92400e';
                    td.style.fontWeight = '700';
                }
                td.textContent = this.formatNumber(displayValue);
                actualRow.appendChild(td);
            });
            
            const quarterDisplay = this.getQuarterDisplay(team);
            const tdQActual = document.createElement('td');
            tdQActual.className = 'data-cell actual-cell total-cell';
            if (quarterDisplay.isRunRate) {
                tdQActual.style.background = '#fffbeb';
                tdQActual.style.color = '#92400e';
                tdQActual.style.fontWeight = '700';
                tdQActual.title = 'Based on quarter run rate projection';
            }
            tdQActual.textContent = this.formatNumber(quarterDisplay.actual);
            actualRow.appendChild(tdQActual);
            
            const eoyDisplay = this.getEOYDisplay(team);
            const tdEOYActual = document.createElement('td');
            tdEOYActual.className = 'data-cell actual-cell total-cell';
            if (eoyDisplay.isRunRate) {
                tdEOYActual.style.background = '#fffbeb';
                tdEOYActual.style.color = '#92400e';
                tdEOYActual.style.fontWeight = '700';
                tdEOYActual.title = 'Based on EOY run rate projection';
            }
            tdEOYActual.textContent = this.formatNumber(eoyDisplay.actual);
            actualRow.appendChild(tdEOYActual);

            tbody.appendChild(actualRow);

            // Percentage row
            const percentRow = document.createElement('tr');
            percentRow.className = 'percent-row';
            
            const tdLabelPercent = document.createElement('td');
            tdLabelPercent.className = 'row-label';
            tdLabelPercent.textContent = '';
            percentRow.appendChild(tdLabelPercent);
            
            months.forEach(month => {
                const rawActual = this.dataProcessor.mlmData[team]?.[month] || 0;
                const isRunRate = this.isRunRateEnabled('month') && month === runRateMonthKey && months.includes(runRateMonthKey);

                let actual = rawActual;
                if (isRunRate) {
                    const daysInMonth = this.getDaysInMonth(month);
                    actual = this.calcRunRate(rawActual, dayOfMonth, daysInMonth);
                }

                const target = this.dataProcessor.getTarget(month, team);
                const percentage = this.dataProcessor.calculatePercentage(actual, target);

                const td = document.createElement('td');
                const percentClass = this.getPercentageClass(percentage);
                td.className = `data-cell percent-cell ${percentClass}`;
                if (isRunRate) td.title = 'Based on run rate projection';
                td.textContent = this.formatPercentage(percentage);
                percentRow.appendChild(td);
            });
            
            const quarterActual = quarterDisplay.actual;
            const quarterTargetForPercent = this.dataProcessor.calculateQuarterTarget(team, quarterReferenceMonth);
            const quarterPercentage = this.dataProcessor.calculatePercentage(quarterActual, quarterTargetForPercent);
            const quarterPercentClass = this.getPercentageClass(quarterPercentage);
            const tdQPercent = document.createElement('td');
            tdQPercent.className = `data-cell percent-cell total-cell ${quarterPercentClass}`;
            if (quarterDisplay.isRunRate) tdQPercent.title = 'Based on quarter run rate projection';
            tdQPercent.textContent = this.formatPercentage(quarterPercentage);
            percentRow.appendChild(tdQPercent);
            
            const eoyActual = eoyDisplay.actual;
            const eoyTargetForPercent = this.dataProcessor.calculateEOYTarget(team, eoyReferenceMonth);
            const eoyPercentage = this.dataProcessor.calculatePercentage(eoyActual, eoyTargetForPercent);
            const eoyPercentClass = this.getPercentageClass(eoyPercentage);
            const tdEOYPercent = document.createElement('td');
            tdEOYPercent.className = `data-cell percent-cell total-cell ${eoyPercentClass}`;
            if (eoyDisplay.isRunRate) tdEOYPercent.title = 'Based on EOY run rate projection';
            tdEOYPercent.textContent = this.formatPercentage(eoyPercentage);
            percentRow.appendChild(tdEOYPercent);

            tbody.appendChild(percentRow);
        });
    }
}

// ============================================================================
// TARGET MODAL FUNCTIONS
// ============================================================================

function openMLMTargetsModal() {
    const latestMonth = mlmDataProcessor.months[mlmDataProcessor.months.length - 1];
    if (!latestMonth) {
        alert('Please upload data first');
        return;
    }

    document.getElementById('mlmTargetMonth').value = latestMonth;
    
    // Clear existing inputs
    const targetsContainer = document.getElementById('mlmTargetsContainer');
    targetsContainer.innerHTML = '';
    
    // Create input fields for each team
    mlmDataProcessor.teams.forEach((team, index) => {
        const target = mlmDataProcessor.getTarget(latestMonth, team);
        
        const formGroup = document.createElement('div');
        formGroup.className = 'form-group';
        
        const label = document.createElement('label');
        label.className = 'form-label';
        label.textContent = team;
        
        const input = document.createElement('input');
        input.type = 'number';
        input.id = `team${index}Target`;
        input.className = 'form-input';
        input.placeholder = 'e.g., 5000000';
        input.step = '1';
        input.value = target || '';
        input.dataset.teamName = team;
        
        formGroup.appendChild(label);
        formGroup.appendChild(input);
        targetsContainer.appendChild(formGroup);
    });
    
    document.getElementById('mlmTargetsModal').style.display = 'flex';
}

function closeMLMTargetsModal() {
    document.getElementById('mlmTargetsModal').style.display = 'none';
}

async function saveMLMTargets() {
    const month = document.getElementById('mlmTargetMonth').value;
    
    console.log('=== SAVING MLM TARGETS ===');
    console.log('Month:', month);
    
    if (!month) {
        alert('Please select a month');
        return;
    }

    const targets = [];
    const targetsContainer = document.getElementById('mlmTargetsContainer');
    const inputs = targetsContainer.querySelectorAll('input[type="number"]');
    
    inputs.forEach(input => {
        const teamName = input.dataset.teamName;
        const value = parseFloat(input.value);
        if (teamName) {
            targets.push({ name: teamName, value: value });
        }
    });
    
    console.log('Targets to save:', targets);
    
    try {
        for (const target of targets) {
            if (target.value && !isNaN(target.value)) {
                const targetData = {
                    type: 'mlm',
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
        closeMLMTargetsModal();
        
        // Reload targets and re-render the table
        console.log('Reloading targets...');
        await mlmDataProcessor.loadTargets();
        console.log('Re-rendering table...');
        mlmUI.renderTable();
        
        alert('MLM targets saved successfully!');
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

const mlmDataProcessor = new MLMDataProcessor();
let mlmUI = null;

function initializeMLMDashboard() {
    if (!window.targetsDB) {
        console.log('Waiting for targetsDB...');
        setTimeout(initializeMLMDashboard, 100);
        return;
    }
    
    mlmUI = new MLMUI(mlmDataProcessor);
    console.log('MLM dashboard initialized');
    
    // Auto-load data from store
    autoLoadData();
}

// Auto-load data from data store on page load
function autoLoadData() {
    console.log('MLM dashboard loaded, checking for stored data...');
    
    function checkDataStore() {
        if (!window.dashboardDataStore) {
            console.log('Waiting for data store...');
            setTimeout(checkDataStore, 100);
            return;
        }
        
        const allData = window.dashboardDataStore.getAllData();
        
        if (allData.mlm && allData.mlm.teams && allData.mlm.months) {
            console.log('âœ“ Loading MLM data from storage');
            
            // Load data into processor
            mlmDataProcessor.mlmData = allData.mlm.teams;
            mlmDataProcessor.months = allData.mlm.months;
            
            // Extract teams from the loaded data
            mlmDataProcessor.teams = Object.keys(allData.mlm.teams).sort();
            
            // Render immediately, then re-render with targets when ready
            mlmUI.render();
            mlmDataProcessor.loadTargets().then(() => {
                mlmUI.render();
            });
                } else {
            console.log('No MLM data in storage — fetching from Google Sheets...');
            fetchMLMSheetData();
        }
    }

    checkDataStore();
}

// ============================================================================
// AUTO-FETCH FROM GOOGLE SHEETS
// ============================================================================

const MLM_SHEET_ID = '1M51L7xRu_Y8MRO5ziDVZ4pbWtqi0Mxb1-oJ6WyfwKU0';
const MLM_GID = '233478706';

function showLoadingBar() {
    var b = document.getElementById('loadingBar');
    if (b) b.classList.add('active');
}
function hideLoadingBar() {
    var b = document.getElementById('loadingBar');
    if (b) b.classList.remove('active');
}

function fetchMLMSheetData() {
    const url = `https://docs.google.com/spreadsheets/d/${MLM_SHEET_ID}/export?format=csv&gid=${MLM_GID}`;
    document.getElementById('noDataSection').style.display = 'flex';
    document.getElementById('dashboardContent').style.display = 'none';
    showLoadingBar();

    fetch(url)
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
        .then(csv => processMLMCSV(csv))
        .catch(err => {
            hideLoadingBar();
            console.error('MLM sheet fetch failed:', err);
            document.getElementById('noDataSection').style.display = 'flex';
        });
}

function _parseCSVRowMLM(line) {
    const vals = [];
    let cur = '', inQ = false;
    for (const ch of line) {
        if (ch === '"') { inQ = !inQ; }
        else if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = ''; }
        else { cur += ch; }
    }
    vals.push(cur.trim());
    return vals;
}

function processMLMCSV(csvText) {
    const nl = String.fromCharCode(10);
    const lines = csvText.split(nl).filter(l => l.trim());
    if (lines.length < 2) { console.warn('MLM CSV empty'); return; }

    const headers = _parseCSVRowMLM(lines[0]).map(h => h.toLowerCase().trim());
    let teamNameIdx = -1, monthIdx = -1, gwpIdx = -1;
    headers.forEach((h, i) => {
        if (h === 'team_name' || h === 'teamname') teamNameIdx = i;
        if (h === 'month') monthIdx = i;
        if (h === 'gwp') gwpIdx = i;
    });

    if (monthIdx === -1 || gwpIdx === -1) {
        console.error('MLM CSV missing required columns. Headers:', headers);
        hideLoadingBar();
        return;
    }

    const mlmData = {};
    const monthSet = new Set();

    for (let i = 1; i < lines.length; i++) {
        const vals = _parseCSVRowMLM(lines[i]);
        const teamName = (teamNameIdx >= 0 ? vals[teamNameIdx] || '' : 'Unknown').trim();
        const monthRaw = (vals[monthIdx] || '').trim();
        const gwp = parseFloat((vals[gwpIdx] || '0').replace(/[^0-9.-]/g, '')) || 0;
        if (!teamName || !monthRaw) continue;
        const month = mlmDataProcessor.parseMonth(monthRaw);
        if (!month) continue;
        monthSet.add(month);
        if (!mlmData[teamName]) mlmData[teamName] = {};
        mlmData[teamName][month] = (mlmData[teamName][month] || 0) + gwp;
    }

    const months = Array.from(monthSet).sort();
    if (months.length === 0) { console.warn('MLM CSV: no valid rows'); hideLoadingBar(); return; }

    window.dashboardDataStore.updateMLMData(mlmData, months);
    mlmDataProcessor.mlmData = mlmData;
    mlmDataProcessor.months = months;
    mlmDataProcessor.teams = Object.keys(mlmData).sort();
    console.log('MLM data fetched:', mlmDataProcessor.teams.length, 'teams,', months.length, 'months');

    // Render immediately so data is visible, then re-render with targets when ready
    hideLoadingBar();
    document.getElementById('noDataSection').style.display = 'none';
    document.getElementById('dashboardContent').style.display = 'block';
    mlmUI.render();

    mlmDataProcessor.loadTargets().then(() => {
        mlmUI.render();
    });
}

// Listen for data updates
window.addEventListener('dashboardDataUpdated', function(event) {
    console.log('ðŸ“Š MLM data updated, reloading...');
    const allData = event.detail;
    
    if (allData.mlm && allData.mlm.teams && allData.mlm.months) {
        mlmDataProcessor.mlmData = allData.mlm.teams;
        mlmDataProcessor.months = allData.mlm.months;
        mlmDataProcessor.teams = Object.keys(allData.mlm.teams).sort();
        
        mlmDataProcessor.loadTargets().then(() => {
            mlmUI.render();
        });
    }
});

// Listen for month changes from parent frame
window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'monthChange' && mlmUI) {
        mlmUI.render();
    }
});

initializeMLMDashboard();
