const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

let supabase = null;
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const runId = req.query.id;
  if (!runId) {
    try {
      const { Queue } = require('bullmq');
      const queue = new Queue('scraping');
      const jobs = await queue.getJobs(['active', 'waiting', 'completed', 'failed'], 0, 20);
      const list = await Promise.all(jobs.map(async (j) => ({
        id: j.id,
        data: j.data,
        status: await j.getState(),
        progress: j.progress,
        result: j.returnvalue,
        failedReason: j.failedReason,
        timestamp: j.timestamp,
      })));
      return res.json({ jobs: list });
    } catch {
      return res.json({ jobs: [] });
    }
  }

  if (!supabase) {
    return res.json({ run: null, events: [] });
  }

  const { data: run, error: runError } = await supabase
    .from('scraper_runs')
    .select('*')
    .eq('id', runId)
    .single();

  if (runError) {
    return res.status(404).json({ error: 'Run not found' });
  }

  const { data: events, error: eventsError } = await supabase
    .from('scraped_events')
    .select('*')
    .eq('run_id', runId)
    .order('created_at', { ascending: false });

  const { data: logs, error: logsError } = await supabase
    .from('scraper_logs')
    .select('*')
    .eq('run_id', runId)
    .order('created_at', { ascending: true });

  return res.json({
    run,
    events: events || [],
    logs: logs || [],
  });
};
