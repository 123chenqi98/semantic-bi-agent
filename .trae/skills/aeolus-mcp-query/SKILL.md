---
name: aeolus-mcp-query
description: Query ByteDance Fengshen Aeolus BI via MCP SSE — list datasets, get schema, run read-only SQL. Use for fetching or analyzing 风神/Aeolus data through MCP. Do not use outside ByteDance intranet.
---

# 风神 Aeolus MCP 取数

通过字节内网的风神 MCP（PSM `data.aeolus.data_set_query`，CN 区）执行**只读**取数。脚本只依赖 Python 标准库，无需安装第三方包。

## 凭证（已与 Git 隔离）

脚本会自动读取本 skill 目录下的 `.env`（已被项目 `.gitignore` 忽略），也支持已导出的环境变量；已存在的真实环境变量优先。需要三个变量：

- `AEOLUS_CLIENT_ID`
- `AEOLUS_CLIENT_SECRET`
- `AEOLUS_PROXY_USER`

缺失时脚本会列出缺失项并退出。**严禁把凭证打印到对话、写入其他文件或提交 Git。**

## 标准问数流程

严格按顺序执行，不要跳步：

1. 列数据集（需要项目 appId，可从风神项目 URL 获取）：

   `python3 scripts/aeolus_query.py datasets --app-id <APP_ID>`
2. 选定数据集后取 schema，确认字段 ID、分区字段、单位、是否预聚合：

   `python3 scripts/aeolus_query.py schema --dataset-id <DATASET_ID>`
3. 按 schema 构造 SQL 并执行：

   `python3 scripts/aeolus_query.py query --dataset-id <DATASET_ID> --sql '<SQL>'`

## SQL 构造硬规则

- 表名写 `[数据集ID]`，列名写 `[列ID]`（均来自前两步真实返回，禁止猜测）。
- schema 中 `isPartitionField=1` 的字段必须在 WHERE 中筛选；取最新分区使用 `'${last_date}'` 宏（由服务端解析）。
- `isAggregated=true` 的字段是预聚合指标，**禁止再做 SUM/AVG**，直接引用即可。
- 金额类字段常见单位为「分」，展示时 `/100` 转为元，并在口径中注明。
- 仅允许 SELECT，保持只读语义。

## 数据集选型与已知问题

- 优先选择 `driverName=click_house` / `doris` 类型的数据集。
- `byte_query`（Hive 物化）数据集在 MCP 链路存在服务端缺陷，会返回 `'HiveMaterializeClient' object has no attribute 'get_data_set_table_map'`；遇到时直接更换数据集，不要反复重试，可向风神 Oncall 反馈。
- 多字段 `GROUP BY`（维度 + 聚合同时出现）可能触发 `aeolus/prepare/prepareUpdateDataSetFailed`（提示未知字段/缺失字段权限，但单字段查询均正常）。改用 `CASE WHEN` 条件聚合绕过，例如 `SUM(CASE WHEN `[维度列]`=x THEN `[指标列]` ELSE 0 END)`，一次扫描产出各分组列。
- 限流为 QPM ≤ 3，连续调用会返回 `aeolus/dataSet/requestRateExcess`；批量探测时每次调用至少间隔 20–25 秒，被限流后等待 60 秒再试。

## 结果呈现要求

先抛结论，再给结构化表格；必须标注数据来源（风神 MCP）、项目/数据集、分区日期、单位与可信度；SQL 失败或无权限时如实说明，不得伪造或美化结果。
