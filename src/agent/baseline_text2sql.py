"""
基线 Text-to-SQL 系统（无指标语义约束版本）
流程: 自然语言问题 + DDL Schema → LLM → SQL → 执行 → 返回结果

核心设计原则（与实验组形成鲜明对比）:
1. 不给 LLM 任何业务指标定义/口径/同义词
2. 不给 LLM 任何全局规则（如 pay_status 过滤）
3. 不做 SQL 生成后的结果校验
4. 不做自修正
5. Prompt 尽可能简单，模拟"普通 Text-to-SQL"的真实场景
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.utils.llm_client import LLMClient, extract_sql_from_response
from src.utils.sql_executor import SQLExecutor, format_result_preview


BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCHEMA_PATH = os.path.join(BASE_DIR, "src", "semantic_layer", "schema.sql")


def load_schema():
    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        return f.read()


BASELINE_SYSTEM_PROMPT = """You are a SQL expert. Given a database schema and a natural language question (in Chinese), generate the corresponding SQLite query SQL.

Requirements:
1. Output exactly one executable SQL statement in a ```sql ... ``` code block.
2. No explanations, comments, or extra text.
3. Use standard SQLite syntax. Date fields are TEXT type in 'YYYY-MM-DD' format; use strftime() for grouping.
4. Give meaningful column aliases for aggregate results (e.g., sales_amount, order_count, aov).
5. Read all table names and column names from the provided schema exactly; do NOT invent column names.
"""


class BaselineText2SQL:
    """基线 Text-to-SQL：仅提供 schema，不给指标语义约束。"""

    def __init__(self, llm=None, schema_text=None):
        self.llm = llm or LLMClient()
        self.schema_text = schema_text if schema_text is not None else load_schema()
        self.executor = SQLExecutor()

    def build_prompt(self, question):
        user_prompt = f"""[Database Schema]
{self.schema_text}

[Natural Language Question]
{question}

[Generate SQL now]
"""
        return user_prompt

    def generate_sql(self, question, temperature=0):
        messages = [
            {"role": "system", "content": BASELINE_SYSTEM_PROMPT},
            {"role": "user", "content": self.build_prompt(question)},
        ]
        raw_response = self.llm.chat(messages, temperature=temperature)
        sql = extract_sql_from_response(raw_response)
        return sql, raw_response

    def run(self, question, execute=True, temperature=0):
        """完整流程：生成SQL → 执行 → 返回结构化结果。"""
        sql, raw = self.generate_sql(question, temperature=temperature)
        result = {
            "question": question,
            "generated_sql": sql,
            "raw_llm_response": raw,
            "exec_result": None,
        }
        if execute:
            result["exec_result"] = self.executor.execute(sql)
        return result


def main():
    """命令行交互模式：python -m src.agent.baseline_text2sql "你的问题" """
    import argparse
    parser = argparse.ArgumentParser(description="基线 Text-to-SQL")
    parser.add_argument("question", nargs="?", help="自然语言问题（不提供则进入交互模式）")
    parser.add_argument("--no-exec", action="store_true", help="只生成 SQL 不执行")
    args = parser.parse_args()

    system = BaselineText2SQL()
    print("=" * 60)
    print("  🧪 基线 Text-to-SQL 系统（无语义约束版本）")
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
