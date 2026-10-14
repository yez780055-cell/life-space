/* global process, navigator, console, URL, document, fetch, window */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const url = process.env.LIFE_SPACE_PREVIEW_URL ?? 'http://127.0.0.1:4173/';
if (!url.endsWith('/')) throw new Error('LIFE_SPACE_PREVIEW_URL must end with /');
const browser = await chromium.launch({ headless: true, ...(process.env.LIFE_SPACE_CHROMIUM_PATH ? { executablePath: process.env.LIFE_SPACE_CHROMIUM_PATH } : {}), args: ['--no-sandbox'] });
await mkdir('docs/screenshots', { recursive: true });

async function waitForSpace(page, space) {
  await page.waitForFunction((expected) => document.querySelector('.todo-module-root')?.getAttribute('data-current-space') === expected, space, { timeout: 2500 });
  if (await page.getByTestId('space-ripple').count()) throw new Error('A space ripple remained after the transition');
}

try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const desktopPage = await desktop.newPage();
  await desktopPage.goto(url);
  await desktopPage.getByRole('heading', { name: '待办', exact: true }).waitFor();
  if (await desktopPage.getByRole('tab', { name: '本周' }).getAttribute('aria-selected') !== 'true') throw new Error('Todo did not open on this week');
  await desktopPage.screenshot({ path: 'docs/screenshots/desktop.png', fullPage: true });
  await desktopPage.getByRole('button', { name: '进入情侣专区' }).click();
  await waitForSpace(desktopPage, 'couple');
  await desktopPage.getByRole('heading', { name: '我们的小事' }).waitFor();
  await desktopPage.screenshot({ path: 'docs/screenshots/todo-couple-desktop.png', fullPage: true });
  const firstCoupleCard = desktopPage.locator('.couple-card-body').first();
  await firstCoupleCard.click();
  if (await firstCoupleCard.getAttribute('aria-expanded') !== 'true') throw new Error('Couple card did not expand');
  await desktopPage.getByRole('button', { name: '查看已完成历史' }).click();
  await desktopPage.getByRole('heading', { name: '完成的时光' }).waitFor();
  await desktopPage.getByRole('button', { name: '筛选时间范围' }).click();
  await desktopPage.getByRole('dialog', { name: '选择时间范围' }).waitFor();
  await desktopPage.getByRole('button', { name: '关闭' }).click();
  await desktopPage.getByRole('button', { name: '返回' }).click();
  await desktopPage.getByRole('heading', { name: '我们的小事' }).waitFor();
  await desktopPage.getByRole('button', { name: '返回个人待办' }).click();
  await waitForSpace(desktopPage, 'personal');
  await desktopPage.getByRole('button', { name: '快速新增待办' }).click();
  const quickDialog = desktopPage.getByRole('dialog', { name: '快速记录' });
  await quickDialog.waitFor();
  await quickDialog.getByRole('textbox', { name: '任务标题' }).fill('视觉预览任务');
  await quickDialog.getByRole('button', { name: '保存' }).click();
  await desktopPage.getByRole('status').filter({ hasText: '尚未保存' }).waitFor();
  await quickDialog.getByRole('button', { name: '关闭' }).click();
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
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (overflow) throw new Error('The 390px mobile Todo page has horizontal overflow');
  await page.getByRole('tab', { name: '今天' }).tap();
  await page.getByRole('heading', { name: '今天', exact: true }).waitFor();
  await page.getByRole('tab', { name: '本月' }).tap();
  await page.getByRole('grid').waitFor();
  await page.getByRole('tab', { name: '本周' }).tap();
  const inbox = page.getByRole('button', { name: /收集箱/ });
  await inbox.tap();
  await page.getByText('想到一件要买的小东西').waitFor();
  await inbox.tap();
  await page.getByRole('button', { name: '快速新增待办' }).tap();
  const mobileQuick = page.getByRole('dialog', { name: '快速记录' });
  await mobileQuick.waitFor();
  await mobileQuick.getByRole('button', { name: '关闭' }).tap();
  await page.getByRole('button', { name: '进入情侣专区' }).tap();
  await waitForSpace(page, 'couple');
  await page.screenshot({ path: 'docs/screenshots/todo-couple-mobile.png', fullPage: true });
  const coupleCard = page.locator('.couple-card-body').first();
  await coupleCard.tap();
  if (await coupleCard.getAttribute('aria-expanded') !== 'true') throw new Error('Mobile couple card did not expand');
  await page.screenshot({ path: 'docs/screenshots/todo-couple-card-expanded.png', fullPage: true });
  await page.getByRole('button', { name: '编辑：找一家喜欢的日料店' }).tap();
  await page.getByRole('heading', { name: '编辑小事' }).waitFor();
  await page.getByRole('button', { name: '返回' }).tap();
  await page.getByRole('heading', { name: '我们的小事' }).waitFor();
  await page.getByRole('button', { name: '查看已完成历史' }).tap();
  await page.getByRole('heading', { name: '完成的时光' }).waitFor();
  await page.getByRole('button', { name: '筛选时间范围' }).tap();
  await page.getByRole('dialog', { name: '选择时间范围' }).waitFor();
  await page.getByRole('button', { name: '自定义时间段' }).tap();
  await page.getByRole('textbox', { name: '开始日期' }).waitFor();
  await page.goBack();
  await page.getByRole('heading', { name: '完成的时光' }).waitFor();
  await page.goBack();
  await waitForSpace(page, 'couple');
  await page.goBack();
  await waitForSpace(page, 'personal');
  await page.getByRole('button', { name: '进入情侣专区' }).tap();
  await waitForSpace(page, 'couple');
  await page.getByRole('button', { name: '返回个人待办' }).tap();
  await waitForSpace(page, 'personal');

  const initial = await page.locator('.module-holder.visible').evaluate((element) => { element.scrollTop = 120; return element.scrollTop; });
  if (initial < 1) throw new Error('Todo page did not scroll at the mobile viewport');
  await page.locator('.bottom-nav').getByRole('button', { name: '小月历' }).tap();
  await page.getByRole('heading', { name: '小月历', exact: true }).waitFor();
  await page.locator('.bottom-nav').getByRole('button', { name: '纪念日' }).tap();
  await page.getByRole('heading', { name: '纪念日', exact: true }).waitFor();
  await page.reload();
  await page.getByRole('heading', { name: '纪念日', exact: true }).waitFor();
  await page.getByRole('button', { name: '打开设置' }).tap();
  await page.getByRole('heading', { name: '简单一点，刚刚好。' }).waitFor();
  await page.locator('.settings-page').getByRole('button', { name: '返回' }).tap();
  await page.getByRole('heading', { name: '纪念日', exact: true }).waitFor();
  await page.locator('.bottom-nav').getByRole('button', { name: '待办' }).tap();
  await page.getByRole('heading', { name: '待办', exact: true }).waitFor();
  const restored = await page.locator('.module-holder.visible').evaluate((element) => element.scrollTop);
  if (restored !== initial) throw new Error(`Module scroll was not preserved: ${initial} -> ${restored}`);

  const registration = await page.evaluate(async () => {
    const ready = await navigator.serviceWorker.ready;
    const manifestUrl = new URL(document.querySelector('link[rel="manifest"]').href);
    const response = await fetch(manifestUrl);
    if (!response.ok) throw new Error(`Manifest returned ${response.status}`);
    const manifest = await response.json();
    const startUrl = new URL(manifest.start_url, manifestUrl).href;
    const scope = new URL(manifest.scope, manifestUrl).href;
    const icons = await Promise.all(manifest.icons.map(async (icon) => (await fetch(new URL(icon.src, manifestUrl))).ok));
    return { serviceWorkerScope: ready.scope, controlled: !!navigator.serviceWorker.controller, startUrl, manifestScope: scope, iconsAvailable: icons.every(Boolean) };
  });
  if (registration.serviceWorkerScope !== url || registration.startUrl !== url || registration.manifestScope !== url || !registration.iconsAvailable || !registration.controlled) {
    throw new Error(`PWA scope or assets mismatch: ${JSON.stringify(registration)}`);
  }
  await mobile.setOffline(true);
  await page.reload();
  await page.getByRole('heading', { name: '待办', exact: true }).waitFor();
  console.log(JSON.stringify({ desktop: { doubleSpaceRipple: 'passed', coupleCardSlide: 'passed', editingAndHistory: 'passed', quickAddDemo: 'passed', foundationModulesAndSettings: 'passed' }, mobile390x844: { periodViews: 'passed', inbox: 'passed', quickAdd: 'passed', coupleTouchAndHistoryBack: 'passed', noHorizontalOverflow: 'passed', scroll: { initial, restored } }, pwa: registration, offlineReload: 'passed', screenshots: ['docs/screenshots/mobile.png', 'docs/screenshots/todo-couple-desktop.png', 'docs/screenshots/todo-couple-mobile.png', 'docs/screenshots/todo-couple-card-expanded.png'] }, null, 2));
  await mobile.close();
} finally {
  await browser.close();
}
