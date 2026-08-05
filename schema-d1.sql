PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS licenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_code TEXT NOT NULL UNIQUE,
  license_type TEXT NOT NULL CHECK (license_type IN ('regular', 'extended')),
  domain TEXT NOT NULL,
  buyer_email TEXT,
  buyer_name TEXT,
  item_id TEXT,
  item_name TEXT,
  purchase_date TEXT,
  support_until TEXT,
  activated_at TEXT NOT NULL,
  last_validated_at TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deactivated', 'suspended')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_purchase_code ON licenses(purchase_code);
CREATE INDEX IF NOT EXISTS idx_domain ON licenses(domain);
CREATE INDEX IF NOT EXISTS idx_status ON licenses(status);

CREATE TABLE IF NOT EXISTS validation_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  license_id INTEGER NOT NULL,
  domain TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  validation_type TEXT NOT NULL CHECK (validation_type IN ('activate', 'validate', 'deactivate')),
  success INTEGER NOT NULL DEFAULT 1,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (license_id) REFERENCES licenses(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_license_id ON validation_logs(license_id);
CREATE INDEX IF NOT EXISTS idx_created_at ON validation_logs(created_at);

CREATE TABLE IF NOT EXISTS domain_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  license_id INTEGER NOT NULL,
  old_domain TEXT,
  new_domain TEXT NOT NULL,
  changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (license_id) REFERENCES licenses(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_domain_history_license ON domain_history(license_id);

CREATE TABLE IF NOT EXISTS envato_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_code TEXT NOT NULL UNIQUE,
  response_data TEXT NOT NULL,
  cached_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_envato_purchase_code ON envato_cache(purchase_code);
CREATE INDEX IF NOT EXISTS idx_envato_expires_at ON envato_cache(expires_at);

CREATE TABLE IF NOT EXISTS plugin_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  version TEXT NOT NULL,
  changelog TEXT,
  zip_path TEXT NOT NULL,
  checksum TEXT NOT NULL,
  requires_chaton TEXT,
  released_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_latest INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(slug, version)
);

CREATE INDEX IF NOT EXISTS idx_plugin_versions_slug ON plugin_versions(slug);
CREATE INDEX IF NOT EXISTS idx_plugin_versions_latest ON plugin_versions(slug, is_latest);

CREATE TABLE IF NOT EXISTS download_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_code TEXT NOT NULL,
  slug TEXT NOT NULL,
  version TEXT,
  domain TEXT,
  ip_address TEXT,
  downloaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_download_logs_purchase_code ON download_logs(purchase_code);
CREATE INDEX IF NOT EXISTS idx_download_logs_slug ON download_logs(slug);
CREATE INDEX IF NOT EXISTS idx_download_logs_downloaded_at ON download_logs(downloaded_at);

CREATE TABLE IF NOT EXISTS used_tokens (
  jti TEXT PRIMARY KEY,
  used_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_used_tokens_expires_at ON used_tokens(expires_at);

CREATE TABLE IF NOT EXISTS release_checksums (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version TEXT NOT NULL,
  file_path TEXT NOT NULL,
  checksum_md5 TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(version, file_path)
);

CREATE INDEX IF NOT EXISTS idx_version ON release_checksums(version);

DROP TABLE IF EXISTS tamper_logs;

CREATE TABLE tamper_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  license_id INTEGER NOT NULL,
  domain TEXT NOT NULL,
  failures TEXT NOT NULL,
  ip TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tamper_logs_license ON tamper_logs(license_id);
CREATE INDEX IF NOT EXISTS idx_tamper_logs_domain ON tamper_logs(domain);

INSERT OR IGNORE INTO licenses (id, purchase_code, license_type, domain, buyer_email, buyer_name, item_id, item_name, purchase_date, support_until, activated_at, last_validated_at, status, created_at, updated_at)
VALUES (4, 'mulaichat', 'extended', 'mulaichat.com', 'cs@mulaichat.com', 'Demo User', 'demo-item', 'ChatOn - AI Chat Application', '2026-01-01 00:00:00', '2027-01-01 00:00:00', '2026-03-17 09:45:42.539', '2026-03-13 18:00:08.398', 'deactivated', '2026-01-01 00:00:00', '2026-03-17 09:45:42.585116');

INSERT OR IGNORE INTO release_checksums (version, file_path, checksum_md5) VALUES
('1.0.0', 'app/Services/License/LicenseManager.php', 'd4bf524f565be545d42779a89feb23ce'),
('1.0.0', 'app/Services/License/LicenseClient.php', '27b703fa85972a02a40a7ecc8cabb47a'),
('1.0.0', 'app/Services/License/LicenseCache.php', '900241825e9cb4a4b0b93c7b83b28f8f'),
('1.0.0', 'app/Services/License/SignatureVerifier.php', 'c604d436da6f71d4b496f04cad1f69cc'),
('1.0.0', 'app/Services/License/FeatureGate.php', '2e3699358c9a5e248e2276e2c7374708'),
('1.0.0', 'app/Services/License/PluginClient.php', '670d40705cd2cc04a22dab09db6d522e'),
('1.0.0', 'app/Services/License/PluginUpdateChecker.php', '6de2dc0e46bae5adfc31a57e6e9a4b9f'),
('1.0.0', 'app/Services/License/IntegrityGuard.php', 'a53670a11eddad3ef589d45d2ec679f7'),
('1.0.0', 'app/Services/License/Facades/License.php', '811bc3fcfdbc735aab5345eec42f7f98'),
('1.0.0', 'app/Providers/LicenseServiceProvider.php', '1dc4207aaf33c2dbab8231dcca226a2e'),
('1.0.0', 'app/Http/Middleware/EnsureLicenseActive.php', 'e5136bfe0362d78e90b72c41e597b4ad'),
('1.0.0', 'config/chatloka-license.php', '7f0c5d621ffd308a4636dbf03efa23ce');
