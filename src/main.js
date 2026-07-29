import { db, getOrCreateTeacherProfile, initDemoDataIfNeeded } from './db/edenDb.js';
import { generateQrDataUrl } from './services/identity.js';
import { parseSf1File } from './services/sf1Parser.js';
import { isSupabaseConfigured, signInUser, signUpUser, signOutUser, getCurrentUser } from './services/supabaseClient.js';

// Application State
let activeTab = 'roster'; // 'roster', 'guild', 'hub', 'portals'
let currentTheme = localStorage.getItem('eden_theme') || 'blue-gold'; // Default: Glassy Blue & Green with Gold Accent
let teacherProfile = null;
let cloudUser = null;
let studentsList = [];
let departmentsList = [];
let isModalOpen = false;
let modalType = null; // 'enroll', 'pair', 'sf1', 'auth'
let searchQuery = '';
let authMode = 'login'; // 'login' or 'signup'
let authMessage = '';
let deferredPrompt = null;

const appEl = document.getElementById('app');

async function initApp() {
  document.documentElement.setAttribute('data-theme', currentTheme);
  teacherProfile = await getOrCreateTeacherProfile();
  cloudUser = await getCurrentUser();
  await initDemoDataIfNeeded();
  await refreshData();
  renderApp();
}

async function refreshData() {
  studentsList = await db.students.toArray();
  departmentsList = await db.departments.toArray();
}

function renderApp() {
  document.documentElement.setAttribute('data-theme', currentTheme);

  const filteredStudents = studentsList.filter(s => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return s.lastName.toLowerCase().includes(q) || 
           s.firstName.toLowerCase().includes(q) || 
           (s.lrn && s.lrn.includes(q)) ||
           (s.gradeSection && s.gradeSection.toLowerCase().includes(q));
  });

  appEl.innerHTML = `
    <div class="app-viewport">
      <!-- Desktop Left Sidebar Nav -->
      <aside class="desktop-sidebar">
        <div class="sidebar-brand">
          <div class="sidebar-logo" style="background: none; border: none; padding: 0; box-shadow: none;">
            <img src="/eden-logo.png" alt="EDEN Logo" style="width: 100%; height: 100%; object-fit: contain;" />
          </div>
          <div>
            <h1 class="brand-title">EDEN v3</h1>
            <div class="brand-tag">E-Database & Nexus</div>
          </div>
        </div>

        <nav class="sidebar-menu">
          <button class="sidebar-item ${activeTab === 'roster' ? 'active' : ''}" data-tab="roster">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            <span>Teacher Roster</span>
          </button>
          <button class="sidebar-item ${activeTab === 'guild' ? 'active' : ''}" data-tab="guild">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            <span>Guild & Identity</span>
          </button>
          <button class="sidebar-item ${activeTab === 'hub' ? 'active' : ''}" data-tab="hub">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            <span>School Admin Hub</span>
          </button>
          <button class="sidebar-item ${activeTab === 'portals' ? 'active' : ''}" data-tab="portals">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            <span>Global Portals</span>
          </button>
        </nav>

        <div style="margin-top: auto; padding-bottom: 12px;">
          <button class="cyber-btn cyber-btn-primary" id="btn-desktop-quick-enroll" style="width: 100%;">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Quick Enroll Student
          </button>
        </div>

        <div class="sidebar-footer">
          <div style="font-size: 0.72rem; color: var(--text-dim);">Serial ID:</div>
          <div style="font-family: monospace; font-size: 0.8rem; color: var(--accent-gold); font-weight: 700;">${teacherProfile.serialNumber}</div>
        </div>
      </aside>

      <!-- Main Area -->
      <div class="app-main-wrapper">
        <!-- Top App Header -->
        <header class="app-header">
          <!-- Mobile Brand Logo -->
          <div class="brand-badge">
            <div class="brand-logo-icon" style="background: none; border: none; padding: 0; box-shadow: none;">
              <img src="/eden-logo.png" alt="EDEN Logo" style="width: 100%; height: 100%; object-fit: contain;" />
            </div>
            <div>
              <h1 class="brand-title">EDEN v3</h1>
              <div class="brand-tag">E-Database & Nexus</div>
            </div>
          </div>

          <!-- Desktop Search Header -->
          <div style="display: flex; align-items: center; gap: 16px; flex: 1; max-width: 480px;">
            <input type="text" class="cyber-input" id="search-student-header" placeholder="Search student name, LRN, section..." value="${searchQuery}" style="padding: 10px 16px; font-size: 0.85rem;" />
          </div>

          <div style="display: flex; align-items: center; gap: 10px;">
            <!-- Cloud Account Pill -->
            <button class="cyber-btn cyber-btn-glass" id="btn-open-auth" style="padding: 6px 12px; font-size: 0.8rem;">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              <span>${cloudUser ? cloudUser.email.split('@')[0] : 'Cloud Sync Account'}</span>
            </button>

            <!-- Theme Switcher -->
            <select class="theme-selector-pill" id="theme-selector">
              <option value="blue-gold" ${currentTheme === 'blue-gold' ? 'selected' : ''}>Blue, Green & Gold</option>
              <option value="avocado" ${currentTheme === 'avocado' ? 'selected' : ''}>Glassy Avocado</option>
            </select>

            <button class="cyber-btn cyber-btn-glass" id="btn-open-sf1" style="padding: 8px 14px; font-size: 0.82rem;">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              SF1 Enrich
            </button>
            ${deferredPrompt ? `
            <button class="cyber-btn cyber-btn-primary" id="btn-install-pwa" style="padding: 6px 12px; font-size: 0.8rem; background: var(--accent-green); color: #000; border: none; font-weight: 700;">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Install EDENv3
            </button>
            ` : ''}
            <div class="status-pill">
              <span class="status-dot"></span>
              <span>PWA Adaptive</span>
            </div>
          </div>
        </header>

        <!-- Dynamic Main Content -->
        <main class="main-content">
          ${renderTabContent(filteredStudents)}
        </main>
      </div>
    </div>

    <!-- Mobile Floating Action Button -->
    <button class="fab-btn" id="fab-quick-enroll" title="Quick Enroll Student">
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    </button>

    <!-- Mobile Bottom Nav Dock -->
    <nav class="bottom-nav">
      <button class="nav-item ${activeTab === 'roster' ? 'active' : ''}" data-tab="roster">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        <span>Roster</span>
      </button>
      <button class="nav-item ${activeTab === 'guild' ? 'active' : ''}" data-tab="guild">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
        <span>Guild & Identity</span>
      </button>
      <button class="nav-item ${activeTab === 'hub' ? 'active' : ''}" data-tab="hub">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        <span>School Hub</span>
      </button>
      <button class="nav-item ${activeTab === 'portals' ? 'active' : ''}" data-tab="portals">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
        <span>Portals</span>
      </button>
    </nav>

    <!-- Modal Popup Overlay -->
    <div class="modal-overlay ${isModalOpen ? 'open' : ''}" id="modal-overlay">
      <div class="modal-card" id="modal-card-container">
        ${renderModalContent()}
      </div>
    </div>
  `;

  attachEventListeners();
  if (activeTab === 'guild' || activeTab === 'roster') {
    renderQrCode();
  }
}

function renderTabContent(filteredStudents) {
  if (activeTab === 'roster') {
    return `
      <div class="desktop-grid-2">
        <!-- Main Student Roster Column -->
        <div>
          <!-- Quick Overview Card -->
          <div class="glass-card">
            <div class="section-header">
              <div>
                <div class="section-title">
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                  <span>Class Roster Database</span>
                </div>
                <div class="section-subtitle">${filteredStudents.length} Students (IndexedDB Offline Storage)</div>
              </div>
              <button class="cyber-btn cyber-btn-primary" id="btn-inline-enroll" style="padding: 10px 18px; font-size: 0.88rem;">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                + Quick Enroll
              </button>
            </div>
          </div>

          <!-- Student Roster Grid -->
          <div class="student-grid">
            ${filteredStudents.length === 0 ? `
              <div class="glass-card" style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 50px 20px;">
                <p style="font-size: 1.1rem; color: #fff; font-weight: 600;">No student records found.</p>
                <p style="font-size: 0.85rem; margin-top: 6px;">Click '+ Quick Enroll' to instantly add students with Last Name, First Name & Sex.</p>
              </div>
            ` : filteredStudents.map(s => `
              <div class="student-card">
                <div class="student-avatar">${s.firstName.charAt(0)}${s.lastName.charAt(0)}</div>
                <div class="student-info">
                  <div class="student-name">${s.lastName}, ${s.firstName}</div>
                  <div class="student-meta">
                    <span class="badge-tag ${s.sex === 'M' ? 'badge-male' : 'badge-female'}">${s.sex === 'M' ? 'Male' : 'Female'}</span>
                    ${s.lrn ? `<span class="badge-tag badge-enriched">LRN: ${s.lrn}</span>` : `<span class="badge-tag badge-basic">Basic Entry</span>`}
                    <span style="font-size: 0.75rem; opacity: 0.7;">${s.gradeSection || 'Unassigned'}</span>
                  </div>
                </div>
                <button class="btn-delete-student" data-id="${s.id}" title="Remove record" style="background: none; border: none; color: #ff6384; cursor: pointer; padding: 8px;">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Right Side Context Panel (Desktop) -->
        <div>
          <!-- Educator Identity Widget -->
          <div class="glass-card">
            <div class="section-title" style="margin-bottom: 12px;">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="7" y1="8" x2="17" y2="8"/><line x1="7" y1="12" x2="13" y2="12"/></svg>
              <span>Educator Serial & QR</span>
            </div>
            
            <div class="qr-card-container" style="padding: 12px 0;">
              <div class="qr-frame" id="qr-code-box" style="width: 150px; height: 150px;"></div>
              <div class="serial-code-badge">${teacherProfile.serialNumber}</div>
              <p style="font-size: 0.75rem; color: var(--text-muted);">Use for peer department pairing or school hub consolidation.</p>
            </div>
          </div>

          <!-- SF1 Enricher Card -->
          <div class="glass-card">
            <div class="section-title" style="margin-bottom: 6px;">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              <span>SF1 Excel Enricher</span>
            </div>
            <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 14px;">
              Upload official SF1 files offline to complete LRNs and demographic fields automatically.
            </p>
            <button class="cyber-btn cyber-btn-glass" id="btn-side-sf1" style="width: 100%;">
              Upload & Enrich SF1
            </button>
          </div>
        </div>
      </div>
    `;
  }

  if (activeTab === 'guild') {
    return `
      <div class="desktop-grid-2">
        <!-- Identity QR Column -->
        <div class="glass-card">
          <div class="section-title" style="margin-bottom: 14px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="7" y1="8" x2="17" y2="8"/><line x1="7" y1="12" x2="13" y2="12"/></svg>
            <span>Virtual Educator Identity</span>
          </div>
          
          <div class="qr-card-container">
            <div class="qr-frame" id="qr-code-box"></div>
            <div class="serial-code-badge">${teacherProfile.serialNumber}</div>
            <p style="font-size: 0.85rem; color: var(--text-muted); max-width: 380px; margin-top: 8px;">
              Your Virtual Identity allows you to join department guilds, share student databases with matched colleagues, and attach to school administrative portals.
            </p>
          </div>
        </div>

        <!-- Department Guilds Column -->
        <div class="glass-card">
          <div class="section-header">
            <div>
              <div class="section-title">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                <span>Department Guilds</span>
              </div>
              <div class="section-subtitle">Peer-to-peer student roster sharing within department groups</div>
            </div>
          </div>

          <button class="cyber-btn cyber-btn-primary" id="btn-open-pair" style="width: 100%; margin-bottom: 16px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
            Create or Connect Department Guild
          </button>

          <div style="font-size: 0.85rem; color: var(--text-muted);">
            ${departmentsList.length === 0 ? `
              <div style="text-align: center; padding: 30px; background: rgba(255,255,255,0.02); border-radius: 14px; border: 1px dashed rgba(255,255,255,0.1);">
                No paired department guilds yet. Create one or scan a colleague's QR code to link databases.
              </div>
            ` : `
              <div style="display: flex; flex-direction: column; gap: 10px;">
                <strong>Active Department Guilds:</strong>
                ${departmentsList.map(d => `
                  <div style="padding: 14px; border-radius: 12px; background: rgba(255,255,255,0.04); border: 1px solid rgba(234,195,76,0.25); display: flex; justify-content: space-between; align-items: center;">
                    <div>
                      <div style="font-weight: 700; color: #fff;">${d.name}</div>
                      <div style="font-size: 0.75rem; color: var(--text-muted);">${d.pairedSerials?.length || 1} Linked Educator Serials</div>
                    </div>
                    <span class="badge-tag badge-enriched">Paired</span>
                  </div>
                `).join('')}
              </div>
            `}
          </div>
        </div>
      </div>
    `;
  }

  if (activeTab === 'hub') {
    return `
      <!-- Desktop School Admin Hub View -->
      <div class="glass-card">
        <div class="section-header">
          <div>
            <div class="section-title">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
              <span>School Admin Hub Portal</span>
            </div>
            <div class="section-subtitle">School Consolidation Dashboard (${teacherProfile.schoolName})</div>
          </div>
          <span class="badge-tag badge-basic" style="padding: 6px 12px; font-size: 0.8rem;">Offline Standalone Primary</span>
        </div>

        <p style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 20px; max-width: 800px;">
          When approved by your School Admin, your serial number (<code>${teacherProfile.serialNumber}</code>) links your student enrollment, attendance logs, and class records directly to the school consolidation portal.
        </p>

        <!-- Stats Grid -->
        <div class="desktop-grid-3" style="margin-bottom: 24px;">
          <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(234,195,76,0.25); border-radius: 18px; padding: 20px; text-align: center;">
            <div style="font-size: 2.2rem; font-weight: 800; color: var(--accent-gold);">${studentsList.length}</div>
            <div style="font-size: 0.85rem; color: var(--text-muted); font-weight: 600; margin-top: 4px;">Local Students</div>
          </div>
          <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(16,185,129,0.25); border-radius: 18px; padding: 20px; text-align: center;">
            <div style="font-size: 2.2rem; font-weight: 800; color: var(--accent-green);">${studentsList.filter(s => s.isEnriched).length}</div>
            <div style="font-size: 0.85rem; color: var(--text-muted); font-weight: 600; margin-top: 4px;">SF1 Enriched</div>
          </div>
          <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(2,132,199,0.25); border-radius: 18px; padding: 20px; text-align: center;">
            <div style="font-size: 2.2rem; font-weight: 800; color: #38bdf8;">${departmentsList.length}</div>
            <div style="font-size: 0.85rem; color: var(--text-muted); font-weight: 600; margin-top: 4px;">Department Guilds</div>
          </div>
        </div>
      </div>
    `;
  }

  if (activeTab === 'portals') {
    return `
      <!-- Desktop Portals View -->
      <div class="glass-card">
        <div class="section-title" style="margin-bottom: 8px;">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/></svg>
          <span>Multi-Tier Administrative Portals</span>
        </div>
        <p style="font-size: 0.88rem; color: var(--text-muted); margin-bottom: 24px; max-width: 800px;">
          To ensure high performance across <strong>300,000+ users</strong>, higher-tier administrative portals run strictly as <strong>Read-Only Cloud views</strong>. This guarantees zero device storage bloat and prevents sync conflict loops.
        </p>

        <div class="desktop-grid-3">
          <div style="padding: 20px; border-radius: 16px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); display: flex; flex-direction: column; justify-content: space-between; gap: 16px;">
            <div>
              <div style="font-weight: 700; font-size: 1.1rem; color: #fff; margin-bottom: 4px;">Division Portal</div>
              <div style="font-size: 0.82rem; color: var(--text-muted);">Schools Division Office (SDO) real-time enrollment & intervention tracking.</div>
            </div>
            <span class="badge-tag badge-basic" style="align-self: flex-start;">Read-Only Cloud</span>
          </div>

          <div style="padding: 20px; border-radius: 16px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); display: flex; flex-direction: column; justify-content: space-between; gap: 16px;">
            <div>
              <div style="font-weight: 700; font-size: 1.1rem; color: #fff; margin-bottom: 4px;">Regional Portal</div>
              <div style="font-size: 0.82rem; color: var(--text-muted);">Regional oversight of division performance metrics and resource allocation.</div>
            </div>
            <span class="badge-tag badge-basic" style="align-self: flex-start;">Read-Only Cloud</span>
          </div>

          <div style="padding: 20px; border-radius: 16px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); display: flex; flex-direction: column; justify-content: space-between; gap: 16px;">
            <div>
              <div style="font-weight: 700; font-size: 1.1rem; color: #fff; margin-bottom: 4px;">National Portal</div>
              <div style="font-size: 0.82rem; color: var(--text-muted);">Nationwide education analytics streaming across 300,000+ active educators.</div>
            </div>
            <span class="badge-tag badge-basic" style="align-self: flex-start;">Read-Only Cloud</span>
          </div>
        </div>
      </div>
    `;
  }
}

function renderModalContent() {
  if (modalType === 'enroll') {
    return `
      <div class="section-title" style="margin-bottom: 6px;">Quick Student Enrollment</div>
      <div class="section-subtitle" style="margin-bottom: 20px;">Zero friction: Only Last Name, First Name & Sex required.</div>

      <form id="form-quick-enroll" style="display: flex; flex-direction: column; gap: 14px;">
        <input type="text" class="cyber-input" id="input-last-name" placeholder="Last Name (e.g., Dela Cruz)" required />
        <input type="text" class="cyber-input" id="input-first-name" placeholder="First Name (e.g., Juan)" required />
        
        <select class="cyber-input" id="input-sex" required>
          <option value="M">Male (M)</option>
          <option value="F">Female (F)</option>
        </select>

        <input type="text" class="cyber-input" id="input-grade-section" placeholder="Grade & Section (Optional)" />

        <div style="display: flex; gap: 12px; margin-top: 10px;">
          <button type="button" class="cyber-btn cyber-btn-glass btn-modal-close" style="flex: 1;">Cancel</button>
          <button type="submit" class="cyber-btn cyber-btn-primary" style="flex: 2;">Save to Local Device</button>
        </div>
      </form>
    `;
  }

  if (modalType === 'auth') {
    return `
      <div class="section-title" style="margin-bottom: 6px;">Cloud Universal Account</div>
      <div class="section-subtitle" style="margin-bottom: 16px;">
        ${isSupabaseConfigured ? 'Sign in to sync your teacher database across devices and cloud.' : 'Supabase Credentials Setup Guide'}
      </div>

      ${!isSupabaseConfigured ? `
        <div style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.6; margin-bottom: 20px;">
          <p style="color: var(--accent-gold); font-weight: 600; margin-bottom: 8px;">To enable Cloud Sync & Login:</p>
          <ol style="margin-left: 20px; display: flex; flex-direction: column; gap: 6px;">
            <li>Go to <a href="https://supabase.com" target="_blank" style="color: var(--accent-green);">supabase.com</a> and create a FREE project.</li>
            <li>Copy your <strong>Project URL</strong> and <strong>Anon Key</strong>.</li>
            <li>Paste them into your project's <code>.env</code> file.</li>
          </ol>
        </div>
      ` : `
        ${cloudUser ? `
          <div style="text-align: center; padding: 10px 0;">
            <p style="font-size: 0.95rem; color: #fff; margin-bottom: 4px;">Signed in as:</p>
            <p style="font-size: 1.1rem; font-weight: 700; color: var(--accent-gold); font-family: monospace; margin-bottom: 20px;">${cloudUser.email}</p>
            <button type="button" class="cyber-btn cyber-btn-glass" id="btn-sign-out" style="width: 100%;">Sign Out</button>
          </div>
        ` : `
          <form id="form-auth" style="display: flex; flex-direction: column; gap: 14px;">
            ${authMessage ? `<div style="font-size: 0.8rem; color: var(--accent-gold); padding: 10px; border-radius: 10px; background: rgba(234,195,76,0.12); text-align: center; border: 1px solid rgba(234,195,76,0.3);">${authMessage}</div>` : ''}
            
            <input type="email" class="cyber-input" id="input-auth-email" placeholder="Email Address" required />
            <input type="password" class="cyber-input" id="input-auth-password" placeholder="Password (min 6 chars)" required />

            <div style="display: flex; gap: 12px; margin-top: 10px;">
              <button type="button" class="cyber-btn cyber-btn-glass btn-modal-close" style="flex: 1;">Cancel</button>
              <button type="submit" class="cyber-btn cyber-btn-primary" style="flex: 2;">${authMode === 'login' ? 'Sign In' : 'Register Account'}</button>
            </div>

            <div style="text-align: center; font-size: 0.85rem; margin-top: 10px; color: var(--text-muted);">
              ${authMode === 'login' ? 'Need an account? <a href="#" id="toggle-auth-mode" style="color: var(--accent-gold); font-weight: 600;">Register here</a>' : 'Already registered? <a href="#" id="toggle-auth-mode" style="color: var(--accent-gold); font-weight: 600;">Sign in here</a>'}
            </div>
          </form>
        `}
      `}

      <div style="display: flex; gap: 12px; margin-top: 16px;">
        <button type="button" class="cyber-btn cyber-btn-glass btn-modal-close" style="width: 100%;">Exit / Close</button>
      </div>
    `;
  }

  if (modalType === 'pair') {
    return `
      <div class="section-title" style="margin-bottom: 6px;">Department Guild Pairing</div>
      <div class="section-subtitle" style="margin-bottom: 20px;">Enter colleague's Serial Number or Department Name</div>

      <form id="form-pair-guild" style="display: flex; flex-direction: column; gap: 14px;">
        <input type="text" class="cyber-input" id="input-guild-name" placeholder="Department Name (e.g., Grade 10 Math Dept)" required />
        <input type="text" class="cyber-input" id="input-colleague-serial" placeholder="Colleague Serial (e.g., EDEN-T-2026-X9A2)" />

        <div style="display: flex; gap: 12px; margin-top: 10px;">
          <button type="button" class="cyber-btn cyber-btn-glass btn-modal-close" style="flex: 1;">Cancel</button>
          <button type="submit" class="cyber-btn cyber-btn-primary" style="flex: 2;">Connect Department Guild</button>
        </div>
      </form>
    `;
  }

  if (modalType === 'sf1') {
    return `
      <div class="section-title" style="margin-bottom: 6px;">Enrich with Official SF1</div>
      <div class="section-subtitle" style="margin-bottom: 20px;">Upload Excel/CSV SF1 to auto-populate LRNs & demographic details offline.</div>

      <input type="file" id="file-sf1-input" accept=".xlsx, .xls, .csv" class="cyber-input" style="padding: 12px;" />

      <div style="display: flex; gap: 12px; margin-top: 24px;">
        <button type="button" class="cyber-btn cyber-btn-glass btn-modal-close" style="width: 100%;">Close</button>
      </div>
    `;
  }

  return '';
}

async function renderQrCode() {
  const boxes = document.querySelectorAll('#qr-code-box');
  if (boxes && teacherProfile) {
    const dataUrl = await generateQrDataUrl(teacherProfile.serialNumber);
    if (dataUrl) {
      boxes.forEach(box => {
        box.innerHTML = `<img src="${dataUrl}" alt="Teacher QR Code" style="width: 100%; height: 100%; border-radius: 12px;" />`;
      });
    }
  }
}

function attachEventListeners() {
  // Navigation Tabs
  document.querySelectorAll('.nav-item, .sidebar-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tab = e.currentTarget.getAttribute('data-tab');
      if (tab) {
        activeTab = tab;
        renderApp();
      }
    });
  });

  // Auth Modal Trigger
  const authBtn = document.getElementById('btn-open-auth');
  if (authBtn) {
    authBtn.addEventListener('click', () => {
      modalType = 'auth';
      isModalOpen = true;
      authMessage = '';
      renderApp();
    });
  }

  // Theme Selector Event
  const themeSelector = document.getElementById('theme-selector');
  if (themeSelector) {
    themeSelector.addEventListener('change', (e) => {
      currentTheme = e.target.value;
      localStorage.setItem('eden_theme', currentTheme);
      document.documentElement.setAttribute('data-theme', currentTheme);
      renderApp();
    });
  }

  // Search Bar
  const searchInput = document.getElementById('search-student-header');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      renderApp();
      const updatedInput = document.getElementById('search-student-header');
      if (updatedInput) {
        updatedInput.focus();
        updatedInput.setSelectionRange(searchQuery.length, searchQuery.length);
      }
    });
  }

  // Quick Enroll Triggers
  const openEnrollBtns = [
    document.getElementById('fab-quick-enroll'),
    document.getElementById('btn-desktop-quick-enroll'),
    document.getElementById('btn-inline-enroll')
  ];

  openEnrollBtns.forEach(btn => {
    if (btn) {
      btn.addEventListener('click', () => {
        modalType = 'enroll';
        isModalOpen = true;
        renderApp();
      });
    }
  });

  // SF1 Triggers
  const sf1Btns = [
    document.getElementById('btn-open-sf1'),
    document.getElementById('btn-side-sf1')
  ];
  sf1Btns.forEach(btn => {
    if (btn) {
      btn.addEventListener('click', () => {
        modalType = 'sf1';
        isModalOpen = true;
        renderApp();
      });
    }
  });

  // Open Pair Guild
  const pairBtn = document.getElementById('btn-open-pair');
  if (pairBtn) {
    pairBtn.addEventListener('click', () => {
      modalType = 'pair';
      isModalOpen = true;
      renderApp();
    });
  }

  // Close Modal Buttons (by class)
  document.querySelectorAll('.btn-modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
      isModalOpen = false;
      authMessage = '';
      renderApp();
    });
  });

  // Overlay Backdrop Click to Exit
  const modalOverlay = document.getElementById('modal-overlay');
  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) {
        isModalOpen = false;
        authMessage = '';
        renderApp();
      }
    });
  }

  // Auth Toggle Mode
  const toggleAuth = document.getElementById('toggle-auth-mode');
  if (toggleAuth) {
    toggleAuth.addEventListener('click', (e) => {
      e.preventDefault();
      authMode = authMode === 'login' ? 'signup' : 'login';
      authMessage = '';
      renderApp();
    });
  }

  // Auth Form Submit
  const authForm = document.getElementById('form-auth');
  if (authForm) {
    authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('input-auth-email').value.trim();
      const password = document.getElementById('input-auth-password').value;

      if (authMode === 'login') {
        const { data, error } = await signInUser(email, password);
        if (error) {
          authMessage = error.message;
        } else {
          cloudUser = data.user;
          isModalOpen = false;
          authMessage = '';
        }
      } else {
        const { data, error } = await signUpUser(email, password, teacherProfile.fullName);
        if (error) {
          authMessage = error.message;
        } else {
          authMessage = 'Account created! (If Email Confirm is on, check your inbox).';
        }
      }
      renderApp();
    });
  }

  // Sign Out
  const signOutBtn = document.getElementById('btn-sign-out');
  if (signOutBtn) {
    signOutBtn.addEventListener('click', async () => {
      await signOutUser();
      cloudUser = null;
      isModalOpen = false;
      renderApp();
    });
  }

  // Quick Enroll Form Submit
  const enrollForm = document.getElementById('form-quick-enroll');
  if (enrollForm) {
    enrollForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const lastName = document.getElementById('input-last-name').value.trim();
      const firstName = document.getElementById('input-first-name').value.trim();
      const sex = document.getElementById('input-sex').value;
      const gradeSection = document.getElementById('input-grade-section').value.trim();

      if (lastName && firstName) {
        await db.students.add({
          lastName,
          firstName,
          sex,
          gradeSection,
          lrn: '',
          isEnriched: false,
          addedBySerial: teacherProfile.serialNumber,
          departmentId: null,
          syncedAt: null
        });
        await refreshData();
        isModalOpen = false;
        renderApp();
      }
    });
  }

  // Guild Form Submit
  const guildForm = document.getElementById('form-pair-guild');
  if (guildForm) {
    guildForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('input-guild-name').value.trim();
      const colleagueSerial = document.getElementById('input-colleague-serial').value.trim();
      if (name) {
        await db.departments.add({
          name,
          createdBySerial: teacherProfile.serialNumber,
          pairedSerials: colleagueSerial ? [colleagueSerial] : [],
          createdDate: new Date().toISOString()
        });
        await refreshData();
        isModalOpen = false;
        renderApp();
      }
    });
  }

  // SF1 Upload Listener
  const sf1FileInput = document.getElementById('file-sf1-input');
  if (sf1FileInput) {
    sf1FileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        try {
          const parsed = await parseSf1File(file);
          if (parsed.length > 0) {
            for (const s of parsed) {
              await db.students.add({
                ...s,
                gradeSection: 'SF1 Import',
                addedBySerial: teacherProfile.serialNumber,
                syncedAt: new Date().toISOString()
              });
            }
            await refreshData();
            alert(`Successfully enriched ${parsed.length} student records from SF1!`);
          } else {
            alert('File parsed, but no valid student records found.');
          }
          isModalOpen = false;
          renderApp();
        } catch (err) {
          alert('Failed to parse SF1 file: ' + err.message);
        }
      }
    });
  }

  // Delete Student
  document.querySelectorAll('.btn-delete-student').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = Number(e.currentTarget.getAttribute('data-id'));
      if (id) {
        await db.students.delete(id);
        await refreshData();
        renderApp();
      }
    });
  });

  // PWA Install Prompt
  const installBtn = document.getElementById('btn-install-pwa');
  if (installBtn && deferredPrompt) {
    installBtn.addEventListener('click', async () => {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        console.log('User accepted the install prompt');
      }
      deferredPrompt = null;
      renderApp();
    });
  }
}

// Global Keydown (Escape key closes modal)
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && isModalOpen) {
    isModalOpen = false;
    authMessage = '';
    renderApp();
  }
});

// PWA Install Event Listeners
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  renderApp(); // Re-render to show the install button
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  renderApp(); // Re-render to hide the install button
});

// Start application
initApp();
