"""
数据源 Provider 工厂。

通过环境变量 DATASOURCE_TYPE 选择当前激活的数据源：
  - currentLocal（默认）：本地 SQLite，真实可用
  - fengshenBi：风神 BI 占位适配器（Mock）

新增数据源步骤：
  1. 在 src/datasource/ 下新建 xxx_provider.py，继承 DataSourceProvider
  2. 在下方 _REGISTRY 中注册
  3. 设置 DATASOURCE_TYPE=xxx 即可切换
"""
from __future__ import annotations

import os

from src.datasource.base import DataSourceProvider
from src.datasource.local_provider import LocalSQLiteProvider
from src.datasource.fengshenbi_provider import FengshenBiProvider


_REGISTRY: dict[str, type[DataSourceProvider]] = {
    "currentLocal": LocalSQLiteProvider,
    "fengshenBi": FengshenBiProvider,
}

_provider_instance: "DataSourceProvider | None" = None


def provider_registry() -> dict[str, dict]:
    """返回所有已注册 provider 的元信息（不实例化）。"""
    result = {}
    for key, cls in _REGISTRY.items():
        tmp = cls()
        result[key] = {
            "source_type": key,
            "display_name": tmp.display_name,
            "is_real": tmp.is_real,
            "is_available": tmp.is_available,
        }
    return result


def get_provider(source_type: str | None = None) -> DataSourceProvider:
    """
    获取数据源 provider 实例（单例）。
    优先使用参数指定的类型，否则读环境变量 DATASOURCE_TYPE，默认 currentLocal。
    """
    global _provider_instance
    st = source_type or os.environ.get("DATASOURCE_TYPE", "currentLocal")
    if st not in _REGISTRY:
        raise ValueError(
            f"未知数据源类型 '{st}'，已注册：{list(_REGISTRY.keys())}"
        )
    if _provider_instance is None or _provider_instance.source_type != st:
        _provider_instance = _REGISTRY[st]()
    return _provider_instance


def reset_provider():
    """重置单例（测试用）。"""
    global _provider_instance
    _provider_instance = None
