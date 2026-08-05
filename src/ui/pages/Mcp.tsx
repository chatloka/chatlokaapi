import { useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  IconCopy,
  IconCheck,
  IconTerminal,
  IconCode,
  IconBrandVscode,
  IconBrandChrome,
  IconServer,
  IconKey,
  IconWorld,
  IconPlug,
} from "@tabler/icons-react"

const MCP_URL = "https://api.chatloka.net/mcp"

interface ToolConfig {
  id: string
  name: string
  icon: React.ReactNode
  description: string
  configLocation: string
  config: Record<string, unknown>
  envSyntax: string
  notes?: string
}

const tools: ToolConfig[] = [
  {
    id: "opencode",
    name: "OpenCode",
    icon: <IconTerminal className="h-5 w-5" />,
    description: "Add to your opencode.json or opencode.jsonc",
    configLocation: "opencode.jsonc (project root)",
    envSyntax: "{env:VARIABLE}",
    config: {
      mcp: {
        servers: {
          chatloka: {
            type: "remote",
            url: MCP_URL,
            oauth: false,
            headers: {
              Authorization: "Bearer {env:CHATLOKA_MCP_API_KEY}",
            },
          },
        },
      },
    },
  },
  {
    id: "claude-code",
    name: "Claude Code",
    icon: <IconCode className="h-5 w-5" />,
    description: "Add to .mcp.json in your project root",
    configLocation: ".mcp.json (project) or ~/.claude/settings.json (user)",
    envSyntax: "${VARIABLE}",
    config: {
      mcpServers: {
        chatloka: {
          type: "http",
          url: MCP_URL,
          headers: {
            Authorization: "Bearer ${CHATLOKA_MCP_API_KEY}",
          },
        },
      },
    },
  },
  {
    id: "cursor",
    name: "Cursor",
    icon: <IconBrandChrome className="h-5 w-5" />,
    description: "Add to .cursor/mcp.json or ~/.cursor/mcp.json",
    configLocation: ".cursor/mcp.json (project) or ~/.cursor/mcp.json (global)",
    envSyntax: "${env:VARIABLE}",
    config: {
      mcpServers: {
        chatloka: {
          url: MCP_URL,
          headers: {
            Authorization: "Bearer ${env:CHATLOKA_MCP_API_KEY}",
          },
        },
      },
    },
  },
  {
    id: "kilo-code",
    name: "Kilo Code",
    icon: <IconPlug className="h-5 w-5" />,
    description: "Add to .kilocode/mcp.json or global settings",
    configLocation: ".kilocode/mcp.json (project) or ~/.kilocode/cli/global/settings/mcp_settings.json",
    envSyntax: "${VARIABLE}",
    config: {
      mcpServers: {
        chatloka: {
          url: MCP_URL,
          headers: {
            Authorization: "Bearer ${CHATLOKA_MCP_API_KEY}",
          },
        },
      },
    },
  },
  {
    id: "claude-desktop",
    name: "Claude Desktop",
    icon: <IconBrandChrome className="h-5 w-5" />,
    description: "Add to Claude Desktop MCP settings",
    configLocation: "Claude Desktop > Settings > MCP Servers",
    envSyntax: "${VARIABLE}",
    config: {
      mcpServers: {
        chatloka: {
          type: "http",
          url: MCP_URL,
          headers: {
            Authorization: "Bearer ${CHATLOKA_MCP_API_KEY}",
          },
        },
      },
    },
  },
  {
    id: "vscode",
    name: "VS Code / Copilot",
    icon: <IconBrandVscode className="h-5 w-5" />,
    description: "Add to .vscode/mcp.json (note: uses 'servers' key)",
    configLocation: ".vscode/mcp.json (workspace) or user settings",
    envSyntax: "${env:VARIABLE}",
    notes: "VS Code uses 'servers' instead of 'mcpServers'",
    config: {
      servers: {
        chatloka: {
          type: "http",
          url: MCP_URL,
          headers: {
            Authorization: "Bearer ${env:CHATLOKA_MCP_API_KEY}",
          },
        },
      },
    },
  },
]

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleCopy}
      className="cursor-pointer gap-1.5"
    >
      {copied ? (
        <>
          <IconCheck className="h-3.5 w-3.5 text-emerald-500" />
          Copied!
        </>
      ) : (
        <>
          <IconCopy className="h-3.5 w-3.5" />
          {label || "Copy"}
        </>
      )}
    </Button>
  )
}

export function Mcp() {
  const [activeTab, setActiveTab] = useState("opencode")
  const activeTool = tools.find((t) => t.id === activeTab) || tools[0]
  const configString = JSON.stringify(activeTool.config, null, 2)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">MCP Server</h1>
        <p className="text-muted-foreground">
          Connect AI assistants to your Chatloka license system via Model Context Protocol
        </p>
      </div>

      {/* Overview Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Endpoint</CardTitle>
            <IconWorld className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <code className="text-sm font-mono break-all">{MCP_URL}</code>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Auth</CardTitle>
            <IconKey className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-sm">Bearer token in Authorization header</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tools Available</CardTitle>
            <IconServer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-sm">17 tools for license, plugin & log management</p>
          </CardContent>
        </Card>
      </div>

      {/* Available Tools */}
      <Card>
        <CardHeader>
          <CardTitle>Available MCP Tools</CardTitle>
          <CardDescription>
            These tools are available once connected
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { name: "get_licenses", desc: "List all licenses", group: "License" },
              { name: "get_license", desc: "Get license by purchase code", group: "License" },
              { name: "create_license", desc: "Create a new license", group: "License" },
              { name: "update_license_status", desc: "Change license status", group: "License" },
              { name: "update_license_domain", desc: "Change bound domain", group: "License" },
              { name: "verify_purchase_code", desc: "Verify against Envato API", group: "License" },
              { name: "get_license_features", desc: "Get feature list for type", group: "License" },
              { name: "get_validation_logs", desc: "Validation history", group: "License" },
              { name: "get_domain_history", desc: "Domain change history", group: "License" },
              { name: "get_plugins", desc: "List all plugins", group: "Plugin" },
              { name: "get_plugin_versions", desc: "All versions for a plugin", group: "Plugin" },
              { name: "get_plugin_download_logs", desc: "Download history", group: "Plugin" },
              { name: "generate_plugin_download_link", desc: "Generate download URL + token", group: "Plugin" },
              { name: "get_api_logs", desc: "API logs with filtering", group: "Logs" },
              { name: "get_tamper_logs", desc: "Tamper detection logs", group: "Logs" },
              { name: "get_api_stats", desc: "24h API statistics", group: "Logs" },
              { name: "get_dashboard_stats", desc: "Aggregate dashboard stats", group: "Logs" },
            ].map((tool) => (
              <div
                key={tool.name}
                className="flex flex-col gap-1 rounded-md border p-3"
              >
                <div className="flex items-center gap-2">
                  <code className="text-xs font-mono font-bold">{tool.name}</code>
                  <Badge variant="secondary" className="text-[10px]">
                    {tool.group}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{tool.desc}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Setup Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Setup Instructions</CardTitle>
          <CardDescription>
            Select your AI tool and add the configuration
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="flex flex-wrap h-auto gap-1 bg-transparent p-0">
              {tools.map((tool) => (
                <TabsTrigger
                  key={tool.id}
                  value={tool.id}
                  className="cursor-pointer gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  {tool.icon}
                  <span className="hidden sm:inline">{tool.name}</span>
                </TabsTrigger>
              ))}
            </TabsList>

            {tools.map((tool) => (
              <TabsContent key={tool.id} value={tool.id} className="mt-4">
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="rounded-md bg-muted p-2">{tool.icon}</div>
                    <div>
                      <h3 className="font-semibold">{tool.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {tool.description}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-md bg-muted/50 p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      Config location
                    </p>
                    <code className="text-sm font-mono">{tool.configLocation}</code>
                  </div>

                  {tool.notes && (
                    <div className="rounded-md bg-amber-500/10 border border-amber-500/20 p-3">
                      <p className="text-sm text-amber-600 dark:text-amber-400">
                        {tool.notes}
                      </p>
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium">
                        Configuration ({tool.envSyntax} for env vars)
                      </p>
                      <CopyButton text={configString} label="Copy config" />
                    </div>
                    <pre className="rounded-md bg-muted p-4 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                      {configString}
                    </pre>
                  </div>

                  <div className="rounded-md bg-muted/50 p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      Environment variable
                    </p>
                    <p className="text-sm">
                      Set <code className="font-mono bg-muted px-1 rounded">CHATLOKA_MCP_API_KEY</code> to
                      your API key. Get it from the admin dashboard or ask your administrator.
                    </p>
                  </div>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
