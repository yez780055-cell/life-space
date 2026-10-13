# Foundation 验证记录

本地验证（2026-10-13）：

- `npm run typecheck`、`npm run lint`、`npm test`：通过。Vitest 11 项，覆盖启动模块恢复与异常值、模块存储隔离、IndexedDB v1→v2 数据保留、设置/弹层/子页返回、模块子页回访、Android 返回键退出窗口与 StrictMode 监听清理。
- `npm run build`：通过，生成 PWA manifest 与 Service Worker，预缓存 10 项资源。
- Chromium 生产预览，桌面 1440×900、手机 390×844：截图见 `docs/screenshots/`；手机独立模块滚动从 56px 切 Tab 后恢复 56px，子页回访后返回根页通过，切 Tab 后浏览器前进未复活旧模块，随后根页后退离开应用；在子页、设置、弹窗叠加时刷新，重新启动于模块根页且后退离开应用。
- Chromium Service Worker 已控制页面；断网后刷新仍打开应用。未验证浏览器安装提示或所有设备的 PWA 安装流程。
- Android 本地 SDK 未配置；由 PR GitHub Actions 构建 Debug APK，构建结果与 artifact 以该 PR 的检查记录为准。尚未经过 Android 真机安装和操作验收。
