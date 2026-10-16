/* global process, console, document, indexedDB, navigator, URL, fetch, Touch, TouchEvent */
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const url = process.env.LIFE_SPACE_PREVIEW_URL ?? 'http://127.0.0.1:4173/';
if (!url.endsWith('/')) throw new Error('LIFE_SPACE_PREVIEW_URL must end with /');
const screenshotDir = resolve(process.env.LIFE_SPACE_SCREENSHOT_DIR ?? 'docs/screenshots');
await mkdir(screenshotDir, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.LIFE_SPACE_CHROMIUM_PATH ? { executablePath: process.env.LIFE_SPACE_CHROMIUM_PATH } : {}), args: ['--no-sandbox'] });
const shot = (page, name) => page.screenshot({ path: join(screenshotDir, name), fullPage: true });

async function waitForSpace(page, space) {
  await page.waitForFunction((expected) => document.querySelector('.todo-module-root')?.getAttribute('data-current-space') === expected, space, { timeout: 3000 });
  if (await page.getByTestId('space-ripple').count()) throw new Error('A space ripple remained after transition');
}

async function waitForTodoData(page) {
  await page.waitForFunction(() => document.querySelector('.todo-module-root')?.getAttribute('data-loading') === 'false');
}

async function swipe(page, selector, fromX, fromY, toX, toY) {
  await page.locator(selector).evaluate((element, point) => {
    const start = new Touch({ identifier: 1, target: element, clientX: point.fromX, clientY: point.fromY });
    const end = new Touch({ identifier: 1, target: element, clientX: point.toX, clientY: point.toY });
    element.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [start], changedTouches: [start] }));
    element.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [end] }));
  }, { fromX, fromY, toX, toY });
}

async function openQuickAdd(page) {
  await page.getByRole('button', { name: '快速新增待办' }).click();
  const dialog = page.getByRole('dialog', { name: '快速添加' });
  await dialog.waitFor();
  return dialog;
}

async function readCoupleItems(page) {
  return page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('life-space');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const request = database.transaction('coupleItems', 'readonly').objectStore('coupleItems').getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally { database.close(); }
  });
}

async function waitForCoupleItem(page, title, expected = {}) {
  await page.waitForFunction(async ({ wantedTitle, checks }) => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('life-space');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const records = await new Promise((resolve, reject) => {
        const request = database.transaction('coupleItems', 'readonly').objectStore('coupleItems').getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const item = records.find((record) => record.title === wantedTitle);
      if (checks.exists === false) return !item;
      if (!item) return false;
      if (Object.hasOwn(checks, 'scheduledDate') && item.scheduledDate !== checks.scheduledDate) return false;
      if (Object.hasOwn(checks, 'completed') && (checks.completed ? typeof item.completedAt !== 'number' : item.completedAt !== null)) return false;
      return true;
    } finally { database.close(); }
  }, { wantedTitle: title, checks: expected });
}

async function addCoupleItem(page, title) {
  await page.getByRole('button', { name: '新增情侣事项' }).click();
  const dialog = page.getByRole('dialog', { name: '记一件我们的小事' });
  await dialog.waitFor();
  await dialog.getByRole('textbox', { name: '事项标题' }).fill(title);
  await dialog.getByRole('button', { name: '添加' }).click();
  await page.waitForFunction(async (wantedTitle) => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('life-space');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const request = database.transaction('coupleItems', 'readonly').objectStore('coupleItems').getAll();
        request.onsuccess = () => resolve(request.result.some((item) => item.title === wantedTitle));
        request.onerror = () => reject(request.error);
      });
    } finally { database.close(); }
  }, title);
  await page.waitForFunction(() => document.querySelector('.todo-quick-dialog input[aria-label="事项标题"]')?.value === '');
  await dialog.getByRole('button', { name: '关闭' }).last().click();
  await dialog.waitFor({ state: 'detached' });
}

function coupleCard(page, title) {
  return page.locator('.couple-card-body').filter({ hasText: title });
}

async function expandCoupleCard(page, title) {
  const card = coupleCard(page, title);
  if (await card.getAttribute('aria-expanded') !== 'true') await card.click();
  return card;
}

try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await desktop.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(url);
  await page.getByRole('heading', { name: '今天', exact: true }).waitFor();
  await waitForTodoData(page);
  await shot(page, 'todo-desktop-date.png');

  await page.getByRole('button', { name: '后一天' }).click();
  await page.getByRole('button', { name: '后一天' }).click();
  const quick = await openQuickAdd(page);
  const quickTitle = quick.getByRole('textbox', { name: '任务内容' });
  const selectedDate = await quick.getByLabel('任务日期').inputValue();
  const expectedDate = await page.evaluate(() => { const date = new Date(); date.setDate(date.getDate() + 2); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; });
  if (selectedDate !== expectedDate) throw new Error(`Quick add did not use the browsed date: ${selectedDate} != ${expectedDate}`);
  const focused = await quickTitle.evaluate((input) => document.activeElement === input);
  if (!focused) throw new Error('Quick add did not focus the task title');
  await shot(page, 'todo-desktop-quick-add.png');
  await quickTitle.fill('浏览日期任务');
  await quickTitle.press('Enter');
  await page.waitForFunction(async () => {
    const database = await new Promise((resolve, reject) => { const request = indexedDB.open('life-space'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try { return await new Promise((resolve, reject) => { const request = database.transaction('todoTasks', 'readonly').objectStore('todoTasks').getAll(); request.onsuccess = () => resolve(request.result.some((task) => task.title === '浏览日期任务')); request.onerror = () => reject(request.error); }); }
    finally { database.close(); }
  });
  if (!(await quick.isVisible()) || await quickTitle.inputValue() !== '') throw new Error('Quick add did not remain open and clear the title after saving');
  await quickTitle.fill('第二件事');
  await quick.getByRole('button', { name: '添加' }).click();
  await page.waitForFunction(async () => {
    const database = await new Promise((resolve, reject) => { const request = indexedDB.open('life-space'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try { return await new Promise((resolve, reject) => { const request = database.transaction('todoTasks', 'readonly').objectStore('todoTasks').getAll(); request.onsuccess = () => resolve(request.result.filter((task) => task.title === '第二件事').length === 1); request.onerror = () => reject(request.error); }); }
    finally { database.close(); }
  });
  await quick.getByRole('button', { name: '关闭' }).last().click();
  await page.getByRole('button', { name: '全部' }).click();
  await page.getByRole('button', { name: '完成任务：浏览日期任务' }).waitFor();
  await page.getByRole('button', { name: '完成任务：第二件事' }).waitFor();
  await shot(page, 'todo-desktop-all.png');

  await page.getByRole('button', { name: '完成任务：浏览日期任务' }).click();
  await page.getByRole('button', { name: '撤销完成：浏览日期任务' }).click();
  await page.getByRole('button', { name: '完成任务：浏览日期任务' }).waitFor();
  await page.getByRole('button', { name: '完成任务：浏览日期任务' }).click();
  const completed = page.locator('.todo-minimal-completed-toggle');
  await page.waitForFunction(() => document.querySelector('.todo-minimal-completed-toggle')?.textContent?.includes('1 项'));
  if (await completed.getAttribute('aria-expanded') !== 'false') throw new Error('Completed records should start folded');
  await completed.click();
  await page.getByRole('button', { name: '恢复任务：浏览日期任务' }).waitFor();
  await page.getByRole('button', { name: '恢复任务：浏览日期任务' }).click();
  await page.getByRole('button', { name: '完成任务：浏览日期任务' }).waitFor();
  await page.getByRole('button', { name: '完成任务：第二件事' }).click();
  await page.waitForFunction(async () => {
    const database = await new Promise((resolve, reject) => { const request = indexedDB.open('life-space'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try { return await new Promise((resolve, reject) => { const request = database.transaction('todoTasks', 'readonly').objectStore('todoTasks').getAll(); request.onsuccess = () => resolve(request.result.some((task) => task.title === '第二件事' && typeof task.completedAt === 'number')); request.onerror = () => reject(request.error); }); }
    finally { database.close(); }
  });

  await page.getByRole('button', { name: '编辑任务：浏览日期任务' }).click();
  const editor = page.getByRole('dialog', { name: '编辑待办' });
  await editor.waitFor();
  await shot(page, 'todo-desktop-edit.png');
  await editor.getByRole('textbox', { name: '任务内容' }).fill('更新后的任务');
  const movedDate = await page.evaluate(() => { const date = new Date(); date.setDate(date.getDate() + 3); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; });
  await editor.getByLabel('任务日期').fill(movedDate);
  await editor.getByRole('button', { name: '保存' }).click();
  await editor.waitFor({ state: 'detached' });
  await page.getByRole('button', { name: '完成任务：更新后的任务' }).waitFor();

  await page.getByRole('button', { name: '日期' }).click();
  await page.getByRole('button', { name: '回到今天' }).waitFor();
  const selectedDateHeading = await page.locator('.todo-minimal-header h1').textContent();
  await swipe(page, '.todo-minimal-task-area', 290, 340, 130, 340);
  await page.waitForFunction((previous) => document.querySelector('.todo-minimal-header h1')?.textContent !== previous, selectedDateHeading);
  await swipe(page, '.todo-minimal-task-area', 130, 340, 290, 340);
  await page.waitForFunction((previous) => document.querySelector('.todo-minimal-header h1')?.textContent === previous, selectedDateHeading);
  await swipe(page, '.todo-minimal-task-area', 200, 300, 202, 420);
  if (await page.locator('.todo-minimal-header h1').textContent() !== selectedDateHeading) throw new Error('Vertical scrolling changed the selected date');
  await shot(page, 'todo-desktop-date-swipe.png');

  await page.getByRole('button', { name: '进入情侣专区' }).click();
  await waitForSpace(page, 'couple');
  await page.getByText('仅保存在此设备 · 跨设备同步尚未配置').waitFor();
  if (await page.locator('.couple-card-body').count() !== 0) throw new Error('A fresh couple board should not contain demo items');
  await addCoupleItem(page, '一起散步');
  await addCoupleItem(page, '在家看电影');

  await page.getByRole('button', { name: '一起散步', exact: true }).click();
  await page.getByRole('button', { name: '编辑：一起散步', exact: true }).click();
  const coupleEditor = page.locator('.couple-editor-page');
  await coupleEditor.getByRole('textbox', { name: '事项标题' }).fill('周末一起散步');
  const coupleDate = await page.evaluate(() => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; });
  await coupleEditor.getByLabel('安排日期').fill(coupleDate);
  await coupleEditor.getByLabel('安排时间').fill('18:30');
  await coupleEditor.getByRole('textbox', { name: '备注' }).fill('带上相机');
  await coupleEditor.getByRole('textbox', { name: '新建情侣标签' }).fill('周末');
  await coupleEditor.getByRole('button', { name: '添加标签' }).click();
  await coupleEditor.getByRole('button', { name: '周末' }).waitFor();
  await coupleEditor.getByRole('button', { name: '保存' }).click();
  await coupleCard(page, '周末一起散步').waitFor();

  const plannedColumn = page.getByRole('region', { name: '已安排' });
  const plannedBounds = await plannedColumn.boundingBox();
  if (!plannedBounds) throw new Error('The planned couple column is not visible');
  const unplannedHandle = page.getByRole('button', { name: '拖动安排或点击编辑：在家看电影' });
  await unplannedHandle.hover();
  await page.mouse.down();
  await page.mouse.move(plannedBounds.x + plannedBounds.width / 2, plannedBounds.y + plannedBounds.height / 2, { steps: 8 });
  await page.mouse.up();
  await waitForCoupleItem(page, '在家看电影', { scheduledDate: coupleDate });

  const unplannedColumn = page.getByRole('region', { name: '未安排' });
  const unplannedBounds = await unplannedColumn.boundingBox();
  if (!unplannedBounds) throw new Error('The unplanned couple column is not visible');
  const plannedHandle = page.getByRole('button', { name: '拖动安排或点击编辑：在家看电影' });
  await plannedHandle.hover();
  await page.mouse.down();
  await page.mouse.move(unplannedBounds.x + unplannedBounds.width / 2, unplannedBounds.y + unplannedBounds.height / 2, { steps: 8 });
  await page.mouse.up();
  await waitForCoupleItem(page, '在家看电影', { scheduledDate: null });

  await page.getByRole('button', { name: '在家看电影', exact: true }).click();
  await page.getByRole('button', { name: '编辑：在家看电影', exact: true }).click();
  const secondEditor = page.locator('.couple-editor-page');
  await secondEditor.getByRole('textbox', { name: '新建情侣标签' }).fill('居家');
  await secondEditor.getByRole('button', { name: '添加标签' }).click();
  await secondEditor.getByRole('button', { name: '保存' }).click();
  await coupleCard(page, '在家看电影').waitFor();
  await page.getByRole('button', { name: '周末', exact: true }).click();
  if (await page.locator('.couple-card-body').count() !== 1) throw new Error('Couple tag filtering did not isolate the matching task');
  await page.getByRole('button', { name: '居家', exact: true }).click();
  if (await page.locator('.couple-card-body').count() !== 2) throw new Error('Multiple couple tags should use OR filtering');
  const savedWalk = (await readCoupleItems(page)).find((item) => item.title === '周末一起散步');
  if (!savedWalk || savedWalk.scheduledDate !== coupleDate || savedWalk.scheduledTime !== '18:30' || savedWalk.note !== '带上相机' || !Array.isArray(savedWalk.tags) || savedWalk.tags.length !== 1) throw new Error(`Couple edit did not persist all fields: ${JSON.stringify(savedWalk)}`);
  await shot(page, 'todo-desktop-couple-board.png');

  await expandCoupleCard(page, '周末一起散步');
  await page.getByRole('button', { name: '完成：周末一起散步' }).click();
  await waitForCoupleItem(page, '周末一起散步', { completed: true });
  await page.getByRole('button', { name: '撤销完成：周末一起散步' }).click();
  await waitForCoupleItem(page, '周末一起散步', { completed: false });
  await expandCoupleCard(page, '周末一起散步');
  await page.getByRole('button', { name: '完成：周末一起散步' }).click();
  await waitForCoupleItem(page, '周末一起散步', { completed: true });
  await page.getByRole('button', { name: '查看已完成历史' }).click();
  await page.getByRole('heading', { name: '周末一起散步' }).waitFor();
  await shot(page, 'todo-desktop-couple-history.png');
  await page.getByRole('button', { name: '筛选时间范围' }).click();
  const historyDialog = page.getByRole('dialog', { name: '选择时间范围' });
  await historyDialog.getByRole('button', { name: '自定义时间段' }).click();
  await historyDialog.getByLabel('开始日期').fill(coupleDate);
  await historyDialog.getByLabel('结束日期').fill(coupleDate);
  await historyDialog.getByRole('button', { name: '完成' }).click();
  await page.getByRole('heading', { name: '周末一起散步' }).waitFor();
  await page.getByRole('button', { name: '恢复到待办' }).click();
  await waitForCoupleItem(page, '周末一起散步', { completed: false });
  await page.getByText('这个时间范围内没有已完成的事项。').waitFor();

  await page.getByRole('button', { name: '返回' }).click();
  await page.getByRole('button', { name: '返回个人待办' }).waitFor();
  await coupleCard(page, '在家看电影').click();
  await page.getByRole('button', { name: '编辑：在家看电影', exact: true }).click();
  const deleteEditor = page.locator('.couple-editor-page');
  await deleteEditor.getByRole('button', { name: '删除' }).click();
  await deleteEditor.getByRole('button', { name: '确认删除' }).click();
  await waitForCoupleItem(page, '在家看电影', { exists: false });
  if ((await readCoupleItems(page)).find((item) => item.title === '周末一起散步')?.completedAt !== null) throw new Error('Restoring history did not clear the completion time');
  const personalStillThere = await page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => { const request = indexedDB.open('life-space'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try { return await new Promise((resolve, reject) => { const request = database.transaction('todoTasks', 'readonly').objectStore('todoTasks').getAll(); request.onsuccess = () => resolve(request.result.some((task) => task.title === '更新后的任务')); request.onerror = () => reject(request.error); }); }
    finally { database.close(); }
  });
  if (!personalStillThere) throw new Error('Couple changes altered personal task data');
  await page.getByRole('button', { name: '返回个人待办' }).click();
  await waitForSpace(page, 'personal');

  const desktopNav = page.locator('.sidebar');
  await desktopNav.getByRole('button', { name: '小月历' }).click();
  await page.getByRole('region', { name: '小月历' }).waitFor();
  await desktopNav.getByRole('button', { name: '纪念日' }).click();
  await page.getByRole('region', { name: '纪念日' }).waitFor();
  await desktopNav.getByRole('button', { name: '设置' }).click();
  await page.getByRole('region', { name: '设置' }).waitFor();
  await page.locator('.settings-page').getByRole('button', { name: '返回' }).click();
  await page.getByRole('region', { name: '纪念日' }).waitFor();
  await desktopNav.getByRole('button', { name: '待办' }).click();
  if (await page.getByRole('button', { name: '回到今天' }).count()) await page.getByRole('button', { name: '回到今天' }).click();
  await page.getByRole('heading', { name: '今天', exact: true }).waitFor();

  await page.reload();
  await page.getByRole('heading', { name: '今天', exact: true }).waitFor();
  await page.getByRole('button', { name: '全部' }).click();
  await page.getByRole('button', { name: '完成任务：更新后的任务' }).waitFor();
  await page.locator('.todo-minimal-completed-toggle').click();
  await page.getByRole('button', { name: '恢复任务：第二件事' }).waitFor();
  const persistedTask = await page.evaluate(async (title) => {
    const database = await new Promise((resolve, reject) => { const request = indexedDB.open('life-space'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try { return await new Promise((resolve, reject) => { const request = database.transaction('todoTasks', 'readonly').objectStore('todoTasks').getAll(); request.onsuccess = () => resolve(request.result.find((task) => task.title === title)); request.onerror = () => reject(request.error); }); }
    finally { database.close(); }
  }, '更新后的任务');
  if (!persistedTask || persistedTask.scheduledDate !== movedDate || persistedTask.completedAt !== null) throw new Error(`Edited task content or date did not persist: ${JSON.stringify(persistedTask)}`);
  const persistedDone = await page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => { const request = indexedDB.open('life-space'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try { return await new Promise((resolve, reject) => { const request = database.transaction('todoTasks', 'readonly').objectStore('todoTasks').getAll(); request.onsuccess = () => resolve(request.result.find((task) => task.title === '第二件事')); request.onerror = () => reject(request.error); }); }
    finally { database.close(); }
  });
  if (typeof persistedDone?.completedAt !== 'number') throw new Error(`Completion state did not persist through reload: ${JSON.stringify(persistedDone)}`);
  const pwa = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return { supported: false };
    const ready = await navigator.serviceWorker.ready;
    const manifestUrl = new URL(document.querySelector('link[rel="manifest"]').href);
    const response = await fetch(manifestUrl);
    const manifest = await response.json();
    const manifestScope = new URL(manifest.scope, manifestUrl).href;
    const startUrl = new URL(manifest.start_url, manifestUrl).href;
    return { supported: true, scope: ready.scope, controlled: Boolean(navigator.serviceWorker.controller), manifestScope, startUrl };
  });
  if (!pwa.supported || !pwa.controlled || pwa.scope !== url || pwa.manifestScope !== url || pwa.startUrl !== url) throw new Error(`PWA registration did not match the preview URL: ${JSON.stringify(pwa)}`);
  if (pageErrors.length) throw new Error(`Browser page errors: ${pageErrors.join('; ')}`);
  await desktop.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(url);
  await mobilePage.getByRole('heading', { name: '今天', exact: true }).waitFor();
  await waitForTodoData(mobilePage);
  await shot(mobilePage, 'todo-mobile-date.png');
  const fab = mobilePage.getByRole('button', { name: '快速新增待办' });
  const fabBounds = await fab.boundingBox();
  if (!fabBounds || fabBounds.x < 0 || fabBounds.y + fabBounds.height > 844) throw new Error(`Mobile quick-add button is outside the viewport: ${JSON.stringify(fabBounds)}`);
  for (const width of [320, 360, 390, 430]) {
    await mobilePage.setViewportSize({ width, height: 844 });
    const scrollWidth = await mobilePage.evaluate(() => document.documentElement.scrollWidth);
    if (scrollWidth > width) throw new Error(`Todo has horizontal overflow at ${width}px (${scrollWidth}px)`);
  }
  await mobilePage.setViewportSize({ width: 390, height: 844 });
  const mobileQuick = await openQuickAdd(mobilePage);
  const mobileTitle = mobileQuick.getByRole('textbox', { name: '任务内容' });
  if (!(await mobileTitle.evaluate((input) => document.activeElement === input))) throw new Error('Mobile quick add did not focus the title');
  await shot(mobilePage, 'todo-mobile-quick-add.png');
  await mobileTitle.fill('手机上的任务');
  await mobileQuick.getByRole('button', { name: '添加' }).tap();
  await mobileQuick.waitFor();
  await mobileQuick.getByRole('button', { name: '关闭' }).last().tap();
  await mobilePage.getByRole('button', { name: '全部' }).tap();
  await mobilePage.getByRole('button', { name: '完成任务：手机上的任务' }).waitFor();
  await mobilePage.getByRole('button', { name: '完成任务：手机上的任务' }).tap();
  await mobilePage.getByRole('button', { name: '撤销完成：手机上的任务' }).tap();
  await mobilePage.getByRole('button', { name: '完成任务：手机上的任务' }).waitFor();
  await mobilePage.getByRole('button', { name: '进入情侣专区' }).tap();
  await waitForSpace(mobilePage, 'couple');
  await addCoupleItem(mobilePage, '手机上的情侣事项');
  await mobilePage.getByRole('button', { name: '手机上的情侣事项', exact: true }).waitFor();
  for (const width of [320, 360, 390, 430]) {
    await mobilePage.setViewportSize({ width, height: 844 });
    const scrollWidth = await mobilePage.evaluate(() => document.documentElement.scrollWidth);
    if (scrollWidth > width) throw new Error(`Couple board has horizontal overflow at ${width}px (${scrollWidth}px)`);
  }
  await mobilePage.setViewportSize({ width: 390, height: 844 });
  await shot(mobilePage, 'todo-mobile-couple-board.png');
  await mobilePage.getByRole('button', { name: '手机上的情侣事项', exact: true }).tap();
  await mobilePage.getByRole('button', { name: '完成：手机上的情侣事项' }).tap();
  await mobilePage.getByRole('button', { name: '撤销完成：手机上的情侣事项' }).tap();
  await mobilePage.getByRole('button', { name: '手机上的情侣事项', exact: true }).waitFor();
  await mobile.close();

  console.log(JSON.stringify({ desktop: { quickAddAndRepeatEntry: 'passed', selectedDateAndDateBrowse: 'passed', completionAndUndo: 'passed', foldedCompletedRestore: 'passed', titleDateEdit: 'passed', coupleCrud: 'passed', coupleDragScheduling: 'passed', coupleTagOrFilter: 'passed', coupleHistoryAndRestore: 'passed', personalDataPreserved: 'passed', moduleNavigationAndSettings: 'passed' }, mobile: { quickAdd: 'passed', completionAndUndo: 'passed', coupleQuickAddAndCompletion: 'passed', widths: [320, 360, 390, 430], coupleBoardNoHorizontalOverflow: 'passed', noHorizontalOverflow: 'passed', fabInViewport: 'passed' }, pwa, screenshots: screenshotDir }, null, 2));
} finally {
  await browser.close();
}
