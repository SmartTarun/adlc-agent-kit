// Agent: rohan | Sprint: 01 | Date: 2026-03-16
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AppShell from './components/AppShell/AppShell'
import AuthPage from './components/AuthPage/AuthPage'
import CanvasView from './components/CanvasView/CanvasView'
import DashboardView from './components/DashboardView/DashboardView'
import TerminalView from './components/TerminalView/TerminalView'
import OverviewPage from './pages/OverviewPage'
import { AuthProvider, useAuth } from './context/AuthContext'

function ProtectedRoutes() {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return (
    <AppShell>
      <Routes>
        <Route path="/"          element={<OverviewPage />} />
        <Route path="/canvas"    element={<CanvasView />} />
        <Route path="/dashboard" element={<DashboardView />} />
        <Route path="/terminal"  element={<TerminalView />} />
        <Route path="*"          element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<AuthPage />} />
          <Route path="/*"     element={<ProtectedRoutes />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
