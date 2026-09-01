"""
审计与可追踪事件骨架（第五轮·企业化底座）。

设计目标：
  - 不引入重型日志平台，用「结构化 JSONL 文件 + 内存环形缓冲」提供最基础的可追踪能力；
  - 记录「谁（会话）发起了什么分析、用了哪个数据源、是否经过 SQL 确认、
    是否执行成功、是否命中 Mock、出错时的错误类型」；
  - 敏感信息（API Key / Token / JWT / app_secret）一律不允许进入事件；
    SQL 仅记录长度与前 200 字符预览（SQL 本身不含密钥，保留少量预览便于排障）。

落地方式：
  - 文件：$AUDIT_LOG_DIR（默认项目根 logs/audit/）下按天滚动 audit-YYYYMMDD.jsonl；
  - 内存：collections.deque 保留最近 MAX_MEMORY_EVENTS 条，供 /api/audit/events 快速查询；
  - 多 worker（gunicorn -w 4）说明：内存缓冲按 worker 各自独立，
    完整审计以 JSONL 文件为准（未来可平滑替换为 ELK / Loki / 数据库表）。

企业版预留（当前未实现，不伪造）：
  - user_id / tenant_id 字段已在事件结构中预留，接入登录与多租户后直接填充；
  - 权限校验点（如「仅管理员可查审计」「企业 BI 凭证配置需管理员」）见 PERMISSION_POINTS。
"""
from __future__ import annotations

import os
import json
import time
import uuid
import threading
from collections import deque
from datetime import datetime

# ==================== 事件类型常量 ====================
# 问数链路
EVENT_CHAT_PLAN = "chat.plan"            # 智能问数·需求确认与 SQL 草案生成（确认前不执行）
EVENT_CHAT_CONFIRM = "chat.confirm"      # 智能问数·用户确认 SQL 后执行
EVENT_CHAT_AUTO = "chat.auto"            # 智能问数·降级链路自动取数（未经过草案确认）
EVENT_ENT_PLAN = "ent.plan"              # 企业 BI·需求确认与草案
EVENT_ENT_CONFIRM = "ent.confirm"        # 企业 BI·确认后执行
EVENT_ENT_CONNECT = "ent.connect_test"   # 企业 BI·连接测试
EVENT_DATASOURCE = "datasource.switch"   # 数据源切换 / 查看（预留）

# 事件结果取值
RESULT_SUCCESS = "success"
RESULT_FAILED = "failed"
RESULT_PENDING = "pending"   # 如草案待用户确认、连接测试处于 configured/mock 待联调态

MAX_MEMORY_EVENTS = 500
SQL_PREVIEW_LEN = 200
QUESTION_PREVIEW_LEN = 200

_LOCK = threading.Lock()
_MEMORY: deque[dict] = deque(maxlen=MAX_MEMORY_EVENTS)

# 敏感字段黑名单：任何事件字段名命中即拒绝写入（防止误把密钥记进审计）
_SENSITIVE_KEYS = {
    "api_key", "app_secret", "token", "user_jwt", "client_secret",
    "sophon_api_key", "password", "secret", "authorization",
}


def _log_dir() -> str:
    """审计日志目录：环境变量 AUDIT_LOG_DIR 优先，默认项目根 logs/audit/。"""
    custom = os.environ.get("AUDIT_LOG_DIR", "").strip()
    if custom:
        return custom
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    return os.path.join(root, "logs", "audit")


def _scrub(value):
    """递归清洗：脱敏敏感字段，避免密钥进入审计日志。"""
    if isinstance(value, dict):
        cleaned = {}
        for k, v in value.items():
            if str(k).lower() in _SENSITIVE_KEYS:
                cleaned[k] = "******"
            else:
                cleaned[k] = _scrub(v)
        return cleaned
    if isinstance(value, list):
        return [_scrub(v) for v in value]
    return value


def sql_preview(sql: str | None) -> dict:
    """SQL 审计摘要：只记长度与短预览，不记全文（全文可在会话内回看）。"""
    if not sql:
        return {"sql_length": 0, "sql_preview": ""}
    return {
        "sql_length": len(sql),
        "sql_preview": sql[:SQL_PREVIEW_LEN].replace("\n", " "),
    }


def record_event(kind: str, result: str = RESULT_SUCCESS, **fields) -> dict:
    """
    记录一条审计事件。

    常用字段（均可选）：
      question          用户问题（自动截断）
      datasource        数据源标识，如 currentLocal / fengshenBi
      staged_confirmed  是否经过「SQL 草案用户确认」环节
      sql_source        SQL 来源：llm / bank_fallback / template / mock
      mock_hit          是否命中 Mock / 演示取数
      error_type        失败时的错误类型（异常类名或错误码）
      error_message     失败摘要（自动截断，勿传密钥）
      row_count         返回行数
      duration_ms       耗时
      user_id / tenant_id  【企业版预留】接入登录体系后填充
    """
    event = {
        "event_id": uuid.uuid4().hex[:16],
        "ts": round(time.time(), 3),
        "time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "kind": kind,
        "result": result,
        # 企业版预留：当前无登录体系，固定为 anonymous；接入鉴权后由调用方传入
        "user_id": fields.pop("user_id", "anonymous"),
        "tenant_id": fields.pop("tenant_id", None),
    }
    if fields.get("question"):
        fields["question"] = str(fields["question"])[:QUESTION_PREVIEW_LEN]
    if fields.get("error_message"):
        fields["error_message"] = str(fields["error_message"])[:300]
    event.update(_scrub(fields))

    # 内存缓冲（线程安全）
    with _LOCK:
        _MEMORY.append(event)

    # JSONL 文件落地（按天滚动；失败不阻断主业务流程）
    try:
        log_dir = _log_dir()
        os.makedirs(log_dir, exist_ok=True)
        day = datetime.now().strftime("%Y%m%d")
        path = os.path.join(log_dir, f"audit-{day}.jsonl")
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(event, ensure_ascii=False) + "\n")
    except Exception:
        # 审计写盘失败不应影响问数主链路
        pass

    return event


def recent_events(limit: int = 20) -> list[dict]:
    """返回最近的审计事件（倒序：最新在前）。"""
    with _LOCK:
        items = list(_MEMORY)
    return list(reversed(items))[:max(1, min(limit, 200))]


def today_summary() -> dict:
    """今日审计摘要：事件总数、成功/失败数、最近事件时间。"""
    today = datetime.now().strftime("%Y-%m-%d")
    total = success = failed = 0
    last_ts = None
    with _LOCK:
        items = list(_MEMORY)
    for e in items:
        if not str(e.get("time", "")).startswith(today):
            continue
        total += 1
        if e.get("result") == RESULT_SUCCESS:
            success += 1
        elif e.get("result") == RESULT_FAILED:
            failed += 1
        if last_ts is None or e.get("ts", 0) > last_ts:
            last_ts = e.get("ts")
    return {
        "today_total": total,
        "today_success": success,
        "today_failed": failed,
        "last_event_ts": last_ts,
        "log_dir": _log_dir(),
    }


# ==================== 权限与安全边界（企业版预留） ====================
# 当前系统为单用户演示/团队内部部署，无登录鉴权；以下为企业版应受权限控制的操作点，
# 接入登录体系（如 OAuth / SSO）后应在此处对应接口加装饰器或中间件校验。
# 注意：当前版本【未实现】真正的权限拦截，不要在 UI 上声称「已支持权限管理」。
PERMISSION_POINTS = {
    "audit.read": {
        "desc": "查看审计事件（/api/audit/events）",
        "suggested_role": "管理员 / 数据治理",
        "implemented": False,
    },
    "ent.credential.write": {
        "desc": "配置企业 BI 凭证（/api/enterprise-bi/config）",
        "suggested_role": "管理员",
        "implemented": False,
    },
    "datasource.manage": {
        "desc": "切换/管理数据源",
        "suggested_role": "管理员",
        "implemented": False,
    },
    "chat.execute": {
        "desc": "确认并执行 SQL 查询（只读）",
        "suggested_role": "所有登录用户（只读权限）",
        "implemented": False,
    },
}
