const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));

app.use(express.static(path.join(__dirname, 'public')));

const citiesHandler = require('./api/cities');
const scrapeHandler = require('./api/scrape');
const statusHandler = require('./api/status');

app.get('/api/cities', (req, res) => citiesHandler(req, res));

app.post('/api/scrape', (req, res) => scrapeHandler(req, res));

app.get('/api/status', (req, res) => statusHandler(req, res));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    redis: !!process.env.REDIS_HOST || !!process.env.REDIS_URL,
    supabase: !!process.env.SUPABASE_URL,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/runs', async (req, res) => {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;
    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data, error } = await supabase
        .from('scraper_runs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      if (!error) return res.json({ runs: data });
    }
  } catch {}
  return res.json({ runs: [] });
});

app.get('/api/events', async (req, res) => {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;
    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const limit = Math.min(parseInt(req.query.limit || '50'), 200);
      const { data, error } = await supabase
        .from('scraped_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (!error) return res.json({ events: data });
    }
  } catch {}
  return res.json({ events: [] });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`District Scraper API running on port ${PORT}`);
  console.log(`Redis: ${process.env.REDIS_HOST || 'not configured'}`);
  console.log(`Supabase: ${process.env.SUPABASE_URL ? 'connected' : 'not configured'}`);
});
