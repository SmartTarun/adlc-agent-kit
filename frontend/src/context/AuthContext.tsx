// Agent: Rohan | Sprint: 01 | Date: 2026-03-16
import { createContext, useContext, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import type { User } from '../types'

interface AuthContextValue {
  user: User | null
  isAuthenticated: boolean
  login: (username: string, password: string) => Promise<boolean>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

// Dummy credentials for Sprint-01 — OAuth deferred to Sprint-02
const DUMMY_USERS: Record<string, string> = {
  admin: 'infraviz2026',
  demo: 'demo1234',
  tarun: 'panchayat01',
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem('infraviz_user')
    return stored ? (JSON.parse(stored) as User) : null
  })

  const login = useCallback(async (username: string, password: string): Promise<boolean> => {
    const valid = DUMMY_USERS[username.toLowerCase()] === password
    if (!valid) return false
    const u: User = { username, token: btoa(`${username}:${Date.now()}`) }
    setUser(u)
    localStorage.setItem('infraviz_user', JSON.stringify(u))
    return true
  }, [])

  const logout = useCallback(() => {
    setUser(null)
    localStorage.removeItem('infraviz_user')
  }, [])

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: user !== null, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
