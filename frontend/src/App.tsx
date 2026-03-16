// Agent: Rohan | Sprint: 01 | Date: 2026-03-16
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AppShell from './components/AppShell/AppShell'
import AuthPage from './components/AuthPage/AuthPage'
import OverviewPage from './pages/OverviewPage'
import InfrastructurePage from './pages/InfrastructurePage'
import AnomaliesPage from './pages/AnomaliesPage'
import AgentsPage from './pages/AgentsPage'
import MemoryPage from './pages/MemoryPage'
import IaCPage from './pages/IaCPage'
import { AuthProvider, useAuth } from './context/AuthContext'

function ProtectedRoutes() {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/infra" element={<InfrastructurePage />} />
        <Route path="/anomalies" element={<AnomaliesPage />} />
        <Route path="/agents" element={<AgentsPage />} />
        <Route path="/memory" element={<MemoryPage />} />
        <Route path="/iac" element={<IaCPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
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
          <Route path="/*" element={<ProtectedRoutes />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
