-- Seed plugin versions from old database
-- Adapted for D1 (datetime('now') instead of NOW())

UPDATE plugin_versions SET is_latest = 0 WHERE is_latest = 1;

INSERT INTO plugin_versions (slug, version, changelog, zip_path, checksum, requires_chaton, released_at, is_latest)
VALUES
  (
    'facebook-messenger',
    '1.0.0',
    '- Initial release',
    'plugins/releases/facebook-messenger/facebook-messenger-1.0.0.zip',
    '6c3e1885fc6347a0422bec1e9cbca9ec94fa76bd585a1a4cf156c636ee9b0953',
    '>=0.14.0',
    datetime('now'),
    1
  ),
  (
    'facebook-comment-automation',
    '1.0.0',
    '- Initial release',
    'plugins/releases/facebook-comment-automation/facebook-comment-automation-1.0.0.zip',
    '07658fe1e2cbe27b0798c584c80533291712906d4b8d01433b57e276d7a11fa1',
    NULL,
    datetime('now'),
    1
  ),
  (
    'instagram',
    '1.0.0',
    '- Initial release',
    'plugins/releases/instagram/instagram-1.0.0.zip',
    '6b72ab490ac42fbd0a860302f2a63964e97cebbcf24a98e057cb8827da0548ff',
    '>=0.14.0',
    datetime('now'),
    1
  ),
  (
    'instagram-comment-automation',
    '1.0.0',
    '- Initial release',
    'plugins/releases/instagram-comment-automation/instagram-comment-automation-1.0.0.zip',
    'b1866df8725487924b3788d04fa9665ee8accd9db5f333a41839a889e29ba964',
    NULL,
    datetime('now'),
    1
  ),
  (
    'telegram',
    '1.0.0',
    '- Initial release',
    'plugins/releases/telegram/telegram-1.0.0.zip',
    'a364ebf2515065dade847a9f7f8a2a4f48f7af531937cda5cf375bbb80b0e453',
    '>=0.14.0',
    datetime('now'),
    1
  ),
  (
    'webchat',
    '1.0.0',
    '- Initial release',
    'plugins/releases/webchat/webchat-1.0.0.zip',
    '7b34d8ffb977a6d65dd82bbf19bbe2e981672df3d4937c2d268ba05bf147eced',
    NULL,
    datetime('now'),
    1
  ),
  (
    'whatsapp-qr',
    '1.0.0',
    '- Initial release',
    'plugins/releases/whatsapp-qr/whatsapp-qr-1.0.0.zip',
    '65caad53bcee1b0145c6b5f44a69cf2a177201e566dea1b03d5b17bebdef46e3',
    '>=0.14.0',
    datetime('now'),
    1
  )
ON CONFLICT (slug, version) DO UPDATE SET
  changelog       = excluded.changelog,
  zip_path        = excluded.zip_path,
  checksum        = excluded.checksum,
  requires_chaton = excluded.requires_chaton,
  is_latest       = excluded.is_latest;
