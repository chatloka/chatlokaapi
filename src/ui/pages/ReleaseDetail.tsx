import { useEffect, useState, useCallback } from "react"
import { parseDbDate } from "@/lib/dates"
import { useParams, useNavigate } from "react-router-dom"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  IconArrowLeft,
  IconRocket,
  IconCopy,
  IconCheck,
  IconTrash,
  IconLoader,
  IconCircleCheck,
} from "@tabler/icons-react"
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"

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
  created_by: string | null
}

function formatFileSize(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return "—"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—"
  const d = parseDbDate(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function ReleaseDetail() {
  const { version } = useParams<{ version: string }>()
  const navigate = useNavigate()
  const [release, setRelease] = useState<AppVersion | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const fetchRelease = useCallback(async () => {
    try {
      const res = await fetch(`/manage/api/app-versions/${version}`, {
        credentials: "include",
      })
      if (res.ok) {
        const data = await res.json() as { version: AppVersion }
        setRelease(data.version)
      }
    } catch (error) {
      console.error("Failed to fetch release:", error)
    } finally {
      setLoading(false)
    }
  }, [version])

  useEffect(() => {
    if (version) fetchRelease()
  }, [version, fetchRelease])

  async function handleDelete() {
    if (!release) return
    if (!window.confirm(`Delete release v${release.version}? This cannot be undone.`)) return
    setDeleting(true)
    try {
      const res = await fetch(`/manage/api/app-versions/${release.version}`, {
        method: "DELETE",
        credentials: "include",
      })
      const data = await res.json().catch(() => null) as { error?: string } | null
      if (!res.ok) throw new Error(data?.error || "Delete failed")
      toast.success(`Release v${release.version} deleted`)
      navigate("/manage/releases")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed")
    } finally {
      setDeleting(false)
    }
  }

  function copyChecksum() {
    if (!release) return
    navigator.clipboard.writeText(release.checksum)
    setCopied(true)
    toast.success("Checksum copied to clipboard")
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-32" />
        <div className="rounded-lg border p-6 space-y-4">
          <Skeleton className="h-6 w-40" />
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2"><Skeleton className="h-4 w-16" /><Skeleton className="h-6 w-12" /></div>
            <div className="space-y-2"><Skeleton className="h-4 w-16" /><Skeleton className="h-6 w-24" /></div>
            <div className="space-y-2"><Skeleton className="h-4 w-16" /><Skeleton className="h-6 w-12" /></div>
            <div className="md:col-span-4 space-y-2"><Skeleton className="h-4 w-32" /><Skeleton className="h-6 w-full" /></div>
          </div>
        </div>
        <div className="rounded-lg border p-6">
          <Skeleton className="h-6 w-32 mb-4" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    )
  }

  if (!release) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => navigate("/manage/releases")} className="cursor-pointer">
          <IconArrowLeft className="mr-2 h-4 w-4" />
          Back to Releases
        </Button>
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <IconRocket className="h-12 w-12 mb-4" />
          <p>Release not found</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate("/manage/releases")} className="cursor-pointer">
            <IconArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div className="flex items-center gap-3">
            <IconRocket className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">v{release.version}</h1>
              <p className="text-muted-foreground">Chatloka application release</p>
            </div>
            {release.is_latest === 1 && (
              <Badge className="gap-1 bg-blue-500/15 text-blue-400 border-blue-500/30 ml-2">
                <IconCircleCheck className="h-3 w-3" />
                Latest
              </Badge>
            )}
          </div>
        </div>
        {release.is_latest !== 1 && (
          <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="cursor-pointer">
            {deleting ? <IconLoader className="mr-2 h-4 w-4 animate-spin" /> : <IconTrash className="mr-2 h-4 w-4" />}
            Delete Release
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Release Details</CardTitle>
          <CardDescription>Metadata for v{release.version}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <p className="text-sm text-muted-foreground">Version</p>
              <p className="text-lg font-mono font-bold">{release.version}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Released</p>
              <p className="text-lg">{formatDate(release.released_at)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Size</p>
              <p className="text-lg">{formatFileSize(release.file_size)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Min PHP</p>
              <p className="text-lg">{release.min_php_version || "8.2"}</p>
            </div>
            <div className="md:col-span-4">
              <p className="text-sm text-muted-foreground">Checksum (SHA-256)</p>
              <div className="flex items-center gap-2">
                <code className="text-xs font-mono bg-muted px-2 py-1 rounded break-all">
                  {release.checksum}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={copyChecksum}
                  className="cursor-pointer shrink-0"
                >
                  {copied ? (
                    <IconCheck className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <IconCopy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            <div className="md:col-span-4">
              <p className="text-sm text-muted-foreground">R2 Path</p>
              <code className="text-xs font-mono bg-muted px-2 py-1 rounded break-all">{release.zip_path}</code>
            </div>
          </div>
        </CardContent>
      </Card>

      {release.changelog && (
        <Card>
          <CardHeader>
            <CardTitle>Changelog</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md bg-muted p-4 text-sm whitespace-pre-wrap">
              {release.changelog}
            </div>
          </CardContent>
        </Card>
      )}

      {release.breaking_changes && (
        <Card className="border-amber-500/30">
          <CardHeader>
            <CardTitle className="text-amber-400">Breaking Changes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-4 text-sm whitespace-pre-wrap text-foreground">
              {release.breaking_changes}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
