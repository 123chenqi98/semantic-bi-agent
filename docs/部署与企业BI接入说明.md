# 部署与企业 BI 接入说明

## 目录

1. [架构概览](#1-架构概览)
2. [环境要求](#2-环境要求)
3. [本地开发启动](#3-本地开发启动)
4. [本地生产预览](#4-本地生产预览)
5. [单机部署（手动）](#5-单机部署手动)
6. [Docker 部署（推荐）](#6-docker-部署推荐)
7. [环境变量说明](#7-环境变量说明)
8. [健康检查](#8-健康检查)
9. [企业 BI 接入架构](#9-企业-bi-接入架构)
10. [风神 BI 真实接入指南](#10-风神-bi-真实接入指南)
11. [API 接口清单](#11-api-接口清单)

---

## 1. 架构概览

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   浏览器     │────▶│  nginx :80   │────▶│  Flask :5001    │
│  (React SPA) │     │  (静态+代理)  │     │  (gunicorn×4)   │
└─────────────┘     └──────────────┘     └────────┬────────┘
                                                  │
                                    ┌─────────────┼─────────────┐
                                    ▼             ▼             ▼
                              ┌──────────┐  ┌──────────┐  ┌──────────┐
                              │ 本地      │  │ 风神 BI   │  │  LLM API │
                              │ SQLite   │  │ (占位Mock)│  │ (可选)    │
                              └──────────┘  └──────────┘  └──────────┘
```

- **前端**：React 19 + Vite 构建为静态文件，由 nginx 托管
- **后端**：Flask + gunicorn，提供 REST API 和 SSE 流式接口
- **数据源层**：Provider/Adapter 抽象，当前支持本地 SQLite 和风神 BI（占位）
- **反向代理**：nginx 将 `/api/*` 转发到后端，其余路径走 SPA 路由

---

## 2. 环境要求

| 组件 | 版本要求 | 说明 |
|------|---------|------|
| Python | 3.9+ | 后端运行时 |
| Node.js | 18+（推荐 20） | 前端构建 |
| Docker | 20.10+ | Docker 部署时需要 |
| Docker Compose | v2+ | Docker 部署时需要 |

---

## 3. 本地开发启动

```bash
# 后端（终端 1）
cd /path/to/project
pip install -r requirements.txt
cp .env.example .env   # 按需填写 LLM_API_KEY，不填则走 Mock 模式
python3 -m src.demo.app_backend
# → http://localhost:5001/api/health

# 前端（终端 2）
cd web
npm install
npm run dev
# → http://localhost:5173
```

开发模式下 Vite 自动代理 `/api` → `http://localhost:5001`。

---

## 4. 本地生产预览

```bash
# 1. 构建前端
cd web && npm run build && cd ..

# 2. 用 gunicorn 启动后端
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:5001 wsgi:app --timeout 120

# 3. 用 nginx 或 vite preview 托管前端
cd web && npx vite preview --port 4173
# 访问 http://localhost:4173
```

> 注意：`vite preview` 不会代理 `/api`，生产环境需要 nginx 反向代理。

---

## 5. 单机部署（手动）

适用于云主机（阿里云/腾讯云/AWS EC2 等）。

```bash
# 1. 拉取代码
git clone git@github.com:123chenqi98/semantic-bi-agent.git
cd semantic-bi-agent

# 2. 后端
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# 编辑 .env，填入 LLM_API_KEY 等配置

# 3. systemd 服务（推荐）
sudo tee /etc/systemd/system/semantic-bi-backend.service > /dev/null <<'EOF'
[Unit]
Description=Semantic BI Backend
After=network.target

[Service]
User=www-data
WorkingDirectory=/opt/semantic-bi-agent
EnvironmentFile=/opt/semantic-bi-agent/.env
ExecStart=/opt/semantic-bi-agent/venv/bin/gunicorn -w 4 -b 127.0.0.1:5001 wsgi:app --timeout 120
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable --now semantic-bi-backend

# 4. 前端构建
cd web && npm ci && npm run build
# 将 web/dist/ 部署到 nginx 静态目录

# 5. nginx 配置
sudo cp nginx.conf /etc/nginx/conf.d/semantic-bi.conf
# 修改 proxy_pass 为 http://127.0.0.1:5001
sudo nginx -t && sudo systemctl reload nginx
```

---

## 6. Docker 部署（推荐）

### 6.1 一键启动

```bash
# 1. 准备环境变量
cp .env.example .env
# 编辑 .env（至少确认 DATASOURCE_TYPE，LLM_API_KEY 可选）

# 2. 构建并启动
docker compose -f docker-compose.prod.yml up -d --build

# 3. 查看日志
docker compose -f docker-compose.prod.yml logs -f

# 4. 访问
# 浏览器打开 http://服务器IP
```

### 6.2 端口配置

默认监听 80 端口。如需修改，在 `.env` 中设置：

```bash
WEB_PORT=8080
```

### 6.3 数据持久化

SQLite 数据库通过 volume 挂载：

```yaml
volumes:
  - ./data:/app/data
```

对数据库的修改在容器重启后保留。

### 6.4 分别构建镜像

```bash
# 后端镜像
docker build -f Dockerfile.backend -t semantic-bi-backend .

# 前端镜像
docker build -f Dockerfile.frontend -t semantic-bi-frontend .
```

---

## 7. 环境变量说明

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `BACKEND_PORT` | `5001` | 后端监听端口 |
| `FLASK_ENV` | `production` | 运行模式 |
| `DATASOURCE_TYPE` | `currentLocal` | 数据源类型：`currentLocal` / `fengshenBi` |
| `SQLITE_DB_PATH` | 内置路径 | SQLite 数据库文件路径 |
| `LLM_API_KEY` | _(空)_ | LLM API Key，留空走 Mock 模式 |
| `LLM_BASE_URL` | _(空)_ | LLM API 地址（OpenAI 兼容） |
| `LLM_MODEL` | _(空)_ | 模型名称 |
| `LLM_TEMPERATURE` | `0` | 采样温度 |
| `LLM_TIMEOUT` | `30` | 请求超时（秒） |
| `LLM_MAX_RETRIES` | `2` | 最大重试次数 |
| `FENGSHEN_BI_BASE_URL` | _(空)_ | 风神 BI API 地址（预留） |
| `FENGSHEN_BI_APP_ID` | _(空)_ | 风神 BI 应用 ID（预留） |
| `FENGSHEN_BI_APP_SECRET` | _(空)_ | 风神 BI 应用密钥（预留） |
| `FENGSHEN_BI_TOKEN` | _(空)_ | 风神 BI 访问令牌（预留） |
| `FENGSHEN_BI_WORKSPACE_ID` | _(空)_ | 风神 BI 工作空间 ID（预留） |
| `WEB_PORT` | `80` | Docker 前端对外端口 |

---

## 8. 健康检查

### 后端健康检查

```bash
curl http://localhost:5001/api/health
```

响应：

```json
{
  "ok": true,
  "real_llm_enabled": false,
  "mode": "mock-sql+real-sqlite",
  "db_exists": true,
  "metrics_count": 8
}
```

### 数据源健康检查

```bash
curl http://localhost:5001/api/datasource/status
```

响应包含当前数据源、所有已注册 Provider 的状态和可用性。

### Docker 健康检查

两个容器均配置了 `HEALTHCHECK`：

- 后端：每 30 秒请求 `/api/health`
- 前端：每 30 秒请求 nginx `/health`

---

## 9. 企业 BI 接入架构

### 9.1 设计目标

系统通过统一的 **DataSourceProvider** 抽象层屏蔽底层数据源差异，使得：

- 问数（Text-to-SQL）、图表生成、指标词典等功能无需关心数据来自哪里
- 新增数据源只需实现一个 Provider 类，上层代码零改动
- 每个 Provider 明确标记 `is_real`（真实可用 vs 占位 Mock），不伪造接入状态

### 9.2 统一接口

所有 Provider 必须实现以下方法：

```python
class DataSourceProvider(ABC):
    @property
    def source_type(self) -> str: ...        # 类型标识，如 "fengshenBi"

    @property
    def display_name(self) -> str: ...       # 人类可读名称

    @property
    def is_real(self) -> bool: ...           # True=真实数据, False=Mock占位

    @property
    def is_available(self) -> bool: ...      # 当前是否可用

    def health_check(self) -> dict: ...      # 健康检查
    def list_datasets(self) -> list[dict]: ... # 列出数据集
    def get_dataset_schema(self, dataset_id: str) -> dict: ... # 字段元数据
    def preview_dataset(self, dataset_id: str, limit: int = 20) -> dict: ... # 预览
    def run_query(self, sql: str, max_rows: int = 200) -> dict: ... # 执行SQL
```

### 9.3 已注册的 Provider

| source_type | 名称 | is_real | 说明 |
|-------------|------|---------|------|
| `currentLocal` | 本地 SQLite（零售示例库） | **True** | 4 张表、21,064 行，完整可用 |
| `fengshenBi` | 风神 BI（占位 Mock · 待接入） | False | 接口链路已通，数据为模拟 |

### 9.4 文件结构

```
src/datasource/
├── __init__.py              # 包入口
├── base.py                  # DataSourceProvider 抽象基类
├── local_provider.py        # 本地 SQLite Provider（真实可用）
├── fengshenbi_provider.py   # 风神 BI 占位 Provider（Mock）
└── factory.py               # 工厂：按 DATASOURCE_TYPE 选择 Provider
```

### 9.5 切换数据源

通过环境变量切换，无需改代码：

```bash
# 使用本地 SQLite（默认）
DATASOURCE_TYPE=currentLocal

# 使用风神 BI（当前为 Mock）
DATASOURCE_TYPE=fengshenBi
```

### 9.6 前端数据源管理

系统设置页（`/settings`）提供「数据源管理」卡片：

- 展示所有已注册 Provider，标记「真实」/「Mock」、「可用」/「未配置凭证」
- 点击切换查看各数据源的数据集列表
- 展开数据集可预览前 5 行数据
- 风神 BI 的预览数据带有黄色「⚠️ Mock 数据」提示

### 9.7 新增数据源（以接入其他 BI 为例）

1. 在 `src/datasource/` 下新建 `xxx_provider.py`
2. 继承 `DataSourceProvider`，实现所有抽象方法
3. 在 `factory.py` 的 `_REGISTRY` 中注册：

```python
_REGISTRY = {
    "currentLocal": LocalSQLiteProvider,
    "fengshenBi": FengshenBiProvider,
    "yourBi": YourBiProvider,  # 新增
}
```

4. 设置 `DATASOURCE_TYPE=yourBi` 即可切换

---

## 10. 风神 BI 真实接入指南

> **当前状态**：风神 BI Provider 为占位实现（Mock），接口链路已打通，但未调用任何真实 API。

### 10.1 需要获取的信息

接入风神 BI 真实 API 前，需要获取：

- [ ] API Base URL（`FENGSHEN_BI_BASE_URL`）
- [ ] 应用 ID（`FENGSHEN_BI_APP_ID`）
- [ ] 应用密钥（`FENGSHEN_BI_APP_SECRET`）或访问令牌（`FENGSHEN_BI_TOKEN`）
- [ ] 工作空间 ID（`FENGSHEN_BI_WORKSPACE_ID`）
- [ ] API 文档（数据集列表、Schema 查询、数据预览、SQL 查询等接口）

### 10.2 需要修改的文件

接入时只需修改一个文件：

**`src/datasource/fengshenbi_provider.py`**

| 方法 | 当前 Mock 行为 | 替换为真实实现 |
|------|---------------|---------------|
| `__init__` | 读取环境变量但不发起连接 | 初始化 HTTP 客户端、获取/刷新 Token |
| `health_check` | 返回 Mock 状态 | 调用认证接口验证凭证有效性 |
| `list_datasets` | 返回 3 个硬编码数据集 | 调用风神 BI 数据集列表 API |
| `get_dataset_schema` | 返回硬编码字段 | 调用风神 BI 字段元数据 API |
| `preview_dataset` | 返回随机模拟数据 | 调用风神 BI 数据预览/采样 API |
| `run_query` | 返回 `not_implemented` | 调用风神 BI SQL 查询代理 API |

### 10.3 不需要修改的文件

- `base.py`：接口定义不变
- `factory.py`：注册逻辑不变
- `app_backend.py`：API 路由不变
- 前端所有组件：API 响应格式不变
- Docker / nginx 配置：不变

### 10.4 接入步骤示例

```python
# src/datasource/fengshenbi_provider.py

class FengshenBiProvider(DataSourceProvider):
    def __init__(self):
        # ... 读取环境变量 ...
        self._token = self._get_token()

    def _get_token(self) -> str:
        """用 app_id + app_secret 换取 access_token。"""
        # TODO: 替换为风神 BI 真实认证接口
        # resp = requests.post(f"{self.base_url}/auth/token", json={...})
        # return resp.json()["access_token"]
        ...

    def list_datasets(self):
        # TODO: 替换为风神 BI 真实 API
        # resp = requests.get(
        #     f"{self.base_url}/datasets",
        #     headers={"Authorization": f"Bearer {self._token}"},
        #     params={"workspace_id": self.workspace_id}
        # )
        # return [self._map_dataset(d) for d in resp.json()["data"]]
        ...

    def run_query(self, sql, max_rows=200):
        # TODO: 替换为风神 BI SQL 查询代理接口
        ...
```

### 10.5 验收标准

接入完成后：

1. `curl /api/datasource/status` 中 fengshenBi 的 `is_real` 仍为 `false`（由代码控制）
2. 将 `is_real` 属性改为 `True`
3. 前端数据源管理页切换到风神 BI，能看到真实数据集和预览数据
4. 通过 `POST /api/datasource/query` 执行 SQL 返回真实结果
5. Text-to-SQL 流程生成的 SQL 能通过风神 BI 执行

---

## 11. API 接口清单

### 系统

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 后端健康检查 |
| GET | `/api/help` | 技能与指令列表 |
| GET | `/api/db-health` | 数据集健康度看板 |

### 对话

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/chat` | 非流式问答 |
| POST | `/api/chat/stream` | SSE 流式问答 |
| GET | `/api/dict/<id>` | 指标词典查询 |

### 数据源（新增）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/datasource/status` | 数据源状态与注册列表 |
| GET | `/api/datasource/datasets` | 数据集列表（支持 `?source_type=`） |
| GET | `/api/datasource/datasets/<id>/schema` | 字段 Schema |
| GET | `/api/datasource/datasets/<id>/preview` | 数据预览（`?limit=N`） |
| POST | `/api/datasource/query` | 执行 SQL 查询 |

### 数据源查询示例

```bash
# 查看数据源状态
curl http://localhost:5001/api/datasource/status

# 列出本地数据集
curl http://localhost:5001/api/datasource/datasets?source_type=currentLocal

# 查看风神 BI Mock 数据集
curl http://localhost:5001/api/datasource/datasets?source_type=fengshenBi

# 预览数据
curl http://localhost:5001/api/datasource/datasets/order_item/preview?limit=5

# 执行 SQL
curl -X POST http://localhost:5001/api/datasource/query \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT channel, COUNT(*) FROM order_item GROUP BY channel"}'
```
