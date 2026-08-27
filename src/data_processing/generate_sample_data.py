"""
经营分析模拟数据生成脚本
生成四张表：customer, product, date, order
输出到 data/raw/ 目录下（CSV 格式）
"""

import os
import random
import csv
from datetime import date, timedelta

random.seed(42)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RAW_DIR = os.path.join(BASE_DIR, "data", "raw")
os.makedirs(RAW_DIR, exist_ok=True)

CUSTOMER_CNT = 2000
PRODUCT_CNT = 200
DATE_START = date(2025, 1, 1)
DATE_END = date(2026, 6, 30)
ORDER_CNT = 30000

CATEGORIES = [
    ("电子产品", ["手机", "电脑", "耳机", "平板", "智能手表"]),
    ("家居用品", ["床上用品", "厨房用具", "收纳", "灯具", "家具"]),
    ("服装配饰", ["男装", "女装", "鞋靴", "箱包", "首饰"]),
    ("食品饮料", ["零食", "饮料", "生鲜", "酒水", "调味品"]),
    ("美妆个护", ["护肤", "彩妆", "香水", "洗护", "男士护理"]),
]

REGIONS = ["华东", "华北", "华南", "华中", "西南", "西北", "东北"]
CITIES_BY_REGION = {
    "华东": ["上海", "杭州", "南京", "苏州", "宁波", "合肥"],
    "华北": ["北京", "天津", "石家庄", "太原", "青岛", "济南"],
    "华南": ["广州", "深圳", "厦门", "福州", "珠海", "东莞"],
    "华中": ["武汉", "长沙", "郑州", "南昌", "襄阳", "宜昌"],
    "西南": ["成都", "重庆", "昆明", "贵阳", "绵阳", "泸州"],
    "西北": ["西安", "兰州", "银川", "西宁", "咸阳", "宝鸡"],
    "东北": ["沈阳", "大连", "哈尔滨", "长春", "鞍山", "大庆"],
}
CHANNELS = ["线上APP", "线下门店", "小程序", "第三方平台"]


def daterange(start, end):
    for n in range(int((end - start).days) + 1):
        yield start + timedelta(n)


def generate_customers():
    rows = []
    first_names = ["王", "李", "张", "刘", "陈", "杨", "黄", "赵", "周", "吴",
                   "徐", "孙", "胡", "朱", "高", "林", "何", "郭", "马", "罗"]
    last_names = ["伟", "芳", "娜", "敏", "静", "丽", "强", "磊", "军", "洋",
                  "勇", "艳", "杰", "娟", "涛", "明", "超", "秀英", "霞", "平"]
    for cid in range(1, CUSTOMER_CNT + 1):
        name = random.choice(first_names) + random.choice(last_names)
        gender = random.choices(["男", "女"], weights=[0.45, 0.55])[0]
        age = random.choices(
            [random.randint(18, 25), random.randint(26, 35),
             random.randint(36, 45), random.randint(46, 60)],
            weights=[0.25, 0.4, 0.25, 0.1]
        )[0]
        region = random.choice(REGIONS)
        city = random.choice(CITIES_BY_REGION[region])
        level = random.choices(["普通", "银卡", "金卡", "钻石"],
                               weights=[0.5, 0.3, 0.15, 0.05])[0]
        register_date = DATE_START + timedelta(days=random.randint(
            0, int((DATE_END - DATE_START).days * 0.7)))
        rows.append([cid, name, gender, age, region, city, level, register_date.isoformat()])

    with open(os.path.join(RAW_DIR, "customer.csv"), "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["customer_id", "customer_name", "gender", "age",
                         "region", "city", "member_level", "register_date"])
        writer.writerows(rows)
    print(f"customer.csv: {len(rows)} 行")


def generate_products():
    rows = []
    pid = 1
    for category, sub_list in CATEGORIES:
        for sub in sub_list:
            base_price = random.choice([19.9, 49.9, 99, 199, 399, 699, 1299, 2999, 5999])
            for _ in range(PRODUCT_CNT // len(CATEGORIES) // len(sub_list) + 1):
                if pid > PRODUCT_CNT:
                    break
                name = f"{sub}{pid}号"
                brand = random.choice(["品牌A", "品牌B", "品牌C", "品牌D", "品牌E", "国货精品"])
                cost = round(base_price * random.uniform(0.35, 0.65), 2)
                price = round(base_price * random.uniform(1.0, 1.3), 2)
                status = random.choices(["在售", "下架"], weights=[0.9, 0.1])[0]
                rows.append([pid, name, category, sub, brand, cost, price, status])
                pid += 1
            if pid > PRODUCT_CNT:
                break

    with open(os.path.join(RAW_DIR, "product.csv"), "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["product_id", "product_name", "category", "sub_category",
                         "brand", "cost_price", "sale_price", "status"])
        writer.writerows(rows)
    print(f"product.csv: {len(rows)} 行")


def generate_dates():
    rows = []
    did = 1
    for d in daterange(DATE_START, DATE_END):
        year = d.year
        month = d.month
        quarter = (month - 1) // 3 + 1
        week_of_year = d.isocalendar()[1]
        weekday = d.isoweekday()
        is_weekend = 1 if weekday >= 6 else 0
        month_start = date(year, month, 1)
        # 简化：月末=每月25-31的某个，直接用当月最后一天
        if month == 12:
            next_month_start = date(year + 1, 1, 1)
        else:
            next_month_start = date(year, month + 1, 1)
        is_month_end = 1 if d == (next_month_start - timedelta(days=1)) else 0
        season_name = f"{year}Q{quarter}"
        month_name = f"{year}-{month:02d}"
        rows.append([did, d.isoformat(), year, month, quarter, season_name,
                     month_name, week_of_year, weekday, is_weekend, is_month_end])
        did += 1

    with open(os.path.join(RAW_DIR, "date.csv"), "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["date_id", "date", "year", "month", "quarter", "season_name",
                         "month_name", "week_of_year", "weekday", "is_weekend", "is_month_end"])
        writer.writerows(rows)
    print(f"date.csv: {len(rows)} 行")


def generate_orders():
    date_ids = list(range(1, (DATE_END - DATE_START).days + 2))
    customer_ids = list(range(1, CUSTOMER_CNT + 1))
    product_ids = list(range(1, PRODUCT_CNT + 1))

    # 预读 product 价格以计算金额
    product_price = {}
    with open(os.path.join(RAW_DIR, "product.csv"), "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            product_price[int(row["product_id"])] = float(row["sale_price"])

    # 预读 customer 注册时间，避免下单早于注册
    cust_register = {}
    with open(os.path.join(RAW_DIR, "customer.csv"), "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            cust_register[int(row["customer_id"])] = row["register_date"]

    # 预读 date -> date_id 映射
    date_map = {}
    with open(os.path.join(RAW_DIR, "date.csv"), "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            date_map[row["date"]] = int(row["date_id"])

    rows = []
    order_id = 1

    # 为了让复购率更真实：按客户抽样，部分客户多买，部分客户少买
    # 先按客户分配购买次数
    purchase_dist = []
    for cid in customer_ids:
        reg_date = date.fromisoformat(cust_register[cid])
        available_days = [dt for dt in date_map.keys()
                          if date.fromisoformat(dt) >= reg_date]
        if not available_days:
            continue
        cnt = random.choices(
            [random.randint(1, 2), random.randint(3, 6),
             random.randint(7, 15), random.randint(16, 30)],
            weights=[0.5, 0.3, 0.15, 0.05]
        )[0]
        for _ in range(cnt):
            purchase_dist.append((cid, random.choice(available_days)))

    random.shuffle(purchase_dist)
    selected = purchase_dist[:ORDER_CNT]

    for cid, dt_str in selected:
        did = date_map[dt_str]
        channel = random.choices(CHANNELS, weights=[0.4, 0.25, 0.2, 0.15])[0]
        item_cnt = random.choices([1, 2, 3, 4, 5], weights=[0.5, 0.25, 0.15, 0.07, 0.03])[0]
        chosen_products = random.sample(product_ids, k=min(item_cnt, len(product_ids)))
        for pid in chosen_products:
            qty = random.choices([1, 2, 3, 4, 5], weights=[0.6, 0.22, 0.1, 0.05, 0.03])[0]
            unit_price = product_price[pid]
            discount = random.choices([1.0, 0.95, 0.9, 0.85, 0.8, 0.7],
                                      weights=[0.35, 0.2, 0.2, 0.1, 0.1, 0.05])[0]
            amount = round(unit_price * qty * discount, 2)
            pay_status = random.choices(["已支付", "已退款", "未支付"],
                                        weights=[0.85, 0.1, 0.05])[0]
            rows.append([order_id, did, dt_str, cid, pid, qty,
                         round(unit_price, 2), round(discount, 2),
                         amount, channel, pay_status])
        order_id += 1

    with open(os.path.join(RAW_DIR, "order_item.csv"), "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["order_id", "date_id", "order_date", "customer_id",
                         "product_id", "quantity", "unit_price", "discount",
                         "amount", "channel", "pay_status"])
        writer.writerows(rows)
    print(f"order_item.csv: {len(rows)} 行")


if __name__ == "__main__":
    generate_customers()
    generate_products()
    generate_dates()
    generate_orders()
    print(f"全部完成。输出目录：{RAW_DIR}")
