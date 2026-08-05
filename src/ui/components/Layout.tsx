import { useState, useEffect } from "react"
import { Outlet, NavLink, useNavigate } from "react-router-dom"
import {
  IconDashboard,
  IconKey,
  IconPackage,
  IconReceipt,
  IconLogout,
  IconChevronLeft,
  IconChevronRight,
  IconUser,
  IconMenu,
} from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar"

const navItems = [
  { to: "/manage", icon: IconDashboard, label: "Dashboard", end: true },
  { to: "/manage/licenses", icon: IconKey, label: "Licenses" },
  { to: "/manage/plugins", icon: IconPackage, label: "Plugins" },
  { to: "/manage/logs", icon: IconReceipt, label: "Logs" },
]

const STORAGE_KEY = "sidebar_collapsed"
const MOBILE_BREAKPOINT = 768

function getInitialCollapsed(): boolean {
  if (typeof window === "undefined") return false
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored !== null) return stored === "true"
  return window.innerWidth < MOBILE_BREAKPOINT
}

export function Layout() {
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState<boolean>(getInitialCollapsed)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [user, setUser] = useState<{ name: string; email: string } | null>(null)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(collapsed))
  }, [collapsed])

  useEffect(() => {
    function handleResize() {
      if (window.innerWidth >= MOBILE_BREAKPOINT) {
        setMobileOpen(false)
      }
    }
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  useEffect(() => {
    async function fetchSession() {
      try {
        const res = await fetch("/api/auth/get-session", { credentials: "include" })
        if (res.ok) {
          const data = await res.json() as { session: { user: { name: string; email: string } } }
          setUser(data.session.user)
        }
      } catch { /* ignore */ }
    }
    fetchSession()
  }, [])

  async function handleLogout() {
    await fetch("/api/auth/sign-out", { method: "POST", credentials: "include" })
    navigate("/login")
  }

  function toggleSidebar() {
    setCollapsed((prev) => !prev)
  }

  const fallbackChar = user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || "A"

  return (
    <TooltipProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        {/* Mobile top bar */}
        <div className="fixed top-0 left-0 right-0 z-40 flex h-14 items-center border-b border-border bg-background px-4 md:hidden">
          <Button
            variant="ghost"
            size="icon"
            className="cursor-pointer"
            onClick={() => setMobileOpen(true)}
          >
            <IconMenu className="h-5 w-5" />
          </Button>
          <span className="ml-2 text-lg font-semibold">Chatloka</span>
        </div>

        {/* Mobile overlay */}
        {mobileOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden cursor-pointer"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-300",
            collapsed ? "w-[3rem]" : "w-64",
            mobileOpen
              ? "translate-x-0"
              : "-translate-x-full md:translate-x-0"
          )}
        >
          {/* Header */}
          <div className="flex h-14 items-center border-b border-sidebar-border px-4">
            {!collapsed && (
              <span className="text-lg font-semibold">Chatloka</span>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              className={cn(
                "ml-auto shrink-0 cursor-pointer",
                collapsed && "mx-auto"
              )}
            >
              {collapsed ? (
                <IconChevronRight className="h-4 w-4" />
              ) : (
                <IconChevronLeft className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 p-2">
            {navItems.map((item) => {
              if (collapsed) {
                return (
                  <Tooltip key={item.to}>
                    <TooltipTrigger
                      render={
                        <NavLink
                          to={item.to}
                          end={item.end}
                          onClick={() => setMobileOpen(false)}
                          className={({ isActive }) =>
                            cn(
                              "flex items-center justify-center rounded-md p-2 text-sm font-medium transition-colors cursor-pointer",
                              isActive
                                ? "bg-sidebar-primary/15 text-sidebar-primary"
                                : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                            )
                          }
                        />
                      }
                    >
                      <item.icon className="h-5 w-5" />
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      {item.label}
                    </TooltipContent>
                  </Tooltip>
                )
              }

              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
                      isActive
                        ? "bg-sidebar-primary/15 text-sidebar-primary"
                        : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    )
                  }
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  <span>{item.label}</span>
                </NavLink>
              )
            })}
          </nav>

          {/* User Menu */}
          <div className="border-t border-sidebar-border p-2">
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <button className="flex w-full items-center justify-center rounded-md p-2 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors cursor-pointer" />
                        }
                      >
                        <Avatar size="sm">
                          <AvatarFallback>{fallbackChar}</AvatarFallback>
                        </Avatar>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent side="right" align="start" className="w-48">
                        <div className="px-2 py-1.5">
                          <p className="text-sm font-medium">{user?.name || "Admin"}</p>
                          <p className="text-xs text-muted-foreground">{user?.email || ""}</p>
                        </div>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => { setMobileOpen(false); navigate("/manage/profile") }}
                          className="cursor-pointer"
                        >
                          <IconUser className="mr-2 h-4 w-4" />
                          Profile
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={handleLogout}
                          className="cursor-pointer text-destructive hover:text-destructive focus:text-destructive [&>svg]:text-destructive"
                        >
                          <IconLogout className="mr-2 h-4 w-4 text-destructive" />
                          Logout
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  }
                />
                <TooltipContent side="right">
                  {user?.name || "Admin"}
                </TooltipContent>
              </Tooltip>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <button className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors cursor-pointer" />
                  }
                >
                  <Avatar size="sm">
                    <AvatarFallback>{fallbackChar}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col items-start text-left overflow-hidden">
                    <span className="truncate">{user?.name || "Admin"}</span>
                    <span className="truncate text-xs text-muted-foreground">{user?.email || ""}</span>
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" className="w-56">
                  <DropdownMenuItem
                    onClick={() => { setMobileOpen(false); navigate("/manage/profile") }}
                    className="cursor-pointer"
                  >
                    <IconUser className="mr-2 h-4 w-4" />
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleLogout}
                    className="cursor-pointer text-destructive hover:text-destructive focus:text-destructive [&>svg]:text-destructive"
                  >
                    <IconLogout className="mr-2 h-4 w-4 text-destructive" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </aside>

        {/* Main content */}
        <main
          className={cn(
            "flex-1 overflow-auto transition-all duration-300 pt-14 md:pt-0 bg-background",
            collapsed ? "md:ml-[3rem]" : "md:ml-64"
          )}
        >
          <div className="p-4 md:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </TooltipProvider>
  )
}
