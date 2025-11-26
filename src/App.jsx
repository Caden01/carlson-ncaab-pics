import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Leaderboard from './pages/Leaderboard';
import Admin from './pages/Admin';
import Profile from './pages/Profile';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="loading-screen">Loading...</div>;
  if (!user) return <Navigate to="/login" />;

  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route path="/" element={<Layout />}>
            <Route index element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } />
            <Route path="leaderboard" element={
              <ProtectedRoute>
                <Leaderboard />
              </ProtectedRoute>
            } />
            <Route path="profile" element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            } />
            <Route path="admin" element={
              <ProtectedRoute>
                <Admin />
              </ProtectedRoute>
            } />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
