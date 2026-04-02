import { Navigate } from 'react-router-dom';
import { useAuth }   from '../auth/AuthContext.jsx';

export default function AdminRoute({ children }) {
  const { user, isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.email !== 'demo@nestbook.io') return <Navigate to="/dashboard" replace />;
  return children;
}
