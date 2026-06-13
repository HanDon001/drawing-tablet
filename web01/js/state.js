/**
 * VC.State - 核心状态管理
 * 管理画布对象、历史记录、选中状态、语音状态
 */
(function() {
    'use strict';

    // 语音状态机: idle → recording → processing → speaking → idle
    const VOICE_STATES = ['idle', 'recording', 'processing', 'speaking'];

    VC.State = {
        objects: [],
        history: [],
        selectedObjectId: null,
        voiceState: 'idle',  // idle | recording | processing | speaking
        backendAvailable: false,
        reqCounter: 0,

        // 绘画工具状态
        currentTool: 'select',  // select | pen | eraser | fill | ai_draw | shape
        currentShape: 'circle', // 当前选中的形状（shape模式下使用）
        brush: {
            color: '#1F2937',
            size: 3,
            opacity: 1
        },
        drawingMode: false,  // AI 绘图模式开关

        // 状态变更事件
        _listeners: [],

        /**
         * 添加状态变更监听器
         */
        on(event, callback) {
            this._listeners.push({ event, callback });
        },

        /**
         * 触发状态变更事件
         */
        emit(event, data) {
            this._listeners
                .filter(l => l.event === event)
                .forEach(l => l.callback(data));
        },

        /**
         * 设置语音状态（严格状态机）
         */
        setVoiceState(newState) {
            if (!VOICE_STATES.includes(newState)) {
                console.warn('[State] 无效的语音状态:', newState);
                return false;
            }

            const oldState = this.voiceState;
            this.voiceState = newState;

            console.log(`[State] 语音状态: ${oldState} → ${newState}`);
            this.emit('voiceStateChange', { oldState, newState });

            return true;
        },

        /**
         * 保存历史快照
         */
        saveHistory() {
            this.history.push(JSON.parse(JSON.stringify(this.objects)));
            if (this.history.length > VC.Config.MAX_HISTORY) {
                this.history.shift();
            }
        },

        /**
         * 撤销操作
         */
        undo() {
            if (this.history.length === 0) {
                return false;
            }
            this.objects = this.history.pop();
            this.selectedObjectId = this.objects.length > 0
                ? this.objects[this.objects.length - 1].id
                : null;
            this.emit('objectsChange', { action: 'undo' });
            return true;
        },

        /**
         * 清空画布
         */
        clearAll() {
            this.saveHistory();
            this.objects = [];
            this.selectedObjectId = null;
            this.emit('objectsChange', { action: 'clear' });
        },

        /**
         * 添加对象
         */
        addObject(obj) {
            this.saveHistory();
            const newObj = {
                id: 'obj_' + Date.now() + '_' + (++this.reqCounter),
                shape: obj.shape || 'circle',
                color: obj.color || 'none',  // 默认无填充
                size: obj.size || 'medium',
                x: obj.x !== undefined ? obj.x : undefined,
                y: obj.y !== undefined ? obj.y : undefined,
                position: obj.position || 'center',
                opacity: obj.opacity || 1,
                strokeColor: obj.strokeColor || '无',  // 默认无边框
                strokeWidth: obj.strokeWidth || 2,
                tag: obj.tag || null,
                rotation: obj.rotation || 0,  // 旋转角度(度)
                createdAt: Date.now()
            };
            this.objects.push(newObj);
            this.selectedObjectId = newObj.id;
            this.emit('objectsChange', { action: 'add', object: newObj });
            return newObj;
        },

        /**
         * 更新对象
         */
        updateObject(id, updates) {
            const obj = this.objects.find(o => o.id === id);
            if (!obj) return false;

            this.saveHistory();
            Object.assign(obj, updates);
            this.emit('objectsChange', { action: 'update', object: obj });
            return true;
        },

        /**
         * 删除对象
         */
        deleteObject(id) {
            this.saveHistory();
            this.objects = this.objects.filter(o => o.id !== id);
            if (this.selectedObjectId === id) {
                this.selectedObjectId = null;
            }
            this.emit('objectsChange', { action: 'delete', id });
            return true;
        },

        /**
         * 获取选中的对象
         */
        getSelected() {
            return this.objects.find(o => o.id === this.selectedObjectId) || null;
        },

        /**
         * 选中对象
         */
        select(id) {
            this.selectedObjectId = id;
            this.emit('selectionChange', { id });
        },

        /**
         * 生成画布上下文描述（精确版）
         */
        toContextString() {
            if (this.objects.length === 0) return '画布为空';

            return this.objects.map((obj, i) => {
                const shapeLabel = VC.Config.SHAPE_NAMES[obj.shape] || obj.shape;
                const tag = obj.tag ? `"${obj.tag}"` : `#${i + 1}`;
                const x = obj.x !== undefined ? obj.x.toFixed(3) : (VC.Config.POSITION_MAP[obj.position]?.x || 0.5).toFixed(3);
                const y = obj.y !== undefined ? obj.y.toFixed(3) : (VC.Config.POSITION_MAP[obj.position]?.y || 0.5).toFixed(3);
                const size = typeof obj.size === 'number' ? `${obj.size}px` : (obj.size || 'medium');
                const color = obj.color || '无填充';
                const stroke = obj.stroke && obj.stroke !== 'none' ? `描边${obj.stroke}` : '';
                const rot = obj.rotation ? `旋转${obj.rotation}°` : '';
                return `[${tag}] ${shapeLabel}(${x},${y}) ${size} ${color} ${stroke} ${rot}`.trim();
            }).join('\n');
        }
    };

    console.log('[VC.State] 状态管理初始化完成');
})();
