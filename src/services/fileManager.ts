// ============================================
// R2 File Manager Service
// Generic object management over the PLUGINS_BUCKET binding:
// listing (folder-style via delimiter), folder creation, single/batch
// delete, recursive folder delete, and metadata helpers.
// Shared by the admin API routes and the MCP tools.
// ============================================

export interface R2FileEntry {
  kind: "file" | "folder"
  key: string
  name: string
  size: number
  uploaded: string | null
  contentType: string | null
  sha256: string | null
  etag: string | null
}

export interface R2ListResult {
  files: R2FileEntry[]
  folders: R2FileEntry[]
  truncated: boolean
  cursor: string | null
}

/** Ensure a folder prefix always ends with a trailing slash. */
export function normalizeFolder(path: string): string {
  const trimmed = path.trim().replace(/^\/+|\/+$/g, "")
  return trimmed ? `${trimmed}/` : ""
}

/** Split a key into its folder part + file name. */
export function splitKey(key: string): { folder: string; name: string } {
  const idx = key.lastIndexOf("/")
  if (idx === -1) return { folder: "", name: key }
  return { folder: key.slice(0, idx + 1), name: key.slice(idx + 1) }
}

function objectToEntry(obj: R2Object): R2FileEntry {
  const { name } = splitKey(obj.key)
  const sha = obj.checksums?.sha256
  return {
    kind: "file",
    key: obj.key,
    name,
    size: obj.size,
    uploaded: obj.uploaded ? obj.uploaded.toISOString() : null,
    contentType: obj.httpMetadata?.contentType || null,
    sha256: typeof sha === "string" ? sha : null,
    etag: obj.httpEtag || null,
  }
}

export class FileManagerService {
  constructor(private bucket: R2Bucket) {}

  /**
   * List the contents of a folder. With delimiter "/" (default) the result
   * contains files in the folder plus sub-folders (common prefixes).
   * When `search` is provided, listing switches to recursive mode (no
   * delimiter) and only entries whose name matches (case-insensitive) are
   * returned — this lets the UI/MCP search inside a subtree.
   */
  async list(prefix: string, options?: {
    cursor?: string
    limit?: number
    search?: string
    recursive?: boolean
  }): Promise<R2ListResult> {
    const folder = normalizeFolder(prefix)
    const limit = options?.limit || 200
    const search = options?.search?.trim()
    const recursive = Boolean(search) || Boolean(options?.recursive)

    const result = await this.bucket.list({
      prefix: folder,
      delimiter: recursive ? undefined : "/",
      cursor: options?.cursor,
      limit: Math.min(limit, 1000),
    })

    let files = (result.objects || []).map((o) => objectToEntry(o))
    const folders = (result.delimitedPrefixes || []).map<R2FileEntry>((p) => ({
      kind: "folder",
      key: p,
      name: p.slice(folder.length, -1),
      size: 0,
      uploaded: null,
      contentType: null,
      sha256: null,
      etag: null,
    }))

    // Folder placeholder objects (zero-byte, trailing "/") never appear in
    // delimiter mode, but they do in recursive/search mode — drop them.
    files = files.filter((f) => !f.key.endsWith("/"))

    if (search) {
      const needle = search.toLowerCase()
      files = files.filter(
        (f) =>
          f.name.toLowerCase().includes(needle) ||
          f.key.toLowerCase().includes(needle)
      )
    }

    return {
      files,
      folders,
      truncated: result.truncated,
      cursor: result.truncated ? (result.cursor || null) : null,
    }
  }

  /** Create a folder placeholder (zero-byte object with a trailing slash). */
  async createFolder(path: string): Promise<string> {
    const key = normalizeFolder(path)
    if (!key) throw new Error("Folder path is required")
    await this.bucket.put(key, "")
    return key
  }

  /** Delete a single object. Returns true when it existed. */
  async deleteKey(key: string): Promise<boolean> {
    const obj = await this.bucket.head(key)
    if (!obj) return false
    await this.bucket.delete(key)
    return true
  }

  /**
   * Delete every object under a folder prefix (recursively), in batches of
   * 1000 keys (the R2 delete API limit). Returns the number of objects removed.
   */
  async deleteFolderRecursive(folder: string): Promise<number> {
    const prefix = normalizeFolder(folder)
    let deleted = 0
    let cursor: string | undefined

    for (;;) {
      const page = await this.bucket.list({ prefix, cursor, limit: 1000 })
      const keys = (page.objects || []).map((o) => o.key)
      if (keys.length > 0) {
        await this.bucket.delete(keys)
        deleted += keys.length
      }
      if (!page.truncated || !page.cursor) break
      cursor = page.cursor
    }

    return deleted
  }

  /** Delete a single file or an entire folder (recursively). */
  async deletePath(key: string): Promise<{ deleted: number; type: "file" | "folder" }> {
    if (key.endsWith("/")) {
      return { deleted: await this.deleteFolderRecursive(key), type: "folder" }
    }
    const existed = await this.deleteKey(key)
    return { deleted: existed ? 1 : 0, type: "file" }
  }

  /** Fetch object metadata only. Returns null when the key does not exist. */
  async head(key: string): Promise<R2Object | null> {
    return this.bucket.head(key)
  }

  /** Upload a file to an exact key. Optional sha256 is passed to R2 for integrity validation. */
  async putFile(
    key: string,
    value: ReadableStream | ArrayBuffer | ArrayBufferView | string | Blob,
    options?: { contentType?: string; sha256?: string }
  ): Promise<R2Object> {
    const putOptions: R2PutOptions = {
      httpMetadata: { contentType: options?.contentType || "application/octet-stream" },
    }
    if (options?.sha256) {
      putOptions.sha256 = options.sha256
    }
    return this.bucket.put(key, value, putOptions)
  }
}
