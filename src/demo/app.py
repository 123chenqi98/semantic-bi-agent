"""
毕业设计 Demo：基线 vs 实验组 左右对比界面
运行: python3 -m src.demo.app
然后浏览器打开 http://localhost:5000
"""
import os
import sys
import time
import json

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from flask import Flask, render_template, request, jsonify
from src.agent.baseline_text2sql import BaselineText2SQL
from src.agent.semantic_text2sql import SemanticText2SQL

app = Flask(__name__, template_folder="templates")

baseline_system = None
experiment_system = None

PRESET_QUESTIONS = [
    {"id": "Q01", "text": "上月销售额多少？", "tag": "时间语义错误", "desc": "基线用动态时间函数查不到数据"},
    {"id": "Q08", "text": "2025年各季度新客数的变化情况", "tag": "指标口径错误", "desc": "基线错把注册日期当首单日期"},
    {"id": "Q07", "text": "近6个月的订单量变化趋势", "tag": "时间范围错误", "desc": "基线算成12个月而非6个月"},
    {"id": "Q21", "text": "7大区域的销售额占比（上月）", "tag": "占比结构错误", "desc": "基线没正确计算占比且缺列"},
    {"id": "Q25", "text": "2025年复购率最高和最低的月份分别是？", "tag": "复购率定义+行数错误", "desc": "基线复购率定义错误且只返回2行"},
    {"id": "Q10", "text": "各渠道按季度的销售额变化趋势", "tag": "多维分组列顺序", "desc": "基线维度列顺序颠倒"},
    {"id": "Q09", "text": "2025年每个月的客单价，同时给出环比变化", "tag": "环比缺列", "desc": "基线缺少上期值列"},
]


def get_systems():
    global baseline_system, experiment_system
    if baseline_system is None:
        print("⏳ 正在加载基线系统...")
        baseline_system = BaselineText2SQL()
        print("⏳ 正在加载实验组系统...")
        experiment_system = SemanticText2SQL()
        print("✅ 系统加载完成")
    return baseline_system, experiment_system


@app.route("/")
def index():
    return render_template("index.html", preset_questions=PRESET_QUESTIONS)


@app.route("/api/ask", methods=["POST"])
def ask():
    data = request.get_json()
    question = data.get("question", "").strip()
    if not question:
        return jsonify({"error": "请输入问题"}), 400

    baseline, experiment = get_systems()

    # 运行基线
    t0 = time.time()
    try:
        b_result = baseline.run(question, execute=True)
        b_sql = b_result["generated_sql"]
        b_exec = b_result["exec_result"]
        b_time = round((time.time() - t0) * 1000)
        b_status = "success" if b_exec and b_exec.get("success") else "error"
        b_error = b_exec.get("error", "") if b_exec else "执行失败"
        b_rows = b_exec.get("rows", []) if b_exec else []
        b_cols = b_exec.get("columns", []) if b_exec else []
    except Exception as e:
        b_sql = f"[错误] {e}"
        b_status = "error"
        b_error = str(e)
        b_rows = []
        b_cols = []
        b_time = round((time.time() - t0) * 1000)

    # 运行实验组
    t0 = time.time()
    try:
        e_result = experiment.run(question, execute=True)
        e_sql = e_result["generated_sql"]
        e_exec = e_result["exec_result"]
        e_time = round((time.time() - t0) * 1000)
        e_status = "success" if e_exec and e_exec.get("success") else "error"
        e_error = e_exec.get("error", "") if e_exec else "执行失败"
        e_rows = e_exec.get("rows", []) if e_exec else []
        e_cols = e_exec.get("columns", []) if e_exec else []
        e_metrics = e_result.get("matched_metrics", [])
    except Exception as e:
        e_sql = f"[错误] {e}"
        e_status = "error"
        e_error = str(e)
        e_rows = []
        e_cols = []
        e_time = round((time.time() - t0) * 1000)
        e_metrics = []

    return jsonify({
        "question": question,
        "baseline": {
            "sql": b_sql,
            "status": b_status,
            "error": b_error,
            "rows": b_rows[:50],
            "columns": b_cols,
            "row_count": len(b_rows),
            "time_ms": b_time,
        },
        "experiment": {
            "sql": e_sql,
            "status": e_status,
            "error": e_error,
            "rows": e_rows[:50],
            "columns": e_cols,
            "row_count": len(e_rows),
            "time_ms": e_time,
            "matched_metrics": e_metrics,
        }
    })


if __name__ == "__main__":
    print("=" * 60)
    print("  🎓 毕业设计 Demo - 指标语义层增强Text-to-SQL")
    print("  浏览器打开: http://localhost:5000")
    print("=" * 60)
    app.run(host="0.0.0.0", port=5000, debug=False)
