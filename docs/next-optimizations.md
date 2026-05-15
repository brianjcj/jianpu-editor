# 简谱编辑器 — 下一步优化方向

> 本文档基于 2026-05-15 的代码审查，按优先级从高到低排序。

---

## 🔴 P0 — 性能优化（立竿见影）

### 1. 编辑器输入防抖

**现状问题**
- 每次键盘输入立刻触发完整链路：`parse → layout → render(canvas) → collectPlaybackNotes`
- 快速输入时连续重绘，CPU 浪费严重

**优化方向**
```ts
let debounceTimer: ReturnType<typeof setTimeout>;
editor.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    render();
    localStorage.setItem('jianpu_editor_content', editor.value);
  }, 150);
});
```

### 2. 播放高亮改为「脏标记」机制

**现状问题**
- `requestAnimationFrame` 每秒 60 次调用 `render()`，每次重置 canvas 宽高（触发 GPU 纹理重建）
- 实际上只有当前高亮音符需要从红色变回黑色，其余 99% 像素不变

**优化方向**
- 记录上一帧高亮音符的位置，仅重绘变化区域
- 或维护一个「高亮状态脏标记」，非播放期间跳过整页重绘

---

## 🔴 P0 — 架构重构（技术债清理）

### 3. 拆分 `main.ts`（当前近千行的"大泥球"）

**现状混合的职责**
- DOM 事件绑定
- 导出逻辑（PNG/SVG/ZIP 分页、iOS canvas 尺寸降级）
- 虚拟键盘交互
- 面板显隐控制
- Modal 初始化
- Canvas 点击 ↔ 源码跳转

**建议目录结构**
```
src/
  main.ts              ← 只做入口组装
  ui/
    panels.ts          ← 面板显隐、toggle 按钮
    modals.ts          ← 导出/设置对话框初始化
    keyboard.ts        ← FAB 虚拟键盘
    toolbar.ts         ← 播放/停止/打印/示例按钮
  export/
    exporter.ts        ← doExport 全部逻辑
  editor/
    sync.ts            ← canvas 点击跳转源码位置
```

### 4. 移除 `// @ts-nocheck`，收紧类型

`main.ts` 顶部的 `@ts-nocheck` 是当前最大的类型安全漏洞。具体问题：

| 问题 | 位置 | 建议 |
|------|------|------|
| `renderer.config` 是 `Record<string, unknown>` | `renderer.ts` | 改为 `RendererConfig` 类型 |
| `renderLine(ctx, ...)` 的 `ctx` 声明为 `any` | `renderer.ts` | 提取 `RenderContext` 接口统一 `CanvasRenderingContext2D \| SVGContext` |
| `ctx.save` 运行时判断 `if (ctx.save)` | `renderer.ts` | 接口化后移除运行时判断 |
| `player.ts` 调全局 `render()` | `player.ts` | 改为回调注入或事件订阅 |

---

## 🟡 P1 — 用户体验提升

### 5. 编辑器语法高亮

**现状：** 纯 `textarea`，用户看不到语法是否正确。

**低成本方案：** overlay 层方案 —— textarea 上方覆盖一个同步滚动的 `div`，用 CSS 做彩色渲染：
- `1^(高音)` → 数字白色，`^` 蓝色
- `\| \|:` → 反复记号橙红色
- `% @ ! $` → 指令紫色
- `# 注释` → 灰色

这比实时预览更直接，能让用户第一时间发现语法错误。

### 6. 解析错误提示 + 行号

**现状：** parser 遇到不认识字符直接 `i++` 跳过，用户完全不知道哪里写错了。

**建议：**
- `parser.ts` 增加 `errors: ParseError[]` 数组，记录「第 N 行第 M 列不识别的字符」
- 编辑器左侧加行号
- 底部状态栏显示当前行解析状态
- 有错误时不留空白 canvas，而是画出已解析部分 + 叠加红色错误提示

---

## 🟢 P2 — 代码质量与可维护性

### 7. 播放与渲染解耦

**现状：** `renderer.collectPlaybackNotes()` 既做渲染前置，又往全局 `state` 写数据，还往 token 上挂 `_playbackTimes` 私有字段。

**建议链路分离：**
```
文本 → Parser → ParseResult → PlaybackBuilder → PlaybackNote[]
                          ↓
                     Renderer → Canvas/SVG
```
Renderer 只接收「当前高亮索引/时间」，不背播放逻辑的锅。

### 8. 消除 HTML 中重复的语法速查表

`index.html` 里同样的 `<table>` 语法速查出现了 **两次**：
- `.syntax-help`（已隐藏的旧版）
- `.syntax-modal-content`（弹窗新版）

建议只保留弹窗版，或用 JS 从同一份数据动态渲染。

---

## 推荐执行顺序

| 阶段 | 事项 | 预估投入 | 产出 |
|------|------|---------|------|
| **W1** | 输入防抖 + 渲染脏标记 | 2h | 性能提升，输入更流畅 |
| **W1** | `main.ts` 模块拆分 | 4h | 代码可维护性质变 |
| **W2** | 移除 `@ts-nocheck`，收紧类型 | 3h | 减少运行时错误 |
| **W2** | 编辑器语法高亮（overlay） | 4h | 产品体验质变 |
| **W3** | 解析错误提示 + 行号 | 3h | 降低用户学习成本 |
| **W3** | 播放与渲染解耦 | 2h | 架构更清晰 |
| **W4** | 消除重复 HTML | 0.5h | 减少维护负担 |

---

## 附录：重构后完整目录结构愿景

```
src/
  main.ts                    ← 入口，只做组装
  types.ts                   ← 类型定义（已有）
  constants.ts               ← 频率表、技法常量（已有）
  state.ts                   ← 全局状态（已有）
  parser.ts                  ← 简谱语法解析器（已有）
  renderer.ts                ← Canvas/SVG 渲染器（已有）
  svg-context.ts             ← SVG 渲染上下文（已有）
  player.ts                  ← Web Audio 播放器（已有）
  playback/
    builder.ts               ← 从 ParseResult 生成 PlaybackNote[]
  ui/
    panels.ts
    modals.ts
    keyboard.ts
    toolbar.ts
  export/
    exporter.ts
  editor/
    sync.ts                  ← canvas 点击 ↔ 源码跳转
    highlighter.ts           ← 语法高亮 overlay
    errors.ts                ← 解析错误展示
```
