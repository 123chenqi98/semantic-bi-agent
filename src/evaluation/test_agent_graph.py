"""
多 Agent 图（Intent→Matcher→Generator→Critic）离线验收脚本。

用途：
- 不依赖大模型额度（强制 MockLLM），确定性地演示「生成有错 SQL → Critic 工具审查打回
  → Generator 带审查意见重写 → 真实执行出数」的自修正闭环；
- 同时验证 execute=False（plan 模式）下全程不碰数据库。

运行（在装有 langgraph 的独立环境）：
    .venv-agent/bin/python -m src.evaluation.test_agent_graph

任意断言失败会以非 0 退出，方便接入回归检查。
"""
import os
import sys

_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from src.agent_graph import run_pipeline  # noqa: E402
from src.agent_graph.fengshen import run_fengshen_pipeline, make_fengshen_guard  # noqa: E402
from src.agent_graph.graph import has_langgraph  # noqa: E402


QUESTION = "上月各渠道的销售额和订单数分别是多少？"

# 风神「生意经交易增量表」(id=6095955) 的离线 mock schema：
# 字段ID/分区/枚举与真实表一致，并刻意放入同前缀干扰列（商户ID/下单GMV）与预聚合列，
# 用于检验 Matcher 的字段消歧与 Critic 的「禁再聚合」静态规则。
FS_SCHEMA = {
    "id": "6095955",
    "name": "生意经交易增量表",
    "columns": [
        {"name": "p_date", "type": "DATE", "description": "日期分区，最新分区用 ${last_date}",
         "field_id": "10000047667034", "is_partition": True, "is_aggregated": False},
        {"name": "商户ID", "type": "VARCHAR", "description": "商户唯一标识",
         "field_id": "10000047667039", "is_partition": False, "is_aggregated": False},
        {"name": "商户类型", "type": "VARCHAR", "description": "商户类型 1总户 10区域户 20门店户",
         "field_id": "10000047667040", "is_partition": False, "is_aggregated": False},
        {"name": "支付GMV(分)", "type": "BIGINT", "description": "支付GMV，单位分",
         "field_id": "10000047667084", "is_partition": False, "is_aggregated": False},
        {"name": "支付订单数", "type": "BIGINT", "description": "支付订单数",
         "field_id": "10000047667085", "is_partition": False, "is_aggregated": False},
        {"name": "下单GMV(分)", "type": "BIGINT", "description": "下单GMV，单位分（干扰列）",
         "field_id": "10000047667086", "is_partition": False, "is_aggregated": False},
        {"name": "客单价(分)", "type": "BIGINT", "description": "客单价，预聚合指标（禁再聚合）",
         "field_id": "10000047667090", "is_partition": False, "is_aggregated": True},
    ],
}
FS_QUESTION = "最新分区各商户类型的支付GMV和支付订单数分别是多少？"


def _print_result(title, r):
    print("\n" + "=" * 72)
    print(title)
    print("=" * 72)
    print(f"图后端: {r['graph_backend']} | 模型: {r['sql_source']} | "
          f"审查通过: {r['agent_passed']} | 修复轮次: {r['repair_count']} | "
          f"实际触发重写: {r['repaired']}")

    print("\n— 全链路 trace —")
    for i, s in enumerate(r["trace"], 1):
        extra = []
        if s.get("row_count") is not None:
            extra.append(f"行数={s['row_count']}")
        if s.get("round"):
            extra.append(f"第{s['round']}版")
        print(f"  {i}. {s['node']:<10} [{s['status']:<8}] {s['detail']}"
              + (f"  ({', '.join(extra)})" if extra else ""))

    print(f"\n— 意图 intent: {r['intent']}")
    print(f"— 命中指标: {r['matched_metrics']}  维度: {[d['key'] for d in r['resolved_dimensions']]}")

    print("\n— SQL 演进（生成 → 打回 → 重写）—")
    for i, sql in enumerate(r["sql_history"], 1):
        head = sql.strip().splitlines()[0] if sql.strip() else ""
        print(f"  v{i}: {head}")

    print(f"\n— 最终 SQL —\n{r['generated_sql']}")
    er = r.get("exec_result")
    if er:
        print(f"\n— 真实执行结果（工具返回） success={er.get('success')} 行数={er.get('row_count')}")
        print("  列:", er.get("columns"))
        for row in (er.get("rows") or [])[:6]:
            print("  ", row)
    else:
        print("\n— 未执行 SQL（plan 模式，符合只生成不执行约束）—")


def main():
    # 1) execute=True：完整闭环，Critic 真实执行 SQL
    r = run_pipeline(QUESTION, execute=True, max_repairs=2, force_mock=True)
    _print_result("场景一：确认后执行（execute=True，含自修正闭环）", r)

    checks = []
    checks.append(("图拓扑跑通 5 类节点",
                   {s["node"] for s in r["trace"]} >= {"intent", "matcher", "generator", "critic", "finalize"}))
    checks.append(("首轮 SQL 被 Critic 打回并触发重写", r["repaired"] is True))
    checks.append(("最终审查通过", r["agent_passed"] is True))
    checks.append(("产生 2 版 SQL（错→对）", len(r["sql_history"]) == 2))
    checks.append(("Critic 真实调用了执行工具", r["critic"].get("executed") is True))
    checks.append(("真实执行返回数据行", (r.get("exec_result") or {}).get("row_count", 0) > 0))
    checks.append(("Matcher 命中销售额指标", "M01" in r["matched_metrics"]))
    checks.append(("Matcher 解析出渠道维度", any(d["key"] == "channel" for d in r["resolved_dimensions"])))

    # 2) execute=False：plan 模式，绝不执行 SQL
    r2 = run_pipeline(QUESTION, execute=False, max_repairs=2, force_mock=True)
    _print_result("场景二：生成草案（execute=False，不碰数据库）", r2)
    # mock 首轮 SQL 含动态时间函数，静态审查会打回，Generator 重写后静态通过
    checks.append(("plan 模式不执行 SQL", r2["critic"].get("executed") is False and r2.get("exec_result") is None))
    checks.append(("plan 模式最终静态审查通过", r2["agent_passed"] is True))

    # 3) 风神数据集链路：同一拓扑换风神 deps（双后端：langgraph + shim）
    backends = [False] + ([True] if has_langgraph() else [])
    rf = None
    for use_lg in backends:
        rf = run_fengshen_pipeline(FS_QUESTION, FS_SCHEMA, history=None,
                                   max_repairs=2, force_mock=True, force_langgraph=use_lg)
        _print_result(f"场景三：风神多 Agent 图（force_langgraph={use_lg}）", rf)
        tag = "LangGraph" if use_lg else "Shim"
        sql = rf["generated_sql"]
        checks += [
            (f"[{tag}] 风神图跑通 5 类节点",
             {s["node"] for s in rf["trace"]} >= {"intent", "matcher", "generator", "critic", "finalize"}),
            (f"[{tag}] 首轮问题 SQL 被静态 Critic 打回并自修正", rf["repaired"] is True),
            (f"[{tag}] 最终静态审查通过", rf["agent_passed"] is True),
            (f"[{tag}] 表名使用 `[6095955]`", "`[6095955]`" in sql),
            (f"[{tag}] GMV 使用字段ID 10000047667084", "`[10000047667084]`" in sql),
            (f"[{tag}] 订单数使用字段ID 10000047667085", "`[10000047667085]`" in sql),
            (f"[{tag}] 商户类型使用字段ID 10000047667040", "`[10000047667040]`" in sql),
            (f"[{tag}] 分区用 ${{last_date}} 宏筛选", "${last_date}" in sql and "`[10000047667034]`" in sql),
            (f"[{tag}] 维度拆分使用 SUM(CASE WHEN) 条件聚合", "CASE WHEN" in sql.upper()),
            (f"[{tag}] 金额分→元 /100.0", "/100.0" in sql.replace(" ", "")),
            (f"[{tag}] 图内绝不真实执行（QPM 保护）",
             rf["critic"].get("executed") is False and rf.get("exec_result") is None),
            (f"[{tag}] Matcher 消歧：命中支付GMV而非下单GMV/商户ID",
             "fs_10000047667084" in rf["matched_metrics"]
             and "fs_10000047667086" not in rf["matched_metrics"]),
        ]

    # 4) 风神静态 Critic 规则单测（确定性，不依赖图）
    guard = make_fengshen_guard(FS_SCHEMA)
    bad_sql = ("SELECT 商户类型, SUM(支付GMV(分)) FROM 生意经交易增量表 GROUP BY 商户类型;")
    bad_codes = {i["code"] for i in guard(bad_sql)}
    checks.append(("[Guard] 中文表名/列名+缺分区被拦截",
                   {"FS_BAD_TABLE", "FS_NO_ID_COLUMN", "FS_MISSING_PARTITION", "FS_CHINESE_COLUMN"} <= bad_codes))
    reagg = ("SELECT SUM(`[10000047667090]`) FROM `[6095955]` "
             "WHERE `[10000047667034]`='${last_date}';")
    checks.append(("[Guard] 预聚合字段再聚合 → FS_REAGGREGATE",
                   "FS_REAGGREGATE" in {i["code"] for i in guard(reagg)}))
    dyn = ("SELECT `[10000047667084]` FROM `[6095955]` WHERE `[10000047667034]`=date('now');")
    checks.append(("[Guard] 动态时间函数 → DYNAMIC_TIME",
                   "DYNAMIC_TIME" in {i["code"] for i in guard(dyn)}))
    if rf is not None:
        checks.append(("[Guard] 修正后 SQL 静态审查零 issue", guard(rf["generated_sql"]) == []))

    print("\n" + "=" * 72)
    print("验收结论")
    print("=" * 72)
    ok = True
    for name, passed in checks:
        print(f"  [{'PASS' if passed else 'FAIL'}] {name}")
        ok = ok and passed
    print("\n结果:", "全部通过 ✅" if ok else "存在失败 ❌")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
