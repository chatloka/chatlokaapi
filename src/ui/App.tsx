import {
  createBrowserRouter,
  createRoutesFromElements,
  Route,
  Outlet,
  Navigate,
} from "react-router-dom"
import { RealtimeProvider } from "./components/RealtimeProvider"
import { Layout } from "./components/Layout"
import { ProtectedRoute } from "./components/ProtectedRoute"
import { Login } from "./pages/Login"
import { Dashboard } from "./pages/Dashboard"
import { Licenses } from "./pages/Licenses"
import { Plugins } from "./pages/Plugins"
import { PluginDetail } from "./pages/PluginDetail"
import { Logs } from "./pages/Logs"
import { Profile } from "./pages/Profile"
import { Mcp } from "./pages/Mcp"
import { McpToolDetail } from "./pages/McpToolDetail"
import { Releases } from "./pages/Releases"
import { ReleaseDetail } from "./pages/ReleaseDetail"
import { Users } from "./pages/Users"
import { UserDetail } from "./pages/UserDetail"
import { Tickets } from "./pages/Tickets"
import { TicketDetail } from "./pages/TicketDetail"
import { TicketAnalyticsPage } from "./pages/TicketAnalytics"
import { Telegram } from "./pages/Telegram"

function RootLayout() {
  return (
    <RealtimeProvider>
      <Outlet />
    </RealtimeProvider>
  )
}

const router = createBrowserRouter(
  createRoutesFromElements(
    <Route element={<RootLayout />}>
      <Route path="/login" element={<Login />} />
      <Route
        path="/manage"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="licenses" element={<Licenses />} />
        <Route path="releases" element={<Releases />} />
        <Route path="releases/:version" element={<ReleaseDetail />} />
        <Route path="users" element={<Users />} />
        <Route path="users/:id" element={<UserDetail />} />
        <Route path="plugins" element={<Plugins />} />
        <Route path="plugins/:slug" element={<PluginDetail />} />
        <Route path="logs" element={<Logs />} />
        <Route path="tickets" element={<Tickets />} />
        <Route path="tickets/analytics" element={<TicketAnalyticsPage />} />
        <Route path="tickets/:ticketNumber" element={<TicketDetail />} />
        <Route path="mcp" element={<Mcp />} />
        <Route path="mcp/tools/:toolName" element={<McpToolDetail />} />
        <Route path="telegram" element={<Telegram />} />
        <Route path="profile" element={<Profile />} />
      </Route>
      <Route path="/" element={<Navigate to="/manage" replace />} />
      <Route path="*" element={<Navigate to="/manage" replace />} />
    </Route>
  )
)

export default router