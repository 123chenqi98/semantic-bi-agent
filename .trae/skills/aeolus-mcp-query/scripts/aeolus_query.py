#!/usr/bin/env python3
"""风神 (Aeolus) MCP 只读取数客户端，仅依赖 Python 标准库。

子命令:
  datasets --app-id APP_ID            列出项目下当前用户有权限的数据集
  schema   --dataset-id DATASET_ID    获取数据集 schema
  query    --dataset-id DATASET_ID --sql SQL   执行只读 SQL
"""

import argparse
import json
import os
import queue
import sys
import threading
import time
import urllib.error
import urllib.request

JWT_URL = "https://data.bytedance.net/aeolus/api/v3/openapi/jwtToken"
SSE_BASE = "https://gg8z1crz.mcp.bytedance.net"
SKILL_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_dotenv():
    """加载 skill 目录下的 .env；不覆盖已存在的环境变量。"""
    path = os.path.join(SKILL_DIR, ".env")
    if not os.path.isfile(path):
        return
    with open(path, "r", encoding="utf-8") as fh:
        for raw in fh:
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            os.environ.setdefault(key, value)


def require_config():
    keys = ("AEOLUS_CLIENT_ID", "AEOLUS_CLIENT_SECRET", "AEOLUS_PROXY_USER")
    missing = [k for k in keys if not os.environ.get(k)]
    if missing:
        sys.stderr.write("缺少环境变量: " + ", ".join(missing) + "\n")
        sys.stderr.write("请在 skill 目录创建 .env（参考 .env.example），或导出对应环境变量。\n")
        sys.exit(2)


def http_json(url, payload, timeout=20):
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        return json.loads(exc.read().decode("utf-8"))


def get_jwt():
    body = http_json(JWT_URL, {
        "metadata": {
            "clientId": os.environ["AEOLUS_CLIENT_ID"],
            "clientSecret": os.environ["AEOLUS_CLIENT_SECRET"],
            "proxyUser": os.environ["AEOLUS_PROXY_USER"],
            "expire": 1800,
        }
    })
    if body.get("code") != "aeolus/ok":
        sys.stderr.write("JWT 换取失败: " + json.dumps(body, ensure_ascii=False) + "\n")
        sys.exit(3)
    return body["data"]["jwtToken"]


class MCPSession:
    """SSE 长连接 + JSON-RPC 调用会话。"""

    def __init__(self):
        self.frames = queue.Queue()
        self.endpoint = None
        self._stream = None
        self._thread = None
        self._stopped = False

    def _reader(self):
        req = urllib.request.Request(
            SSE_BASE + "/sse",
            headers={"Accept": "text/event-stream"},
        )
        try:
            self._stream = urllib.request.urlopen(req, timeout=60)
            event = "message"
            data_lines = []
            for raw in self._stream:
                if self._stopped:
                    break
                line = raw.decode("utf-8", "replace").rstrip("\r\n")
                if line == "":
                    if data_lines:
                        self.frames.put((event, "\n".join(data_lines)))
                    event = "message"
                    data_lines = []
                elif line.startswith(":"):
                    continue  # SSE 注释/心跳
                elif line.startswith("event:"):
                    event = line[6:].lstrip()
                elif line.startswith("data:"):
                    data_lines.append(line[5:].lstrip())
        except Exception:
            # 关闭流时触发的读取异常属于正常退出，静默处理。
            if not self._stopped:
                raise

    def __enter__(self):
        self._thread = threading.Thread(target=self._reader)
        self._thread.start()
        event, data = self.frames.get(timeout=30)
        if event != "endpoint":
            raise RuntimeError("未收到 endpoint 事件: %s %s" % (event, data))
        self.endpoint = data
        self._initialize()
        return self

    def _post(self, message):
        req = urllib.request.Request(
            self.endpoint,
            data=json.dumps(message).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                resp.read()
        except urllib.error.HTTPError as exc:
            exc.read()

    def _wait_result(self, want_id, timeout):
        deadline = time.time() + timeout
        while True:
            remaining = deadline - time.time()
            if remaining <= 0:
                raise TimeoutError("等待 id=%s 的响应超时" % want_id)
            event, data = self.frames.get(timeout=remaining)
            try:
                parsed = json.loads(data)
            except ValueError:
                continue
            if parsed.get("id") == want_id:
                return parsed

    def _initialize(self):
        self._post({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "aeolus-mcp-query", "version": "1.0"},
            },
        })
        self._wait_result(1, timeout=30)
        self._post({"jsonrpc": "2.0", "method": "notifications/initialized"})

    def call_tool(self, name, arguments, timeout=120):
        call_id = (int(time.time() * 1000) % 1000000) + 2
        self._post({
            "jsonrpc": "2.0",
            "id": call_id,
            "method": "tools/call",
            "params": {"name": name, "arguments": arguments},
        })
        result = self._wait_result(call_id, timeout)
        if "error" in result:
            sys.stderr.write(
                "JSON-RPC error: " + json.dumps(result["error"], ensure_ascii=False) + "\n"
            )
            sys.exit(4)
        return result["result"]["content"][0]["text"]

    def __exit__(self, exc_type, exc, tb):
        self._stopped = True
        try:
            self._stream.close()
        except Exception:
            pass
        if self._thread is not None:
            self._thread.join(timeout=2)


def main():
    parser = argparse.ArgumentParser(description="风神 Aeolus MCP 只读取数")
    sub = parser.add_subparsers(dest="action", required=True)

    p_ds = sub.add_parser("datasets", help="列出项目下有权限的数据集")
    p_ds.add_argument("--app-id", required=True)

    p_sc = sub.add_parser("schema", help="获取数据集 schema")
    p_sc.add_argument("--dataset-id", required=True)

    p_q = sub.add_parser("query", help="执行只读 SQL")
    p_q.add_argument("--dataset-id", required=True)
    p_q.add_argument("--sql", required=True)

    args = parser.parse_args()

    load_dotenv()
    require_config()
    auth = "Bearer " + get_jwt()

    with MCPSession() as session:
        if args.action == "datasets":
            text = session.call_tool(
                "get_data_set_by_appid",
                {"appId": args.app_id, "Authorization": auth},
            )
        elif args.action == "schema":
            text = session.call_tool(
                "get_schema",
                {"dataset_id": args.dataset_id, "Authorization": auth},
            )
        else:
            dataset_id = (
                int(args.dataset_id) if args.dataset_id.isdigit() else args.dataset_id
            )
            text = session.call_tool(
                "query_data_by_sql",
                {"dataSetId": dataset_id, "sql": args.sql, "Authorization": auth},
            )

    sys.stdout.write(text + "\n")


if __name__ == "__main__":
    main()
