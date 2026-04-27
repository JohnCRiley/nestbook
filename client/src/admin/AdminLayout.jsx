import { useState } from 'react';
import { NavLink, useNavigate, Routes, Route } from 'react-router-dom';
import Overview      from './pages/Overview.jsx';
import Properties    from './pages/Properties.jsx';
import Users         from './pages/Users.jsx';
import Revenue       from './pages/Revenue.jsx';
import AdminSettings from './pages/AdminSettings.jsx';
import MailingList   from './pages/MailingList.jsx';
import AuditLog      from './pages/AuditLog.jsx';
import { clearSASession } from './saApiFetch.js';

const NAV = [
  { to: '/super-admin',              label: 'Overview',     end: true,  icon: <IconOverview /> },
  { to: '/super-admin/properties',   label: 'Properties',               icon: <IconProperties /> },
  { to: '/super-admin/users',        label: 'Users',                    icon: <IconUsers /> },
  { to: '/super-admin/revenue',      label: 'Revenue',                  icon: <IconRevenue /> },
  { to: '/super-admin/audit-log',    label: 'Audit Log',                icon: <IconAuditLog /> },
  { to: '/super-admin/mailing-list', label: 'Mailing List',             icon: <IconMail /> },
  { to: '/super-admin/settings',     label: 'Settings',                 icon: <IconSettings /> },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  function handleLogout() {
    clearSASession();
    navigate('/super-admin/login', { replace: true });
  }

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="admin-layout">
      {/* ── Mobile top bar (hamburger) ────────────────────────────────────── */}
      <div className="admin-topbar">
        <button
          className="admin-hamburger"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open menu"
        >
          <HamburgerIcon />
        </button>
        <span className="admin-topbar-title">NestBook Admin</span>
      </div>

      {/* ── Mobile overlay backdrop ───────────────────────────────────────── */}
      <div
        className={`admin-sidebar-overlay${sidebarOpen ? ' visible' : ''}`}
        onClick={closeSidebar}
      />

      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <aside className={`admin-sidebar${sidebarOpen ? ' open' : ''}`}>
        {/* Close button (mobile only) */}
        <button className="admin-sidebar-close" onClick={closeSidebar} aria-label="Close menu">
          ✕
        </button>

        <div className="admin-brand">
          <div className="admin-brand-name">NestBook</div>
          <div className="admin-brand-sub">Super Admin</div>
        </div>

        <nav className="admin-nav">
          {NAV.map(({ to, label, end, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              data-tooltip={label}
              className={({ isActive }) => `admin-nav-link${isActive ? ' active' : ''}`}
              onClick={closeSidebar}
            >
              <span className="admin-nav-icon">{icon}</span>
              <span className="admin-nav-text">{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="admin-sidebar-footer">
          <button
            className="admin-switch-btn"
            onClick={() => { navigate('/dashboard'); closeSidebar(); }}
            title="Customer view"
          >
            <span className="admin-nav-icon"><IconCustomerView /></span>
            <span className="admin-switch-btn-label">← Customer view</span>
          </button>
          <button
            className="admin-switch-btn"
            style={{ marginTop: 8, color: '#f87171', borderColor: '#7f1d1d' }}
            onClick={handleLogout}
            title="Sign out"
          >
            <span className="admin-nav-icon"><IconSignOut /></span>
            <span className="admin-switch-btn-label">Sign out</span>
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <Routes>
          <Route index                    element={<Overview      />} />
          <Route path="properties"        element={<Properties    />} />
          <Route path="users"             element={<Users         />} />
          <Route path="revenue"           element={<Revenue       />} />
          <Route path="audit-log"         element={<AuditLog      />} />
          <Route path="mailing-list"      element={<MailingList   />} />
          <Route path="settings"          element={<AdminSettings />} />
        </Routes>
      </main>
    </div>
  );
}

// ── SVG Icons ─────────────────────────────────────────────────────────────────

function IconOverview() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
    </svg>
  );
}

function IconProperties() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  );
}

function IconUsers() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
}

function IconRevenue() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23"/>
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
    </svg>
  );
}

function IconAuditLog() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="6" x2="20" y2="6"/>
      <line x1="4" y1="10" x2="14" y2="10"/>
      <line x1="4" y1="14" x2="20" y2="14"/>
      <line x1="4" y1="18" x2="12" y2="18"/>
    </svg>
  );
}

function IconMail() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
      <polyline points="22,6 12,13 2,6"/>
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}

function IconCustomerView() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  );
}

function IconSignOut() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  );
}

function HamburgerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6"/>
      <line x1="3" y1="12" x2="21" y2="12"/>
      <line x1="3" y1="18" x2="21" y2="18"/>
    </svg>
  );
}
