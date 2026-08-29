"""
数据源 Provider 抽象基类。

所有数据源适配器必须实现以下接口：
  - health_check()       健康检查
  - list_datasets()      列出可用数据集
  - get_dataset_schema() 获取数据集字段元数据
  - preview_dataset()    预览数据集前 N 行
  - run_query()          执行 SQL 查询

设计原则：
  1. 统一返回结构，前端无需感知底层数据源类型。
  2. run_query 接收标准 SQL；对于非 SQL 数据源（如 BI API），
     由适配器内部负责转换或标记 not_supported。
  3. 每个 provider 必须声明 source_type 和 is_real，
     明确区分"真实可用"与"占位 Mock"。
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class DataSourceProvider(ABC):
    """数据源适配器抽象基类。"""

    @property
    @abstractmethod
    def source_type(self) -> str:
        """数据源类型标识，如 'currentLocal'、'fengshenBi'。"""
        ...

    @property
    @abstractmethod
    def display_name(self) -> str:
        """人类可读名称，如 '本地 SQLite（零售示例库）'。"""
        ...

    @property
    @abstractmethod
    def is_real(self) -> bool:
        """
        是否为真实可用的数据源。
        True  = 已接通真实数据，查询返回真实结果。
        False = 占位 / Mock 实现，仅用于演示接口链路。
        """
        ...

    @property
    @abstractmethod
    def is_available(self) -> bool:
        """当前是否可用（凭证有效、文件存在、网络可达等）。"""
        ...

    @abstractmethod
    def health_check(self) -> dict[str, Any]:
        """
        健康检查。
        返回:
          {
            "ok": bool,
            "source_type": str,
            "display_name": str,
            "is_real": bool,
            "message": str,
            "details": {...}
          }
        """
        ...

    @abstractmethod
    def list_datasets(self) -> list[dict[str, Any]]:
        """
        列出可用数据集。
        返回:
          [
            {
              "id": str,            # 数据集唯一标识
              "name": str,          # 显示名称
              "description": str,   # 描述
              "row_count": int,     # 行数（未知为 -1）
              "columns": int        # 列数
            }
          ]
        """
        ...

    @abstractmethod
    def get_dataset_schema(self, dataset_id: str) -> dict[str, Any]:
        """
        获取数据集字段元数据。
        返回:
          {
            "id": str,
            "name": str,
            "columns": [
              {"name": str, "type": str, "description": str, "nullable": bool}
            ]
          }
        """
        ...

    @abstractmethod
    def preview_dataset(self, dataset_id: str, limit: int = 20) -> dict[str, Any]:
        """
        预览数据集前 N 行。
        返回:
          {
            "success": bool,
            "columns": list[str],
            "rows": list[list],
            "row_count": int,
            "error": str | None
          }
        """
        ...

    @abstractmethod
    def run_query(self, sql: str, max_rows: int = 200) -> dict[str, Any]:
        """
        执行 SQL 查询。
        返回:
          {
            "success": bool,
            "columns": list[str],
            "rows": list[list],
            "row_count": int,
            "error": str | None,
            "elapsed_ms": float
          }
        """
        ...

    def run_semantic_query(self, question: str, history: list | None = None) -> dict[str, Any]:
        """
        语义查询（自然语言 → 数据）。
        基类提供默认实现：标记 not_supported。
        企业 BI provider 可覆盖此方法，接入 BI 平台自己的问数/智能问数接口。

        ⚠️ 预留接口：在没有拿到 BI 平台「语义问数」私有 API 文档前，
           不允许伪造请求地址与字段；未接入时应返回 not_supported。
        """
        return {
            "success": False,
            "error": f"数据源 '{self.source_type}' 不支持语义查询，请通过上层 Text-to-SQL 流程调用",
            "not_supported": True,
        }

    # ==================== 企业 BI 接入扩展接口 ====================
    # 以下方法面向「企业 BI 平台」场景（授权、工作空间、需求确认、SQL 确认）。
    # 全部提供默认实现，保证旧的 Provider（如本地 SQLite）无需改动即可继续工作；
    # 企业 BI Provider（如风神 BI）按需要覆盖。

    # 连接状态机的五种标准取值：
    #   unconfigured        未配置任何凭证
    #   mock                未配置凭证，运行于内置 Mock 演示模式
    #   configured          已填写凭证，但尚未做连通性验证
    #   verified            凭证已通过连通性验证（真实 API 可达）
    #   real_ready          真实可用（端点齐全 + 验证通过，is_real=True）
    def connection_status(self) -> str:
        """返回当前连接状态机取值（见上方五种状态）。默认按 is_real/is_available 推断。"""
        if self.is_real and self.is_available:
            return "real_ready"
        return "unconfigured"

    def configure(self, config: dict[str, Any]) -> dict[str, Any]:
        """
        运行时写入/更新凭证配置（来自前端配置表单或后端托管密钥）。

        约定：
          - 只更新 config 中显式给出的键，None / 空串表示清空该项；
          - 密钥类字段（app_secret / token）不落日志、不回显明文；
          - 返回脱敏后的配置回显（密钥统一显示为 ******）。
        基类默认：不支持运行时配置。
        """
        return {
            "ok": False,
            "supported": False,
            "message": f"数据源 '{self.source_type}' 不支持运行时配置（请通过环境变量配置）",
        }

    def masked_config(self) -> dict[str, Any]:
        """返回脱敏后的当前配置（密钥字段显示为 ******，用于前端回显）。"""
        return {}

    def validate_credentials(self, config: dict[str, Any] | None = None) -> dict[str, Any]:
        """
        校验凭证 / 连通性测试（「测试连接」按钮）。

        若传入 config，则先用 configure 写入再验证；否则验证当前已加载配置。
        返回:
          {
            "ok": bool,                # 连通性是否通过
            "status": str,             # connection_status() 的状态值
            "message": str,            # 人类可读结论
            "checked_at": float,       # 时间戳
            "details": {...}           # 各检查项明细（不回显密钥明文）
          }
        基类默认：对本地数据源直接用 is_available 判断。
        """
        import time as _time
        return {
            "ok": self.is_available,
            "status": self.connection_status(),
            "message": "数据源可用" if self.is_available else "数据源不可用",
            "checked_at": _time.time(),
            "details": {"is_real": self.is_real, "is_available": self.is_available},
        }

    def list_workspaces(self) -> dict[str, Any]:
        """
        列出企业 BI 平台下的工作空间 / 项目空间（多租户场景）。
        基类默认：不支持（本地数据源无工作空间概念）。
        """
        return {
            "success": False,
            "workspaces": [],
            "not_supported": True,
            "message": f"数据源 '{self.source_type}' 无工作空间概念",
        }

    def plan_query(self, question: str, history: list | None = None,
                   dataset_id: str | None = None) -> dict[str, Any]:
        """
        【阶段一·需求确认 + SQL 草案】对业务问题做需求分析，不执行查询。

        企业 BI Provider 可覆盖以接入平台侧能力；默认返回 not_supported，
        由上层 API 编排（语义层指标匹配 + LLM 生成 SQL 草案）完成该阶段。
        返回契约见上层 API（/api/enterprise-bi/plan）。
        """
        return {
            "success": False,
            "not_supported": True,
            "stage": "plan",
            "message": f"数据源 '{self.source_type}' 未实现 plan_query，由上层编排完成需求分析",
        }

    def confirm_and_run(self, sql: str, dataset_id: str | None = None,
                        max_rows: int = 200) -> dict[str, Any]:
        """
        【阶段二·确认执行】用户确认 SQL 草案后，真正下发查询并标准化结果。

        默认实现直接复用 run_query；企业 BI Provider 可覆盖以在执行前做
        审计日志、权限校验、SQL 重写（库表前缀/工作空间限定）等。
        """
        result = self.run_query(sql, max_rows=max_rows)
        result.setdefault("stage", "execute")
        return result
