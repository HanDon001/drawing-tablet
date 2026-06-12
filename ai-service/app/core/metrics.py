"""
监控指标模块
使用 Prometheus Client 记录 ASR / LLM / TTS / 端到端延迟
"""

import time
from prometheus_client import Histogram, Counter, generate_latest, CONTENT_TYPE_LATEST

# 延迟指标
ASR_LATENCY = Histogram(
    'asr_latency_seconds', 'ASR 识别延迟',
    buckets=[0.5, 1, 2, 3, 5]
)

LLM_LATENCY = Histogram(
    'llm_latency_seconds', 'LLM 响应延迟',
    buckets=[1, 2, 3, 5, 8, 15]
)

TTS_LATENCY = Histogram(
    'tts_latency_seconds', 'TTS 合成延迟',
    buckets=[0.5, 1, 2, 3]
)

E2E_LATENCY = Histogram(
    'e2e_latency_seconds', '端到端延迟（说话→播报）',
    buckets=[2, 3, 5, 8, 12]
)

# 错误计数
ERROR_COUNT = Counter(
    'errors_total', '错误总数', ['component']
)

# 请求计数
REQUEST_COUNT = Counter(
    'requests_total', '请求总数', ['endpoint', 'method']
)


def get_metrics() -> bytes:
    """获取 Prometheus 指标数据"""
    return generate_latest()


def get_content_type() -> str:
    """获取指标内容类型"""
    return CONTENT_TYPE_LATEST
