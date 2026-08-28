"""
风神 BI（Fengshen BI）数据源 Provider —— 占位适配器。

⚠️  重要声明：
  本文件是「企业 BI 接入架构」的占位实现（Mock Provider），
  并未调用任何风神 BI 的真实 API。

  目的：
  1. 演示统一数据源接口的可扩展性；
  2. 前端可以走通「选择风神 BI → 列出数据集 → 查看 Schema → 预览 → 查询」完整链路；
  3. 后续拿到风神 BI API 文档和凭证后，只需替换本文件中的方法实现，
     上层代码（API 路由、前端组件）无需任何改动。

  替换为真实实现时需要修改的位置：
  - __init__ 中的凭证读取（已通过环境变量预留）
  - _request() 方法：改为调用风神 BI OpenAPI
  - list_datasets / get_dataset_schema / preview_dataset / run_query：
    将 Mock 返回替换为真实 API 响应，并映射到统一接口格式

环境变量（预留，当前不强制）：
  FENGSHEN_BI_BASE_URL       API 地址
  FENGSHEN_BI_APP_ID         应用 ID
  FENGSHEN_BI_APP_SECRET     应用密钥
  FENGSHEN_BI_TOKEN          访问令牌（或通过 app_id/secret 换取）
  FENGSHEN_BI_WORKSPACE_ID   工作空间 ID
"""
from __future__ import annotations

import os
import time
import random
from typing import Any

from src.datasource.base import DataSourceProvider


class FengshenBiProvider(DataSourceProvider):
    """风神 BI 占位数据源（Mock，非真实接入）。"""

    def __init__(self):
        self.base_url = os.environ.get("FENGSHEN_BI_BASE_URL", "")
        self.app_id = os.environ.get("FENGSHEN_BI_APP_ID", "")
        self.app_secret = os.environ.get("FENGSHEN_BI_APP_SECRET", "")
        self.token = os.environ.get("FENGSHEN_BI_TOKEN", "")
        self.workspace_id = os.environ.get("FENGSHEN_BI_WORKSPACE_ID", "")

    @property
    def source_type(self) -> str:
        return "fengshenBi"

    @property
    def display_name(self) -> str:
        return "风神 BI（占位 Mock · 待接入）"

    @property
    def is_real(self) -> bool:
        return False

    @property
    def is_available(self) -> bool:
        configured = bool(self.base_url and (self.token or (self.app_id and self.app_secret)))
        return configured

    def _mock_datasets(self) -> list[dict]:
        return [
            {
                "id": "fs_sales_daily",
                "name": "销售日汇总数据集",
                "description": "[Mock] 按日期×渠道×品类汇总的销售额、订单量、客单价",
                "row_count": -1,
                "columns": 8,
            },
            {
                "id": "fs_user_profile",
                "name": "用户画像数据集",
                "description": "[Mock] 用户注册信息、会员等级、区域、首末单时间",
                "row_count": -1,
                "columns": 10,
            },
            {
                "id": "fs_product_performance",
                "name": "商品表现数据集",
                "description": "[Mock] 商品维度的销量、GMV、退货率、库存周转",
                "row_count": -1,
                "columns": 9,
            },
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
                {"name": "first_order_date", "type": "DATE", "description": "首单日期", "nullable": True},
                {"name": "last_order_date", "type": "DATE", "description": "末单日期", "nullable": True},
                {"name": "total_orders", "type": "INT", "description": "累计订单数", "nullable": True},
                {"name": "total_amount", "type": "DECIMAL(18,2)", "description": "累计消费金额", "nullable": True},
                {"name": "is_active", "type": "BOOLEAN", "description": "是否活跃", "nullable": True},
            ],
            "fs_product_performance": [
                {"name": "product_id", "type": "VARCHAR", "description": "商品ID", "nullable": False},
                {"name": "product_name", "type": "VARCHAR", "description": "商品名称", "nullable": False},
                {"name": "category", "type": "VARCHAR", "description": "品类", "nullable": True},
                {"name": "brand", "type": "VARCHAR", "description": "品牌", "nullable": True},
                {"name": "unit_price", "type": "DECIMAL(18,2)", "description": "单价", "nullable": False},
                {"name": "sales_qty", "type": "INT", "description": "销量", "nullable": False},
                {"name": "gmv", "type": "DECIMAL(18,2)", "description": "GMV", "nullable": False},
                {"name": "refund_rate", "type": "DECIMAL(5,4)", "description": "退货率", "nullable": True},
                {"name": "stock_turnover", "type": "DECIMAL(10,2)", "description": "库存周转天数", "nullable": True},
            ],
        }
        return schemas.get(dataset_id, [])

    def _mock_preview(self, dataset_id: str, limit: int) -> tuple[list[str], list[list]]:
        if dataset_id == "fs_sales_daily":
            cols = ["dt", "channel", "category", "sales_amount", "order_count", "customer_count", "avg_order_value", "refund_amount"]
            channels = ["线上", "线下", "小程序"]
            categories = ["数码", "服饰", "食品"]
            rows = []
            for i in range(min(limit, 10)):
                rows.append([
                    f"2026-06-{i+1:02d}",
                    channels[i % 3],
                    categories[i % 3],
                    round(random.uniform(5000, 50000), 2),
                    random.randint(20, 300),
                    random.randint(15, 200),
                    round(random.uniform(100, 800), 2),
                    round(random.uniform(0, 2000), 2),
                ])
            return cols, rows
        elif dataset_id == "fs_user_profile":
            cols = ["user_id", "register_date", "gender", "region", "member_level", "total_orders", "total_amount"]
            rows = [[f"U{1000+i}", f"2025-0{i+1}-15", "M" if i % 2 else "F",
                     ["华东", "华南", "华北"][i % 3], ["普通", "银卡", "金卡"][i % 3],
                     random.randint(1, 50), round(random.uniform(100, 20000), 2)] for i in range(min(limit, 10))]
            return cols, rows
        else:
            cols = ["product_id", "product_name", "category", "brand", "unit_price", "sales_qty", "gmv"]
            rows = [[f"P{2000+i}", f"商品{i+1}", ["数码", "服饰"][i % 2],
                     ["品牌A", "品牌B"][i % 2], round(random.uniform(50, 2000), 2),
                     random.randint(10, 500), round(random.uniform(1000, 50000), 2)] for i in range(min(limit, 10))]
            return cols, rows

    def health_check(self) -> dict[str, Any]:
        if self.is_available:
            return {
                "ok": True,
                "source_type": self.source_type,
                "display_name": self.display_name,
                "is_real": False,
                "message": "风神 BI 凭证已配置，但当前仍为占位实现，返回 Mock 数据",
                "details": {
                    "base_url": self.base_url,
                    "workspace_id": self.workspace_id,
                    "configured": True,
                    "mock_mode": True,
                },
            }
        return {
            "ok": True,
            "source_type": self.source_type,
            "display_name": self.display_name,
            "is_real": False,
            "message": "风神 BI 未配置凭证，运行于 Mock 演示模式（接口链路可用，数据为模拟）",
            "details": {
                "base_url": "",
                "workspace_id": "",
                "configured": False,
                "mock_mode": True,
                "missing_env": [
                    "FENGSHEN_BI_BASE_URL",
                    "FENGSHEN_BI_TOKEN（或 FENGSHEN_BI_APP_ID + FENGSHEN_BI_APP_SECRET）",
                    "FENGSHEN_BI_WORKSPACE_ID",
                ],
            },
        }

    def list_datasets(self) -> list[dict[str, Any]]:
        return self._mock_datasets()

    def get_dataset_schema(self, dataset_id: str) -> dict[str, Any]:
        cols = self._mock_schema(dataset_id)
        if not cols:
            return {"id": dataset_id, "name": dataset_id, "columns": [], "error": "数据集不存在（Mock）"}
        ds = next((d for d in self._mock_datasets() if d["id"] == dataset_id), {})
        return {"id": dataset_id, "name": ds.get("name", dataset_id), "columns": cols}

    def preview_dataset(self, dataset_id: str, limit: int = 20) -> dict[str, Any]:
        cols = self._mock_schema(dataset_id)
        if not cols:
            return {"success": False, "columns": [], "rows": [], "row_count": 0,
                    "error": f"数据集 {dataset_id} 不存在（Mock）"}
        preview_cols, rows = self._mock_preview(dataset_id, limit)
        return {
            "success": True,
            "columns": preview_cols,
            "rows": rows,
            "row_count": len(rows),
            "error": None,
            "mock": True,
        }

    def run_query(self, sql: str, max_rows: int = 200) -> dict[str, Any]:
        start = time.time()
        if not self.is_available:
            return {
                "success": False,
                "columns": [],
                "rows": [],
                "row_count": 0,
                "error": "风神 BI 尚未配置真实凭证，SQL 查询为占位实现。"
                         "当前 Mock 模式不执行 SQL，请切换到本地数据源体验完整查询。",
                "elapsed_ms": 0,
                "mock": True,
                "not_implemented": True,
            }
        return {
            "success": False,
            "columns": [],
            "rows": [],
            "row_count": 0,
            "error": "风神 BI 真实 API 尚未接入，SQL 代理方法待实现。"
                     "请参考 docs/部署与企业BI接入说明.md 替换为真实 API 调用。",
            "elapsed_ms": round((time.time() - start) * 1000, 1),
            "mock": True,
            "not_implemented": True,
        }
