const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json({ limit: '50mb' }));

app.use(express.static(path.join(__dirname, 'public')));

const citiesHandler = require('./api/cities');
const scrapeHandler = require('./api/scrape');
const statusHandler = require('./api/status');

app.get('/api/cities', (req, res) => citiesHandler(req, res));

app.post('/api/scrape', (req, res) => scrapeHandler(req, res));

app.get('/api/status', (req, res) => statusHandler(req, res));

app.get('/api/data', (req, res) => {
  const dataDir = path.join(__dirname, '.data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (req.query.id) {
    const file = path.join(dataDir, `${req.query.id}.json`);
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'Not found' });
    return res.json(JSON.parse(fs.readFileSync(file, 'utf8')));
  }
  const files = fs.readdirSync(dataDir).sort().reverse().slice(0, 20);
  const scrapes = files.map((f) => {
    const data = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'));
    return { id: f.replace('.json', ''), title: data.title, url: data.url, scrapedAt: data.scrapedAt };
  });
  res.json(scrapes);
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`District Scraper running at http://localhost:${PORT}`);
  if (!process.env.REDIS_URL && !process.env.REDIS_HOST) {
    console.log('Note: REDIS not configured. Scraping API will return 503.');
    console.log('Set REDIS_URL or REDIS_HOST/REDIS_PORT for worker-backed scraping.');
  }
});
