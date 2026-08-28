# ==================== Render 单服务部署 Dockerfile ====================
# 前端构建 + Flask API + 静态文件托管，合并为一个容器
# 构建上下文：项目根目录
# Render 会自动注入 PORT 环境变量

# ---------- Stage 1: 构建前端 ----------
FROM node:20-alpine AS frontend-builder
WORKDIR /app/web

COPY web/package.json web/package-lock.json ./
RUN npm ci

COPY web/ ./
RUN npm run build

# ---------- Stage 2: Python 后端 + 静态文件 ----------
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ ./src/
COPY wsgi.py .
COPY data/ ./data/

COPY --from=frontend-builder /app/web/dist ./static

ENV FLASK_ENV=production \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    DATASOURCE_TYPE=currentLocal \
    STATIC_DIR=/app/static

EXPOSE 10000

CMD exec gunicorn -w 2 -b 0.0.0.0:${PORT:-10000} wsgi:app \
    --timeout 120 \
    --access-logfile - \
    --error-logfile -
