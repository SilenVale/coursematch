# CourseMatch — 单容器：API + 静态前端（dev/staging 用 Render 等）
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps ./apps
COPY packages ./packages
RUN npm ci
RUN npm run build

FROM node:20-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV SERVE_WEB=1

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/allocation/package.json ./packages/allocation/
COPY packages/shared/package.json ./packages/shared/
RUN npm ci --omit=dev

# migrate/seed 仍用 tsx（仅启动时执行）
RUN npm install tsx@4.19.2 --no-save

COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/allocation/dist ./packages/allocation/dist
COPY apps/api/src/db ./apps/api/src/db
COPY scripts/docker-start.sh ./scripts/docker-start.sh
RUN chmod +x ./scripts/docker-start.sh

EXPOSE 3001
CMD ["./scripts/docker-start.sh"]
