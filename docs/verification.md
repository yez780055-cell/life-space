# Life Space 网页验证记录

## Phase 3B 纪念日模块 V1（2026-10-17）

- 基线：`main` / Phase 3A merge commit `34da1b01be95bf53fea330a1120c724e7d9894ee`；功能分支：`feat/anniversary-v1`。
- 本地检查：`npm run typecheck`、`npm run lint`、`npm test -- --run`（19 个文件、117 项）、`npm run build`、`node --check scripts/verify-browser.mjs`、`git diff --check`：通过。
- `npm run verify:browser`：本机 Chromium 生产预览通过。桌面覆盖周年/一次性记录、创建与编辑、ID 稳定、删除取消和确认、Tab 切换时删除确认收起，以及 Anniversary CRUD 前后 Todo、Couple、Period、设置和模块 stores 保持一致。
- 移动覆盖 320、360、390、430px，放大文字、长标题/备注、短视口编辑表单滚动和保存按钮可达；无横向溢出。PWA manifest、Service Worker、scope 和 start URL 均与本机预览一致。
- 浏览器验证仅使用合成记录，截图写入忽略目录 `.artifacts/browser-preview`。自动化没有访问真人数据。Android 实体设备的系统返回、软键盘遮挡、安全区 inset 和屏幕阅读器仍待人工验收。
- GitHub Actions：待推送提交触发后补记运行链接与状态。

## Phase 3A 小月历整合（2026-10-16）

- 基线：`main` / Phase 2C merge commit `6560dd2bb033a63e580d6ee313b9ed425aaf383f`。开发分支：`feat/period-integration`。独立只读源仓库 `xiaoyueli/main` HEAD：`ff72014e9c691d2bbd18a57d8e2966405f507386`。
- 本地检查：`npm run typecheck`、`npm run lint`、`npm test -- --run`（15 个文件、98 项）、`npm run build`、`node --check scripts/verify-browser.mjs`、`git diff --check`：通过。
- `npm run verify:browser`：Windows Chromium 生产预览桌面和触控流程通过。Period 覆盖今日开始/撤销/开始日取消及撤销、历史补录、统计和记录编辑、跳转到 1900 年后仍能选择当前年份、Period PIN 在切换模块和页面进入后台时重新遮挡、忘记 PIN 后仅清除 Period、加密导出、错误密码不写入、预览后确认替换、恢复后刷新持久化，以及导入/清除前后设置、Todo、Couple stores 完全一致。
- 移动端覆盖 320、360、390、430px，320px 增大文字，日期选择、月历横向切换、纵向手势不切月/不改日期详情，以及 320px 短视口的 Period 导入弹层滚动和底部留白。PWA manifest、Service Worker 控制状态、scope 和 start URL 与预览路径一致；离线刷新后 Todo 可打开，Period 锁屏也可访问。
- 浏览器流程仅使用隔离 Chromium profile、合成记录和合成 `.xyl`；截图写入忽略目录 `.artifacts/browser-preview`。未读取真人 Period 数据。
- Android 真机返回键、系统软键盘、安全区实际 inset 与通知触发时机未在实体设备验收；见 [Phase 3A 验收清单](period-integration.md)。首次 PR CI run `38881361424` 因 Todo 快速添加测试未等待 IndexedDB 写入后的 React 输入框清空而失败；测试现等待 UI 完成。修正后 run `38889098767` 全部通过。随后 run `38889356537` 发现 Couple 长按测试依赖 `setTimeout` spy、偶发未捕获 300ms 回调；测试改用假时钟验证 299ms/300ms 边界，业务实现未改。修正提交的 run `38986204884` 中 typecheck、lint、98 项测试、构建及桌面/手机浏览器流程全部通过。

## Phase 2C 手机交互与视觉验收修复（2026-10-16）

- 分支：`feat/todo-phase-2c`。实现提交：`d3bdf864efa8f8198c53cc02f4d255d09b620177`，推送到现有 Draft PR #5。
- `npm run typecheck`、`npm run lint`、`npm test -- --run`（9 个测试文件、58 项）、`npm run build`、`node --check scripts/verify-browser.mjs`、`git diff --check`：通过。
- `npm run verify:browser`：本机 Edge/Chromium 桌面及触控浏览器检查通过。覆盖快速连续新增、详细新增字段与新标签保存、模式切换保留标题、标签 OR 筛选和计数、卡片点击/键盘、鼠标拖动阈值、有效/无效拖放、安排时间清空与刷新持久化。
- 移动浏览器验证覆盖轻点展开、短距离上下滑动、长按拖动、个人与情侣数据/状态保留，以及 320、360、390、430px 视口的横向溢出、卡片和标签可读性；320px 系统文字放大场景通过。缩短视口验证详细表单可滚动且安全区底部留白有效。减少动态效果模式和连续切换、两种空间切换按钮位置/尺寸也通过。
- 浏览器截图保存在忽略目录 `.artifacts/browser-preview`，不纳入提交。未在真实 Android 设备上验证系统键盘弹出后的可视区域、硬件/系统返回键以及真机触摸手感；需在手机上做最终人工验收。
- 沿用 IndexedDB v4，未清空或迁移个人/情侣数据；未改 Period、Anniversary、设置或 Supabase schema。情侣数据仍仅在本机保存。

## Phase 2C 情侣待办验证（2026-10-16）

- 基线核验：当前分支 `feat/todo-phase-2c` 的 HEAD 为 `e5f011a35bcfcccf2e7dd9ec5a78fb4b9fa91c40`；`git merge-base --is-ancestor` 确认该 Phase 2B 基线已包含在当前分支。
- `npm test -- --run`：通过，9 个测试文件、58 项。
- `npm run typecheck`、`npm run lint`、`npm test -- --run`、`npm run build`、`node --check scripts/verify-browser.mjs`、`git diff --check`：通过。
- `npm run verify:browser`：本机生产预览验证通过，使用 Microsoft Edge（Chromium）。桌面检查覆盖情侣事项新增/编辑/删除、安排与未安排拖动、日期时间保存、多标签 OR、完成/撤销、历史范围筛选/恢复，以及个人待办数据和 Period、Anniversary、设置导航保留。
- 移动触控上下文覆盖 390×844，以及 320、360、390、430px 宽度；情侣和个人待办均无横向溢出，并检查情侣快速新增、完成与撤销。PWA scope、manifest 和 Service Worker 控制状态均与本机预览 URL 匹配。
- 浏览器截图保存在忽略目录 `.artifacts/browser-preview`，不纳入提交。
- Supabase 迁移只完成源码审阅；当前环境没有 PostgreSQL、Docker 或 Supabase CLI，因此没有在数据库实例中解析或执行。该迁移尚未应用，应用也没有账号、配对或远程 repository；跨设备同步未启用。

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

## Phase 3B：纪念日 V1

- 基线：`main` / `origin/main`，`34da1b01be95bf53fea330a1120c724e7d9894ee`（Phase 3A 合并）。
- 功能分支：`feat/anniversary-v1`。
- `npm run typecheck`、`npm run lint`、`npm test -- --run`（19 个测试文件、117 项）、`npm run build`、`node --check scripts/verify-browser.mjs`、`git diff --check`：通过。
- `npm run verify:browser`：本机生产预览通过；覆盖现有 Todo、Couple、Period 回归，纪念日创建/编辑/删除/导航/数据隔离，手机 320、360、390、430px，文字放大、短视口编辑器及 PWA manifest/Service Worker 控制状态。截图保存在忽略目录 `.artifacts/browser-preview`。
- 浏览器验证使用本机 `http://127.0.0.1:4189/` 预览。此次预览 scope 与 manifest 一致；GitHub Pages `/life-space/` 子路径仍需由 PR CI 验证。
- GitHub Actions：[Foundation Web checks 运行 #37](https://github.com/yez780055-cell/life-space/actions/runs/38993907073)：对 Anniversary 功能提交 `33a5e51bc26327168af9a2df6df37c1ee84cc65c` 全部通过；TypeScript、ESLint、Vitest、production build、Chromium 安装、桌面/手机浏览器验证和截图步骤均成功。
- Android 真机系统返回、软键盘遮挡与安全区 inset 尚待人工验收；本阶段不构建 APK。
