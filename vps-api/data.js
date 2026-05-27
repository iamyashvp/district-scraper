let kv;
try {
  kv = require('@vercel/kv');
} catch {}

module.exports = async function handler(req, res) {
  try {
    const ids = await kv.zrange('scrapes', 0, -1, { rev: true });

    if (req.query.id) {
      const data = await kv.hgetall(`scrape:${req.query.id}`);
      if (!data) return res.status(404).json({ error: 'Scrape not found' });
      return res.status(200).json(data);
    }

    const scrapes = [];
    for (const id of ids.slice(0, 20)) {
      const data = await kv.hgetall(`scrape:${id}`);
      if (data) {
        scrapes.push({ id, title: data.title, url: data.url, scrapedAt: data.scrapedAt });
      }
    }

    return res.status(200).json(scrapes);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
