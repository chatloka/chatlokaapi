DELETE FROM release_checksums WHERE version = '1.0.0';

INSERT INTO release_checksums (version, file_path, checksum_md5) VALUES
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
