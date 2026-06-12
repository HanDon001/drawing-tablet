/**
 * API 模块
 * Axios 实例和 API 函数
 */

import axios, { AxiosInstance, AxiosResponse } from 'axios'
import { config } from '@/config'
import { logger } from '@/utils/logger'

// 创建 Axios 实例
const apiClient: AxiosInstance = axios.create({
  baseURL: config.aiApiBase,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// 请求拦截器（添加全链路追踪ID）
apiClient.interceptors.request.use(
  (request) => {
    // 生成请求ID
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    request.headers['X-Request-ID'] = requestId
    logger.debug(`[${requestId}] API 请求: ${request.method?.toUpperCase()} ${request.url}`)
    return request
  },
  (error) => {
    logger.error('API 请求错误:', error)
    return Promise.reject(error)
  }
)

// 响应拦截器
apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    logger.debug('API 响应:', response.status, response.data)
    return response
  },
  (error) => {
    logger.error('API 响应错误:', error.message)
    return Promise.reject(error)
  }
)

// 类型定义
export interface Action {
  tool: string
  params: Record<string, unknown>
}

export interface InterpretRequest {
  text: string
  canvas_context?: string
}

export interface InterpretResponse {
  reply: string
  actions: Action[]
}

/**
 * 调用 AI 解释接口
 */
export async function interpret(request: InterpretRequest): Promise<InterpretResponse> {
  const response = await apiClient.post<InterpretResponse>('/interpret', request)
  return response.data
}

/**
 * 健康检查
 */
export async function healthCheck(): Promise<{ status: string; service: string }> {
  const response = await apiClient.get('/health')
  return response.data
}

export default apiClient
