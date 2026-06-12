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
 * 处理慢通道指令（调用 AI）
 */
async function handleSlowCommand(text: string): Promise<void> {
  isLoading.value = true
  statusText.value = '正在理解指令...'

  try {
    // 构建画布上下文描述
    const canvasContext = canvasStore.objects.length > 0
      ? canvasStore.objects.map(obj =>
          `画布上有一个${obj.color}${obj.size === 'small' ? '小' : obj.size === 'large' ? '大' : ''}${obj.shape === 'circle' ? '圆' : obj.shape === 'rectangle' ? '方块' : '三角形'}${obj.tag ? `(标签:${obj.tag})` : ''}`
        ).join('；')
      : '画布为空'

    // 调用 AI 接口
    const response = await interpret({
      text,
      canvas_context: canvasContext
    })

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
            logger.warn('未知工具:', action.tool)
        }
      }
      renderCanvas()
    }

    // 语音播报回复
    if (response.reply) {
      await speak(response.reply)
    }

    statusText.value = ''

  } catch (error) {
    logger.error('处理指令失败:', error)
    statusText.value = ''
    await speak('抱歉，处理指令时出错了，请稍后重试')
  } finally {
    isLoading.value = false
  }
}

// 监听 ASR 识别结果
watch(transcript, async (newText) => {
  if (!newText) return

  logger.info('收到语音输入:', newText)
  statusText.value = `识别到: ${newText}`

  // 检查快通道
  const fastCommand = detectFastCommand(newText)
  if (fastCommand) {
    const handled = await handleFastCommand(fastCommand)
    if (handled) {
      statusText.value = ''
      return
    }
  }

  // 走慢通道
  await handleSlowCommand(newText)
})

// 监听对象变化，自动保存
watch(
  () => canvasStore.objects,
  () => {
    renderCanvas()
    canvasStore.saveToLocal()
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
