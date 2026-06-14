# VoiceCanvas 设计文档 — 问题追踪与技术决策

## 项目核心目标

用户通过语音实现**无感绘画操作**和**矢量图绘制能力**：
- 语音输入 → AI 理解 → 画布执行，端到端延迟 < 3 秒
- 支持自然语言描述生成矢量图形（花、树、爱心等）
- 支持语音编辑已有图形（改颜色、移动、删除、调整大小）
- 视障用户可通过 TTS 反馈了解画布状态

---

## 一、已实现能力

### 1.1 语音交互链路

| 环节 | 状态 | 实现方式 |
|------|------|----------|
| 语音输入（陪伴模式） | ✅ 正常 | DashScope WebSocket 流式 ASR，实时 partial/final |
| 语音输入（麦克风模式） | ⚠️ 慢 | 浏览器 Web Speech API，延迟高且不稳定 |
| 语音活动检测 | ✅ 正常 | 前端 AudioWorklet VAD，能量阈值 0.02，hangover 1.5s |
| 语音合成反馈 | ✅ 正常 | DashScope TTS + SpeechSynthesis 降级 |
| 打断机制 | ✅ 正常 | TTS 播放时检测到用户开口立即停止 |

### 1.2 绘图能力

| 能力 | 状态 | 说明 |
|------|------|------|
| 基础形状绘制 | ✅ 正常 | circle/rect/triangle/line/star/diamond/arrow/hexagon |
| inject_fabric_json | ✅ 正常 | LLM 直接输出 Fabric.js JSON，支持复杂组合图形 |
| 预设主题绘制 | ✅ 正常 | 星空/太阳/房子等预设模板 |
| 中文颜色映射 | ✅ 正常 | 红→#EF4444, 蓝→#3B82F6 等 14 种颜色 |
| 像素坐标定位 | ✅ 正常 | 统一 originX:left/originY:top，圆形用 left=圆心X-radius |
| 九宫格定位 | ✅ 正常 | position 参数支持 left_top/center/right_bottom 等 |
| 撤销 | ✅ 正常 | 历史栈 saveHistory/undo |
| 重做 | ❌ 未实现 | redo() 是 stub，返回"重做功能开发中" |
| 保存导出 | ✅ 正常 | save_as_png / save_as_svg |

### 1.3 编辑能力（本次重点修复）

| 操作 | 修复前 | 修复后 |
|------|--------|--------|
| editShape | 只改第一个匹配对象 | 按 tag 批量修改所有匹配对象 |
| moveShape | 只移第一个 | 批量移动 |
| resizeShape | 只改第一个 | 批量缩放 |
| setOpacity | 只改第一个 | 批量透明度 |
| setStroke | 只改第一个 | 批量描边 |
| rotateShape | 只改第一个 | 批量旋转 |
| deleteByTag | 空 tag 匹配所有对象 | 空 tag 安全过滤 |
| reorderLayer | 前端函数缺失 | 已实现 bringToFront/sendToBack/bringForward/sendBackwards |

---

## 二、当前存在的问题（按严重程度排序）

### 🔴 P0 — 功能崩溃

#### 2.1 addVectorShape 变量未定义（向量形状绘制崩溃）

**文件**: `web01/js/cmd.js` addVectorShape 函数

**现象**: 调用 `add_vector_shape` 工具时 JavaScript 报错 ReferenceError

**原因**: 函数末尾引用了未定义的 `objects` 和 `obj` 变量：
```javascript
VC.State.objects = objects;   // objects 未定义
VC.State.selectedObjectId = obj.id;  // obj 未定义，应为 fabricPath
```

**影响**: 所有矢量形状（heart/spiral/wave/gear/tree/cloud/lightning/flower/arrow_curve）均无法通过 LLM 工具调用添加

**修复方案**: 改为 `fabricPath` 变量引用，同步到正确的 State 对象

#### 2.2 部分编辑操作不更新画布视觉

**文件**: `web01/js/cmd.js` resizeShape/setOpacity/setStroke/rotateShape

**现象**: LLM 调用工具成功，但画布上图形无变化

**原因**: 这些函数调用 `VC.State.updateObject()` 更新状态模型，但没有调用 `VCTools.updateObject()` 更新 Fabric.js 画布

**影响**: resize、透明度、描边、旋转操作视觉上无效

**修复方案**: 改为调用 `VCTools.updateObject(obj, updates)` 直接操作 Fabric.js 对象

#### 2.3 duplicateShape 创建不可见对象

**文件**: `web01/js/cmd.js` duplicateShape 函数

**现象**: 复制命令返回成功，但画布上看不到新图形

**原因**: 调用 `VC.State.addObject()` 只创建了状态对象，没有在 Fabric.js 画布上创建对应的可视对象

**修复方案**: 使用 `fabric.util.object.clone()` 克隆 Fabric 对象并添加到画布

### 🟡 P1 — 体验降级

#### 2.4 路由误拦截：常见词汇触发图片生成

**文件**: `ai-service01/app/agent/planner.py` FORCE_IMAGE_GEN_KEYWORDS

**现象**: "画一朵花" 被路由到 `ai_generate_image`（AI 生图），而不是 `add_vector_shape`（矢量花模板）

**原因**: `FORCE_IMAGE_GEN_KEYWORDS` 包含 "花"、"树"、"山"、"海" 等词，这些同时也是矢量形状类型

**影响**: 用户想画矢量花时生成了位图，且位图不可编辑

**修复方案**: 
1. 将 "花/树" 从图片拦截词中移除
2. 或增加矢量意图检测优先级

#### 2.5 陪伴模式语音输入时画布上下文过期

**文件**: `web01/js/companion.js` voice flow vs sendText

**现象**: LLM 基于过期的画布状态做决策（如删除已不存在的对象）

**原因**: 
- `sendText()` 方法会构建最新画布上下文并发送
- 但语音输入走 WebSocket → gateway → ASR → LLM，画布上下文是 gateway 缓存的 `last_canvas_context`
- 语音流没有机制在 ASR 出结果时附带最新画布状态

**修复方案**: gateway 在 `_on_final` 时请求前端获取最新画布上下文，或前端在 ASR final 时主动推送

#### 2.6 PROCESSING 状态时语音输入被丢弃

**文件**: `web01/js/companion.js` handleAudio 函数

**现象**: 用户在 AI 处理期间说的话完全丢失

**原因**: `if (state === STATE.PROCESSING) return` 直接丢弃音频

**修复方案**: 增加命令队列，PROCESSING 完成后自动执行队列中的下一条命令

#### 2.7 System Prompt 过长（~290 行）

**文件**: `ai-service01/app/agent/planner.py` SYSTEM_PROMPT

**现象**: 每次 LLM 调用消耗大量 token，增加延迟和成本

**原因**: prompt 包含详细的绘图示例、颜色理论、设计原则等

**修复方案**: 精简到核心指令（~100 行），示例移入 few-shot 或按需注入

#### 2.8 redo() 未实现

**文件**: `web01/js/cmd.js` redo 函数

**现象**: 用户撤销后无法重做

**原因**: redo() 是 stub，fabric-engine.js 中有实现但未被调用

**修复方案**: 从 fabric-engine.js 移植 redo 逻辑到 figma-tools.js 的 State.undoHistory

### 🟢 P2 — 技术债务

#### 2.9 两套 Fabric.js 实现共存

**文件**: `web01/js/figma-tools.js`（VCTools，在用）vs `web01/js/fabric-engine.js`（VC.Fabric，未用）

**影响**: 819 行死代码，增加维护成本和混淆风险

**修复方案**: 确认 fabric-engine.js 中无有用逻辑后删除

#### 2.10 reorderShape 重复定义

**文件**: `web01/js/cmd.js`

**现象**: reorderShape 定义了两次（line 387 和 line 563），第二个覆盖第一个

**修复方案**: 删除 line 563 的重复定义

#### 2.11 _resolveTarget 兜底过于激进

**文件**: `web01/js/cmd.js` _resolveTarget 函数

**现象**: 当 tag/id/color/shape 都匹配不到时，返回最后创建的对象

**影响**: "删除大象"（不存在）会静默删除最后创建的对象

**修复方案**: 匹配失败时返回 null 并提示"未找到目标"

#### 2.12 矢量图生成不可交互

**文件**: `web01/js/cmd.js` generateVectorArt 函数

**现象**: AI 生成的矢量图用 Canvas2D Path2D 渲染，无法选中/移动/编辑

**原因**: 绕过了 Fabric.js，直接在原生 canvas 上绘制

**修复方案**: 将 SVG path 转为 `fabric.Path` 对象添加到画布

---

## 三、技术决策记录

### 3.1 为什么后端工具是 stub？

后端工具（edit_shape/move_shape 等）只返回确认字符串，前端 cmd.js 执行实际操作。

**原因**: Fabric.js 画布在浏览器端，后端无法直接操作。LLM 在后端理解自然语言并决定调用哪个工具、传什么参数，前端根据工具名和参数执行画布操作。

**权衡**: LLM 无法验证操作是否成功（只能看到"已执行"字符串），但这是前后端分离架构下的最优解。

### 3.2 为什么放弃 0-1 归一化坐标？

**尝试**: 将坐标系从像素改为 0-1 归一化（0,0=左上角，1,1=右下角）

**失败原因**: LLM（DeepSeek）始终输出像素坐标，无论 prompt 如何强调。甚至在 prompt 示例中使用 0-1 坐标，LLM 仍输出像素值。

**结论**: 像素坐标是 LLM 的"自然语言"，强行归一化增加转换错误风险。

### 3.3 为什么 originX 统一为 left/top？

**尝试**: 圆形使用 originX:center/originY:center（圆心定位），矩形用 left/top

**失败原因**: LLM 经常忘记为不同形状设置不同的 originX，导致：
- 矩形带 center origin → 位置偏移到画布左上角
- 圆形不带 center origin → 位置偏移一个半径的距离

**结论**: 统一 left/top origin，圆形坐标通过 `left = 圆心X - radius` 转换。虽然 LLM 计算有误差，但比混合 origin 更可靠。

### 3.4 为什么需要三层路由拦截？

**问题**: LLM 路由不稳定，常见问题：
- "画一个太阳" 被理解为编辑（画布上已有太阳）
- "把海洋的颜色变为红色" 被图片生成关键词"海"拦截
- "删除星星" 被理解为创建操作

**方案**: 三层关键词强制拦截 + LLM 兜底
- Layer 0: 知名图标 → search_icon_svg
- Layer 1: 图片生成关键词 → ai_generate_image（但先检查编辑意图）
- Layer 2: 编辑/删除关键词 → edit 工具组
- Layer 3: LLM 自主决策

**权衡**: 关键词匹配可能误判，但比纯 LLM 路由更稳定。编辑意图逃逸机制（检查编辑/删除关键词）缓解了误拦截问题。

### 3.5 为什么 VAD hangover 设为 1.5 秒？

**问题**: 中文说话有较长停顿（思考、换气），默认 0.6 秒 hangover 导致句子被截断。

**尝试**: 0.6s → 1.0s → 1.5s

**结论**: 1.5 秒在中文语速下平衡了响应速度和完整性。更长（如 2 秒）会导致说完后等待太久才触发识别。

---

## 四、未实现功能及原因

| PRD 需求 | 状态 | 原因 |
|----------|------|------|
| 唤醒词（"小画小画"） | ❌ | 需要本地关键词检测模型（Porcupine），增加前端依赖和复杂度 |
| 网格定位（"第3排第5列"） | ❌ | LLM 直接输出像素坐标更灵活，网格系统增加 prompt 复杂度 |
| 相对位移（"向右移动50px"） | ❌ | move_shape 只支持绝对坐标；LLM 可通过画布上下文间接计算 |
| 海龟绘图（落笔/抬笔/转向） | ❌ | 用户未提出此需求；需要维护光标状态机，实现复杂度高 |
| 距离感知（"离边界多远"） | ❌ | 用户未提出此需求；list_shapes 已能提供位置信息 |
| 预览高亮确认 | ❌ | 增加交互复杂度；撤销功能已能弥补误操作 |
| 麦克风模式 DashScope ASR | ❌ | 用户要求暂不修改，保持 Web Speech API |

---

## 五、后续优化方向

### 短期（可立即修复）
1. 修复 addVectorShape 变量引用错误
2. 修复 resizeShape/setOpacity/setStroke/rotateShape 不更新画布
3. 修复 duplicateShape 创建不可见对象
4. 删除 reorderShape 重复定义
5. _resolveTarget 匹配失败返回 null

### 中期（需要设计）
1. 陪伴模式画布上下文实时同步
2. PROCESSING 状态命令队列
3. System Prompt 精简（~100 行）
4. redo() 实现
5. 路由优化：矢量意图优先于图片生成

### 长期（架构改进）
1. 删除 fabric-engine.js 死代码
2. 矢量图生成转为 fabric.Path 可交互对象
3. 后端维护画布对象列表（减少前端→后端上下文传输）
4. 麦克风模式也使用 DashScope ASR（用户确认后）
5. 离线模式：本地 LLM + 本地 ASR
