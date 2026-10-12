"""
风神（Fengshen BI）数据集的多 Agent 链路。

与本地零售库【共用同一张图拓扑】（Intent→Matcher→Generator→Critic→finalize），
只替换注入的 deps：

- Matcher  ：在风神数据集【真实 Schema】上做确定性字段检索（指标/维度/分区 → 字段ID），
             不用 LLM —— 字段ID 是精确映射，规则检索零 token、可复现，与本地 Matcher
             「规则能做好的就不交给模型」的取舍一致；
- Generator：注入风神 `` `[数据集ID]` / `[字段ID]` `` 方言硬规则 + Matcher 裁剪后的字段清单；
- Critic   ：风神专用【静态审查】（表名/列名反引号 ID、分区必筛、禁中文业务名列、
             禁对预聚合字段再聚合、禁动态时间函数）。execute_in_critic=False —— 风神
             QPM≤3，真实取数保留在用户「确认」环节，图内绝不访问数据库。

真实 LLM 不可用（无 Key / 429 限流）时，FengshenMockLLM 可确定性地把图跑通，
并同样演示「问题 SQL → 静态审查打回 → 按意见重写 → 审查通过」的自修正闭环。
"""
from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, List, Optional

from src.agent_graph.deps import GraphDeps
from src.agent_graph.nodes import trace_step
from src.agent_graph.runner import invoke_graph

# ---------------------------------------------------------------------------
# 字段检索词典：业务说法 → 列名/口径关键词（在 name + description 上做确定性匹配）
# ---------------------------------------------------------------------------
_METRIC_GROUPS = [
    ("gmv", ["支付gmv", "gmv", "成交金额", "支付金额", "销售金额", "销售额", "营业额", "金额"]),
    ("orders", ["支付订单数", "支付订单量", "成交订单数", "订单数", "订单量", "成交单量", "单量", "笔数"]),
]
_DIM_GROUPS = [
    ("merchant_type", ["商户类型", "商户分类", "户类型", "商户层级", "商户"]),
]

# 已知取值枚举（描述里解析不出来时的兜底；键为字段ID）
_KNOWN_ENUMS: Dict[str, List[List[str]]] = {
    "10000047667040": [["1", "总户"], ["10", "区域户"], ["20", "门店户"]],
}

_WRITE_RE = re.compile(r"\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|TRUNCATE|ATTACH|PRAGMA)\b", re.I)
_DYNAMIC_TIME_RE = re.compile(r"(date\s*\(\s*['\"]now|datetime\s*\(\s*['\"]now|CURRENT_DATE|CURRENT_TIMESTAMP|now\s*\(\s*\))", re.I)


def _col_text(c: Dict[str, Any]) -> str:
    return f"{c.get('name', '')} {c.get('description', '')} {c.get('type', '')}".lower()


def _is_cent(c: Dict[str, Any]) -> bool:
    t = f"{c.get('name', '')} {c.get('description', '')}".lower()
    return ("分" in t) and any(k in t for k in ("gmv", "金额", "元"))


def _find_columns(schema: Dict[str, Any], groups, question: str, intent: Dict[str, Any]):
    """在 schema 列上按关键词组做确定性检索，返回 {group_key: column}。

    命中条件：关键词同时出现在「列文本（name+description）」与「问题/意图文本」中，
    即只选问题真正关心的字段；同组多列竞争时按关键词特异性（词典顺序越靠前越特异）
    与列名长度打分，避免「商户ID」抢先于「商户类型」、「下单GMV」抢先于「支付GMV」。
    """
    q = (question or "").lower()
    for k in ("metrics", "dimensions"):
        q += " " + " ".join(str(x) for x in (intent or {}).get(k, [])).lower()
    hits: Dict[str, Dict[str, Any]] = {}
    cols = schema.get("columns") or []
    for gk, kws in groups:
        best = None  # (score, column)
        for c in cols:
            if c.get("is_partition"):
                continue
            text = _col_text(c)
            for ki, kw in enumerate(kws):
                kwl = kw.lower()
                if kwl in text and kwl in q:
                    score = (ki, len(str(c.get("name") or "")))
                    if best is None or score < best[0]:
                        best = (score, c)
                    break  # 该列只需按最特异的命中词计分一次
        if best is not None:
            hits[gk] = best[1]
    return hits


def _enum_hint(c: Dict[str, Any]) -> List[List[str]]:
    """优先从字段描述解析 1=总户 风格枚举，失败用已知字段ID兜底。"""
    fid = str(c.get("field_id") or "")
    if fid in _KNOWN_ENUMS:
        return _KNOWN_ENUMS[fid]
    text = f"{c.get('name', '')} {c.get('description', '')}"
    pairs = re.findall(r"(\d{1,3})\s*[:：=]?\s*([一-鿿]{1,8}?(?:户|型|类|级))", text)
    return [[code, label] for code, label in pairs][:8]


def select_fields(schema: Dict[str, Any], question: str,
                  intent: Optional[Dict[str, Any]] = None) -> Dict[str, List[Dict[str, Any]]]:
    """Schema 字段检索：指标列 / 维度列 / 分区列（按字段ID去重）。"""
    metric_hits = _find_columns(schema, _METRIC_GROUPS, question, intent or {})
    dim_hits = _find_columns(schema, _DIM_GROUPS, question, intent or {})
    seen: set = set()
    metrics, dims = [], []
    for c in metric_hits.values():
        fid = str(c.get("field_id") or "")
        if fid and fid not in seen:
            seen.add(fid)
            metrics.append(c)
    for c in dim_hits.values():
        fid = str(c.get("field_id") or "")
        if fid and fid not in seen:
            seen.add(fid)
            dims.append(c)
    partitions = [c for c in (schema.get("columns") or []) if c.get("is_partition")]
    return {"metrics": metrics, "dimensions": dims, "partitions": partitions}


def _field_ref(c: Dict[str, Any]) -> str:
    return f"`[{c.get('field_id')}]`"


def _metric_context(sel: Dict[str, List[Dict[str, Any]]]) -> str:
    """把选中字段渲染成给 Generator 的精简口径片段（Matcher 的选择性注入）。"""
    lines = []
    for c in sel["metrics"]:
        flags = []
        if c.get("is_aggregated"):
            flags.append("预聚合字段：直接引用，禁止再套 SUM/AVG/COUNT")
        else:
            flags.append("非预聚合：汇总用 SUM(...)")
        if _is_cent(c):
            flags.append("单位为分：结果必须 ROUND(SUM(...)/100.0, 2) 转元")
        lines.append(f"- 指标「{c.get('name')}」→ {_field_ref(c)}（{ '；'.join(flags) }）")
    for c in sel["dimensions"]:
        enums = _enum_hint(c)
        enum_txt = ("，取值 " + ",".join(f"{code}={label}" for code, label in enums)) if enums else ""
        lines.append(f"- 维度「{c.get('name')}」→ {_field_ref(c)}{enum_txt}；"
                     f"需要按该维度分组时用 SUM(CASE WHEN {_field_ref(c)}=取值 THEN 度量 ELSE 0 END) "
                     f"一次扫描产出各分组列，避免多字段 GROUP BY")
    for c in sel["partitions"]:
        lines.append(f"- 分区「{c.get('name')}」→ {_field_ref(c)}；必须在 WHERE 筛选，"
                     f"取最新分区写作 {_field_ref(c)}='${{last_date}}'（宏原样保留）")
    return "\n".join(lines)


def _schema_text(schema: Dict[str, Any]) -> str:
    """完整 Schema 的紧凑文本（仅在 Matcher 选字段不足时供 Generator 参考）。"""
    ds_id = str(schema.get("id") or "")
    cols = schema.get("columns") or []
    lines = [
        f"数据表（表名固定写作）: `[{ds_id}]`，名称：{schema.get('name', '')}",
        f"字段清单（共 {len(cols)} 个；列在 SQL 中必须用反引号包裹字段ID写作 `[字段ID]`）：",
    ]
    for c in cols:
        flags = []
        if c.get("is_partition"):
            flags.append("分区字段")
        if c.get("is_aggregated"):
            flags.append("预聚合")
        desc = (c.get("description") or "").strip().replace("\n", " ")
        if len(desc) > 60:
            desc = desc[:60]
        line = f"- 业务名「{c.get('name')}」 字段ID={c.get('field_id')} 类型={c.get('type')}"
        if flags:
            line += f" [{'，'.join(flags)}]"
        if desc:
            line += f" 口径：{desc}"
        lines.append(line)
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Matcher 节点钩子：真实 Schema 上的字段检索
# ---------------------------------------------------------------------------
def make_fengshen_match(schema: Dict[str, Any]):
    def fengshen_match(state: Dict[str, Any], deps) -> Dict[str, Any]:
        question = state["question"]
        intent = state.get("intent") or {}
        sel = select_fields(schema, question, intent)

        matched = [{
            "id": f"fs_{c.get('field_id')}",
            "name": c.get("name", ""),
            "field_id": str(c.get("field_id") or ""),
            "type": c.get("type", ""),
            "is_aggregated": bool(c.get("is_aggregated")),
            "unit_cent": _is_cent(c),
        } for c in sel["metrics"]]
        resolved_dims = [{
            "key": c.get("name", ""),
            "field": _field_ref(c),
            "field_id": str(c.get("field_id") or ""),
            "mention": c.get("name", ""),
            "enum": _enum_hint(c),
        } for c in sel["dimensions"]]

        detail = (f"选中指标={[c.get('name') for c in sel['metrics']]} "
                  f"维度={[c.get('name') for c in sel['dimensions']]} "
                  f"分区={[c.get('name') for c in sel['partitions']]}（确定性 Schema 字段检索）")
        return {
            "matched_metrics": matched,
            "metric_context": _metric_context(sel),
            "resolved_dimensions": resolved_dims,
            "trace": [trace_step("matcher", "ok", detail,
                                 metric_ids=[m["field_id"] for m in matched])],
        }

    return fengshen_match


# ---------------------------------------------------------------------------
# Generator 的 system prompt 构造器（风神方言）
# ---------------------------------------------------------------------------
def make_fengshen_prompt(schema: Dict[str, Any]):
    ds_id = str(schema.get("id") or "")

    def build_prompt(deps, state: Dict[str, Any]) -> str:
        field_ctx = state.get("metric_context") or "（Matcher 未选中明确字段，请依据完整 Schema 判断）"
        return (
            "你是字节「风神 BI」的「SQL 生成 Agent」，请只输出一条可直接执行的只读 SQL。\n\n"
            "## 风神方言硬规则\n"
            "【标识符】\n"
            f"- 表名固定写 `[{ds_id}]`。\n"
            "- 每个列必须用反引号包裹其字段ID，写作 `[字段ID]`，禁止使用业务中文名作列名。\n\n"
            "【分区】\n"
            "- 分区字段必须出现在 WHERE 中。取最新分区写作：`[分区字段ID]`='${last_date}'"
            "（${last_date} 宏由服务端解析，原样保留，禁止替换成 date('now') 等动态函数）。\n\n"
            "【聚合】\n"
            "- 预聚合字段是已汇总指标，直接引用，禁止再套 SUM/AVG/COUNT。\n"
            "- 非预聚合的度量字段做汇总时用 SUM(...)。\n"
            "- 按维度拆分多组时，优先条件聚合一次扫描产出各分组列，避免多字段 GROUP BY：\n"
            "  SUM(CASE WHEN `[维度字段ID]` = 取值 THEN `[度量字段ID]` ELSE 0 END)。\n\n"
            "【单位】金额字段单位若为「分」，结果需 ROUND(SUM(...)/100.0, 2) 转为元，别名用英文并注明 _yuan。\n\n"
            "【安全】仅允许 SELECT/WITH，不得出现 INSERT/UPDATE/DELETE/DDL；只允许单条语句。\n\n"
            "## 🎯 Matcher 已从真实 Schema 选中的字段（默认只允许使用这些字段）\n"
            f"{field_ctx}\n\n"
            f"{deps.system_suffix}\n\n"
            "输出要求：仅输出一条放在 ```sql ... ``` 代码块中的查询；"
            "不要解释、不要注释；别名一律使用英文。"
        )

    return build_prompt


# ---------------------------------------------------------------------------
# Critic：风神专用确定性静态审查（不调用 LLM、不访问数据库）
# ---------------------------------------------------------------------------
def make_fengshen_guard(schema: Dict[str, Any]):
    ds_id = str(schema.get("id") or "")
    cols = schema.get("columns") or []
    partition_ids = [str(c.get("field_id") or "") for c in cols if c.get("is_partition")]
    aggregated_ids = [str(c.get("field_id") or "") for c in cols if c.get("is_aggregated")]
    business_names = [str(c.get("name") or "") for c in cols if len(str(c.get("name") or "")) >= 2]
    if schema.get("name"):
        business_names.append(str(schema["name"]))

    def guard(sql: str) -> List[Dict[str, str]]:
        issues: List[Dict[str, str]] = []
        s = (sql or "").strip()
        if not s:
            return [{"code": "EMPTY_SQL", "severity": "error", "message": "SQL 为空"}]

        if _WRITE_RE.search(s):
            issues.append({"code": "NOT_READ_ONLY", "severity": "error",
                           "message": "仅允许只读 SELECT/WITH，检测到写操作或危险关键字"})
        body = s[:-1] if s.endswith(";") else s
        if ";" in body:
            issues.append({"code": "MULTI_STATEMENT", "severity": "error",
                           "message": "只允许单条查询，检测到多条语句"})
        if not re.match(r"^(SELECT|WITH)\b", body.lstrip(), re.I):
            issues.append({"code": "NOT_QUERY", "severity": "error",
                           "message": "SQL 必须以 SELECT 或 WITH 开头"})
        if _DYNAMIC_TIME_RE.search(s):
            issues.append({"code": "DYNAMIC_TIME", "severity": "error",
                           "message": "禁止 date('now')/now()/CURRENT_DATE 等动态时间，"
                                      "分区筛选必须用 '${last_date}' 宏或硬编码日期"})

        # 表名必须是 `[数据集ID]`
        if f"`[{ds_id}]`" not in s:
            issues.append({"code": "FS_BAD_TABLE", "severity": "error",
                           "message": f"FROM 表名必须固定写作 `[{ds_id}]`，禁止中文表名或其他标识符"})

        # 至少出现一个 `[字段ID]` 列引用
        if not re.search(r"`\[\d+\]`", s):
            issues.append({"code": "FS_NO_ID_COLUMN", "severity": "error",
                           "message": "所有列必须用反引号包裹字段ID写作 `[字段ID]`"})

        # 分区字段必须在 WHERE 中以 ${last_date}（或硬编码日期）筛选
        for pid in partition_ids:
            ref = f"`[{pid}]`"
            if ref not in s:
                issues.append({"code": "FS_MISSING_PARTITION", "severity": "error",
                               "message": f"分区字段 {ref} 必须出现在 SQL 中并在 WHERE 里筛选"})
            elif not re.search(r"\$\{last_date\}|'\d{4}-\d{2}-\d{2}'", s):
                issues.append({"code": "FS_PARTITION_VALUE", "severity": "error",
                               "message": f"分区字段 {ref} 必须以 '${{last_date}}' 宏或具体日期筛选"})

        # 剥离字符串字面量与合法 `[ID]` 引用后，禁止出现中文业务名/表名
        stripped = re.sub(r"'[^']*'", "''", s)
        stripped = re.sub(r'"[^"]*"', '""', stripped)
        stripped = re.sub(r"`\[[^\]]*\]`", "?", stripped)
        flagged = set()
        for nm in business_names:
            if nm not in flagged and nm in stripped:
                flagged.add(nm)
                issues.append({"code": "FS_CHINESE_COLUMN", "severity": "error",
                               "message": f"禁止直接使用业务名「{nm}」作标识符，列必须写作 `[字段ID]`"})

        # 预聚合字段禁止再套聚合函数
        for fid in aggregated_ids:
            ref = r"`\[" + re.escape(fid) + r"\]`"
            if re.search(r"\b(?:SUM|AVG|COUNT|MAX|MIN)\s*\(\s*(?:DISTINCT\s*)?" + ref, s, re.I):
                issues.append({"code": "FS_REAGGREGATE", "severity": "error",
                               "message": f"`[{fid}]` 是预聚合字段，禁止再套 SUM/AVG/COUNT"})
        return issues

    return guard


# ---------------------------------------------------------------------------
# 离线 Mock：模拟风神链路上的 Intent / Generator，确定性演示自修正
# ---------------------------------------------------------------------------
class FengshenMockLLM:
    name = "mock:fengshen-offline"

    def __init__(self, schema: Dict[str, Any]):
        self.schema = schema
        self.ds_id = str(schema.get("id") or "")
        sel = select_fields(schema, " ".join(
            [c.get("name", "") + " " + c.get("description", "") for c in schema.get("columns") or []]))
        self._gmv = next((c for c in sel["metrics"] if _is_cent(c)), None)
        self._orders = next((c for c in sel["metrics"] if not _is_cent(c)), None)
        self._dim = sel["dimensions"][0] if sel["dimensions"] else None
        self._parts = sel["partitions"]

    # ----- 首轮故意生成的典型错误 SQL（中文表名/列名 + 缺分区筛选）-----
    def _bad_sql(self) -> str:
        dim_nm = self._dim.get("name") if self._dim else "维度"
        lines = ["SELECT"]
        if self._dim:
            lines.append(f"  {dim_nm} AS dim_value,")
        select_cols = []
        if self._gmv:
            select_cols.append(f"  ROUND(SUM({self._gmv.get('name')}) / 100.0, 2) AS gmv_yuan")
        if self._orders:
            select_cols.append(f"  SUM({self._orders.get('name')}) AS order_cnt")
        lines.append(",\n".join(select_cols))
        lines.append(f"FROM {self.schema.get('name') or '业务表'}")
        if self._dim:
            lines.append(f"GROUP BY {dim_nm}")
        return "\n".join(lines) + ";"

    # ----- 收到 Critic 审查意见后的修正 SQL（全部使用字段ID + 分区宏 + CASE WHEN）-----
    def _fixed_sql(self) -> str:
        pref = f"`[{self._parts[0].get('field_id')}]`" if self._parts else "`[分区字段ID]`"
        lines = ["SELECT"]
        exprs = []
        if self._dim:
            dim_ref = _field_ref(self._dim)
            enum = _enum_hint(self._dim) or [["1", "1"], ["10", "10"], ["20", "20"]]
            for code, _label in enum:
                if self._gmv:
                    exprs.append(f"  ROUND(SUM(CASE WHEN {dim_ref} = {code} THEN {_field_ref(self._gmv)} ELSE 0 END) / 100.0, 2) AS gmv_type_{code}_yuan")
                if self._orders:
                    exprs.append(f"  SUM(CASE WHEN {dim_ref} = {code} THEN {_field_ref(self._orders)} ELSE 0 END) AS order_type_{code}")
        else:
            if self._gmv:
                exprs.append(f"  ROUND(SUM({_field_ref(self._gmv)}) / 100.0, 2) AS pay_gmv_yuan")
            if self._orders:
                exprs.append(f"  SUM({_field_ref(self._orders)}) AS pay_order_cnt")
        lines.append(",\n".join(exprs))
        lines.append(f"FROM `[{self.ds_id}]`")
        lines.append(f"WHERE {pref} = '${{last_date}}';")
        return "\n".join(lines)

    def chat(self, messages: List[Dict[str, str]], temperature: float = 0, **kwargs) -> str:
        blob = "\n".join(str(m.get("content", "")) for m in messages)

        # 1) 意图解析回合：结构化 JSON
        if "意图解析" in blob and "JSON" in blob:
            return self._fake_intent(self._extract_question(messages))

        # 2) SQL 生成回合
        if "SQL" in blob or "sql" in blob:
            if ("审查意见" in blob) or ("数据库报错" in blob) or ("修正" in blob and "SQL" in blob):
                return "```sql\n" + self._fixed_sql() + "\n```"
            return "```sql\n" + self._bad_sql() + "\n```"
        return "好的"

    @staticmethod
    def _extract_question(messages):
        import re as _re
        for m in reversed(messages):
            mm = _re.search(r"\[自然语言问题\]\s*(.+)", str(m.get("content", "")), _re.S)
            if mm:
                return mm.group(1).strip()
        return str(messages[-1].get("content", "")) if messages else ""

    def _fake_intent(self, q: str) -> str:
        ql = q.lower()
        metrics, dims = [], []
        if self._gmv and any(k in ql for k in ("gmv", "销售额", "金额", "营业额")):
            metrics.append(self._gmv.get("name"))
        if self._orders and any(k in q for k in ("订单", "单量", "笔数")):
            metrics.append(self._orders.get("name"))
        if self._dim and any(k in q for k in ("商户", "户类型", "各类型")):
            dims.append(self._dim.get("name"))
        time_expr = next((t for t in ("最新分区", "昨日", "上月", "近7天", "本月") if t in q), "")
        payload = {
            "metrics": metrics,
            "dimensions": dims,
            "time_expr": time_expr,
            "question_type": "分组统计" if dims else "直接统计",
            "assumptions": ["未显式指定时间，默认取最新分区"] if not time_expr else [],
        }
        return json.dumps(payload, ensure_ascii=False)


# ---------------------------------------------------------------------------
# deps 装配 + 统一入口
# ---------------------------------------------------------------------------
def _get_fengshen_llm(schema: Dict[str, Any], force_mock: Optional[bool] = None):
    env_mock = os.environ.get("AGENT_GRAPH_MOCK", "").strip() in ("1", "true", "TRUE")
    use_mock = env_mock if force_mock is None else force_mock
    if use_mock:
        return FengshenMockLLM(schema)
    try:
        from src.agent_graph.llm import RealLLM
        return RealLLM()
    except Exception as e:  # 无 Key：诚实降级离线 Mock（429 等运行期限流由节点/上层捕获回退）
        print(f"[agent_graph.fengshen] 真实 LLM 不可用，降级离线 Mock（{type(e).__name__}: {e}）")
        return FengshenMockLLM(schema)


def build_fengshen_deps(schema: Dict[str, Any], max_repairs: int = 2,
                        force_mock: Optional[bool] = None) -> GraphDeps:
    """装配风神数据集链路依赖（与本地零售库共用同一张图）。"""
    llm = _get_fengshen_llm(schema, force_mock=force_mock)
    return GraphDeps(
        llm=llm,
        semantic=None,
        system_suffix="## 数据集完整 Schema（Matcher 选字段不足时参考）\n" + _schema_text(schema),
        guard=make_fengshen_guard(schema),
        run_sql=None,
        execute_in_critic=False,   # 风神 QPM≤3：图内只静态审查，真实取数留在「确认」环节
        empty_result_is_error=False,
        build_system_prompt=make_fengshen_prompt(schema),
        match=make_fengshen_match(schema),
        max_repairs=max_repairs,
    )


def run_fengshen_pipeline(question: str,
                          schema: Dict[str, Any],
                          history: Optional[List[Dict[str, str]]] = None,
                          max_repairs: int = 2,
                          force_mock: Optional[bool] = None,
                          force_langgraph: Optional[bool] = None) -> Dict[str, Any]:
    """运行风神多 Agent 图，返回与 run_pipeline 同构的结果字典。

    异常不在内部吞掉（如真实 LLM 调用失败），由 app_backend 捕获后回退单体链路。
    """
    deps = build_fengshen_deps(schema, max_repairs=max_repairs, force_mock=force_mock)
    return invoke_graph(question, history, deps,
                        max_repairs=max_repairs, force_langgraph=force_langgraph)
