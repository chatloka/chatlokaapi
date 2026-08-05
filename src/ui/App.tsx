import { Routes, Route, Navigate } from "react-router-dom"
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

function App() {
  return (
    <Routes>
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
        <Route path="plugins" element={<Plugins />} />
        <Route path="plugins/:slug" element={<PluginDetail />} />
        <Route path="logs" element={<Logs />} />
        <Route path="mcp" element={<Mcp />} />
        <Route path="profile" element={<Profile />} />
      </Route>
      <Route path="/" element={<Navigate to="/manage" replace />} />
      <Route path="*" element={<Navigate to="/manage" replace />} />
    </Routes>
  )
}

export default App
