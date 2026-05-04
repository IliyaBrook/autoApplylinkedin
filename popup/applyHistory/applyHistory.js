// ============================================================================
// Apply-history viewer
// ----------------------------------------------------------------------------
// Reads `applyHistory` from chrome.storage.local and renders it as a sortable,
// filterable table. "Clear all" wipes the storage key after a confirm prompt.
// Each entry shape (see content/utils.js → recordApplyHistoryEntry):
//   { timestamp, jobId, title, companyName, url, applied, reason, description }
// ============================================================================

const REASON_LABELS = {
	applied:           'Applied',
	alreadyApplied:    'Already applied',
	external:          'External apply',
	noEasyApply:       'No Easy Apply',
	sduiNotSupported:  'SDUI not supported',
	titleSkip:         'Title Must Skip',
	titleFilterMissing:'Title Must Contain',
	badWord:           'Bad word in description',
	noTitle:           'No title',
	noClickTarget:     'No click target',
	clickFailed:       'Click failed',
	detailsNotLoaded:  'Details did not load',
	limitReached:      'Daily limit reached',
	error:             'Error',
	other:             'Other',
};

const $ = (sel) => document.querySelector(sel);

const els = {
	tbody:        $('#history-tbody'),
	empty:        $('#empty-state'),
	statTotal:    $('#stat-total'),
	statApplied:  $('#stat-applied'),
	statSkipped:  $('#stat-skipped'),
	statError:    $('#stat-error'),
	filterStatus: $('#filter-status'),
	filterReason: $('#filter-reason'),
	search:       $('#search-input'),
	clearAllBtn:  $('#clear-all'),
	exportBtn:    $('#export-csv'),
	confirm:      $('#confirm-overlay'),
	confirmYes:   $('#confirm-yes'),
	confirmNo:    $('#confirm-no'),
};

let allEntries = [];

function fmtTime(ts) {
	if (!ts) return '';
	const d = new Date(ts);
	const pad = (n) => String(n).padStart(2, '0');
	return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function reasonPill(reason) {
	const label = REASON_LABELS[reason] || reason || '—';
	const cls = `reason-pill reason-${reason || 'other'}`;
	const span = document.createElement('span');
	span.className = cls;
	span.textContent = label;
	return span;
}

function appliedBadge(applied) {
	const span = document.createElement('span');
	span.className = `applied-badge ${applied ? 'applied-yes' : 'applied-no'}`;
	span.textContent = applied ? 'YES' : 'NO';
	return span;
}

function buildJobUrl(entry) {
	if (entry.url) return entry.url;
	if (entry.jobId) return `https://www.linkedin.com/jobs/view/${entry.jobId}/`;
	return '';
}

function renderTable(entries) {
	els.tbody.innerHTML = '';
	if (entries.length === 0) {
		els.empty.classList.remove('hidden');
		return;
	}
	els.empty.classList.add('hidden');

	const frag = document.createDocumentFragment();
	for (const entry of entries) {
		const tr = document.createElement('tr');

		// Time
		const tdTime = document.createElement('td');
		tdTime.className = 'col-time';
		tdTime.textContent = fmtTime(entry.timestamp);
		tr.appendChild(tdTime);

		// Title
		const tdTitle = document.createElement('td');
		tdTitle.className = 'col-title';
		const strong = document.createElement('strong');
		strong.textContent = entry.title || '—';
		tdTitle.appendChild(strong);
		tr.appendChild(tdTitle);

		// Company
		const tdCompany = document.createElement('td');
		tdCompany.className = 'col-company';
		tdCompany.textContent = entry.companyName || '—';
		tr.appendChild(tdCompany);

		// Applied (boolean)
		const tdApplied = document.createElement('td');
		tdApplied.className = 'col-applied';
		tdApplied.appendChild(appliedBadge(entry.applied));
		tr.appendChild(tdApplied);

		// Reason
		const tdReason = document.createElement('td');
		tdReason.className = 'col-reason';
		// Don't show a reason pill for successful applies — the badge already
		// communicates that, and the reason column is meant to explain skips.
		if (!entry.applied) {
			tdReason.appendChild(reasonPill(entry.reason));
		} else {
			tdReason.textContent = '';
		}
		tr.appendChild(tdReason);

		// Description (only meaningful for non-applied entries)
		const tdDesc = document.createElement('td');
		tdDesc.className = 'col-desc';
		tdDesc.textContent = entry.applied ? '' : (entry.description || '');
		tr.appendChild(tdDesc);

		// URL
		const tdUrl = document.createElement('td');
		tdUrl.className = 'col-url';
		const url = buildJobUrl(entry);
		if (url) {
			const a = document.createElement('a');
			a.href = url;
			a.target = '_blank';
			a.rel = 'noopener noreferrer';
			a.textContent = entry.jobId ? `view #${entry.jobId}` : 'open';
			tdUrl.appendChild(a);
		} else {
			tdUrl.textContent = '—';
		}
		tr.appendChild(tdUrl);

		// Per-row delete
		const tdActions = document.createElement('td');
		tdActions.className = 'col-actions';
		const delBtn = document.createElement('button');
		delBtn.className = 'row-delete';
		delBtn.title = 'Remove this entry';
		delBtn.textContent = '×';
		delBtn.addEventListener('click', () => {
			deleteEntry(entry.timestamp, entry.jobId);
		});
		tdActions.appendChild(delBtn);
		tr.appendChild(tdActions);

		frag.appendChild(tr);
	}
	els.tbody.appendChild(frag);
}

function applyFilters() {
	const status = els.filterStatus.value;
	const reason = els.filterReason.value;
	const term = (els.search.value || '').trim().toLowerCase();

	const filtered = allEntries.filter((e) => {
		if (status === 'applied' && !e.applied) return false;
		if (status === 'not-applied' && e.applied) return false;
		if (status === 'error' && e.reason !== 'error') return false;
		if (reason !== 'all' && e.reason !== reason) return false;
		if (term) {
			const haystack = [
				e.title, e.companyName, e.description, REASON_LABELS[e.reason] || e.reason
			].filter(Boolean).join(' ').toLowerCase();
			if (!haystack.includes(term)) return false;
		}
		return true;
	});

	renderTable(filtered);
}

function refreshStats() {
	const total = allEntries.length;
	const applied = allEntries.filter((e) => e.applied).length;
	const errors = allEntries.filter((e) => e.reason === 'error').length;
	els.statTotal.textContent = total;
	els.statApplied.textContent = applied;
	els.statSkipped.textContent = total - applied;
	els.statError.textContent = errors;
}

function refreshReasonOptions() {
	const seen = new Set();
	for (const e of allEntries) if (e.reason) seen.add(e.reason);
	// Preserve current selection.
	const current = els.filterReason.value;
	els.filterReason.innerHTML = '';
	const all = document.createElement('option');
	all.value = 'all';
	all.textContent = 'All reasons';
	els.filterReason.appendChild(all);
	const ordered = Array.from(seen).sort((a, b) =>
		(REASON_LABELS[a] || a).localeCompare(REASON_LABELS[b] || b)
	);
	for (const r of ordered) {
		const opt = document.createElement('option');
		opt.value = r;
		opt.textContent = REASON_LABELS[r] || r;
		els.filterReason.appendChild(opt);
	}
	els.filterReason.value = seen.has(current) || current === 'all' ? current : 'all';
}

async function loadEntries() {
	const data = await chrome.storage.local.get('applyHistory');
	allEntries = Array.isArray(data?.applyHistory) ? data.applyHistory.slice() : [];
	// Storage already keeps newest first, but be defensive.
	allEntries.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
	refreshStats();
	refreshReasonOptions();
	applyFilters();
}

async function deleteEntry(timestamp, jobId) {
	allEntries = allEntries.filter((e) => !(e.timestamp === timestamp && e.jobId === jobId));
	await chrome.storage.local.set({ applyHistory: allEntries });
	refreshStats();
	applyFilters();
}

async function clearAll() {
	allEntries = [];
	await chrome.storage.local.set({ applyHistory: [] });
	refreshStats();
	refreshReasonOptions();
	applyFilters();
}

function csvEscape(s) {
	if (s == null) return '';
	const str = String(s);
	if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
	return str;
}

function exportCsv() {
	const status = els.filterStatus.value;
	const reason = els.filterReason.value;
	const term = (els.search.value || '').trim().toLowerCase();
	const rows = allEntries.filter((e) => {
		if (status === 'applied' && !e.applied) return false;
		if (status === 'not-applied' && e.applied) return false;
		if (status === 'error' && e.reason !== 'error') return false;
		if (reason !== 'all' && e.reason !== reason) return false;
		if (term) {
			const h = [e.title, e.companyName, e.description].filter(Boolean).join(' ').toLowerCase();
			if (!h.includes(term)) return false;
		}
		return true;
	});

	const header = ['Time', 'Title', 'Company', 'Applied', 'Reason', 'Description', 'URL'];
	const lines = [header.join(',')];
	for (const e of rows) {
		lines.push([
			fmtTime(e.timestamp),
			csvEscape(e.title),
			csvEscape(e.companyName),
			e.applied ? 'YES' : 'NO',
			csvEscape(REASON_LABELS[e.reason] || e.reason),
			csvEscape(e.applied ? '' : (e.description || '')),
			csvEscape(buildJobUrl(e)),
		].join(','));
	}
	const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `apply-history-${new Date().toISOString().slice(0,10)}.csv`;
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
}

// ----- Wire up events -----
document.addEventListener('DOMContentLoaded', () => {
	loadEntries();

	els.filterStatus.addEventListener('change', applyFilters);
	els.filterReason.addEventListener('change', applyFilters);
	els.search.addEventListener('input', applyFilters);

	els.clearAllBtn.addEventListener('click', () => {
		els.confirm.style.display = 'flex';
	});
	els.confirmNo.addEventListener('click', () => {
		els.confirm.style.display = 'none';
	});
	els.confirmYes.addEventListener('click', async () => {
		els.confirm.style.display = 'none';
		await clearAll();
	});
	els.confirm.addEventListener('click', (e) => {
		if (e.target === els.confirm) els.confirm.style.display = 'none';
	});

	els.exportBtn.addEventListener('click', exportCsv);

	// Live-refresh if storage changes from another tab/page
	chrome.storage.onChanged.addListener((changes, area) => {
		if (area === 'local' && changes.applyHistory) {
			loadEntries();
		}
	});
});
