"""
SQL 执行器：连接 SQLite 数据库，执行 SQL 并返回结构化结果。
"""
import os
import sqlite3


BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB_PATH = os.path.join(BASE_DIR, "data", "processed", "retail.db")


class SQLExecutor:
    def __init__(self, db_path=None):
        self.db_path = db_path or DB_PATH

    def execute(self, sql, max_rows=200, timeout=10):
        """执行 SQL。
        返回 dict:
          - success: bool
          - columns: list[str]  列名
          - rows: list[tuple]   结果行
          - row_count: int      SELECT 为返回行数，非 SELECT 为影响行数
          - error: str | None   错误信息
          - elapsed_ms: float   耗时毫秒
        """
        import time
        start = time.time()
        conn = None
        try:
            conn = sqlite3.connect(self.db_path, timeout=timeout)
            conn.row_factory = None
            cur = conn.cursor()
            cur.execute(sql)
            # 判断是 SELECT/WITH 还是其他
            stripped = sql.lstrip().upper()
            is_query = stripped.startswith("SELECT") or stripped.startswith("WITH") or stripped.startswith("PRAGMA")
            if is_query:
                rows = cur.fetchmany(max_rows + 1)
                columns = [d[0] for d in cur.description] if cur.description else []
                truncated = len(rows) > max_rows
                if truncated:
                    rows = rows[:max_rows]
                elapsed = (time.time() - start) * 1000
                return {
                    "success": True,
                    "columns": columns,
                    "rows": rows,
                    "row_count": len(rows),
                    "truncated": truncated,
                    "error": None,
                    "elapsed_ms": round(elapsed, 1),
                }
            else:
                conn.commit()
                elapsed = (time.time() - start) * 1000
                return {
                    "success": True,
                    "columns": [],
                    "rows": [],
                    "row_count": cur.rowcount,
                    "truncated": False,
                    "error": None,
                    "elapsed_ms": round(elapsed, 1),
                }
        except Exception as e:
            elapsed = (time.time() - start) * 1000
            return {
                "success": False,
                "columns": [],
                "rows": [],
                "row_count": 0,
                "truncated": False,
                "error": f"{type(e).__name__}: {e}",
                "elapsed_ms": round(elapsed, 1),
            }
        finally:
            if conn:
                conn.close()


def format_result_preview(result, max_preview_rows=10):
    """把 execute() 的结果渲染为简单文本预览（供展示或打印）。"""
    if not result["success"]:
        return f"❌ 执行失败: {result['error']}  (耗时 {result['elapsed_ms']}ms)"
    lines = []
    lines.append(f"✅ 执行成功, 返回 {result['row_count']} 行, 耗时 {result['elapsed_ms']}ms"
                 + (" (结果已截断)" if result.get("truncated") else ""))
    if result["columns"]:
        lines.append(" | ".join(str(c) for c in result["columns"]))
        lines.append("-" * 60)
        for row in result["rows"][:max_preview_rows]:
            lines.append(" | ".join(str(v) for v in row))
        if len(result["rows"]) > max_preview_rows:
            lines.append(f"  ... (共 {len(result['rows'])} 行，仅展示前 {max_preview_rows} 行)")
    return "\n".join(lines)
