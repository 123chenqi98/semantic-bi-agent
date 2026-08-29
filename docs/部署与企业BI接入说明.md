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
                              ┌──────────┐  ┌──────────────┐  ┌──────────┐
                              │ 本地      │  │ 风神 BI       │  │  LLM API │
                              │ SQLite   │  │ 企业级接入层  │  │ (可选)    │
                              │(真实可用) │  │(半真实·待联调)│  │          │
                              └──────────┘  └──────────────┘  └──────────┘
```

- **前端**：React 19 + Vite 构建为静态文件，由 nginx 托管
- **后端**：Flask + gunicorn，提供 REST API 和 SSE 流式接口
- **数据源层**：Provider/Adapter 抽象，当前支持本地 SQLite（真实）与风神 BI（企业级接入层：授权/状态机/分阶段问数已就绪，真实 OpenAPI 端点待文档填充）
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
| `FENGSHEN_BI_BASE_URL` | _(空)_ | 风神 BI OpenAPI 地址【真实接入必填】 |
| `FENGSHEN_BI_WORKSPACE_ID` | _(空)_ | 风神 BI 工作空间 ID【真实接入必填】 |
| `FENGSHEN_BI_APP_ID` | _(空)_ | 风神 BI 应用 ID（与 APP_SECRET 配对，用于换 token） |
| `FENGSHEN_BI_APP_SECRET` | _(空)_ | 风神 BI 应用密钥（与 APP_ID 配对，二选一鉴权） |
| `FENGSHEN_BI_TOKEN` | _(空)_ | 风神 BI 长期访问令牌（二选一鉴权，配置后优先使用） |
| `WEB_PORT` | `80` | Docker 前端对外端口 |

> 风神 BI 凭证也可在前端「系统设置 → 数据源管理 → 风神 BI 授权配置」表单中填写，
> 由后端内存托管（密钥不明文回显、不写入浏览器 localStorage）；生产环境推荐用环境变量/密钥管理服务注入。
> **注意**：仅填凭证尚不能真实取数，还需在 `fengshenbi_provider.py` 的 `API_ENDPOINTS` 填充真实端点（见第 10 节）。

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
- 每个 Provider 明确标记 `is_real`（真实可用 vs 演示/待联调），**不伪造接入状态**
- 面向企业 BI 场景提供「授权配置 → 连通性验证 → 数据集浏览 → 需求确认 → SQL 确认 → 受控执行」的完整链路

### 9.2 currentLocal 与 fengshenBi 的差异

| 维度 | currentLocal（本地 SQLite） | fengshenBi（风神 BI 企业级接入层） |
|------|------------------------------|-------------------------------------|
| 定位 | 开箱即用的真实示例库 | 面向企业真实 BI 平台的接入层 |
| 数据真实性 | **真实**（retail.db，4 表 21,064 行） | 需求识别/SQL 草案为**真实**；最终取数在未接 OpenAPI 前为**明确标注的 Mock** |
| 授权 | 无需授权（本地文件） | 需要 base_url / 工作空间 / app_id+secret 或 token |
| 连接状态 | 恒为 `real_ready` | 五态状态机（见 9.6） |
| 问数方式 | 直接问数 + 分阶段问数均可 | 推荐「分阶段问数」（先确认再执行） |
| 适用场景 | 开发、演示、评测对照 | 企业生产接入、简历展示「企业级接入能力」 |

### 9.3 统一接口

所有 Provider 共享基础取数接口：

```python
class DataSourceProvider(ABC):
    @property
    def source_type(self) -> str: ...        # 类型标识，如 "fengshenBi"
    @property
    def display_name(self) -> str: ...       # 人类可读名称
    @property
    def is_real(self) -> bool: ...           # True=真实数据, False=演示/待联调
    @property
    def is_available(self) -> bool: ...      # 当前凭证是否已配置

    # —— 基础取数 ——
    def health_check(self) -> dict: ...
    def list_datasets(self) -> list[dict]: ...
    def get_dataset_schema(self, dataset_id: str) -> dict: ...
    def preview_dataset(self, dataset_id: str, limit: int = 20) -> dict: ...
    def run_query(self, sql: str, max_rows: int = 200) -> dict: ...
    def run_semantic_query(self, question, history=None) -> dict: ...  # 预留：BI 自有语义问数
```

面向企业 BI 的**扩展接口**（基类均提供默认实现，旧 Provider 零改动；风神 BI 已覆盖）：

```python
    # —— 授权与状态机 ——
    def connection_status(self) -> str:           # 五态：unconfigured/mock/configured/verified/real_ready
    def configure(self, config: dict) -> dict:    # 运行时写入凭证（内存托管）
    def masked_config(self) -> dict:              # 脱敏回显（密钥显示 •••••• + 末 4 位）
    def validate_credentials(self, config=None) -> dict:  # 「测试连接」：校验 + 真实握手

    # —— 多租户 / 工作空间 ——
    def list_workspaces(self) -> dict:

    # —— 分阶段问数 ——
    def plan_query(self, question, history=None, dataset_id=None) -> dict:   # 阶段一：需求+SQL草案（不执行）
    def confirm_and_run(self, sql, dataset_id=None, max_rows=200) -> dict:   # 阶段二：用户确认后执行（含审计标记）
```

### 9.4 已注册的 Provider

| source_type | 名称 | is_real | 连接状态 | 说明 |
|-------------|------|---------|----------|------|
| `currentLocal` | 本地 SQLite（零售示例库） | **True** | real_ready | 4 张表、21,064 行，完整可用 |
| `fengshenBi` | 风神 BI（企业级接入层） | False | mock / configured | 授权、状态机、分阶段问数已就绪；真实端点待 OpenAPI 文档填充 |

### 9.5 文件结构

```
src/datasource/
├── __init__.py              # 包入口（导出 get_provider / provider_registry / reset_provider）
├── base.py                  # DataSourceProvider 抽象基类（基础取数 + 企业 BI 扩展接口）
├── local_provider.py        # 本地 SQLite Provider（真实可用）
├── fengshenbi_provider.py   # 风神 BI Provider（真实接入准备版，见第 10 节）
└── factory.py               # 工厂：按 source_type 多实例缓存 Provider
```

风神 BI Provider 内部分层（职责清晰，便于联调）：

```
配置读取   → _cfg() / configure()          环境变量 + 运行时配置双通道
凭证状态机 → connection_status() / validate_credentials()
HTTP 客户端 → _raw_request() / _fetch_token()   标准库 urllib，鉴权头/超时/错误归一化
响应映射   → _map_dataset() / _map_schema() / _map_query_result()
执行标准化 → run_query() / confirm_and_run()
```

### 9.6 五态连接状态机

风神 BI Provider 的 `connection_status()` 返回五种标准状态，前端据此渲染徽标：

| 状态 | 含义 | is_real | 取数行为 |
|------|------|---------|----------|
| `unconfigured` | 未配置任何凭证 | False | — |
| `mock` | 未配置凭证，运行于内置 Mock 演示 | False | 返回标注 mock 的模拟结果 |
| `configured` | 已填凭证，但真实端点未填充/未验证 | False | 返回标注「待联调」的模拟结果 |
| `verified` | 凭证已通过真实握手（端点齐全 + 连通） | False* | 真实取数 |
| `real_ready` | 端点齐全且验证通过，真实可用 | **True** | 真实取数 |

> *`verified` 与 `real_ready` 的区别：`is_real` 仅在查询主链路所需端点（datasets / dataset_schema / query）全部填充且验证通过时才为 True，杜绝「凭证有效但取数仍 Mock」的误判。

### 9.7 分阶段问数流程（plan → confirm）

企业 BI 问数不采用「直接问→直接出数」，而是拆为两个显式阶段，由后端 API 编排：

```
用户提问
   │
   ▼
POST /api/enterprise-bi/plan   （阶段一：不执行查询）
   │  ├─ 语义层匹配指标（match_metrics）
   │  ├─ 识别时间范围 / 分析维度
   │  ├─ 信息不全 → 返回 clarification_questions（澄清问题）+ assumptions（系统假设）
   │  └─ 生成 SQL 草案（LLM 走语义 pipeline，否则题库/兜底）
   ▼
前端展示：命中指标 / 时间 / 维度 + 澄清问题 + SQL 草案
   │
   │  用户核对口径、确认 SQL
   ▼
POST /api/enterprise-bi/confirm （阶段二：confirmed=true 才执行）
   │  └─ provider.confirm_and_run(sql)（带 audited 审计标记）
   ▼
返回：结果集 + 分析结论（key_findings）+ 图表建议（chart_suggestion）+ mock 标注
```

- 草案在服务端以 `plan_id` 缓存（内存态，重启失效），confirm 凭 `plan_id` 取回，避免前端篡改。
- 未接真实 API 时：**需求识别与 SQL 草案为真实能力**，最终取数为明确标注的模拟数据（`mock=true` / `pending_integration=true` + `mock_note`）。

### 9.8 前端界面

- **「企业 BI 问数」页**（侧边栏 Building2 图标）：步骤指示器（需求确认 → SQL 确认 → 执行取数）、问题输入、澄清问题/系统假设、命中指标/时间/维度标签、SQL 草案回显、「确认 SQL 并执行」按钮、结果表格 + KPI/柱状/折线图（Recharts）+ 分析结论，Mock 结果黄色横幅明确提示。
- **「系统设置 → 数据源管理」**：Provider 卡片切换、数据集列表与预览；选中风神 BI 时展开「风神 BI 授权配置」面板（base_url / app_id / app_secret / token / workspace_id 表单、保存配置、测试连接、工作空间查看、五态状态徽标）。

### 9.9 新增数据源（以接入其他 BI 为例）

1. 在 `src/datasource/` 下新建 `xxx_provider.py`
2. 继承 `DataSourceProvider`，实现基础抽象方法；企业 BI 场景按需覆盖扩展接口
3. 在 `factory.py` 的 `_REGISTRY` 中注册：

```python
_REGISTRY = {
    "currentLocal": LocalSQLiteProvider,
    "fengshenBi": FengshenBiProvider,
    "yourBi": YourBiProvider,  # 新增
}
```

4. 设置 `DATASOURCE_TYPE=yourBi` 或在前端通过 `?source_type=yourBi` 调用即可

---

## 10. 风神 BI 真实接入指南

> **当前状态**：风神 BI Provider 已从「占位 Mock」重构为「**真实接入准备版**」。
> 授权配置、连接状态机、统一 HTTP Client、响应 mapper、分阶段问数契约、前端 UI **均已落地**；
> 唯一缺失的是风神 BI **真实 OpenAPI 端点路径与响应字段**（严禁伪造，代码中以 `None + TODO` 显式标注）。

### 10.1 能力清单：哪些已真实可用，哪些待接通

**✅ 已真实具备（无需等文档）**

- 凭证配置读取：环境变量 `FENGSHEN_BI_*` + 前端表单运行时配置双通道
- 五态连接状态机与脱敏回显（密钥不落明文、不进浏览器持久化）
- 统一 HTTP Client：鉴权头（Bearer token / X-App-Id / X-Workspace-Id）、超时、HTTP/网络错误归一化
- API 响应 mapper：数据集 / Schema / 查询结果 → 统一接口格式（兼容多种字段命名）
- 分阶段问数：需求澄清、指标/时间/维度识别、SQL 草案生成、确认执行、结果标准化、图表推荐、分析结论
- 半真实演示链路：plan→confirm 全流程可跑通，Mock 结果明确标注

**❌ 待风神 BI 官方资料填充（当前为 None + TODO，不伪造）**

- 真实 API 端点路径（`API_ENDPOINTS` 7 个端点）
- 鉴权换 token 的真实接口与字段
- 数据集 / Schema / 预览 / SQL 代理 / 工作空间的真实请求与响应结构
- 风神 BI 自有「语义问数」私有接口（`run_semantic_query` 已预留，返回 not_supported）

### 10.2 真实接入还需你提供的资料

- [ ] 《风神 BI OpenAPI / 开放平台接口文档》
- [ ] API Base URL（`FENGSHEN_BI_BASE_URL`）
- [ ] 工作空间 ID（`FENGSHEN_BI_WORKSPACE_ID`）
- [ ] 应用 ID + 应用密钥（`FENGSHEN_BI_APP_ID` / `APP_SECRET`），或长期访问令牌（`FENGSHEN_BI_TOKEN`）
- [ ] 鉴权方式说明（静态 token / OAuth 换 token / 签名）
- [ ] SQL 查询代理接口是同步还是异步（异步需轮询任务 ID）
- [ ] （可选）风神 BI 自有「智能问数/语义问数」接口文档

### 10.3 需要修改的位置（均在 `src/datasource/fengshenbi_provider.py`）

| 位置 | 当前状态 | 接入时做什么 |
|------|----------|--------------|
| `API_ENDPOINTS` 字典 | 7 个端点全 `None` + TODO | 填入真实相对路径（auth_token / workspaces / datasets / dataset_schema / dataset_preview / query / semantic_query） |
| `_fetch_token()` | 静态 token 直用；动态换 token 处为 TODO | 按文档调整换 token 请求体与响应字段解析 |
| `_raw_request()` | 已实现通用请求 | 按需调整鉴权头 / 签名 / 异步轮询 |
| `_map_dataset()` / `_map_schema()` / `_map_query_result()` | 已做常见字段兼容 | 按真实响应字段名对齐映射 |
| `is_real` | 端点齐全 + verified 自动为 True | **无需手改**，端点填充并验证通过后自动切换 |

> 上层 API 路由（`app_backend.py`）、前端页面、状态机、分阶段流程**均无需改动**——这正是分层抽象的价值。

### 10.4 接入步骤

1. 在 `API_ENDPOINTS` 中填入真实端点路径。
2. 按文档实现 `_fetch_token()`（若平台直接下发长期 token，配置 `FENGSHEN_BI_TOKEN` 即可跳过）。
3. 在三个 `_map_*` mapper 中对齐真实响应字段。
4. 配置凭证后在前端「测试连接」，或：

```bash
curl -X POST http://localhost:5001/api/enterprise-bi/connect \
  -H "Content-Type: application/json" \
  -d '{"base_url":"https://bi.example.com/openapi","app_id":"xxx","app_secret":"yyy","workspace_id":"ws_001"}'
```

5. 状态变为 `verified` / `real_ready`，`is_real=true` 即接通。

### 10.5 验收标准

1. `curl /api/enterprise-bi/status` 中 `connection_status` 为 `real_ready`、`is_real` 为 `true`
2. `GET /api/enterprise-bi/datasets` 返回真实数据集（无 mock 标记）
3. `GET /api/enterprise-bi/schema?dataset_id=...` 返回真实字段
4. 「企业 BI 问数」页 plan→confirm 全链路返回**真实**结果（无黄色 Mock 横幅）
5. 凭证在前端始终脱敏显示，刷新页面后密钥不明文回显

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

### 企业 BI 分阶段问数（新增）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/enterprise-bi/config` | 获取脱敏后的当前凭证配置（密钥不明文回显） |
| POST | `/api/enterprise-bi/config` | 保存凭证配置（后端内存托管） |
| POST | `/api/enterprise-bi/connect` | 测试连接 / 校验凭证（可携带配置一并保存后验证） |
| GET | `/api/enterprise-bi/status` | 五态连接状态 + 健康信息 |
| GET | `/api/enterprise-bi/workspaces` | 工作空间列表 |
| GET | `/api/enterprise-bi/datasets` | 企业 BI 数据集列表 |
| GET | `/api/enterprise-bi/schema?dataset_id=` | 数据集字段 Schema |
| POST | `/api/enterprise-bi/plan` | **阶段一**：需求澄清 + 生成 SQL 草案（不执行） |
| POST | `/api/enterprise-bi/confirm` | **阶段二**：用户确认 SQL 后执行取数 |

### 企业 BI 分阶段问数示例

```bash
# 1) 查看连接状态（未配置时为 mock 态）
curl http://localhost:5001/api/enterprise-bi/status

# 2) 保存凭证（密钥仅后端内存持有）
curl -X POST http://localhost:5001/api/enterprise-bi/config \
  -H "Content-Type: application/json" \
  -d '{"base_url":"https://bi.example.com/openapi","app_id":"xxx","app_secret":"yyy","workspace_id":"ws_001"}'

# 3) 测试连接
curl -X POST http://localhost:5001/api/enterprise-bi/connect \
  -H "Content-Type: application/json" -d '{}'

# 4) 阶段一：生成 SQL 草案（不执行），返回 plan_id / 澄清问题 / 草案
curl -X POST http://localhost:5001/api/enterprise-bi/plan \
  -H "Content-Type: application/json" \
  -d '{"question":"上月各渠道的销售额分别是多少"}'

# 5) 阶段二：确认后执行（plan_id 来自上一步）
curl -X POST http://localhost:5001/api/enterprise-bi/confirm \
  -H "Content-Type: application/json" \
  -d '{"plan_id":"plan_xxxx","confirmed":true}'
```

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
