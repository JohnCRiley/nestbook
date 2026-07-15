import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext.jsx';
import { LocaleProvider, useLocale, useT } from './i18n/LocaleContext.jsx';
import ProtectedRoute   from './components/ProtectedRoute.jsx';
import Sidebar          from './components/Sidebar.jsx';
import Login            from './pages/Login.jsx';
import Register         from './pages/Register.jsx';
import Dashboard        from './pages/Dashboard.jsx';
import Calendar         from './pages/Calendar.jsx';
import Bookings         from './pages/Bookings.jsx';
import Guests           from './pages/Guests.jsx';
import Rooms            from './pages/Rooms.jsx';
import Reports          from './pages/Reports.jsx';
import Settings         from './pages/Settings.jsx';
import Pricing          from './pages/Pricing.jsx';
import ActivityLog      from './pages/ActivityLog.jsx';
import Charges          from './pages/Charges.jsx';
import PaymentSuccess   from './pages/PaymentSuccess.jsx';
import PaymentCancel    from './pages/PaymentCancel.jsx';
import Billing          from './pages/Billing.jsx';
import SocialKit        from './pages/SocialKit.jsx';
import GuestMailer      from './pages/GuestMailer.jsx';
import GuestNote        from './pages/GuestNote.jsx';
import VerifyEmail      from './pages/VerifyEmail.jsx';
import ForgotPassword  from './pages/ForgotPassword.jsx';
import ResetPassword   from './pages/ResetPassword.jsx';
import AdminRoute         from './admin/AdminRoute.jsx';
import AdminLayout        from './admin/AdminLayout.jsx';
import SuperAdminLogin    from './admin/SuperAdminLogin.jsx';
import UpgradeBanner      from './components/UpgradeBanner.jsx';

function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);
  useEffect(() => {
    const go = () => setOffline(false);
    const stop = () => setOffline(true);
    window.addEventListener('online',  go);
    window.addEventListener('offline', stop);
    return () => { window.removeEventListener('online', go); window.removeEventListener('offline', stop); };
  }, []);
  if (!offline) return null;
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
      background: '#1e293b', color: '#f1f5f9',
      padding: '8px 16px', textAlign: 'center',
      fontSize: '0.85rem', fontWeight: 600,
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    }}>
      <span>⚠</span>
      <span>You are offline — changes will not be saved until your connection is restored.</span>
    </div>
  );
}

function EmailVerifyBanner() {
  const { user, token, updateUser } = useAuth();
  const t = useT();
  const [dismissed, setDismissed] = useState(false);

  // Refresh email_verified from the server on mount — handles the case where the
  // user verified in a different browser or device and localStorage wasn't updated.
  useEffect(() => {
    if (!user || user.email_verified || !token) return;
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { if (data.email_verified) updateUser({ email_verified: true }); })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (dismissed || !user || user.email_verified) return null;

  return (
    <div className="verify-email-banner">
      <span>{t('verify.banner')}</span>
      <button
        className="verify-email-banner-dismiss"
        onClick={() => setDismissed(true)}
        aria-label={t('verify.dismiss')}
      >
        ✕
      </button>
    </div>
  );
}

const LANG_NAMES = { en: 'English', fr: 'Français', de: 'Deutsch', es: 'Español', nl: 'Nederlands' };
const SUPPORTED_LANGS = ['en', 'fr', 'de', 'es', 'nl'];

function LangSuggestionModal() {
  const { property } = useLocale();
  const t = useT();
  const navigate = useNavigate();
  const [suggestedLang, setSuggestedLang] = useState(null);

  useEffect(() => {
    if (!property) return;
    if (localStorage.getItem('nb_lang_modal_dismissed')) return;
    const propLocale = property.locale ?? 'en';
    try {
      const langs = navigator.languages?.length ? navigator.languages : [navigator.language || ''];
      for (const l of langs) {
        const code = l.toLowerCase().split('-')[0];
        if (SUPPORTED_LANGS.includes(code) && code !== propLocale) {
          setSuggestedLang(code);
          return;
        }
      }
    } catch {}
  }, [property?.id]);

  if (!suggestedLang) return null;

  function dismiss() {
    localStorage.setItem('nb_lang_modal_dismissed', '1');
    setSuggestedLang(null);
  }

  function confirm() {
    localStorage.setItem('nb_lang_modal_dismissed', '1');
    setSuggestedLang(null);
    navigate(`/settings?lang=${suggestedLang}`);
  }

  const langName = LANG_NAMES[suggestedLang] ?? suggestedLang;

  return (
    <div className="lang-modal-overlay" onClick={dismiss}>
      <div className="lang-modal" onClick={e => e.stopPropagation()}>
        <p className="lang-modal-title">{t('lang.modal.title')}</p>
        <p className="lang-modal-body">
          {t('lang.modal.body').replace(/\{lang\}/g, langName)}
        </p>
        <div className="lang-modal-actions">
          <button className="lang-modal-confirm" onClick={confirm}>
            {t('lang.modal.confirm').replace(/\{lang\}/g, langName)}
          </button>
          <button className="lang-modal-dismiss" onClick={dismiss}>
            {t('lang.modal.dismiss')}
          </button>
        </div>
      </div>
    </div>
  );
}

// Shows "Viewing: [Property Name]" only when the user has more than one property.
function PropertyBanner() {
  const { property, properties } = useLocale();
  const t = useT();
  if (!property || properties.length <= 1) return null;
  return (
    <div className="property-banner">
      {t('viewingProperty')} <strong>{property.name}</strong>
    </div>
  );
}

function RouteTracker() {
  const location = useLocation();
  useEffect(() => {
    if (window.gtag) {
      window.gtag('config', 'G-5R87S4LXP6', { page_path: location.pathname });
    }
  }, [location]);
  return null;
}

// Full-screen layout for charges_staff — no sidebar, just the charges page
function ChargesStaffShell() {
  const { user, logout } = useAuth();
  const { property } = useLocale();
  const t = useT();
  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <header style={{
        background: 'var(--header-bg)', color: 'var(--header-text)',
        padding: '12px 24px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontWeight: 800, fontSize: '1.1rem', letterSpacing: '-0.02em' }}>NestBook</span>
          {property?.name && (
            <span style={{ fontSize: '0.85rem', color: 'var(--header-text)', opacity: 0.65, fontWeight: 500 }}>
              {property.name}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: '0.82rem', color: 'var(--header-text)', opacity: 0.7 }}>{user?.name}</span>
          <button
            onClick={() => { logout(); window.location.href = '/app/login'; }}
            style={{
              background: 'rgba(0,0,0,0.08)', border: 'none', borderRadius: 6,
              color: 'var(--header-text)', padding: '6px 14px', fontSize: '0.82rem',
              fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {t('signOut')}
          </button>
        </div>
      </header>
      <div style={{ padding: '24px 16px', maxWidth: 960, margin: '0 auto' }}>
        <Charges />
      </div>
    </div>
  );
}

function AppLayout() {
  const { user } = useAuth();

  // charges_staff users get a stripped-down full-screen charges interface
  if (user?.role === 'charges_staff') {
    return <ChargesStaffShell />;
  }

  return (
    <div className="layout">
      <OfflineBanner />
      <Sidebar />
      <main className="main-content">
        <EmailVerifyBanner />
        <LangSuggestionModal />
        <UpgradeBanner />
        <PropertyBanner />
        <Routes>
          <Route path="/"          element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/calendar"  element={<Calendar  />} />
          <Route path="/bookings"  element={<Bookings  />} />
          <Route path="/guests"    element={<Guests    />} />
          <Route path="/rooms"     element={<Rooms     />} />
          <Route path="/reports"       element={<Reports      />} />
          <Route path="/social-kit"   element={<SocialKit    />} />
          <Route path="/guest-mailer" element={<GuestMailer  />} />
          <Route path="/activity-log" element={<ActivityLog  />} />
          <Route path="/billing"   element={<Billing   />} />
          <Route path="/settings"  element={<Settings  />} />
          <Route path="/pricing"   element={<Pricing   />} />
          <Route path="/charges"   element={<Charges   />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter basename="/app">
      <RouteTracker />
      <LocaleProvider>
        <Routes>
          <Route path="/login"        element={<Login          />} />
          <Route path="/register"     element={<Register       />} />
          <Route path="/verify-email"    element={<VerifyEmail    />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password"  element={<ResetPassword  />} />
          <Route path="/success"      element={<PaymentSuccess />} />
          <Route path="/cancel"       element={<PaymentCancel  />} />
          <Route path="/guest-note"    element={<GuestNote      />} />
          <Route path="/super-admin/login" element={<SuperAdminLogin />} />
          <Route path="/super-admin/*" element={
            <AdminRoute>
              <AdminLayout />
            </AdminRoute>
          } />
          <Route path="/*" element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          } />
        </Routes>
      </LocaleProvider>
      </BrowserRouter>
    </AuthProvider>
  );
}
