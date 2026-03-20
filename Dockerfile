FROM node:20-slim AS frontend
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:20-slim AS backend-build
WORKDIR /backend
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

FROM node:20-slim
WORKDIR /app
COPY --from=backend-build /backend/dist ./dist
COPY --from=backend-build /backend/node_modules ./node_modules
COPY --from=frontend /backend/public ./public
EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
