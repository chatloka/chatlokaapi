import { useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  IconWorld,
  IconKey,
  IconServer,
  IconChevronRight,
  IconTerminal,
  IconCode,
  IconBrandChrome,
  IconBrandVscode,
  IconPlug,
  IconCopy,
  IconCheck,
} from "@tabler/icons-react"
import { MCP_TOOLS, CATEGORY_COLORS, CATEGORY_ICONS, type ToolCategory } from "@/lib/mcpTools"

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

const CATEGORIES: ToolCategory[] = [
  "License",
  "Plugins",
  "Tickets",
  "Contacts",
  "Releases",
  "Notifications",
  "Monitoring",
]

function CategoryBadge({ category }: { category: ToolCategory }) {
  return (
    <Badge
      variant="outline"
      className={`gap-1 border ${CATEGORY_COLORS[category]} cursor-pointer`}
    >
      {CATEGORY_ICONS[category]}
      {category}
    </Badge>
  )
}

export function Mcp() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState("opencode")
  const [categoryFilter, setCategoryFilter] = useState<ToolCategory | "all">("all")
  const activeTool = tools.find((t) => t.id === activeTab) || tools[0]
  const configString = JSON.stringify(activeTool.config, null, 2)

  const filteredTools =
    categoryFilter === "all"
      ? MCP_TOOLS
      : MCP_TOOLS.filter((t) => t.category === categoryFilter)

  const categoryCounts = CATEGORIES.reduce<Record<string, number>>((acc, cat) => {
    acc[cat] = MCP_TOOLS.filter((t) => t.category === cat).length
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">MCP Server</h1>
          <p className="text-muted-foreground">
            Connect AI assistants to your Chatloka license system via Model Context Protocol
          </p>
        </div>
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
            <p className="text-sm font-semibold">{MCP_TOOLS.length} tools</p>
            <p className="text-xs text-muted-foreground">
              {CATEGORIES.length} categories — licenses, plugins, tickets, contacts, releases, notifications & monitoring
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Category summary chips */}
      <div className="flex flex-wrap gap-2">
        <Badge
          variant="outline"
          className={`gap-1 cursor-pointer border ${
            categoryFilter === "all"
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
          }`}
          onClick={() => setCategoryFilter("all")}
        >
          <IconServer className="h-3.5 w-3.5" />
          All ({MCP_TOOLS.length})
        </Badge>
        {CATEGORIES.map((cat) => (
          <Badge
            key={cat}
            variant="outline"
            className={`gap-1 cursor-pointer border ${
              categoryFilter === cat
                ? "bg-primary text-primary-foreground border-primary"
                : CATEGORY_COLORS[cat]
            }`}
            onClick={() => setCategoryFilter(categoryFilter === cat ? "all" : cat)}
          >
            {CATEGORY_ICONS[cat]}
            {cat} ({categoryCounts[cat]})
          </Badge>
        ))}
      </div>

      {/* Available Tools Table */}
      <Card>
        <CardHeader>
          <CardTitle>Available MCP Tools</CardTitle>
          <CardDescription>
            Click any tool to open its reference page with parameters & examples
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[300px]">Tool</TableHead>
                <TableHead className="w-[140px]">Category</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-[60px] text-right">Params</TableHead>
                <TableHead className="w-[40px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTools.map((tool) => (
                <TableRow
                  key={tool.name}
                  className="cursor-pointer group"
                  onClick={() => navigate(`/manage/mcp/tools/${tool.name}`)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-foreground">
                        {tool.icon}
                      </div>
                      <code className="text-sm font-mono font-bold group-hover:text-primary transition-colors">
                        {tool.name}
                      </code>
                    </div>
                  </TableCell>
                  <TableCell>
                    <CategoryBadge category={tool.category} />
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground line-clamp-1">
                      {tool.short}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge
                      variant="secondary"
                      className={`text-[10px] ${
                        tool.params.length > 0 ? "" : "opacity-60"
                      }`}
                    >
                      {tool.params.length}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <IconChevronRight className="h-4 w-4 ml-auto text-muted-foreground group-hover:text-primary transition-colors" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
