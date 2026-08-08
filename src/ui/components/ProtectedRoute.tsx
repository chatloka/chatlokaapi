import { useEffect, useState } from "react"
import { Navigate } from "react-router-dom"
import { DashboardSkeleton } from "@/components/Skeletons"

interface User {
  id: string
  name: string
  email: string
}

interface SessionResponse {
  user?: User
}

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkSession()
  }, [])

  async function checkSession() {
    try {
      const res = await fetch("/api/auth/get-session", {
        credentials: "include",
      })
      if (res.ok) {
        const data: SessionResponse = await res.json()
        if (data?.user) {
          setUser(data.user)
        }
      }
    } catch (error) {
      console.error("Session check failed:", error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen items-start justify-center overflow-y-auto p-6">
        <div className="w-full max-w-4xl">
          <DashboardSkeleton />
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
