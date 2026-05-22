# ---------- 后端 Dockerfile ----------
FROM node:20-alpine

WORKDIR /app

# 安装 better-sqlite3 编译依赖
RUN apk add --no-cache python3 make g++

# 复制依赖文件并安装
COPY package.json ./
RUN npm install --production

# 复制源代码
COPY server.js ./

# 创建数据目录
RUN mkdir -p /app/data

# 环境变量
ENV DB_PATH=/app/data/messages.db
ENV PORT=3001

EXPOSE 3001

CMD ["node", "server.js"]
