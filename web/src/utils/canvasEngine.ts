/**
 * Canvas 渲染引擎
 * ActionExecutor 类，根据 action 执行绘图操作
 */

import type { CanvasObject } from '@/stores/canvasStore'

// 动作接口
export interface Action {
  tool: string
  params: Record<string, unknown>
}

// 位置映射表
const positionMap: Record<string, { x: number; y: number }> = {
  'center': { x: 0.5, y: 0.5 },
  '中间': { x: 0.5, y: 0.5 },
  '正中间': { x: 0.5, y: 0.5 },
  'left_top': { x: 0.2, y: 0.2 },
  '左上角': { x: 0.2, y: 0.2 },
  'right_top': { x: 0.8, y: 0.2 },
  '右上角': { x: 0.8, y: 0.2 },
  'left_bottom': { x: 0.2, y: 0.8 },
  '左下角': { x: 0.2, y: 0.8 },
  'right_bottom': { x: 0.8, y: 0.8 },
  '右下角': { x: 0.8, y: 0.8 }
}

// 大小映射表
const sizeMap: Record<string, { width: number; height: number }> = {
  'small': { width: 40, height: 40 },
  '小': { width: 40, height: 40 },
  'medium': { width: 80, height: 80 },
  '中': { width: 80, height: 80 },
  'large': { width: 120, height: 120 },
  '大': { width: 120, height: 120 }
}

/**
 * Canvas 渲染引擎
 */
export class CanvasEngine {
  private ctx: CanvasRenderingContext2D
  private canvasWidth: number
  private canvasHeight: number

  constructor(ctx: CanvasRenderingContext2D, width: number, height: number) {
    this.ctx = ctx
    this.canvasWidth = width
    this.canvasHeight = height
  }

  /**
   * 解析位置
   */
  private parsePosition(position: string): { x: number; y: number } {
    // 检查预定义位置
    for (const [key, value] of Object.entries(positionMap)) {
      if (position.includes(key)) {
        return {
          x: value.x * this.canvasWidth,
          y: value.y * this.canvasHeight
        }
      }
    }
    // 默认中间
    return {
      x: this.canvasWidth / 2,
      y: this.canvasHeight / 2
    }
  }

  /**
   * 解析大小
   */
  private parseSize(size: string): { width: number; height: number } {
    for (const [key, value] of Object.entries(sizeMap)) {
      if (size.includes(key)) {
        return value
      }
    }
    return sizeMap['medium']
  }

  /**
   * 解析颜色
   */
  private parseColor(color: string): string {
    const colorMap: Record<string, string> = {
      '红': '#FF0000',
      '红色': '#FF0000',
      'red': '#FF0000',
      '蓝': '#0000FF',
      '蓝色': '#0000FF',
      'blue': '#0000FF',
      '绿': '#00FF00',
      '绿色': '#00FF00',
      'green': '#00FF00',
      '黄': '#FFFF00',
      '黄色': '#FFFF00',
      'yellow': '#FFFF00',
      '黑': '#000000',
      '黑色': '#000000',
      'black': '#000000',
      '白': '#FFFFFF',
      '白色': '#FFFFFF',
      'white': '#FFFFFF',
      '橙': '#FFA500',
      '橙色': '#FFA500',
      'orange': '#FFA500'
    }
    return colorMap[color] || color
  }

  /**
   * 清空画布
   */
  clear(): void {
    this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight)
  }

  /**
   * 绘制圆形
   */
  drawCircle(x: number, y: number, radius: number, color: string): void {
    this.ctx.beginPath()
    this.ctx.arc(x, y, radius, 0, Math.PI * 2)
    this.ctx.fillStyle = this.parseColor(color)
    this.ctx.fill()
    this.ctx.closePath()
  }

  /**
   * 绘制矩形
   */
  drawRect(x: number, y: number, width: number, height: number, color: string): void {
    this.ctx.fillStyle = this.parseColor(color)
    this.ctx.fillRect(x - width / 2, y - height / 2, width, height)
  }

  /**
   * 绘制三角形
   */
  drawTriangle(x: number, y: number, size: number, color: string): void {
    this.ctx.beginPath()
    this.ctx.moveTo(x, y - size / 2)
    this.ctx.lineTo(x - size / 2, y + size / 2)
    this.ctx.lineTo(x + size / 2, y + size / 2)
    this.ctx.closePath()
    this.ctx.fillStyle = this.parseColor(color)
    this.ctx.fill()
  }

  /**
   * 渲染单个对象
   */
  renderObject(obj: CanvasObject): void {
    switch (obj.shape) {
      case 'circle':
        this.drawCircle(obj.x, obj.y, obj.width / 2, obj.color)
        break
      case 'rectangle':
        this.drawRect(obj.x, obj.y, obj.width, obj.height, obj.color)
        break
      case 'triangle':
        this.drawTriangle(obj.x, obj.y, obj.width, obj.color)
        break
    }
  }

  /**
   * 渲染所有对象
   */
  renderAll(objects: CanvasObject[]): void {
    this.clear()
    objects.forEach(obj => this.renderObject(obj))
  }

  /**
   * 执行动作并返回新的对象属性
   */
  executeAction(action: Action): Partial<CanvasObject> | null {
    const { tool, params } = action

    switch (tool) {
      case 'draw_shape': {
        const position = this.parsePosition(params.position as string || 'center')
        const size = this.parseSize(params.size as string || 'medium')
        return {
          shape: params.shape_type as CanvasObject['shape'] || 'circle',
          color: params.color as string || 'black',
          size: params.size as CanvasObject['size'] || 'medium',
          position: params.position as string || 'center',
          tag: params.tag as string || undefined,
          x: position.x,
          y: position.y,
          width: size.width,
          height: size.height
        }
      }

      default:
        console.warn('未知工具:', tool)
        return null
    }
  }
}
