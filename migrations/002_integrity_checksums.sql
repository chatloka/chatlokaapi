CREATE INDEX IF NOT EXISTS idx_license_time ON tamper_logs(license_id, created_at);

DELETE FROM release_checksums WHERE version = '1.0.0';

INSERT INTO release_checksums (version, file_path, checksum_md5) VALUES
('1.0.0', 'app/Services/License/LicenseManager.php', '002cb7afacd6ee308c61c93931cf2ba6'),
('1.0.0', 'app/Services/License/LicenseClient.php', '41377b5e0f32602a2c2400fd5919e22a'),
('1.0.0', 'app/Services/License/LicenseCache.php', '900241825e9cb4a4b0b93c7b83b28f8f'),
('1.0.0', 'app/Services/License/SignatureVerifier.php', '05b470230bcf28d0081cd579ff693011'),
('1.0.0', 'app/Services/License/FeatureGate.php', '2e3699358c9a5e248e2276e2c7374708'),
('1.0.0', 'app/Services/License/PluginClient.php', '8297cf9e734749a98b6c6d61b881a744'),
('1.0.0', 'app/Services/License/PluginUpdateChecker.php', '399f7691b6fe38d2a806cf642d05757f'),
('1.0.0', 'app/Services/License/IntegrityGuard.php', '0ddde4e7df2c0f99967c439aabff125c'),
('1.0.0', 'app/Services/License/Facades/License.php', '811bc3fcfdbc735aab5345eec42f7f98'),
('1.0.0', 'app/Providers/LicenseServiceProvider.php', '1dc4207aaf33c2dbab8231dcca226a2e'),
('1.0.0', 'app/Http/Middleware/EnsureLicenseActive.php', 'b874c7c9d3befcbd7a66199ebb27b4e0'),
('1.0.0', 'config/chatloka-license.php', 'bf60f0397da1fef451ec2787c38be9fe');
