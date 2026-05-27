FROM mcr.microsoft.com/playwright:v1.52.0-jammy

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN mkdir -p screenshots html

ENV NODE_ENV=production

CMD ["node", "index.js"]
