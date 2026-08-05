import { Outlet, NavLink, useNavigate } from "react-router-dom"
import {
  LayoutDashboard,
  Key,
  Package,
  ScrollText,
  LogOut,
} from "lucide-react"

const navItems = [
  { to: "/manage", icon: LayoutDashboard, label: "Dashboard", end: true },
  { to: "/manage/licenses", icon: Key, label: "Licenses" },
  { to: "/manage/plugins", icon: Package, label: "Plugins" },
  { to: "/manage/logs", icon: ScrollText, label: "Logs" },
]

export function Layout() {
  const navigate = useNavigate()

  async function handleLogout() {
    await fetch("/api/auth/sign-out", {
      method: "POST",
      credentials: "include",
    })
    navigate("/login")
  }

  return (
    <div className="flex h-screen">
      <aside className="flex w-64 flex-col border-r bg-muted/40">
        <div className="flex h-14 items-center border-b px-4">
          <span className="text-lg font-semibold">ChatLoka Admin</span>
        </div>
        <nav className="flex-1 space-y-1 p-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t p-2">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
