# Phase 2B 网页验证记录

## 基线与本地检查

- 基线：`main`，`67b2f0e9c63686fce709d89b2385606ac78234be`。
- 功能分支：`feat/todo-phase-2b`。
- `npm run typecheck`：通过。
- `npm run lint`：通过，无警告。
- `npm test -- --run`：通过，6 个测试文件、41 项。
- `npm run build`：通过，生成静态资源、manifest 与 Service Worker。
- `node --check scripts/verify-browser.mjs`：通过。
- `git diff --check`：通过。

本机没有安装 Chromium。`npm run verify:browser` 首次启动时报告缺少 Playwright 浏览器；随后 `npx playwright install chromium` 从 Playwright CDN 得到 0 字节损坏下载包，因此没有把本机浏览器脚本结果记为通过。PR 的 GitHub Actions 会安装 Chromium 并执行相同生产预览脚本；该结果和本机单元测试分开记录。

## Playwright 生产浏览器覆盖

`npm run verify:browser` 在 `/life-space/` 子路径的生产预览中运行。脚本检查桌面 1440×900，以及手机触控上下文 390×844 和月历聚焦态的 320、360、390、430px 宽度；生成的截图作为 PR 工作流 artifact 保存。

检查路径包括：默认本周与真实任务创建/刷新、个人标签和提醒设置保存、日期视图周期左右滑动与重选当前周期、纵向手势不误切周期、月历日期原位聚焦与聚焦内滑动保护、焦点内新增任务、太阳/爱心涟漪往返、快速切换不增加历史、收集箱和表单返回、情侣卡片触控侧移、历史/筛选逐层返回、全局模块 Tab 不积累返回链、设置/Period/Anniversary、滚动位置、嵌套状态刷新恢复、manifest/静态资源/Service Worker scope 和离线刷新。

## 线上预览与 CI

PR/CI 与 GitHub Pages 工作流链接、提交 SHA、浏览器覆盖结果和截图 artifact 将在分支推送后补录。Pages 只有一个站点：Phase 2B 工作流只由 `feat/todo-phase-2b` 推送触发；旧 `feat/todo-phase-2a` 分支的工作流已改为监听 Phase 2B 分支，旧分支推送不会重新部署。部署日志会打印部署分支和 `$GITHUB_SHA`。预览地址：<https://yez780055-cell.github.io/life-space/>。

该预览用于网页开发验收，不代表合并或正式发布。没有进行 Android APK 构建或真机测试。
