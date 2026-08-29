"""
风神 BI（Fengshen BI）数据源 Provider —— 真实接入准备版（企业级接入层）。

==============================================================================
⚠️  真实性声明（务必先读）
==============================================================================
本文件在原有「Mock 占位」基础上，重构为「企业 BI 真实接入准备版」：

  ✅ 已真实具备：
     - 凭证配置读取（环境变量 + 运行时配置双通道）
     - 连接状态机（未配置 / Mock / 已配置未验证 / 已验证 / 真实可用）
     - 统一 HTTP Client 封装（鉴权头、超时、错误归一化）
     - API 响应 mapper（数据集 / Schema / 查询结果 → 统一接口格式）
     - 需求确认 → SQL 草案 → 确认执行的分阶段契约
     - 半真实演示链路（语义层指标识别 + LLM 生成 SQL 草案为真实能力，
       仅最终取数在未接真实 API 时使用明确标注的 Mock 数据）

  ❌ 尚未真实接通（等待风神 BI 官方资料，严禁伪造）：
     - 真实 API 端点路径（见下方 API_ENDPOINTS，全部为 None + TODO）
     - 鉴权换 token 的真实接口与字段
     - 数据集 / Schema / 预览 / SQL 代理 / 工作空间的真实请求与响应结构
     - 风神 BI 自有「语义问数」私有接口

  拿到《风神 BI OpenAPI 文档》和授权凭证后，只需：
     1. 填充 API_ENDPOINTS 中的真实路径；
     2. 在 _fetch_token() / _request() 中按文档调整鉴权方式；
     3. 在三个 _map_* mapper 中对齐真实响应字段；
     4. 将 self.is_real 切为 True（或由端点齐全后自动判定）。
  上层 API 路由、前端组件、分阶段状态机均无需改动。

环境变量（复用既有命名，勿另造）：
  FENGSHEN_BI_BASE_URL       API 地址
  FENGSHEN_BI_APP_ID         应用 ID
  FENGSHEN_BI_APP_SECRET     应用密钥
  FENGSHEN_BI_TOKEN          访问令牌（或由 app_id/secret 换取）
  FENGSHEN_BI_WORKSPACE_ID   工作空间 ID
==============================================================================
"""
from __future__ import annotations

import os
import json
import time
import random
import urllib.request
import urllib.error
from typing import Any

from src.datasource.base import DataSourceProvider


# ------------------------------------------------------------------
# 真实 API 端点表：拿到风神 BI OpenAPI 文档后在此填充。
# 全部为 None 表示「端点尚未提供」，此时不会发起任何伪造请求。
# 约定：值为相对路径（拼在 base_url 之后），如需 query 参数在调用处组装。
# ------------------------------------------------------------------
API_ENDPOINTS: dict[str, str | None] = {
    # TODO(风神BI文档): 鉴权——用 app_id + app_secret 换取 access_token 的路径
    "auth_token": None,          # 例: "/openapi/auth/token"
    # TODO(风神BI文档): 工作空间列表
    "workspaces": None,          # 例: "/openapi/workspaces"
    # TODO(风神BI文档): 数据集（数据表/模型）列表
    "datasets": None,            # 例: "/openapi/datasets"
    # TODO(风神BI文档): 数据集字段 Schema，需拼接 dataset_id
    "dataset_schema": None,      # 例: "/openapi/datasets/{id}/schema"
    # TODO(风神BI文档): 数据预览 / 采样
    "dataset_preview": None,     # 例: "/openapi/datasets/{id}/preview"
    # TODO(风神BI文档): SQL 查询代理（提交 SQL，异步/同步返回结果）
    "query": None,               # 例: "/openapi/query/sql"
    # TODO(风神BI文档): 风神 BI 自有「语义问数」接口（自然语言→结果），无文档则留 None
    "semantic_query": None,      # 例: "/openapi/ask"
}

# 密钥类字段（回显、日志时一律脱敏）
_SECRET_KEYS = {"app_secret", "token", "access_token"}


class FengshenBiProvider(DataSourceProvider):
    """风神 BI 数据源（真实接入准备版）。

    内部职责分层：
      配置读取  → _cfg() / configure()
      凭证状态机 → connection_status() / validate_credentials()
      HTTP 客户端 → _request() / _fetch_token()
      响应映射  → _map_dataset() / _map_schema() / _map_query_result()
      执行标准化 → run_query() / confirm_and_run()
    """

    # ---------------- 初始化 / 配置读取 ----------------
    def __init__(self):
        # 运行时通过 configure() 写入的配置（来自前端配置表单 / 后端托管密钥）
        self._runtime: dict[str, str] = {}
        # 缓存的 access_token（由 app_id/app_secret 换取后暂存于内存，不落盘）
        self._cached_token: str = ""
        self._token_expire_at: float = 0.0
        # 最近一次连通性验证结果（内存态，重启失效）
        self._last_verify: dict[str, Any] | None = None

    def _cfg(self, key: str) -> str:
        """统一配置读取：运行时配置优先，其次环境变量。"""
        if key in self._runtime and self._runtime[key] is not None:
            return str(self._runtime[key]).strip()
        env_map = {
            "base_url": "FENGSHEN_BI_BASE_URL",
            "app_id": "FENGSHEN_BI_APP_ID",
            "app_secret": "FENGSHEN_BI_APP_SECRET",
            "token": "FENGSHEN_BI_TOKEN",
            "workspace_id": "FENGSHEN_BI_WORKSPACE_ID",
        }
        return os.environ.get(env_map.get(key, ""), "").strip()

    @property
    def source_type(self) -> str:
        return "fengshenBi"

    @property
    def display_name(self) -> str:
        return "风神 BI（企业级接入层）"

    @property
    def is_real(self) -> bool:
        # 只有当查询所需的真实端点全部就绪且凭证验证通过，才算真实可用。
        # 当前 OpenAPI 端点未填充，恒为 False，避免伪造「已打通」。
        return self._endpoints_ready() and self.connection_status() == "verified"

    @property
    def is_available(self) -> bool:
        # 有 base_url 且（有 token 或有 app_id+app_secret）即视为「已配置」
        return bool(self._cfg("base_url") and
                    (self._cfg("token") or (self._cfg("app_id") and self._cfg("app_secret"))))

    def _endpoints_ready(self) -> bool:
        """查询主链路所需端点是否已全部填充真实路径。"""
        return all(API_ENDPOINTS.get(k) for k in ("datasets", "dataset_schema", "query"))

    # ---------------- 运行时配置 / 脱敏 ----------------
    def configure(self, config: dict[str, Any]) -> dict[str, Any]:
        """写入前端提交的凭证配置（只更新显式给出的键；空串清空）。"""
        allowed = {"base_url", "app_id", "app_secret", "token", "workspace_id"}
        changed = []
        for k, v in (config or {}).items():
            if k not in allowed:
                continue
            val = "" if v is None else str(v).strip()
            if val == "":
                # 空串表示「不修改」还是「清空」：这里约定前端显式传 null 才清空，
                # 空串忽略，避免表单未填项覆盖环境变量。
                if v is None and k in self._runtime:
                    self._runtime.pop(k, None)
                    changed.append(k)
                continue
            self._runtime[k] = val
            changed.append(k)
        # 配置变更后，重置验证状态与 token 缓存
        if changed:
            self._last_verify = None
            self._cached_token = ""
            self._token_expire_at = 0.0
        return {
            "ok": True,
            "supported": True,
            "message": f"风神 BI 配置已更新（{len(changed)} 项），请点击「测试连接」验证",
            "changed": changed,
            "config": self.masked_config(),
        }

    def masked_config(self) -> dict[str, Any]:
        """脱敏回显：密钥只显示是否已配置/末四位，绝不回显明文。"""
        def _mask(key: str) -> str:
            v = self._cfg(key)
            if not v:
                return ""
            if key in _SECRET_KEYS:
                return "••••••••" + (v[-4:] if len(v) >= 4 else "")
            return v
        return {
            "base_url": _mask("base_url"),
            "app_id": _mask("app_id"),
            "app_secret": _mask("app_secret"),
            "token": _mask("token"),
            "workspace_id": _mask("workspace_id"),
            "has_app_secret": bool(self._cfg("app_secret")),
            "has_token": bool(self._cfg("token")),
        }

    # ---------------- 连接状态机 ----------------
    def connection_status(self) -> str:
        """返回五种标准状态之一。"""
        if self.is_real:
            return "real_ready"
        if self._last_verify and self._last_verify.get("ok"):
            return "verified"
        if self.is_available:
            # 已填凭证但端点未就绪 / 未验证
            return "configured"
        # 未配置凭证：处于 Mock 演示模式
        return "mock"

    def validate_credentials(self, config: dict[str, Any] | None = None) -> dict[str, Any]:
        """连通性测试：写入配置（如有）→ 校验必填 → 尝试真实握手。"""
        if config:
            self.configure(config)
        t0 = time.time()
        checks: dict[str, Any] = {}
        status = self.connection_status()

        # 1) 必填项检查
        checks["base_url"] = bool(self._cfg("base_url"))
        checks["credential"] = bool(
            self._cfg("token") or (self._cfg("app_id") and self._cfg("app_secret"))
        )
        checks["workspace_id"] = bool(self._cfg("workspace_id"))
        checks["endpoints_ready"] = self._endpoints_ready()

        if not self.is_available:
            result = {
                "ok": False,
                "status": "mock",
                "message": "未配置风神 BI 凭证，当前运行于 Mock 演示模式（链路可用、数据为模拟）",
                "checked_at": time.time(),
                "elapsed_ms": round((time.time() - t0) * 1000, 1),
                "details": checks,
            }
            self._last_verify = result
            return result

        if not self._endpoints_ready():
            # 凭证已保存，但真实 API 端点尚未在 API_ENDPOINTS 填充 → 无法真正握手。
            result = {
                "ok": False,
                "status": "configured",
                "message": (
                    "凭证已保存。但风神 BI 真实 API 端点尚未配置（API_ENDPOINTS 待 OpenAPI 文档填充），"
                    "暂无法完成真实握手；当前以「已配置·待联调」状态运行，取数走 Mock 演示。"
                ),
                "checked_at": time.time(),
                "elapsed_ms": round((time.time() - t0) * 1000, 1),
                "details": {**checks, "todo": "填充 API_ENDPOINTS 并实现 _fetch_token/_request 后即可真实连通"},
            }
            self._last_verify = result
            return result

        # 2) 端点齐全 → 发起真实握手（拉取工作空间作为最轻量的鉴权验证）
        try:
            ws = self.list_workspaces()
            ok = bool(ws.get("success"))
            result = {
                "ok": ok,
                "status": "verified" if ok else "configured",
                "message": "连接成功，凭证有效" if ok else f"连接失败：{ws.get('message', '未知错误')}",
                "checked_at": time.time(),
                "elapsed_ms": round((time.time() - t0) * 1000, 1),
                "details": {**checks, "workspace_count": len(ws.get("workspaces", []))},
            }
        except Exception as e:
            result = {
                "ok": False,
                "status": "configured",
                "message": f"连接风神 BI 失败：{type(e).__name__}: {e}",
                "checked_at": time.time(),
                "elapsed_ms": round((time.time() - t0) * 1000, 1),
                "details": checks,
            }
        self._last_verify = result
        return result

    # ---------------- 统一 HTTP Client ----------------
    def _fetch_token(self) -> str:
        """用 app_id + app_secret 换取 access_token（内存缓存）。

        TODO(风神BI文档): 真实鉴权接口、请求体与响应字段未知。
          - 若平台直接下发长期 token：配置 FENGSHEN_BI_TOKEN 即可，本方法不触发。
          - 若需动态换 token：在此按文档实现 POST {auth_token} 并解析 access_token / 过期时间。
        """
        # 已配置静态 token，直接用
        if self._cfg("token"):
            return self._cfg("token")
        # 缓存未过期
        if self._cached_token and time.time() < self._token_expire_at:
            return self._cached_token

        path = API_ENDPOINTS.get("auth_token")
        if not path:
            raise RuntimeError(
                "风神 BI 鉴权端点未配置（API_ENDPOINTS['auth_token'] 待 OpenAPI 文档填充）"
            )
        # TODO(风神BI文档): 以下为标准 OAuth 风格占位，字段名需按文档调整。
        resp = self._raw_request(
            "POST", path,
            body={"app_id": self._cfg("app_id"), "app_secret": self._cfg("app_secret")},
            auth=False,
        )
        token = resp.get("access_token") or resp.get("data", {}).get("access_token", "")
        expires_in = int(resp.get("expires_in", 3600))
        if not token:
            raise RuntimeError(f"鉴权响应中未解析到 access_token：{list(resp.keys())}")
        self._cached_token = token
        self._token_expire_at = time.time() + max(60, expires_in - 60)
        return token

    def _raw_request(self, method: str, path: str, body: dict | None = None,
                     params: dict | None = None, auth: bool = True) -> dict[str, Any]:
        """统一 HTTP 请求封装：拼接 URL、注入鉴权头、超时与错误归一化。

        仅使用标准库 urllib，不引入第三方依赖。
        """
        base = self._cfg("base_url").rstrip("/")
        url = base + path
        if params:
            from urllib.parse import urlencode
            url += "?" + urlencode({k: v for k, v in params.items() if v is not None})

        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        if auth:
            token = self._fetch_token()
            headers["Authorization"] = f"Bearer {token}"
            # 部分平台用 app_id 头，按文档二选一/并存
            if self._cfg("app_id"):
                headers["X-App-Id"] = self._cfg("app_id")
            if self._cfg("workspace_id"):
                headers["X-Workspace-Id"] = self._cfg("workspace_id")

        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=int(os.environ.get("LLM_TIMEOUT", "30"))) as r:
                raw = r.read().decode("utf-8")
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as e:
            detail = ""
            try:
                detail = e.read().decode("utf-8")[:300]
            except Exception:
                pass
            raise RuntimeError(f"风神 BI API HTTP {e.code}: {detail}")
        except urllib.error.URLError as e:
            raise RuntimeError(f"风神 BI API 网络错误: {e.reason}")

    # ---------------- 响应 Mapper（真实响应 → 统一接口格式） ----------------
    def _map_dataset(self, item: dict[str, Any]) -> dict[str, Any]:
        """将风神 BI 数据集对象映射为统一数据集结构。

        TODO(风神BI文档): 字段名按真实响应调整，当前给出常见命名的兼容尝试。
        """
        data = item.get("data", item)
        return {
            "id": str(data.get("id") or data.get("dataset_id") or data.get("table_id") or ""),
            "name": str(data.get("name") or data.get("dataset_name") or data.get("title") or ""),
            "description": str(data.get("description") or data.get("desc") or ""),
            "row_count": int(data.get("row_count") or data.get("rowCount") or -1),
            "columns": int(data.get("column_count") or data.get("field_count") or 0),
        }

    def _map_schema(self, dataset_id: str, resp: dict[str, Any]) -> dict[str, Any]:
        """将风神 BI 字段元数据响应映射为统一 schema 结构。

        TODO(风神BI文档): 字段名/类型枚举按真实响应调整。
        """
        data = resp.get("data", resp)
        raw_cols = data.get("columns") or data.get("fields") or data.get("schema") or []
        columns = []
        for c in raw_cols:
            c = c.get("field", c) if isinstance(c, dict) else {}
            columns.append({
                "name": str(c.get("name") or c.get("field_name") or c.get("column") or ""),
                "type": str(c.get("type") or c.get("data_type") or "VARCHAR"),
                "description": str(c.get("description") or c.get("comment") or c.get("alias") or ""),
                "nullable": bool(c.get("nullable", True)),
            })
        name = data.get("name") or data.get("dataset_name") or dataset_id
        return {"id": dataset_id, "name": str(name), "columns": columns}

    def _map_query_result(self, resp: dict[str, Any]) -> dict[str, Any]:
        """将风神 BI SQL 查询响应标准化为统一结果结构。

        TODO(风神BI文档): 结果集可能是 columns+rows，也可能是 list[dict]，此处兼容。
        """
        data = resp.get("data", resp)
        # 形态 1：{columns: [...], rows: [[...], ...]}
        if isinstance(data.get("columns"), list) and isinstance(data.get("rows"), list):
            cols = data["columns"]
            columns = [c.get("name", c) if isinstance(c, dict) else str(c) for c in cols]
            rows = [list(r) for r in data["rows"]]
        # 形态 2：{records: [{col: val}, ...]}
        elif isinstance(data.get("records") or data.get("list"), list):
            records = data.get("records") or data.get("list")
            columns = list(records[0].keys()) if records else []
            rows = [[r.get(c) for c in columns] for r in records]
        else:
            columns, rows = [], []
        return {
            "success": True,
            "columns": columns,
            "rows": rows,
            "row_count": int(data.get("total") or data.get("row_count") or len(rows)),
            "error": None,
        }

    # ---------------- 工作空间 ----------------
    def list_workspaces(self) -> dict[str, Any]:
        if not API_ENDPOINTS.get("workspaces"):
            # 端点未提供：Mock 模式返回演示工作空间；已配置则明确提示待联调
            if self.is_available:
                return {"success": False, "workspaces": [], "not_supported": True,
                        "message": "工作空间接口端点待风神 BI OpenAPI 文档填充"}
            return {"success": True, "mock": True, "workspaces": [
                {"id": "ws_demo_001", "name": "[Mock] 默认经营分析工作空间", "role": "admin"},
            ]}
        resp = self._raw_request("GET", API_ENDPOINTS["workspaces"],
                                 params={"workspace_id": self._cfg("workspace_id") or None})
        data = resp.get("data", resp)
        items = data.get("workspaces") or data.get("list") or (data if isinstance(data, list) else [])
        workspaces = [{
            "id": str(w.get("id") or w.get("workspace_id")),
            "name": str(w.get("name") or w.get("workspace_name")),
            "role": str(w.get("role", "")),
        } for w in items]
        return {"success": True, "workspaces": workspaces}

    # ---------------- 健康检查 ----------------
    def health_check(self) -> dict[str, Any]:
        status = self.connection_status()
        status_text = {
            "mock": "未配置凭证 · Mock 演示模式（接口链路可用，数据为模拟）",
            "configured": "凭证已配置 · 待联调（真实 API 端点待 OpenAPI 文档填充）",
            "verified": "凭证已验证 · 连接正常",
            "real_ready": "真实可用",
            "unconfigured": "未配置",
        }.get(status, status)
        return {
            "ok": status in ("verified", "real_ready", "mock"),
            "source_type": self.source_type,
            "display_name": self.display_name,
            "is_real": self.is_real,
            "connection_status": status,
            "message": f"风神 BI：{status_text}",
            "details": {
                "base_url": self._cfg("base_url"),
                "workspace_id": self._cfg("workspace_id"),
                "configured": self.is_available,
                "endpoints_ready": self._endpoints_ready(),
                "mock_mode": status == "mock",
                "config": self.masked_config(),
                "missing_env": [] if self.is_available else [
                    "FENGSHEN_BI_BASE_URL",
                    "FENGSHEN_BI_TOKEN（或 FENGSHEN_BI_APP_ID + FENGSHEN_BI_APP_SECRET）",
                    "FENGSHEN_BI_WORKSPACE_ID",
                ],
            },
        }

    # ---------------- 数据集 / Schema / 预览 ----------------
    def list_datasets(self) -> list[dict[str, Any]]:
        if not self._endpoints_ready() or not self.is_available:
            return self._mock_datasets()
        resp = self._raw_request("GET", API_ENDPOINTS["datasets"],
                                 params={"workspace_id": self._cfg("workspace_id") or None})
        data = resp.get("data", resp)
        items = data.get("datasets") or data.get("list") or (data if isinstance(data, list) else [])
        return [self._map_dataset(it) for it in items]

    def get_dataset_schema(self, dataset_id: str) -> dict[str, Any]:
        if not self._endpoints_ready() or not self.is_available:
            cols = self._mock_schema(dataset_id)
            if not cols:
                return {"id": dataset_id, "name": dataset_id, "columns": [], "error": "数据集不存在（Mock）"}
            ds = next((d for d in self._mock_datasets() if d["id"] == dataset_id), {})
            return {"id": dataset_id, "name": ds.get("name", dataset_id), "columns": cols, "mock": True}
        path = API_ENDPOINTS["dataset_schema"].replace("{id}", dataset_id)
        resp = self._raw_request("GET", path,
                                 params={"workspace_id": self._cfg("workspace_id") or None})
        return self._map_schema(dataset_id, resp)

    def preview_dataset(self, dataset_id: str, limit: int = 20) -> dict[str, Any]:
        if not self._endpoints_ready() or not self.is_available:
            cols = self._mock_schema(dataset_id)
            if not cols:
                return {"success": False, "columns": [], "rows": [], "row_count": 0,
                        "error": f"数据集 {dataset_id} 不存在（Mock）"}
            preview_cols, rows = self._mock_preview(dataset_id, limit)
            return {"success": True, "columns": preview_cols, "rows": rows,
                    "row_count": len(rows), "error": None, "mock": True}
        path = API_ENDPOINTS["dataset_preview"].replace("{id}", dataset_id)
        resp = self._raw_request("GET", path,
                                 params={"limit": limit,
                                         "workspace_id": self._cfg("workspace_id") or None})
        result = self._map_query_result(resp)
        result["mock"] = False
        return result

    # ---------------- SQL 执行 / 确认执行 ----------------
    def run_query(self, sql: str, max_rows: int = 200) -> dict[str, Any]:
        start = time.time()
        # 真实端点 + 凭证就绪 → 走真实查询代理
        if self._endpoints_ready() and self.is_available:
            try:
                resp = self._raw_request(
                    "POST", API_ENDPOINTS["query"],
                    body={"sql": sql, "workspace_id": self._cfg("workspace_id"),
                          "limit": max_rows},
                )
                result = self._map_query_result(resp)
                result["elapsed_ms"] = round((time.time() - start) * 1000, 1)
                result["mock"] = False
                return result
            except Exception as e:
                return {"success": False, "columns": [], "rows": [], "row_count": 0,
                        "error": f"风神 BI 查询失败：{e}",
                        "elapsed_ms": round((time.time() - start) * 1000, 1)}

        # 已配置凭证但端点未就绪 → 不伪造真实取数，回退到模拟结果并明确标注「待联调」，
        # 保证「配置 → 验证 → 浏览 → SQL 确认 → 执行」整条演示链路可跑通。
        if self.is_available:
            result = self._mock_query_result(sql, start)
            result["pending_integration"] = True
            result["mock_note"] = (
                "凭证已配置，但风神 BI 真实查询端点待 OpenAPI 文档填充，暂无法真实取数；"
                "当前返回模拟结果。需求识别与 SQL 草案为真实生成。"
            )
            return result

        # 未配置凭证 → Mock 演示：返回与 SQL 意图相符的模拟结果（明确标注）
        return self._mock_query_result(sql, start)

    def confirm_and_run(self, sql: str, dataset_id: str | None = None,
                        max_rows: int = 200) -> dict[str, Any]:
        """用户确认 SQL 后执行。真实接入时可在此追加审计/权限校验/SQL 重写。"""
        result = self.run_query(sql, max_rows=max_rows)
        result["stage"] = "execute"
        result["dataset_id"] = dataset_id
        result["audited"] = True  # 标记：该 SQL 已经过用户确认
        return result

    def run_semantic_query(self, question: str, history: list | None = None) -> dict[str, Any]:
        """风神 BI 自有「语义问数」接口（预留，不伪造）。"""
        if not API_ENDPOINTS.get("semantic_query"):
            return {
                "success": False, "not_supported": True,
                "error": "风神 BI 语义问数接口端点待 OpenAPI 文档填充；当前请使用系统内置 Text-to-SQL 流程",
            }
        try:
            resp = self._raw_request(
                "POST", API_ENDPOINTS["semantic_query"],
                body={"question": question, "workspace_id": self._cfg("workspace_id"),
                      "history": history or []},
            )
            return self._map_query_result(resp)
        except Exception as e:
            return {"success": False, "error": f"风神 BI 语义问数失败：{e}", "not_supported": False}

    # ==================== Mock 演示数据（未接真实 API 时使用，均明确标注） ====================
    def _mock_datasets(self) -> list[dict]:
        return [
            {"id": "fs_sales_daily", "name": "销售日汇总数据集",
             "description": "[Mock] 按日期×渠道×品类汇总的销售额、订单量、客单价",
             "row_count": -1, "columns": 8},
            {"id": "fs_user_profile", "name": "用户画像数据集",
             "description": "[Mock] 用户注册信息、会员等级、区域、首末单时间",
             "row_count": -1, "columns": 10},
            {"id": "fs_product_performance", "name": "商品表现数据集",
             "description": "[Mock] 商品维度的销量、GMV、退货率、库存周转",
             "row_count": -1, "columns": 9},
        ]

    def _mock_schema(self, dataset_id: str) -> list[dict]:
        schemas = {
            "fs_sales_daily": [
                {"name": "dt", "type": "DATE", "description": "统计日期", "nullable": False},
                {"name": "channel", "type": "VARCHAR", "description": "渠道（线上/线下/小程序）", "nullable": False},
                {"name": "category", "type": "VARCHAR", "description": "商品品类", "nullable": True},
                {"name": "sales_amount", "type": "DECIMAL(18,2)", "description": "销售额（已支付）", "nullable": False},
                {"name": "order_count", "type": "INT", "description": "订单量", "nullable": False},
                {"name": "customer_count", "type": "INT", "description": "下单客户数", "nullable": False},
                {"name": "avg_order_value", "type": "DECIMAL(18,2)", "description": "客单价", "nullable": True},
                {"name": "refund_amount", "type": "DECIMAL(18,2)", "description": "退款金额", "nullable": True},
            ],
            "fs_user_profile": [
                {"name": "user_id", "type": "VARCHAR", "description": "用户ID", "nullable": False},
                {"name": "register_date", "type": "DATE", "description": "注册日期", "nullable": False},
                {"name": "gender", "type": "VARCHAR", "description": "性别", "nullable": True},
                {"name": "region", "type": "VARCHAR", "description": "区域", "nullable": True},
                {"name": "member_level", "type": "VARCHAR", "description": "会员等级", "nullable": True},
                {"name": "total_orders", "type": "INT", "description": "累计订单数", "nullable": True},
                {"name": "total_amount", "type": "DECIMAL(18,2)", "description": "累计消费金额", "nullable": True},
            ],
            "fs_product_performance": [
                {"name": "product_id", "type": "VARCHAR", "description": "商品ID", "nullable": False},
                {"name": "product_name", "type": "VARCHAR", "description": "商品名称", "nullable": False},
                {"name": "category", "type": "VARCHAR", "description": "品类", "nullable": True},
                {"name": "unit_price", "type": "DECIMAL(18,2)", "description": "单价", "nullable": False},
                {"name": "sales_qty", "type": "INT", "description": "销量", "nullable": False},
                {"name": "gmv", "type": "DECIMAL(18,2)", "description": "GMV", "nullable": False},
                {"name": "refund_rate", "type": "DECIMAL(5,4)", "description": "退货率", "nullable": True},
            ],
        }
        return schemas.get(dataset_id, [])

    def _mock_preview(self, dataset_id: str, limit: int) -> tuple[list[str], list[list]]:
        if dataset_id == "fs_sales_daily":
            cols = ["dt", "channel", "category", "sales_amount", "order_count", "customer_count", "avg_order_value"]
            channels = ["线上", "线下", "小程序"]
            categories = ["数码", "服饰", "食品"]
            rows = [[f"2026-06-{i+1:02d}", channels[i % 3], categories[i % 3],
                     round(random.uniform(5000, 50000), 2), random.randint(20, 300),
                     random.randint(15, 200), round(random.uniform(100, 800), 2)]
                    for i in range(min(limit, 10))]
            return cols, rows
        if dataset_id == "fs_user_profile":
            cols = ["user_id", "register_date", "region", "member_level", "total_orders", "total_amount"]
            rows = [[f"U{1000+i}", f"2025-0{i+1}-15", ["华东", "华南", "华北"][i % 3],
                     ["普通", "银卡", "金卡"][i % 3], random.randint(1, 50),
                     round(random.uniform(100, 20000), 2)] for i in range(min(limit, 10))]
            return cols, rows
        cols = ["product_id", "product_name", "category", "unit_price", "sales_qty", "gmv"]
        rows = [[f"P{2000+i}", f"商品{i+1}", ["数码", "服饰"][i % 2],
                 round(random.uniform(50, 2000), 2), random.randint(10, 500),
                 round(random.uniform(1000, 50000), 2)] for i in range(min(limit, 10))]
        return cols, rows

    def _mock_query_result(self, sql: str, start: float) -> dict[str, Any]:
        """Mock 演示：根据 SQL 关键词返回结构合理的模拟结果集（明确标注 mock）。"""
        sql_lower = (sql or "").lower()
        grouped = "group by" in sql_lower

        # 维度下钻类（含 GROUP BY）：按识别到的维度返回多行，便于演示柱状/折线图
        if grouped:
            note = "风神 BI 未配置，结果为模拟数据；语义识别与 SQL 草案为真实生成"
            if "channel" in sql_lower or "渠道" in sql:
                cols = ["channel", "sales_amount", "order_count"]
                rows = [["线上", 1286400.50, 4321], ["线下", 862300.00, 2987], ["小程序", 456800.75, 1766]]
            elif "category" in sql_lower or "品类" in sql:
                cols = ["category", "sales_amount"]
                rows = [["电子产品", 1523400.00], ["服装配饰", 982100.50], ["食品饮料", 645300.25], ["家居用品", 412800.00]]
            elif "region" in sql_lower or "区域" in sql:
                cols = ["region", "sales_amount"]
                rows = [["华东", 1342000.00], ["华南", 856000.50], ["华北", 623400.75], ["西部", 318900.00]]
            elif "member_level" in sql_lower or "会员" in sql:
                cols = ["member_level", "sales_amount"]
                rows = [["金卡", 1180200.00], ["银卡", 905600.50], ["普通", 623400.75]]
            elif "dt" in sql_lower or "order_date" in sql_lower or "日期" in sql:
                cols = ["dt", "sales_amount"]
                rows = [["2026-06-01", 86400.0], ["2026-06-02", 92300.5],
                        ["2026-06-03", 78100.0], ["2026-06-04", 103500.2], ["2026-06-05", 97200.8]]
            else:
                cols = ["dim_value", "sales_amount"]
                rows = [["类别 A", 1286400.50], ["类别 B", 862300.00], ["类别 C", 456800.75]]
            return {"success": True, "columns": cols, "rows": rows, "row_count": len(rows),
                    "error": None, "elapsed_ms": round((time.time() - start) * 1000, 1),
                    "mock": True, "mock_note": note}

        # 单值汇总（销售额等）
        cols = ["sales_amount"]
        rows = [[2605501.25]]
        return {"success": True, "columns": cols, "rows": rows, "row_count": 1,
                "error": None, "elapsed_ms": round((time.time() - start) * 1000, 1),
                "mock": True, "mock_note": "风神 BI 未配置，结果为模拟数据；语义识别与 SQL 草案为真实生成"}
