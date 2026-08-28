# ==================== 全平台单服务 Dockerfile ====================
# 适配：Hugging Face Spaces（默认端口 7860）/ Render（注入 PORT）/ 任意 Docker 主机
# 多阶段构建：前端 Node 构建 → Python Flask + gunicorn 托管静态文件 + API

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
    gcc curl && rm -rf /var/lib/apt/lists/*

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

EXPOSE 7860

CMD exec gunicorn -w 2 -b 0.0.0.0:${PORT:-7860} wsgi:app \
    --timeout 120 \
    --access-logfile - \
    --error-logfile -
