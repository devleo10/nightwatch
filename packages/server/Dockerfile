FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/package.json
COPY packages/server/package.json packages/server/package.json
RUN npm ci --workspace @devleo10/nightwatch-server --include-workspace-root

COPY packages/core packages/core
COPY packages/server packages/server
COPY tsconfig.base.json tsconfig.base.json
RUN npm run build -w @devleo10/nightwatch-core && npm run build -w @devleo10/nightwatch-server

ENV PORT=4000
EXPOSE 4000
CMD ["node", "packages/server/dist/cli.js"]
