/**
 * 日志工具模块
 * 封装 console.log，支持 Debug/Info/Warn/Error 级别
 * 支持外部回调（用于 UI 日志面板）
 */

// 日志级别枚举
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

// 外部回调
type LogCallback = (level: 'debug' | 'info' | 'warn' | 'error', message: string) => void
let _callback: LogCallback | null = null

export function onLog(cb: LogCallback) {
  _callback = cb
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

function _emit(level: 'debug' | 'info' | 'warn' | 'error', args: unknown[]) {
  const message = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')
  if (_callback) _callback(level, message)
}

/**
 * Debug 级别日志
 */
export function debug(...args: unknown[]): void {
  if (CURRENT_LEVEL <= LogLevel.DEBUG) {
    console.log(`${PREFIX} [DEBUG ${getTimestamp()}]`, ...args)
    _emit('debug', args)
  }
}

/**
 * Info 级别日志
 */
export function info(...args: unknown[]): void {
  if (CURRENT_LEVEL <= LogLevel.INFO) {
    console.info(`${PREFIX} [INFO ${getTimestamp()}]`, ...args)
    _emit('info', args)
  }
}

/**
 * Warn 级别日志
 */
export function warn(...args: unknown[]): void {
  console.warn(`${PREFIX} [WARN ${getTimestamp()}]`, ...args)
  _emit('warn', args)
}

/**
 * Error 级别日志
 */
export function error(...args: unknown[]): void {
  console.error(`${PREFIX} [ERROR ${getTimestamp()}]`, ...args)
  _emit('error', args)
}

// 导出 logger 对象
export const logger = {
  debug,
  info,
  warn,
  error
}

export default logger
