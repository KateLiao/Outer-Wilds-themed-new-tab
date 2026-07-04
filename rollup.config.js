/**
 * Rollup 打包配置：将 app.js（Three.js 场景入口）及其所有依赖（含 Three.js JSM 插件）
 * 打包成单一 ES 模块 dist/app.bundle.js，消除裸模块名，使扩展页面 CSP 可正常加载。
 *
 * 输入：app.js（依赖 Three.js、outer-wilds-vfx.js、vfx-shaders.js）
 * 输出：dist/app.bundle.js（格式 ES，可被 newtab-main.js 动态 import）
 */
import { nodeResolve } from "@rollup/plugin-node-resolve";

export default {
  input: "app.js",
  output: {
    file: "dist/app.bundle.js",
    format: "es",
    sourcemap: false,
  },
  plugins: [
    nodeResolve({
      browser: true,
      preferBuiltins: false,
    }),
  ],
};
