import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { usePlan } from '../hooks/usePlan.js';
import { useLocale, useT } from '../i18n/LocaleContext.jsx';
import { useKiosk } from '../hooks/useKiosk.js';
import { useInstallPrompt } from '../hooks/useInstallPrompt.js';
import ChangePasswordModal from './ChangePasswordModal.jsx';
import {
  IconDashboard,
  IconCalendar,
  IconBookings,
  IconGuests,
  IconRooms,
  IconSettings,
  IconPricing,
} from './Icons.jsx';

const ALL_NAV_ITEMS = [
  { to: '/dashboard', key: 'dashboard', Icon: IconDashboard },
  { to: '/calendar',  key: 'calendar',  Icon: IconCalendar  },
  { to: '/bookings',  key: 'bookings',  Icon: IconBookings  },
  { to: '/guests',    key: 'guests',    Icon: IconGuests    },
  { to: '/rooms',     key: 'rooms',     Icon: IconRooms     },
  { to: '/settings',  key: 'settings',  Icon: IconSettings  },
  { to: '/pricing',   key: 'pricing',   Icon: IconPricing   },
];

const KIOSK_NAV_KEYS = new Set(['calendar', 'bookings']);

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const plan = usePlan();
  const { property } = useLocale();
  const t = useT();
  const { kiosk, isFullscreen, enterFullscreen, exitFullscreen } = useKiosk();
  const { canInstall, triggerInstall } = useInstallPrompt();
  const [showChangePassword, setShowChangePassword] = useState(false);

  const isReceptionKiosk = kiosk && user?.role === 'reception';
  const navItems = isReceptionKiosk
    ? ALL_NAV_ITEMS.filter((i) => KIOSK_NAV_KEYS.has(i.key))
    : ALL_NAV_ITEMS;

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
        <div className="brand-sub">{t('tagline')}</div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        <div className="nav-section-label">{t('main')}</div>

        {navItems.map(({ to, key, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            <Icon />
            {t(key)}
          </NavLink>
        ))}
      </nav>

      {/* Footer — property + user + logout */}
      <div className="sidebar-footer">
        {property && !isReceptionKiosk && (
          <>
            <div className="footer-label">{t('propertyLabel')}</div>
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

        {/* Fullscreen controls */}
        {!isFullscreen ? (
          <button className="sidebar-util-btn" onClick={enterFullscreen} title="Enter fullscreen">
            ⛶ Enter fullscreen
          </button>
        ) : (
          <button className="sidebar-util-btn sidebar-util-btn--subtle" onClick={exitFullscreen} title="Exit fullscreen">
            ✕ Exit fullscreen
          </button>
        )}

        {/* Install prompt */}
        {canInstall && (
          <button className="sidebar-util-btn sidebar-util-btn--subtle" onClick={triggerInstall}>
            ↓ Install NestBook app
          </button>
        )}

        <button className="sidebar-util-btn" onClick={() => setShowChangePassword(true)}>
          Change password
        </button>

        {!isReceptionKiosk && (
          <button className="sidebar-logout-btn" onClick={handleLogout}>
            {t('signOut')}
          </button>
        )}
      </div>

      {showChangePassword && (
        <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
      )}
    </aside>
  );
}
