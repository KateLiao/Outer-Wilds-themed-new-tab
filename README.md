# 星火篝火番茄钟

Outer Wilds 风格 3D 篝火新标签页，内置经典番茄钟（专注 → 烤棉花糖仪式 → 休息）。

## 本地预览

```bash
npm install
npx serve . -p 3000
```

浏览器打开 `http://localhost:3000/index.html`（本地开发无扩展 API，storage 降级为 localStorage）。

## 安装为 Chrome 扩展

1. 确保已执行 `npm install`（Three.js 位于 `node_modules/`）
2. 打开 Chrome → `chrome://extensions`
3. 开启「开发者模式」
4. 点击「加载已解压的扩展程序」，选择本项目根目录
5. 打开新标签页即可使用

## 项目结构

| 文件 | 说明 |
|------|------|
| `manifest.json` | MV3 扩展配置 |
| `newtab.html` | 新标签页入口 |
| `newtab-main.js` | 应用入口 |
| `pomodoro.js` | 番茄钟状态机 |
| `pomodoro-ui.js` | HUD 与设置 UI |
| `background.js` | 后台计时与通知 |
| `app.js` | Three.js 篝火场景 |
| `docs/PRD.md` | 产品需求文档 |

## 功能摘要

- 经典番茄钟：25/5/15 分钟，4 轮一长休息（均可设置）
- 专注完成自动烤棉花糖动画，8 秒仪式后开始休息
- 标签在后台时浏览器通知 + 可选提示音
- 关闭标签后计时通过 Service Worker 继续
