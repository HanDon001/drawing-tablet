/**
 * VC.Store - 防抖持久化
 * 2s 防抖自动保存至 localStorage
 */
(function() {
    'use strict';

    const STORAGE_KEY = 'voicecanvas_state';
    let saveTimer = null;

    VC.Store = {
        /**
         * 初始化 - 加载保存的状态
         */
        init() {
            this.load();
            this._bindAutoSave();
            console.log('[Store] 持久化模块初始化完成');
        },

        /**
         * 从 localStorage 加载状态
         */
        load() {
            try {
                const data = localStorage.getItem(STORAGE_KEY);
                if (data) {
                    const parsed = JSON.parse(data);
                    VC.State.objects = parsed.objects || [];
                    VC.State.selectedObjectId = parsed.selectedObjectId || null;

                    console.log(`[Store] 加载了 ${VC.State.objects.length} 个对象`);
                    VC.State.emit('objectsChange', { action: 'load' });
                }
            } catch (e) {
                console.error('[Store] 加载失败:', e);
            }
        },

        /**
         * 保存到 localStorage
         */
        save() {
            try {
                const data = {
                    objects: VC.State.objects,
                    selectedObjectId: VC.State.selectedObjectId,
                    savedAt: Date.now()
                };
                localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
                console.log(`[Store] 已保存 ${VC.State.objects.length} 个对象`);
            } catch (e) {
                console.error('[Store] 保存失败:', e);
            }
        },

        /**
         * 调度保存（防抖）
         */
        scheduleSave() {
            if (saveTimer) {
                clearTimeout(saveTimer);
            }
            saveTimer = setTimeout(() => {
                this.save();
                saveTimer = null;
            }, VC.Config.SAVE_DELAY);
        },

        /**
         * 绑定自动保存
         */
        _bindAutoSave() {
            VC.State.on('objectsChange', () => {
                this.scheduleSave();
            });
        },

        /**
         * 清除保存的数据
         */
        clear() {
            localStorage.removeItem(STORAGE_KEY);
            console.log('[Store] 已清除保存的数据');
        }
    };

    console.log('[Store] 持久化模块加载完成');
})();
