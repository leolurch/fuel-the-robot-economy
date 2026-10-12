FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV HOST=0.0.0.0
ENV PORT=4317
ENV SERVE_STATIC=1

EXPOSE 4317

CMD ["node", "--experimental-strip-types", "server/main.ts"]
