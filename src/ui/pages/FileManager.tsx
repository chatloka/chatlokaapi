import { useCallback, useEffect, useRef, useState } from "react"
import { formatFileSize, formatDate } from "@/lib/format"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { CardTableSkeleton } from "@/components/Skeletons"
import {
  IconFolder,
  IconFolderOpen,
  IconFile,
  IconFileText,
  IconFileZip,
  IconFileTypePdf,
  IconFileCode,
  IconFileSpreadsheet,
  IconPhoto,
  IconUpload,
  IconFolderPlus,
  IconSearch,
  IconRefresh,
  IconEye,
  IconDownload,
  IconTrash,
  IconChevronRight,
  IconHome,
  IconX,
  IconAlertTriangle,
  IconDatabase,
  IconMarkdown,
} from "@tabler/icons-react"

interface FileEntry {
  kind: "file" | "folder"
  key: string
  name: string
  size: number
  uploaded: string | null
  contentType: string | null
  sha256: string | null
  etag: string | null
}

interface ListResponse {
  path: string
  folders: FileEntry[]
  files: FileEntry[]
  hasMore: boolean
  cursor: string | null
}

const MAX_UI_UPLOAD = 95 * 1024 * 1024
const MAX_PREVIEW_BYTES = 1024 * 1024 // text preview limit

function fileIcon(entry: FileEntry) {
  const ext = entry.name.split(".").pop()?.toLowerCase() || ""
  const type = entry.contentType || ""
  if (type.startsWith("image/")) return <IconPhoto className="h-4 w-4 text-blue-400" />
  if (ext === "zip" || ext === "tar" || ext === "gz") return <IconFileZip className="h-4 w-4 text-amber-400" />
  if (ext === "pdf") return <IconFileTypePdf className="h-4 w-4 text-red-400" />
  if (["js", "ts", "php", "py", "go", "java", "rb", "css", "html", "json", "xml", "yaml", "yml", "sh"].includes(ext)) {
    return <IconFileCode className="h-4 w-4 text-emerald-400" />
  }
  if (ext === "md" || ext === "markdown") return <IconMarkdown className="h-4 w-4 text-sky-400" />
  if (["csv", "xlsx", "xls"].includes(ext)) return <IconFileSpreadsheet className="h-4 w-4 text-green-400" />
  if (["md", "txt", "log"].includes(ext) || type.startsWith("text/")) {
    return <IconFileText className="h-4 w-4 text-slate-400" />
  }
  return <IconFile className="h-4 w-4 text-slate-400" />
}

function typeBadge(entry: FileEntry) {
  const ext = entry.name.split(".").pop()?.toLowerCase() || ""
  const label = ext ? ext.toUpperCase() : (entry.contentType || "FILE")
  return (
    <Badge variant="outline" className="gap-1 border border-border bg-muted/50 text-muted-foreground">
      {fileIcon(entry)}
      <span className="font-mono text-[10px]">{label}</span>
    </Badge>
  )
}

function isPreviewableText(entry: FileEntry): boolean {
  const type = entry.contentType || ""
  if (type.startsWith("text/")) return true
  const ext = entry.name.split(".").pop()?.toLowerCase() || ""
  return ["json", "md", "xml", "yaml", "yml", "csv", "log", "ini", "conf", "env", "gitignore", "js", "ts", "php", "html", "css"].includes(ext)
}

export function FileManager() {
  const navigate = useNavigate()
  const [path, setPath] = useState("")
  const [entries, setEntries] = useState<ListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  // Dialogs
  const [folderOpen, setFolderOpen] = useState(false)
  const [folderName, setFolderName] = useState("")
  const [previewEntry, setPreviewEntry] = useState<FileEntry | null>(null)
  const [previewText, setPreviewText] = useState<string | null>(null)
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [deleteEntry, setDeleteEntry] = useState<FileEntry | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Debounce the live search input so we don't refetch on every keystroke
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search), 300)
    return () => window.clearTimeout(t)
  }, [search])

  const fetchList = useCallback(async (reset: boolean) => {
    try {
      if (reset) setLoading(true)
      const params = new URLSearchParams()
      params.set("path", path)
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim())
      if (!reset && cursor) params.set("cursor", cursor)
      params.set("limit", "200")

      const res = await fetch(`/manage/api/files?${params}`, { credentials: "include" })
      if (!res.ok) {
        const data = await res.json().catch(() => null) as { error?: { message?: string } } | null
        throw new Error(data?.error?.message || "Failed to load files")
      }
      const data = await res.json() as ListResponse
      setEntries((prev) =>
        reset || !prev
          ? data
          : { ...data, folders: data.folders, files: [...prev.files, ...data.files] }
      )
      setHasMore(data.hasMore)
      setCursor(data.cursor)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load files")
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [path, debouncedSearch, cursor])

  useEffect(() => {
    setCursor(null)
    setEntries(null)
    fetchList(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, debouncedSearch])

  const openFolder = (folderKey: string) => {
    setPath(folderKey)
  }

  const goUp = () => {
    if (!path) return
    const parts = path.replace(/\/$/, "").split("/")
    parts.pop()
    setPath(parts.length > 0 ? parts.join("/") + "/" : "")
  }

  const breadcrumbParts = path ? path.replace(/\/$/, "").split("/") : []

  async function handleCreateFolder() {
    const name = folderName.trim().replace(/\/+$/g, "")
    if (!name) {
      toast.error("Folder name is required")
      return
    }
    const targetPath = `${path}${name}/`
    try {
      const res = await fetch("/manage/api/files/folder", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: targetPath }),
      })
      const data = await res.json().catch(() => null) as { error?: { message?: string } } | null
      if (!res.ok) throw new Error(data?.error?.message || "Failed to create folder")
      toast.success(`Folder '${name}' created`)
      setFolderOpen(false)
      setFolderName("")
      setCursor(null)
      fetchList(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create folder")
    }
  }

  async function handleUploadFile(file: File) {
    if (file.size > MAX_UI_UPLOAD) {
      toast.error("File exceeds the 95 MB UI upload limit. Use MCP generate_file_upload_link (rclone) for larger files.")
      return
    }
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("path", path)
      const res = await fetch("/manage/api/files/upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      })
      const data = await res.json().catch(() => null) as { error?: { message?: string } } | null
      if (!res.ok) throw new Error(data?.error?.message || "Upload failed")
      toast.success(`'${file.name}' uploaded`)
      setCursor(null)
      fetchList(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  async function handleDelete() {
    if (!deleteEntry) return
    setDeleting(true)
    try {
      const res = await fetch("/manage/api/files", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: deleteEntry.key }),
      })
      const data = await res.json().catch(() => null) as { error?: { message?: string } } | null
      if (!res.ok) throw new Error(data?.error?.message || "Delete failed")
      toast.success(`${deleteEntry.kind === "folder" ? "Folder" : "File"} '${deleteEntry.name}' deleted`)
      setDeleteEntry(null)
      setCursor(null)
      fetchList(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed")
    } finally {
      setDeleting(false)
    }
  }

  async function openPreview(entry: FileEntry) {
    const ext = entry.name.split(".").pop()?.toLowerCase() || ""
    if (ext === "md" || ext === "markdown") {
      navigate(
        `/manage/files/preview?key=${encodeURIComponent(entry.key)}&name=${encodeURIComponent(entry.name)}`
      )
      return
    }
    setPreviewEntry(entry)
    setPreviewText(null)
    setPreviewBlobUrl(null)

    try {
      setPreviewLoading(true)
      const url = `/manage/api/files/download?key=${encodeURIComponent(entry.key)}&mode=inline`
      const res = await fetch(url, { credentials: "include" })
      if (!res.ok) throw new Error("Failed to load file")

      const contentType = entry.contentType || res.headers.get("Content-Type") || ""
      if (contentType.startsWith("image/")) {
        const blob = await res.blob()
        setPreviewBlobUrl(URL.createObjectURL(blob))
      } else if (isPreviewableText(entry) && entry.size <= MAX_PREVIEW_BYTES) {
        setPreviewText(await res.text())
      } else if (contentType === "application/pdf" && entry.size <= 10 * 1024 * 1024) {
        const blob = await res.blob()
        setPreviewBlobUrl(URL.createObjectURL(blob))
      } else {
        setPreviewText(null)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Preview failed")
      setPreviewEntry(null)
    } finally {
      setPreviewLoading(false)
    }
  }

  function closePreview() {
    if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl)
    setPreviewEntry(null)
    setPreviewText(null)
    setPreviewBlobUrl(null)
  }

  const allEntries: FileEntry[] = [
    ...(entries?.folders || []),
    ...(entries?.files || []),
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">File Manager</h1>
          <p className="text-sm text-muted-foreground">
            R2 object storage — internal specs, docs, source code & custom solutions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="cursor-pointer"
            onClick={() => setFolderOpen(true)}
          >
            <IconFolderPlus size={15} className="mr-1" />
            New Folder
          </Button>
          <Button className="cursor-pointer" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            <IconUpload size={15} className="mr-1" />
            {uploading ? "Uploading…" : "Upload File"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleUploadFile(file)
            }}
          />
        </div>
      </div>

      {/* Breadcrumb + search */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 cursor-pointer gap-1 px-2"
                onClick={() => setPath("")}
              >
                <IconHome size={14} />
                Root
              </Button>
              {breadcrumbParts.map((part, idx) => {
                const targetPath = breadcrumbParts.slice(0, idx + 1).join("/") + "/"
                const isLast = idx === breadcrumbParts.length - 1
                return (
                  <span key={`${targetPath}-${idx}`} className="flex min-w-0 items-center gap-1">
                    <IconChevronRight size={13} className="shrink-0 text-muted-foreground" />
                    {isLast ? (
                      <span className="flex items-center gap-1 truncate font-medium">
                        <IconFolderOpen size={14} className="shrink-0 text-blue-400" />
                        <span className="truncate">{part}</span>
                      </span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 cursor-pointer gap-1 px-1.5"
                        onClick={() => setPath(targetPath)}
                      >
                        {part}
                      </Button>
                    )}
                  </span>
                )
              })}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <IconSearch
                  size={14}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  className="h-8 w-56 pl-8 text-xs"
                  placeholder="Search files in this folder..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 cursor-pointer p-0"
                onClick={() => { setCursor(null); fetchList(true) }}
                title="Refresh"
              >
                <IconRefresh size={14} />
              </Button>
              {path && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 cursor-pointer gap-1 px-2"
                  onClick={goUp}
                >
                  <IconChevronRight size={14} className="rotate-180" />
                  Up
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* System prefix warning */}
      {path === "" && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
          <IconAlertTriangle size={14} className="mt-0.5 shrink-0" />
          <p>
            You are at the bucket root. <code className="font-mono">plugins/</code>,{" "}
            <code className="font-mono">app-releases/</code> and{" "}
            <code className="font-mono">ticket-attachments/</code> are managed by other
            features — deleting files there can break downloads. Put internal files under{" "}
            <code className="font-mono">files/</code>.
          </p>
        </div>
      )}

      {loading ? (
        <CardTableSkeleton rows={8} />
      ) : allEntries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <IconFolder size={40} className="mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {search
                ? "No files match your search."
                : path
                  ? "This folder is empty."
                  : "No files yet. Create a folder or upload a file."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-[90px]">Size</TableHead>
                  <TableHead className="w-[110px]">Type</TableHead>
                  <TableHead className="w-[150px]">Uploaded</TableHead>
                  <TableHead className="w-[120px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allEntries.map((entry) => (
                  <TableRow
                    key={entry.key}
                    className={entry.kind === "folder" ? "cursor-pointer hover:bg-muted/50" : "hover:bg-muted/50"}
                    onClick={() => entry.kind === "folder" && openFolder(entry.key)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <span className="shrink-0">
                          {entry.kind === "folder" ? (
                            <IconFolder className="h-4 w-4 text-blue-400" />
                          ) : (
                            fileIcon(entry)
                          )}
                        </span>
                        <span className="truncate font-medium">{entry.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {entry.kind === "file" ? formatFileSize(entry.size) : "—"}
                    </TableCell>
                    <TableCell>
                      {entry.kind === "folder" ? (
                        <Badge variant="outline" className="gap-1 border border-blue-500/30 bg-blue-500/10 text-blue-400">
                          <IconFolderOpen size={10} />
                          FOLDER
                        </Badge>
                      ) : (
                        typeBadge(entry)
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {entry.kind === "file" ? formatDate(entry.uploaded) : "—"}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {entry.kind === "file" && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 cursor-pointer p-0"
                              onClick={() => openPreview(entry)}
                              title="Preview"
                            >
                              <IconEye size={14} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 cursor-pointer p-0"
                              onClick={() => {
                                const url = `/manage/api/files/download?key=${encodeURIComponent(entry.key)}&mode=attachment`
                                const a = document.createElement("a")
                                a.href = url
                                a.download = entry.name
                                a.click()
                              }}
                              title="Download"
                            >
                              <IconDownload size={14} />
                            </Button>
                          </>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 cursor-pointer p-0 text-destructive"
                          onClick={() => setDeleteEntry(entry)}
                          title={entry.kind === "folder" ? "Delete folder (recursive)" : "Delete file"}
                        >
                          <IconTrash size={14} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
          {hasMore && (
            <div className="flex items-center justify-center border-t border-border p-3">
              <Button
                variant="outline"
                size="sm"
                className="cursor-pointer gap-1.5"
                onClick={() => { setLoadingMore(true); fetchList(false) }}
                disabled={loadingMore}
              >
                <IconDatabase size={14} />
                {loadingMore ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* New Folder dialog */}
      <Dialog open={folderOpen} onOpenChange={setFolderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Folder</DialogTitle>
            <DialogDescription>
              Created inside <code className="font-mono text-xs">{path || "root"}</code>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="folder-name">Folder name</Label>
            <Input
              id="folder-name"
              className="font-mono text-sm"
              placeholder="e.g. specs/2025"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" className="cursor-pointer" onClick={() => setFolderOpen(false)}>
              Cancel
            </Button>
            <Button className="cursor-pointer" onClick={handleCreateFolder}>
              <IconFolderPlus size={15} className="mr-1" />
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview dialog */}
      <Dialog open={!!previewEntry} onOpenChange={(open) => !open && closePreview()}>
        <DialogContent className="max-w-3xl">
          <DialogHeader className="flex flex-row items-start justify-between gap-2">
            <div className="min-w-0">
              <DialogTitle className="truncate">{previewEntry?.name}</DialogTitle>
              <DialogDescription className="break-all font-mono text-xs">
                {previewEntry?.key} · {previewEntry ? formatFileSize(previewEntry.size) : ""}
                {previewEntry?.sha256 ? ` · sha256 ${previewEntry.sha256.slice(0, 12)}…` : ""}
              </DialogDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 shrink-0 cursor-pointer p-0"
              onClick={closePreview}
            >
              <IconX size={14} />
            </Button>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto rounded-md border border-border bg-muted/30">
            {previewLoading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
            ) : previewBlobUrl ? (
              previewEntry?.contentType?.startsWith("image/") ? (
                <img src={previewBlobUrl} alt={previewEntry?.name} className="mx-auto max-h-[60vh] object-contain" />
              ) : (
                <iframe src={previewBlobUrl} title={previewEntry?.name} className="h-[60vh] w-full" />
              )
            ) : previewText !== null ? (
              <pre className="whitespace-pre-wrap break-words p-4 font-mono text-xs leading-relaxed">{previewText}</pre>
            ) : (
              <div className="flex flex-col items-center gap-3 p-10 text-center text-sm text-muted-foreground">
                <IconFile size={32} />
                <p>
                  This file is too large or of an unsupported type to preview inline.
                  Download it instead.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="cursor-pointer gap-1.5"
                  onClick={() => {
                    const url = `/manage/api/files/download?key=${encodeURIComponent(previewEntry?.key || "")}&mode=attachment`
                    const a = document.createElement("a")
                    a.href = url
                    a.download = previewEntry?.name || "file"
                    a.click()
                  }}
                >
                  <IconDownload size={14} />
                  Download
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={!!deleteEntry} onOpenChange={(open) => !open && setDeleteEntry(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IconAlertTriangle size={16} className="text-destructive" />
              Delete {deleteEntry?.kind === "folder" ? "folder" : "file"}?
            </DialogTitle>
            <DialogDescription>
              {deleteEntry?.kind === "folder" ? (
                <>
                  <code className="font-mono text-xs">{deleteEntry?.key}</code> and{" "}
                  <strong>everything inside it</strong> will be permanently removed from R2.
                  This cannot be undone.
                </>
              ) : (
                <>
                  <code className="font-mono text-xs">{deleteEntry?.key}</code> will be
                  permanently removed from R2. This cannot be undone.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="cursor-pointer" onClick={() => setDeleteEntry(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="cursor-pointer"
              onClick={handleDelete}
              disabled={deleting}
            >
              <IconTrash size={15} className="mr-1" />
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
