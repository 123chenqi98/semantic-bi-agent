# 部署与企业 BI 接入说明

## 目录

1. [架构概览](#1-架构概览)
2. [环境要求](#2-环境要求)
3. [本地开发启动](#3-本地开发启动)
4. [本地生产预览](#4-本地生产预览)
5. [单机部署（手动）](#5-单机部署手动)
6. [Docker 部署（推荐）](#6-docker-部署推荐)
7. [环境变量说明](#7-环境变量说明)
8. [健康检查、系统状态与审计](#8-健康检查系统状态与审计)
9. [企业 BI 接入架构](#9-企业-bi-接入架构)
10. [风神 BI 真实接入指南](#10-风神-bi-真实接入指南)
11. [API 接口清单](#11-api-接口清单)
12. [审计与可追踪（第五轮）](#12-审计与可追踪第五轮)
13. [能力清单与真实性边界](#13-能力清单与真实性边界)
14. [权限与安全边界](#14-权限与安全边界)

---

## 1. 架构概览

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   浏览器     │────▶│  nginx :80   │────▶│  Flask :5001    │
│  (React SPA) │     │  (静态+代理)  │     │ gunicorn 1进程  │
│              │     │              │     │  ×4线程(gthread)│
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
- **数据源层**：Provider/Adapter 抽象，当前支持本地 SQLite（真实）与风神 BI（企业级接入层：授权/状态机/分阶段问数已就绪；MCP SSE 传输与 JWT 换取已在内网实测打通，真实取数待邀测白名单开通，详见第 10 节）
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

# 2. 用 gunicorn 启动后端（企业 BI 状态在进程内内存，务必单 worker，用多线程提供并发）
pip install gunicorn
gunicorn -w 1 -k gthread --threads 4 -b 0.0.0.0:5001 wsgi:app --timeout 120

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
# 注意：企业 BI 的 plan 缓存与运行时凭证保存在「进程内内存」中（演示版安全设计，
# 密钥不落盘）。因此 gunicorn 必须只开 1 个 worker 进程，否则多进程间内存不共享，
# 会出现「plan 已过期」「凭证保存后另一进程读不到」等随机故障。
# 用 gthread 多线程在同一进程内提供并发（LLM/HTTP 为 IO 密集型，线程足够），
# gthread 为 gunicorn 内置 worker，无需额外安装。
ExecStart=/opt/semantic-bi-agent/venv/bin/gunicorn -w 1 -k gthread --threads 4 -b 127.0.0.1:5001 wsgi:app --timeout 120
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

> **变量分区（重要）**：
> - **后端变量**写在项目根目录 `.env`（从 `.env.example` 复制），可含密钥，仅后端进程读取；
> - **前端变量**写在 `web/.env`（从 `web/.env.example` 复制），必须以 `VITE_` 前缀开头，
>   会被打包进浏览器 JS 包——**严禁在任何 `VITE_` 变量中放置密钥、token、JWT**；
> - 风神 BI 凭证一律通过后端 `.env` 或设置页表单（后端内存托管）注入，前端只脱敏回显。

### 7.1 后端变量（根目录 `.env`）

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `BACKEND_PORT` | `5001` | 后端监听端口 |
| `FLASK_ENV` | `production` | 运行模式（development/production，仅影响展示） |
| `DATASOURCE_TYPE` | `currentLocal` | 数据源类型：`currentLocal` / `fengshenBi` |
| `SQLITE_DB_PATH` | 内置路径 | SQLite 数据库文件路径 |
| `STATIC_DIR` | 项目根 `static/` | 生产环境前端构建产物目录（Flask 托管静态资源时使用；Docker 由 nginx 托管） |
| `LLM_API_KEY` | _(空)_ | LLM API Key，留空走模板/题库模式（演示期简化配置：不填也能完整跑通问数链路） |
| `LLM_BASE_URL` | _(空)_ | LLM API 地址（OpenAI 兼容） |
| `LLM_MODEL` | _(空)_ | 模型名称/接入点 ID |
| `LLM_TEMPERATURE` | `0` | 采样温度 |
| `LLM_TIMEOUT` | `30` | 请求超时（秒） |
| `LLM_MAX_RETRIES` | `2` | 限流/失败时最大重试次数（指数退避） |
| `AUDIT_LOG_DIR` | `<项目根>/logs/audit` | 审计 JSONL 日志目录（Docker 内为 `/app/logs/audit`，已挂卷持久化） |
| `FENGSHEN_BI_BASE_URL` | _(空)_ | 风神 BI OpenAPI 地址（嵌入/治理用，取数非必填） |
| `FENGSHEN_BI_WORKSPACE_ID` | _(空)_ | 风神 BI 工作空间/项目 ID（MCP `appId`，真实取数必填） |
| `FENGSHEN_BI_APP_ID` / `APP_SECRET` / `TOKEN` | _(空)_ | OpenAPI 应用凭证 / 长期令牌（嵌入/治理用） |
| `FENGSHEN_BI_CLIENT_ID` / `CLIENT_SECRET` | _(空)_ | 风神 MCP 开发者凭证（clientId/clientSecret，自动换取用户 JWT）【密钥】 |
| `FENGSHEN_BI_USER_JWT` | _(空)_ | 静态用户 JWT（配置后优先于动态换取）【密钥】 |
| `FENGSHEN_BI_PROXY_USER` | _(空)_ | 代理用户（风神账号，如 `chenqi.2005`），换取 JWT 的数据权限身份 |
| `FENGSHEN_BI_SOPHON_API_KEY` | _(空)_ | sophon 平台 api_key（仅内网 PSM 形态）【密钥】 |
| `FENGSHEN_BI_MCP_PSM` | `data.aeolus.data_set_query` | MCP 服务 PSM（内网 byted_mcp_client 形态） |
| `FENGSHEN_BI_MCP_REGION` | `cn` | 区域（仅支持中国区） |
| `FENGSHEN_BI_MCP_GATEWAY_URL` | 内置默认网关 | MCP over HTTP(S) SSE 网关地址（跨网/公网联调时覆盖） |
| `WEB_PORT` | `80` | Docker 前端对外端口（compose 用） |

### 7.2 前端变量（`web/.env`，均为非敏感配置）

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `VITE_BACKEND_URL` | _(空，走同源 `/api`)_ | 后端 API 地址。本地开发留空走 Vite 代理；独立部署前端时填 `http://服务器IP/api` 或域名 |
| `VITE_DISABLE_BACKEND` | _(空)_ | 置 `true` 时强制使用前端内置演示数据（后端不可用时的离线演示，不写任何密钥） |

> 风神 BI 凭证也可在前端「系统设置 → 数据源管理 → 风神 BI 授权配置」表单中填写，
> 由后端内存托管（密钥不明文回显、不写入浏览器 localStorage）；生产环境推荐用环境变量/密钥管理服务注入。
> **注意**：MCP SSE 网关地址与 JWT 换取端点已内置（见第 10 节），无需手填端点；但真实取数还需账号开通风神 MCP **邀测白名单**（每周二批量开通），且仅字节内网可达。开通前取数诚实回退 Mock。

---

## 8. 健康检查、系统状态与审计

### 8.1 后端健康检查（轻量探针）

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

### 8.2 统一系统状态（第五轮，首页/设置页共用）

```bash
curl http://localhost:5001/api/system/status
```

一次请求聚合五大块，供前端「系统状态与审计」面板渲染，**只回状态与脱敏信息，绝不回显密钥**：

| 字段块 | 内容 |
|--------|------|
| `backend` | 服务状态、版本号（当前 v1.5.0）、flask_env、运行模式（real-llm / 模板题库模式）、启动时间与已运行时长 |
| `llm` | 真实 LLM 是否启用、模型名/接入点、API host（只取域名，不含路径参数） |
| `datasource.items[]` | 每个数据源一行：`source_type`、`connection_status`（五态）、`is_current`、`message`（含下一步修复引导） |
| `audit` | 今日事件总数/成功/失败、最近事件时间、日志目录 |
| `permission` | `auth_enabled`（当前 false）与安全边界说明 |

前端入口：**工作台首页**数据源状态卡 + **系统设置页 →「系统状态与审计」面板**（服务/模型/审计三卡 + 数据源五态列表 + 最近审计事件表 + 权限边界说明，支持手动刷新；后端离线时显示黄色告警与启动指引）。

### 8.3 审计事件查询（第五轮）

```bash
curl "http://localhost:5001/api/audit/events?limit=20"
```

返回最近审计事件（倒序）、今日汇总与权限点清单。事件字段含：事件类型、结果（success/failed/pending）、数据源、是否经 SQL 确认、是否命中 Mock/兜底、SQL 来源（llm/dimension-template/preset-bank/bank_fallback 等）、行数、耗时、错误类型。事件已脱敏（密钥黑名单递归过滤，SQL 仅记长度 + 前 200 字符预览）。

> 该接口当前**未做权限拦截**（单用户演示版）；企业版接入登录后应限管理员，权限点已在 `audit.PERMISSION_POINTS` 预留（见第 14 节）。

### 8.4 数据源健康检查

```bash
curl http://localhost:5001/api/datasource/status
curl http://localhost:5001/api/enterprise-bi/status
```

响应包含当前数据源、所有已注册 Provider 的五态连接状态与可用性。

### 8.5 Docker 健康检查

两个容器均配置了 `HEALTHCHECK`：

- 后端：每 30 秒请求 `/api/health`
- 前端：每 30 秒请求 nginx `/health`

审计日志目录 `/app/logs/audit` 通过 compose 卷 `./logs:/app/logs` 持久化到宿主机。

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

| source_type | 名称 | is_real（静态就绪） | 连接状态（五态） | 说明 |
|-------------|------|---------|----------|------|
| `currentLocal` | 本地 SQLite（零售示例库） | **True** | real_ready | 4 张表、21,064 行，本地文件恒可达，完整可用 |
| `fengshenBi` | 风神 BI（企业级接入层） | 凭证配齐后为 True（仅表示「会尝试真实调用」） | mock（未配凭证）/ configured（已配待联调，白名单未开通时的当前态）/ real_ready（本进程真实调用成功后） | 授权、状态机、分阶段问数、MCP SSE+JWT 传输已就绪；真实取数待邀测白名单开通（见第 10 节） |

### 9.5 文件结构

```
src/datasource/
├── __init__.py              # 包入口（导出 get_provider / provider_registry / reset_provider）
├── base.py                  # DataSourceProvider 抽象基类（基础取数 + 企业 BI 扩展接口）
├── local_provider.py        # 本地 SQLite Provider（真实可用）
├── fengshenbi_provider.py   # 风神 BI Provider（MCP SSE transport + JWT 动态换取，见第 10 节）
└── factory.py               # 工厂：按 source_type 多实例缓存 Provider
```

风神 BI Provider 内部分五层（文件头部 docstring 有完整说明，联调时按层定位、勿跨层调用）：

```
1) 配置层  _cfg() / configure() / masked_config()     环境变量+运行时双通道；密钥脱敏、内存态
2) 校验层  validate_credentials() / _mcp_ready()      必填检查 + 真实握手探测
3) 请求层  _call_mcp_tool() / _McpSseSession / _raw_request() / _mcp_authorization()
            SSE 传输、JWT 动态换取、超时/错误归一化；真实成败只在本层判定
4) 映射层  _map_dataset() / _map_schema() / _map_query_result() / _to_aeolus_sql()
            风神响应 ↔ 统一契约互转；标准 SQL ↺ [数据集ID]/[列ID] 方言转译
5) 状态层  connection_status() / health_check() / _mcp_last_error / _mcp_real_ok
            唯一对外状态出口（五态）；前端徽标/审计/首页设置页均只读本层
```

OAuth/SSO 企业鉴权扩展点已预留：审计事件的 `user_id`/`tenant_id` 字段（当前固定 anonymous/null）、
`configure()` 的凭证键集合、`PERMISSION_POINTS` 权限点；接入登录体系后按租户存凭证、
JWT 由登录态换取、按权限点拦截即可，配置层/状态层契约不变。

### 9.6 五态连接状态机

风神 BI Provider 的 `connection_status()` 返回五种标准状态，前端（首页状态卡、设置页面板、企业 BI 页）据此渲染徽标。**第五轮起状态机严格诚实：静态配置就绪不等于真实连通。**

| 状态 | 含义 | 判定依据 | 取数行为 |
|------|------|----------|----------|
| `unconfigured` | 未配置任何凭证（基类兜底态，风神 provider 不返回） | 无凭证 | — |
| `mock` | 未配置凭证，运行于内置 Mock 演示 | 无任何凭证 | 返回明确标注 mock 的模拟结果 |
| `configured` | **已配置 · 待联调**：凭证静态就绪但本进程尚未真实验证；或最近一次真实调用失败（白名单未开通/网络不通/无权限） | `_mcp_ready()` 静态通过但无成功记录；或 `_mcp_last_error` 非空 | 自动回退 Mock 并在结果页标注原因与申请引导 |
| `verified` | OpenAPI 通道经「测试连接」真实握手成功 | `validate_credentials()` 握手 ok | 真实调用（OpenAPI 仅嵌入/治理，不含取数） |
| `real_ready` | **真实可用**：本进程内 MCP 真实握手或真实取数成功过，且最近一次未失败 | `_mcp_real_ok=True` 且 `_mcp_last_error` 为空 | MCP 真实取数；后续若调用失败自动降级回 `configured` |

> 关键区分：`is_real`（属性）表示「静态配置是否就绪、值得尝试真实调用」，供路由/审计使用；
> `connection_status()` 才是面向用户的**真实连通状态**——只有在本进程内发生过成功的真实 MCP 调用（测试连接或真实取数）后才会进入 `real_ready`，进程重启后回到 `configured`，待下次验证/取数自动升级。
> 这样杜绝「配了环境变量但白名单没开通，界面却显示真实可用」的误报。

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

## 10. 风神 BI 真实接入指南（OpenAPI vs MCP）

> **结论先行**：风神 BI 有两类开放接口，用途完全不同，切勿混用——
> - **OpenAPI（REST）**：面向**仪表盘嵌入**与**权限/资源治理**（用户组、资源授权、行列权限、角色、审批流、资源组、分析主题、数据集标签、仪表盘/报表列表）。**它不含任何「执行 SQL / 查询数据集数据 / 取数」端点。**
> - **MCP 服务（标准 MCP 协议 · SSE transport）**：才是真正的「**取数**」通道，通过数据集工具暴露查询能力。
>
> 本系统「企业 BI 问数」的**取数主链路对接 MCP**：工具契约、SQL 方言、SSE 传输、JWT 动态换取、白名单容错均已落地，并用**Python 标准库**（urllib + threading，零第三方依赖）在内网实测跑通了握手与鉴权。OpenAPI 仅保留占位，供未来嵌入/治理场景扩展。

### 10.1 风神 MCP 工具契约（`tools/list` 实测返回，非伪造）

代码位置：[fengshenbi_provider.py](file:///Users/bytedance/Desktop/graduation%20project/src/datasource/fengshenbi_provider.py) 中的 `MCP_TOOLS` 常量。实测 `tools/list` 返回 4 个工具，其中 3 个为业务取数工具：

| 本系统能力 | MCP 工具名 | 入参 | 说明 |
|------------|-----------|------|------|
| 数据集列表 | `get_data_set_by_appid` | `appId`, `Authorization` | 按项目 ID + 用户 JWT，返回该用户**有权限**的数据集列表 |
| 字段 Schema | `get_schema` | `dataset_id`, `Authorization` | 返回字段元数据，含 `descr`(口径)、`isAggregated`(是否已聚合)、`isPartitionField`(是否分区字段) |
| SQL 取数 | `query_data_by_sql` | `dataSetId`(整数), `sql`, `Authorization` | 在指定数据集上执行 SQL 返回结果集 |
| （官方示例） | `get_weather_eb9dbb2d` | — | 服务自带的天气演示工具，非业务能力，本系统不调用 |

> MCP **没有**独立的「自然语言问数」工具——NL→SQL 由本系统的 Agent/LLM 完成（这正是本项目语义层 Text-to-SQL 的价值），MCP 只负责执行。握手时 `serverInfo.name` 实测为「风神数据集查询」。

### 10.2 MCP SQL 书写规范（`_to_aeolus_sql()` 已自动转译）

风神 MCP 的 SQL 不是普通表名/列名，而是用 **ID 占位符**：

- **表名**：`FROM` 后写 `` `[数据集ID]` ``，例：`` from `[6036798]` ``
- **列名**：字段写 `` `[列ID]` ``，例：`` select `[1586871766173]` from `[6036798]` ``
- **分区字段强制筛选**：凡 `isPartitionField=1` 的字段**必须**在 `WHERE` 中筛选，否则服务端拒绝执行；缺省时自动注入 `` `[分区字段ID]`='${last_date}' ``（多个分区字段都要筛）。日期字段优先匹配用户输入同名，找不到再匹配 `pdate`。
- **已聚合字段**：`isAggregated=1` 的字段不要再套 `SUM/COUNT` 等聚合函数。

转译由 [_to_aeolus_sql](file:///Users/bytedance/Desktop/graduation%20project/src/datasource/fengshenbi_provider.py) 在执行前自动完成（表名→`[数据集ID]`、列名→`[列ID]`、分区字段补 `WHERE`），转译后的 SQL 会以 `transpiled_sql` 回传，便于审计与答辩展示。

### 10.3 真实传输机制：MCP SSE transport（已实测打通）

风神 MCP **不是**「单次 POST 读 JSON」，而是标准 **MCP SSE transport**（长连接 + 消息回推）。完整时序如下，代码落点为模块级类 `_McpSseSession`：

1. **建连**：`GET https://gg8z1crz.mcp.bytedance.net/sse`（请求头 `Accept: text/event-stream`），后台线程持续读流。
2. **拿 endpoint**：流上第一个事件为 `event: endpoint`，`data` 是回传地址 `https://<host>/message?sessionId=<sessionId>`。
3. **握手**：向该 endpoint `POST` 一个 `initialize` JSON-RPC（HTTP 返回 **202 Accepted**）；真正的握手结果**不从 POST 响应读**，而是稍后从 SSE 流上按 jsonrpc `id` 回推（`result.serverInfo`）。随后再 POST 一条无 `id` 的 `notifications/initialized`。
4. **调工具**：向同一 endpoint `POST` `tools/call`（同样 202），业务结果也从 SSE 流按 `id` 回推；流上无 `id` 的 keepalive 通知直接忽略。

实现要点（全部标准库，零第三方包）：`threading.Thread` 后台读 SSE 流 + `threading.Condition` 按 jsonrpc `id` 分发响应 + `threading.Event` 等待 endpoint 到达 + 一把串行锁保证调用顺序（天然契合 QPM ≤ 3）。

> 常量：`MCP_GATEWAY_DEFAULT = "https://gg8z1crz.mcp.bytedance.net/sse"`（未配 `FENGSHEN_BI_MCP_GATEWAY_URL` 时内置回退）。

### 10.4 鉴权：JWT 动态换取（已实测打通）

MCP 工具入参里的 `Authorization` 是一个**短期用户 JWT**（`"Bearer <jwt>"`），它**不是 HTTP 头，而是 tools/call 的 arguments 字段**。JWT 无需手工申请，由开发者凭证动态换取：

- **换取端点**：`POST https://data.bytedance.net/aeolus/api/v3/openapi/jwtToken`
- **请求头**：`Content-Type: application/json` + `Cookie: locale=zh-cn`（**无需**登录态 sessionid）
- **请求体**：

```json
{"metadata": {"clientId": "<ClientID>", "clientSecret": "<ClientSecret>",
              "proxyUser": "chenqi.2005", "expire": 1800}}
```

- **返回**：`{"code":"aeolus/ok","data":{"jwtToken":"<896字符>","proxyUser":"..."},"msg":"成功"}`
- 代码落点 `_fetch_mcp_jwt()`：静态 `FENGSHEN_BI_USER_JWT` 优先；否则用 `clientId + clientSecret + proxyUser` 自动换取，并在内存中缓存到 `expire - 120s`（提前 2 分钟过期，避免边界失效）。
- 调工具时由 `_mcp_authorization()` 统一拼成 `"Bearer " + jwt` 注入 arguments。

业务响应统一是风神信封 `{"code","msg","data"}`：`code == "aeolus/ok"` 时取 `data`；否则（含白名单错误）抛 `RuntimeError`，由上层容错。解析落点 `_parse_mcp_result()`。

| 凭证 | 环境变量 | 来源 / 说明 |
|------|----------|-------------|
| 项目 ID（`appId`） | `FENGSHEN_BI_WORKSPACE_ID`（回退 `APP_ID`） | 风神项目空间 ID；`get_data_set_by_appid` 入参（本项目用 `1000821`） |
| 开发者凭证 | `FENGSHEN_BI_CLIENT_ID` / `FENGSHEN_BI_CLIENT_SECRET` | 开发者后台「凭证管理」（CN）：`https://data.bytedance.net/aeolus#/developer/console/certification`，凭证类型选「用户」 |
| 代理用户 | `FENGSHEN_BI_PROXY_USER` | 换取 JWT 时的数据权限身份，如 `chenqi.2005`（即风神账号） |
| 静态 JWT（二选一） | `FENGSHEN_BI_USER_JWT` | 直接配置后优先使用，无需 client 凭证与 proxy_user |
| sophon api_key | `FENGSHEN_BI_SOPHON_API_KEY` | 仅内网 PSM/LLM 网关形态使用：`https://sophon-ai.bytedance.net/paas/token` |
| MCP SSE 网关 | `FENGSHEN_BI_MCP_GATEWAY_URL` | 内置默认 `…/mcp.bytedance.net/sse`，一般无需改；跨网才需覆盖 |

> 安全约束不变：所有密钥仅由**后端进程内存托管**（`.env` 被 `.gitignore` 忽略、不进 git），前端只脱敏回显、不持久化。

### 10.5 当前联调状态与唯一卡点（邀测白名单）

协议、鉴权、网络**均已在内网实测通过**：JWT 成功换取（HTTP 200 / 0.18s）、SSE `initialize` 握手成功、`tools/list` 返回 4 工具。但首个**业务**调用被白名单拦截：

```json
{"code": "aeolus/thirdParty/userNotInWhiteList",
 "msg": "需要添加为白名单用户才能使用该功能，请联系oncall"}
```

- **结论**：这不是代码/凭证/网络问题，而是账号 `chenqi.2005` 尚未开通 MCP **邀测白名单**。
- **处理**：需用户本人填飞书问卷登记，**每周二批量开通**、飞书通知：
  `https://bytedance.larkoffice.com/share/base/form/shrcnV2XPypCnz1jEAbmtoPXMCz`
- **开通后无需改代码**：`validate_credentials()` 探测到 `aeolus/ok` 即自动转 `real_ready`，datasets/schema/query 全链路自动切真实取数。
- **开通前的诚实行为**：状态显示「已配置 · 待开通邀测」+ 申请引导；数据集列表回退明确标注的 Mock（chips 不空白）；取数返回明确 error，**绝不伪造真实结果**。

### 10.6 部署形态与网络可达性

| 形态 | 网络 | 取数行为 |
|------|------|----------|
| **本机 / 字节内网开发**（当前联调形态） | 可达 jwtToken 接口与 SSE 网关 | 白名单开通后即**真实取数**；开通前回退 Mock |
| **公网阿里云 ECS**（生产演示） | **不可达**内网域名（jwtToken / SSE 均不通） | 网络报错后自动**回退 Mock**，演示链路不受影响 |
| 内网 PSM（官方基建，预留） | 需 `byted_mcp_client` SDK | 接入点 `_call_mcp_via_psm()`，当前显式抛「需内网 SDK」引导，不伪造导入 |

> 即：本项目在本机内网做真实联调；公网 ECS 始终保持「诚实 Mock」。若未来要让公网也真实取数，需在内网部署一个把 SSE MCP 暴露到公网的反向网关（注意数据安全与权限），再覆盖 `FENGSHEN_BI_MCP_GATEWAY_URL`。

### 10.7 配置项一览（环境变量 / 前端表单均可）

| 变量 | 用途 | 取数是否必填 |
|------|------|--------------|
| `FENGSHEN_BI_WORKSPACE_ID` | 项目 ID（MCP `appId`），本项目 `1000821` | ✅ |
| `FENGSHEN_BI_CLIENT_ID` / `CLIENT_SECRET` / `PROXY_USER` | 开发者凭证 + 代理用户，用于自动换 JWT | ✅（或配静态 JWT） |
| `FENGSHEN_BI_USER_JWT` | 静态用户 JWT（`Authorization`），配后优先 | 与 client 凭证二选一 |
| `FENGSHEN_BI_MCP_GATEWAY_URL` | MCP SSE 网关，内置默认值 | 一般无需改 |
| `FENGSHEN_BI_SOPHON_API_KEY` | 内网网关 sophon key | 仅 PSM 形态 |
| `FENGSHEN_BI_MCP_PSM` / `MCP_REGION` | PSM/区域，默认 `data.aeolus.data_set_query` / `cn` | 一般无需改 |
| `FENGSHEN_BI_BASE_URL` / `APP_ID` / `APP_SECRET` / `TOKEN` | OpenAPI 嵌入/治理用 | 取数非必需 |

### 10.8 代码落点与现状

| 位置 | 现状 |
|------|------|
| `_McpSseSession` | ✅ SSE transport 完整实现（建连/endpoint/握手/按 id 回推/串行锁），实测握手 + tools/list 通过 |
| `_fetch_mcp_jwt()` | ✅ jwtToken 动态换取 + 内存缓存，实测换到真实 JWT |
| `_call_mcp_tool()` / `_call_mcp_via_gateway()` | ✅ 走 SSE 会话，节流 + 自动注入 `Authorization`，已替换旧的单次 POST 实现 |
| `_parse_mcp_result()` | ✅ 解析 content[*].text + 风神信封，非 ok code（含白名单）抛错 |
| `list_datasets()` | ✅ MCP 失败记 `_mcp_last_error` 并回退 Mock，chips 不空白 |
| `validate_credentials()` | ✅ 直连底层探测，白名单/网络/凭证分类提示，不被 Mock 回退误判 |
| `_to_aeolus_sql()` | ✅ 表名/列名/分区转译；待真实数据集验证多表 JOIN 等边界 |
| `_call_mcp_via_psm()` | 显式引导（不伪造），供内网 SDK 形态 |
| `_map_schema()` | 已兼容 `descr/isAggregated/isPartitionField` 与多种字段 ID 命名，待真实响应对齐 |

> 上层 API 路由（`app_backend.py`，已把 `proxy_user` 加入配置白名单）、前端页面、五态状态机、plan→confirm 分阶段流程**均无需改动**。

### 10.9 接入步骤（Checklist）

1. 提交飞书问卷申请风神 MCP 邀测白名单，等待开通（每周二批量、飞书通知）。
2. 在开发者后台「凭证管理」创建**用户类型**凭证，拿到 `ClientID` / `ClientSecret`；确认代理用户（风神账号，如 `chenqi.2005`）。
3. 在 `.env`（或前端「系统设置 → 风神 BI」表单）配置：`FENGSHEN_BI_WORKSPACE_ID=1000821`、`FENGSHEN_BI_CLIENT_ID`、`FENGSHEN_BI_CLIENT_SECRET`、`FENGSHEN_BI_PROXY_USER`（网关用内置默认即可）。
4. 在**字节内网**机器启动后端，测试连接：

```bash
# 保存配置 + 测试连接（proxy_user 用于自动换 JWT）
curl -X POST http://localhost:5001/api/enterprise-bi/connect \
  -H "Content-Type: application/json" \
  -d '{"workspace_id":"1000821","client_id":"<cid>","client_secret":"<csec>","proxy_user":"chenqi.2005"}'
```

5. 白名单开通后，状态自动变为 `real_ready`、`is_real=true`；此后 plan→confirm 返回**真实**结果。开通前状态为「已配置 · 待开通邀测」，取数诚实回退 Mock。

### 10.10 已确认信息（实测 / 工作台核对）

| 项 | 已确认值 | 来源 |
|----|----------|------|
| JWT 换取端点 | `https://data.bytedance.net/aeolus/api/v3/openapi/jwtToken` | 官方文档 + 实测 200 |
| MCP SSE 网关 | `https://gg8z1crz.mcp.bytedance.net/sse` | 实测拿到 endpoint 事件 |
| `serverInfo.name` | `风神数据集查询` | initialize 握手回推 |
| 项目 `appId` | `1000821`（项目「生活服务」，数据集最多） | 风神工作台 URL |
| 代理用户 | `chenqi.2005` | 凭证示例 / 风神账号 |
| 工具列表 | `get_data_set_by_appid` / `get_schema` / `query_data_by_sql` / `get_weather_eb9dbb2d` | tools/list 实测 |
| 仪表盘链接 | `…/dashboard/1851618?appId=1000821&sheetId=2681754` | 用户提供，留档 |

### 10.11 验收标准

1. 白名单开通后：`curl /api/enterprise-bi/status` 中 `connection_status` 为 `real_ready`、`is_real` 为 `true`、`details.channel` 为 `mcp`
2. `GET /api/enterprise-bi/datasets` 返回真实数据集（无 mock 标记）
3. `GET /api/enterprise-bi/schema?dataset_id=...` 返回真实字段（含字段 ID / 分区标记）
4. 「企业 BI 问数」页 plan→confirm 返回**真实**结果（无黄色 Mock 横幅），结果中可见转译后的 `transpiled_sql`
5. 凭证在前端始终脱敏显示，刷新页面后密钥不明文回显
6. **白名单未开通 / 公网 ECS** 下：状态诚实显示「待开通邀测 / 待内网联调」，取数回退 Mock 且不报错（当前已满足）

---

## 11. API 接口清单

### 系统

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 后端健康检查（轻量探针，Docker healthcheck 用） |
| GET | `/api/system/status` | **统一系统状态**（第五轮）：服务/LLM/数据源五态/审计摘要/权限边界，首页与设置页面板共用 |
| GET | `/api/audit/events?limit=N` | **最近审计事件**（第五轮）：倒序事件 + 今日汇总 + 权限点清单（脱敏，暂未做权限拦截） |
| GET | `/api/help` | 技能与指令列表 |
| GET | `/api/db-health` | 数据集健康度看板 |

### 对话（含分阶段问数）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/chat` | 非流式问答（发送即取数的降级链路，仍全程审计） |
| POST | `/api/chat/stream` | SSE 流式问答 |
| POST | `/api/chat/plan` | **阶段一**：需求理解 + SQL 草案（只生成不执行，返回 plan_id） |
| POST | `/api/chat/confirm` | **阶段二**：`confirmed=true` + plan_id 才执行用户确认过的 SQL |
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

---

## 12. 审计与可追踪（第五轮）

### 12.1 设计原则

不引入重型日志平台，用「**JSONL 文件按天滚动 + 进程内环形缓冲**」双写搭好可追踪骨架，后续可平滑替换为 ELK/Loki：

- **落盘**：`logs/audit/audit-YYYYMMDD.jsonl`（目录由 `AUDIT_LOG_DIR` 配置，Docker 内 `/app/logs/audit` 已挂卷），每行一个事件 JSON，追加写、按天自动切分；
- **快查**：进程内保留最近 500 条（多 worker 部署时各 worker 独立，以 JSONL 文件为准）；
- **安全**：密钥黑名单（api_key/token/jwt/secret/password 等）递归脱敏；SQL 不记全文，只记长度 + 前 200 字符预览；问题文本截断 200 字符；
- **容错**：审计写入全程 try/except，任何审计故障都不阻断问数主链路。

代码落点：[audit.py](file:///Users/bytedance/Desktop/graduation%20project/src/utils/audit.py)。

### 12.2 事件类型

| 事件 kind | 触发时机 | result 取值 |
|-----------|----------|-------------|
| `chat.plan` | 本地问数生成 SQL 草案（不执行） | pending / failed |
| `chat.confirm` | 用户确认草案后执行 | success / failed |
| `chat.auto` | 发送即取数（自动链路） | success / failed |
| `ent.plan` | 企业 BI 草案生成 | pending / failed |
| `ent.confirm` | 企业 BI 确认后取数 | success / failed |
| `ent.connect_test` | 风神「测试连接」 | success / pending |

每条事件记录：时间、事件类型、结果、`user_id`（当前固定 `anonymous`，登录体系预留）、`tenant_id`（预留 null）、
问题、数据源、是否经 SQL 确认（`staged_confirmed`）、SQL 来源（`sql_source`）、是否命中 Mock/兜底（`mock_hit`）、
连接状态、行数、耗时、错误类型与错误信息（截断）、SQL 长度/预览。

### 12.3 查看方式

```bash
# 接口（设置页「系统状态与审计」面板同源）
curl "http://localhost:5001/api/audit/events?limit=20"

# 直接看落盘文件（grep/jq 均可，每行一个 JSON）
tail -f logs/audit/audit-$(date +%Y%m%d).jsonl
```

前端：**系统设置 →「系统状态与审计」→ 最近审计事件表**（时间/事件/数据源/确认/结果/取数六列），
取数列以绿色「真实」/ 琥珀色「Mock/兜底」徽标区分。

---

## 13. 能力清单与真实性边界

> 原则：**不伪造企业能力**。以下三档清单明确区分「真实可用」「演示态」「接入预留」。

### 13.1 ✅ 已真实可用（本地/团队部署即可依赖）

| 能力 | 说明 |
|------|------|
| 本地问数全链路 | 语义层 Text-to-SQL（指标定义/时间语义/口径注入）、SQL 只读执行、自修复重试、题库兜底 |
| 分阶段确认 | 需求确认 → SQL 草案 → 用户确认 → 受控执行，确认前绝不执行 SQL |
| 分析工作台 | 执行摘要/核心发现/数据口径/SQL 依据/结果表/图表/风险提醒七分区，CSV 导出、改口径重跑、结果二次出图 |
| 工作台首页 | 数据源状态可见、工作流入口、最近分析、示例问题 |
| 数据源五态状态机 | 五态诚实标注，首页 + 设置页 + 企业 BI 页徽标一致；异常态给出下一步修复引导 |
| 系统状态面板 | `/api/system/status` 统一聚合，设置页可见服务版本/运行模式/模型 host/数据源五态/审计摘要 |
| 审计与可追踪 | 6 类事件结构化记录、JSONL 落盘、脱敏、接口查询（第 12 节） |
| 配置规范化 | 前后端变量分区、`.env.example` 中文注释、密钥不进前端包 |
| 部署骨架 | Dockerfile ×2、docker-compose.prod.yml、nginx（SSE 反代 + SPA）、systemd、gunicorn、健康检查 |

### 13.2 🟡 演示态（链路真实、数据为模拟或本地样例）

| 能力 | 边界 |
|------|------|
| 风神 BI 取数结果 | 需求识别与 SQL 草案为真实 LLM/语义能力；白名单未开通时最终取数**回退明确标注的 Mock 数据**（黄色横幅 + mock_note），绝不冒充真实 |
| 未配置 LLM 时的问数 | SQL 出自内置题库/维度模板（审计 `sql_source` 如实记录），但对本地 SQLite 的查询执行是真实的 |
| 本地零售数据集 | retail.db 21,064 行为演示数据，仅用于方法验证与口径核对，不代表真实企业经营数据 |
| 图表生成页 | 支持真实 CSV/粘贴数据；内置示例为演示数据 |

### 13.3 🔧 企业接入预留（骨架已备，待真实凭证/环境/联调）

| 能力 | 现状 | 落地还需什么 |
|------|------|--------------|
| 风神 MCP 真实取数 | 协议/鉴权/SSE 传输/方言转译/容错已实现并在内网实测握手通过；状态机留好 real_ready 升级路径 | 账号开通 MCP 邀测白名单（每周二批量）；公网 ECS 需内网网关注点（第 10 节） |
| 用户登录与权限 | 无登录体系；审计 `user_id/tenant_id`、`PERMISSION_POINTS`、provider OAuth 扩展点已预留 | 接入 OAuth/SSO，按租户存凭证、按权限点拦截（第 14 节） |
| 审计日志平台 | JSONL 文件 + 接口查询 | 接 ELK/Loki 或对象存储归档 |
| OpenAPI 嵌入/治理 | 端点与映射层占位 | 真实 base_url + token 后联调 |

### 13.4 如何判断当前处于 Mock / 待联调 / 真实模式

1. **看界面徽标**：首页与设置页风神卡片——「Mock 演示 · 待配置」（未配凭证）/「已配置 · 待联调」（配了未验证或白名单未通）/「MCP 已连通 · 真实可用」（本进程真实调用成功）；
2. **查接口**：`curl /api/system/status` 看 `datasource.items[].connection_status` 与 `message`；`/api/enterprise-bi/status` 看 `details.mcp_real_ok` / `mcp_last_error`；
3. **看结果标注**：问数结果页黄色横幅/`mock_note` 表示本次取数为回退 Mock；审计表取数列「Mock/兜底」表示非完全真实链路；
4. **看审计字段**：`sql_source=semantic-llm/llm` 且 `mock_hit=false` 为全真实；`dimension-template/preset-bank/bank_fallback` 为兜底链路。

---

## 14. 权限与安全边界

> **当前版本没有登录与权限体系**（单用户演示 / 团队内部部署），以下为明确的安全边界与企业版预留，不伪造「已支持权限管理」。

### 14.1 已落实的安全措施

- SQL 执行器**只读模式**（`mode=ro`），分阶段问数在用户确认前绝不执行 SQL；
- 所有密钥仅后端 `.env` / 进程内存持有，前端只脱敏回显（`••••••` + 末四位），不写 localStorage、不进 VITE_ 打包变量；
- 审计事件脱敏落盘，不含密钥与 SQL 全文；
- 状态接口只回显模型名/API host，不回显路径参数与凭证；
- ICP 备案通过前不在 DNS 添加解析记录；公网 ECS 不直连内网服务，失败诚实回退而非伪造。

### 14.2 企业版应受权限控制的操作（预留点）

权限点定义在 [audit.py](file:///Users/bytedance/Desktop/graduation%20project/src/utils/audit.py) 的 `PERMISSION_POINTS`（均标记 `implemented: False`）：

| 权限点 | 操作 | 建议角色 |
|--------|------|----------|
| `chat.execute` | 发起问数 / 执行 SQL | 全员（只读查询） |
| `ent.credential.write` | 保存/修改风神 BI 凭证、测试连接 | 管理员 / 数据治理 |
| `datasource.manage` | 数据源切换与注册管理 | 管理员 |
| `audit.read` | 查看审计事件与系统状态面板 | 管理员 / 数据治理 |

落地方式：接入 OAuth/SSO 网关或 Flask 中间件后，按 `user_id`（审计字段已预留）鉴权并在对应路由前拦截；
provider 凭证改为按 `tenant_id` 隔离存储，`_mcp_authorization()` 的用户 JWT 改由登录态令牌换取。
前端设置页「系统状态与审计」面板底部已用紫色提示框向用户明示该边界。
