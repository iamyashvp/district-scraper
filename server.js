const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const citiesHandler = require('./vps-api/cities');
const scrapeHandler = require('./vps-api/scrape');
const statusHandler = require('./vps-api/status');

app.get('/api/cities', (req, res) => citiesHandler(req, res));
app.post('/api/scrape', (req, res) => scrapeHandler(req, res));
app.get('/api/status', (req, res) => statusHandler(req, res));

// Bull Board queue dashboard
try {
  const { createBullBoard } = require('@bull-board/api');
  const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
  const { ExpressAdapter } = require('@bull-board/express');
  const { getQueue } = require('./vps-api/queue');

  const q = getQueue();
  if (q) {
    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath('/admin/queues');
    createBullBoard({ queues: [new BullMQAdapter(q)], serverAdapter });
    app.use('/admin/queues', serverAdapter.getRouter());
    console.log('Bull Board mounted at /admin/queues');
  }
} catch (e) {
  console.log('Bull Board not available:', e.message);
}

app.get('/api/health', (req, res) => {
  const { getQueue } = require('./vps-api/queue');
  const q = getQueue();
  res.json({
    status: 'ok',
    redis: !!process.env.REDIS_HOST || !!process.env.REDIS_URL,
    supabase: !!process.env.SUPABASE_URL,
    bullBoard: !!q,
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

app.get('/api/screenshot/:name', (req, res) => {
  const screenshotsDir = path.join(__dirname, 'worker', 'screenshots');
  const filePath = path.join(screenshotsDir, path.basename(req.params.name));
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: 'Screenshot not found' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`District Scraper API running on port ${PORT}`);
  console.log(`Redis: ${process.env.REDIS_HOST || 'not configured'}`);
  console.log(`Supabase: ${process.env.SUPABASE_URL ? 'connected' : 'not configured'}`);
});
