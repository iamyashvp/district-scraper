CREATE TABLE IF NOT EXISTS scraped_data (
  id SERIAL PRIMARY KEY,
  city VARCHAR(100) NOT NULL,
  data JSONB NOT NULL,
  scraped_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scraped_city ON scraped_data(city);
CREATE INDEX IF NOT EXISTS idx_scraped_at ON scraped_data(scraped_at);
