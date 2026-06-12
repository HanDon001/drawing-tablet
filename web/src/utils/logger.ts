/**
 * 日志工具模块
 * 封装 console.log，支持 Debug/Info/Error 级别
 * 生产环境忽略 Debug 级别日志
 */

// 日志级别枚举
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  ERROR = 2
}

// 当前环境日志级别
const CURRENT_LEVEL: LogLevel = import.meta.env.DEV ? LogLevel.DEBUG : LogLevel.INFO

// 日志前缀
const PREFIX = '[VoiceCanvas]'

/**
 * 格式化时间戳
 */
function getTimestamp(): string {
  return new Date().toISOString().slice(11, 23)
}

/**
 * Debug 级别日志
 * 仅在开发环境输出
 */
export function debug(...args: unknown[]): void {
  if (CURRENT_LEVEL <= LogLevel.DEBUG) {
    console.log(`${PREFIX} [DEBUG ${getTimestamp()}]`, ...args)
  }
}

/**
 * Info 级别日志
 */
export function info(...args: unknown[]): void {
  if (CURRENT_LEVEL <= LogLevel.INFO) {
    console.info(`${PREFIX} [INFO ${getTimestamp()}]`, ...args)
  }
}

/**
 * Warn 级别日志
 */
export function warn(...args: unknown[]): void {
  console.warn(`${PREFIX} [WARN ${getTimestamp()}]`, ...args)
}

/**
 * Error 级别日志
 */
export function error(...args: unknown[]): void {
  if (CURRENT_LEVEL <= LogLevel.ERROR) {
    console.error(`${PREFIX} [ERROR ${getTimestamp()}]`, ...args)
  }
}

// 导出 logger 对象
export const logger = {
  debug,
  info,
  warn,
  error
}

export default logger
