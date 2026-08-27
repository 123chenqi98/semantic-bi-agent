# 面向经营分析场景的指标语义约束智能分析 Agent 设计与实现

> 本科毕业设计 · 数据科学与大数据技术
> 作者：陈琦 · 指导教师：（待填写）

---

## 📖 项目概述

本项目面向零售/电商经营分析场景，设计并实现一个**基于指标语义约束层**的智能问数 Agent，
解决普通 Text-to-SQL 系统在**业务口径错位**（GMV 是否含退款、复购率怎么定义、"上月"是哪段时间）上的高频错误问题。

通过两层增强：

1. **语义层（Semantic Layer）**：将 8 大核心经营指标（销售额/订单量/客单价/新客数/复购率/环比/同比/占比）以结构化 JSON 形式沉淀，
   包含**定义、SQL 计算模板、同义词、易混淆口径、时间锚点映射**等 5 类语义元数据。
2. **Agent 工作流**：`任务理解 → 指标语义匹配 → 执行规划 → SQL 生成(受模板约束) → 结果校验(自修正) → 洞察输出`，
   在生成 SQL 前后各设一道语义守门。

最终在 25 题对照实验上验证：
- 基线系统（纯 LLM + DDL）结果正确率 **44%（11/25）**
- 实验组（本项目）结果正确率 **100%（25/25）**
- SQL 执行成功率：两组均 100% — 说明基线的问题是"能执行但口径错"，而不是"语法错"，
  更凸显语义约束在**业务语义一致性**层面的不可替代性。

---

## ✨ 核心亮点

| 能力 | 说明 |
|---|---|
| 🎯 **8 大指标语义建模** | M01~M08，每个含定义/计算模板/同义词/易混淆警示 4 类信息 |
| 🔐 **语义 SQL 模板** | 客单价必须 `SUM/DISTINCT order_id`、所有金额必须 `pay_status='已支付'` |
| 🗓️ **严格时间锚点映射** | 假设今天=2026-07-01，"上月"固定 2026-06-01~30，禁用 `date('now')` |
| ✅ **结果自校验 & 自修正** | 5 类校验规则（过滤/去重/列顺序/除零/时间硬编码），不达标自动重写 |
| 🧪 **25 题对照实验** | 5 问题类型 × 5 指标 × 3 难度分级，报告+逐题明细双视图呈现 |
| 🎨 **企业级前端工作台** | React 19 + Tailwind v4 + Recharts，字节 AI 工具审美（品牌紫 #B758ED） |
| ⚡ **图表生成助手** | 独立工作台，支持 7 种图表 + 5 种配色 + CSV 粘贴/上传 + 智能推荐 |
| 🚀 **@技能 / /指令系统** | 输入 `@` 唤起 5 种技能（词典/图表/时间解析/SQL优化/实验）、`/` 唤起 5 条指令 |

---

## 🧱 技术栈

### 后端（Python 3.11+ / Flask）
| 组件 | 选型 |
|---|---|
| Web 框架 | Flask |
| 数据库 | SQLite 3（零售经营 4 张表：customer / order_item / product / date_dim） |
| Text-to-SQL 核心 | 自研 baseline + semantic 双 Pipeline，可对接任意 LLM |
| 语义定义 | JSON（`src/semantic_layer/metric_semantics.json`）+ 语义加载器 |
| 评测框架 | `src/evaluation/` 逐题执行 → CSV → Markdown 报告生成器 |

### 前端（Vite + React 19 + TypeScript）
| 组件 | 选型 |
|---|---|
| 构建 | Vite 8 |
| 语言 | TypeScript 6 |
| 样式 | Tailwind CSS v4（Inline fontSize + 4px 网格设计 Token） |
| 图表 | Recharts 3（支持瀑布图/漏斗图自定义实现） |
| 图标 | Lucide React |
| 代码高亮 | react-syntax-highlighter（SQL 关键字/字符串/注释分色） |
| 状态管理 | React Context + useReducer（ChatContext，支持多会话 + 跨页传参） |

---

## 📁 目录结构

```
graduation-project/
├── data/
│   ├── raw/                    # 原始 CSV（customer/order_item/product/date）
│   ├── processed/retail.db     # SQLite 数据库（4 张已清洗表）
│   └── samples/                # 25 题测试问题集（JSON + Markdown）
│
├── src/
│   ├── semantic_layer/
│   │   ├── metric_semantics.json   # 8 指标语义定义（核心资产）
│   │   ├── schema.sql              # 建表 DDL
│   │   ├── schema_commented.sql    # 带中文注释的 DDL
│   │   └── semantic_loader.py      # 语义元数据加载器
│   │
│   ├── agent/
│   │   ├── baseline_text2sql.py    # 基线：直接 LLM + DDL → SQL
│   │   └── semantic_text2sql.py    # 实验：任务理解→语义匹配→规划→SQL→校验→洞察
│   │
│   ├── evaluation/                 # 25 题对照实验工具链
│   │   ├── run_baseline_eval.py    # 基线跑榜
│   │   ├── run_experiment_eval.py  # 实验组跑榜
│   │   ├── check_llm.py / validate_sql.py
│   │   └── compare_report.py       # 生成 baseline vs experiment 对比报告
│   │
│   ├── data_processing/
│   │   ├── generate_sample_data.py # 生成模拟零售经营数据
│   │   └── init_db.py              # 将 CSV 导入 SQLite
│   │
│   ├── demo/app.py                 # Flask 后端入口（可选，已内置 Web 前端纯前端 Mock 演示）
│   └── utils/
│       ├── llm_client.py           # LLM 客户端（可替换豆包/DeepSeek）
│       └── sql_executor.py         # SQLite 执行器（超时/只读）
│
├── web/                            # 前端（独立单页应用 · 全 Mock 可运行）
│   └── src/
│       ├── components/
│       │   ├── Layout/             # Header(93px) + Sidebar(268px)
│       │   ├── Chat/               # 消息卡片 + ChatInput（@/指令菜单）
│       │   └── common/             # SQLBlock + ResultTable
│       ├── pages/
│       │   ├── ChatPage.tsx             # AI 对话（首页）
│       │   ├── ChartAssistantPage.tsx   # 图表生成助手工作台
│       │   ├── DictionaryPage.tsx       # 指标词典
│       │   ├── EvaluationPage.tsx       # 25 题实验评测
│       │   └── SettingsPage.tsx         # 系统设置
│       ├── mock/
│       │   ├── data.ts             # 指标/时间语义/25 题结果 Mock
│       │   └── chartAssistant.ts   # 图表推荐 + 6 种图表生成
│       ├── store/ChatContext.tsx   # 全局状态（会话/跨页 pending 数据）
│       └── types/index.ts
│
├── outputs/reports/                # 实验产出：对比报告 + 逐题 CSV
├── docs/                           # 开题报告 / 实验设计 / 指标语义规则 / 字段说明
├── .env.example                    # 环境变量模板（LLM API Key / DB 路径）
└── .gitignore
```

---

## 🧪 对照实验结果

> 数据截止：2026-07-01 · 数据范围 2025-01-01 ~ 2026-06-30

| 维度 | 基线系统（Baseline） | 本系统（Experiment） |
|---|:---:|:---:|
| SQL 执行成功率 | 100%（25/25） | 100%（25/25） |
| 结果正确率（业务口径对齐） | **44%（11/25）** | **100%（25/25）** |
| 平均修正次数 | 2.36 次（人工修正） | 0.40 次（系统自修正） |
| 人工修正成本（相对值） | 100% | 14% |

典型口径错误类型（基线 vs 实验组）：

| # | 典型错误 | 基线 | 实验组 |
|---|---|:---:|:---:|
| 1 | `date('now')` 动态时间函数 → 空值 | ❌ | ✅ 硬编码具体日期 |
| 2 | 新客定义误用 register_date（注册） | ❌ | ✅ 首次支付日期 MIN(order_date) |
| 3 | 客单价误用 AVG(amount)（商品单价） | ❌ | ✅ 销售额 / COUNT(DISTINCT order_id) |
| 4 | 复购率跨月追踪新客（错误定义） | ❌ | ✅ 按月内下单≥2次统计 |
| 5 | 维度列顺序错位（渠道/季度反了） | ❌ | ✅ 按问题中的出现顺序输出 |

完整逐题明细见 [docs/实验设计.md](docs/实验设计.md) 与前端"实验评测"页。

---

## 🖥️ 系统功能页

启动前端后可通过左侧侧边栏切换 5 个页面：

### 1. AI 对话（首页）· `chat`
- 自然语言问数 → 匹配指标 + SQL 对比（基线/语义优化后双栏折叠） + 查询结果表 + 分析说明
- **`@` 技能系统**：
  - `@指标词典 销售额` → 对话内直接查询指标定义、SQL 模板、同义词、易混淆口径
  - `@图表生成` → 立即跳转图表助手，自动把最近一次查询结果转 CSV 并生成图
  - `@时间解析 [问题]` → 附加时间语义增强标签，严格映射时间锚点
  - `@SQL优化 [问题]` → 强制显示基线 SQL 对比 + 4 条 SQL 优化建议卡
  - `@对比实验` → 跳转到 25 题对照评测
- **`/` 快捷指令**：`/help`（帮助卡）、`/clear`（新对话）、`/example`（示例问题）、`/chart`、`/dict`

### 2. 图表生成助手 · `chartAssistant`
独立工作台，非聊天视图：
- **7 种图表类型**：智能推荐 / 柱状图 / 折线图 / 饼图 / 散点图 / **瀑布图** / **漏斗图**
- **智能推荐逻辑**：关键词匹配 → 趋势→折线、占比→饼、转化→漏斗、关系→散点、增减→瀑布、对比→柱状
- **5 种配色方案**：默认商务 / 低饱和 / 糖果色 / 马卡龙 / 高对比
- **数据源**：CSV 粘贴 + 文件上传，6 个一键示例场景
- **结果区**：真实 Recharts 渲染 + 自动摘要 + 数据洞察 + 推荐原因标签

### 3. 指标词典 · `dictionary`
- 全局口径规则（7 条）
- 时间语义映射表（"上月"、"近6个月"、"Q1~Q4"等，含 SQL 写法）
- 8 大指标展开卡片：定义 / SQL 计算模板 / 同义词 / 易混淆警示（黄底）

### 4. 实验评测 · `evaluation`
- 4 张统计卡（SQL 执行率 / 基线正确率 / 实验正确率 / 提升幅度）+ 高亮卡（紫色渐变）
- Recharts 两组对照柱状图（按难度 / 按问题类型）
- 25 题逐题明细表（难度 pill + 错误原因 + ✅/❌）+ 典型问题对照案例卡（红/绿背景色区分）

### 5. 系统设置 · `settings`
- 技术栈信息、LLM 配置、数据库连接路径、数据截止日期等展示卡

---

## 🚀 快速开始

### 环境要求
- **Node.js 20+**（推荐 22 LTS）
- **Python 3.11+**（跑后端/评测需要）
- **SQLite 3**（Python 内置）

### 1. 启动前端（开箱即用，全 Mock 演示）

```bash
cd web
npm install            # 安装 Vite / React / Recharts / Tailwind v4
npm run dev            # 启动在 http://localhost:5173
```

打开后默认是 AI 对话首页，可直接输入 `@指标词典 销售额`、`/help`、点击预设问题体验。

### 2. 构建生产版前端

```bash
cd web
npm run build          # 输出到 web/dist/
npm run preview        # 本地预览构建产物
```

### 3. 初始化数据库 + 跑后端（可选）

```bash
# 1. 准备环境变量
cp .env.example .env
# 编辑 .env：填入 LLM API Key / 数据库路径

# 2. 导入 CSV 到 SQLite（首次）
cd src/data_processing
python init_db.py

# 3. 生成模拟样本（可选，已默认附带）
python generate_sample_data.py

# 4. 跑基线 25 题评测
cd ../evaluation
python run_baseline_eval.py          # → outputs/reports/baseline_results.csv

# 5. 跑实验组 25 题评测
python run_experiment_eval.py        # → outputs/reports/experiment_results.csv

# 6. 生成对比报告
python compare_report.py             # → outputs/reports/comparison_report.md
```

### 4. 启动 Flask 后端（对接真实 LLM）

```bash
cd src/demo
pip install -r ../../requirements.txt  # flask / sqlite3 等
python app.py                          # 默认 http://localhost:5000
```

> 💡 前端已内置完整 Mock 数据，不启动后端也能完整浏览所有页面与交互。
> 若需接入真实 LLM，参考 `web/src/store/ChatContext.tsx` 与 `src/utils/llm_client.py` 对接即可。

---

## 🧭 指标语义约束机制详解

**输入问题**：`"2025年复购率最高和最低的月份分别是？"`

### 语义层匹配（关键 3 步）

```
步骤 1 · 语义抽取
  ├─ 指标：       复购率 (M05)
  ├─ 时间：       2025 全年
  ├─ 维度：       月份（month）
  └─ 问题类型：   异常识别 / 极值

步骤 2 · 约束注入（从 metric_semantics.json 读取 M05）
  ├─ 定义：         当月下单≥2次的客户数 / 当月活跃客户数
  ├─ 计算模板：     COUNT(CASE WHEN order_cnt >= 2 THEN 1 END) * 100.0 / COUNT(*) 按月分组
  ├─ 必加过滤：     pay_status = '已支付'
  └─ 警示禁止项：   ①不能跨月追踪新客  ②分子必须是客户维度

步骤 3 · 结果校验（不通过则自检 → 重写 SQL 最多 3 轮）
  ✓ 输出百分比数值 ×100 并保留 2 位小数
  ✓ 返回 12 行 × 2 列（month + repurchase_rate_pct）
  ✓ 分母 NULLIF 除零保护
  ✗ 如果返回 2 行（基线常犯错误）→ 触发"行数不匹配"重写规则
```

语义元数据定义示例（`metric_semantics.json`）：

```json
{
  "id": "M05",
  "name": "复购率",
  "definition": "当月下单≥2次的客户数 / 当月活跃客户数，单位：%",
  "sql_template": "COUNT(CASE WHEN order_cnt >= 2 THEN 1 END) * 100.0 / COUNT(*) 按月分组",
  "aliases": ["复购率", "回头客率", "重复购买率"],
  "confusing_notes": [
    "是按月统计当月内复购，不是跨月追踪新客后续复购",
    "分子是当月内下单≥2次的客户数，分母是当月有下单的客户数"
  ]
}
```

---

## 🏗️ 设计约束与工程规范

### UI 设计 Token
严格遵循 ByteDance AI 工具风格 + 4px 网格：

| Token | 值 |
|---|---|
| 品牌主色 | `#B758ED`（紫） |
| 选中态 | 背景 `#F0EBFA` + 文本 `#B758ED` + 4px 左侧竖条 |
| 卡片边框 | `#ECEDF1` / 内部分隔 `#F1F2F3` |
| 页面背景 | `#F9FAFD` |
| Header 高度 | 64~93px / 主内容上边距 48px |
| 卡片 Padding | 28~32px（大数字卡 34px）|
| 字体 | 正文字号 14 / 页头 20 / 副标题 13（统一 inline `fontSize`）|

### 数据库规范
- 所有金额 / 订单查询必须过滤 `pay_status = '已支付'`
- 统计订单数必须 `COUNT(DISTINCT order_id)`，禁止 `COUNT(*)`
- 时间范围硬编码具体日期，禁止 `date('now')` / `CURRENT_DATE`
- 比例输出百分比，保留 2 位小数，除零保护 `NULLIF`
- 季度标签 `'2025Q1'`，月份标签 `'2025-01'`

---

## 📝 License / 声明

本项目为**本科毕业设计**，仅供学术研究与演示。
零售经营数据为程序生成的模拟样本（Python Faker / 按真实分布采样），与任何真实企业无关。
