import { useEffect, useState, useRef, useCallback } from "react"
import { formatFileSize, formatDate } from "@/lib/format"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { useNavigate } from "react-router-dom"
import {
  Card,
  CardContent,
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  IconUpload,
  IconRocket,
  IconCircleCheck,
  IconDownload,
  IconEye,
  IconSearch,
  IconTrash,
  IconChevronLeft,
  IconChevronRight,
  IconLoader,
} from "@tabler/icons-react"
import { CardTableSkeleton } from "@/components/Skeletons"
import { toast } from "sonner"

interface AppVersion {
  id: number
  version: string
  changelog: string | null
  zip_path: string
  checksum: string
  file_size: number | null
  min_php_version: string | null
  min_chatloka_version: string | null
  breaking_changes: string | null
  released_at: string | null
  is_latest: number
  created_at: string | null
}

interface UpdateLog {
  id: number
  purchase_code: string
  domain: string
  from_version: string
  to_version: string
  status: string
  downloaded_at?: string
  created_at?: string
  ip_address?: string
  user_agent?: string
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

export function Releases() {
  const navigate = useNavigate()
  const [versions, setVersions] = useState<AppVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 10, total: 0, totalPages: 0 })
  const [activeTab, setActiveTab] = useState("versions")

  // Debounce the live search input, resetting pagination once it settles.
  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => window.clearTimeout(t)
  }, [search])

  // Upload state
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [version, setVersion] = useState("")
  const [changelog, setChangelog] = useState("")
  const [breakingChanges, setBreakingChanges] = useState("")
  const [minPhpVersion, setMinPhpVersion] = useState("8.2")
  const [file, setFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Detail state
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<AppVersion | null>(null)

  // Update logs state
  const [logs, setLogs] = useState<UpdateLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsPage, setLogsPage] = useState(1)
  const [logsPagination, setLogsPagination] = useState<Pagination>({ page: 1, limit: 10, total: 0, totalPages: 0 })

  const fetchVersions = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({ page: String(page), limit: "10" })
      if (debouncedSearch) params.set("search", debouncedSearch)
      const res = await fetch(`/manage/api/app-versions?${params}`, { credentials: "include" })
      if (res.ok) {
        const data = await res.json() as { versions: AppVersion[]; pagination: Pagination }
        setVersions(data.versions || [])
        setPagination(data.pagination)
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [page, debouncedSearch])

  const fetchLogs = useCallback(async () => {
    try {
      setLogsLoading(true)
      const params = new URLSearchParams({ page: String(logsPage), limit: "10" })
      const res = await fetch(`/manage/api/app-update-logs?${params}`, { credentials: "include" })
      if (res.ok) {
        const data = await res.json() as { logs: UpdateLog[]; pagination: Pagination }
        setLogs(data.logs || [])
        setLogsPagination(data.pagination)
      }
    } catch {
      /* ignore */
    } finally {
      setLogsLoading(false)
    }
  }, [logsPage])

  useEffect(() => {
    fetchVersions()
  }, [fetchVersions])

  useEffect(() => {
    if (activeTab === "logs") fetchLogs()
  }, [activeTab, fetchLogs])

  async function handleUpload() {
    if (!file || !version.trim()) {
      toast.error("Version and .zip file are required")
      return
    }
    if (!/^\d+\.\d+\.\d+/.test(version.trim())) {
      toast.error("Version must be semver format (e.g. 1.3.0)")
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("version", version.trim())
      formData.append("changelog", changelog)
      formData.append("breaking_changes", breakingChanges)
      formData.append("min_php_version", minPhpVersion || "8.2")

      const res = await fetch("/manage/api/app-versions/upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      })
      const data = await res.json().catch(() => null) as { error?: string; version?: string } | null
      if (!res.ok) throw new Error(data?.error || "Upload failed")

      toast.success(`Release v${data?.version} uploaded`)
      setUploadOpen(false)
      setVersion("")
      setChangelog("")
      setBreakingChanges("")
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ""
      setPage(1)
      fetchVersions()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(v: AppVersion) {
    setDeleting(true)
    try {
      const res = await fetch(`/manage/api/app-versions/${v.version}`, {
        method: "DELETE",
        credentials: "include",
      })
      const data = await res.json().catch(() => null) as { error?: string } | null
      if (!res.ok) throw new Error(data?.error || "Delete failed")
      toast.success(`Release v${v.version} deleted`)
      setConfirmDelete(null)
      fetchVersions()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed")
      setConfirmDelete(null)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Releases</h1>
          <p className="text-sm text-muted-foreground">
            Manage Chatloka application versions for the auto-update system.
          </p>
        </div>
        <Button className="cursor-pointer" onClick={() => setUploadOpen(true)}>
          <IconUpload size={16} className="mr-1" />
          Upload Release
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="versions" className="gap-2 cursor-pointer">
            <IconRocket size={14} />
            Versions
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-2 cursor-pointer">
            <IconDownload size={14} />
            Update Logs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="versions" className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="relative">
                <IconSearch
                  size={14}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  className="h-8 pl-8 text-xs"
                  placeholder="Search by version or changelog..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {loading ? (
            <CardTableSkeleton rows={10} />
          ) : versions.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <IconRocket size={40} className="mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No releases yet. Upload the first one.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[140px]">Version</TableHead>
                      <TableHead>Changelog</TableHead>
                      <TableHead className="w-[110px]">Size</TableHead>
                      <TableHead className="w-[160px]">Released</TableHead>
                      <TableHead className="w-[110px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {versions.map((v) => (
                      <TableRow key={v.version} className="hover:bg-muted/50">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-medium">{v.version}</span>
                            {v.is_latest === 1 && (
                              <Badge className="gap-1 bg-blue-500/15 text-blue-400 border-blue-500/30">
                                <IconCircleCheck size={10} />
                                Latest
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[260px]">
                          <span className="block truncate text-sm text-muted-foreground">
                            {v.changelog?.split("\n").find((l) => l.trim()) || "—"}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm">{formatFileSize(v.file_size)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDate(v.released_at)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 cursor-pointer p-0"
                              onClick={() => navigate(`/manage/releases/${v.version}`)}
                              title="View details"
                            >
                              <IconEye size={14} />
                            </Button>
                            {v.is_latest !== 1 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 cursor-pointer p-0 text-destructive"
                                onClick={() => setConfirmDelete(v)}
                                disabled={deleting}
                                title="Delete"
                              >
                                <IconTrash size={14} />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-border p-3">
                  <span className="text-xs text-muted-foreground">
                    Page {pagination.page} of {pagination.totalPages} ({pagination.total} release
                    {pagination.total !== 1 ? "s" : ""})
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 cursor-pointer p-0"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      <IconChevronLeft size={14} />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 cursor-pointer p-0"
                      disabled={page >= pagination.totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      <IconChevronRight size={14} />
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          )}
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          {logsLoading ? (
            <CardTableSkeleton rows={10} />
          ) : logs.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <IconDownload size={40} className="mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No update activity yet.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[160px]">Date</TableHead>
                      <TableHead>Purchase Code</TableHead>
                      <TableHead>Domain</TableHead>
                      <TableHead className="w-[140px]">Version</TableHead>
                      <TableHead className="w-[110px]">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDate(log.downloaded_at || log.created_at)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{log.purchase_code}</TableCell>
                        <TableCell className="text-sm">{log.domain}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {log.from_version} → {log.to_version}
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={
                              log.status === "success"
                                ? "gap-1 bg-green-500/15 text-green-400 border-green-500/30"
                                : "gap-1 bg-red-500/15 text-red-400 border-red-500/30"
                            }
                          >
                            {log.status === "success" ? (
                              <IconCircleCheck size={10} />
                            ) : (
                              <IconLoader size={10} />
                            )}
                            {log.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
              {logsPagination.totalPages > 1 && (
                <div className="flex items-center justify-between border-t p-4">
                  <span className="text-xs text-muted-foreground">
                    Page {logsPagination.page} of {logsPagination.totalPages}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 cursor-pointer p-0"
                      disabled={logsPage <= 1}
                      onClick={() => setLogsPage((p) => p - 1)}
                    >
                      <IconChevronLeft size={14} />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 cursor-pointer p-0"
                      disabled={logsPage >= logsPagination.totalPages}
                      onClick={() => setLogsPage((p) => p + 1)}
                    >
                      <IconChevronRight size={14} />
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Upload dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <IconUpload size={16} />
              Upload Release
            </DialogTitle>
            <DialogDescription>
              Upload a new ChatAI version. This becomes the latest version clients auto-update to.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Version</Label>
              <Input
                className="h-8 font-mono text-xs"
                placeholder="e.g. 1.3.0"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Changelog</Label>
              <Textarea
                className="text-xs"
                rows={3}
                placeholder="What changed in this release?"
                value={changelog}
                onChange={(e) => setChangelog(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Breaking changes</Label>
              <Textarea
                className="text-xs"
                rows={2}
                placeholder="Anything users must do manually after updating (optional)"
                value={breakingChanges}
                onChange={(e) => setBreakingChanges(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Min PHP version</Label>
              <Input
                className="h-8 text-xs"
                placeholder="8.2"
                value={minPhpVersion}
                onChange={(e) => setMinPhpVersion(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Zip file</Label>
              <Input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                className="h-8 cursor-pointer text-xs"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </div>
          </div>

          <DialogFooter className="mt-2">
            <Button variant="outline" size="sm" className="cursor-pointer" onClick={() => setUploadOpen(false)} disabled={uploading}>
              Cancel
            </Button>
            <Button size="sm" className="cursor-pointer" onClick={handleUpload} disabled={uploading}>
              {uploading ? <IconLoader size={14} className="mr-1 animate-spin" /> : <IconUpload size={14} className="mr-1" />}
              {uploading ? "Uploading..." : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(open) => !open && !deleting && setConfirmDelete(null)}
        title={confirmDelete ? `Delete release v${confirmDelete.version}?` : ""}
        description="This cannot be undone. The zip stays in storage but the version row is removed."
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={() => confirmDelete && handleDelete(confirmDelete)}
      />
    </div>
  )
}