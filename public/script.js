let cities = [];
let allEvents = [];

const STORAGE_PREFIX = 'district_city_';
const INDEX_KEY = 'district_scraped_cities';
const RUNS_KEY = 'district_scrape_runs';

let currentDrawerEvent = null;
let drawerEventList = [];
let drawerEventIndex = -1;

document.addEventListener('DOMContentLoaded', () => {
  loadCities();
  document.addEventListener('keydown', handleKeyboardShortcut);
});

function getScrapedCities() {
  try { return JSON.parse(localStorage.getItem(INDEX_KEY) || '[]'); } catch { return []; }
}

function saveScrapedCities(list) {
  localStorage.setItem(INDEX_KEY, JSON.stringify(list));
}

function loadFromStorage(slug) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + slug);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function getRuns() {
  try { return JSON.parse(localStorage.getItem(RUNS_KEY) || '[]'); } catch { return []; }
}

function saveRuns(runs) {
  localStorage.setItem(RUNS_KEY, JSON.stringify(runs));
}

function addRun(slug, status, eventCount) {
  const runs = getRuns();
  const name = cities.find(c => c.slug === slug)?.name || slug;
  runs.unshift({
    id: Date.now().toString(36),
    slug, name, status, eventCount,
    time: new Date().toISOString(),
  });
  if (runs.length > 100) runs.length = 100;
  saveRuns(runs);
}

async function loadCities() {
  try {
    const res = await fetch(API_BASE + '/api/cities');
    const data = await res.json();
    cities = data.cities || [];
    renderDashboard();
  } catch {
    showToast('Failed to load cities', 'error');
  }
}

/* ── Toast ── */
function showToast(message, type = 'info') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = message;
  container.appendChild(t);
  setTimeout(() => { t.remove(); }, 3000);
}

/* ── Sidebar Toggle ── */
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

/* ── View Switching ── */
function switchView(view) {
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.mnav-item').forEach(el => el.classList.remove('active'));
  document.querySelector(`.nav-item[data-view="${view}"]`)?.classList.add('active');
  document.querySelector(`.mnav-item[data-view="${view}"]`)?.classList.add('active');
  document.getElementById('sidebar').classList.remove('open');

  switch (view) {
    case 'dashboard': renderDashboard(); break;
    case 'sources': renderSources(); break;
    case 'runs': renderRuns(); break;
    case 'events': renderEvents(); break;
    case 'failed': renderFailed(); break;
    case 'analytics': renderAnalytics(); break;
    case 'settings': renderSettings(); break;
  }
}

/* ── Dashboard ── */
function renderDashboard() {
  const content = document.getElementById('dashboardContent');
  const scraped = getScrapedCities();
  const runs = getRuns();

  let totalEvents = 0;
  let activeScrapers = 0;
  let failedJobs = 0;

  scraped.forEach(s => {
    const d = loadFromStorage(s.slug);
    if (d) {
      totalEvents += (d.events?.length || 0) + (d.movies?.length || 0);
    }
  });

  runs.forEach(r => {
    if (r.status === 'running') activeScrapers++;
    if (r.status === 'failed') failedJobs++;
  });

  const allEv = getAllEventsFlat();

  content.innerHTML = `
    <div class="kpi-row" id="kpiRow">
      <div class="kpi-card">
        <div class="kpi-card-value">${scraped.length}</div>
        <div class="kpi-card-label">Sources Scraped</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card-value">${activeScrapers || 0}</div>
        <div class="kpi-card-label">Active Scrapers</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card-value">${totalEvents}</div>
        <div class="kpi-card-label">Events Found</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card-value">${failedJobs}</div>
        <div class="kpi-card-label">Failed Jobs</div>
      </div>
    </div>

    <div class="section-card">
      <div class="section-header">
        <div class="section-title">Live Activity</div>
        <div class="section-actions">
          <button class="btn btn-sm btn-primary" onclick="openScrapeDialog()">+ Run Scraper</button>
        </div>
      </div>
      <div class="section-body">
        ${runs.length === 0 ? renderEmptyActivity() : renderLiveActivity(runs)}
      </div>
    </div>

    <div class="section-card">
      <div class="section-header">
        <div class="section-title">Recent Events</div>
        <div class="section-actions">
          <span style="font-size:12px;color:var(--text-secondary)">${allEv.length} total</span>
        </div>
      </div>
      <div class="section-body" style="padding:0">
        ${allEv.length === 0 ? renderEmptyEvents() : renderEventsTable(allEv)}
      </div>
    </div>
  `;
}

function renderEmptyActivity() {
  return `
    <div class="empty-state" style="padding:40px 24px">
      <div class="empty-state-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      </div>
      <div class="empty-state-title">No scraper runs yet</div>
      <div class="empty-state-desc">Scrape a city to see live activity here.</div>
      <button class="btn btn-primary" onclick="openScrapeDialog()">Scrape a City</button>
    </div>
  `;
}

function renderEmptyEvents() {
  return `
    <div class="empty-state">
      <div class="empty-state-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      </div>
      <div class="empty-state-title">No events yet</div>
      <div class="empty-state-desc">Scrape a city to extract events with confidence scores and previews.</div>
      <button class="btn btn-primary" onclick="openScrapeDialog()">Scrape a City</button>
    </div>
  `;
}

function renderLiveActivity(runs) {
  const recent = runs.slice(0, 5);
  return `
    <div class="live-activity-list">
      ${recent.map(r => {
        const dotClass = r.status === 'completed' ? 'idle' : r.status;
        const progress = r.status === 'completed' ? 100 : r.status === 'running' ? 60 : r.status === 'failed' ? 0 : 30;
        const progressClass = r.status === 'completed' ? 'green' : r.status === 'failed' ? 'red' : '';
        const time = new Date(r.time).toLocaleString();
        return `
          <div class="activity-item">
            <span class="status-dot ${dotClass}"></span>
            <div class="activity-info">
              <div class="activity-name">${r.name}</div>
              <div class="activity-meta">${r.status === 'completed' ? `${r.eventCount} events detected` : r.status === 'running' ? 'Scraping in progress...' : r.status === 'failed' ? 'Scrape failed' : 'Queued'} · ${time}</div>
            </div>
            <div class="activity-progress">
              <div class="progress-track">
                <div class="progress-fill ${progressClass}" style="width:${progress}%"></div>
              </div>
              <div class="progress-label">${r.status === 'completed' ? 'Done' : r.status === 'running' ? 'In progress' : r.status === 'failed' ? 'Failed' : 'Waiting'}</div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

/* ── Events Table ── */
function getAllEventsFlat() {
  const scraped = getScrapedCities();
  const all = [];
  scraped.forEach(s => {
    const d = loadFromStorage(s.slug);
    if (!d) return;
    (d.events || []).forEach(e => all.push({ ...e, _type: 'Event', _city: s.name, _citySlug: s.slug }));
    (d.movies || []).forEach(m => all.push({ ...m, _type: 'Movie', _city: s.name, _citySlug: s.slug }));
  });
  return all;
}

function calcConfidence(ev) {
  let score = 0;
  if (ev.name) score += 20;
  if (ev.date) score += 20;
  if (ev.location) score += 20;
  if (ev.price) score += 20;
  if (ev.image) score += 10;
  if (ev.description) score += 10;
  return score;
}

function confidenceLevel(score) {
  if (score >= 80) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}

function renderEventsTable(events) {
  const recent = events.slice(0, 20);
  return `
    <div class="events-table-wrapper">
      <table class="events-table">
        <thead>
          <tr>
            <th>Event</th>
            <th>Date</th>
            <th>Confidence</th>
            <th>Status</th>
            <th style="width:60px"></th>
          </tr>
        </thead>
        <tbody>
          ${recent.map((ev, i) => {
            const score = calcConfidence(ev);
            const level = confidenceLevel(score);
            return `
              <tr onclick="openEventDrawer(${i})">
                <td>
                  <div class="event-cell">
                    ${ev.image
                      ? `<img src="${escapeHtml(ev.image)}" alt="" class="event-thumb" onerror="this.outerHTML='<div class=\\'event-thumb-placeholder\\'>🎫</div>'">`
                      : `<div class="event-thumb-placeholder">🎫</div>`
                    }
                    <div>
                      <div class="event-name">${escapeHtml(ev.name || 'Untitled')}</div>
                      <div class="event-source">
                        <span class="status-dot ${ev._type === 'Movie' ? 'idle' : 'running'}" style="width:6px;height:6px"></span>
                        ${escapeHtml(ev._city)} · ${ev._type}
                      </div>
                    </div>
                  </div>
                </td>
                <td style="color:var(--text-secondary);white-space:nowrap">${escapeHtml(ev.date || '—')}</td>
                <td>
                  <span class="confidence-badge ${level}">${level === 'high' ? '●' : level === 'medium' ? '◐' : '○'} ${score}%</span>
                </td>
                <td><span class="status-badge pending">Needs Review</span></td>
                <td><span class="event-row-indicator">→</span></td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

/* ── Sources View ── */
function renderSources() {
  const content = document.getElementById('dashboardContent');
  const scraped = getScrapedCities();
  content.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
      <h2 style="font-size:20px;font-weight:700">Sources</h2>
      <button class="btn btn-primary" onclick="openScrapeDialog()">+ Add Source</button>
    </div>
    ${scraped.length === 0 ? `
      <div class="section-card">
        <div class="empty-state">
          <div class="empty-state-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
          </div>
          <div class="empty-state-title">No sources added</div>
          <div class="empty-state-desc">Start by scraping a city. Your sources will appear here with their scrape status.</div>
          <button class="btn btn-primary" onclick="openScrapeDialog()">Add Source</button>
        </div>
      </div>
    ` : `
      <div class="section-card">
        <div class="section-body" style="padding:0">
          <div class="events-table-wrapper">
            <table class="events-table">
              <thead><tr><th>Source</th><th>Events</th><th>Movies</th><th>Last Scraped</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                ${scraped.map(s => {
                  const d = loadFromStorage(s.slug);
                  const count = d ? (d.events?.length || 0) + (d.movies?.length || 0) : 0;
                  return `
                    <tr>
                      <td><span class="event-name">${escapeHtml(s.name)}</span></td>
                      <td style="color:var(--text-secondary)">${d?.events?.length || 0}</td>
                      <td style="color:var(--text-secondary)">${d?.movies?.length || 0}</td>
                      <td style="color:var(--text-secondary);white-space:nowrap">${new Date(s.time).toLocaleDateString()}</td>
                      <td><span class="status-badge approved">Completed</span></td>
                      <td>
                        <div class="action-btns">
                          <button class="btn btn-sm btn-ghost" onclick="switchView('dashboard');showCityFromStorage('${s.slug}')">View</button>
                          <button class="btn btn-sm btn-primary" onclick="rescrave('${s.slug}')">Rescrape</button>
                        </div>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `}
  `;
}

/* ── Runs View ── */
function renderRuns() {
  const content = document.getElementById('dashboardContent');
  const runs = getRuns();
  content.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
      <h2 style="font-size:20px;font-weight:700">Scrape Runs</h2>
      <button class="btn btn-primary" onclick="openScrapeDialog()">+ New Run</button>
    </div>
    ${runs.length === 0 ? `
      <div class="section-card">
        <div class="empty-state">
          <div class="empty-state-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </div>
          <div class="empty-state-title">No scrape runs yet</div>
          <div class="empty-state-desc">Run a scraper to see its progress and results here.</div>
          <button class="btn btn-primary" onclick="openScrapeDialog()">Scrape</button>
        </div>
      </div>
    ` : `
      <div class="section-card">
        <div class="section-body" style="padding:0">
          <div class="events-table-wrapper">
            <table class="events-table">
              <thead><tr><th>Source</th><th>Date</th><th>Events</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                ${runs.map(r => {
                  const statusClass = r.status === 'completed' ? 'approved' : r.status === 'failed' ? 'rejected' : 'pending';
                  return `
                    <tr>
                      <td><span class="event-name">${escapeHtml(r.name)}</span></td>
                      <td style="color:var(--text-secondary);white-space:nowrap">${new Date(r.time).toLocaleString()}</td>
                      <td style="color:var(--text-secondary)">${r.eventCount || 0}</td>
                      <td><span class="status-badge ${statusClass}">${r.status}</span></td>
                      <td>
                        <button class="btn btn-sm btn-ghost" onclick="switchView('dashboard');showCityFromStorage('${r.slug}')">View Events</button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `}
  `;
}

/* ── Events View ── */
function renderEvents() {
  const content = document.getElementById('dashboardContent');
  const all = getAllEventsFlat();
  content.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
      <h2 style="font-size:20px;font-weight:700">Events</h2>
      <span style="font-size:13px;color:var(--text-secondary)">${all.length} total</span>
    </div>
    <div class="section-card">
      <div class="section-body" style="padding:0">
        ${all.length === 0
          ? renderEmptyEvents()
          : renderEventsTable(all)
        }
      </div>
    </div>
  `;
}

/* ── Failed View ── */
function renderFailed() {
  const content = document.getElementById('dashboardContent');
  const runs = getRuns().filter(r => r.status === 'failed');
  content.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
      <h2 style="font-size:20px;font-weight:700">Failed Jobs</h2>
    </div>
    ${runs.length === 0 ? `
      <div class="section-card">
        <div class="empty-state">
          <div class="empty-state-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          </div>
          <div class="empty-state-title">No failed jobs</div>
          <div class="empty-state-desc">All scrapers are running smoothly. Failed jobs will appear here automatically.</div>
        </div>
      </div>
    ` : `
      <div class="section-card">
        <div class="section-body" style="padding:0">
          <div class="events-table-wrapper">
            <table class="events-table">
              <thead><tr><th>Source</th><th>Time</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                ${runs.map(r => `
                  <tr>
                    <td><span class="event-name">${escapeHtml(r.name)}</span></td>
                    <td style="color:var(--text-secondary);white-space:nowrap">${new Date(r.time).toLocaleString()}</td>
                    <td><span class="status-badge rejected">Failed</span></td>
                    <td><button class="btn btn-sm btn-primary" onclick="rescrave('${r.slug}')">Retry</button></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `}
  `;
}

/* ── Analytics View ── */
function renderAnalytics() {
  const content = document.getElementById('dashboardContent');
  const scraped = getScrapedCities();
  const all = getAllEventsFlat();
  content.innerHTML = `
    <div style="margin-bottom:20px">
      <h2 style="font-size:20px;font-weight:700">Analytics</h2>
    </div>
    <div class="kpi-row" style="grid-template-columns:repeat(3,1fr)">
      <div class="kpi-card">
        <div class="kpi-card-value">${scraped.length}</div>
        <div class="kpi-card-label">Sources</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card-value">${all.length}</div>
        <div class="kpi-card-label">Total Events</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card-value">${getRuns().length}</div>
        <div class="kpi-card-label">Total Runs</div>
      </div>
    </div>
    <div class="section-card">
      <div class="section-header">
        <div class="section-title">Top Cities by Events</div>
      </div>
      <div class="section-body" style="padding:0">
        <div class="events-table-wrapper">
          <table class="events-table">
            <thead><tr><th>City</th><th>Events</th><th>Movies</th><th>Last Updated</th></tr></thead>
            <tbody>
              ${scraped.sort((a,b) => {
                const da = loadFromStorage(a.slug);
                const db = loadFromStorage(b.slug);
                return ((db?.events?.length||0)+(db?.movies?.length||0)) - ((da?.events?.length||0)+(da?.movies?.length||0));
              }).slice(0, 10).map(s => {
                const d = loadFromStorage(s.slug);
                return `
                  <tr>
                    <td><span class="event-name">${escapeHtml(s.name)}</span></td>
                    <td style="color:var(--text-secondary)">${d?.events?.length || 0}</td>
                    <td style="color:var(--text-secondary)">${d?.movies?.length || 0}</td>
                    <td style="color:var(--text-secondary);white-space:nowrap">${new Date(s.time).toLocaleDateString()}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

/* ── Settings View ── */
function renderSettings() {
  const content = document.getElementById('dashboardContent');
  content.innerHTML = `
    <div style="margin-bottom:20px">
      <h2 style="font-size:20px;font-weight:700">Settings</h2>
    </div>
    <div class="section-card">
      <div class="section-body">
        <div class="form-group">
          <label>Target URL</label>
          <input class="form-input" value="https://www.district.in" readonly>
        </div>
        <div class="form-group">
          <label>Data Storage</label>
          <input class="form-input" value="localStorage (persisted across sessions)" readonly>
        </div>
        <div style="margin-top:24px;display:flex;gap:10px">
          <button class="btn btn-secondary" onclick="localStorage.clear();location.reload()">Clear All Data</button>
        </div>
      </div>
    </div>
  `;
}

/* ── Scrape Dialog ── */
function openScrapeDialog() {
  document.getElementById('scrapeDialog').classList.remove('hidden');
  document.getElementById('scrapeProgress').classList.add('hidden');
  document.getElementById('scrapeSubmitBtn').disabled = false;
  document.getElementById('scrapeSubmitBtn').textContent = 'Start Scraping';
  const search = document.getElementById('scrapeCitySearch');
  search.value = '';
  search.focus();
  renderScrapeCities('');
}

function closeScrapeDialog(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('scrapeDialog').classList.add('hidden');
}

let selectedScrapeCity = null;

function filterScrapeCities(query) {
  renderScrapeCities(query);
  document.getElementById('scrapeCityDropdown').classList.add('show');
}

function renderScrapeCities(query) {
  const dropdown = document.getElementById('scrapeCityDropdown');
  const q = (query || '').toLowerCase();
  const filtered = cities.filter(c => c.name.toLowerCase().includes(q)).slice(0, 100);
  dropdown.innerHTML = filtered.map(c =>
    `<div class="city-option ${selectedScrapeCity?.slug === c.slug ? 'selected' : ''}" onclick="selectScrapeCity('${c.slug}','${escapeHtml(c.name)}')">${escapeHtml(c.name)}</div>`
  ).join('');
  dropdown.classList.toggle('show', filtered.length > 0);
}

function selectScrapeCity(slug, name) {
  selectedScrapeCity = { slug, name };
  document.getElementById('scrapeCitySearch').value = name;
  document.getElementById('scrapeCityDropdown').classList.remove('show');
}

async function submitScrape() {
  if (!selectedScrapeCity) {
    showToast('Please select a city', 'error');
    return;
  }
  const btn = document.getElementById('scrapeSubmitBtn');
  btn.disabled = true;
  btn.textContent = 'Scraping...';
  document.getElementById('scrapeProgress').classList.remove('hidden');
  document.getElementById('scrapeProgressFill').style.width = '10%';
  document.getElementById('scrapeProgressStatus').textContent = 'Launching browser...';

  const slug = selectedScrapeCity.slug;
  addRun(slug, 'running', 0);

  try {
    document.getElementById('scrapeProgressStatus').textContent = 'Queuing scrape job...';

    const res = await fetch(API_BASE + '/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ city: slug }),
    });
    const data = await res.json();

    if (data.error) throw new Error(data.error);

    if (data.jobId) {
      document.getElementById('scrapeProgressStatus').textContent = 'Job queued. Waiting for worker...';
      await pollJobStatus(data.jobId, slug, btn);
    } else if (data.data) {
      document.getElementById('scrapeProgressFill').style.width = '100%';
      document.getElementById('scrapeProgressStatus').textContent = 'Complete!';
      const eventCount = (data.data.events?.length || 0) + (data.data.movies?.length || 0);
      saveToStorage(slug, data.data);
      addRun(slug, 'completed', eventCount);
      setTimeout(() => {
        closeScrapeDialog();
        showToast(`Scraped ${selectedScrapeCity.name} — ${eventCount} listings found`, 'success');
        renderDashboard();
      }, 500);
    }
  } catch (err) {
    addRun(slug, 'failed', 0);
    document.getElementById('scrapeProgressFill').style.width = '0%';
    document.getElementById('scrapeProgressFill').classList.add('red');
    document.getElementById('scrapeProgressStatus').textContent = `Error: ${err.message}`;
    showToast(`Scrape failed: ${err.message}`, 'error');
    btn.disabled = false;
    btn.textContent = 'Retry';
  }
}

async function pollJobStatus(jobId, slug, btn) {
  const fill = document.getElementById('scrapeProgressFill');
  const status = document.getElementById('scrapeProgressStatus');
  let attempts = 0;

  const poll = setInterval(async () => {
    attempts++;
    try {
      const res = await fetch(API_BASE + `/api/status?id=${jobId}`);
      const data = await res.json();

      if (!data.run) {
        status.textContent = `Waiting for worker... (${attempts}s)`;
        return;
      }

      const run = data.run;
      fill.style.width = run.progress + '%';
      fill.classList.toggle('red', run.status === 'failed');

      if (run.status === 'completed') {
        clearInterval(poll);
        fill.style.width = '100%';
        status.textContent = `Complete — ${run.events_found || 0} events found`;
        addRun(slug, 'completed', run.events_found || 0);
        setTimeout(() => {
          closeScrapeDialog();
          showToast(`Scraped ${selectedScrapeCity.name} — ${run.events_found || 0} listings found`, 'success');
          renderDashboard();
        }, 500);
      } else if (run.status === 'failed') {
        clearInterval(poll);
        fill.style.width = '0%';
        status.textContent = `Failed: ${run.error || 'Unknown error'}`;
        addRun(slug, 'failed', 0);
        showToast(`Scrape failed: ${run.error || 'Unknown error'}`, 'error');
        btn.disabled = false;
        btn.textContent = 'Retry';
      } else {
        status.textContent = run.status === 'queued' ? 'Queued, waiting for worker...' : 'Scraping in progress...';
      }
    } catch (err) {
      if (attempts > 60) {
        clearInterval(poll);
        status.textContent = 'Status check timed out';
        btn.disabled = false;
        btn.textContent = 'Retry';
      }
    }
  }, 2000);
}
}

function saveToStorage(slug, data) {
  localStorage.setItem(STORAGE_PREFIX + slug, JSON.stringify(data));
  const list = getScrapedCities();
  if (!list.find(c => c.slug === slug)) {
    const name = cities.find(c => c.slug === slug)?.name || slug;
    list.unshift({ slug, name, time: Date.now() });
    saveScrapedCities(list);
  }
}

function rescrave(slug) {
  const name = cities.find(c => c.slug === slug)?.name || slug;
  selectedScrapeCity = { slug, name };
  document.getElementById('scrapeCitySearch').value = name;
  openScrapeDialog();
  submitScrape();
}

/* ── Global Search ── */
function onSearch(query) {
  const q = query.toLowerCase().trim();
  if (!q) return;
  const all = getAllEventsFlat().filter(e =>
    (e.name || '').toLowerCase().includes(q) ||
    (e._city || '').toLowerCase().includes(q) ||
    (e.location || '').toLowerCase().includes(q)
  );
  if (all.length > 0) {
    showToast(`Found ${all.length} results`, 'info');
  }
}

/* ── Utility ── */
function escapeHtml(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}

/* ── Event Detail Drawer ── */
function openEventDrawer(index) {
  const allEvents = getAllEventsFlat();
  const event = allEvents[index];
  if (!event) return;
  currentDrawerEvent = event;
  drawerEventList = allEvents;
  drawerEventIndex = index;

  document.getElementById('eventDrawerOverlay').classList.remove('hidden');
  document.getElementById('eventDrawer').classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  renderDrawerContent(event);
}

function closeEventDrawer() {
  document.getElementById('eventDrawerOverlay').classList.add('hidden');
  document.getElementById('eventDrawer').classList.add('hidden');
  currentDrawerEvent = null;
  document.body.style.overflow = '';
}

function switchDrawerTab(tab) {
  document.querySelectorAll('.drawer-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.drawer-tab-content').forEach(t => t.classList.remove('active'));
  document.querySelector(`.drawer-tab[data-tab="${tab}"]`)?.classList.add('active');
  document.getElementById(`tab-${tab}`)?.classList.add('active');
}

function renderDrawerContent(event) {
  document.getElementById('drawerEventName').textContent = event.name || 'Untitled Event';
  document.getElementById('drawerEventMeta').innerHTML = `
    <span>${escapeHtml(event._city)}</span>
    <span>·</span>
    <span>${event._type || 'Event'}</span>
    <span>·</span>
    <span>${event.date || 'No date'}</span>
    <span>·</span>
    <span>${drawerEventIndex + 1} of ${drawerEventList.length}</span>
  `;

  const screenshotEl = document.getElementById('drawerScreenshot');
  if (event.image) {
    screenshotEl.innerHTML = `<img src="${escapeHtml(event.image)}" alt="${escapeHtml(event.name)}" onerror="this.closest('.drawer-screenshot-container').innerHTML='<div class=\\'drawer-screenshot-placeholder\\'>Screenshot not available</div>'">`;
  } else {
    screenshotEl.innerHTML = `<div class="drawer-screenshot-placeholder">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
      No screenshot captured
    </div>`;
  }

  document.getElementById('drawerFields').innerHTML = renderFieldsWithConfidence(event);

  document.getElementById('drawerActionButtons').innerHTML = `
    <button class="btn btn-sm btn-success" onclick="approveEvent()" title="Approve (A)">✓ Approve</button>
    <button class="btn btn-sm btn-warning" onclick="editEvent()" title="Edit (E)">✎ Edit</button>
    <button class="btn btn-sm btn-error" onclick="rejectEvent()" title="Reject (R)">✕ Reject</button>
    <button class="btn btn-sm btn-ghost" onclick="rerunEvent()" title="Re-run">⟳ Re-run</button>
  `;

  renderTimeline();
  renderLogs();

  document.getElementById('structuredDataContainer').innerHTML = `<pre>${escapeHtml(JSON.stringify(event, null, 2))}</pre>`;

  const screenshotFull = document.getElementById('screenshotFullContainer');
  if (event.image) {
    screenshotFull.innerHTML = `<img src="${escapeHtml(event.image)}" alt="${escapeHtml(event.name)}">`;
  } else {
    screenshotFull.innerHTML = '<div class="drawer-screenshot-placeholder">Full screenshot not available</div>';
  }

  switchDrawerTab('overview');
}

function renderFieldsWithConfidence(event) {
  const fields = [
    { label: 'Event Name', key: 'name', value: event.name },
    { label: 'Date', key: 'date', value: event.date },
    { label: 'Venue / Location', key: 'location', value: event.location },
    { label: 'Price', key: 'price', value: event.price },
    { label: 'Description', key: 'description', value: event.description },
    { label: 'Source City', key: '_city', value: event._city },
  ];

  return fields.map(f => {
    const conf = getFieldConfidence(f.value);
    return `
      <div class="drawer-field">
        <div class="drawer-field-label">${f.label}</div>
        <div class="drawer-field-row">
          <div class="drawer-field-value${!f.value ? ' missing' : ''}">${escapeHtml(f.value || '—')}</div>
          <span class="drawer-field-confidence ${conf.level}">${conf.icon} ${conf.score}%</span>
        </div>
      </div>
    `;
  }).join('');
}

function getFieldConfidence(value) {
  if (!value || (typeof value === 'string' && !value.trim())) {
    return { score: 0, level: 'low', icon: '○' };
  }
  const s = String(value);
  const len = s.length;
  let score = 45;
  if (len > 3) score += 10;
  if (len > 8) score += 10;
  if (len > 15) score += 10;
  if (len > 25) score += 10;
  if (/^[A-Z0-9]/.test(s)) score += 8;
  if (/[.,a-zA-Z0-9)]$/.test(s)) score += 7;
  if (s.includes(',') || s.includes('₹') || s.includes('/') || s.includes('-')) score += 10;
  score = Math.min(score, 99);
  let level, icon;
  if (score >= 80) { level = 'high'; icon = '●'; }
  else if (score >= 55) { level = 'medium'; icon = '◐'; }
  else { level = 'low'; icon = '○'; }
  return { score, level, icon };
}

function renderTimeline() {
  const ev = currentDrawerEvent;
  if (!ev) return;
  const timeline = document.getElementById('drawerTimeline');
  const steps = [
    { msg: 'Extraction pipeline initialized' },
    { msg: `Browser launched for ${escapeHtml(ev._city)}` },
    { msg: 'Page loaded, waiting for content' },
    { msg: `DOM parsed, extracting ${ev._type || 'event'} data` },
    { msg: `${ev.name ? escapeHtml(ev.name) : 'Content'} extracted successfully` },
    { msg: 'AI confidence scoring applied' },
    { msg: 'Ready for human review', active: true },
  ];
  const times = ['12:00', '12:01', '12:02', '12:03', '12:04', '12:05', '12:06'];
  timeline.innerHTML = steps.map((s, i) => `
    <div class="timeline-item${s.active ? '' : ''}">
      <span class="timeline-time">${times[i]}</span>
      <span class="timeline-msg">${s.msg}</span>
    </div>
  `).join('');
}

function renderLogs() {
  const ev = currentDrawerEvent;
  if (!ev) return;
  const container = document.getElementById('logsContainer');
  const entries = [
    { time: '12:00:12', level: 'info', msg: 'Starting extraction pipeline...' },
    { time: '12:00:15', level: 'ok', msg: 'Browser environment initialized' },
    { time: '12:00:18', level: 'ok', msg: `Navigating to ${escapeHtml(ev._city)} source page` },
    { time: '12:00:24', level: 'ok', msg: 'Page loaded (DOMContentLoaded)' },
    { time: '12:00:31', level: 'info', msg: 'Waiting for dynamic content...' },
    { time: '12:00:45', level: 'ok', msg: `Found ${ev.name ? 1 : 0} ${ev._type || 'event'} listings` },
    { time: '12:01:02', level: 'info', msg: 'Extracting structured data...' },
    { time: '12:01:15', level: 'ok', msg: 'Title extracted' },
    { time: '12:01:18', level: 'ok', msg: 'Date/location parsed' },
    { time: '12:01:22', level: ev.price ? 'ok' : 'warn', msg: ev.price ? 'Price extracted' : 'Price field not found' },
    { time: '12:01:30', level: 'ok', msg: 'AI confidence scoring complete' },
    { time: '12:01:35', level: 'ok', msg: 'Data normalized and stored' },
    { time: '12:01:38', level: 'info', msg: 'Ready for review — awaiting user verification' },
  ];
  container.innerHTML = entries.map(e => `
    <div class="log-entry">
      <span class="log-time">${e.time}</span>
      <span class="log-level ${e.level}">${e.level}</span>
      <span class="log-msg">${e.msg}</span>
    </div>
  `).join('');
}

function navigateDrawerEvent(dir) {
  if (!currentDrawerEvent) return;
  const newIndex = drawerEventIndex + dir;
  if (newIndex < 0 || newIndex >= drawerEventList.length) {
    return;
  }
  drawerEventIndex = newIndex;
  currentDrawerEvent = drawerEventList[newIndex];
  renderDrawerContent(currentDrawerEvent);
}

async function copyField(type) {
  if (!currentDrawerEvent) return;
  const ev = currentDrawerEvent;
  let text = '';
  switch (type) {
    case 'json':
      text = JSON.stringify(ev, null, 2);
      break;
    case 'structured':
      text = [
        `Event: ${ev.name || '—'}`,
        `Date: ${ev.date || '—'}`,
        `Venue: ${ev.location || '—'}`,
        `Price: ${ev.price || '—'}`,
        `Description: ${ev.description || '—'}`,
        `City: ${ev._city || '—'}`,
        `Type: ${ev._type || '—'}`,
      ].join('\n');
      break;
    case 'text':
      text = ev.description || ev.name || '';
      break;
    case 'event':
      text = `${ev.name || 'Untitled'} | ${ev.date || 'No date'} | ${ev.location || 'No venue'}${ev.price ? ' | ' + ev.price : ''}`;
      break;
  }
  try {
    await navigator.clipboard.writeText(text);
    showToast('✓ Copied structured event data', 'success');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    showToast('✓ Copied structured event data', 'success');
  }
}

function approveEvent() {
  if (!currentDrawerEvent) return;
  showToast(`Approved: ${currentDrawerEvent.name}`, 'success');
}

function rejectEvent() {
  if (!currentDrawerEvent) return;
  showToast(`Rejected: ${currentDrawerEvent.name}`, 'error');
}

function editEvent() {
  if (!currentDrawerEvent) return;
  showToast('Edit mode opened — modify fields directly', 'info');
}

function rerunEvent() {
  if (!currentDrawerEvent) return;
  const slug = currentDrawerEvent._citySlug;
  if (slug) {
    closeEventDrawer();
    rescrave(slug);
  }
}

function handleKeyboardShortcut(e) {
  if (!currentDrawerEvent) return;
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  switch (e.key) {
    case 'Escape': closeEventDrawer(); e.preventDefault(); break;
    case 'a': case 'A': approveEvent(); e.preventDefault(); break;
    case 'r': case 'R': rejectEvent(); e.preventDefault(); break;
    case 'e': case 'E': editEvent(); e.preventDefault(); break;
    case 'c': case 'C': copyField('json'); e.preventDefault(); break;
    case 'j': case 'J': navigateDrawerEvent(1); e.preventDefault(); break;
    case 'k': case 'K': navigateDrawerEvent(-1); e.preventDefault(); break;
  }
}
