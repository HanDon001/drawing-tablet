/**
 * VC.Log - 日志系统
 * 管理 Event Log 面板
 */
(function() {
    'use strict';

    let logContainer = null;

    VC.Log = {
        /**
         * 初始化日志系统
         */
        init(containerId) {
            logContainer = document.getElementById(containerId);
            this.add('system', '引擎初始化完成');
            console.log('[Log] 日志系统初始化完成');
        },

        /**
         * 添加日志条目
         */
        add(role, text) {
            if (!logContainer) {
                console.log(`[Log] ${role}: ${text}`);
                return;
            }

            const entry = document.createElement('div');
            entry.className = 'log-enter flex gap-2 items-start';

            const iconConfig = this._getIconConfig(role);

            entry.innerHTML = `
                <div class="w-4 h-4 rounded-full ${iconConfig.bg} flex items-center justify-center flex-shrink-0 mt-0.5">
                    <i class="fas ${iconConfig.icon} text-[8px] ${iconConfig.color}"></i>
                </div>
                <div class="text-[11px] text-body-text/70 leading-relaxed">${this._escapeHtml(text)}</div>
            `;

            logContainer.appendChild(entry);
            logContainer.scrollTop = logContainer.scrollHeight;

            // 限制日志数量
            while (logContainer.children.length > 100) {
                logContainer.removeChild(logContainer.firstChild);
            }
        },

        /**
         * 获取图标配置
         */
        _getIconConfig(role) {
            const configs = {
                user:    { icon: 'fa-user', bg: 'bg-deep-brown/10', color: 'text-deep-brown' },
                ui:      { icon: 'fa-mouse-pointer', bg: 'bg-mid-brown/10', color: 'text-mid-brown' },
                system:  { icon: 'fa-exclamation-circle', bg: 'bg-red-100', color: 'text-red-500' },
                ai:      { icon: 'fa-robot', bg: 'bg-warm-orange/10', color: 'text-warm-orange' },
                agent:   { icon: 'fa-robot', bg: 'bg-purple-100', color: 'text-purple-500' },
                cmd:     { icon: 'fa-terminal', bg: 'bg-green-100', color: 'text-green-500' },
                query:   { icon: 'fa-search', bg: 'bg-blue-100', color: 'text-blue-500' },
                voice:   { icon: 'fa-microphone', bg: 'bg-orange-100', color: 'text-orange-500' }
            };
            return configs[role] || configs.system;
        },

        /**
         * HTML 转义
         */
        _escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        },

        /**
         * 清空日志
         */
        clear() {
            if (logContainer) {
                logContainer.innerHTML = '<div class="text-center text-[10px] text-mid-brown/40 my-4">--- 日志已清空 ---</div>';
            }
        }
    };

    console.log('[Log] 日志模块加载完成');
})();
