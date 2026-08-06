import { useEffect, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { MarkdownView } from "@/components/MarkdownView"
import {
  IconArrowLeft,
  IconDownload,
  IconMarkdown,
  IconCode,
  IconEye,
} from "@tabler/icons-react"
import { toast } from "sonner"

const MAX_PREVIEW_BYTES = 5 * 1024 * 1024

export function MarkdownPreview() {
  const [searchParams] = useSearchParams()
  const key = searchParams.get("key") || ""
  const name = searchParams.get("name") || key.split("/").pop() || "preview.md"

  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [rawMode, setRawMode] = useState(false)

  useEffect(() => {
    if (!key) {
      setError("Missing key parameter")
      setLoading(false)
      return
    }
    let cancelled = false
    async function load() {
      try {
        setLoading(true)
        const res = await fetch(
          `/manage/api/files/download?key=${encodeURIComponent(key)}&mode=inline`,
          { credentials: "include" }
        )
        if (!res.ok) {
          const data = await res.json().catch(() => null) as { error?: { message?: string } } | null
          throw new Error(data?.error?.message || "Failed to load file")
        }
        const length = parseInt(res.headers.get("Content-Length") || "0", 10)
        if (length > MAX_PREVIEW_BYTES) {
          throw new Error("File exceeds the 5 MB markdown preview limit — download it instead")
        }
        const text = await res.text()
        if (!cancelled) setContent(text)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load file")
          toast.error(err instanceof Error ? err.message : "Failed to load file")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [key])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground">
            <IconMarkdown className="h-5 w-5 text-sky-400" />
            {name}
          </h1>
          <p className="break-all font-mono text-xs text-muted-foreground">{key}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="cursor-pointer gap-1.5" onClick={() => setRawMode((m) => !m)}>
            {rawMode ? (
              <>
                <IconEye size={14} />
                Rendered
              </>
            ) : (
              <>
                <IconCode size={14} />
                Raw
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="cursor-pointer gap-1.5"
            onClick={() => {
              const a = document.createElement("a")
              a.href = `/manage/api/files/download?key=${encodeURIComponent(key)}&mode=attachment`
              a.download = name
              a.click()
            }}
          >
            <IconDownload size={14} />
            Download
          </Button>
          <Link to="/manage/files">
            <Button variant="ghost" size="sm" className="cursor-pointer gap-1.5">
              <IconArrowLeft size={14} />
              File Manager
            </Button>
          </Link>
        </div>
      </div>

      {error ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Link to="/manage/files">
              <Button variant="outline" size="sm" className="mt-4 cursor-pointer">
                Back to File Manager
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : loading ? (
        <Card>
          <CardContent className="space-y-4 p-6">
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      ) : content !== null ? (
        <Card>
          <CardContent className="p-6">
            {rawMode ? (
              <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">{content}</pre>
            ) : (
              <MarkdownView markdown={content} />
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">No content.</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
