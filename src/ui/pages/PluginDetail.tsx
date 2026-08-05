import { useEffect, useState, useCallback } from "react"
import { useParams, useNavigate } from "react-router-dom"
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
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  IconArrowLeft,
  IconDownload,
  IconPackage,
  IconCopy,
  IconCheck,
} from "@tabler/icons-react"
import { toast } from "sonner"

interface Plugin {
  id: number
  slug: string
  version: string
  changelog: string | null
  zip_path: string
  checksum: string
  released_at: string
  is_latest: boolean
}

interface PluginDetailResponse {
  slug: string
  versions: Plugin[]
}

export function PluginDetail() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const [plugin, setPlugin] = useState<PluginDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [copiedChecksum, setCopiedChecksum] = useState<string | null>(null)

  const fetchPlugin = useCallback(async () => {
    try {
      const res = await fetch(`/manage/api/plugins/${slug}`, {
        credentials: "include",
      })
      if (res.ok) {
        const data: PluginDetailResponse = await res.json()
        setPlugin(data)
      }
    } catch (error) {
      console.error("Failed to fetch plugin:", error)
    } finally {
      setLoading(false)
    }
  }, [slug])

  useEffect(() => {
    if (slug) fetchPlugin()
  }, [slug, fetchPlugin])

  async function handleDownload(version: string) {
    try {
      const res = await fetch(`/manage/api/plugins/${slug}/download?version=${version}`, {
        credentials: "include",
      })
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `${slug}-${version}.zip`
        a.click()
        URL.revokeObjectURL(url)
        toast.success(`Downloaded ${slug}-${version}.zip`)
      }
    } catch (error) {
      console.error("Failed to download plugin:", error)
      toast.error("Failed to download plugin")
    }
  }

  function copyChecksum(checksum: string) {
    navigator.clipboard.writeText(checksum)
    setCopiedChecksum(checksum)
    toast.success("Checksum copied to clipboard")
    setTimeout(() => setCopiedChecksum(null), 2000)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!plugin) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => navigate("/manage/plugins")} className="cursor-pointer">
          <IconArrowLeft className="mr-2 h-4 w-4" />
          Back to Plugins
        </Button>
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <IconPackage className="h-12 w-12 mb-4" />
          <p>Plugin not found</p>
        </div>
      </div>
    )
  }

  const latestVersion = plugin.versions.find(v => v.is_latest)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate("/manage/plugins")} className="cursor-pointer">
          <IconArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div className="flex items-center gap-3">
          <IconPackage className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">{plugin.slug}</h1>
            <p className="text-muted-foreground">
              {plugin.versions.length} version{plugin.versions.length !== 1 ? "s" : ""}
            </p>
          </div>
          {latestVersion && (
            <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/20 ml-2">
              Latest: v{latestVersion.version}
            </Badge>
          )}
        </div>
      </div>

      {/* Latest Version Info */}
      {latestVersion && (
        <Card>
          <CardHeader>
            <CardTitle>Latest Version</CardTitle>
            <CardDescription>Current production version</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <div>
                <p className="text-sm text-muted-foreground">Version</p>
                <p className="text-lg font-mono font-bold">{latestVersion.version}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Released</p>
                <p className="text-lg">{new Date(latestVersion.released_at).toLocaleDateString()}</p>
              </div>
              <div className="md:col-span-2">
                <p className="text-sm text-muted-foreground">Checksum (SHA-256)</p>
                <div className="flex items-center gap-2">
                  <code className="text-xs font-mono bg-muted px-2 py-1 rounded break-all">
                    {latestVersion.checksum}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => copyChecksum(latestVersion.checksum)}
                    className="cursor-pointer shrink-0"
                  >
                    {copiedChecksum === latestVersion.checksum ? (
                      <IconCheck className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <IconCopy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
            {latestVersion.changelog && (
              <div className="mt-4">
                <p className="text-sm text-muted-foreground mb-2">Changelog</p>
                <div className="rounded-md bg-muted p-4 text-sm whitespace-pre-wrap">
                  {latestVersion.changelog}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* All Versions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>All Versions</CardTitle>
              <CardDescription>
                {plugin.versions.length} version{plugin.versions.length !== 1 ? "s" : ""} available
              </CardDescription>
            </div>
            <Button onClick={() => handleDownload(latestVersion?.version || "")} className="cursor-pointer">
              <IconDownload className="mr-2 h-4 w-4" />
              Download Latest
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Version</TableHead>
                  <TableHead>Released</TableHead>
                  <TableHead>Checksum</TableHead>
                  <TableHead>Changelog</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plugin.versions.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-mono font-bold">{v.version}</TableCell>
                    <TableCell>{new Date(v.released_at).toLocaleDateString()}</TableCell>
                    <TableCell className="font-mono text-xs">
                      <div className="flex items-center gap-1">
                        <span className="truncate max-w-[200px]">{v.checksum?.slice(0, 20)}...</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => copyChecksum(v.checksum)}
                          className="cursor-pointer shrink-0 h-6 w-6"
                        >
                          {copiedChecksum === v.checksum ? (
                            <IconCheck className="h-3 w-3 text-emerald-500" />
                          ) : (
                            <IconCopy className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[300px]">
                      {v.changelog ? (
                        <p className="text-sm truncate">{v.changelog}</p>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {v.is_latest ? (
                        <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/20">Latest</Badge>
                      ) : (
                        <Badge variant="secondary">Previous</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownload(v.version)}
                        className="cursor-pointer"
                      >
                        <IconDownload className="mr-2 h-4 w-4" />
                        Download
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
