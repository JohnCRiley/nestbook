import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar    from './components/Sidebar.jsx';
import Dashboard  from './pages/Dashboard.jsx';
import Calendar   from './pages/Calendar.jsx';
import Bookings   from './pages/Bookings.jsx';
import Guests     from './pages/Guests.jsx';
import Rooms      from './pages/Rooms.jsx';
import Settings   from './pages/Settings.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <div className="layout">
        <Sidebar />

        <main className="main-content">
          <Routes>
            {/* Redirect bare "/" to the dashboard */}
            <Route path="/"          element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/calendar"  element={<Calendar  />} />
            <Route path="/bookings"  element={<Bookings  />} />
            <Route path="/guests"    element={<Guests    />} />
            <Route path="/rooms"     element={<Rooms     />} />
            <Route path="/settings"  element={<Settings  />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
