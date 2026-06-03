CREATE TABLE IF NOT EXISTS admin (
  id SERIAL PRIMARY KEY,
  username VARCHAR(64) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS screens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(128) NOT NULL,
  api_key VARCHAR(64) UNIQUE NOT NULL,
  last_seen TIMESTAMPTZ,
  current_playlist_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(256) NOT NULL,
  type VARCHAR(16) NOT NULL CHECK (type IN ('image', 'video', 'url')),
  file_path TEXT,
  url TEXT,
  mime_type VARCHAR(64),
  size_bytes BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS playlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(256) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS playlist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id UUID NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  content_id UUID NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  duration_seconds INTEGER NOT NULL DEFAULT 10,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS screen_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  screen_id UUID NOT NULL REFERENCES screens(id) ON DELETE CASCADE,
  content_id UUID NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Safe migration: add app_version column if not exists
ALTER TABLE screens ADD COLUMN IF NOT EXISTS app_version VARCHAR(32);

CREATE INDEX IF NOT EXISTS idx_screens_api_key ON screens(api_key);
CREATE INDEX IF NOT EXISTS idx_playlist_items_playlist ON playlist_items(playlist_id);
CREATE INDEX IF NOT EXISTS idx_overrides_screen ON screen_overrides(screen_id);
