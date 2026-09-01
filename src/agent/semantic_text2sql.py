"""
实验组 Text-to-SQL 系统（加入指标语义约束版本）
流程: 自然语言问题 + Schema(含注释) + 全局规则 + 时间锚点 + 指标词典 → LLM → SQL → 执行 → 返回结果

与基线系统(baseline_text2sql.py)的唯一变量:
- 基线: 仅提供纯DDL schema，无任何业务知识
- 实验组: 提供带注释Schema + 全局口径规则 + 时间锚点映射 + 指标词典 + 常见陷阱警示
- 正常路径两者调用次数相同（均为1次LLM调用），保证实验公平性；
  实验组额外具备「执行失败自修复」能力（见 run() 的 repair 闭环）：仅在 SQL 执行报错时
  触发，把数据库错误回喂 LLM 重写（默认最多 1 轮，SEMANTIC_SQL_REPAIR_ROUNDS 可配），
  基线不享受该机制——自修复属于语义层系统的工程化错误恢复能力，而非提示词内容差异。
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.utils.llm_client import LLMClient, extract_sql_from_response
from src.utils.sql_executor import SQLExecutor, format_result_preview
from src.semantic_layer.semantic_loader import get_semantic_layer


class SemanticText2SQL:
    """实验组 Text-to-SQL：注入完整指标语义层知识。"""

    def __init__(self, llm=None, semantic_layer=None):
        self.llm = llm or LLMClient()
        self.semantic = semantic_layer or get_semantic_layer()
        self.executor = SQLExecutor()
        self._system_prompt = self.semantic.build_system_prompt()
        # SQL 执行失败后的自修复轮数（0=关闭，商用默认 1 轮）
        self.repair_rounds = max(0, int(os.environ.get("SEMANTIC_SQL_REPAIR_ROUNDS", "1")))

    def build_user_prompt(self, question, history=None):
        """构建用户Prompt：包含对话历史和当前问题。"""
        history_text = ""
        if history:
            lines = []
            for h in history[-6:]:
                role = h.get("role", "user")
                content = h.get("content", "")
                lines.append(f"[{role}] {content}")
            history_text = "\n[对话历史（供参考，追问时需结合上文理解省略的指代）]\n" + "\n".join(lines) + "\n"
        return f"""{history_text}
[自然语言问题]
{question}

[请生成SQL]
"""

    def generate_sql(self, question, temperature=0, history=None):
        messages = [
            {"role": "system", "content": self._system_prompt},
            {"role": "user", "content": self.build_user_prompt(question, history=history)},
        ]
        raw_response = self.llm.chat(messages, temperature=temperature)
        sql = extract_sql_from_response(raw_response)
        return sql, raw_response

    def _repair_sql(self, question, history, failed_sql, db_error):
        """自修复：把失败 SQL 与数据库报错回喂 LLM，要求仅输出修正后的 SQL。"""
        messages = [
            {"role": "system", "content": self._system_prompt},
            {"role": "user", "content": self.build_user_prompt(question, history=history)},
            {"role": "assistant", "content": failed_sql},
            {"role": "user", "content": (
                f"你上一条生成的 SQL 在数据库执行失败，错误信息如下：\n{db_error}\n\n"
                "请根据错误信息修正 SQL（常见原因：表名/列名拼写错误、使用了数据库不支持的函数、"
                "SELECT 列与 GROUP BY 不一致、JOIN 条件或别名缺失、SQLite 不支持的语法等）。\n"
                "只输出修正后可直接执行的 SQL，不要任何解释或 Markdown 代码块标记。")},
        ]
        raw = self.llm.chat(messages, temperature=0)
        return extract_sql_from_response(raw), raw

    def run(self, question, execute=True, temperature=0, history=None, repair_rounds=None):
        """完整流程：生成SQL → 执行 →（失败则自修复重试）→ 返回结构化结果。"""
        sql, raw = self.generate_sql(question, temperature=temperature, history=history)
        matched_metrics = self.semantic.match_metrics(question)
        user_prompt = self.build_user_prompt(question, history=history)
        full_prompt = f"[System]\n{self._system_prompt}\n\n[User]\n{user_prompt}"
        result = {
            "question": question,
            "generated_sql": sql,
            "raw_llm_response": raw,
            "exec_result": None,
            "matched_metrics": [m["id"] for m in matched_metrics],
            "full_prompt": full_prompt,
            "repairs": [],
            "repaired": False,
        }
        if execute:
            exec_result = self.executor.execute(sql)
            max_rounds = self.repair_rounds if repair_rounds is None else max(0, repair_rounds)
            round_idx = 0
            while not exec_result.get("success") and round_idx < max_rounds:
                round_idx += 1
                prev_sql, prev_err = sql, exec_result.get("error")
                try:
                    fixed_sql, repair_raw = self._repair_sql(question, history, sql, prev_err)
                except Exception as e:
                    # 修复调用本身失败（LLM 不可用等）：记录后停止，保留原执行结果
                    result["repairs"].append({
                        "round": round_idx, "ok": False,
                        "failed_sql": prev_sql, "db_error": prev_err,
                        "error": f"修复调用失败：{type(e).__name__}: {e}"})
                    break
                fixed_sql = (fixed_sql or "").strip()
                if not fixed_sql or fixed_sql.rstrip(";").strip() == prev_sql.rstrip(";").strip():
                    result["repairs"].append({
                        "round": round_idx, "ok": False,
                        "failed_sql": prev_sql, "db_error": prev_err,
                        "error": "修复未产出有效新 SQL"})
                    break
                new_exec = self.executor.execute(fixed_sql)
                result["repairs"].append({
                    "round": round_idx,
                    "ok": bool(new_exec.get("success")),
                    "failed_sql": prev_sql,
                    "fixed_sql": fixed_sql,
                    "db_error": prev_err,
                })
                sql, raw, exec_result = fixed_sql, repair_raw, new_exec
                if new_exec.get("success"):
                    break
            result["generated_sql"] = sql
            result["raw_llm_response"] = raw
            result["exec_result"] = exec_result
            result["repaired"] = any(r.get("ok") for r in result["repairs"])
        return result


def main():
    """命令行交互模式。"""
    import argparse
    parser = argparse.ArgumentParser(description="实验组 Text-to-SQL（含语义层）")
    parser.add_argument("question", nargs="?", help="自然语言问题")
    parser.add_argument("--no-exec", action="store_true", help="只生成SQL不执行")
    args = parser.parse_args()

    system = SemanticText2SQL()
    print("=" * 60)
    print("  🧪 实验组 Text-to-SQL 系统（含指标语义约束）")
    print("=" * 60)
    print()

    if args.question:
        questions = [args.question]
    else:
        print("进入交互模式（输入 'exit' 退出）")
        questions = None

    while True:
        if questions is None:
            try:
                q = input("\n👤 请输入问题 > ").strip()
            except (EOFError, KeyboardInterrupt):
                print("\n再见！")
                break
            if q in ("exit", "quit", "q"):
                break
            if not q:
                continue
        else:
            q = questions[0]
            questions = None

        print(f"\n🔍 问题: {q}")
        matched = system.semantic.match_metrics(q)
        if matched:
            print(f"🎯 识别到指标: {', '.join(m['name'] for m in matched)}")
        print("⏳ 正在调用 LLM 生成 SQL ...")
        try:
            result = system.run(q, execute=not args.no_exec)
        except Exception as e:
            print(f"❌ 错误: {e}")
            continue

        print(f"\n📝 生成的 SQL:\n{result['generated_sql']}")
        if result["exec_result"]:
            print()
            print(format_result_preview(result["exec_result"]))


if __name__ == "__main__":
    main()
