# Phase 2B 网页验证记录

## Todo 极简重构（2026-10-16）

- 基线：`main`，`49968a744bd0031eed705bf29d6d1b7886891e30`；该提交是 PR #3 的合并提交。PR #3 已于 2026-10-14 合并，Phase 2B 完整代码已进入 `main`。
- 当前功能分支：`refactor/todo-minimal`。
- `npm run typecheck`、`npm run lint`、`npm test -- --run`（7 个测试文件、45 项）、`npm run build`、`node --check scripts/verify-browser.mjs`、`git diff --check`：均通过。
- `npm run verify:browser`：本地 Chromium 生产预览验证通过。桌面与手机覆盖快速新增、重复新增、按日期浏览与触控滑动、完成/撤销、已完成记录折叠/恢复、编辑标题和日期、刷新后 IndexedDB 持久化，以及情侣待办、Period、Anniversary、设置和 PWA scope。
- 手机视口覆盖 320、360、390、430px，均无横向溢出；检查了触控日期手势和纵向滚动。
- 浏览器截图位于忽略目录 `.artifacts/browser-preview`，不纳入提交。
- 已启动本地手机预览：`http://192.168.0.30:4173/`（需与开发电脑连接同一 Wi-Fi；尚未在真实 Android 设备上验证）。

这轮保留原有任务对象和 IndexedDB 记录，不做数据迁移或删除；重复系列列表只投影出当前下一次实例，不写入额外实例记录。情侣待办仍使用其现有独立演示路径。

## 基线与本地检查

- 基线：`main`，`67b2f0e9c63686fce709d89b2385606ac78234be`。
- 功能分支：`feat/todo-phase-2b`。
- `npm run typecheck`：通过。
- `npm run lint`：通过，无警告。
- `npm test -- --run`：通过，6 个测试文件、41 项。
- `npm run build`：通过，生成静态资源、manifest 与 Service Worker。
- `node --check scripts/verify-browser.mjs`：通过。
- `git diff --check`：通过。

历史记录（Phase 2B 开发期间）：本机当时没有安装 Chromium。`npm run verify:browser` 首次启动时报告缺少 Playwright 浏览器；随后 `npx playwright install chromium` 从 Playwright CDN 得到 0 字节损坏下载包，因此当时没有把本机浏览器脚本结果记为通过。随后在本地安装 Chromium，并于上方 Todo 极简重构记录中完成浏览器验证。

## Playwright 生产浏览器覆盖

`npm run verify:browser` 在 `/life-space/` 子路径的生产预览中运行。脚本检查桌面 1440×900，以及手机触控上下文 390×844 和月历聚焦态的 320、360、390、430px 宽度；生成的截图作为 PR 工作流 artifact 保存。

检查路径包括：默认本周与真实任务创建/刷新、个人标签和提醒设置保存、日期视图周期左右滑动与重选当前周期、纵向手势不误切周期、月历日期原位聚焦与聚焦内滑动保护、焦点内新增任务、太阳/爱心涟漪往返、快速切换不增加历史、收集箱和表单返回、情侣卡片触控侧移、历史/筛选逐层返回、全局模块 Tab 不积累返回链、设置/Period/Anniversary、滚动位置、嵌套状态刷新恢复、manifest/静态资源/Service Worker scope 和离线刷新。

## 线上预览与 CI

PR：[Life Space Phase 2B：个人待办与周期任务 #3](https://github.com/yez780055-cell/life-space/pull/3)，目标为 `main`，已于 2026-10-14 合并；合并提交为 `49968a744bd0031eed705bf29d6d1b7886891e30`。

- `Foundation Web checks` [运行 #19](https://github.com/yez780055-cell/life-space/actions/runs/38516793245)：对提交 `126d0a4e944ad02e837ab940352e27be74533111` 全部通过，包含 TypeScript、ESLint、Vitest（6 个文件、41 项）、production build，以及安装 Chromium 后的生产浏览器验证。截图 artifact 名为 `todo-phase-2b-browser-screenshots`。
- `Todo Phase 2A Web preview` [运行 #16](https://github.com/yez780055-cell/life-space/actions/runs/38516788320)：对同一提交成功部署；工作流名称沿用 Phase 2A，但当前触发分支是 `feat/todo-phase-2b`，日志打印部署分支与 `$GITHUB_SHA`。
- 浏览器验证覆盖 GitHub Pages 子路径 `/life-space/`、桌面 1440×900、触控手机 390×844，以及日期聚焦月历 320、360、390、430px 宽度。通过的路径包括任务新增与编辑、周期切换与重置、收集箱展开收起、空间涟漪往返、页面层级返回、情侣历史筛选、全局 Tab、滚动恢复、刷新与 PWA scope/离线刷新。

Pages 只有一个站点：推送 `feat/todo-phase-2b` 会替换此开发预览；旧 `feat/todo-phase-2a` 分支推送不再触发部署。预览地址：<https://yez780055-cell.github.io/life-space/>。

该预览用于网页开发验收，不代表合并或正式发布。没有进行 Android APK 构建或真机测试。
