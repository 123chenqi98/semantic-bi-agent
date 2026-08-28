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
        企业 BI provider 可覆盖此方法，接入 BI 平台的问数能力。
        """
        return {
            "success": False,
            "error": f"数据源 '{self.source_type}' 不支持语义查询，请通过上层 Text-to-SQL 流程调用",
            "not_supported": True,
        }
