import { NavLink } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  IconDashboard,
  IconCalendar,
  IconBookings,
  IconGuests,
  IconRooms,
  IconSettings,
} from './Icons.jsx';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', Icon: IconDashboard },
  { to: '/calendar',  label: 'Calendar',  Icon: IconCalendar  },
  { to: '/bookings',  label: 'Bookings',  Icon: IconBookings  },
  { to: '/guests',    label: 'Guests',    Icon: IconGuests    },
  { to: '/rooms',     label: 'Rooms',     Icon: IconRooms     },
  { to: '/settings',  label: 'Settings',  Icon: IconSettings  },
];

export default function Sidebar() {
  const [property, setProperty] = useState(null);

  useEffect(() => {
    fetch('/api/properties')
      .then((r) => r.json())
      .then(([first]) => setProperty(first ?? null))
      .catch(() => {});
  }, []);

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

      {/* Property name (fetched from API) */}
      <div className="sidebar-footer">
        {property ? (
          <>
            <div className="footer-label">Property</div>
            <div className="footer-property">{property.name}</div>
            <div className="footer-type">{property.type}</div>
          </>
        ) : (
          <div className="footer-label">Loading…</div>
        )}
      </div>
    </aside>
  );
}
