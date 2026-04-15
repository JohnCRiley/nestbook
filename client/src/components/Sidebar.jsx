import { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
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
  IconLogout,
  IconBuildings,
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
  const navigate  = useNavigate();
  const location  = useLocation();
  const plan      = usePlan();
  const { property, properties, switchProperty } = useLocale();
  const t = useT();
  const { kiosk, isFullscreen, enterFullscreen, exitFullscreen } = useKiosk();
  const { canInstall, triggerInstall } = useInstallPrompt();
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [tabletExpanded, setTabletExpanded] = useState(false);
  const sidebarRef = useRef(null);

  // Close mobile menu and tablet expanded on route change
  useEffect(() => { setMobileOpen(false); setTabletExpanded(false); }, [location.pathname]);

  // Close mobile menu and tablet expanded on Escape
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') {
        setMobileOpen(false);
        setTabletExpanded(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Close tablet expanded panel on click outside the sidebar element
  useEffect(() => {
    if (!tabletExpanded) return;
    const handler = (e) => {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target)) {
        setTabletExpanded(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [tabletExpanded]);

  const isReceptionKiosk = kiosk && user?.role === 'reception';
  const navItems = isReceptionKiosk
    ? ALL_NAV_ITEMS.filter((i) => KIOSK_NAV_KEYS.has(i.key))
    : ALL_NAV_ITEMS;

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <>
      {/* ── Mobile top bar (hidden on tablet/desktop via CSS) ─────────────── */}
      <header className="mobile-topbar">
        <button
          className="hamburger-btn"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
        >
          ☰
        </button>
        <span className="mobile-topbar-brand">NestBook</span>
      </header>

      {/* ── Overlay (mobile only, shown when menu is open) ────────────────── */}
      {mobileOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Tablet expanded overlay backdrop (visual dim only — close is handled by mousedown listener) */}
      {tabletExpanded && (
        <div className="sidebar-overlay sidebar-tablet-overlay" aria-hidden="true" />
      )}

      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <aside
        ref={sidebarRef}
        className={`sidebar${mobileOpen ? ' sidebar--mobile-open' : ''}${tabletExpanded ? ' sidebar--tablet-expanded' : ''}`}
      >

        {/* Close button — visible on mobile only */}
        <button
          className="sidebar-close-btn"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation"
        >
          ✕
        </button>

        {/* Brand */}
        <div className="sidebar-brand">
          <div className="brand-name">
            <span className="brand-dot" />
            <span className="brand-label">NestBook</span>
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
              data-tooltip={t(key)}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              <Icon />
              <span className="nav-link-label">{t(key)}</span>
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="sidebar-footer">
          {/* Buildings button — shown only in tablet icon-tray mode, opens property switcher */}
          {plan === 'multi' && properties.length > 1 && !isReceptionKiosk && (
            <button
              className="sidebar-tray-prop-btn"
              onClick={() => setTabletExpanded((v) => !v)}
              data-tooltip={t('propertiesBtn')}
              title={t('propertiesBtn')}
            >
              <IconBuildings />
            </button>
          )}

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

              {/* Property switcher — Multi plan only, only when >1 property exists */}
              {plan === 'multi' && properties.length > 1 && (
                <div className="property-switcher">
                  {properties.map((p) => (
                    <button
                      key={p.id}
                      className={`property-switch-item${p.id === property.id ? ' active' : ''}`}
                      onClick={() => { switchProperty(p); setTabletExpanded(false); }}
                    >
                      <span className="property-switch-name">{p.name}</span>
                      {p.id === property.id && <span className="property-switch-check">✓</span>}
                    </button>
                  ))}
                  {properties.length < 5 && (
                    <NavLink to="/settings" className="property-add-link">
                      {t('addProperty')}
                    </NavLink>
                  )}
                </div>
              )}
            </>
          )}

          <div className="sidebar-user">
            <div className="sidebar-user-name">{user?.name ?? 'User'}</div>
            <div className="sidebar-user-role">{user?.role ?? ''}</div>
          </div>

          {/* Fullscreen controls */}
          {!isFullscreen ? (
            <button className="sidebar-util-btn" onClick={enterFullscreen} title={t('enterFullscreen')}>
              ⛶ {t('enterFullscreen')}
            </button>
          ) : (
            <button className="sidebar-util-btn sidebar-util-btn--subtle" onClick={exitFullscreen} title={t('exitFullscreen')}>
              ✕ {t('exitFullscreen')}
            </button>
          )}

          {/* Install prompt */}
          {canInstall && (
            <button className="sidebar-util-btn sidebar-util-btn--subtle" onClick={triggerInstall}>
              {t('installApp')}
            </button>
          )}

          <button className="sidebar-util-btn" onClick={() => setShowChangePassword(true)}>
            {t('changePassword')}
          </button>

          {!isReceptionKiosk && (
            <button className="sidebar-logout-btn" onClick={handleLogout} title={t('signOut')}>
              <IconLogout />
              <span className="logout-label">{t('signOut')}</span>
            </button>
          )}
        </div>
      </aside>

      {showChangePassword && (
        <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
      )}
    </>
  );
}
