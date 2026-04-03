import { NavLink, useNavigate, Routes, Route } from 'react-router-dom';
import Overview      from './pages/Overview.jsx';
import Properties    from './pages/Properties.jsx';
import Users         from './pages/Users.jsx';
import Revenue       from './pages/Revenue.jsx';
import AdminSettings from './pages/AdminSettings.jsx';
import { clearSASession } from './saApiFetch.js';

const NAV = [
  { to: '/super-admin',            label: 'Overview',    end: true },
  { to: '/super-admin/properties', label: 'Properties'            },
  { to: '/super-admin/users',      label: 'Users'                 },
  { to: '/super-admin/revenue',    label: 'Revenue'               },
  { to: '/super-admin/settings',   label: 'Settings'              },
];

export default function AdminLayout() {
  const navigate = useNavigate();

  function handleLogout() {
    clearSASession();
    navigate('/super-admin/login', { replace: true });
  }

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <div className="admin-brand-name">NestBook</div>
          <div className="admin-brand-sub">Super Admin</div>
        </div>

        <nav className="admin-nav">
          {NAV.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `admin-nav-link${isActive ? ' active' : ''}`}
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="admin-sidebar-footer">
          <button
            className="admin-switch-btn"
            onClick={() => navigate('/dashboard')}
          >
            ← Customer view
          </button>
          <button
            className="admin-switch-btn"
            style={{ marginTop: 8, color: '#f87171', borderColor: '#7f1d1d' }}
            onClick={handleLogout}
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <Routes>
          <Route index                    element={<Overview      />} />
          <Route path="properties"        element={<Properties    />} />
          <Route path="users"             element={<Users         />} />
          <Route path="revenue"           element={<Revenue       />} />
          <Route path="settings"          element={<AdminSettings />} />
        </Routes>
      </main>
    </div>
  );
}
