"""
LLM 客户端（OpenAI 兼容接口）
通过环境变量配置：
  - LLM_API_KEY       API Key（必填）
  - LLM_BASE_URL      Base URL（默认 https://api.openai.com/v1）
  - LLM_MODEL         模型名（默认 gpt-4o-mini，可改为 doubao-pro-32k / glm-4 / qwen-plus 等）
  - LLM_TEMPERATURE   温度（默认 0）
"""
import os
import json
import ssl
import time
import urllib.request
import urllib.error


def _load_dotenv():
    """尝试加载项目根目录的 .env 文件到 os.environ（仅在变量未设置时加载）。"""
    # 从当前文件向上查找包含 .env 的目录
    here = os.path.abspath(os.path.dirname(__file__))
    env_path = None
    for _ in range(5):  # 向上最多 5 级
        candidate = os.path.join(here, ".env")
        if os.path.exists(candidate):
            env_path = candidate
            break
        parent = os.path.dirname(here)
        if parent == here:
            break
        here = parent
    if not env_path:
        return
    with open(env_path, "r") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("export "):
                kv = line[len("export "):]
                if "=" in kv:
                    k, v = kv.split("=", 1)
                    k = k.strip()
                    if k not in os.environ:
                        v = v.strip().strip('"').strip("'")
                        os.environ[k] = v


class LLMClient:
    def __init__(self):
        _load_dotenv()
        self.api_key = os.environ.get("LLM_API_KEY", "")
        self.base_url = os.environ.get("LLM_BASE_URL", "https://api.openai.com/v1")
        self.model = os.environ.get("LLM_MODEL", "gpt-4o-mini")
        self.temperature = float(os.environ.get("LLM_TEMPERATURE", "0"))
        self.timeout = int(os.environ.get("LLM_TIMEOUT", "30"))

        if not self.api_key:
            raise ValueError(
                "请设置环境变量 LLM_API_KEY。"
                "示例：export LLM_API_KEY=sk-xxx && export LLM_BASE_URL=https://ark.cn-beijing.volces.com/api/v3 && export LLM_MODEL=ep-xxx"
            )

    def chat(self, messages, max_retries=2, **kwargs):
        """发送 Chat Completion 请求，返回助手回复文本。
        遇到 429 限流自动指数退避重试。
        """
        url = f"{self.base_url.rstrip('/')}/chat/completions"
        payload = {
            "model": kwargs.get("model", self.model),
            "messages": messages,
            "temperature": kwargs.get("temperature", self.temperature),
        }
        # 关闭深度思考模式（reasoning），大幅降低延迟
        payload["thinking"] = {"type": "disabled"}
        data = json.dumps(payload).encode("utf-8")

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }

        # 创建自定义 SSL 上下文，禁用证书验证（避免 macOS SSL 超时问题）
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

        last_error = None
        for attempt in range(max_retries):
            req = urllib.request.Request(url, data=data, headers=headers, method="POST")
            try:
                with urllib.request.urlopen(req, timeout=self.timeout, context=ctx) as resp:
                    body = json.loads(resp.read().decode("utf-8"))
                    return body["choices"][0]["message"]["content"]
            except urllib.error.HTTPError as e:
                err_body = e.read().decode("utf-8", errors="ignore")
                if e.code == 429 and attempt < max_retries - 1:
                    wait = 2 ** attempt * 1 + 1
                    print(f"   ⏳ 遇到限流(429)，等待 {wait}s 后重试 ({attempt+1}/{max_retries})...")
                    time.sleep(wait)
                    continue
                raise RuntimeError(f"LLM HTTP {e.code} 错误: {err_body}")
            except urllib.error.URLError as e:
                if attempt < max_retries - 1:
                    wait = 2 ** attempt * 2
                    print(f"   ⏳ 网络错误，等待 {wait}s 后重试 ({attempt+1}/{max_retries})...")
                    time.sleep(wait)
                    continue
                raise RuntimeError(f"LLM 网络错误: {e.reason}")
            except Exception as e:
                raise RuntimeError(f"LLM 调用异常: {type(e).__name__}: {e}")

        raise RuntimeError(f"LLM 调用失败，已重试 {max_retries} 次: {last_error}")


def extract_sql_from_response(text):
    """从 LLM 回复中提取 SQL。
    支持：1) ```sql ... ``` 代码块；2) ``` ... ```；3) 直接 SQL 文本。
    """
    import re
    # 优先找 ```sql ... ```
    m = re.search(r"```sql\s*(.*?)\s*```", text, re.DOTALL | re.IGNORECASE)
    if m:
        return m.group(1).strip()
    # 再找任意 ``` ... ```
    m = re.search(r"```\s*(.*?)\s*```", text, re.DOTALL)
    if m:
        return m.group(1).strip()
    # 最后按行过滤：取以 SELECT/WITH/INSERT 开头的连续行
    lines = text.splitlines()
    sql_lines = []
    started = False
    for ln in lines:
        s = ln.strip().rstrip(";")
        if not started:
            if re.match(r"^(SELECT|WITH)\b", s, re.IGNORECASE):
                started = True
                sql_lines.append(s)
        else:
            if s == "" or s.startswith("--") or s.startswith("#"):
                break
            sql_lines.append(s)
    if sql_lines:
        return "\n".join(sql_lines).strip().rstrip(";")
    # 兜底返回全文
    return text.strip().rstrip(";")
