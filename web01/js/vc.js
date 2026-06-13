/**
 * VoiceCanvas - 命名空间入口 + 配置常量
 * 所有模块挂在 VC 全局对象下
 */
window.VC = window.VC || {};

// 配置常量
VC.Config = {
    API_BASE: '/ai/v1',
    ASR_LANGUAGE: 'zh-CN',
    TTS_VOICE: 'Chloe',
    SAVE_DELAY: 2000,        // 防抖保存延迟 (ms)
    CANVAS_BASE_SIZE: 30,    // 基础图形尺寸
    MAX_HISTORY: 15,         // 最大历史记录数

    // 位置映射 (9宫格)
    POSITION_MAP: {
        'left_top':     { x: 0.2, y: 0.2, label: '左上' },
        'top':          { x: 0.5, y: 0.2, label: '上' },
        'right_top':    { x: 0.8, y: 0.2, label: '右上' },
        'left':         { x: 0.2, y: 0.5, label: '左' },
        'center':       { x: 0.5, y: 0.5, label: '中' },
        'right':        { x: 0.8, y: 0.5, label: '右' },
        'left_bottom':  { x: 0.2, y: 0.8, label: '左下' },
        'bottom':       { x: 0.5, y: 0.8, label: '下' },
        'right_bottom': { x: 0.8, y: 0.8, label: '右下' }
    },

    // 颜色映射
    COLOR_MAP: {
        '红': '#EF4444', '蓝': '#3B82F6', '绿': '#10B981',
        '黄': '#F59E0B', '黑': '#1F2937', '白': '#FFFFFF',
        '橙': '#F97316', '紫': '#8B5CF6', '粉': '#EC4899', '灰': '#6B7280',
        '金': '#F59E0B', '棕': '#92400E', '青': '#06B6D4',
        '无': 'none', '透明': 'none'
    },

    // 大小映射
    SIZE_MAP: { '小': 'small', '中': 'medium', '大': 'large' },

    // 形状映射
    SHAPE_MAP: {
        '圆': 'circle', '方块': 'rectangle', '矩形': 'rectangle',
        '三角': 'triangle', '直线': 'line', '星': 'star',
        '菱': 'diamond', '箭头': 'arrow', '六边': 'hexagon'
    },

    // 形状中文名
    SHAPE_NAMES: {
        circle: '圆形', rectangle: '矩形', triangle: '三角',
        line: '直线', star: '星形', diamond: '菱形',
        arrow: '箭头', hexagon: '六边形'
    }
};

console.log('[VC] 命名空间初始化完成');
