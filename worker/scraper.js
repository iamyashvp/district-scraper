const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth');
chromium.use(stealth());

const TARGET_URL = process.env.TARGET_URL || 'https://www.district.in';

async function launchBrowser() {
  return chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process',
    ],
  });
}

async function runScraper(city, onLog) {
  const log = (level, message) => {
    if (onLog) onLog(level, message);
  };

  log('info', 'Starting extraction pipeline...');
  const browser = await launchBrowser();
  log('ok', 'Browser environment initialized');

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    locale: 'en-IN',
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();
  const logs = [];

  page.on('console', (msg) => {
    logs.push({ type: msg.type(), text: msg.text() });
  });

  page.on('pageerror', (err) => {
    logs.push({ type: 'error', text: err.message });
  });

  log('ok', `Navigating to ${TARGET_URL}`);
  await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 60000 });
  log('ok', 'Page loaded (networkidle)');

  await page.waitForTimeout(2000);

  const screenshotBuffer = await page.screenshot({ fullPage: true });
  log('ok', 'Screenshot captured');

  log('info', 'Extracting structured data...');
  const events = await extractEvents(page);
  log('ok', `${events.length} events extracted`);

  const movies = await extractMovies(page);
  log('ok', `${movies.length} movies found`);

  const html = await page.content();
  const textContent = await page.evaluate(() => document.body.innerText).catch(() => '');

  await browser.close();
  log('ok', 'Browser closed');

  return {
    city,
    url: TARGET_URL,
    scrapedAt: new Date().toISOString(),
    title: await page.title().catch(() => ''),
    events,
    movies,
    html,
    textContent,
    screenshot: screenshotBuffer.toString('base64'),
    logs,
  };
}

async function extractEvents(page) {
  return page.evaluate(() => {
    const results = [];
    const seen = new Set();

    const schemas = [...document.querySelectorAll('script[type="application/ld+json"]')];
    for (const script of schemas) {
      try {
        const data = JSON.parse(script.textContent);
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          if (item['@type'] === 'Event') {
            const key = item.name + item.startDate;
            if (!seen.has(key)) {
              seen.add(key);
              results.push({
                name: item.name,
                date: item.startDate,
                endDate: item.endDate,
                location: item.location?.name || item.location?.address || '',
                url: item.url,
                description: item.description,
                image: item.image ? (Array.isArray(item.image) ? item.image[0] : item.image) : '',
                type: 'Event',
              });
            }
          }
        }
      } catch {}
    }

    const cards = document.querySelectorAll('a[href*="/events/"]');
    cards.forEach((link) => {
      const flexCols = link.querySelectorAll('div[class*="dds-flex-col"]');
      let infoDiv = null;
      for (const div of flexCols) {
        if (div.querySelector('h5')) { infoDiv = div; break; }
      }
      if (!infoDiv) {
        const imgs = link.querySelectorAll('img');
        if (imgs.length > 0) {
          const alt = imgs[0].getAttribute('alt') || '';
          const src = imgs[0].getAttribute('src') || '';
          if (alt && !seen.has(alt)) {
            seen.add(alt);
            results.push({ name: alt, date: '', price: '', location: '', url: link.href, image: src, type: 'Event' });
          }
        }
        return;
      }

      const spans = infoDiv.querySelectorAll('span');
      const h5 = infoDiv.querySelector('h5');
      const title = h5?.innerText?.trim() || link.querySelector('img')?.getAttribute('alt') || '';
      const date = spans[0]?.innerText?.trim() || '';
      const primarySpans = infoDiv.querySelectorAll('span[class*="dds-text-primary"]');
      const secondarySpans = infoDiv.querySelectorAll('span[class*="dds-text-secondary"]');
      const location = primarySpans.length > 0 ? primarySpans[0]?.innerText?.trim() : (spans[1]?.innerText?.trim() || '');
      const price = secondarySpans.length > 0 ? secondarySpans[0]?.innerText?.trim() : (spans[spans.length - 1]?.innerText?.trim() || '');

      const href = link.getAttribute('href') || '';
      const url = href.startsWith('http') ? href : `https://www.district.in${href}`;
      const img = link.querySelector('img');
      const image = img ? (img.getAttribute('src') || '') : '';

      const key = title + date;
      if (title && !seen.has(key)) {
        seen.add(key);
        results.push({ name: title, date, price, location, url, image, type: 'Event' });
      }
    });

    return results;
  });
}

async function extractMovies(page) {
  return page.evaluate(() => {
    const results = [];
    const seen = new Set();
    const cards = document.querySelectorAll('a[href*="/movies/"], [class*="movie-card"], [class*="MovieCard"]');
    cards.forEach((el) => {
      const link = el.closest('a') || el;
      const title = link.querySelector('h5, [class*="title"], [class*="Title"]')?.innerText?.trim() || link.querySelector('img')?.getAttribute('alt') || '';
      const meta = link.querySelector('[class*="meta"], [class*="Meta"], span')?.innerText?.trim() || '';
      const href = link.getAttribute('href') || '';
      const url = href.startsWith('http') ? href : `https://www.district.in${href}`;
      const img = link.querySelector('img');
      const image = img ? (img.getAttribute('src') || '') : '';
      if (title && !seen.has(title)) {
        seen.add(title);
        results.push({ name: title, meta, url, image, type: 'Movie' });
      }
    });
    return results;
  });
}

function calculateConfidence(event) {
  let score = 0;
  if (event.name) score += 20;
  if (event.date) score += 20;
  if (event.location) score += 20;
  if (event.price) score += 20;
  if (event.image) score += 10;
  if (event.description) score += 10;
  return score;
}

module.exports = { runScraper, calculateConfidence };
