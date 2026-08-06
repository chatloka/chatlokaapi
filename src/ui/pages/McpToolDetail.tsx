import { useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  IconArrowLeft,
  IconCopy,
  IconCheck,
  IconChevronRight,
  IconCaretRight,
} from "@tabler/icons-react"
import { MCP_TOOL_MAP, MCP_TOOLS, CATEGORY_COLORS, CATEGORY_ICONS } from "@/lib/mcpTools"

export function McpToolDetail() {
  const { toolName } = useParams()
  const navigate = useNavigate()
  const [copied, setCopied] = useState(false)

  const tool = toolName ? MCP_TOOL_MAP.get(toolName) : undefined

  if (!tool) {
    return (
      <div className="space-y-6">
        <Button
          variant="ghost"
          className="gap-1.5 cursor-pointer -ml-2"
          onClick={() => navigate("/manage/mcp")}
        >
          <IconArrowLeft className="h-4 w-4" />
          Back to MCP
        </Button>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              Tool &quot;{toolName}&quot; not found
            </p>
            <Button
              variant="outline"
              className="mt-4 cursor-pointer"
              onClick={() => navigate("/manage/mcp")}
            >
              View all tools
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const currentTool = tool

  const copyToolName = async () => {
    await navigator.clipboard.writeText(currentTool.name)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-6">
      <Button
        variant="ghost"
        className="gap-1.5 cursor-pointer -ml-2"
        onClick={() => navigate("/manage/mcp")}
      >
        <IconArrowLeft className="h-4 w-4" />
        Back to MCP
      </Button>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted text-foreground">
            {tool.icon}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <code className="text-2xl font-bold font-mono text-foreground">
                {tool.name}
              </code>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 cursor-pointer"
                onClick={copyToolName}
              >
                {copied ? (
                  <IconCheck className="h-4 w-4 text-emerald-500" />
                ) : (
                  <IconCopy className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </div>
            <div className="mt-1.5">
              <Badge
                variant="outline"
                className={`gap-1.5 border ${CATEGORY_COLORS[tool.category]} cursor-pointer`}
              >
                {CATEGORY_ICONS[tool.category]}
                {tool.category}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Description */}
      <Card>
        <CardHeader>
          <CardTitle>Description</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {tool.description}
          </p>
        </CardContent>
      </Card>

      {/* Parameters */}
      <Card>
        <CardHeader>
          <CardTitle>Parameters</CardTitle>
        </CardHeader>
        <CardContent>
          {tool.params.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              This tool takes no parameters.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[220px]">Parameter</TableHead>
                  <TableHead className="w-[160px]">Type</TableHead>
                  <TableHead className="w-[80px]">Required</TableHead>
                  <TableHead>Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tool.params.map((param) => (
                  <TableRow key={param.name}>
                    <TableCell>
                      <code className="text-sm font-mono font-semibold">
                        {param.name}
                      </code>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs font-mono text-muted-foreground">
                        {param.type}
                      </code>
                    </TableCell>
                    <TableCell>
                      {param.required ? (
                        <Badge
                          variant="outline"
                          className="border-red-500/30 bg-red-500/10 text-red-400 cursor-pointer"
                        >
                          Required
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-zinc-500/30 bg-zinc-500/10 text-zinc-400 cursor-pointer"
                        >
                          Optional
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {param.description}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Example */}
      <Card>
        <CardHeader>
          <CardTitle>Example Call</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 mb-2">
            <IconCaretRight className="h-4 w-4 text-primary" />
            <code className="text-sm font-mono">{tool.example}</code>
          </div>
          <p className="text-xs text-muted-foreground">
            The tool is invoked by name — the AI assistant fills the parameters
            from context automatically.
          </p>
        </CardContent>
      </Card>

      {/* Other tools in category */}
      <Card>
        <CardHeader>
          <CardTitle>More {tool.category} Tools</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {MCP_TOOLS.filter(
            (t) => t.category === tool.category && t.name !== tool.name
          ).map((t) => (
            <button
              key={t.name}
              onClick={() => navigate(`/manage/mcp/tools/${t.name}`)}
              className="flex items-center gap-2 rounded-md border p-3 text-left cursor-pointer hover:bg-muted/50 transition-colors"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
                {t.icon}
              </div>
              <div className="min-w-0 flex-1">
                <code className="block text-sm font-mono font-semibold truncate">
                  {t.name}
                </code>
                <span className="block text-xs text-muted-foreground truncate">
                  {t.short}
                </span>
              </div>
              <IconChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
