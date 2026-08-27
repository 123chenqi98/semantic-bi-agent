"""
一个最小化的"假 LLM"离线 demo
不调用真实大模型，直接用固定正确 SQL 模拟 LLM 输出，用于演示基线系统完整流程。
可让用户在不配置 API Key 的情况下先看到系统长什么样。
"""
import os
import sys
import json

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from src.utils.sql_executor import SQLExecutor, format_result_preview


QUESTIONS_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "data", "samples", "test_questions.json"
)


class FakeLLMBaseline:
    """离线 demo：直接从 test_questions.json 里取参考 SQL 当作"LLM 生成的SQL"。
    真实基线不是这样的——真实基线直接让LLM自由生成SQL，错误率很高。
    这里只是演示执行链路。
    """
    def __init__(self):
        with open(QUESTIONS_PATH, "r", encoding="utf-8") as f:
            qs = json.load(f)
        self.sql_map = {q["id"]: q["reference_sql_sqlite"] for q in qs}
        self.executor = SQLExecutor()

    def ask(self, qid):
        sql = self.sql_map.get(qid)
        if not sql:
            print(f"❌ 找不到题目 {qid}")
            return
        print(f"\n🧪 离线 Demo · {qid}")
        print("-" * 60)
        print(f"📝 模拟 LLM 生成的 SQL:\n{sql}\n")
        res = self.executor.execute(sql)
        print(format_result_preview(res))
        return res


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("qid", nargs="?", default="Q01", help="题目编号，如 Q01 / Q04 / Q08")
    args = parser.parse_args()

    print("=" * 60)
    print("  🧪 基线系统离线 Demo（不调用真实 LLM）")
    print("=" * 60)
    demo = FakeLLMBaseline()
    for qid in ["Q01", "Q04", "Q05", "Q08", "Q25"]:
        if args.qid.lower() != "all" and qid != args.qid:
            continue
        demo.ask(qid)

    print("\n" + "=" * 60)
    print("📖 提示：离线 Demo 直接用参考SQL模拟LLM输出，")
    print("   因此结果永远正确（这是参考上限，非真实表现）。")
    print("   真实基线会把问题+schema直接丢给LLM，")
    print("   经常会出现口径错误（比如忘记pay_status过滤）。")
    print("   配置 LLM_API_KEY 后运行 run_baseline_eval.py 即可看到真实基线表现。")
    print("=" * 60)


if __name__ == "__main__":
    main()
