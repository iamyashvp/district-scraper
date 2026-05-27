let Queue;

try {
  const BullMQ = require('bullmq');
  Queue = BullMQ.Queue;
} catch {
  Queue = null;
}

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');

function getConnection() {
  if (process.env.REDIS_URL) return { url: process.env.REDIS_URL };
  return { host: REDIS_HOST, port: REDIS_PORT };
}

let scrapeQueue = null;
let connection = null;

function getQueue() {
  if (!Queue) return null;
  if (!scrapeQueue) {
    connection = getConnection();
    scrapeQueue = new Queue('scraping', { connection });
  }
  return scrapeQueue;
}

async function enqueueScrape(city, cityName) {
  const q = getQueue();
  if (!q) return null;
  const job = await q.add('scrape-city', { city, cityName }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  });
  return job.id;
}

async function closeQueue() {
  if (scrapeQueue) {
    await scrapeQueue.close();
    if (connection && connection.close) await connection.close();
  }
}

module.exports = { enqueueScrape, closeQueue, getQueue };
