const { enqueueScrape } = require('./queue');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body = req.body;
  if (!body || typeof body !== 'object') {
    try {
      body = JSON.parse(req.body || '{}');
    } catch {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
  }

  const city = body.city || req.query.city;
  const cities = {
    'delhi-ncr': 'Delhi/NCR',
    'mumbai': 'Mumbai',
    'bangalore': 'Bangalore',
    'pune': 'Pune',
    'chennai': 'Chennai',
    'hyderabad': 'Hyderabad',
    'kolkata': 'Kolkata',
    'ahmedabad': 'Ahmedabad',
    'jaipur': 'Jaipur',
    'chandigarh': 'Chandigarh',
  };

  const cityName = cities[city] || city;

  if (!city) {
    return res.status(400).json({ error: 'City parameter is required' });
  }

  const jobId = await enqueueScrape(city, cityName);

  if (jobId) {
    return res.status(202).json({
      success: true,
      jobId,
      status: 'queued',
      message: `Scrape queued for ${cityName}`,
    });
  }

  return res.status(503).json({
    error: 'Queue not available. Redis must be configured for background scraping.',
    detail: 'Set REDIS_URL or REDIS_HOST/REDIS_PORT in environment variables.',
  });
};
