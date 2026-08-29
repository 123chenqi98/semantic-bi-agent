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

## 10. 风神 BI 真实接入指南（OpenAPI vs MCP）

> **结论先行**：风神 BI 有两类开放接口，用途完全不同，切勿混用——
> - **OpenAPI（REST）**：面向**仪表盘嵌入**与**权限/资源治理**（用户组、资源授权、行列权限、角色、审批流、资源组、分析主题、数据集标签、仪表盘/报表列表）。**它不含任何「执行 SQL / 查询数据集数据 / 取数」端点。**
> - **MCP 服务（标准 MCP 协议，Model Context Protocol）**：才是真正的「**取数**」通道，通过 3 个数据集工具暴露查询能力。
>
> 本系统「企业 BI 问数」的**取数主链路对接 MCP**（已把工具契约、SQL 方言、鉴权、网关适配固化进代码）；OpenAPI 仅保留占位，供未来嵌入/治理场景扩展。

### 10.1 风神 MCP 工具契约（已固化进代码，非伪造）

代码位置：[fengshenbi_provider.py](file:///Users/bytedance/Desktop/graduation%20project/src/datasource/fengshenbi_provider.py) 中的 `MCP_TOOLS` 常量。

| 本系统能力 | MCP 工具名 | 入参 | 说明 |
|------------|-----------|------|------|
| 数据集列表 | `get_data_set_by_appid` | `appId`, `Authorization` | 按项目 ID + 用户 JWT，返回该用户**有权限**的数据集列表 |
| 字段 Schema | `get_schema` | `dataset_id`, `Authorization` | 返回字段元数据，含 `descr`(口径)、`isAggregated`(是否已聚合)、`isPartitionField`(是否分区字段) |
| SQL 取数 | `query_data_by_sql` | `dataSetId`, `sql`, `Authorization` | 在指定数据集上执行 SQL 返回结果集 |

> MCP **没有**独立的「自然语言问数」工具——NL→SQL 由本系统的 Agent/LLM 完成（这正是本项目语义层 Text-to-SQL 的价值），MCP 只负责执行。

### 10.2 MCP SQL 书写规范（`_to_aeolus_sql()` 已自动转译）

风神 MCP 的 SQL 不是普通表名/列名，而是用 **ID 占位符**：

- **表名**：`FROM` 后写 `` `[数据集ID]` ``，例：`` from `[293910]` ``
- **列名**：字段写 `` `[列ID]` ``，例：`` select `[1586871766173]` from `[293910]` ``
- **分区字段强制筛选**：凡 `isPartitionField=1` 的字段**必须**在 `WHERE` 中筛选，否则服务端拒绝执行；缺省时自动注入 `` `[分区字段ID]`='${last_date}' ``（多个分区字段都要筛）。日期字段优先匹配用户输入同名，找不到再匹配 `pdate`。
- **已聚合字段**：`isAggregated=1` 的字段不要再套 `SUM/COUNT` 等聚合函数。

转译由 [_to_aeolus_sql](file:///Users/bytedance/Desktop/graduation%20project/src/datasource/fengshenbi_provider.py) 在执行前自动完成（表名→`[数据集ID]`、列名→`[列ID]`、分区字段补 `WHERE`），转译后的 SQL 会以 `transpiled_sql` 回传，便于审计与答辩展示。

### 10.3 鉴权与凭证

| 凭证 | 环境变量 | 来源 / 说明 |
|------|----------|-------------|
| 项目 ID（`appId`） | `FENGSHEN_BI_WORKSPACE_ID`（回退 `APP_ID`） | 风神项目空间 ID；`get_data_set_by_appid` 入参 |
| 用户 JWT | `FENGSHEN_BI_USER_JWT` | MCP 的 `Authorization` 入参，**按该用户的数据权限**返回结果 |
| 应用凭证 | `FENGSHEN_BI_CLIENT_ID` / `FENGSHEN_BI_CLIENT_SECRET` | 开发者后台（CN）申请：`https://data.bytedance.net/aeolus#/developer/console/certification` |
| sophon api_key | `FENGSHEN_BI_SOPHON_API_KEY` | 内网 LLM/MCP 网关鉴权：`https://sophon-ai.bytedance.net/paas/token` |
| MCP 网关 | `FENGSHEN_BI_MCP_GATEWAY_URL` | 公网/跨网部署时的 MCP over HTTP(S) 网关地址 |

> 安全约束不变：所有密钥仅由**后端进程内存托管**，前端只脱敏回显、不持久化、不进 git。

### 10.4 四个硬性前提（限制，务必知晓）

1. **邀测试用制**：风神 MCP 目前为邀测阶段，需填飞书问卷登记，每周二批量开通、飞书通知。
   登记表：`https://bytedance.larkoffice.com/share/base/form/shrcnV2XPypCnz1jEAbmtoPXMCz`
2. **仅内网可达**：官方接入方式是字节内网基建 `byted_mcp_client_with_server_psm(['data.aeolus.data_set_query'], region='cn')` + sophon api_key。**公网阿里云 ECS 无法直连**内网 PSM。
3. **按用户鉴权**：除 clientId/clientSecret 外，每次取数都要传**用户 JWT**，按该用户数据权限返回。
4. **限流与区域**：QPM ≤ 3（每分钟最多 3 次，代码已在 `_mcp_throttle()` 做进程内节流）、仅中国区、大表超资源会失败；连接超时 10s、请求超时 600s。

### 10.5 两种部署形态

**形态 A —— 内网 / 堡垒机 / VPN（官方 PSM 方式）**
在能访问字节内网的机器运行，使用 `byted_mcp_client` 走 PSM 服务发现。代码接入点为 `_call_mcp_via_psm()`（当前显式抛出"需内网 SDK"引导，不伪造导入）。填入内网 SDK 调用即可，上层逻辑无需改动。

**形态 B —— 公网 ECS / 跨网（HTTP 网关方式，推荐用于本项目演示）**
在内网部署一个把 MCP 暴露为 HTTPS 的 **MCP over HTTP 网关**（标准 MCP Streamable HTTP / JSON-RPC），然后配置 `FENGSHEN_BI_MCP_GATEWAY_URL`。Provider 用**标准库 urllib** 直接发起 MCP `tools/call` JSON-RPC（无需任何第三方依赖），响应兼容普通 JSON 与 SSE 流。

> 未配置网关且非内网环境时：凭证可保存、状态为「**已配置 · 待内网联调**」，取数**回退明确标注的 Mock**，绝不伪造连通。这保证了公网 ECS 演示链路始终可用且诚实。

### 10.6 配置项一览（环境变量 / 前端表单均可）

| 变量 | 用途 | 取数是否必填 |
|------|------|--------------|
| `FENGSHEN_BI_WORKSPACE_ID` | 项目 ID（MCP `appId`） | ✅ |
| `FENGSHEN_BI_USER_JWT` | 用户 JWT（`Authorization`） | ✅（或用 client 凭证换） |
| `FENGSHEN_BI_CLIENT_ID` / `CLIENT_SECRET` | 开发者后台应用凭证 | JWT 的替代/补充 |
| `FENGSHEN_BI_SOPHON_API_KEY` | 内网网关 sophon key | 内网形态需要 |
| `FENGSHEN_BI_MCP_GATEWAY_URL` | MCP over HTTP 网关 | 公网/跨网形态必填 |
| `FENGSHEN_BI_MCP_PSM` / `MCP_REGION` | PSM/区域，默认 `data.aeolus.data_set_query` / `cn` | 一般无需改 |
| `FENGSHEN_BI_BASE_URL` / `APP_ID` / `APP_SECRET` / `TOKEN` | OpenAPI 嵌入/治理用 | 取数非必需 |

### 10.7 联调时可能需要微调的位置

| 位置 | 现状 | 联调时做什么 |
|------|------|--------------|
| `MCP_TOOLS` | ✅ 工具名/入参已按文档填实 | 一般无需改 |
| `_to_aeolus_sql()` | ✅ 表名/列名/分区转译已实现 | 按真实 SQL 方言边界补充（如多表 JOIN） |
| `_call_mcp_via_gateway()` | 已实现标准 MCP JSON-RPC | 按网关要求补 `initialize` 握手 / 鉴权头名 |
| `_call_mcp_via_psm()` | 显式引导（不伪造） | 在内网用 `byted_mcp_client` 实现真实调用 |
| `_map_schema()` | 已兼容 `descr/isAggregated/isPartitionField` 与多种字段 ID 命名 | 按真实响应键名对齐字段 ID / 分区标记 |
| `is_real` / `_mcp_ready()` | ✅ 自动判定 | 无需手改，网关+凭证就绪即 `real_ready` |

> 上层 API 路由（`app_backend.py`）、前端页面、五态状态机、plan→confirm 分阶段流程**均无需改动**。

### 10.8 接入步骤（Checklist）

1. 提交飞书问卷申请风神 MCP 试用，等待开通（每周二批量）。
2. 在开发者后台申请 `clientId` / `clientSecret`；准备一个有权限的**用户 JWT**；内网形态再申请 sophon api_key。
3. 选择部署形态：内网机器（形态 A）或部署 MCP HTTP 网关（形态 B）。
4. 配置环境变量（或前端「系统设置 → 风神 BI」表单）：项目 ID、用户 JWT（或 client 凭证）、网关地址。
5. 测试连接：

```bash
# MCP 取数凭证示例（保存 + 测试连接）
curl -X POST http://localhost:5001/api/enterprise-bi/connect \
  -H "Content-Type: application/json" \
  -d '{"workspace_id":"293910","user_jwt":"<用户JWT>","client_id":"<cid>","client_secret":"<csec>","mcp_gateway_url":"https://<你的MCP网关>"}'
```

6. 状态变为 `real_ready`、`is_real=true` 即接通；此后 plan→confirm 返回**真实**结果。

### 10.9 已从现有仪表盘链接确认的信息

用户已提供可访问的风神仪表盘链接：

```text
https://data.bytedance.net/aeolus/pages/dashboard/1851618?appId=1000821&sheetId=2681754
```

| 项 | 已确认值 | 说明 |
|----|----------|------|
| 站点 Origin | `https://data.bytedance.net` | 风神站点来源（OpenAPI 域名参考） |
| `appId` | `1000821` | 可作项目 ID（MCP `appId`）的联调核对参考 |
| `sheetId` / `dashboard_id` | `2681754` / `1851618` | 关联对象 ID，留档排查用 |

> 注意：前台页面参数 ≠ 接口契约。`clientSecret`、`user_jwt`、MCP 网关地址、真实字段 ID 仍须通过申请/联调获得，代码中不做臆造。

### 10.10 验收标准

1. `curl /api/enterprise-bi/status` 中 `connection_status` 为 `real_ready`、`is_real` 为 `true`、`details.channel` 为 `mcp`
2. `GET /api/enterprise-bi/datasets` 返回真实数据集（无 mock 标记）
3. `GET /api/enterprise-bi/schema?dataset_id=...` 返回真实字段（含字段 ID / 分区标记）
4. 「企业 BI 问数」页 plan→confirm 返回**真实**结果（无黄色 Mock 横幅），结果中可见转译后的 `transpiled_sql`
5. 凭证在前端始终脱敏显示，刷新页面后密钥不明文回显
6. 未接通环境（如公网 ECS 无网关）下，状态诚实显示「待内网联调」，取数回退 Mock 且不报错

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
