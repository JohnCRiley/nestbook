import { NavLink, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { usePlan } from '../hooks/usePlan.js';
import { apiFetch } from '../utils/apiFetch.js';
import {
  IconDashboard,
  IconCalendar,
  IconBookings,
  IconGuests,
  IconRooms,
  IconSettings,
  IconPricing,
} from './Icons.jsx';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', Icon: IconDashboard },
  { to: '/calendar',  label: 'Calendar',  Icon: IconCalendar  },
  { to: '/bookings',  label: 'Bookings',  Icon: IconBookings  },
  { to: '/guests',    label: 'Guests',    Icon: IconGuests    },
  { to: '/rooms',     label: 'Rooms',     Icon: IconRooms     },
  { to: '/settings',  label: 'Settings',  Icon: IconSettings  },
  { to: '/pricing',   label: 'Pricing',   Icon: IconPricing   },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const plan = usePlan();
  const [property, setProperty] = useState(null);

  useEffect(() => {
    apiFetch('/api/properties')
      .then((r) => r.json())
      .then(([first]) => setProperty(first ?? null))
      .catch(() => {});
  }, []);

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <aside className="sidebar">
      {/* Brand */}
      <div className="sidebar-brand">
        <div className="brand-name">
          <span className="brand-dot" />
          NestBook
        </div>
        <div className="brand-sub">Property Management</div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        <div className="nav-section-label">Menu</div>

        {NAV_ITEMS.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            <Icon />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer — property + user + logout */}
      <div className="sidebar-footer">
        {property && (
          <>
            <div className="footer-label">Property</div>
            <div className="footer-property-row">
              <span className="footer-property">{property.name}</span>
              <span className={`sidebar-plan-badge sidebar-plan-badge-${plan}`}>
                {plan === 'multi' ? 'Multi' : plan.charAt(0).toUpperCase() + plan.slice(1)}
              </span>
            </div>
            <div className="footer-type">{property.type}</div>
          </>
        )}

        <div className="sidebar-user">
          <div className="sidebar-user-name">{user?.name ?? 'User'}</div>
          <div className="sidebar-user-role">{user?.role ?? ''}</div>
        </div>

        <button className="sidebar-logout-btn" onClick={handleLogout}>
          Sign out
        </button>
      </div>
    </aside>
  );
}
