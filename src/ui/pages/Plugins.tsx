import { useEffect, useState, useRef } from "react"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Upload, Package, Check, AlertCircle } from "lucide-react"

interface Plugin {
  id: number
  slug: string
  version: string
  changelog: string | null
  checksum: string
  released_at: string
  is_latest: boolean
}

interface PluginsResponse {
  plugins: Plugin[]
}

interface UploadResponse {
  error?: string
}

export function Plugins() {
  const [plugins, setPlugins] = useState<Plugin[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{
    success: boolean
    message: string
  } | null>(null)

  const [slug, setSlug] = useState("")
  const [version, setVersion] = useState("")
  const [changelog, setChangelog] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchPlugins()
  }, [])

  async function fetchPlugins() {
    try {
      const res = await fetch("/manage/api/plugins", {
        credentials: "include",
      })
      if (res.ok) {
        const data: PluginsResponse = await res.json()
        setPlugins(data.plugins || [])
      }
    } catch (error) {
      console.error("Failed to fetch plugins:", error)
    } finally {
      setLoading(false)
    }
  }

  async function handleUpload() {
    if (!file || !slug || !version) return

    setUploading(true)
    setUploadResult(null)

    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("slug", slug)
      formData.append("version", version)
      formData.append("changelog", changelog)

      const res = await fetch("/manage/api/plugins/upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      })

      const data: UploadResponse = await res.json()

      if (res.ok) {
        setUploadResult({ success: true, message: "Plugin uploaded successfully" })
        setSlug("")
        setVersion("")
        setChangelog("")
        setFile(null)
        if (fileInputRef.current) {
          fileInputRef.current.value = ""
        }
        fetchPlugins()
      } else {
        setUploadResult({
          success: false,
          message: data.error || "Upload failed",
        })
      }
    } catch {
      setUploadResult({
        success: false,
        message: "An error occurred during upload",
      })
      setUploadResult({
        success: false,
        message: "An error occurred during upload",
      })
    } finally {
      setUploading(false)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile?.name.endsWith(".zip")) {
      setFile(droppedFile)
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
  }

  const pluginsBySlug = plugins.reduce((acc, plugin) => {
    if (!acc[plugin.slug]) {
      acc[plugin.slug] = []
    }
    acc[plugin.slug].push(plugin)
    return acc
  }, {} as Record<string, Plugin[]>)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Plugins</h1>
          <p className="text-muted-foreground">Manage plugin versions</p>
        </div>
        <Button onClick={() => setUploadDialogOpen(true)}>
          <Upload className="mr-2 h-4 w-4" />
          Upload Plugin
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Plugins</CardTitle>
          <CardDescription>
            {Object.keys(pluginsBySlug).length} plugins, {plugins.length}{" "}
            total versions
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : Object.keys(pluginsBySlug).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Package className="h-12 w-12 mb-4" />
              <p>No plugins uploaded yet</p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(pluginsBySlug).map(([slug, versions]) => (
                <div key={slug}>
                  <div className="mb-2 flex items-center gap-2">
                    <h3 className="font-semibold">{slug}</h3>
                    {versions.some((v) => v.is_latest) && (
                      <Badge className="bg-green-500">
                        v{versions.find((v) => v.is_latest)?.version}
                      </Badge>
                    )}
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Version</TableHead>
                        <TableHead>Released</TableHead>
                        <TableHead>Checksum</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {versions.map((plugin) => (
                        <TableRow key={plugin.id}>
                          <TableCell className="font-mono">
                            {plugin.version}
                          </TableCell>
                          <TableCell>
                            {new Date(plugin.released_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {plugin.checksum?.slice(0, 16)}...
                          </TableCell>
                          <TableCell>
                            {plugin.is_latest ? (
                              <Badge className="bg-green-500">Latest</Badge>
                            ) : (
                              <Badge variant="secondary">Previous</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Plugin</DialogTitle>
            <DialogDescription>
              Upload a new plugin version (.zip file)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {uploadResult && (
              <div
                className={`flex items-center gap-2 rounded-md p-3 text-sm ${
                  uploadResult.success
                    ? "bg-green-500/10 text-green-600"
                    : "bg-destructive/10 text-destructive"
                }`}
              >
                {uploadResult.success ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <AlertCircle className="h-4 w-4" />
                )}
                {uploadResult.message}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="slug">Plugin Slug</Label>
              <Input
                id="slug"
                placeholder="chatloka-license"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="version">Version</Label>
              <Input
                id="version"
                placeholder="1.0.0"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="changelog">Changelog</Label>
              <textarea
                id="changelog"
                className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                placeholder="What's new in this version..."
                value={changelog}
                onChange={(e) => setChangelog(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Plugin File</Label>
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                className={`flex flex-col items-center justify-center rounded-md border-2 border-dashed p-6 transition-colors ${
                  file
                    ? "border-green-500 bg-green-500/10"
                    : "border-muted-foreground/25 hover:border-muted-foreground/50"
                }`}
              >
                {file ? (
                  <div className="text-center">
                    <Check className="mx-auto h-8 w-8 text-green-500" />
                    <p className="mt-2 text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                ) : (
                  <div className="text-center">
                    <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
                    <p className="mt-2 text-sm text-muted-foreground">
                      Drop a .zip file here or{" "}
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-primary underline"
                      >
                        browse
                      </button>
                    </p>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip"
                  className="hidden"
                  onChange={(e) => {
                    const selectedFile = e.target.files?.[0]
                    if (selectedFile) setFile(selectedFile)
                  }}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setUploadDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!file || !slug || !version || uploading}
            >
              {uploading ? "Uploading..." : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
