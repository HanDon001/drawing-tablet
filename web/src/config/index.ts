/**
 * 配置模块
 * 集中管理 VITE 环境变量
 */

// 环境变量接口
interface EnvConfig {
  /** AI服务API基础路径 */
  aiApiBase: string
  /** ASR语音识别语言 */
  asrLanguage: string
  /** TTS语音合成声音名称 */
  ttsVoiceName: string
}

// 从 import.meta.env 读取配置
export const config: EnvConfig = {
  aiApiBase: import.meta.env.VITE_AI_API_BASE || '/ai/v1',
  asrLanguage: import.meta.env.VITE_ASR_LANGUAGE || 'zh-CN',
  ttsVoiceName: import.meta.env.VITE_TTS_VOICE_NAME || 'Google 普通话'
}

// 导出单个配置项供便捷使用
export const {
  aiApiBase,
  asrLanguage,
  ttsVoiceName
} = config

export default config
