# ===== 构建阶段 =====
FROM node:26-alpine AS build

WORKDIR /app

# 复制依赖文件并安装（修正 lock 中的内网源地址）
COPY package.json package-lock.json* ./
RUN sed -i 's#https://bnpm.byted.org#https://registry.npmmirror.com#g' package-lock.json
RUN npm ci --include=dev --registry=https://registry.npmmirror.com

# 复制源代码
COPY . .

# 构建前端
RUN npm run build

# ===== 生产阶段 =====
FROM node:26-alpine AS production

WORKDIR /app

# 设置环境变量
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4173 \
    STATIC_DIR=dist \
    PANIO_DATABASE_PATH=data/panio.sqlite \
    PANIO_UPLOADS_DIR=data/content \
    PANIO_BACKUP_DIR=backups \
    COOKIE_SECURE=0

# 复制 package 文件用于安装生产依赖（修正 lock 中的内网源地址）
COPY package.json package-lock.json* ./
RUN sed -i 's#https://bnpm.byted.org#https://registry.npmmirror.com#g' package-lock.json
RUN npm ci --omit=dev --registry=https://registry.npmmirror.com

# 从构建阶段复制产物
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/public ./public
# 服务端运行时直接引用的源码模块
COPY --from=build /app/src/features/score/migration-runtime.mjs ./src/features/score/migration-runtime.mjs

# 创建数据目录
RUN mkdir -p data/content backups

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:4173/api/v1/health || exit 1

# 暴露端口
EXPOSE 4173

# 启动服务
CMD ["node", "server/index.mjs"]
