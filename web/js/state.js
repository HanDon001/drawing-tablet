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
        currentTool: 'select',  // select | pen | eraser | fill | ai_draw
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
                color: obj.color || '#1F2937',
                size: obj.size || 'medium',
                position: obj.position || 'center',
                opacity: obj.opacity || 1,
                strokeColor: obj.strokeColor || 'none',
                strokeWidth: obj.strokeWidth || 2,
                tag: obj.tag || null,
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
         * 生成画布上下文描述
         */
        toContextString() {
            if (this.objects.length === 0) return '画布为空';

            return this.objects.map(obj => {
                const posLabel = VC.Config.POSITION_MAP[obj.position]?.label || '中';
                const sizeLabel = obj.size === 'small' ? '小' : obj.size === 'large' ? '大' : '';
                const shapeLabel = VC.Config.SHAPE_NAMES[obj.shape] || obj.shape;
                const tagInfo = obj.tag ? `，叫做"${obj.tag}"` : '';
                return `画布${posLabel}有一个${obj.color}${sizeLabel}${shapeLabel}${tagInfo}`;
            }).join('；');
        }
    };

    console.log('[VC.State] 状态管理初始化完成');
})();
