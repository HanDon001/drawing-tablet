/**
 * VC.UI - UI 控制器
 * 管理侧边栏、面板、按钮事件
 */
(function() {
    'use strict';

    VC.UI = {
        /**
         * 初始化 UI
         */
        init() {
            this._initColorSwatches();
            this._bindPanelToggles();
            this._bindToolButtons();
            this._bindMicButton();
            this._bindAgentButtons();
            this._bindStateListeners();

            console.log('[UI] UI 控制器初始化完成');
        },

        /**
         * 初始化颜色色板
         */
        _initColorSwatches() {
            const fillDiv = document.getElementById('fillSwatches');
            const strokeDiv = document.getElementById('strokeSwatches');

            if (!fillDiv || !strokeDiv) return;

            // 无填充/无描边按钮
            fillDiv.innerHTML = `<div class="swatch flex items-center justify-center border border-dashed border-mid-brown/30 text-mid-brown/40 hover:border-warm-orange" style="background-color: transparent;" data-color="none" onclick="VC.UI._onColorPick('fill', 'none')" title="无填充"><i class="fas fa-ban" style="font-size:8px"></i></div>`;
            strokeDiv.innerHTML = `<div class="swatch flex items-center justify-center border border-dashed border-mid-brown/30 text-mid-brown/40 hover:border-warm-orange" style="background-color: transparent;" data-color="none" onclick="VC.UI._onColorPick('stroke', 'none')" title="无描边"><i class="fas fa-ban" style="font-size:8px"></i></div>`;

            // 颜色色板
            Object.entries(VC.Config.COLOR_MAP).forEach(([name, hex]) => {
                fillDiv.innerHTML += `<div class="swatch" style="background-color:${hex}" data-color="${hex}" onclick="VC.UI._onColorPick('fill', '${hex}')" title="填充:${name}"></div>`;
                strokeDiv.innerHTML += `<div class="swatch" style="background-color:${hex}" data-color="${hex}" onclick="VC.UI._onColorPick('stroke', '${hex}')" title="描边:${name}"></div>`;
            });
        },

        /**
         * 颜色选择回调
         */
        _onColorPick(type, color) {
            if (!VC.State.selectedObjectId) {
                this._showToast('请先选择对象');
                return;
            }

            if (type === 'fill') {
                VC.Cmd.editShape({ targetId: VC.State.selectedObjectId, newColor: color });
            } else {
                VC.Cmd.editShape({ targetId: VC.State.selectedObjectId, newStrokeColor: color });
            }

            this._updateColorSelection(type, color);
        },

        /**
         * 更新颜色选中状态
         */
        _updateColorSelection(type, color) {
            const containerId = type === 'fill' ? 'fillSwatches' : 'strokeSwatches';
            document.querySelectorAll(`#${containerId} .swatch`).forEach(s => {
                s.classList.toggle('active', s.dataset.color === color);
            });
        },

        /**
         * 绑定面板折叠
         */
        _bindPanelToggles() {
            document.querySelectorAll('.section-header').forEach(header => {
                header.addEventListener('click', () => {
                    const panelId = header.getAttribute('onclick')?.match(/togglePanel\('(.+?)'\)/)?.[1];
                    if (panelId) this.togglePanel(panelId);
                });
            });
        },

        /**
         * 切换面板显示
         */
        togglePanel(id) {
            const panel = document.getElementById(id);
            const arrow = document.getElementById(id + 'Arrow');
            if (!panel) return;

            if (panel.style.display === 'none') {
                panel.style.display = 'block';
                if (arrow) arrow.classList.add('open');
            } else {
                panel.style.display = 'none';
                if (arrow) arrow.classList.remove('open');
            }
        },

        /**
         * 绑定工具按钮
         */
        _bindToolButtons() {
            // 图形按钮
            document.querySelectorAll('.tool-btn[data-shape]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const shape = btn.dataset.shape;
                    VC.Cmd.drawShape({ shape });
                    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                });
            });

            // 大小按钮
            document.querySelectorAll('.capsule-btn[data-size]').forEach(btn => {
                btn.addEventListener('click', () => {
                    if (!VC.State.selectedObjectId) return this._showToast('请先选择对象');
                    VC.Cmd.editShape({ targetId: VC.State.selectedObjectId, newSize: btn.dataset.size });
                    document.querySelectorAll('.capsule-btn[data-size]').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                });
            });

            // 透明度按钮
            document.querySelectorAll('.capsule-btn[data-opacity]').forEach(btn => {
                btn.addEventListener('click', () => {
                    if (!VC.State.selectedObjectId) return this._showToast('请先选择对象');
                    VC.Cmd.editShape({ targetId: VC.State.selectedObjectId, newOpacity: parseFloat(btn.dataset.opacity) });
                    document.querySelectorAll('.capsule-btn[data-opacity]').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                });
            });

            // 位置按钮
            document.querySelectorAll('.pos-dot[data-pos]').forEach(dot => {
                dot.addEventListener('click', () => {
                    if (!VC.State.selectedObjectId) return this._showToast('请先选择对象');
                    VC.Cmd.editShape({ targetId: VC.State.selectedObjectId, newPosition: dot.dataset.pos });
                    document.querySelectorAll('.pos-dot').forEach(d => d.classList.remove('active'));
                    dot.classList.add('active');
                });
            });

            // 撤销/清空按钮
            const undoBtn = document.querySelector('button[onclick*="undo"]');
            const clearBtn = document.querySelector('button[onclick*="clear"]');
            if (undoBtn) undoBtn.addEventListener('click', () => VC.Cmd.undo());
            if (clearBtn) clearBtn.addEventListener('click', () => VC.Cmd.clearAll());
        },

        /**
         * 绑定麦克风按钮
         */
        _bindMicButton() {
            const micBtn = document.getElementById('micBtn');
            if (!micBtn) return;

            micBtn.addEventListener('click', async () => {
                // 麦克风 = 一次性语音指令（按一次说一句）
                if (VC.State.voiceState === 'recording') {
                    VC.Voice.stopRecording();
                } else if (VC.State.voiceState === 'idle') {
                    await VC.Voice.startRecording();
                }
            });
        },

        /**
         * 绑定 AI 代理按钮
         */
        _bindAgentButtons() {
            // AI 创作按钮（如果有）
            const demoBtn = document.getElementById('aiDemoBtn');
            if (demoBtn) {
                demoBtn.addEventListener('click', () => VC.Agent.demonstrate());
            }

            // 主题创作按钮
            document.querySelectorAll('[data-theme]').forEach(btn => {
                btn.addEventListener('click', () => {
                    VC.Agent.createOnTheme(btn.dataset.theme);
                });
            });
        },

        /**
         * 绑定状态监听器
         */
        _bindStateListeners() {
            // 语音状态变更
            VC.State.on('voiceStateChange', ({ newState }) => {
                this._updateVoiceUI(newState);
            });

            // 语音识别结果（增量 + 最终）
            VC.State.on('recognized', ({ text, isFinal }) => {
                this._showTranscript(text);
                if (isFinal) {
                    VC.Cmd.processText(text);
                }
            });

            // 对象变更
            VC.State.on('objectsChange', () => {
                this.updateLayerList();
                this._updateObjectCount();
            });

            // 选中变更
            VC.State.on('selectionChange', () => {
                this._updateSelectionUI();
            });
        },

        /**
         * 更新语音 UI
         */
        _updateVoiceUI(state) {
            const micBtn = document.getElementById('micBtn');
            const transcript = document.getElementById('transcriptText');
            const statusIndicator = document.getElementById('statusIndicator');

            if (micBtn) {
                micBtn.classList.toggle('bg-red-500', state === 'recording');
                micBtn.classList.toggle('mic-pulse', state === 'recording');
                micBtn.classList.toggle('bg-warm-orange', state !== 'recording');
            }

            if (transcript) {
                if (state === 'recording') {
                    transcript.textContent = '聆听中...';
                    transcript.classList.remove('opacity-0');
                } else if (state === 'processing') {
                    transcript.textContent = '识别中...';
                } else {
                    setTimeout(() => transcript.classList.add('opacity-0'), 1500);
                }
            }

            if (statusIndicator) {
                const statusMap = {
                    idle: { text: '就绪', color: 'bg-green-400' },
                    recording: { text: '录音中', color: 'bg-red-400' },
                    processing: { text: '处理中', color: 'bg-yellow-400' },
                    speaking: { text: '播报中', color: 'bg-blue-400' }
                };
                const s = statusMap[state] || statusMap.idle;
                statusIndicator.innerHTML = `<span class="w-1.5 h-1.5 rounded-full ${s.color}"></span><span>${s.text}</span>`;
            }
        },

        /**
         * 显示识别文本
         */
        _showTranscript(text) {
            const el = document.getElementById('transcriptText');
            if (!el) return;

            el.textContent = text;
            el.classList.remove('opacity-0');
            setTimeout(() => el.classList.add('opacity-0'), 2000);
        },

        /**
         * 更新图层列表
         */
        updateLayerList() {
            const list = document.getElementById('objectList');
            const countEl = document.getElementById('objCountSide');

            if (!list) return;

            const objects = VC.State.objects;
            if (countEl) countEl.textContent = objects.length;

            if (objects.length === 0) {
                list.innerHTML = '<div class="text-center text-[10px] text-mid-brown/40 py-6">暂无图层</div>';
                return;
            }

            list.innerHTML = '';
            [...objects].reverse().forEach(obj => {
                const nameMap = VC.Config.SHAPE_NAMES;
                const isSelected = obj.id === VC.State.selectedObjectId;

                const div = document.createElement('div');
                div.className = `layer-item ${isSelected ? 'active' : ''}`;
                div.onclick = () => VC.State.select(obj.id);

                let thumbStyle = `background-color:${obj.color === 'none' ? 'transparent' : obj.color};`;
                if (obj.shape === 'circle') thumbStyle += 'border-radius:50%;';
                if (obj.shape === 'diamond') thumbStyle += 'transform: rotate(45deg) scale(0.8);';
                if (obj.shape === 'line') thumbStyle += 'background-color:transparent; border-bottom: 2px solid black; height: 0; width: 80%; margin-top:10px;';

                div.innerHTML = `
                    <div class="layer-thumb" style="${thumbStyle}"></div>
                    <div class="flex-1 text-[11px] text-body-text truncate font-medium">${obj.tag || nameMap[obj.shape] || obj.shape}</div>
                    <div class="layer-actions">
                        <button class="layer-action-btn" onclick="event.stopPropagation(); VC.Cmd.deleteShape({targetId:'${obj.id}'})"><i class="fas fa-trash-alt"></i></button>
                    </div>
                `;
                list.appendChild(div);
            });
        },

        /**
         * 更新对象数量
         */
        _updateObjectCount() {
            const countEl = document.getElementById('objCountSide');
            if (countEl) countEl.textContent = VC.State.objects.length;
        },

        /**
         * 更新选中状态 UI
         */
        _updateSelectionUI() {
            const obj = VC.State.getSelected();
            if (!obj) return;

            // 更新颜色选中
            this._updateColorSelection('fill', obj.color);
            this._updateColorSelection('stroke', obj.strokeColor);

            // 更新大小选中
            document.querySelectorAll('.capsule-btn[data-size]').forEach(b => {
                b.classList.toggle('active', b.dataset.size === obj.size);
            });

            // 更新透明度选中
            document.querySelectorAll('.capsule-btn[data-opacity]').forEach(b => {
                b.classList.toggle('active', b.dataset.opacity === (obj.opacity || 1).toString());
            });

            // 更新位置选中
            document.querySelectorAll('.pos-dot[data-pos]').forEach(d => {
                d.classList.toggle('active', d.dataset.pos === obj.position);
            });
        },

        /**
         * 显示提示
         */
        _showToast(msg) {
            VC.Log.add('system', `⚠️ ${msg}`);
            VC.Voice.speak(msg);
        }
    };

    console.log('[UI] UI 控制器加载完成');
})();
