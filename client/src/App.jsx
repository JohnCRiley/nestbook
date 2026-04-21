import { useState } from 'react';
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
import PaymentSuccess   from './pages/PaymentSuccess.jsx';
import PaymentCancel    from './pages/PaymentCancel.jsx';
import VerifyEmail      from './pages/VerifyEmail.jsx';
import AdminRoute         from './admin/AdminRoute.jsx';
import AdminLayout        from './admin/AdminLayout.jsx';
import SuperAdminLogin    from './admin/SuperAdminLogin.jsx';

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

function AppLayout() {
  return (
    <div className="layout">
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
          <Route path="/reports"   element={<Reports   />} />
          <Route path="/settings"  element={<Settings  />} />
          <Route path="/pricing"   element={<Pricing   />} />
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
