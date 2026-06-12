/**
 * VC.Agent - AI 代理系统
 * AI 助手可自主调用所有功能
 */
(function() {
    'use strict';

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
                () => VC.Cmd.drawShape({ shape_type: 'circle', color: '#EF4444', position: 'center', size: 'medium' }),
                '画一个红色的圆在中间'
            );
            await this._delay(600);

            // 2. 绘制星形
            await this._execAndSpeak(
                () => VC.Cmd.drawShape({ shape_type: 'star', color: '#FFD700', position: 'left_top', size: 'small' }),
                '在左上角画一个金色的星'
            );
            await this._delay(600);

            // 3. 绘制箭头
            await this._execAndSpeak(
                () => VC.Cmd.drawShape({ shape_type: 'arrow', color: '#3B82F6', position: 'right', size: 'medium' }),
                '右边画一个蓝色箭头'
            );
            await this._delay(600);

            // 4. 编辑颜色
            const objs = VC.State.objects || [];
            const circle = objs.find(o => o.shape === 'circle');
            if (circle) {
                VC.State.select(circle.id);
                await this._execAndSpeak(
                    () => VC.Cmd.editShape({ target_tag: circle.tag || circle.id, new_color: '#10B981' }),
                    '把圆改成绿色'
                );
                await this._delay(600);
            }

            // 5. 设置透明度
            if (circle) {
                await this._execAndSpeak(
                    () => VC.Cmd.setOpacity({ target_tag: circle.tag || circle.id, opacity: 0.7 }),
                    '把圆变成半透明'
                );
                await this._delay(600);
            }

            // 6. 查询画布
            const context = VC.Cmd.listShapes();
            await VC.Voice.speak(context);
            await this._delay(600);

            // 7. 撤销
            await this._execAndSpeak(
                () => VC.Cmd.undo(),
                '撤销刚才的操作'
            );
            await this._delay(600);

            // 8. 主题创作
            await this._execAndSpeak(
                () => VC.Cmd.createTheme({ theme_name: '太阳' }),
                '用主题创作一个太阳'
            );
            await this._delay(1000);

            // 9. 清空
            await this._execAndSpeak(
                () => VC.Cmd.clearAll(),
                '清空画布'
            );

            if (VC.Log) VC.Log.add('agent', '✅ AI 演示完成');
        },

        /**
         * AI 主题创作（委托给 VC.Cmd）
         */
        async createOnTheme(themeName) {
            if (VC.Log) VC.Log.add('agent', `🎨 AI 主题创作: ${themeName}`);
            await VC.Voice.speak(`让我来画一幅${themeName}主题的画`);
            await this._delay(500);

            const result = VC.Cmd.createTheme({ theme_name: themeName });

            if (result) {
                await VC.Voice.speak(`${themeName}主题创作完成`);
            } else {
                await VC.Voice.speak(`抱歉，没有${themeName}这个主题`);
            }
            return result;
        },

        /**
         * 获取可用主题列表（委托给 VC.Cmd）
         */
        getThemes() {
            return ['星空', '太阳', '房子'];
        },

        /**
         * 执行并播报
         */
        async _execAndSpeak(execFn, description) {
            execFn();
            if (VC.Log) VC.Log.add('agent', `🤖 ${description}`);
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
