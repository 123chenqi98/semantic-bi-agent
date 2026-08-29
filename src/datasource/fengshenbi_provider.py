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

  📡 风神「取数」真实通道 = 风神 MCP 服务（标准 MCP 协议，非 REST OpenAPI）：
     依据《风神 MCP 服务》官方文档（邀测中，仅中国区，QPM≤3），取数能力通过
     3 个 MCP 工具暴露（工具名/参数/SQL 规范已在下方 MCP_TOOLS 固化为真实契约）：
       - get_data_set_by_appid(appId, Authorization)   数据集列表
       - get_schema(dataset_id, Authorization)         字段 schema（含口径/聚合/分区标记）
       - query_data_by_sql(dataSetId, sql, Authorization)  执行 SQL 取数
     SQL 规范：FROM 后表名写 `[数据集ID]`、列名写 `[列ID]`；isPartitionField=1 的
     分区字段必须在 WHERE 中筛选（默认 `[分区字段ID]`='${last_date}'），否则拒绝执行。
     鉴权：开发者后台申请 clientId/clientSecret + 调用时传「用户 JWT」（按该用户数据权限）。
     传输：内网走 byted_mcp_client（PSM=data.aeolus.data_set_query, region=cn）+ sophon api_key；
           公网/跨网可配置 MCP HTTP 网关（FENGSHEN_BI_MCP_GATEWAY_URL）走标准 MCP JSON-RPC。
     ⚠️ 内网 PSM SDK（byted_mcp_client）与 sophon 平台仅在字节内网可用，公网 ECS 无法直连；
        未配置网关/凭证时绝不发起伪造请求，自动回退到明确标注的 Mock 演示数据。

  📋 风神「OpenAPI」（见下方 API_ENDPOINTS）= 管理/嵌入类 REST 接口：
     用于仪表盘嵌入、用户/权限/行列权限/角色/审批流治理，不含「执行 SQL 取数」能力，
     故本 provider 的取数主链路以 MCP 为准；OpenAPI 端点仍保留占位供嵌入/治理场景扩展。

  ❌ 仍待真实联调（文档已给契约，但需内网环境 + 邀测凭证才能真正发起调用）：
     - MCP over HTTP 网关地址（FENGSHEN_BI_MCP_GATEWAY_URL），或内网 byted_mcp_client 运行环境
     - clientId/clientSecret（开发者后台申请）、用户 JWT、sophon api_key
     - get_schema / query_data_by_sql 的精确响应字段（mapper 已做兼容，待联调对齐）
     - 风神 BI 自有「自然语言问数」工具（当前 MCP 仅 3 个数据集工具，NL→SQL 由本系统 Agent 完成）

  拿到内网 MCP 网关地址（或在部署了 byted_mcp_client 的内网环境）+ 凭证后，只需：
     1. 配置 FENGSHEN_BI_MCP_GATEWAY_URL / client_id / client_secret / user_jwt；
     2. 在 _call_mcp_tool() 中按网关实际握手（MCP initialize / 鉴权头）微调；
     3. 在 _map_schema() 中对齐真实字段 ID / isPartitionField 字段名。
  上层 API 路由、前端组件、plan→confirm 分阶段状态机均无需改动。

环境变量（复用既有命名，勿另造）：
  【OpenAPI / 嵌入 / 通用】
  FENGSHEN_BI_BASE_URL       OpenAPI/网关地址
  FENGSHEN_BI_APP_ID         应用 ID（OpenAPI 用）
  FENGSHEN_BI_APP_SECRET     应用密钥（OpenAPI 用）
  FENGSHEN_BI_TOKEN          访问令牌（或由 app_id/secret 换取）
  FENGSHEN_BI_WORKSPACE_ID   工作空间/项目 ID（MCP 的 appId 取此值，回退 APP_ID）
  【风神 MCP 取数（真实通道）】
  FENGSHEN_BI_CLIENT_ID      开发者后台 clientId
  FENGSHEN_BI_CLIENT_SECRET  开发者后台 clientSecret（密钥）
  FENGSHEN_BI_USER_JWT       调用方用户 JWT（按用户数据权限鉴权，密钥）
  FENGSHEN_BI_SOPHON_API_KEY sophon 平台 api_key（内网 LLM/MCP 网关，密钥）
  FENGSHEN_BI_MCP_PSM        MCP 服务 PSM，默认 data.aeolus.data_set_query
  FENGSHEN_BI_MCP_REGION     区域，默认 cn（仅支持中国区）
  FENGSHEN_BI_MCP_GATEWAY_URL  MCP over HTTP(S) 网关地址（配置后走真实 JSON-RPC，跨网/公网用）
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
# 风神 OpenAPI（REST）端点表：面向「仪表盘嵌入 + 权限/资源治理」的管理类接口。
# 注意：OpenAPI 不含「执行 SQL 取数」能力，取数主链路请见下方 MCP_TOOLS（风神 MCP 服务）。
# 全部为 None 表示「端点尚未提供」，此时不会发起任何伪造请求。
# 约定：值为相对路径（拼在 base_url 之后），如需 query 参数在调用处组装。
# ------------------------------------------------------------------
API_ENDPOINTS: dict[str, str | None] = {
    # TODO(风神OpenAPI): 鉴权——用 app_id + app_secret 换取 access_token 的路径
    "auth_token": None,          # 例: "/openapi/auth/token"
    # TODO(风神OpenAPI): 工作空间/项目列表
    "workspaces": None,          # 例: "/openapi/workspaces"
    # TODO(风神OpenAPI): 仪表盘列表 / 报表 / 报表关联数据集（嵌入场景）
    "dashboards": None,          # 例: "/openapi/dashboards"
    # TODO(风神OpenAPI): 数据集（数据表/模型）治理类接口
    "datasets": None,            # 例: "/openapi/datasets"
    # TODO(风神OpenAPI): 数据集字段 Schema，需拼接 dataset_id
    "dataset_schema": None,      # 例: "/openapi/datasets/{id}/schema"
    # TODO(风神OpenAPI): 数据预览 / 采样
    "dataset_preview": None,     # 例: "/openapi/datasets/{id}/preview"
    # TODO(风神OpenAPI): SQL 查询代理（若 OpenAPI 后续开放取数再填；当前取数走 MCP）
    "query": None,               # 例: "/openapi/query/sql"
    # TODO(风神BI): 风神 BI 自有「语义问数」接口（自然语言→结果），当前 MCP 未提供，留 None
    "semantic_query": None,      # 例: "/openapi/ask"
}

# ==================================================================
# 风神 MCP 服务 —— 真实「取数」通道契约（来自《风神 MCP 服务》官方文档）
# ------------------------------------------------------------------
# 风神取数通过标准 MCP（Model Context Protocol）暴露 3 个数据集工具；
# 工具名、入参、SQL 书写规范均为文档确认的真实契约，非伪造。
# 传输方式二选一：
#   1) 内网：byted_mcp_client + PSM 服务发现（data.aeolus.data_set_query, region=cn）
#      + sophon api_key —— 仅字节内网可用，公网 ECS 不可达；
#   2) 网关：配置 FENGSHEN_BI_MCP_GATEWAY_URL 后，用标准库走 MCP JSON-RPC over HTTP。
# 未满足任一传输条件时不发起请求，回退明确标注的 Mock 演示数据。
# ==================================================================
MCP_SERVER_PSM_DEFAULT = "data.aeolus.data_set_query"
MCP_REGION_DEFAULT = "cn"
MCP_QPM_LIMIT = 3  # 文档约束：请求 QPM ≤ 3，仅中国区，大表超资源会失败

# MCP 工具契约：key 为本 provider 内部能力，value 为风神 MCP 真实工具名/入参/说明
MCP_TOOLS: dict[str, dict[str, Any]] = {
    "list_datasets": {
        "tool": "get_data_set_by_appid",
        "description": "根据项目 ID(appId) 与用户 JWT，获取该用户有权限的数据集列表",
        "params": ["appId", "Authorization"],  # appId=项目ID；Authorization=用户 JWT
    },
    "get_schema": {
        "tool": "get_schema",
        "description": "获取指定数据集 schema，字段需含 descr(口径)/isAggregated(是否已聚合)/isPartitionField(是否分区字段)",
        "params": ["dataset_id", "Authorization"],
    },
    "run_query": {
        "tool": "query_data_by_sql",
        "description": "在指定数据集上执行 SQL 取数；表名用 `[数据集ID]`、列名用 `[列ID]`，分区字段必须在 WHERE 筛选",
        "params": ["dataSetId", "sql", "Authorization"],
    },
}

# 密钥类字段（回显、日志时一律脱敏）
_SECRET_KEYS = {"app_secret", "token", "access_token",
                "client_secret", "user_jwt", "sophon_api_key"}


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
        # MCP JSON-RPC 自增请求 ID 与上次调用时间戳（用于 QPM≤3 进程内节流）
        self._mcp_rpc_id: int = 0
        self._mcp_last_call_ts: float = 0.0

    def _cfg(self, key: str) -> str:
        """统一配置读取：运行时配置优先，其次环境变量。"""
        if key in self._runtime and self._runtime[key] is not None:
            return str(self._runtime[key]).strip()
        env_map = {
            # OpenAPI / 通用
            "base_url": "FENGSHEN_BI_BASE_URL",
            "app_id": "FENGSHEN_BI_APP_ID",
            "app_secret": "FENGSHEN_BI_APP_SECRET",
            "token": "FENGSHEN_BI_TOKEN",
            "workspace_id": "FENGSHEN_BI_WORKSPACE_ID",
            # 风神 MCP 取数
            "client_id": "FENGSHEN_BI_CLIENT_ID",
            "client_secret": "FENGSHEN_BI_CLIENT_SECRET",
            "user_jwt": "FENGSHEN_BI_USER_JWT",
            "sophon_api_key": "FENGSHEN_BI_SOPHON_API_KEY",
            "mcp_psm": "FENGSHEN_BI_MCP_PSM",
            "mcp_region": "FENGSHEN_BI_MCP_REGION",
            "mcp_gateway_url": "FENGSHEN_BI_MCP_GATEWAY_URL",
        }
        val = os.environ.get(env_map.get(key, ""), "")
        # 带默认值的 MCP 非密钥项
        if not val and key == "mcp_psm":
            return MCP_SERVER_PSM_DEFAULT
        if not val and key == "mcp_region":
            return MCP_REGION_DEFAULT
        return val.strip()

    @property
    def source_type(self) -> str:
        return "fengshenBi"

    @property
    def display_name(self) -> str:
        return "风神 BI（企业级接入层）"

    # ---------------- MCP 取数通道就绪判定 ----------------
    def _mcp_app_id(self) -> str:
        """MCP 工具的 appId = 风神项目 ID：优先 workspace_id，回退 app_id。"""
        return self._cfg("workspace_id") or self._cfg("app_id")

    def _mcp_has_cred(self) -> bool:
        """是否已具备 MCP 调用凭证：项目 ID + 鉴权（用户 JWT，或 clientId/Secret）。"""
        has_auth = bool(self._cfg("user_jwt") or
                        (self._cfg("client_id") and self._cfg("client_secret")))
        return bool(self._mcp_app_id() and has_auth)

    def _mcp_gateway(self) -> str:
        """MCP over HTTP(S) 网关地址（跨网/公网走标准 JSON-RPC）；未配置返回空。"""
        return self._cfg("mcp_gateway_url").rstrip("/")

    def _mcp_ready(self) -> bool:
        """MCP 取数是否可真实发起：凭证齐全 且 传输通道就绪。

        - 网关方式：配置了 FENGSHEN_BI_MCP_GATEWAY_URL 即可用标准库发起 MCP JSON-RPC；
        - 内网 PSM 方式：依赖 byted_mcp_client（仅字节内网可装/可达），公网 ECS 不具备，
          故不作为自动就绪判据，需在部署了该 SDK 的内网环境显式启用（见 _call_mcp_tool）。
        """
        return self._mcp_has_cred() and bool(self._mcp_gateway())

    def _rest_ready(self) -> bool:
        """OpenAPI REST 取数端点是否齐全（当前 OpenAPI 不含取数，恒为 False）。"""
        return all(API_ENDPOINTS.get(k) for k in ("datasets", "dataset_schema", "query"))

    @property
    def is_real(self) -> bool:
        """真实可用：MCP 取数通道就绪，或 OpenAPI REST 取数端点齐全且已验证。

        注意：不调用 connection_status()，避免与本属性互相递归。
        """
        if self._mcp_ready():
            return True
        return self._rest_ready() and bool(self._last_verify and self._last_verify.get("ok"))

    @property
    def is_available(self) -> bool:
        """已配置（任一通道具备凭证）：MCP 凭证 或 OpenAPI 凭证。"""
        if self._mcp_has_cred():
            return True
        return bool(self._cfg("base_url") and
                    (self._cfg("token") or (self._cfg("app_id") and self._cfg("app_secret"))))

    def _endpoints_ready(self) -> bool:
        """取数链路是否就绪（MCP 或 REST 任一）。"""
        return self._mcp_ready() or self._rest_ready()

    # ---------------- 运行时配置 / 脱敏 ----------------
    def configure(self, config: dict[str, Any]) -> dict[str, Any]:
        """写入前端提交的凭证配置（只更新显式给出的键；空串清空）。"""
        allowed = {"base_url", "app_id", "app_secret", "token", "workspace_id",
                   # 风神 MCP 取数
                   "client_id", "client_secret", "user_jwt", "sophon_api_key",
                   "mcp_psm", "mcp_region", "mcp_gateway_url"}
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
            # 风神 MCP 取数通道
            "client_id": _mask("client_id"),
            "client_secret": _mask("client_secret"),
            "user_jwt": _mask("user_jwt"),
            "sophon_api_key": _mask("sophon_api_key"),
            "mcp_psm": self._cfg("mcp_psm"),
            "mcp_region": self._cfg("mcp_region"),
            "mcp_gateway_url": _mask("mcp_gateway_url"),
            "has_client_secret": bool(self._cfg("client_secret")),
            "has_user_jwt": bool(self._cfg("user_jwt")),
            "has_sophon_api_key": bool(self._cfg("sophon_api_key")),
            "mcp_ready": self._mcp_ready(),
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

        # 1) 必填项检查（OpenAPI 通道 + MCP 取数通道）
        checks["base_url"] = bool(self._cfg("base_url"))
        checks["credential"] = bool(
            self._cfg("token") or (self._cfg("app_id") and self._cfg("app_secret"))
        )
        checks["workspace_id"] = bool(self._cfg("workspace_id"))
        checks["mcp_app_id"] = bool(self._mcp_app_id())
        checks["mcp_credential"] = bool(
            self._cfg("user_jwt") or (self._cfg("client_id") and self._cfg("client_secret"))
        )
        checks["mcp_gateway"] = bool(self._mcp_gateway())
        checks["mcp_ready"] = self._mcp_ready()
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

        # 2) MCP 取数通道就绪 → 真实握手（调用 get_data_set_by_appid 拉数据集列表）
        if self._mcp_ready():
            try:
                datasets = self.list_datasets()  # _mcp_ready 为真时走真实 MCP
                result = {
                    "ok": True,
                    "status": "real_ready",
                    "message": f"风神 MCP 连接成功，凭证有效，可访问 {len(datasets)} 个数据集",
                    "checked_at": time.time(),
                    "elapsed_ms": round((time.time() - t0) * 1000, 1),
                    "details": {**checks, "channel": "mcp", "dataset_count": len(datasets)},
                }
            except Exception as e:
                result = {
                    "ok": False,
                    "status": "configured",
                    "message": f"风神 MCP 握手失败：{type(e).__name__}: {e}",
                    "checked_at": time.time(),
                    "elapsed_ms": round((time.time() - t0) * 1000, 1),
                    "details": checks,
                }
            self._last_verify = result
            return result

        # 3) MCP 凭证已配但缺传输通道（公网 ECS 无法直连内网 PSM）
        if self._mcp_has_cred() and not self._mcp_gateway():
            result = {
                "ok": False,
                "status": "configured",
                "message": (
                    "风神 MCP 凭证已保存，但取数服务仅在字节内网可达（byted_mcp_client / PSM="
                    f"{self._cfg('mcp_psm')}），当前环境未配置 MCP HTTP 网关"
                    "（FENGSHEN_BI_MCP_GATEWAY_URL），公网 ECS 无法直连；暂以「已配置·待内网联调」"
                    "状态运行，取数回退 Mock 演示。"
                ),
                "checked_at": time.time(),
                "elapsed_ms": round((time.time() - t0) * 1000, 1),
                "details": {**checks, "channel": "mcp",
                            "todo": "在内网部署 byted_mcp_client，或配置可达的 FENGSHEN_BI_MCP_GATEWAY_URL"},
            }
            self._last_verify = result
            return result

        # 4) 仅 OpenAPI（管理/嵌入）凭证：OpenAPI 不含取数，取数仍走 Mock
        if not self._rest_ready():
            result = {
                "ok": False,
                "status": "configured",
                "message": (
                    "OpenAPI 凭证已保存。注意：风神 OpenAPI 为仪表盘嵌入/权限治理类接口，不含「执行 SQL 取数」；"
                    "取数请改用风神 MCP 服务（配置 clientId/clientSecret + 用户 JWT + MCP 网关）。"
                    "当前取数回退 Mock 演示。"
                ),
                "checked_at": time.time(),
                "elapsed_ms": round((time.time() - t0) * 1000, 1),
                "details": {**checks, "channel": "openapi",
                            "todo": "取数主链路为 MCP，见 MCP_TOOLS / 部署文档「风神 MCP 真实接入指引」"},
            }
            self._last_verify = result
            return result

        # 5) OpenAPI REST 取数端点齐全（未来开放时）→ 拉工作空间做最轻量握手
        try:
            ws = self.list_workspaces()
            ok = bool(ws.get("success"))
            result = {
                "ok": ok,
                "status": "verified" if ok else "configured",
                "message": "连接成功，凭证有效" if ok else f"连接失败：{ws.get('message', '未知错误')}",
                "checked_at": time.time(),
                "elapsed_ms": round((time.time() - t0) * 1000, 1),
                "details": {**checks, "channel": "openapi",
                            "workspace_count": len(ws.get("workspaces", []))},
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

    # ---------------- 风神 MCP 客户端（取数真实通道，标准 MCP JSON-RPC） ----------------
    def _mcp_authorization(self) -> str:
        """MCP 工具按「用户 JWT」鉴权（文档中的 Authorization 入参）。

        优先使用用户 JWT（按该用户数据权限返回）；未配置则回退静态 token。
        clientId/clientSecret 为应用级凭证，随请求头提交给网关（头名待联调对齐）。
        """
        return self._cfg("user_jwt") or self._cfg("token")

    def _mcp_throttle(self) -> None:
        """进程内节流：风神 MCP 约束 QPM ≤ 3（每分钟最多 3 次），超量会被拒绝。

        仅在真实发起 MCP 调用时生效（Mock 演示不触发），保证最小调用间隔。
        """
        qpm = MCP_QPM_LIMIT
        if qpm <= 0:
            return
        now = time.time()
        min_interval = 60.0 / qpm
        if self._mcp_last_call_ts > 0:
            wait = min_interval - (now - self._mcp_last_call_ts)
            if wait > 0:
                time.sleep(wait)
                now = time.time()
        self._mcp_last_call_ts = now

    def _call_mcp_tool(self, capability: str, arguments: dict[str, Any]) -> Any:
        """调用风神 MCP 工具（统一入口）。

        capability 为本 provider 内部能力键（list_datasets/get_schema/run_query），
        自动映射到 MCP_TOOLS 中的真实工具名与入参。传输方式：
          - 配置了 FENGSHEN_BI_MCP_GATEWAY_URL → 标准 MCP JSON-RPC over HTTP(S)；
          - 否则走内网 PSM（byted_mcp_client，仅字节内网，公网不可达）。
        """
        spec = MCP_TOOLS.get(capability)
        if not spec:
            raise RuntimeError(f"未知风神 MCP 能力：{capability}")
        tool = str(spec["tool"])
        if self._mcp_gateway():
            return self._call_mcp_via_gateway(tool, arguments)
        return self._call_mcp_via_psm(tool, arguments)

    def _call_mcp_via_gateway(self, tool: str, arguments: dict[str, Any]) -> Any:
        """通过 MCP over HTTP(S) 网关调用（标准库 urllib，无第三方依赖）。

        采用 MCP 规范的 JSON-RPC 2.0 tools/call；部分网关为 Streamable HTTP，
        响应可能是 text/event-stream（SSE），_parse_mcp_response 已兼容。
        TODO(内网联调): 网关若要求先 initialize 握手 / 特定鉴权头，在此补齐。
        """
        self._mcp_throttle()
        self._mcp_rpc_id += 1
        payload = {
            "jsonrpc": "2.0",
            "id": self._mcp_rpc_id,
            "method": "tools/call",
            "params": {"name": tool, "arguments": arguments},
        }
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        }
        auth = self._mcp_authorization()
        if auth:
            headers["Authorization"] = auth if auth.lower().startswith("bearer ") else f"Bearer {auth}"
        # 应用级凭证 / sophon key 随头提交（具体头名以网关约定为准，待联调）
        if self._cfg("client_id"):
            headers["X-Client-Id"] = self._cfg("client_id")
        if self._cfg("client_secret"):
            headers["X-Client-Secret"] = self._cfg("client_secret")
        if self._cfg("sophon_api_key"):
            headers["X-Sophon-Api-Key"] = self._cfg("sophon_api_key")

        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(self._mcp_gateway(), data=data, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=int(os.environ.get("LLM_TIMEOUT", "60"))) as r:
                raw = r.read().decode("utf-8", "ignore")
        except urllib.error.HTTPError as e:
            detail = ""
            try:
                detail = e.read().decode("utf-8", "ignore")[:300]
            except Exception:
                pass
            raise RuntimeError(f"风神 MCP 网关 HTTP {e.code}: {detail}")
        except urllib.error.URLError as e:
            raise RuntimeError(f"风神 MCP 网关网络错误: {e.reason}")
        return self._parse_mcp_response(raw, tool)

    def _call_mcp_via_psm(self, tool: str, arguments: dict[str, Any]) -> Any:
        """内网 PSM 方式：依赖字节内网 byted_mcp_client（公网 ECS 不可装/不可达）。

        在内网机器/堡垒机部署时，在此用
            byted_mcp_client_with_server_psm(['data.aeolus.data_set_query'], region='cn')
        发起 tools/call，并以 sophon api_key + clientId/clientSecret + 用户 JWT 鉴权。
        此处不伪造该内网 SDK 的导入与调用（公网环境无此包），显式报错以引导正确部署。
        """
        raise RuntimeError(
            "风神 MCP 内网 PSM 通道需在字节内网通过 byted_mcp_client 调用"
            f"（PSM={self._cfg('mcp_psm')}, region={self._cfg('mcp_region')}）；"
            "当前运行环境无该内网 SDK 且公网不可达。请在内网/堡垒机环境运行，"
            "或配置可达的 FENGSHEN_BI_MCP_GATEWAY_URL 走 HTTP 网关。"
        )

    def _parse_mcp_response(self, raw: str, tool: str) -> Any:
        """解析 MCP JSON-RPC 响应（兼容普通 JSON 与 SSE 流），返回工具业务数据。"""
        obj = self._loads_mcp(raw)
        if not isinstance(obj, dict):
            return obj
        if obj.get("error"):
            err = obj["error"]
            msg = err.get("message") if isinstance(err, dict) else str(err)
            raise RuntimeError(f"风神 MCP 工具 {tool} 返回错误：{msg}")
        result = obj.get("result", obj)
        if isinstance(result, dict) and result.get("isError"):
            raise RuntimeError(f"风神 MCP 工具 {tool} 执行失败：{result.get('content')}")
        # MCP 工具结果统一放在 result.content[*].text（文本块，通常为 JSON 字符串）
        content = result.get("content") if isinstance(result, dict) else None
        if isinstance(content, list):
            texts = [c.get("text", "") for c in content
                     if isinstance(c, dict) and c.get("type") == "text"]
            joined = "\n".join(t for t in texts if t)
            if joined:
                try:
                    return json.loads(joined)
                except Exception:
                    return {"text": joined}
        # 部分网关直接返回业务 JSON
        return result.get("data", result) if isinstance(result, dict) else result

    @staticmethod
    def _loads_mcp(raw: str) -> Any:
        """从 MCP 响应文本加载 JSON：优先整体解析，失败则按 SSE 的 data: 行解析。"""
        raw = (raw or "").strip()
        if not raw:
            return {}
        if raw.startswith("{"):
            try:
                return json.loads(raw)
            except Exception:
                pass
        data_lines = [ln[5:].strip() for ln in raw.splitlines()
                      if ln.startswith("data:") and ln[5:].strip()]
        for ln in reversed(data_lines):
            try:
                return json.loads(ln)
            except Exception:
                continue
        return {}

    # ---------------- 风神 MCP SQL 规范转译（标准 SQL → `[数据集ID]`/`[列ID]` 方言） ----------------
    def _to_aeolus_sql(self, sql: str, dataset_id: str, schema: dict[str, Any]) -> str:
        """将本系统生成的标准 SQL 转译为风神 MCP query_data_by_sql 要求的方言。

        文档规范：
          - FROM 后表名替换为 `` `[数据集ID]` ``（单数据集查询）；
          - 列名替换为 `` `[列ID]` ``（依据 get_schema 返回的字段 ID）；
          - 凡 isPartitionField=1 的分区字段必须在 WHERE 筛选，缺失则注入
            默认 `` `[分区字段ID]`='${last_date}' ``，否则服务端拒绝执行。
        返回转译后的 SQL 字符串（纯字符串处理，不发起网络请求）。
        """
        import re
        out = sql or ""
        cols = schema.get("columns", []) if isinstance(schema, dict) else []

        # 1) 表名 → `[数据集ID]`：替换 FROM/JOIN 后的标识符（MCP 以单数据集查询为主）
        ds_ref = f"`[{dataset_id}]`"
        out = re.sub(r"\b(?:from|join)\s+[`\"\[]?[\w.]+[`\"\]]?",
                     lambda m: re.sub(r"[`\"\[]?[\w.]+[`\"\]]?$", ds_ref, m.group(0)),
                     out, flags=re.IGNORECASE)

        # 2) 列名 → `[列ID]`：仅替换 schema 中能映射到字段 ID 的列（按词边界，避开字符串/别名）
        col_id: dict[str, str] = {}
        partition_ids: list[str] = []
        for c in cols:
            if not isinstance(c, dict):
                continue
            fid = str(c.get("field_id") or c.get("id") or "")
            cname = str(c.get("name") or "")
            if fid and cname:
                col_id[cname] = fid
            if fid and c.get("is_partition"):
                partition_ids.append(fid)

        def _repl_col(m: re.Match) -> str:
            word = m.group(0)
            # 跳过已被反引号包裹的 MCP 引用
            return f"`[{col_id[word]}]`" if word in col_id else word

        if col_id:
            out = re.sub(r"(?<![`\w.])[A-Za-z_][A-Za-z0-9_]*(?![`\w])", _repl_col, out)

        # 3) 分区字段强制 WHERE 筛选：缺失则注入默认 '${last_date}'
        low = out.lower()
        for pid in partition_ids:
            ref = f"`[{pid}]`"
            if ref in out:
                continue  # 已筛选
            cond = f"{ref}='${{last_date}}'"
            if " where " in low:
                out = re.sub(r"(?i)\bwhere\b", f"WHERE {cond} AND ", out, count=1)
            else:
                # 无 WHERE：在 GROUP BY/ORDER BY/LIMIT 之前插入
                m = re.search(r"(?i)\b(group\s+by|order\s+by|limit)\b", out)
                if m:
                    idx = m.start()
                    out = out[:idx] + f" WHERE {cond} " + out[idx:]
                else:
                    out = out.rstrip().rstrip(";") + f" WHERE {cond}"
        return out

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
        """将风神字段元数据响应映射为统一 schema 结构。

        兼容 MCP get_schema：字段含 descr(口径)、isAggregated(是否已聚合)、
        isPartitionField(是否分区字段) 以及字段 ID（用于 `[列ID]` SQL 转译）。
        TODO(内网联调): 字段 ID / 分区标记的确切键名以真实响应为准，此处做多命名兼容。
        """
        data = resp.get("data", resp) if isinstance(resp, dict) else {}
        raw_cols = (data.get("columns") or data.get("fields") or data.get("schema")
                    or data.get("list") or (data if isinstance(data, list) else []))
        columns = []
        for c in raw_cols:
            c = c.get("field", c) if isinstance(c, dict) else {}
            if not isinstance(c, dict):
                continue
            columns.append({
                "name": str(c.get("name") or c.get("fieldName") or c.get("field_name")
                             or c.get("column") or c.get("en_name") or ""),
                "type": str(c.get("type") or c.get("dataType") or c.get("data_type") or "VARCHAR"),
                # MCP 文档字段口径键名为 descr
                "description": str(c.get("descr") or c.get("description")
                                   or c.get("comment") or c.get("alias") or ""),
                "nullable": bool(c.get("nullable", True)),
                # 字段 ID：SQL 中列名需替换为 `[字段ID]`
                "field_id": str(c.get("id") or c.get("fieldId") or c.get("field_id")
                                or c.get("columnId") or ""),
                # MCP isAggregated：该字段是否已聚合（已聚合字段不再套 SUM 等）
                "is_aggregated": bool(c.get("isAggregated") or c.get("is_aggregated")),
                # MCP isPartitionField：分区字段，必须在 WHERE 筛选
                "is_partition": bool(c.get("isPartitionField") or c.get("is_partition")
                                     or c.get("isPartition")),
            })
        name = ""
        if isinstance(data, dict):
            name = str(data.get("name") or data.get("dataset_name") or data.get("datasetName") or "")
        return {"id": dataset_id, "name": name or dataset_id, "columns": columns}

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
            "configured": "凭证已配置 · 待内网联调（风神取数走 MCP，需内网网关/byted_mcp_client）",
            "verified": "凭证已验证 · 连接正常",
            "real_ready": "真实可用（风神 MCP 取数通道已连通）",
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
                "mcp_ready": self._mcp_ready(),
                "mcp_psm": self._cfg("mcp_psm"),
                "mcp_region": self._cfg("mcp_region"),
                "mcp_gateway_configured": bool(self._mcp_gateway()),
                "channel": "mcp" if self._mcp_ready() else ("openapi" if self._rest_ready() else "mock"),
                "mock_mode": status == "mock",
                "config": self.masked_config(),
                "missing_env": [] if self.is_available else [
                    "【MCP 取数】FENGSHEN_BI_WORKSPACE_ID(项目ID) + FENGSHEN_BI_USER_JWT"
                    "（或 FENGSHEN_BI_CLIENT_ID + FENGSHEN_BI_CLIENT_SECRET）",
                    "【MCP 传输】FENGSHEN_BI_MCP_GATEWAY_URL（公网/跨网）或内网 byted_mcp_client 环境",
                    "【OpenAPI 嵌入，可选】FENGSHEN_BI_BASE_URL + FENGSHEN_BI_TOKEN",
                ],
            },
        }

    # ---------------- 数据集 / Schema / 预览 ----------------
    def list_datasets(self) -> list[dict[str, Any]]:
        # 1) 风神 MCP 真实通道：get_data_set_by_appid(appId, Authorization)
        if self._mcp_ready():
            resp = self._call_mcp_tool("list_datasets", {
                "appId": self._mcp_app_id(),
                "Authorization": self._mcp_authorization(),
            })
            data = resp.get("data", resp) if isinstance(resp, dict) else resp
            items = (data.get("datasets") or data.get("list") or data.get("dataSets")
                     or (data if isinstance(data, list) else []))
            return [self._map_dataset(it) for it in items if isinstance(it, dict)]
        # 2) OpenAPI REST（未来开放取数时）
        if self._rest_ready() and self.is_available:
            resp = self._raw_request("GET", API_ENDPOINTS["datasets"],
                                     params={"workspace_id": self._cfg("workspace_id") or None})
            data = resp.get("data", resp)
            items = data.get("datasets") or data.get("list") or (data if isinstance(data, list) else [])
            return [self._map_dataset(it) for it in items]
        # 3) Mock 演示
        return self._mock_datasets()

    def get_dataset_schema(self, dataset_id: str) -> dict[str, Any]:
        # 1) 风神 MCP 真实通道：get_schema(dataset_id, Authorization)
        if self._mcp_ready():
            resp = self._call_mcp_tool("get_schema", {
                "dataset_id": dataset_id,
                "Authorization": self._mcp_authorization(),
            })
            schema = self._map_schema(dataset_id, resp if isinstance(resp, dict) else {"data": resp})
            schema["mock"] = False
            schema["channel"] = "mcp"
            return schema
        # 2) OpenAPI REST
        if self._rest_ready() and self.is_available:
            path = API_ENDPOINTS["dataset_schema"].replace("{id}", dataset_id)
            resp = self._raw_request("GET", path,
                                     params={"workspace_id": self._cfg("workspace_id") or None})
            return self._map_schema(dataset_id, resp)
        # 3) Mock 演示
        cols = self._mock_schema(dataset_id)
        if not cols:
            return {"id": dataset_id, "name": dataset_id, "columns": [], "error": "数据集不存在（Mock）"}
        ds = next((d for d in self._mock_datasets() if d["id"] == dataset_id), {})
        return {"id": dataset_id, "name": ds.get("name", dataset_id), "columns": cols, "mock": True}

    def preview_dataset(self, dataset_id: str, limit: int = 20) -> dict[str, Any]:
        # 风神 MCP 仅 3 个数据集工具（列表/schema/SQL 取数），无独立预览接口
        if self._mcp_ready():
            return {"success": True, "columns": [], "rows": [], "row_count": 0,
                    "not_supported": True, "mock": False, "channel": "mcp",
                    "message": "风神 MCP 未提供独立数据预览工具，请通过「问数 → SQL 草案确认 → 执行」取数"}
        # OpenAPI REST 预览端点
        if self._rest_ready() and self.is_available:
            path = API_ENDPOINTS["dataset_preview"].replace("{id}", dataset_id)
            resp = self._raw_request("GET", path,
                                     params={"limit": limit,
                                             "workspace_id": self._cfg("workspace_id") or None})
            result = self._map_query_result(resp)
            result["mock"] = False
            result["channel"] = "openapi"
            return result
        # Mock 演示
        cols = self._mock_schema(dataset_id)
        if not cols:
            return {"success": False, "columns": [], "rows": [], "row_count": 0,
                    "error": f"数据集 {dataset_id} 不存在（Mock）"}
        preview_cols, rows = self._mock_preview(dataset_id, limit)
        return {"success": True, "columns": preview_cols, "rows": rows,
                "row_count": len(rows), "error": None, "mock": True}

    # ---------------- SQL 执行 / 确认执行 ----------------
    def run_query(self, sql: str, max_rows: int = 200,
                  dataset_id: str | None = None) -> dict[str, Any]:
        start = time.time()

        # 1) 风神 MCP 真实取数：query_data_by_sql(dataSetId, sql, Authorization)
        #    先取 schema 拿「列 ID / 分区字段」，把标准 SQL 转译为 `[数据集ID]`/`[列ID]` 方言。
        if self._mcp_ready():
            ds_id = str(dataset_id or "").strip()
            if not ds_id:
                return {"success": False, "columns": [], "rows": [], "row_count": 0,
                        "error": "风神 MCP 查询需指定数据集 dataSetId（请在 plan 阶段选择数据集）",
                        "elapsed_ms": round((time.time() - start) * 1000, 1), "channel": "mcp"}
            try:
                schema = self.get_dataset_schema(ds_id)  # 真实 MCP get_schema
                aeolus_sql = self._to_aeolus_sql(sql, ds_id, schema)
                resp = self._call_mcp_tool("run_query", {
                    "dataSetId": ds_id,
                    "sql": aeolus_sql,
                    "Authorization": self._mcp_authorization(),
                })
                result = self._map_query_result(resp if isinstance(resp, dict) else {"data": resp})
                result["elapsed_ms"] = round((time.time() - start) * 1000, 1)
                result["mock"] = False
                result["channel"] = "mcp"
                result["dataset_id"] = ds_id
                result["transpiled_sql"] = aeolus_sql  # 回传转译后的风神 SQL，便于审计/展示
                return result
            except Exception as e:
                return {"success": False, "columns": [], "rows": [], "row_count": 0,
                        "error": f"风神 MCP 查询失败：{type(e).__name__}: {e}",
                        "elapsed_ms": round((time.time() - start) * 1000, 1), "channel": "mcp"}

        # 2) OpenAPI REST 查询代理（未来开放取数时）
        if self._rest_ready() and self.is_available:
            try:
                resp = self._raw_request(
                    "POST", API_ENDPOINTS["query"],
                    body={"sql": sql, "workspace_id": self._cfg("workspace_id"),
                          "limit": max_rows},
                )
                result = self._map_query_result(resp)
                result["elapsed_ms"] = round((time.time() - start) * 1000, 1)
                result["mock"] = False
                result["channel"] = "openapi"
                return result
            except Exception as e:
                return {"success": False, "columns": [], "rows": [], "row_count": 0,
                        "error": f"风神 BI 查询失败：{e}",
                        "elapsed_ms": round((time.time() - start) * 1000, 1)}

        # 3) 已配置凭证但取数通道未就绪 → 不伪造真实取数，回退模拟结果并标注「待内网联调」，
        #    保证「配置 → 验证 → 浏览 → SQL 确认 → 执行」整条演示链路可跑通。
        if self.is_available:
            result = self._mock_query_result(sql, start)
            result["pending_integration"] = True
            if self._mcp_has_cred():
                result["mock_note"] = (
                    "风神 MCP 凭证已配置，但取数服务仅字节内网可达（byted_mcp_client/PSM），"
                    "当前环境未配置 MCP HTTP 网关（FENGSHEN_BI_MCP_GATEWAY_URL），暂无法真实取数；"
                    "当前返回模拟结果。需求识别与 SQL 草案为真实生成。"
                )
            else:
                result["mock_note"] = (
                    "凭证已配置，但风神 OpenAPI 为管理/嵌入类接口、不含取数；取数需走风神 MCP 服务"
                    "（clientId/clientSecret + 用户 JWT + MCP 网关）。当前返回模拟结果，"
                    "需求识别与 SQL 草案为真实生成。"
                )
            return result

        # 4) 未配置凭证 → Mock 演示：返回与 SQL 意图相符的模拟结果（明确标注）
        return self._mock_query_result(sql, start)

    def confirm_and_run(self, sql: str, dataset_id: str | None = None,
                        max_rows: int = 200) -> dict[str, Any]:
        """用户确认 SQL 后执行。真实接入时可在此追加审计/权限校验/SQL 重写。"""
        result = self.run_query(sql, max_rows=max_rows, dataset_id=dataset_id)
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
