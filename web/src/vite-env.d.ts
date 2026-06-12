/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

// Vite 环境变量类型
interface ImportMetaEnv {
  readonly VITE_AI_API_BASE: string
  readonly VITE_ASR_LANGUAGE: string
  readonly VITE_TTS_VOICE_NAME: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
