FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src/ ./src/
RUN addgroup -g 1001 -S nodejs && adduser -S nodeuser -u 1001
RUN mkdir -p uploads/temp uploads/heatmaps logs && chown -R nodeuser:nodejs /app
USER nodeuser
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:5000/api/health || exit 1
CMD ["node","src/server.js"]
