-- scraper_runs: tracks each scrape job lifecycle
CREATE TABLE scraper_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city TEXT NOT NULL,
  city_slug TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'district.in',
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','completed','failed')),
  progress INTEGER DEFAULT 0,
  events_found INTEGER DEFAULT 0,
  error TEXT,
  screenshot_url TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  logs JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_runs_status ON scraper_runs(status);
CREATE INDEX idx_runs_created ON scraper_runs(created_at DESC);

-- scraped_events: extracted structured data
CREATE TABLE scraped_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES scraper_runs(id) ON DELETE CASCADE,
  title TEXT,
  date TEXT,
  location TEXT,
  price TEXT,
  description TEXT,
  image TEXT,
  url TEXT,
  event_type TEXT DEFAULT 'Event'
    CHECK (event_type IN ('Event','Movie','Restaurant','Other')),
  confidence INTEGER DEFAULT 0,
  raw_data JSONB,
  review_status TEXT DEFAULT 'pending'
    CHECK (review_status IN ('pending','approved','rejected','edited')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_events_run ON scraped_events(run_id);
CREATE INDEX idx_events_status ON scraped_events(review_status);

-- scraper_logs: detailed per-job logs
CREATE TABLE scraper_logs (
  id BIGSERIAL PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES scraper_runs(id) ON DELETE CASCADE,
  level TEXT NOT NULL DEFAULT 'info'
    CHECK (level IN ('info','ok','warn','error')),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_logs_run ON scraper_logs(run_id);

-- Enable realtime for live dashboard updates
ALTER PUBLICATION supabase_realtime ADD TABLE scraper_runs;
ALTER PUBLICATION supabase_realtime ADD TABLE scraped_events;
ALTER PUBLICATION supabase_realtime ADD TABLE scraper_logs;
