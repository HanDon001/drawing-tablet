<template>
  <div class="app">
    <!-- Canvas 画布 -->
    <canvas
      ref="canvasRef"
      class="canvas"
      :width="canvasStore.width"
      :height="canvasStore.height"
    ></canvas>

    <!-- 状态提示 -->
    <div class="status-bar" v-if="statusText">
      <span class="status-text">{{ statusText }}</span>
    </div>

    <!-- 麦克风按钮 -->
    <MicButton
      :is-listening="asrState === 'listening'"
      :is-loading="isLoading"
      @click="handleMicClick"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useCanvasStore } from '@/stores/canvasStore'
import { CanvasEngine } from '@/utils/canvasEngine'
import { useVoice } from '@/composables/useVoice'
import { interpret } from '@/api'
import { logger } from '@/utils/logger'
import MicButton from '@/components/MicButton.vue'

// Store
const canvasStore = useCanvasStore()

// 语音服务
const { asrState, transcript, startListening, stopListening, speak, detectFastCommand } = useVoice()

// Canvas 引用
const canvasRef = ref<HTMLCanvasElement | null>(null)

// 状态
const isLoading = ref(false)
const statusText = ref('')

// Canvas 引擎实例
let engine: CanvasEngine | null = null

// 防抖定时器
let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null

/**
 * 生成请求ID（全链路追踪）
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * 初始化 Canvas
 */
function initCanvas() {
  if (!canvasRef.value) return

  const ctx = canvasRef.value.getContext('2d')
  if (!ctx) return

  engine = new CanvasEngine(ctx, canvasStore.width, canvasStore.height)

  // 从本地存储加载
  canvasStore.loadFromLocal()

  // 渲染已有对象
  renderCanvas()

  logger.info('Canvas 初始化完成')
}

/**
 * 渲染画布
 */
function renderCanvas() {
  if (!engine) return
  engine.renderAll(canvasStore.objects)
}

/**
 * 处理麦克风点击
 */
function handleMicClick() {
  if (asrState.value === 'listening') {
    stopListening()
  } else {
    startListening()
  }
}

/**
 * 处理快通道指令
 */
async function handleFastCommand(command: string): Promise<boolean> {
  switch (command) {
    case 'undo':
      canvasStore.undo()
      await speak('已撤销')
      return true

    case 'clear':
      canvasStore.clear()
      await speak('已清空画布')
      return true

    case 'stop':
      await speak('好的，我安静')
      return true

    default:
      return false
  }
}

/**
 * 构建画布上下文描述（视障查询优化）
 * 生成包含空间方位的自然语言描述
 */
function buildCanvasContext(): string {
  const objects = canvasStore.objects

  if (objects.length === 0) {
    return '画布为空，没有任何图形'
  }

  // 位置映射（用于空间描述）
  const positionNames: Record<string, string> = {
    'center': '中间',
    'left_top': '左上角',
    'right_top': '右上角',
    'left_bottom': '左下角',
    'right_bottom': '右下角'
  }

  // 形状名称映射
  const shapeNames: Record<string, string> = {
    'circle': '圆',
    'rectangle': '方块',
    'triangle': '三角形',
    'line': '线'
  }

  // 大小名称映射
  const sizeNames: Record<string, string> = {
    'small': '小',
    'medium': '',
    'large': '大'
  }

  const descriptions = objects.map(obj => {
    const posName = positionNames[obj.position] || obj.position
    const shapeName = shapeNames[obj.shape] || obj.shape
    const sizeName = sizeNames[obj.size] || ''
    const tagInfo = obj.tag ? `，叫做"${obj.tag}"` : ''

    return `画布${posName}有一个${obj.color}${sizeName}${shapeName}${tagInfo}`
  })

  return descriptions.join('；')
}

/**
 * 处理慢通道指令（调用 AI）
 */
async function handleSlowCommand(text: string): Promise<void> {
  const requestId = generateRequestId()
  isLoading.value = true
  statusText.value = '正在理解指令...'

  logger.info(`[${requestId}] 开始处理指令: ${text}`)

  try {
    // 构建画布上下文描述
    const canvasContext = buildCanvasContext()

    logger.info(`[${requestId}] 画布上下文: ${canvasContext}`)

    // 调用 AI 接口（带超时）
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('请求超时')), 10000)
    })

    const response = await Promise.race([
      interpret({
        text,
        canvas_context: canvasContext
      }),
      timeoutPromise
    ])

    logger.info(`[${requestId}] AI 响应:`, response)

    // 执行动作
    if (response.actions && response.actions.length > 0) {
      for (const action of response.actions) {
        if (!engine) continue

        switch (action.tool) {
          case 'draw_shape': {
            const objProps = engine.executeDrawAction(action)
            if (objProps) {
              canvasStore.addObject(objProps as any)
            }
            break
          }

          case 'edit_shape': {
            const result = engine.executeEditAction(action, canvasStore.objects)
            if (result) {
              canvasStore.updateObject(result.id, result.updates)
            }
            break
          }

          case 'delete_shape': {
            const id = engine.executeDeleteAction(action, canvasStore.objects)
            if (id) {
              canvasStore.removeObject(id)
            }
            break
          }

          default:
            logger.warn(`[${requestId}] 未知工具: ${action.tool}`)
        }
      }
      renderCanvas()
    }

    // 语音播报回复
    if (response.reply) {
      await speak(response.reply)
    }

    statusText.value = ''
    logger.info(`[${requestId}] 指令处理完成`)

  } catch (error: any) {
    const errorMsg = error?.message || '未知错误'
    logger.error(`[${requestId}] 处理指令失败: ${errorMsg}`)
    statusText.value = ''

    // 友好的错误提示
    if (errorMsg.includes('超时')) {
      await speak('网络开小差了，请稍后再试')
    } else {
      await speak('抱歉，处理指令时出错了')
    }
  } finally {
    isLoading.value = false
  }
}

// 监听 ASR 识别结果
watch(transcript, async (newText) => {
  if (!newText) return

  // 提取实际文本（去掉时间戳后缀）
  const actualText = newText.split('__')[0]

  logger.info('收到语音输入:', actualText)
  statusText.value = `识别到: ${actualText}`

  // 检查快通道
  const fastCommand = detectFastCommand(actualText)
  if (fastCommand) {
    const handled = await handleFastCommand(fastCommand)
    if (handled) {
      statusText.value = ''
      return
    }
  }

  // 走慢通道
  await handleSlowCommand(actualText)
})

// 监听对象变化，防抖自动保存
watch(
  () => canvasStore.objects,
  () => {
    renderCanvas()

    // 防抖保存（2秒）
    if (saveDebounceTimer) {
      clearTimeout(saveDebounceTimer)
    }
    saveDebounceTimer = setTimeout(() => {
      canvasStore.saveToLocal()
      logger.debug('画布已自动保存')
    }, 2000)
  },
  { deep: true }
)

// 初始化
onMounted(() => {
  initCanvas()
})
</script>

<style scoped>
.app {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #1a1a2e;
  position: relative;
  overflow: hidden;
}

.canvas {
  background: #ffffff;
  border-radius: 8px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
}

.status-bar {
  position: fixed;
  bottom: 120px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 8px 20px;
  border-radius: 20px;
  font-size: 14px;
  z-index: 999;
  backdrop-filter: blur(10px);
}

.status-text {
  max-width: 400px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
