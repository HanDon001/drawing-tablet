"""
全局 HTTP 客户端（连接池复用）
所有 HTTP 请求共用一个 httpx.AsyncClient，复用 TCP 连接
"""

import httpx

# 全局连接池
http_client = httpx.AsyncClient(
    timeout=httpx.Timeout(30.0),
    limits=httpx.Limits(
        max_connections=100,
        max_keepalive_connections=20,
        keepalive_expiry=60,
    ),
)


async def get_http_client() -> httpx.AsyncClient:
    return http_client
