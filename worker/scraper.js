const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth');
const path = require('path');
const fs = require('fs');

chromium.use(stealth());

const TARGET_URL = process.env.TARGET_URL || 'https://www.district.in';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
];

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1536, height: 864 },
  { width: 1920, height: 1080 },
  { width: 1280, height: 720 },
];

function randomItem(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function randomDelay(min, max) {
  return new Promise((r) => setTimeout(r, randomInt(min, max)));
}

async function humanMouseMove(page) {
  const viewport = page.viewportSize();
  const points = randomInt(2, 4);
  for (let i = 0; i < points; i++) {
    const x = randomInt(50, viewport.width - 50);
    const y = randomInt(50, viewport.height - 50);
    await page.mouse.move(x, y, { steps: randomInt(8, 15) });
    await randomDelay(200, 600);
  }
}

async function humanScroll(page) {
  const height = await page.evaluate(() => document.body.scrollHeight);
  const scrolls = randomInt(3, 6);
  for (let i = 0; i < scrolls; i++) {
    const target = randomInt(100, Math.max(200, height - 300));
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'smooth' }), target);
    await randomDelay(800, 2000);
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

async function launchBrowser() {
  return chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process',
      '--disable-blink-features=AutomationControlled',
    ],
  });
}

function ensureDir(dir) {
  if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function runScraper(city, onLog) {
  const log = (level, message) => {
    if (onLog) onLog(level, message);
  };

  const screenshotDir = process.env.SCREENSHOT_DIR || path.join(__dirname, 'screenshots');
  const errorDir = path.join(screenshotDir, 'errors');
  ensureDir(screenshotDir);
  ensureDir(errorDir);

  const timestamp = Date.now();
  const viewport = randomItem(VIEWPORTS);

  log('info', 'Starting extraction pipeline...');

  let browser;
  try {
    browser = await launchBrowser();
    log('ok', 'Browser environment initialized');

    const context = await browser.newContext({
      userAgent: randomItem(USER_AGENTS),
      locale: 'en-IN',
      viewport,
      geolocation: { latitude: 28.6139, longitude: 77.2090 },
      permissions: ['geolocation'],
    });

    const page = await context.newPage();
    page.setDefaultTimeout(60000);

    const browserLogs = [];
    page.on('console', (msg) => {
      browserLogs.push({ type: msg.type(), text: msg.text() });
    });
    page.on('pageerror', (err) => {
      browserLogs.push({ type: 'error', text: err.message });
    });

    log('ok', `Navigating to ${TARGET_URL}`);
    await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 60000 });
    log('ok', 'Page loaded (networkidle)');

    await randomDelay(1000, 2500);
    await humanMouseMove(page);
    log('ok', 'Mouse movements completed');

    await page.waitForSelector('#page-content', { timeout: 15000 }).catch(() => {});
    await humanScroll(page);
    log('ok', 'Scrolling completed');

    const beforeScreenshot = await page.screenshot({ fullPage: true });
    const beforePath = path.join(screenshotDir, `${timestamp}-before.png`);
    fs.writeFileSync(beforePath, beforeScreenshot);
    log('ok', 'Before-scrape screenshot saved');

    log('info', 'Extracting structured data...');
    const events = await extractEvents(page);
    log('ok', `${events.length} events extracted`);

    const movies = await extractMovies(page);
    log('ok', `${movies.length} movies found`);

    await humanMouseMove(page);
    await randomDelay(500, 1500);

    const afterScreenshot = await page.screenshot({ fullPage: true });
    const afterPath = path.join(screenshotDir, `${timestamp}-after.png`);
    fs.writeFileSync(afterPath, afterScreenshot);
    log('ok', 'After-scrape screenshot saved');

    const html = await page.content();
    const htmlPath = path.join(screenshotDir, `${timestamp}-page.html`);
    fs.writeFileSync(htmlPath, html);
    log('ok', 'HTML snapshot saved');

    const textContent = await page.evaluate(() => document.body.innerText).catch(() => '');

    await browser.close();
    browser = null;
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
      screenshot: beforeScreenshot.toString('base64'),
      screenshotPath: beforePath,
      logs: browserLogs,
    };
  } catch (err) {
    if (browser) {
      try {
        const errorTimestamp = Date.now();
        const page = browser.contexts()[0]?.pages()[0];
        if (page) {
          const errorScreenshot = await page.screenshot({ fullPage: true });
          const errorPath = path.join(errorDir, `${timestamp}-error.png`);
          fs.writeFileSync(errorPath, errorScreenshot);
          log('error', `Error screenshot saved: ${errorPath}`);
        }
      } catch {}
      try { await browser.close(); } catch {}
    }
    throw err;
  }
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
                name: item.name, date: item.startDate, endDate: item.endDate,
                location: item.location?.name || item.location?.address || '',
                url: item.url, description: item.description,
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
      for (const div of flexCols) { if (div.querySelector('h5')) { infoDiv = div; break; } }
      if (!infoDiv) {
        const imgs = link.querySelectorAll('img');
        if (imgs.length > 0) {
          const alt = imgs[0].getAttribute('alt') || '';
          const src = imgs[0].getAttribute('src') || '';
          if (alt && !seen.has(alt)) { seen.add(alt); results.push({ name: alt, date: '', price: '', location: '', url: link.href, image: src, type: 'Event' }); }
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
      if (title && !seen.has(key)) { seen.add(key); results.push({ name: title, date, price, location, url, image, type: 'Event' }); }
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
      if (title && !seen.has(title)) { seen.add(title); results.push({ name: title, meta, url, image, type: 'Movie' }); }
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
