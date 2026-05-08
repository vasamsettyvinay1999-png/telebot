FROM node:20-alpine

RUN apk add --no-cache libreoffice tesseract-ocr tesseract-ocr-data-eng

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV HOME=/tmp
EXPOSE 3000

CMD ["node", "dist/src/server.js"]

