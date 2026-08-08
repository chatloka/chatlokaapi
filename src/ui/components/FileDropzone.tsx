import { useCallback, useRef, useState } from "react"
import {
  IconUpload,
  IconX,
  IconFile,
  IconFileZip,
  IconFileText,
  IconPhoto,
} from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import { formatFileSize } from "@/lib/format"

interface FileDropzoneProps {
  files: File[]
  onChange: (files: File[]) => void
  maxSizeMB?: number
  className?: string
  disabled?: boolean
}

function getFileIcon(file: File) {
  const name = file.name.toLowerCase()
  if (name.endsWith(".zip") || name.endsWith(".rar") || name.endsWith(".7z") || name.endsWith(".tar"))
    return IconFileZip
  if (file.type.startsWith("image/")) return IconPhoto
  if (
    file.type.startsWith("text/") ||
    file.type.includes("pdf") ||
    file.type.includes("document") ||
    name.endsWith(".pdf") ||
    name.endsWith(".doc") ||
    name.endsWith(".docx") ||
    name.endsWith(".xls") ||
    name.endsWith(".xlsx") ||
    name.endsWith(".txt")
  )
    return IconFileText
  return IconFile
}

export function FileDropzone({
  files,
  onChange,
  maxSizeMB = 10,
  className,
  disabled,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      const list = Array.from(incoming)
      const maxBytes = maxSizeMB * 1024 * 1024
      const oversized = list.find((f) => f.size > maxBytes)
      if (oversized) {
        setError(`"${oversized.name}" exceeds the ${maxSizeMB}MB limit`)
        return
      }
      setError(null)
      onChange([...files, ...list])
    },
    [files, maxSizeMB, onChange]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      if (disabled) return
      if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files)
    },
    [addFiles, disabled]
  )

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={0}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !disabled) inputRef.current?.click()
        }}
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed px-4 py-6 text-center transition-colors",
          dragging
            ? "border-primary bg-primary/5"
            : "border-input hover:border-primary/50 hover:bg-muted/30",
          disabled && "pointer-events-none opacity-50",
          className
        )}
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
          <IconUpload className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="text-sm">
          <span className="font-medium text-foreground">Click to upload</span>{" "}
          <span className="text-muted-foreground">or drag &amp; drop</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Multiple files allowed · up to {maxSizeMB}MB each
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files)
            e.target.value = ""
          }}
        />
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {files.length > 0 && (
        <ul className="space-y-1.5">
          {files.map((file, idx) => {
            const FileIcon = getFileIcon(file)
            return (
              <li
                key={`${file.name}-${file.size}-${idx}`}
                className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-xs"
              >
                <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-foreground" title={file.name}>
                  {file.name}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {formatFileSize(file.size)}
                </span>
                <button
                  type="button"
                  onClick={() => onChange(files.filter((_, i) => i !== idx))}
                  className="shrink-0 cursor-pointer rounded p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  aria-label={`Remove ${file.name}`}
                >
                  <IconX className="h-3.5 w-3.5" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default FileDropzone