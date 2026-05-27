require('dotenv').config();

const { Worker, Queue } = require('bullmq');
const Redis = require('ioredis');
const { createClient } = require('@supabase/supabase-js');
const { runScraper, calculateConfidence } = require('./scraper');

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const connection = { host: REDIS_HOST, port: REDIS_PORT };

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function updateRun(runId, updates) {
  const { error } = await supabase
    .from('scraper_runs')
    .update(updates)
    .eq('id', runId);
  if (error) console.error('DB update error:', error.message);
}

async function insertLog(runId, level, message) {
  const { error } = await supabase
    .from('scraper_logs')
    .insert({ run_id: runId, level, message });
  if (error) console.error('Log insert error:', error.message);
}

const worker = new Worker('scraping', async (job) => {
  const { city, cityName } = job.data;
  const runId = job.id;

  console.log(`[${runId}] Processing: ${cityName || city}`);

  await updateRun(runId, {
    status: 'running',
    started_at: new Date().toISOString(),
  });

  await insertLog(runId, 'info', 'Job picked up by worker');

  const onLog = async (level, message) => {
    await insertLog(runId, level, message);
    const progressMap = { info: 30, ok: 60 };
    await job.updateProgress(progressMap[level] || 50);
    console.log(`[${runId}] [${level}] ${message}`);
  };

  try {
    const data = await runScraper(city, onLog);

    const allListings = [
      ...data.events.map((e) => ({ ...e, eventType: 'Event' })),
      ...data.movies.map((m) => ({ ...m, eventType: 'Movie' })),
    ];

    await insertLog(runId, 'ok', `Total ${allListings.length} listings extracted`);

    const eventRows = allListings.map((item) => ({
      run_id: runId,
      title: item.name,
      date: item.date || null,
      location: item.location || null,
      price: item.price || null,
      description: item.description || null,
      image: item.image || null,
      url: item.url || null,
      event_type: item.eventType || 'Event',
      confidence: calculateConfidence(item),
      raw_data: item,
    }));

    if (eventRows.length > 0) {
      const { error: insertError } = await supabase
        .from('scraped_events')
        .insert(eventRows);
      if (insertError) throw new Error(`Event insert failed: ${insertError.message}`);
    }

    await updateRun(runId, {
      status: 'completed',
      progress: 100,
      events_found: allListings.length,
      completed_at: new Date().toISOString(),
      screenshot_url: null,
    });

    await insertLog(runId, 'ok', `Scrape completed — ${allListings.length} listings saved`);
    console.log(`[${runId}] Completed: ${allListings.length} listings`);

    return { events: allListings.length, status: 'completed' };
  } catch (err) {
    console.error(`[${runId}] Failed:`, err.message);

    await updateRun(runId, {
      status: 'failed',
      error: err.message,
      completed_at: new Date().toISOString(),
    });

    await insertLog(runId, 'error', `Failed: ${err.message}`);
    throw err;
  }
}, {
  connection,
  concurrency: 2,
  limiter: { max: 5, duration: 60000 },
  retry: { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
});

worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed with ${job.returnvalue?.events || 0} events`);
});

worker.on('failed', (job, err) => {
  if (job) {
    console.error(`Job ${job.id} failed after ${job.attemptsMade} attempts: ${err.message}`);
  }
});

worker.on('error', (err) => {
  console.error('Worker error:', err.message);
});

console.log(`Worker connected to Redis at ${REDIS_HOST}:${REDIS_PORT}`);
console.log('Waiting for scraping jobs...');

process.on('SIGINT', async () => {
  console.log('Shutting down...');
  await worker.close();
  process.exit(0);
});
