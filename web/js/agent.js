/**
 * VC.Agent - AI 代理系统
 * AI 助手可自主调用所有功能
 */
(function() {
    'use strict';

    // 主题配置库
    const THEMES = {
        '星空': [
            { shape: 'circle', color: '#1E3A5F', size: 'large', position: 'center', tag: '夜空' },
            { shape: 'star', color: '#FFD700', size: 'small', position: 'left_top', tag: '星星1' },
            { shape: 'star', color: '#FFD700', size: 'small', position: 'right_top', tag: '星星2' },
            { shape: 'star', color: '#FFD700', size: 'small', position: 'left', tag: '星星3' },
            { shape: 'circle', color: '#F5F5DC', size: 'medium', position: 'right', tag: '月亮' }
        ],
        '太阳': [
            { shape: 'circle', color: '#FFD700', size: 'large', position: 'center', tag: '太阳' },
            { shape: 'triangle', color: '#FFA500', size: 'small', position: 'left_top', tag: '光线1' },
            { shape: 'triangle', color: '#FFA500', size: 'small', position: 'right_top', tag: '光线2' },
            { shape: 'triangle', color: '#FFA500', size: 'small', position: 'left_bottom', tag: '光线3' },
            { shape: 'triangle', color: '#FFA500', size: 'small', position: 'right_bottom', tag: '光线4' }
        ],
        '房子': [
            { shape: 'rectangle', color: '#8B4513', size: 'large', position: 'center', tag: '墙' },
            { shape: 'triangle', color: '#A0522D', size: 'medium', position: 'top', tag: '屋顶' },
            { shape: 'rectangle', color: '#87CEEB', size: 'small', position: 'left', tag: '窗户' },
            { shape: 'rectangle', color: '#654321', size: 'small', position: 'right', tag: '门' }
        ]
    };

    VC.Agent = {
        /**
         * AI 演示所有功能
         */
        async demonstrate() {
            if (VC.Log) VC.Log.add('agent', '🤖 AI 开始演示...');

            await VC.Voice.speak('让我来演示所有功能');
            await this._delay(800);

            // 1. 绘制圆形
            await this._execAndSpeak(
                () => VC.Cmd.drawShape({ shape: 'circle', color: '#EF4444', position: 'center', size: 'medium' }),
                '画一个红色的圆在中间'
            );
            await this._delay(600);

            // 2. 绘制矩形
            await this._execAndSpeak(
                () => VC.Cmd.drawShape({ shape: 'rectangle', color: '#3B82F6', position: 'left_top', size: 'small' }),
                '在左上角画一个蓝色的方块'
            );
            await this._delay(600);

            // 3. 编辑颜色
            const redCircle = VC.State.objects.find(o => o.tag === null && o.shape === 'circle');
            if (redCircle) {
                VC.State.select(redCircle.id);
                await this._execAndSpeak(
                    () => VC.Cmd.editShape({ targetId: redCircle.id, newColor: '#10B981' }),
                    '把圆改成绿色'
                );
                await this._delay(600);
            }

            // 4. 移动位置
            if (redCircle) {
                await this._execAndSpeak(
                    () => VC.Cmd.editShape({ targetId: redCircle.id, newPosition: 'right_bottom' }),
                    '把圆移到右下角'
                );
                await this._delay(600);
            }

            // 5. 查询画布
            const context = VC.Cmd.queryCanvas();
            await VC.Voice.speak(context);
            await this._delay(600);

            // 6. 撤销
            await this._execAndSpeak(
                () => VC.Cmd.undo(),
                '撤销刚才的操作'
            );
            await this._delay(600);

            // 7. 清空
            await this._execAndSpeak(
                () => VC.Cmd.clearAll(),
                '清空画布'
            );

            if (VC.Log) VC.Log.add('agent', '✅ AI 演示完成');
        },

        /**
         * AI 主题创作
         */
        async createOnTheme(themeName) {
            const theme = THEMES[themeName];
            if (!theme) {
                if (VC.Log) VC.Log.add('agent', `⚠️ 未知主题: ${themeName}`);
                return false;
            }

            if (VC.Log) VC.Log.add('agent', `🎨 AI 主题创作: ${themeName}`);
            await VC.Voice.speak(`让我来画一幅${themeName}主题的画`);
            await this._delay(500);

            for (const item of theme) {
                VC.Cmd.drawShape(item);
                await this._delay(400);
            }

            await VC.Voice.speak(`${themeName}主题创作完成`);
            return true;
        },

        /**
         * 获取可用主题列表
         */
        getThemes() {
            return Object.keys(THEMES);
        },

        /**
         * 执行并播报
         */
        async _execAndSpeak(execFn, description) {
            execFn();
            if (VC.Log) VC.Log.add('agent', `🤖 ${description}`);
            if (typeof addChatMessage === 'function') addChatMessage('assistant', description);
            await VC.Voice.speak(description);
        },

        /**
         * 延迟
         */
        _delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }
    };

    console.log('[Agent] AI 代理系统加载完成');
})();
