"""
LLM 连通性验证脚本 - 直接用绝对路径加载 .env
"""
import os
import sys

ENV_PATH = "/Users/bytedance/Desktop/graduation project/.env"
os.chdir("/Users/bytedance/Desktop/graduation project")
sys.path.insert(0, "/Users/bytedance/Desktop/graduation project")

# 加载.env 到 os.environ
if os.path.exists(ENV_PATH):
    with open(ENV_PATH, "r") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("export "):
                kv = line[len("export "):]
                if "=" in kv:
                    k, v = kv.split("=", 1)
                    v = v.strip().strip('"').strip("'")
                    os.environ[k.strip()] = v

if not os.path.exists(ENV_PATH):
    print(f"❌ 找不到 .env 文件: {ENV_PATH}")
    sys.exit(1)

with open(ENV_PATH, "r") as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            kv = line[len("export "):]
            if "=" in kv:
                k, v = kv.split("=", 1)
                v = v.strip().strip('"').strip("'")
                os.environ[k.strip()] = v

print("=" * 60)
print("  🔍 LLM 环境变量检查")
print("=" * 60)
api_key = os.environ.get("LLM_API_KEY", "")
base_url = os.environ.get("LLM_BASE_URL", "")
model = os.environ.get("LLM_MODEL", "")
temperature = os.environ.get("LLM_TEMPERATURE", "0")

print(f"  LLM_API_KEY:       {'✅ 已设置' if api_key else '❌ 未设置'}  ({api_key[:12]}{'...' if len(api_key)>12 else ''})")
print(f"  LLM_BASE_URL:      {'✅ 已设置' if base_url else '❌ 未设置'}  ({base_url})")
print(f"  LLM_MODEL:         {'✅ 已设置' if model else '❌ 未设置'}  ({model})")
print(f"  LLM_TEMPERATURE:   {temperature}")

if not api_key or not base_url or not model:
    print("\n❌ 配置不完整，请检查 .env 文件！")
    print(f"   api_key='{api_key}'")
    print(f"   base_url='{base_url}'")
    print(f"   model='{model}'")
    sys.exit(1)

print("\n" + "=" * 60)
print("  📡 正在测试 LLM API 连通性 ...")
print("=" * 60)

from src.utils.llm_client import LLMClient

try:
    client = LLMClient()
    messages = [
        {"role": "system", "content": "你是一个 SQL 专家，只输出 SQL。"},
        {"role": "user", "content": "表 order_item 有字段 order_id, amount, pay_status。请写一条 SQL 统计已支付订单的总销售额，放在 ```sql 代码块里。"},
    ]
    response = client.chat(messages, temperature=0)
    print(f"\n  ✅ API 调用成功！")
    print(f"  📝 LLM 回复:")
    print(f"  {response.strip()}")
    print("\n" + "=" * 60)
    print("  🎉 配置完全正确！可以直接开始跑基线评测了。")
    print("  下一步: python3 -m src.evaluation.run_baseline_eval --limit 3")
    print("=" * 60)
except Exception as e:
    print(f"\n  ❌ API 调用失败: {e}")
    print("  可能原因:")
    print("    1. API Key 无效或过期")
    print("    2. Base URL 错误（应为 https://ark.cn-beijing.volces.com/api/v3）")
    print("    3. 接入点 ID (LLM_MODEL) 错误")
    print("    4. 网络问题")
    sys.exit(1)
