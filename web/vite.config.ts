import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],

  // 路径别名
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },

  // 开发服务器配置
  server: {
    port: 5173,
    // API 代理 - 将 /ai 请求转发到后端
    proxy: {
      '/ai/v1/voice/asr/ws': {
        target: 'ws://localhost:8000',
        ws: true,
        changeOrigin: true
      },
      '/ai': {
        target: 'http://localhost:8000',
        changeOrigin: true
      }
    },
    // 允许访问上级目录的 site 文件夹
    fs: {
      allow: ['..']
    }
  },

  // 构建配置
  build: {
    outDir: 'dist',
    sourcemap: true
  }
})
