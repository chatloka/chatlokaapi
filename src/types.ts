export type LicenseType = 'regular' | 'extended'
export type LicenseStatus = 'active' | 'deactivated' | 'suspended'
export type ValidationType = 'activate' | 'validate' | 'deactivate'

export interface CloudflareBindings {
  DB: D1Database
  ENVATO_PERSONAL_TOKEN: string
  ENVATO_API_URL?: string
  RSA_PRIVATE_KEY: string
  DOWNLOAD_TOKEN_SECRET: string
  BETTER_AUTH_SECRET: string
  BETTER_AUTH_URL: string
  API_BASE_URL?: string
  ENVIRONMENT?: string
  PLUGINS_BUCKET: R2Bucket
  ASSETS: Fetcher
  RL_VALIDATE: RateLimit
  RL_ACTIVATE: RateLimit
  RL_DEACTIVATE: RateLimit
  RL_VERIFY: RateLimit
  RL_PLUGIN_TOKEN: RateLimit
  RL_PLUGIN_DOWNLOAD: RateLimit
}

export interface License {
  id: number
  purchase_code: string
  license_type: LicenseType
  domain: string
  buyer_email?: string
  buyer_name?: string
  item_id?: string
  item_name?: string
  purchase_date?: string
  support_until?: string
  activated_at: string
  last_validated_at?: string
  status: LicenseStatus
  created_at: string
  updated_at: string
}

export interface EnvatoPurchase {
  sold_at: string
  license: LicenseType
  supported_until: string
  buyer: string
  purchase_count: number
  item: {
    id: number
    name: string
  }
}

export interface EnvatoVerificationResponse {
  valid: boolean
  revoked?: boolean
  purchase?: EnvatoPurchase
  error?: string
}

export interface ActivateRequest {
  purchase_code: string
  domain: string
}

export interface VerifyRequest {
  purchase_code: string
  domain: string
}

export interface ValidateRequest {
  purchase_code: string
  domain: string
  app_version?: string
  file_checksums?: Record<string, string>
}

export interface DeactivateRequest {
  purchase_code: string
  domain: string
}

export interface PluginVersion {
  id: number
  slug: string
  version: string
  changelog: string | null
  zip_path: string
  checksum: string
  requires_chaton: string | null
  released_at: string
  is_latest: boolean
  created_at: string
}

export interface PluginInput {
  slug: string
  version: string
}

export interface PluginVersionInfo {
  has_update: boolean
  version: string
  changelog: string | null
  download_url: string | null
  checksum: string | null
}

export interface CheckUpdatesRequest {
  plugins: PluginInput[]
  domain: string
}

export interface DownloadTokenRequest {
  slug: string
  domain: string
}
