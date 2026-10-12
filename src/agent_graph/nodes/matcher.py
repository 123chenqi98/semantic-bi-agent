"""
节点 2 · Matcher Agent（指标 / 维度检索）

职责：依据 Intent Agent 给出的指标、维度说法，从语义层检索出【完整的指标定义】
（SQL 模板、JOIN、口径警示）和【维度字段映射】，并裁剪出只含命中指标的精简知识
片段供 Generator 选择性注入。

为什么这个节点不用 LLM：
- 指标别名→定义是精确的词典检索，规则匹配确定性更高、零 token、零延迟；
- 检索质量可离线评测，避免模型在「选哪条指标」上产生幻觉。
  这是多 Agent 里「规则能做好的就不交给模型」的典型取舍。
"""
from __future__ import annotations

from typing import Dict

from src.agent_graph.nodes import trace_step


def make_matcher_node(deps):
    def matcher_node(state: Dict) -> Dict:
        # 风神等非本地语义层链路：注入自定义字段匹配逻辑（通常是 LLM schema 字段选择）
        if deps.match is not None:
            return deps.match(state, deps)

        sem = deps.semantic
        question = state["question"]
        intent = state.get("intent") or {}

        matched_by_id: Dict[str, Dict] = {}
        resolved_dims = []

        if sem is not None:
            # 1) 别名倒排检索（确定性）
            for m in sem.match_metrics(question):
                matched_by_id[m["id"]] = m

            # 2) 用 Intent 识别到的指标名做补充召回（覆盖别名表没写到的说法）
            name_index = {}
            for m in sem.metrics.values():
                for nm in [m.get("name"), m.get("en_name")] + list(m.get("aliases") or []):
                    if nm:
                        name_index[nm] = m
            for nm in intent.get("metrics", []):
                m = name_index.get(nm)
                if m is not None:
                    matched_by_id[m["id"]] = m

            # 3) 维度归一到真实字段（结合原文关键词 + intent 维度）
            intent_dims = intent.get("dimensions", [])
            for key, dim in sem.dimensions.items():
                kws = dim.get("keywords", [])
                mention = next((k for k in kws if k in question), None)
                if mention is None:
                    mention = next((d for d in intent_dims
                                    if d == key or d in kws or any(d in k for k in kws)), None)
                if mention:
                    resolved_dims.append({"key": key, "field": dim.get("field", ""), "mention": mention})

        matched = list(matched_by_id.values())
        metric_context = sem.format_metrics_knowledge(matched) if (sem is not None and matched) else ""

        detail = f"命中指标={[m.get('name') for m in matched]} 维度={[d['key'] for d in resolved_dims]}"
        return {
            "matched_metrics": matched,
            "metric_context": metric_context,
            "resolved_dimensions": resolved_dims,
            "trace": [trace_step("matcher", "ok", detail,
                                 metric_ids=[m.get("id") for m in matched])],
        }

    return matcher_node
