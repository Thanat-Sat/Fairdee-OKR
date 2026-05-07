// ============================================================================
// TARGET MANAGEMENT UI
// ============================================================================

// Check if loaded in iframe and hide header
if (window.self !== window.top) {
    const header = document.getElementById('dashboardHeader');
    if (header) {
        header.style.display = 'none';
    }
}

// DOM Elements
const targetsTableBody = document.getElementById('targetsTableBody');
const targetModal = document.getElementById('targetModal');
const targetForm = document.getElementById('targetForm');
const addTargetBtn = document.getElementById('addTargetBtn');
const closeModal = document.getElementById('closeModal');
const cancelBtn = document.getElementById('cancelBtn');
const modalTitle = document.getElementById('modalTitle');
const saveTargetBtn = document.getElementById('saveTargetBtn');

// Filter elements
const filterType = document.getElementById('filterType');
const filterMonth = document.getElementById('filterMonth');
const clearFilters = document.getElementById('clearFilters');

let allTargets = [];
let editingTargetId = null;

// ============================================================================
// LOAD AND DISPLAY TARGETS
// ============================================================================

function formatNumber(num) {
    const value = Number(num);
    if (!Number.isFinite(value)) return '—';
    return new Intl.NumberFormat('en-US', {
        maximumFractionDigits: 2
    }).format(value);
}

function formatDate(timestamp) {
    if (!timestamp) return '—';
    
    // Handle Firestore Timestamp objects
    let date;
    if (timestamp && typeof timestamp.toDate === 'function') {
        date = timestamp.toDate();
    } else if (timestamp && timestamp.seconds) {
        date = new Date(timestamp.seconds * 1000);
    } else {
        date = new Date(timestamp);
    }
    
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatMonth(monthStr) {
    if (!monthStr) return '—';
    const [year, month] = monthStr.split('-');
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                       'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${monthNames[parseInt(month) - 1]} ${year}`;
}

function getTypeBadgeClass(type) {
    const typeMap = {
        'channel': 'channel',
        'mlm_agent': 'mlm_agent',
        'regional': 'regional',
        'agency': 'agency'
    };
    return typeMap[type] || 'channel';
}

function getTypeLabel(type) {
    const labels = {
        'channel': 'Channel',
        'mlm_agent': 'MLM Agent',
        'regional': 'Regional',
        'agency': 'Agency'
    };
    return labels[type] || type;
}

async function loadTargets() {
    // Wait for targetsDB to be available
    if (!window.targetsDB) {
        console.log('Waiting for targetsDB to initialize...');
        setTimeout(loadTargets, 100);
        return;
    }
    
    const result = await targetsDB.getAllTargets();
    
    if (result.success) {
        allTargets = result.targets;
        displayTargets(allTargets);
    } else {
        targetsTableBody.innerHTML = `
            <tr>
                <td colspan="8" class="no-data">Error loading targets: ${result.error}</td>
            </tr>
        `;
    }
}

function displayTargets(targets) {
    if (targets.length === 0) {
        targetsTableBody.innerHTML = `
            <tr>
                <td colspan="8" class="no-data">No targets found. Click "Add New Target" to create one.</td>
            </tr>
        `;
        return;
    }

    targetsTableBody.innerHTML = targets.map(target => `
        <tr>
            <td>
                <span class="type-badge ${getTypeBadgeClass(target.type)}">
                    ${getTypeLabel(target.type)}
                </span>
            </td>
            <td><strong>${target.name || '—'}</strong></td>
            <td>${formatMonth(target.month)}</td>
            <td>${formatNumber(target.value)}</td>
            <td>${target.unit || 'THB'}</td>
            <td>${target.updatedByEmail || '—'}</td>
            <td>${formatDate(target.updatedAt)}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn-edit" onclick="editTarget('${target.id}')">Edit</button>
                    <button class="btn-delete" onclick="deleteTarget('${target.id}')">Delete</button>
                </div>
            </td>
        </tr>
    `).join('');
}

// ============================================================================
// FILTER FUNCTIONALITY
// ============================================================================

function applyFilters() {
    const typeFilter = filterType.value;
    const monthFilter = filterMonth.value;
    
    let filtered = allTargets;
    
    if (typeFilter) {
        filtered = filtered.filter(t => t.type === typeFilter);
    }
    
    if (monthFilter) {
        filtered = filtered.filter(t => t.month === monthFilter);
    }
    
    displayTargets(filtered);
}

filterType.addEventListener('change', applyFilters);
filterMonth.addEventListener('change', applyFilters);

clearFilters.addEventListener('click', () => {
    filterType.value = '';
    filterMonth.value = '';
    displayTargets(allTargets);
});

// ============================================================================
// MODAL FUNCTIONALITY
// ============================================================================

function openModal(isEdit = false, target = null) {
    editingTargetId = target ? target.id : null;
    
    if (isEdit && target) {
        modalTitle.textContent = 'Edit Target';
        document.getElementById('targetType').value = target.type || '';
        document.getElementById('targetName').value = target.name || '';
        document.getElementById('targetMonth').value = target.month || '';
        document.getElementById('targetValue').value = target.value || '';
        document.getElementById('targetUnit').value = target.unit || 'THB';
        document.getElementById('targetNotes').value = target.notes || '';
        document.getElementById('targetId').value = target.id || '';
        saveTargetBtn.textContent = 'Update Target';
    } else {
        modalTitle.textContent = 'Add New Target';
        targetForm.reset();
        editingTargetId = null;
        saveTargetBtn.textContent = 'Save Target';
    }
    
    targetModal.style.display = 'flex';
}

function closeModalFunc() {
    targetModal.style.display = 'none';
    targetForm.reset();
    editingTargetId = null;
}

addTargetBtn.addEventListener('click', () => openModal(false));
closeModal.addEventListener('click', closeModalFunc);
cancelBtn.addEventListener('click', closeModalFunc);

// Close modal when clicking outside
targetModal.addEventListener('click', (e) => {
    if (e.target === targetModal) {
        closeModalFunc();
    }
});

// ============================================================================
// SAVE TARGET
// ============================================================================

targetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const targetData = {
        type: document.getElementById('targetType').value,
        name: document.getElementById('targetName').value,
        month: document.getElementById('targetMonth').value,
        value: parseFloat(document.getElementById('targetValue').value),
        unit: document.getElementById('targetUnit').value,
        notes: document.getElementById('targetNotes').value
    };
    
    if (editingTargetId) {
        targetData.id = editingTargetId;
    }
    
    saveTargetBtn.disabled = true;
    saveTargetBtn.textContent = 'Saving...';
    
    const result = await targetsDB.saveTarget(targetData);
    
    if (result.success) {
        closeModalFunc();
        await loadTargets();
    } else {
        alert('Error saving target: ' + result.error);
    }
    
    saveTargetBtn.disabled = false;
    saveTargetBtn.textContent = editingTargetId ? 'Update Target' : 'Save Target';
});

// ============================================================================
// EDIT AND DELETE
// ============================================================================

window.editTarget = async function(targetId) {
    const target = allTargets.find(t => t.id === targetId);
    if (target) {
        openModal(true, target);
    }
};

window.deleteTarget = async function(targetId) {
    if (!confirm('Are you sure you want to delete this target?')) {
        return;
    }
    
    const result = await targetsDB.deleteTarget(targetId);
    
    if (result.success) {
        await loadTargets();
    } else {
        alert('Error deleting target: ' + result.error);
    }
};

// ============================================================================
// CSV IMPORT
// ============================================================================

const importModal       = document.getElementById('importModal');
const csvDropZone       = document.getElementById('csvDropZone');
const csvFileInput      = document.getElementById('csvFileInput');
const csvPreviewSection = document.getElementById('csvPreviewSection');
const csvPreviewBody    = document.getElementById('csvPreviewBody');
const csvPreviewCount   = document.getElementById('csvPreviewCount');
const csvPreviewError   = document.getElementById('csvPreviewError');
const confirmImportBtn  = document.getElementById('confirmImportBtn');

let parsedCsvRows = [];

const VALID_TYPES = ['channel', 'mlm_agent', 'regional', 'agency', 'focus_team'];

document.getElementById('importCsvBtn').addEventListener('click', () => {
    parsedCsvRows = [];
    csvPreviewSection.style.display = 'none';
    csvFileInput.value = '';
    importModal.style.display = 'flex';
});

document.getElementById('closeImportModal').addEventListener('click', () => importModal.style.display = 'none');
document.getElementById('cancelImportBtn').addEventListener('click', () => importModal.style.display = 'none');
importModal.addEventListener('click', e => { if (e.target === importModal) importModal.style.display = 'none'; });

// Drop zone click opens file picker
csvDropZone.addEventListener('click', () => csvFileInput.click());
csvDropZone.addEventListener('dragover', e => { e.preventDefault(); csvDropZone.style.borderColor = '#6366f1'; });
csvDropZone.addEventListener('dragleave', () => { csvDropZone.style.borderColor = '#cbd5e1'; });
csvDropZone.addEventListener('drop', e => {
    e.preventDefault();
    csvDropZone.style.borderColor = '#cbd5e1';
    if (e.dataTransfer.files[0]) handleCsvFile(e.dataTransfer.files[0]);
});
csvFileInput.addEventListener('change', e => { if (e.target.files[0]) handleCsvFile(e.target.files[0]); });

function parseCsvLine(line) {
    const values = [];
    let cur = '', inQ = false;
    for (const ch of line) {
        if (ch === '"') { inQ = !inQ; }
        else if (ch === ',' && !inQ) { values.push(cur.trim()); cur = ''; }
        else { cur += ch; }
    }
    values.push(cur.trim());
    return values;
}

function handleCsvFile(file) {
    const reader = new FileReader();
    reader.onload = e => {
        const lines = e.target.result.trim().split('\n').filter(l => l.trim());
        if (lines.length < 2) { csvPreviewError.textContent = 'CSV has no data rows.'; return; }

        const header = parseCsvLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z_]/g, ''));
        const idxType  = header.indexOf('type');
        const idxName  = header.indexOf('name');
        const idxMonth = header.indexOf('month');
        const idxValue = header.indexOf('value');
        const idxUnit  = header.findIndex(h => h.includes('unit'));
        const idxNotes = header.findIndex(h => h.includes('note'));

        if (idxType < 0 || idxName < 0 || idxMonth < 0 || idxValue < 0) {
            csvPreviewError.textContent = 'Missing required columns: type, name, month, value';
            csvPreviewSection.style.display = 'none';
            return;
        }

        parsedCsvRows = [];
        let errorCount = 0;

        for (let i = 1; i < lines.length; i++) {
            const cols  = parseCsvLine(lines[i]);
            const type  = cols[idxType]  || '';
            const name  = cols[idxName]  || '';
            const month = cols[idxMonth] || '';
            const value = parseFloat(cols[idxValue]);
            const unit  = (idxUnit  >= 0 ? cols[idxUnit]  : '') || 'THB';
            const notes = (idxNotes >= 0 ? cols[idxNotes] : '') || '';

            const errors = [];
            if (!VALID_TYPES.includes(type)) errors.push(`invalid type "${type}"`);
            if (!name)                       errors.push('missing name');
            if (!/^\d{4}-\d{2}$/.test(month)) errors.push('month must be YYYY-MM');
            if (isNaN(value))                errors.push('invalid value');

            if (errors.length) errorCount++;
            parsedCsvRows.push({ type, name, month, value, unit, notes, errors });
        }

        // Render preview table
        csvPreviewBody.innerHTML = parsedCsvRows.map((row, i) => {
            const ok = row.errors.length === 0;
            const bg = ok ? '' : 'background:#fff1f2;';
            return `<tr style="${bg}">
                <td style="padding:0.4rem 0.75rem;border-bottom:1px solid #f1f5f9;">${row.type}</td>
                <td style="padding:0.4rem 0.75rem;border-bottom:1px solid #f1f5f9;">${row.name}</td>
                <td style="padding:0.4rem 0.75rem;border-bottom:1px solid #f1f5f9;">${row.month}</td>
                <td style="padding:0.4rem 0.75rem;border-bottom:1px solid #f1f5f9;text-align:right;font-family:'Google Sans Text',monospace;">${isNaN(row.value) ? '—' : row.value.toLocaleString()}</td>
                <td style="padding:0.4rem 0.75rem;border-bottom:1px solid #f1f5f9;">${row.unit}</td>
                <td style="padding:0.4rem 0.75rem;border-bottom:1px solid #f1f5f9;color:#64748b;">${row.notes}</td>
                <td style="padding:0.4rem 0.75rem;border-bottom:1px solid #f1f5f9;text-align:center;">
                    ${ok ? '<span style="color:#059669;font-weight:600;">✓ OK</span>'
                         : `<span style="color:#dc2626;font-size:0.72rem;" title="${row.errors.join(', ')}">✗ ${row.errors[0]}</span>`}
                </td>
            </tr>`;
        }).join('');

        const validCount = parsedCsvRows.filter(r => r.errors.length === 0).length;
        csvPreviewCount.textContent = `${parsedCsvRows.length} rows parsed — ${validCount} valid, ${errorCount} with errors`;
        csvPreviewError.textContent = '';
        confirmImportBtn.textContent = `Import ${validCount} rows`;
        confirmImportBtn.disabled = validCount === 0;
        csvPreviewSection.style.display = 'block';
    };
    reader.readAsText(file);
}

confirmImportBtn.addEventListener('click', async () => {
    const validRows = parsedCsvRows.filter(r => r.errors.length === 0);
    if (validRows.length === 0) return;

    confirmImportBtn.disabled = true;
    confirmImportBtn.textContent = 'Importing...';

    let created = 0, updated = 0, failed = 0;
    for (const row of validRows) {
        // Find existing target with same type + name + month → overwrite it
        const existing = allTargets.find(t =>
            t.type === row.type && t.name === row.name && t.month === row.month
        );

        const result = await targetsDB.saveTarget({
            ...(existing ? { id: existing.id } : {}),
            type: row.type, name: row.name, month: row.month,
            value: row.value, unit: row.unit, notes: row.notes
        });

        if (result.success) { existing ? updated++ : created++; }
        else { failed++; }
    }

    importModal.style.display = 'none';
    await loadTargets();
    alert(`Import complete: ${created} created, ${updated} overwritten${failed ? `, ${failed} failed` : ''}.`);
    confirmImportBtn.disabled = false;
});

// Template download
document.getElementById('downloadTemplateBtn').addEventListener('click', () => {
    const csv = [
        'type,name,month,value,unit,notes',
        'channel,Team Agent,2026-04,5000000,THB,optional note',
        'channel,IG,2026-04,3000000,THB,',
        'mlm_agent,FM-19134,2026-04,1000000,THB,',
        'regional,North Region,2026-04,20000000,THB,',
        'agency,Agency A,2026-04,8000000,THB,',
        'focus_team,FM-19867,2026-04,24400000,THB,ทรงวุฒิ',
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'targets_template.csv';
    a.click();
});

// ============================================================================
// INITIALIZATION - Wait for Firebase to be ready
// ============================================================================

function initializeTargetsDashboard() {
    if (!window.targetsDB) {
        console.log('Waiting for Firebase to initialize...');
        setTimeout(initializeTargetsDashboard, 100);
        return;
    }
    
    console.log('Firebase ready, setting up real-time listener...');
    
    // Set up real-time updates
    targetsDB.onTargetsChanged((targets) => {
        allTargets = targets;
        applyFilters();
    });
    
    // Initial load
    loadTargets();
}

// Start initialization
initializeTargetsDashboard();
