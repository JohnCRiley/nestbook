import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
import VerifyEmail      from './pages/VerifyEmail.jsx';
import AdminRoute         from './admin/AdminRoute.jsx';
import AdminLayout        from './admin/AdminLayout.jsx';
import SuperAdminLogin    from './admin/SuperAdminLogin.jsx';

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
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  // Only show for users who explicitly have email_verified === false
  // (new registrations). Existing/undefined values don't trigger the banner.
  if (dismissed || !user || user.email_verified !== false) return null;

  return (
    <div className="verify-email-banner">
      <span>
        Please verify your email address. Check your inbox for a verification link from NestBook.
      </span>
      <button
        className="verify-email-banner-dismiss"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
      >
        ✕
      </button>
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

// Full-screen layout for charges_staff — no sidebar, just the charges page
function ChargesStaffShell() {
  const { user, logout } = useAuth();
  const { property } = useLocale();
  const t = useT();
  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <header style={{
        background: '#1a4710', color: '#fff',
        padding: '12px 24px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontWeight: 800, fontSize: '1.1rem', letterSpacing: '-0.02em' }}>NestBook</span>
          {property?.name && (
            <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.65)', fontWeight: 500 }}>
              {property.name}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.7)' }}>{user?.name}</span>
          <button
            onClick={() => { logout(); window.location.href = '/app/login'; }}
            style={{
              background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 6,
              color: '#fff', padding: '6px 14px', fontSize: '0.82rem',
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
        <PropertyBanner />
        <Routes>
          <Route path="/"          element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/calendar"  element={<Calendar  />} />
          <Route path="/bookings"  element={<Bookings  />} />
          <Route path="/guests"    element={<Guests    />} />
          <Route path="/rooms"     element={<Rooms     />} />
          <Route path="/reports"       element={<Reports      />} />
          <Route path="/activity-log" element={<ActivityLog  />} />
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
      <LocaleProvider>
        <Routes>
          <Route path="/login"        element={<Login          />} />
          <Route path="/register"     element={<Register       />} />
          <Route path="/verify-email" element={<VerifyEmail    />} />
          <Route path="/success"      element={<PaymentSuccess />} />
          <Route path="/cancel"       element={<PaymentCancel  />} />
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
