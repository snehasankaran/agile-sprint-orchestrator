FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .

EXPOSE 3000 3020 4040 5050 6060

CMD ["node", "orchestrator.js"]
