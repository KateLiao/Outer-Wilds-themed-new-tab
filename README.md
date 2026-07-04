# 星火篝火番茄钟

Outer Wilds 风格 3D 篝火新标签页 Chrome 扩展，内置经典番茄钟（专注 → 烤棉花糖 → 休息），并配有提示音与休息背景音乐。

## 快速开始

```bash
npm install
npm run build
```

| 命令 | 说明 |
|------|------|
| `npm run build` | 将 `app.js` 及 Three.js 依赖打包为 `dist/app.bundle.js`（扩展加载 3D 场景必需） |
| `npm start` | 本地静态预览（`http://localhost:3000`） |

> 修改 `app.js`、`outer-wilds-vfx.js` 或 `vfx-shaders.js` 后，请重新执行 `npm run build`，再在 Chrome 扩展页点击「重新加载」。

## 安装为 Chrome 扩展

1. 执行 `npm install` 与 `npm run build`
2. 打开 Chrome → `chrome://extensions`
3. 开启「开发者模式」
4. 点击「加载已解压的扩展程序」，选择本项目根目录
5. 打开新标签页即可使用

## 本地预览（无扩展 API）

```bash
npm install
npm run build
npm start
```

| 页面 | 用途 |
|------|------|
| `http://localhost:3000/newtab.html` | 与扩展新标签页一致的完整体验（推荐） |
| `http://localhost:3000/index.html` | 同 UI 的备用入口 |

本地开发时 `chrome.storage` 会降级为 `localStorage`，后台计时与浏览器通知不可用，番茄钟核心流程仍可测试。

## 项目结构

| 文件 / 目录 | 说明 |
|-------------|------|
| `manifest.json` | Chrome MV3 扩展配置 |
| `newtab.html` | 新标签页入口 |
| `newtab-main.js` | 应用入口，串联番茄钟与 3D 场景 |
| `pomodoro.js` | 番茄钟状态机与轮次规则 |
| `pomodoro-ui.js` | HUD、设置面板与操作按钮 |
| `confirm-dialog.js` | 统一风格确认弹窗（放弃专注、跳过休息） |
| `audio.js` | 提示音与休息背景音乐 |
| `storage-adapter.js` | `chrome.storage` / `localStorage` 适配 |
| `background.js` | Service Worker：后台计时与通知 |
| `app.js` | Three.js 篝火场景（Rollup 打包入口） |
| `outer-wilds-vfx.js` / `vfx-shaders.js` | Outer Wilds 风格粒子与着色器 |
| `rollup.config.js` | Rollup 打包配置 |
| `dist/app.bundle.js` | 构建产物，由 `newtab-main.js` 动态加载 |
| `assets/` | GLB 模型、参考图与音频资源 |
| `icons/` | 扩展图标 |
| `docs/PRD.md` | 产品需求文档 |

## 功能摘要

- **经典番茄钟**：默认 25 / 5 / 15 分钟，4 轮一长休息，参数可在设置中调整
- **场景联动**：专注时弱化时钟、增强篝火动效；专注完成立即进入烤棉花糖近景并同时开始休息
- **音频**：专注开始 ding、休息开始 pop；短/长休息循环播放 Timber Hearth 背景音乐（可在设置中关闭）
- **后台可靠**：关闭标签后由 Service Worker 继续计时；标签在后台时推送浏览器通知
- **确认交互**：放弃专注、跳过休息使用统一弹窗，替代浏览器原生 `confirm`
- **可选手动烤火**：Idle 状态下双击场景可进入烤棉花糖视角（设置中可关闭）
- **调试**：左上角按钮可快速切换「专注中 ⇄ 短休息」（开发调试用）

## 音频资源

| 场景 | 文件 |
|------|------|
| 专注开始 | `assets/floraphonic-short-punchy-sine-wave-ding-10-a-211748.mp3` |
| 休息开始 | `assets/floraphonic-minimal-pop-click-ui-1-198301.mp3` |
| 休息背景 | `assets/Timber Hearth - Andrew Prahlow - SoundLoadMate.com.mp3` |

受设置项「专注/休息开始提示音」控制；用户开启「减少动态效果」时也会静音。

## 技术说明

- **Three.js 加载**：扩展 CSP 不允许裸模块名，因此通过 Rollup 将 Three.js 与场景代码打包为单一 ES 模块
- **容错**：3D 场景通过动态 `import("./dist/app.bundle.js")` 加载，WebGL 失败时不影响番茄钟
- **持久化**：设置存 `chrome.storage.sync`，会话存 `chrome.storage.local`

## 文档

详细需求、状态机与变更记录见 [`docs/PRD.md`](./docs/PRD.md)。
