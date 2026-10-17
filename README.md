# Life Space

Life Space 是 React 19、TypeScript、Vite 和 Capacitor 7 构建的个人生活 App。个人待办目前采用极简流程；本阶段只交付网页，不构建 APK。

## 本地运行与检查

需要 Node.js 20.19+ 和 npm。运行 `npm ci`、`npm run dev`。代码检查为 `npm run typecheck`、`npm run lint`、`npm test` 和 `npm run build`。完整桌面、移动、子路径与 PWA 浏览器检查为 `npm run verify:browser`；首次运行可执行 `npx playwright install chromium`。可用 `LIFE_SPACE_PREVIEW_URL` 指定待检查的生产预览地址，网址须以 `/` 结尾。

## Phase 2B：个人待办

个人任务、标签与周期实例保存在设备 IndexedDB 的 `todoTasks`、`todoTags`、`todoOccurrences` stores 中。个人待办只提供按日期浏览、全部待办、快速添加、完成与撤销，以及折叠的已完成记录。日期可用前后按钮或触屏滑动切换；快速添加沿用当前日期，全部视图则默认今天。首次打开没有内置示例任务。

更新任务时只改标题和日期，已有备注、标签、子任务、提醒、重复规则、完成状态和周期记录会继续保留。没有日期的旧任务仍可在全部视图找到。

重复任务使用一条系列规则按本地日期计算实例，不复制未来任务行。全部视图保留已有周期记录，并为每条仍有效的重复系列显示从今天开始的下一个未记录周期，以保持列表有限。提醒设置会持久化；只有用户主动授权后，网页打开时才会尝试通过浏览器通知提醒。浏览器关闭后的可靠投递、原生通知和跨设备同步尚未实现。

## Phase 2C：情侣待办

情侣事项与标签保存在独立的 IndexedDB stores 中，不改写个人任务记录。当前支持快速新增、编辑、确认删除、安排/未安排两列拖动、日期时间编辑、多标签 OR 筛选、完成与撤销、可恢复的完成历史及 7/30/90/180/365 天和自定义范围筛选。完成时间按本机时区显示。

目前数据仅保存在当前设备，跨设备同步未配置、未启用。`supabase/migrations/202610160001_couple_todo.sql` 和 `CoupleTodoRepository` 接口为后续认证共享准备了成员上限、一次性邀请、RLS 与版本冲突控制；应用没有 Supabase 项目 URL 或客户端密钥，也没有远程同步适配器。不得将本机保存状态描述为同步。

情侣数据使用独立的 `coupleItems`、`coupleTags` stores；升级会保留现有 `todoTasks`、`todoTags`、`todoOccurrences`。

## Phase 3A：小月历

小月历使用 `life-space` IndexedDB 中独立的 `periodRecords`、`periodSettings` stores。v4 升级只新增这两个 store，不清空或改写个人待办、情侣待办、全局设置或模块状态。实际与预测经期使用不同颜色；页面支持按月浏览、触屏横向轻扫、日期详情、开始/结束/撤销、历史补录与编辑删除、真实记录统计、周期参数、关怀备忘、提醒、Period 页面 PIN 和加密备份。

从旧小月历迁入时，先在旧小月历导出加密 `.xyl` 文件，再在 Life Space 的“小月历设置 → 从旧小月历导入”选择文件并输入备份密码。解密通过后先显示记录数量和日期范围；如果本机已有小月历内容，确认前请先导出当前备份，并再次确认替换。导入只替换 Period 数据，不会读取旧网站、合并重复记录或修改其他空间。旧站点与 Life Space 是不同 origin，不能自动读取旧站 IndexedDB；迁移必须由用户主动选择 `.xyl` 文件。

Period 内容仅存于当前设备的 `periodRecords`、`periodSettings` stores。PIN 只遮挡 Period 页面，不加密设备数据库；旧版 `.xyl` 格式本身不包含 PIN，导入会保留当前 Life Space 的 PIN。加密备份使用旧版兼容的 PBKDF2-SHA-256（250,000 次）和 AES-GCM-256；不提供明文导出。浏览器提醒仅在用户授权且小月历打开时尝试，网页关闭或系统挂起时不保证送达。数据格式、导入步骤、兼容差异和人工验收清单见 [docs/period-integration.md](docs/period-integration.md)。

## Phase 3B：纪念日

纪念日保存在 `life-space` IndexedDB v6 的专用 `anniversaryRecords` store。v5→v6 只增加该 store，不重建或清空设置、个人待办、情侣待办或 Period 数据。首页展示最近一件将到来的事和全部记录；支持每年重复与仅一次、详情、备注、编辑及二次确认删除。可按每条记录开启自定义天数节点：原始日期当天计作第 1 天，节点日期自动按本地公历日计算。周年闰日的非闰年发生日按 2 月 28 日处理；连续天数节点仍按公历日逐日递增。数据只在当前设备本地保存，没有账号、云同步、提醒、照片、标签或统计图表。完整规则与验收项见 [docs/anniversary.md](docs/anniversary.md)。

## 预览与部署

网页验收地址：<https://yez780055-cell.github.io/life-space/>。此仓库只有一个 GitHub Pages 站点，`feat/todo-phase-2b` 分支推送会覆盖此地址的开发预览；该地址不是独立预览环境，也不代表正式发布。旧 `feat/todo-phase-2a` 分支的 Pages 工作流已停用，避免其后续推送覆盖 Phase 2B 预览。

Pages 工作流从 `feat/todo-phase-2b` 直接构建并部署，无需合并 PR。GitHub Pages 的 Build and deployment Source 需要选择 **GitHub Actions**。PR 的 `Foundation Web checks` 会运行 TypeScript、ESLint、Vitest、Vite build，并在 Chromium 桌面和移动视口执行网页验收。预览工作流与 PR 检查是分开的；部署成功不代表 PR 合并。

GitHub Pages 使用 Vite 的 `/life-space/` 子路径。Playwright 检查该子路径下的刷新、资源、manifest、Service Worker 与离线重载。有关验证细节见 [docs/verification.md](docs/verification.md)。

数据结构、旧任务兼容与重复周期展示规则列在 [docs/todo-phase-2b.md](docs/todo-phase-2b.md)。

## 范围

Life Space 当前没有已连接的后端或账号流程；Todo、Couple、Period 和 Anniversary 数据按各自的数据域保存在当前设备。Anniversary V1 不含跨设备同步、提醒、照片、标签、统计或 Android APK。Android 真机验收和正式发布另行安排。
