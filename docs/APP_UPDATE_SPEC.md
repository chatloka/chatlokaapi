# ChatLoka Auto-Update System — Server-Side Specification

> **Status**: Planning Phase
> **Author**: AI Agent (researched from existing plugin system)
> **Date**: 2026-08-05

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Database Schema](#database-schema)
4. [API Endpoints](#api-endpoints)
5. [R2 Storage Structure](#r2-storage-structure)
6. [Security Model](#security-model)
7. [Admin UI Requirements](#admin-ui-requirements)
8. [Laravel Client Implementation Guide](#laravel-client-implementation-guide)
9. [Implementation Checklist](#implementation-checklist)

---

## Overview

The ChatLoka Auto-Update System enables self-hosted ChatLoka instances to check for and download application updates. Unlike plugin updates (which already work), this system updates the **core ChatLoka application** itself.

### Key Design Decisions

| Decision | Rationale |
|---|---|
| **Manual trigger only** | Updates require license validation; auto-update could bypass checks |
| **Upload via Admin panel** | No GitHub API; releases uploaded directly by developer |
| **R2 private storage** | Releases contain source code; must not be publicly accessible |
| **Markdown changelog** | Rich formatting with live preview in admin UI |
| **Reuse plugin patterns** | Same JWT token flow, same R2 storage, same license validation |
| **Separate from plugin system** | App updates are fundamentally different from plugin updates |

### Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    CHATLOKA SERVER (API)                     │
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │  Admin Upload │    │   Version    │    │   Download   │  │
│  │    (R2 + DB)  │    │    Check     │    │   Handler    │  │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘  │
│         │                   │                   │          │
│         ▼                   ▼                   ▼          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │  R2 Bucket   │    │   DB Query   │    │  JWT Verify  │  │
│  │  (releases/) │    │ (versions)   │    │  + R2 Fetch  │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
└─────────────────────────────────────────────────────────────┘
         ▲                   │                   ▲
         │                   │                   │
         │                   ▼                   │
┌────────┴────────────────────────────────────────────────────┐
│                 CHATLOKA LARAVEL APP                         │
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Check for  │───▶│   Download   │───▶│   Apply      │  │
│  │   Update     │    │   Update     │    │   Update     │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│                                                             │
│  1. POST /api/app/check-update     (license + domain)       │
│  2. POST /api/app/download-token   (license → JWT)          │
│  3. GET  /downloads/:filename      (JWT → zip file)         │
│  4. Extract → Migrate → Clear Cache → Restart               │
└─────────────────────────────────────────────────────────────┘
```

---

## Architecture

### Server Components (Cloudflare Worker — THIS REPO)

| Component | Purpose |
|---|---|
| **Admin Upload** | Upload new release zip + changelog to R2 + DB |
| **Version Check** | Compare client version against latest release |
| **Download Token** | Generate single-use JWT for download |
| **File Download** | Serve zip from R2 with JWT verification |

### Client Components (Laravel App — SEPARATE REPO)

| Component | Purpose |
|---|---|
| **Update Checker** | Periodic or manual check for new version |
| **Update Downloader** | Download zip via token-protected endpoint |
| **Update Applier** | Extract, migrate, clear cache, restart |
| **Admin UI** | Show update status, changelog, trigger update |

---

## Database Schema

### New Table: `app_versions`

```sql
CREATE TABLE app_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version TEXT NOT NULL UNIQUE,               -- e.g. "1.3.0"
    changelog TEXT,                              -- Markdown content
    zip_path TEXT NOT NULL,                      -- R2 object key
    checksum TEXT NOT NULL,                      -- SHA-256 hex digest
    file_size INTEGER,                           -- Size in bytes
    min_php_version TEXT DEFAULT '8.2',          -- Minimum PHP version
    min_chatloka_version TEXT,                   -- Minimum ChatLoka version (if applicable)
    breaking_changes TEXT,                       -- JSON array of breaking change descriptions
    released_at TEXT,                            -- ISO timestamp
    is_latest INTEGER DEFAULT 1,                -- Boolean flag (0/1)
    created_at TEXT DEFAULT (datetime('now')),
    created_by TEXT                              -- Admin user ID who uploaded
);

CREATE INDEX idx_app_versions_latest ON app_versions(is_latest);
CREATE INDEX idx_app_versions_released ON app_versions(released_at DESC);
CREATE UNIQUE INDEX idx_app_versions_version ON app_versions(version);
```

### New Table: `app_update_logs`

```sql
CREATE TABLE app_update_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_code TEXT NOT NULL,
    domain TEXT NOT NULL,
    from_version TEXT NOT NULL,
    to_version TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'success',     -- 'success' | 'failed' | 'rollback'
    error_message TEXT,
    ip_address TEXT,
    user_agent TEXT,
    downloaded_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_app_update_logs_domain ON app_update_logs(domain);
CREATE INDEX idx_app_update_logs_purchase ON app_update_logs(purchase_code);
```

### New Table: `app_used_tokens`

```sql
CREATE TABLE app_used_tokens (
    jti TEXT PRIMARY KEY,
    used_at TEXT DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
);
```

---

## API Endpoints

### Public Endpoints (License Required)

#### 1. Check for Application Update

```
POST /api/app/check-update
```

**Headers:**
- `X-License-Key: <purchase_code>`
- `Content-Type: application/json`

**Request Body:**
```json
{
  "current_version": "1.2.0",
  "domain": "example.com"
}
```

**Response (update available):**
```json
{
  "data": {
    "has_update": true,
    "current_version": "1.2.0",
    "latest_version": "1.3.0",
    "changelog": "# Changelog\n\n## v1.3.0\n\n- Feature X\n- Bug fix Y",
    "download_url": "https://api.chatloka.net/downloads/chatloka-1.3.0.zip",
    "checksum": "sha256hex...",
    "file_size": 15728640,
    "released_at": "2026-08-05T10:00:00Z",
    "breaking_changes": ["Removed deprecated API endpoint /api/old"],
    "min_php_version": "8.2",
    "versions": [
      {
        "version": "1.3.0",
        "changelog": "# Changelog\n\n## v1.3.0\n\n- Feature X\n- Bug fix Y",
        "released_at": "2026-08-05 10:00:00",
        "file_size": 15728640,
        "min_php_version": "8.2",
        "checksum": "sha256hex...",
        "is_latest": true,
        "breaking_changes": ["Removed deprecated API endpoint /api/old"]
      }
    ]
  },
  "signature": "<RSA-SHA256 signature>"
}
```

`versions` is a signed array of all published releases (newest first, max 25). Fields mirror the `app_versions` rows exactly. Backward compatible: clients that predate this key simply ignore it.

**Response (no update):**
```json
{
  "data": {
    "has_update": false,
    "current_version": "1.2.0",
    "latest_version": "1.2.0",
    "versions": []
  },
  "signature": "<RSA-SHA256 signature>"
}
```

**Rate Limit:** 10/min per license-key:IP

---

#### 2. Generate Download Token

```
POST /api/app/download-token
```

**Headers:**
- `X-License-Key: <purchase_code>`
- `Content-Type: application/json`

**Request Body:**
```json
{
  "version": "1.3.0",
  "domain": "example.com"
}
```

**Response:**
```json
{
  "data": {
    "token": "<jwt-token>",
    "expires_at": "2026-08-05T11:00:00Z",
    "download_url": "https://api.chatloka.net/downloads/chatloka-1.3.0.zip",
    "checksum": "sha256hex...",
    "filename": "chatloka-1.3.0.zip",
    "file_size": 15728640
  },
  "signature": "<RSA-SHA256 signature>"
}
```

**JWT Payload:**
```json
{
  "sub": "<purchase_code>",
  "type": "app-update",
  "version": "1.3.0",
  "domain": "example.com",
  "jti": "<random-uuid>",
  "iss": "api.chatloka.net",
  "exp": 1691234400
}
```

**Rate Limit:** 10/min per license-key:IP

---

#### 3. Download Update File

```
GET /downloads/chatloka-<version>.zip
```

**Headers:**
- `X-Download-Token: <jwt-token>`

**Response:** Binary zip file

**Headers in Response:**
- `Content-Type: application/zip`
- `Content-Disposition: attachment; filename="chatloka-1.3.0.zip"`
- `X-Checksum-SHA256: <checksum>`

**Rate Limit:** 10/min per IP

---

#### 4. Report Update Result (Optional but Recommended)

```
POST /api/app/update-result
```

**Headers:**
- `X-License-Key: <purchase_code>`
- `Content-Type: application/json`

**Request Body:**
```json
{
  "from_version": "1.2.0",
  "to_version": "1.3.0",
  "status": "success",
  "domain": "example.com",
  "error_message": null
}
```

**Response:**
```json
{
  "success": true
}
```

**Purpose:** Track update success/failure rates, enable support to see which instances are on which version.

---

### Admin Endpoints (Session Required)

#### 5. List All App Versions

```
GET /manage/api/app-versions?page=1&limit=20&search=1.3
```

**Response:**
```json
{
  "versions": [...],
  "total": 25,
  "page": 1,
  "limit": 20
}
```

---

#### 6. Upload New App Version

```
POST /manage/api/app-versions/upload
```

**Content-Type:** `multipart/form-data`

**Form Fields:**
| Field | Type | Required | Description |
|---|---|---|---|
| `file` | File | Yes | .zip file (max 100MB recommended) |
| `version` | String | Yes | Semantic version (e.g. "1.3.0") |
| `changelog` | String | No | Markdown content |
| `breaking_changes` | String | No | JSON array of breaking change descriptions |
| `min_php_version` | String | No | Minimum PHP version (default: "8.2") |

**Processing:**
1. Validate file is .zip
2. Compute SHA-256 checksum
3. Upload to R2 at `app-releases/<version>/chatloka-<version>.zip`
4. Set all previous versions `is_latest = 0`
5. Insert new row with `is_latest = 1`
6. Return success with version info

**Response:**
```json
{
  "success": true,
  "version": "1.3.0",
  "zip_path": "app-releases/1.3.0/chatloka-1.3.0.zip",
  "checksum": "sha256hex...",
  "file_size": 15728640
}
```

---

#### 7. Get Single Version Detail

```
GET /manage/api/app-versions/:version
```

**Response:**
```json
{
  "id": 1,
  "version": "1.3.0",
  "changelog": "# Changelog\n\n## v1.3.0\n\n...",
  "zip_path": "app-releases/1.3.0/chatloka-1.3.0.zip",
  "checksum": "sha256hex...",
  "file_size": 15728640,
  "released_at": "2026-08-05T10:00:00Z",
  "is_latest": 1,
  "download_count": 42
}
```

---

#### 8. Delete a Version

```
DELETE /manage/api/app-versions/:version
```

**Rules:**
- Cannot delete the latest version
- Must confirm deletion
- Optionally delete from R2 (with confirmation)

---

#### 9. Get Update Logs

```
GET /manage/api/app-update-logs?page=1&limit=50&domain=example.com
```

**Response:**
```json
{
  "logs": [
    {
      "id": 1,
      "purchase_code": "xxx-xxx-xxx",
      "domain": "example.com",
      "from_version": "1.2.0",
      "to_version": "1.3.0",
      "status": "success",
      "ip_address": "1.2.3.4",
      "downloaded_at": "2026-08-05T10:30:00Z"
    }
  ],
  "total": 150,
  "page": 1,
  "limit": 50
}
```

---

## R2 Storage Structure

```
PLUGINS_BUCKET (chatlokaapi)
├── plugins/                          # Existing plugin zips
│   ├── facebook-messenger/
│   │   ├── 1.0.0/
│   │   │   └── facebook-messenger-1.0.0.zip
│   │   └── 1.1.0/
│   │       └── facebook-messenger-1.1.0.zip
│   └── whatsapp-qr/
│       └── ...
└── app-releases/                     # NEW: App release zips
    ├── 1.2.0/
    │   └── chatloka-1.2.0.zip
    ├── 1.3.0/
    │   └── chatloka-1.3.0.zip
    └── 1.4.0/
        └── chatloka-1.4.0.zip
```

**Why separate from plugins?**
- Different access patterns (app updates are rarer but more critical)
- Different retention policy (keep all versions indefinitely)
- Cleaner organization
- Different download rate limits (stricter for app updates)

---

## Security Model

### License Validation Flow

```
Client Request
    │
    ▼
┌─────────────────────────────┐
│ X-License-Key header present│──── No ───▶ 401 Unauthorized
└─────────────┬───────────────┘
              │ Yes
              ▼
┌─────────────────────────────┐
│ License exists in DB?       │──── No ───▶ 401 "License not found"
└─────────────┬───────────────┘
              │ Yes
              ▼
┌─────────────────────────────┐
│ License status = 'active'?  │──── No ───▶ 401 "License inactive"
└─────────────┬───────────────┘
              │ Yes
              ▼
┌─────────────────────────────┐
│ Domain matches license?     │──── No ───▶ 403 "Domain mismatch"
└─────────────┬───────────────┘
              │ Yes
              ▼
         ✓ Access Granted
```

### JWT Token Security

| Property | Value |
|---|---|
| Algorithm | HS256 |
| Secret | `DOWNLOAD_TOKEN_SECRET` (Cloudflare secret) |
| Expiry | 1 hour (3600 seconds) |
| Single-use | Yes (`jti` tracked in `app_used_tokens`) |
| Issuer | `api.chatloka.net` |
| Type claim | `app-update` (distinguishes from plugin tokens) |

### What's Protected

| Asset | Protection |
|---|---|
| Release zip files | R2 private + JWT token required |
| Changelog | Only visible after license validation |
| Admin upload | Better Auth session required |
| Download logs | Admin session required to view |
| Update result reports | License validation required |

---

## Admin UI Requirements

### Page: App Releases (`/manage/app-releases`)

#### List View
- Table with columns: Version, Released, Size, Downloads, Status (Latest/Previous)
- Search by version number
- Sort by date, version, download count
- Pagination with page size selector (20/50/100)
- "Upload New Version" button → opens upload dialog

#### Upload Dialog
- **File Dropzone**: Drag & drop or click to select .zip file
  - Show file name, size, computed checksum after upload
  - Validate file extension (.zip only)
  - Show upload progress
- **Version Input**: Semantic version format (e.g. "1.3.0")
  - Auto-suggest next version based on latest
  - Validate format (semver)
- **Changelog Editor**: Markdown editor with live preview
  - Tab interface: "Edit" | "Preview"
  - Use Tiptap (already in dependencies) or simple textarea
  - Syntax highlighting for markdown
- **Breaking Changes**: Multi-line text input
  - Each line = one breaking change
  - Shown prominently to user before update
- **Min PHP Version**: Dropdown or input (default: "8.2")
- **Upload Button**: Disabled until all required fields filled

#### Version Detail View
- Full changelog rendered as markdown
- Download count
- File size, checksum
- Release date
- "Delete" button (with confirmation)

### Page: Update Logs (`/manage/app-update-logs`)

- Table: Purchase Code, Domain, From Version, To Version, Status, Date
- Filter by status (success/failed/rollback)
- Filter by domain
- Search by purchase code or domain
- Pagination

---

## Laravel Client Implementation Guide

### Overview for Laravel Developers

This section provides the specification for implementing the update system in the ChatLoka Laravel application.

### Prerequisites

| Requirement | Version |
|---|---|
| PHP | 8.2+ |
| Laravel | 10+ (tested on 12/13) |
| Storage | Writable `storage/app/` directory |
| Permissions | Write access to project root (for file replacement) |

### Step 1: Create Migration for Local Version Tracking

```php
// database/migrations/xxxx_create_app_version_table.php

Schema::create('app_version', function (Blueprint $table) {
    $table->id();
    $table->string('version', 20);
    $table->string('checksum', 64)->nullable();
    $table->boolean('is_current')->default(false);
    $table->timestamp('updated_at')->nullable();
});
```

### Step 2: Create Update Service

```php
// app/Services/AppUpdateService.php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class AppUpdateService
{
    private string $apiBaseUrl;
    private string $licenseKey;
    private string $domain;

    public function __construct()
    {
        $this->apiBaseUrl = config('chatloka.api_base_url', 'https://api.chatloka.net');
        $this->licenseKey = config('chatloka.license_key');
        $this->domain = config('chatloka.domain');
    }

    /**
     * Check if an update is available.
     *
     * IMPORTANT: Always verify the API response signature before trusting the data.
     * Use SignatureService::verifySignedResponse() to validate the RSA signature.
     *
     * @return array{has_update: bool, current_version: string, latest_version: string, ...}
     */
    public function checkUpdate(): array
    {
        $currentVersion = config('chatloka.version', '1.0.0');

        $response = Http::withHeaders([
            'X-License-Key' => $this->licenseKey,
            'Content-Type' => 'application/json',
        ])->post("{$this->apiBaseUrl}/api/app/check-update", [
            'current_version' => $currentVersion,
            'domain' => $this->domain,
        ]);

        if (!$response->successful()) {
            throw new \RuntimeException('Failed to check for updates: ' . $response->body());
        }

        return $response->json('data');
    }

    /**
     * Generate a download token for a specific version.
     *
     * @return array{token: string, download_url: string, checksum: string, ...}
     */
    public function getDownloadToken(string $version): array
    {
        $response = Http::withHeaders([
            'X-License-Key' => $this->licenseKey,
            'Content-Type' => 'application/json',
        ])->post("{$this->apiBaseUrl}/api/app/download-token", [
            'version' => $version,
            'domain' => $this->domain,
        ]);

        if (!$response->successful()) {
            throw new \RuntimeException('Failed to get download token: ' . $response->body());
        }

        return $response->json('data');
    }

    /**
     * Download the update zip file using a download token.
     *
     * @return string Path to downloaded file
     */
    public function downloadUpdate(string $token, string $downloadUrl, string $filename): string
    {
        $tempPath = storage_path("app/{$filename}");

        $response = Http::withHeaders([
            'X-Download-Token' => $token,
        ])->withOptions([
            'sink' => $tempPath,
        ])->get($downloadUrl);

        if (!$response->successful()) {
            throw new \RuntimeException('Failed to download update: ' . $response->status());
        }

        return $tempPath;
    }

    /**
     * Verify the checksum of a downloaded file.
     */
    public function verifyChecksum(string $filePath, string $expectedChecksum): bool
    {
        $actualChecksum = hash_file('sha256', $filePath);
        return hash_equals($expectedChecksum, $actualChecksum);
    }

    /**
     * Report the result of an update attempt.
     */
    public function reportResult(
        string $fromVersion,
        string $toVersion,
        string $status,
        ?string $errorMessage = null
    ): void {
        try {
            Http::withHeaders([
                'X-License-Key' => $this->licenseKey,
                'Content-Type' => 'application/json',
            ])->post("{$this->apiBaseUrl}/api/app/update-result", [
                'from_version' => $fromVersion,
                'to_version' => $toVersion,
                'status' => $status,
                'domain' => $this->domain,
                'error_message' => $errorMessage,
            ]);
        } catch (\Throwable $e) {
            Log::error('Failed to report update result', ['error' => $e->getMessage()]);
        }
    }
}
```

### Step 3: Create Update Controller

```php
// app/Http/Controllers/AppUpdateController.php

namespace App\Http\Controllers;

use App\Services\AppUpdateService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\File;

class AppUpdateController extends Controller
{
    public function __construct(
        private AppUpdateService $updateService
    ) {}

    /**
     * Show update status page.
     */
    public function index()
    {
        $currentVersion = config('chatloka.version', '1.0.0');

        try {
            $updateInfo = $this->updateService->checkUpdate();
        } catch (\Throwable $e) {
            $updateInfo = ['has_update' => false, 'error' => $e->getMessage()];
        }

        return view('admin.updates.index', compact('currentVersion', 'updateInfo'));
    }

    /**
     * Download and apply the update.
     *
     * IMPORTANT: This is a destructive operation.
     * - Always backup before updating
     * - Run in maintenance mode
     * - Keep previous version for rollback
     */
    public function apply(Request $request)
    {
        $request->validate([
            'version' => 'required|string',
        ]);

        $currentVersion = config('chatloka.version', '1.0.0');
        $targetVersion = $request->input('version');

        // 1. Enable maintenance mode
        Artisan::call('down');

        try {
            // 2. Get download token
            $tokenData = $this->updateService->getDownloadToken($targetVersion);

            // 3. Download update
            $filePath = $this->updateService->downloadUpdate(
                $tokenData['token'],
                $tokenData['download_url'],
                $tokenData['filename']
            );

            // 4. Verify checksum
            if (!$this->updateService->verifyChecksum($filePath, $tokenData['checksum'])) {
                File::delete($filePath);
                throw new \RuntimeException('Checksum verification failed');
            }

            // 5. Backup current version
            $this->backupCurrentVersion($currentVersion);

            // 6. Extract update
            $this->extractUpdate($filePath);

            // 7. Run migrations
            Artisan::call('migrate', ['--force' => true]);

            // 8. Clear and rebuild caches
            Artisan::call('cache:clear');
            Artisan::call('config:clear');
            Artisan::call('route:clear');
            Artisan::call('view:clear');
            Artisan::call('optimize');

            // 9. Update local version record
            config(['chatloka.version' => $targetVersion]);
            // Persist to database or config file

            // 10. Report success
            $this->updateService->reportResult($currentVersion, $targetVersion, 'success');

            // 11. Disable maintenance mode
            Artisan::call('up');

            return response()->json([
                'success' => true,
                'message' => "Updated from {$currentVersion} to {$targetVersion}",
            ]);

        } catch (\Throwable $e) {
            // Report failure
            $this->updateService->reportResult(
                $currentVersion,
                $targetVersion,
                'failed',
                $e->getMessage()
            );

            // Attempt rollback
            $this->rollbackUpdate($currentVersion);

            // Disable maintenance mode
            Artisan::call('up');

            return response()->json([
                'success' => false,
                'message' => 'Update failed: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Backup current version before update.
     */
    private function backupCurrentVersion(string $version): void
    {
        $backupPath = storage_path("app/backups/{$version}");
        File::makeDirectory($backupPath, 0755, true, true);

        // Backup key directories
        $directoriesToBackup = ['app', 'config', 'database', 'routes', 'resources'];

        foreach ($directoriesToBackup as $dir) {
            $source = base_path($dir);
            if (File::isDirectory($source)) {
                File::copyDirectory($source, "{$backupPath}/{$dir}");
            }
        }

        // Backup composer.json and composer.lock
        File::copy(base_path('composer.json'), "{$backupPath}/composer.json");
        File::copy(base_path('composer.lock'), "{$backupPath}/composer.lock");
    }

    /**
     * Extract update zip and replace files.
     *
     * CRITICAL: Never overwrite .env file!
     * CRITICAL: Never overwrite storage/ directory!
     * CRITICAL: Never overwrite vendor/ directory!
     */
    private function extractUpdate(string $filePath): void
    {
        $tempDir = storage_path('app/update_temp');
        File::makeDirectory($tempDir, 0755, true, true);

        // Extract zip
        $zip = new \ZipArchive();
        if ($zip->open($filePath) !== true) {
            throw new \RuntimeException('Failed to extract update zip');
        }
        $zip->extractTo($tempDir);
        $zip->close();

        // Files/directories to NEVER overwrite
        $excludes = [
            '.env',
            '.env.example',
            'storage',
            'vendor',
            'node_modules',
            '.git',
            'bootstrap/cache',
        ];

        // Copy files, respecting excludes
        $this->copyDirectory($tempDir, base_path(), $excludes);

        // Cleanup
        File::deleteDirectory($tempDir);
        File::delete($filePath);
    }

    private function copyDirectory(string $source, string $destination, array $excludes = []): void
    {
        $items = File::allFiles($source);

        foreach ($items as $item) {
            $relativePath = ltrim(str_replace($source, '', $item->getPathname()), DIRECTORY_SEPARATOR);

            // Check if this path should be excluded
            $shouldExclude = false;
            foreach ($excludes as $exclude) {
                if (str_starts_with($relativePath, $exclude) || $relativePath === $exclude) {
                    $shouldExclude = true;
                    break;
                }
            }

            if (!$shouldExclude) {
                $destPath = $destination . DIRECTORY_SEPARATOR . $relativePath;
                File::makeDirectory(dirname($destPath), 0755, true, true);
                File::copy($item->getPathname(), $destPath);
            }
        }
    }

    /**
     * Rollback to previous version if update fails.
     */
    private function rollbackUpdate(string $version): void
    {
        $backupPath = storage_path("app/backups/{$version}");

        if (!File::isDirectory($backupPath)) {
            Log::error("No backup found for version {$version}");
            return;
        }

        // Restore from backup
        $this->copyDirectory($backupPath, base_path());

        // Re-run composer install if composer.json changed
        if (File::exists("{$backupPath}/composer.json")) {
            exec('cd ' . base_path() . ' && composer install --no-dev --optimize-autoloader');
        }
    }
}
```

### Step 4: Add Routes

```php
// routes/web.php or routes/admin.php

Route::middleware(['auth', 'admin'])->prefix('admin')->group(function () {
    Route::get('/updates', [\App\Http\Controllers\AppUpdateController::class, 'index'])
        ->name('admin.updates.index');
    Route::post('/updates/apply', [\App\Http\Controllers\AppUpdateController::class, 'apply'])
        ->name('admin.updates.apply');
});
```

### Step 5: Add Configuration

```php
// config/chatloka.php

return [
    'version' => env('CHATLOKA_VERSION', '1.2.0'),
    'api_base_url' => env('CHATLOKA_API_BASE_URL', 'https://api.chatloka.net'),
    'license_key' => env('CHATLOKA_LICENSE_KEY'),
    'domain' => env('CHATLOKA_DOMAIN'),
];
```

### Step 6: Artisan Command for Update Check (Optional)

```php
// app/Console/Commands/CheckForUpdate.php

namespace App\Console\Commands;

use App\Services\AppUpdateService;
use Illuminate\Console\Command;

class CheckForUpdate extends Command
{
    protected $signature = 'chatloka:check-update';
    protected $description = 'Check for ChatLoka application updates';

    public function handle(AppUpdateService $updateService): int
    {
        $this->info('Checking for updates...');

        try {
            $result = $updateService->checkUpdate();

            if ($result['has_update']) {
                $this->warn("Update available: {$result['current_version']} → {$result['latest_version']}");
                $this->info("Changelog:\n{$result['changelog']}");
                $this->newLine();
                $this->info('Run "php artisan chatloka:update" to apply the update.');
                return self::SUCCESS;
            } else {
                $this->info("You're running the latest version: {$result['current_version']}");
                return self::SUCCESS;
            }
        } catch (\Throwable $e) {
            $this->error('Failed to check for updates: ' . $e->getMessage());
            return self::FAILURE;
        }
    }
}
```

### Step 7: Artisan Command for Update Apply

```php
// app/Console/Commands/ApplyUpdate.php

namespace App\Console\Commands;

use App\Http\Controllers\AppUpdateController;
use Illuminate\Console\Command;
use Illuminate\Http\Request;

class ApplyUpdate extends Command
{
    protected $signature = 'chatloka:update {--version=}';
    protected $description = 'Apply ChatLoka application update';

    public function handle(AppUpdateController $controller): int
    {
        $version = $this->option('version');

        if (!$version) {
            $this->error('Please specify version: php artisan chatloka:update --version=1.3.0');
            return self::FAILURE;
        }

        $this->warn("This will update ChatLoka to version {$version}.");
        $this->warn('A backup will be created before the update.');

        if (!$this->confirm('Do you want to continue?')) {
            $this->info('Update cancelled.');
            return self::SUCCESS;
        }

        $request = new Request(['version' => $version]);
        $response = $controller->apply($request);

        if ($response->getData('success')) {
            $this->info($response->getData('message'));
            return self::SUCCESS;
        } else {
            $this->error($response->getData('message'));
            return self::FAILURE;
        }
    }
}
```

---

## Implementation Checklist

### Server Side (Cloudflare Worker — THIS REPO)

- [ ] Create migration `008_app_versions.sql`
- [ ] Create migration `009_app_update_logs.sql`
- [ ] Create migration `010_app_used_tokens.sql`
- [ ] Add R2 upload endpoint: `POST /manage/api/app-versions/upload`
- [ ] Add version list endpoint: `GET /manage/api/app-versions`
- [ ] Add version detail endpoint: `GET /manage/api/app-versions/:version`
- [ ] Add version delete endpoint: `DELETE /manage/api/app-versions/:version`
- [ ] Add update check endpoint: `POST /api/app/check-update`
- [ ] Add download token endpoint: `POST /api/app/download-token`
- [ ] Add update result endpoint: `POST /api/app/update-result`
- [ ] Add update logs endpoint: `GET /manage/api/app-update-logs`
- [ ] Update `src/types.ts` with new CloudflareBindings if needed
- [ ] Update MCP tools if needed

### Admin UI (React — THIS REPO)

- [ ] Create page: `/manage/app-releases` (list view)
- [ ] Create upload dialog with dropzone
- [ ] Create changelog markdown editor with preview
- [ ] Create version detail view
- [ ] Create page: `/manage/app-update-logs`
- [ ] Add navigation item to sidebar
- [ ] Add page size selector to tables

### Laravel Client (SEPARATE REPO)

- [ ] Create migration for local version tracking
- [ ] Create `AppUpdateService` class
- [ ] Create `AppUpdateController` class
- [ ] Add routes for update management
- [ ] Add configuration file
- [ ] Create Artisan commands
- [ ] Create admin UI views
- [ ] Add backup functionality
- [ ] Add rollback functionality
- [ ] Test on staging environment

---

## Error Handling

### Common Error Responses

| Status | Error | Meaning |
|---|---|---|
| 401 | `license_invalid` | Purchase code not found or inactive |
| 401 | `domain_mismatch` | Request domain doesn't match license |
| 401 | `token_already_used` | Download token has been consumed |
| 401 | `token_expired` | Download token has expired (1hr limit) |
| 403 | `forbidden` | Insufficient permissions |
| 404 | `version_not_found` | Requested version doesn't exist |
| 409 | `version_exists` | Version number already uploaded |
| 413 | `file_too_large` | Upload file exceeds size limit |
| 422 | `invalid_format` | File is not a valid .zip |
| 429 | `rate_limited` | Too many requests |

### Error Response Format

```json
{
  "error": {
    "code": "license_invalid",
    "message": "License not found or inactive"
  }
}
```

---

## Version Numbering

Follow [Semantic Versioning](https://semver.org/):

| Change Type | Version Bump | Example |
|---|---|---|
| Bug fixes | Patch (X.Y.Z+1) | 1.2.0 → 1.2.1 |
| New features (backward compatible) | Minor (X.Y+1.0) | 1.2.0 → 1.3.0 |
| Breaking changes | Major (X+1.0.0) | 1.2.0 → 2.0.0 |

### Pre-release Versions

- Alpha: `1.3.0-alpha.1` (internal testing)
- Beta: `1.3.0-beta.1` (limited testing)
- RC: `1.3.0-rc.1` (release candidate)

---

## Testing Checklist

### Server Side

- [ ] Upload a test release via admin panel
- [ ] Verify checksum is computed correctly
- [ ] Verify R2 path is correct
- [ ] Test version check with valid license
- [ ] Test version check with invalid license
- [ ] Test download token generation
- [ ] Test file download with valid token
- [ ] Test file download with expired token
- [ ] Test file download with used token
- [ ] Test rate limiting
- [ ] Test concurrent downloads

### Laravel Client

- [ ] Test update check from admin panel
- [ ] Test update check from Artisan command
- [ ] Test download with valid token
- [ ] Test checksum verification
- [ ] Test backup creation
- [ ] Test file extraction (respecting excludes)
- [ ] Test migration execution
- [ ] Test cache clearing
- [ ] Test rollback on failure
- [ ] Test maintenance mode during update
- [ ] Test update result reporting

---

## Notes

### Why Not Use Existing Packages?

| Package | Issue |
|---|---|
| `codedge/laravel-selfupdater` | **ARCHIVED** — no longer maintained |
| `anisAronno/laravel-self-updater` | Newer, less battle-tested; we need custom logic |
| `laravelplus/laravel-updater` | Laravel 12 only; designed for starter kits, not apps |

### Why Custom Implementation?

1. **License validation is mandatory** — existing packages don't handle this
2. **Upload via admin panel** — no GitHub/GitLab API needed
3. **R2 private storage** — releases are sensitive
4. **Integration with existing plugin system** — reuse patterns
5. **Full control over security** — JWT tokens, checksums, audit logs

### Security Considerations

1. **Never auto-update** — always require manual trigger
2. **Always verify checksum** — prevent corrupted downloads
3. **Always backup before update** — enable rollback
4. **Always run in maintenance mode** — prevent partial updates
5. **Always report results** — track update success/failure rates
6. **Keep previous versions** — enable instant rollback
