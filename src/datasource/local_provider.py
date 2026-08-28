"""
本地 SQLite 数据源 Provider。

对接当前项目的 retail.db，是系统默认且真实可用的数据源。
将原有的 SQLExecutor 包装为统一的 DataSourceProvider 接口。
"""
from __future__ import annotations

import os
import sqlite3
import time
from typing import Any

from src.datasource.base import DataSourceProvider


BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DEFAULT_DB_PATH = os.path.join(BASE_DIR, "data", "processed", "retail.db")

# 零售示例库的表描述（补充 SQLite PRAGMA 不提供的注释）
TABLE_DESCRIPTIONS = {
    "order_item": "订单明细表：每行一件商品，含金额、数量、支付状态、渠道等",
    "customer": "客户表：客户基本信息、注册时间、区域、会员等级",
    "product": "商品表：商品名称、品类、品牌、单价",
    "date_dim": "日期维度表：日期、年、月、周、是否周末等时间属性",
}


class LocalSQLiteProvider(DataSourceProvider):
    """本地 SQLite 数据源（真实可用）。"""

    def __init__(self, db_path: str | None = None):
        self.db_path = db_path or os.environ.get("SQLITE_DB_PATH", DEFAULT_DB_PATH)

    @property
    def source_type(self) -> str:
        return "currentLocal"

    @property
    def display_name(self) -> str:
        return "本地 SQLite（零售示例库）"

    @property
    def is_real(self) -> bool:
        return True

    @property
    def is_available(self) -> bool:
        return os.path.exists(self.db_path)

    def _connect(self):
        conn = sqlite3.connect(self.db_path, timeout=10)
        conn.row_factory = sqlite3.Row
        return conn

    def _table_names(self) -> list[str]:
        if not self.is_available:
            return []
        try:
            conn = self._connect()
            cur = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
            )
            tables = [r[0] for r in cur.fetchall()]
            conn.close()
            return tables
        except Exception:
            return []

    def health_check(self) -> dict[str, Any]:
        tables = self._table_names()
        total_rows = 0
        table_stats = []
        for t in tables:
            try:
                conn = self._connect()
                cnt = conn.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
                conn.close()
                total_rows += cnt
                table_stats.append({"name": t, "row_count": cnt})
            except Exception:
                table_stats.append({"name": t, "row_count": -1})
        return {
            "ok": self.is_available and len(tables) > 0,
            "source_type": self.source_type,
            "display_name": self.display_name,
            "is_real": True,
            "message": f"SQLite 已连接，{len(tables)} 张表，共 {total_rows} 行" if self.is_available else "数据库文件不存在",
            "details": {
                "db_path": self.db_path,
                "tables": table_stats,
                "total_rows": total_rows,
            },
        }

    def list_datasets(self) -> list[dict[str, Any]]:
        datasets = []
        for t in self._table_names():
            try:
                conn = self._connect()
                cols = [r[1] for r in conn.execute(f'PRAGMA table_info("{t}")').fetchall()]
                cnt = conn.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
                conn.close()
                datasets.append({
                    "id": t,
                    "name": t,
                    "description": TABLE_DESCRIPTIONS.get(t, f"数据表 {t}"),
                    "row_count": cnt,
                    "columns": len(cols),
                })
            except Exception:
                datasets.append({
                    "id": t, "name": t, "description": f"数据表 {t}",
                    "row_count": -1, "columns": 0,
                })
        return datasets

    def get_dataset_schema(self, dataset_id: str) -> dict[str, Any]:
        if dataset_id not in self._table_names():
            return {"id": dataset_id, "name": dataset_id, "columns": [], "error": "数据集不存在"}
        conn = self._connect()
        pragma_cols = conn.execute(f'PRAGMA table_info("{dataset_id}")').fetchall()
        conn.close()
        columns = []
        for c in pragma_cols:
            columns.append({
                "name": c[1],
                "type": c[2] or "TEXT",
                "description": "",
                "nullable": c[3] == 0,
            })
        return {
            "id": dataset_id,
            "name": dataset_id,
            "description": TABLE_DESCRIPTIONS.get(dataset_id, ""),
            "columns": columns,
        }

    def preview_dataset(self, dataset_id: str, limit: int = 20) -> dict[str, Any]:
        try:
            conn = self._connect()
            cur = conn.execute(f'SELECT * FROM "{dataset_id}" LIMIT {int(limit)}')
            columns = [d[0] for d in cur.description] if cur.description else []
            rows = [list(r) for r in cur.fetchall()]
            conn.close()
            return {
                "success": True,
                "columns": columns,
                "rows": rows,
                "row_count": len(rows),
                "error": None,
            }
        except Exception as e:
            return {"success": False, "columns": [], "rows": [], "row_count": 0, "error": str(e)}

    def run_query(self, sql: str, max_rows: int = 200) -> dict[str, Any]:
        start = time.time()
        try:
            conn = self._connect()
            cur = conn.execute(sql)
            if cur.description:
                columns = [d[0] for d in cur.description]
                rows = [list(r) for r in cur.fetchmany(int(max_rows))]
                full_count = conn.execute(
                    f"SELECT COUNT(*) FROM ({sql.rstrip(';')})"
                ).fetchone()[0]
            else:
                conn.commit()
                columns = []
                rows = []
                full_count = cur.rowcount
            conn.close()
            return {
                "success": True,
                "columns": columns,
                "rows": rows,
                "row_count": full_count,
                "error": None,
                "elapsed_ms": round((time.time() - start) * 1000, 1),
            }
        except Exception as e:
            return {
                "success": False,
                "columns": [],
                "rows": [],
                "row_count": 0,
                "error": str(e),
                "elapsed_ms": round((time.time() - start) * 1000, 1),
            }
