// ============================================================================
// FOCUS TEAM DATA PROCESSING MODULE (for Upload Center)
// ============================================================================

class FocusTeamDataProcessor {
    constructor() {
        this.rawData = [];
        this.teamData = {};
        this.months = [];
        this.teams = []; // Team anchor codes with names
        
        // Mapping of team anchor codes to Thai names
        this.teamNames = {
            'FM-19867': 'ทรงวุฒิ',
            'FM-19729': 'Jack',
            'FM-19710': 'ถาวร',
            'FM-21511': 'ตาล',
            'FM-23437': 'คนอง',
            'FM-19134': 'ประวิทย์',
            'FM-23277': 'ปัน',
            'FM-19192': 'เมธิชัย',
            'FM-19119': 'คมกฤษณ์',
            'FM-42800': 'บ๊วย',
            'FM-28595': 'พิมพาภรณ์',
            'FM-21461': 'ธนพร',
            'FM-23332': 'ดิน',
            'FM-20898': 'บิ๊ก'
        };
    }

    parseCSV(csvText) {
        const lines = csvText.trim().split('\n');
        if (lines.length < 2) return [];
        
        // Parse header to find column indices
        const header = this.parseCSVLine(lines[0]);
        const anchorCodeIdx = header.indexOf('team_anchor_code');
        const agentRegionIdx = header.indexOf('agent_region');
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
            .replace(/["฿$,\s]/g, '')
            .replace(/[^\d.-]/g, '');
        return parseFloat(cleanValue) || 0;
    }

    parseMonth(monthStr) {
        // Already in YYYY-MM format
        if (monthStr.match(/^\d{4}-\d{2}$/)) {
            return monthStr;
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

    process(csvText) {
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
            if (anchorCode && !teamsMap.has(anchorCode)) {
                // Use Thai name from mapping, fallback to region name
                const thaiName = this.teamNames[anchorCode] || row.agentName || anchorCode;
                teamsMap.set(anchorCode, thaiName);
            }
        });
        
        this.teams = Array.from(teamsMap.entries())
            .map(([code, name]) => ({ code, name }))
            .sort((a, b) => a.code.localeCompare(b.code));
        
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

        return { data: this.teamData, months: this.months, teamList: this.teams };
    }
}