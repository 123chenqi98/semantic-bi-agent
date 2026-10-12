"""节点包：每个文件对应一个专职 Agent 节点。"""
import time


def trace_step(node: str, status: str, detail: str, **extra) -> dict:
    """构造一条统一结构的 trace 记录（节点返回 {"trace": [step(...)]} 即可被追加）。"""
    rec = {"node": node, "status": status, "detail": detail, "ts": round(time.time(), 3)}
    rec.update(extra)
    return rec
