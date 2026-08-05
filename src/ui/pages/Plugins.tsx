import { useEffect, useState, useRef } from "react"
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
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  IconUpload,
  IconPackage,
  IconCircleCheck,
  IconAlertCircle,
  IconDownload,
  IconEye,
  IconSearch,
} from "@tabler/icons-react"
import { CardTableSkeleton } from "@/components/Skeletons"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  IconChevronLeft,
  IconChevronRight,
} from "@tabler/icons-react"

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

interface PluginsResponse {
  plugins: Plugin[]
}

interface UploadResponse {
  error?: string
}

export function Plugins() {
  const navigate = useNavigate()
  const [plugins, setPlugins] = useState<Plugin[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{
    success: boolean
    message: string
  } | null>(null)
  const [search, setSearch] = useState("")
  const [pageSize, setPageSize] = useState(20)
  const [page, setPage] = useState(1)

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
    } finally {
      setUploading(false)
    }
  }

  async function handleDownload(slug: string) {
    try {
      const res = await fetch(`/manage/api/plugins/${slug}/download`, {
        credentials: "include",
      })
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `${slug}.zip`
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch (error) {
      console.error("Failed to download plugin:", error)
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

  const filteredSlugs = Object.entries(pluginsBySlug).filter(([slug]) =>
    slug.toLowerCase().includes(search.toLowerCase())
  )

  const totalPages = Math.ceil(filteredSlugs.length / pageSize)
  const paginatedSlugs = filteredSlugs.slice((page - 1) * pageSize, page * pageSize)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Plugins</h1>
          <p className="text-muted-foreground">Manage plugin versions</p>
        </div>
        <Button onClick={() => setUploadDialogOpen(true)} className="cursor-pointer">
          <IconUpload className="mr-2 h-4 w-4" />
          Upload Plugin
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>All Plugins</CardTitle>
              <CardDescription>
                {Object.keys(pluginsBySlug).length} plugins, {plugins.length}{" "}
                total versions
              </CardDescription>
            </div>
            <div className="relative">
              <IconSearch className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search plugins..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 w-full sm:w-64 cursor-text"
              />
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1) }}>
                <SelectTrigger className="w-[100px] cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="20">20 / page</SelectItem>
                  <SelectItem value="50">50 / page</SelectItem>
                  <SelectItem value="100">100 / page</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <CardTableSkeleton rows={6} columns={5} />
          ) : filteredSlugs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <IconPackage className="h-12 w-12 mb-4" />
              <p>No plugins found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plugin</TableHead>
                    <TableHead>Latest Version</TableHead>
                    <TableHead>Released</TableHead>
                    <TableHead>Total Versions</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedSlugs.map(([slug, versions]) => {
                    const latest = versions.find((v) => v.is_latest)
                    return (
                      <TableRow key={slug}>
                        <TableCell>
                          <button
                            onClick={() => navigate(`/manage/plugins/${slug}`)}
                            className="flex items-center gap-2 hover:underline cursor-pointer text-foreground font-medium"
                          >
                            <IconPackage className="h-4 w-4 text-muted-foreground" />
                            {slug}
                          </button>
                        </TableCell>
                        <TableCell>
                          {latest ? (
                            <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/20">
                              v{latest.version}
                            </Badge>
                          ) : (
                            <Badge variant="secondary">-</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {latest
                            ? new Date(latest.released_at).toLocaleDateString()
                            : "-"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {versions.length}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => navigate(`/manage/plugins/${slug}`)}
                              className="cursor-pointer h-8 w-8"
                            >
                              <IconEye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDownload(slug)}
                              className="cursor-pointer h-8 w-8"
                            >
                              <IconDownload className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          {!loading && filteredSlugs.length > 0 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, filteredSlugs.length)} of {filteredSlugs.length} plugins
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="cursor-pointer">
                  <IconChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm">{page} / {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="cursor-pointer">
                  <IconChevronRight className="h-4 w-4" />
                </Button>
              </div>
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
                    ? "bg-emerald-500/10 text-emerald-500"
                    : "bg-destructive/10 text-destructive"
                }`}
              >
                {uploadResult.success ? (
                  <IconCircleCheck className="h-4 w-4" />
                ) : (
                  <IconAlertCircle className="h-4 w-4" />
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
                className="cursor-text"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="version">Version</Label>
              <Input
                id="version"
                placeholder="1.0.0"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                className="cursor-text"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="changelog">Changelog</Label>
              <Textarea
                id="changelog"
                placeholder="What's new in this version..."
                value={changelog}
                onChange={(e) => setChangelog(e.target.value)}
                className="min-h-[100px] cursor-text"
              />
            </div>
            <div className="space-y-2">
              <Label>Plugin File</Label>
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                className={`flex flex-col items-center justify-center rounded-md border-2 border-dashed p-6 transition-colors cursor-pointer ${
                  file
                    ? "border-emerald-500 bg-emerald-500/10"
                    : "border-muted-foreground/25 hover:border-muted-foreground/50"
                }`}
              >
                {file ? (
                  <div className="text-center">
                    <IconCircleCheck className="mx-auto h-8 w-8 text-emerald-500" />
                    <p className="mt-2 text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                ) : (
                  <div className="text-center">
                    <IconUpload className="mx-auto h-8 w-8 text-muted-foreground" />
                    <p className="mt-2 text-sm text-muted-foreground">
                      Drop a .zip file here or{" "}
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-primary underline cursor-pointer"
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
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!file || !slug || !version || uploading}
              className="cursor-pointer"
            >
              {uploading ? "Uploading..." : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
