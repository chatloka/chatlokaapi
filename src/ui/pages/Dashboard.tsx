import { useEffect, useState } from "react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Key, Package, AlertTriangle, Activity } from "lucide-react"

interface Stats {
  totalLicenses: number
  activeLicenses: number
  totalPlugins: number
  recentTamperAttempts: number
}

export function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStats()
  }, [])

  async function fetchStats() {
    try {
      const res = await fetch("/manage/api/stats", {
        credentials: "include",
      })
      if (res.ok) {
        const data: Stats = await res.json()
        setStats(data)
      }
    } catch (error) {
      console.error("Failed to fetch stats:", error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  const cards = [
    {
      title: "Total Licenses",
      value: stats?.totalLicenses ?? 0,
      description: "All registered licenses",
      icon: Key,
    },
    {
      title: "Active Licenses",
      value: stats?.activeLicenses ?? 0,
      description: "Currently active licenses",
      icon: Activity,
    },
    {
      title: "Total Plugins",
      value: stats?.totalPlugins ?? 0,
      description: "Available plugins",
      icon: Package,
    },
    {
      title: "Tamper Attempts",
      value: stats?.recentTamperAttempts ?? 0,
      description: "Last 24 hours",
      icon: AlertTriangle,
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of your ChatLoka license system
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {card.title}
              </CardTitle>
              <card.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value}</div>
              <p className="text-xs text-muted-foreground">
                {card.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
