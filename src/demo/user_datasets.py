"""
用户上传数据集服务（一期：仅 CSV）。

- 纯标准库实现（csv / sqlite3 / uuid / json），服务器无需新增任何依赖。
- 每个数据集一个独立目录：<root>/<dataset_id>/{meta.json, source.csv, data.db}
- data.db 为单表 SQLite（表名固定 t），问数时以只读 URI 打开，与零售演示库完全隔离。
- 存储根目录由环境变量 USER_DATA_ROOT 指定（服务器放到部署目录之外，避免部署被清空）；
  默认 <repo>/data/user_datasets。
- 安全：uuid 数据集 ID、文件大小/行数/列数上限、原始文件名清洗、只读执行、SELECT 白名单、TTL 清理。
"""
from __future__ import annotations

import csv
import io
import json
import os
import re
import shutil
import sqlite3
import time
import uuid as _uuid

from src.utils.sql_executor import SQLExecutor

# ---------------- 限制与常量 ----------------
MAX_FILE_BYTES = 10 * 1024 * 1024   # 上传文件上限 10MB
MAX_ROWS = 50000                    # 数据行上限
MAX_COLUMNS = 60                    # 列数上限
MAX_COLUMN_NAME_LEN = 64
PREVIEW_ROWS = 20
SAMPLE_PER_COLUMN = 5              # 每列写入画像的去重样例数
DEFAULT_TTL_SECONDS = 7 * 24 * 3600  # 数据集保留 7 天

_TABLE = "t"
_ALLOWED_DELIMS = [",", ";", "\t", "|"]

_SAFE_NAME_RE = re.compile(r"[^0-9A-Za-z_一-龥]")
_INT_RE = re.compile(r"^[+-]?\d+$")
_FLOAT_RE = re.compile(r"^[+-]?(\d+\.\d*|\.\d+|\d+)([eE][+-]?\d+)?$")
_DATE_RES = [
    re.compile(r"^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$"),
    re.compile(r"^\d{4}年\d{1,2}月\d{1,2}日?$"),
    re.compile(r"^\d{1,2}[-/.]\d{1,2}[-/.]\d{4}$"),
]

# 只读 SQL 白名单：仅允许 WITH/SELECT 开头，且禁止出现任何写/DDL/附加类关键字
_WRITE_KEYWORDS = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|ATTACH|DETACH|PRAGMA|VACUUM|"
    r"REINDEX|GRANT|REVOKE|SAVEPOINT|RELEASE|BEGIN|COMMIT|ROLLBACK|INTO)\b",
    re.IGNORECASE,
)


class DatasetError(ValueError):
    """用户可理解的数据集错误（消息可直接返回前端）。"""


# ---------------- 存储路径 ----------------
def _project_root() -> str:
    # src/demo/user_datasets.py -> src/demo -> src -> repo root
    return os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def data_root() -> str:
    root = os.environ.get("USER_DATA_ROOT", "").strip() or os.path.join(
        _project_root(), "data", "user_datasets"
    )
    os.makedirs(root, exist_ok=True)
    return root


def _ds_dir(dataset_id: str) -> str:
    # 防路径穿越：dataset_id 只允许 uuid 形态
    if not re.fullmatch(r"uds_[0-9a-f]{12}", dataset_id):
        raise DatasetError("数据集 ID 非法")
    return os.path.join(data_root(), dataset_id)


# ---------------- 解析与类型推断 ----------------
def _decode(raw: bytes) -> str:
    for enc in ("utf-8-sig", "utf-8", "gb18030"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def _sniff_dialect(sample: str) -> csv.Dialect:
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters="".join(_ALLOWED_DELIMS))
        if dialect.delimiter in _ALLOWED_DELIMS:
            return dialect
    except csv.Error:
        pass
    # 兜底：按首行各候选分隔符出现次数挑最可能的
    first_line = sample.splitlines()[0] if sample else ""
    delim = max(_ALLOWED_DELIMS, key=lambda d: first_line.count(d)) if first_line else ","
    if first_line.count(delim) == 0:
        delim = ","

    class _D(csv.excel):
        pass

    _D.delimiter = delim
    return _D


def _clean_filename(filename: str) -> str:
    name = os.path.basename(filename or "").strip()
    name = name.replace("\x00", "")
    # 去掉路径分隔与控制字符，只保留合理字符
    name = re.sub(r"[\\/:\*\?\"<>\|]", "_", name)
    return name[:120] or "dataset.csv"


def _normalize_header(name: str, idx: int, used: set) -> tuple[str, str]:
    """返回 (SQL 引用名, 展示名)。SQLite 用双引号引用，支持中文/空格。"""
    display = (name or "").strip() or f"列{idx + 1}"
    display = display[:MAX_COLUMN_NAME_LEN]
    sql_name = display
    if sql_name in used:
        suffix = 2
        base = sql_name
        while f"{base}_{suffix}" in used:
            suffix += 1
        sql_name = f"{base}_{suffix}"
        display = sql_name
    used.add(sql_name)
    return sql_name, display


def _is_date(s: str) -> bool:
    return any(rx.match(s) for rx in _DATE_RES)


def _normalize_date(s: str) -> str:
    """把常见日期写法归一化为 YYYY-MM-DD；无法识别的原样返回。"""
    s = s.strip()
    m = re.match(r"^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$", s)
    if m:
        y, mo, d = m.groups()
        return f"{y}-{int(mo):02d}-{int(d):02d}"
    m = re.match(r"^(\d{4})年(\d{1,2})月(\d{1,2})日?$", s)
    if m:
        y, mo, d = m.groups()
        return f"{y}-{int(mo):02d}-{int(d):02d}"
    m = re.match(r"^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$", s)
    if m:
        mo, d, y = m.groups()
        return f"{y}-{int(mo):02d}-{int(d):02d}"
    return s


def _infer_type(values: list[str]) -> str:
    """根据非空样本推断 integer / real / date / text。"""
    seen = [v.strip() for v in values if v is not None and str(v).strip() != ""]
    if not seen:
        return "text"
    if all(_is_date(v) for v in seen):
        return "date"
    if all(_INT_RE.match(v) for v in seen):
        return "integer"
    if all(_FLOAT_RE.match(v) for v in seen):
        return "real"
    return "text"


def _convert(v: str, col_type: str):
    if v is None:
        return None
    s = v.strip()
    if s == "":
        return None
    if col_type == "integer":
        try:
            return int(s)
        except ValueError:
            return s
    if col_type == "real":
        try:
            return float(s)
        except ValueError:
            return s
    if col_type == "date":
        return _normalize_date(s)
    return s


def _quote_ident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def assert_readonly_sql(sql: str) -> None:
    """执行前的静态白名单校验（只读 URI 之外的第二道保险）。"""
    s = (sql or "").strip().rstrip(";").strip()
    if not s:
        raise DatasetError("SQL 为空")
    if not re.match(r"^(SELECT|WITH)\b", s, re.IGNORECASE):
        raise DatasetError("仅允许 SELECT/WITH 查询")
    if _WRITE_KEYWORDS.search(s):
        raise DatasetError("查询中包含不允许的写操作或 DDL 关键字")


# ---------------- 核心：保存 / 读取 / 删除 ----------------
def save_dataset(filename: str, raw: bytes) -> dict:
    """解析上传的 CSV，完成字段画像并落库，返回 meta。"""
    fname = _clean_filename(filename)
    if not raw:
        raise DatasetError("文件内容为空")
    if len(raw) > MAX_FILE_BYTES:
        raise DatasetError(f"文件超过 {MAX_FILE_BYTES // 1024 // 1024}MB 上限")
    if not fname.lower().endswith(".csv"):
        raise DatasetError("一期仅支持 CSV 文件（.csv）")

    text = _decode(raw)
    dialect = _sniff_dialect(text[:4096])
    reader = csv.reader(io.StringIO(text), dialect)
    try:
        header = next(reader)
    except StopIteration:
        raise DatasetError("CSV 没有表头行")
    if not header or all((h or "").strip() == "" for h in header):
        raise DatasetError("CSV 表头为空")

    n_cols = len(header)
    if n_cols > MAX_COLUMNS:
        raise DatasetError(f"列数 {n_cols} 超过上限 {MAX_COLUMNS}")

    used: set[str] = set()
    col_sql_names, col_display = [], []
    for i, h in enumerate(header):
        sql_name, display = _normalize_header(h, i, used)
        col_sql_names.append(sql_name)
        col_display.append(display)

    # 收集行（限量）与每列样本
    rows: list[list[str]] = []
    samples: list[list[str]] = [[] for _ in range(n_cols)]
    sample_seen: list[set] = [set() for _ in range(n_cols)]
    for row in reader:
        if not row or all((c or "").strip() == "" for c in row):
            continue  # 跳过完全空白行
        if len(row) < n_cols:
            row = row + [""] * (n_cols - len(row))
        elif len(row) > n_cols:
            row = row[:n_cols]
        rows.append(row)
        if len(rows) > MAX_ROWS:
            raise DatasetError(f"数据行数超过 {MAX_ROWS} 行上限，请拆分或精简后再上传")
        for i in range(n_cols):
            v = row[i].strip()
            if v and v not in sample_seen[i] and len(samples[i]) < 200:
                sample_seen[i].add(v)
                samples[i].append(v)

    if not rows:
        raise DatasetError("CSV 只有表头，没有数据行")

    columns = []
    for i in range(n_cols):
        col_type = _infer_type(samples[i])
        col_samples = samples[i][:SAMPLE_PER_COLUMN]
        if col_type == "date":
            col_samples = [_normalize_date(v) for v in col_samples]
        columns.append({
            "name": col_display[i],          # 展示名 / SQL 引用名（已去重）
            "type": col_type,                # integer / real / date / text
            "samples": col_samples,
        })

    dataset_id = "uds_" + _uuid.uuid4().hex[:12]
    ds_dir = os.path.join(data_root(), dataset_id)
    os.makedirs(ds_dir, exist_ok=True)
    try:
        # 原始文件留存（便于追溯/导出）
        with open(os.path.join(ds_dir, "source.csv"), "wb") as f:
            f.write(raw)

        # 写入 SQLite 单表
        db_path = os.path.join(ds_dir, "data.db")
        conn = sqlite3.connect(db_path)
        try:
            col_defs = ", ".join(
                f"{_quote_ident(c['name'])} "
                + ("INTEGER" if c["type"] == "integer" else
                   "REAL" if c["type"] == "real" else "TEXT")
                for c in columns
            )
            conn.execute(f"CREATE TABLE {_TABLE} ({col_defs})")
            placeholders = ", ".join(["?"] * n_cols)
            insert_sql = f"INSERT INTO {_TABLE} VALUES ({placeholders})"
            conn.executemany(
                insert_sql,
                [[_convert(r[i], columns[i]["type"]) for i in range(n_cols)] for r in rows],
            )
            conn.commit()
        finally:
            conn.close()

        now = time.time()
        meta = {
            "id": dataset_id,
            "filename": fname,
            "row_count": len(rows),
            "column_count": n_cols,
            "columns": columns,
            "size_bytes": len(raw),
            "created_at": now,
            "expires_at": now + DEFAULT_TTL_SECONDS,
        }
        with open(os.path.join(ds_dir, "meta.json"), "w", encoding="utf-8") as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)
        return meta
    except Exception:
        shutil.rmtree(ds_dir, ignore_errors=True)
        raise


def load_meta(dataset_id: str) -> dict | None:
    """读取 meta；过期则惰性清理并返回 None。任何损坏都按不存在处理。"""
    try:
        ds_dir = _ds_dir(dataset_id)
    except DatasetError:
        return None
    meta_path = os.path.join(ds_dir, "meta.json")
    if not os.path.exists(meta_path):
        return None
    try:
        with open(meta_path, "r", encoding="utf-8") as f:
            meta = json.load(f)
    except Exception:
        return None
    if time.time() > float(meta.get("expires_at", 0)):
        shutil.rmtree(ds_dir, ignore_errors=True)
        return None
    return meta


def list_datasets() -> list[dict]:
    """列出全部有效数据集（轻量字段），按创建时间倒序。"""
    root = data_root()
    out = []
    for name in os.listdir(root):
        meta = load_meta(name)
        if meta:
            out.append({
                "id": meta["id"],
                "filename": meta["filename"],
                "row_count": meta["row_count"],
                "column_count": meta["column_count"],
                "columns": [{"name": c["name"], "type": c["type"]} for c in meta["columns"]],
                "size_bytes": meta["size_bytes"],
                "created_at": meta["created_at"],
                "expires_at": meta["expires_at"],
            })
    out.sort(key=lambda m: m["created_at"], reverse=True)
    return out


def preview_dataset(dataset_id: str, limit: int = PREVIEW_ROWS) -> dict:
    meta = load_meta(dataset_id)
    if not meta:
        raise DatasetError("数据集不存在或已过期，请重新上传")
    limit = max(1, min(int(limit or PREVIEW_ROWS), 100))
    db_path = os.path.join(_ds_dir(dataset_id), "data.db")
    conn = sqlite3.connect(db_path, uri=False)
    try:
        cur = conn.cursor()
        cur.execute(f"SELECT * FROM {_TABLE} LIMIT {int(limit)}")
        cols = [d[0] for d in cur.description]
        rows = [list(r) for r in cur.fetchall()]
    finally:
        conn.close()
    return {
        "id": dataset_id,
        "filename": meta["filename"],
        "row_count": meta["row_count"],
        "column_count": meta["column_count"],
        "columns": meta["columns"],
        "preview_columns": cols,
        "preview_rows": rows,
    }


def delete_dataset(dataset_id: str) -> bool:
    try:
        ds_dir = _ds_dir(dataset_id)
    except DatasetError:
        return False
    if os.path.isdir(ds_dir):
        shutil.rmtree(ds_dir, ignore_errors=True)
        return True
    return False


def cleanup_expired() -> int:
    """主动清理过期数据集，返回删除数量。"""
    root = data_root()
    n = 0
    for name in os.listdir(root):
        if os.path.isdir(os.path.join(root, name)):
            if load_meta(name) is None and os.path.isdir(os.path.join(root, name)):
                # load_meta 对已过期的会自行删除；损坏但目录残留的也清掉
                meta_path = os.path.join(root, name, "meta.json")
                if not os.path.exists(meta_path):
                    shutil.rmtree(os.path.join(root, name), ignore_errors=True)
                    n += 1
    return n


# ---------------- 问数支撑 ----------------
def get_executor(dataset_id: str) -> SQLExecutor:
    meta = load_meta(dataset_id)
    if not meta:
        raise DatasetError("数据集不存在或已过期，请重新上传")
    db_path = os.path.join(_ds_dir(dataset_id), "data.db")
    if not os.path.exists(db_path):
        raise DatasetError("数据集文件缺失，请重新上传")
    return SQLExecutor(db_path=db_path)


def schema_text_for_llm(meta: dict) -> str:
    """把数据集画像渲染为 LLM 可读的 SQLite schema 文本（含样例值）。"""
    type_cn = {"integer": "整数", "real": "小数", "date": "日期文本", "text": "文本"}
    lines = [
        "数据表：单表，表名固定写作 t（SQL 中直接写 t，不要加库名/引号以外的修饰）。",
        f"共 {meta['column_count']} 列、{meta['row_count']} 行数据。列名在 SQL 中必须用双引号原样引用：",
    ]
    for c in meta["columns"]:
        samples = "、".join(str(s) for s in c.get("samples", [])[:5])
        line = f'- {_quote_ident(c["name"])}  类型：{type_cn.get(c["type"], c["type"])}'
        if samples:
            line += f"；样例值：{samples}"
        lines.append(line)
    lines.append(
        "方言要求：标准 SQLite 语法；日期列为文本，按字符串比较时请使用 'YYYY-MM-DD' 形态；"
        "只允许 SELECT/WITH；结果集请控制在 100 行以内（必要时用 LIMIT）。"
    )
    return "\n".join(lines)
