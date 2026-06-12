/**
 * Canvas 状态管理
 * 使用 Pinia 管理画布对象状态
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

// 图形对象接口
export interface CanvasObject {
  /** 唯一标识 */
  id: string
  /** 形状类型 */
  shape: 'circle' | 'rectangle' | 'triangle' | 'line'
  /** 颜色 */
  color: string
  /** 大小 */
  size: 'small' | 'medium' | 'large'
  /** 位置描述 */
  position: string
  /** 标签，用于指代 */
  tag?: string
  /** x坐标 */
  x: number
  /** y坐标 */
  y: number
  /** 宽度/半径 */
  width: number
  /** 高度 */
  height: number
  /** 创建时间 */
  createdAt: number
}

// 画布状态接口
export interface CanvasState {
  /** 图形对象数组 */
  objects: CanvasObject[]
  /** 当前选中的对象ID */
  selectedId: string | null
  /** 画布宽度 */
  width: number
  /** 画布高度 */
  height: number
}

/**
 * Canvas Store
 */
export const useCanvasStore = defineStore('canvas', () => {
  // 状态
  const objects = ref<CanvasObject[]>([])
  const selectedId = ref<string | null>(null)
  const width = ref(800)
  const height = ref(600)

  // 计算属性
  const selectedObject = computed(() => {
    if (!selectedId.value) return null
    return objects.value.find(obj => obj.id === selectedId.value) || null
  })

  const objectCount = computed(() => objects.value.length)

  /**
   * 添加图形对象
   */
  function addObject(obj: Omit<CanvasObject, 'id' | 'createdAt'>): CanvasObject {
    const newObj: CanvasObject = {
      ...obj,
      id: generateId(),
      createdAt: Date.now()
    }
    objects.value.push(newObj)
    return newObj
  }

  /**
   * 更新图形对象
   */
  function updateObject(id: string, updates: Partial<CanvasObject>): void {
    const index = objects.value.findIndex(obj => obj.id === id)
    if (index !== -1) {
      objects.value[index] = { ...objects.value[index], ...updates }
    }
  }

  /**
   * 删除图形对象
   */
  function removeObject(id: string): void {
    objects.value = objects.value.filter(obj => obj.id !== id)
    if (selectedId.value === id) {
      selectedId.value = null
    }
  }

  /**
   * 根据标签查找对象
   */
  function findByTag(tag: string): CanvasObject | undefined {
    return objects.value.find(obj => obj.tag === tag)
  }

  /**
   * 选中对象
   */
  function select(id: string | null): void {
    selectedId.value = id
  }

  /**
   * 清空画布
   */
  function clear(): void {
    objects.value = []
    selectedId.value = null
  }

  /**
   * 撤销最后一个操作
   */
  function undo(): void {
    if (objects.value.length > 0) {
      const lastObj = objects.value[objects.value.length - 1]
      removeObject(lastObj.id)
    }
  }

  /**
   * 生成唯一ID
   */
  function generateId(): string {
    return `obj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 保存到本地存储
   */
  function saveToLocal(): void {
    try {
      const data = JSON.stringify(objects.value)
      localStorage.setItem('voicecanvas_objects', data)
    } catch (e) {
      console.error('保存到本地存储失败:', e)
    }
  }

  /**
   * 从本地存储加载
   */
  function loadFromLocal(): void {
    try {
      const data = localStorage.getItem('voicecanvas_objects')
      if (data) {
        objects.value = JSON.parse(data)
      }
    } catch (e) {
      console.error('从本地存储加载失败:', e)
    }
  }

  return {
    // 状态
    objects,
    selectedId,
    width,
    height,

    // 计算属性
    selectedObject,
    objectCount,

    // 方法
    addObject,
    updateObject,
    removeObject,
    findByTag,
    select,
    clear,
    undo,
    saveToLocal,
    loadFromLocal
  }
})
