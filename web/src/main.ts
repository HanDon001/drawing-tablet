/**
 * VoiceCanvas Web - 应用入口
 */

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './assets/main.css'

// 创建 Vue 应用
const app = createApp(App)

// 挂载 Pinia 状态管理
const pinia = createPinia()
app.use(pinia)

// 挂载到 DOM
app.mount('#app')
