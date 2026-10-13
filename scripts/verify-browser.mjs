/* global process, navigator, console, URL, document, fetch */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const url = process.env.LIFE_SPACE_PREVIEW_URL ?? 'http://127.0.0.1:4173/';
if (!url.endsWith('/')) throw new Error('LIFE_SPACE_PREVIEW_URL must end with /');
const browser = await chromium.launch({ headless: true, ...(process.env.LIFE_SPACE_CHROMIUM_PATH ? { executablePath: process.env.LIFE_SPACE_CHROMIUM_PATH } : {}), args: ['--no-sandbox'] });
await mkdir('docs/screenshots', { recursive: true });

try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const desktopPage = await desktop.newPage();
  await desktopPage.goto(url);
  await desktopPage.getByRole('heading', { name: '待办', exact: true }).waitFor();
  await desktopPage.screenshot({ path: 'docs/screenshots/desktop.png', fullPage: true });
  const desktopNav = desktopPage.locator('.sidebar');
  await desktopNav.getByRole('button', { name: '小月历' }).click();
  await desktopPage.getByRole('heading', { name: '小月历', exact: true }).waitFor();
  await desktopNav.getByRole('button', { name: '纪念日' }).click();
  await desktopPage.getByRole('heading', { name: '纪念日', exact: true }).waitFor();
  await desktopNav.getByRole('button', { name: '设置' }).click();
  await desktopPage.getByRole('heading', { name: '简单一点，刚刚好。' }).waitFor();
  await desktopPage.getByRole('button', { name: '关于测试版本' }).click();
  await desktopPage.getByRole('dialog').waitFor();
  await desktopPage.getByRole('button', { name: '关闭' }).click();
  await desktopPage.getByRole('dialog').waitFor({ state: 'hidden' });
  await desktopPage.locator('.settings-page').getByRole('button', { name: '返回' }).click();
  await desktopPage.getByRole('heading', { name: '纪念日', exact: true }).waitFor();
  await desktop.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await mobile.newPage();
  await page.goto(url);
  await page.getByRole('heading', { name: '待办', exact: true }).waitFor();
  await page.screenshot({ path: 'docs/screenshots/mobile.png', fullPage: true });
  await page.locator('.bottom-nav').getByRole('button', { name: '小月历' }).click();
  await page.getByRole('heading', { name: '小月历', exact: true }).waitFor();
  await page.locator('.bottom-nav').getByRole('button', { name: '纪念日' }).click();
  await page.getByRole('heading', { name: '纪念日', exact: true }).waitFor();
  await page.reload();
  await page.getByRole('heading', { name: '纪念日', exact: true }).waitFor();
  await page.getByRole('button', { name: '打开设置' }).click();
  await page.getByRole('heading', { name: '简单一点，刚刚好。' }).waitFor();
  await page.locator('.settings-page').getByRole('button', { name: '返回' }).click();
  await page.getByRole('heading', { name: '纪念日', exact: true }).waitFor();
  await page.locator('.bottom-nav').getByRole('button', { name: '待办' }).click();
  await page.getByRole('heading', { name: '待办', exact: true }).waitFor();
  const initial = await page.locator('.module-holder.visible').evaluate((element) => { element.scrollTop = 160; return element.scrollTop; });
  await page.locator('.bottom-nav').getByRole('button', { name: '小月历' }).click();
  await page.locator('.bottom-nav').getByRole('button', { name: '待办' }).click();
  const restored = await page.locator('.module-holder.visible').evaluate((element) => element.scrollTop);
  if (initial < 1 || restored !== initial) throw new Error(`Module scroll was not preserved: ${initial} -> ${restored}`);
  await page.getByRole('button', { name: /了解这个空间/ }).click();
  await page.locator('.bottom-nav').getByRole('button', { name: '小月历' }).click();
  await page.goForward();
  if (await page.locator('.bottom-nav').getByRole('button', { name: '小月历' }).getAttribute('aria-current') !== 'page') throw new Error('Forward revived a stale module');
  await page.locator('.bottom-nav').getByRole('button', { name: '待办' }).click();
  await page.getByRole('heading', { name: '待办，正在准备中。' }).waitFor();
  await page.locator('.module-holder.visible').getByRole('button', { name: '返回' }).click();
  await page.getByRole('heading', { name: '你的空间，即将开始。' }).first().waitFor();
  const historyContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const historyPage = await historyContext.newPage();
  await historyPage.goto(`${url}icon-192.png`);
  await historyPage.goto(url);
  await historyPage.getByRole('heading', { name: '待办', exact: true }).waitFor();
  await historyPage.getByRole('button', { name: /了解这个空间/ }).click();
  await historyPage.locator('.bottom-nav').getByRole('button', { name: '小月历' }).click();
  await historyPage.goForward();
  await historyPage.waitForTimeout(100);
  await historyPage.locator('.bottom-nav').getByRole('button', { name: '待办' }).click();
  await historyPage.getByRole('heading', { name: '待办，正在准备中。' }).waitFor();
  await historyPage.locator('.module-holder.visible').getByRole('button', { name: '返回' }).click();
  await historyPage.getByRole('heading', { name: '你的空间，即将开始。' }).first().waitFor();
  await historyPage.goBack();
  await historyPage.waitForURL('**/icon-192.png');
  await historyContext.close();
  const reloadContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const reloadPage = await reloadContext.newPage();
  await reloadPage.goto(`${url}icon-192.png`);
  await reloadPage.goto(url);
  await reloadPage.getByRole('heading', { name: '待办', exact: true }).waitFor();
  await reloadPage.getByRole('button', { name: /了解这个空间/ }).click();
  await reloadPage.getByRole('button', { name: '打开设置' }).click();
  await reloadPage.getByText('关于测试版本').click();
  await reloadPage.getByRole('dialog').waitFor();
  await reloadPage.reload();
  await reloadPage.getByRole('heading', { name: '待办', exact: true }).waitFor();
  await reloadPage.goBack();
  await reloadPage.waitForURL('**/icon-192.png');
  await reloadContext.close();
  const registration = await page.evaluate(async () => {
    const ready = await navigator.serviceWorker.ready;
    const manifestUrl = new URL(document.querySelector('link[rel="manifest"]').href);
    const response = await fetch(manifestUrl);
    if (!response.ok) throw new Error(`Manifest returned ${response.status}`);
    const manifest = await response.json();
    const startUrl = new URL(manifest.start_url, manifestUrl).href;
    const scope = new URL(manifest.scope, manifestUrl).href;
    const icons = await Promise.all(manifest.icons.map(async (icon) => {
      const result = await fetch(new URL(icon.src, manifestUrl));
      return result.ok;
    }));
    return { scope: ready.scope, controlled: !!navigator.serviceWorker.controller, startUrl, manifestScope: scope, iconsAvailable: icons.every(Boolean) };
  });
  if (registration.scope !== url || registration.startUrl !== url || registration.manifestScope !== url || !registration.iconsAvailable || !registration.controlled) {
    throw new Error(`PWA scope or assets mismatch: ${JSON.stringify(registration)}`);
  }
  await mobile.setOffline(true);
  await page.reload();
  await page.getByRole('heading', { name: '待办', exact: true }).waitFor();
  console.log(JSON.stringify({ desktopNavigation: 'passed', mobileNavigation: 'passed', startupModuleRestore: 'passed', scroll: { initial, restored }, forwardAfterTab: 'passed', rootBackAfterStaleForward: 'passed', reloadLayerHistory: 'passed', pwa: registration, offlineReload: 'passed', screenshots: ['docs/screenshots/desktop.png', 'docs/screenshots/mobile.png'] }, null, 2));
  await mobile.close();
} finally {
  await browser.close();
}
