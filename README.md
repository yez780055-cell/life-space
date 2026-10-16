# Life Space

Life Space 是 React 19、TypeScript、Vite 和 Capacitor 7 构建的个人生活 App。个人待办目前采用极简流程；本阶段只交付网页，不构建 APK。

## 本地运行与检查

需要 Node.js 20.19+ 和 npm。运行 `npm ci`、`npm run dev`。代码检查为 `npm run typecheck`、`npm run lint`、`npm test` 和 `npm run build`。完整桌面、移动、子路径与 PWA 浏览器检查为 `npm run verify:browser`；首次运行可执行 `npx playwright install chromium`。可用 `LIFE_SPACE_PREVIEW_URL` 指定待检查的生产预览地址，网址须以 `/` 结尾。

## Phase 2B：个人待办

个人任务、标签与周期实例保存在设备 IndexedDB 的 `todoTasks`、`todoTags`、`todoOccurrences` stores 中。个人待办只提供按日期浏览、全部待办、快速添加、完成与撤销，以及折叠的已完成记录。日期可用前后按钮或触屏滑动切换；快速添加沿用当前日期，全部视图则默认今天。首次打开没有内置示例任务。

更新任务时只改标题和日期，已有备注、标签、子任务、提醒、重复规则、完成状态和周期记录会继续保留。没有日期的旧任务仍可在全部视图找到。

重复任务使用一条系列规则按本地日期计算实例，不复制未来任务行。全部视图保留已有周期记录，并为每条仍有效的重复系列显示从今天开始的下一个未记录周期，以保持列表有限。提醒设置会持久化；只有用户主动授权后，网页打开时才会尝试通过浏览器通知提醒。浏览器关闭后的可靠投递、原生通知和跨设备同步尚未实现。

情侣看板仍是 Phase 2A 的交互演示数据；情侣事项、标签筛选和完成历史没有持久化。Period 与 Anniversary 保持原样。

## 预览与部署

网页验收地址：<https://yez780055-cell.github.io/life-space/>。此仓库只有一个 GitHub Pages 站点，`feat/todo-phase-2b` 分支推送会覆盖此地址的开发预览；该地址不是独立预览环境，也不代表正式发布。旧 `feat/todo-phase-2a` 分支的 Pages 工作流已停用，避免其后续推送覆盖 Phase 2B 预览。

Pages 工作流从 `feat/todo-phase-2b` 直接构建并部署，无需合并 PR。GitHub Pages 的 Build and deployment Source 需要选择 **GitHub Actions**。PR 的 `Foundation Web checks` 会运行 TypeScript、ESLint、Vitest、Vite build，并在 Chromium 桌面和移动视口执行网页验收。预览工作流与 PR 检查是分开的；部署成功不代表 PR 合并。

GitHub Pages 使用 Vite 的 `/life-space/` 子路径。Playwright 检查该子路径下的刷新、资源、manifest、Service Worker 与离线重载。有关验证细节见 [docs/verification.md](docs/verification.md)。

数据结构、旧任务兼容与重复周期展示规则列在 [docs/todo-phase-2b.md](docs/todo-phase-2b.md)。

## 范围

Phase 2B 不包含后端、账号、同步、可靠后台提醒或 Android APK。情侣事项的真实 CRUD、拖拽安排、筛选与历史数据属于 Phase 2C；Android 真机验收和正式发布另行安排。
