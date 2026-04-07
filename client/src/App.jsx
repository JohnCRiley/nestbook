import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext.jsx';
import { LocaleProvider } from './i18n/LocaleContext.jsx';
import ProtectedRoute   from './components/ProtectedRoute.jsx';
import Sidebar          from './components/Sidebar.jsx';
import Login            from './pages/Login.jsx';
import Register         from './pages/Register.jsx';
import Dashboard        from './pages/Dashboard.jsx';
import Calendar         from './pages/Calendar.jsx';
import Bookings         from './pages/Bookings.jsx';
import Guests           from './pages/Guests.jsx';
import Rooms            from './pages/Rooms.jsx';
import Settings         from './pages/Settings.jsx';
import Pricing          from './pages/Pricing.jsx';
import PaymentSuccess   from './pages/PaymentSuccess.jsx';
import PaymentCancel    from './pages/PaymentCancel.jsx';
import AdminRoute         from './admin/AdminRoute.jsx';
import AdminLayout        from './admin/AdminLayout.jsx';
import SuperAdminLogin    from './admin/SuperAdminLogin.jsx';

function AppLayout() {
  return (
    <div className="layout">
      <Sidebar />
      <main className="main-content">
        <Routes>
          <Route path="/"          element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/calendar"  element={<Calendar  />} />
          <Route path="/bookings"  element={<Bookings  />} />
          <Route path="/guests"    element={<Guests    />} />
          <Route path="/rooms"     element={<Rooms     />} />
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
          <Route path="/login"    element={<Login          />} />
          <Route path="/register" element={<Register       />} />
          <Route path="/success"  element={<PaymentSuccess />} />
          <Route path="/cancel"   element={<PaymentCancel  />} />
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
