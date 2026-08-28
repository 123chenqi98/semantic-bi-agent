"""
数据源 Provider / Adapter 抽象层。

通过统一接口屏蔽底层数据源差异（本地 SQLite、企业 BI 平台等），
后续新增数据源只需实现 DataSourceProvider 抽象基类并在 factory 中注册。
"""
from src.datasource.base import DataSourceProvider
from src.datasource.factory import get_provider, provider_registry

__all__ = ["DataSourceProvider", "get_provider", "provider_registry"]
