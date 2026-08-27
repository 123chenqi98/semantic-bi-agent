"""
实验组 Text-to-SQL 系统（加入指标语义约束版本）
流程: 自然语言问题 + Schema(含注释) + 全局规则 + 时间锚点 + 指标词典 → LLM → SQL → 执行 → 返回结果

与基线系统(baseline_text2sql.py)的唯一变量:
- 基线: 仅提供纯DDL schema，无任何业务知识
- 实验组: 提供带注释Schema + 全局口径规则 + 时间锚点映射 + 指标词典 + 常见陷阱警示
- 两者调用次数相同（均为1次LLM调用），保证实验公平性
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

    def run(self, question, execute=True, temperature=0, history=None):
        """完整流程：生成SQL → 执行 → 返回结构化结果。"""
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
        }
        if execute:
            result["exec_result"] = self.executor.execute(sql)
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
