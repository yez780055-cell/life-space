/* global process, console, document, window, indexedDB, navigator, URL, fetch, Touch, TouchEvent, PointerEvent, MouseEvent, Event, getComputedStyle */
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const url = process.env.LIFE_SPACE_PREVIEW_URL ?? 'http://127.0.0.1:4173/';
if (!url.endsWith('/')) throw new Error('LIFE_SPACE_PREVIEW_URL must end with /');
const screenshotDir = resolve(process.env.LIFE_SPACE_SCREENSHOT_DIR ?? 'docs/screenshots');
await mkdir(screenshotDir, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.LIFE_SPACE_CHROMIUM_PATH ? { executablePath: process.env.LIFE_SPACE_CHROMIUM_PATH } : {}), args: ['--no-sandbox'] });
const shot = (page, name) => page.screenshot({ path: join(screenshotDir, name), fullPage: true });

function dateOrdinal(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const previousYear = year - 1;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const offsets = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  return previousYear * 365 + Math.floor(previousYear / 4) - Math.floor(previousYear / 100) + Math.floor(previousYear / 400) + offsets[month - 1] + (month > 2 && leap ? 1 : 0) + day - 1;
}

function addCalendarDateDays(dateKey, offset) {
  let [year, month, day] = dateKey.split('-').map(Number);
  let remaining = offset;
  while (remaining !== 0) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const daysInMonth = month === 2 ? (leap ? 29 : 28) : ([4, 6, 9, 11].includes(month) ? 30 : 31);
    if (remaining > 0) {
      if (day < daysInMonth) day += 1;
      else if (month < 12) { month += 1; day = 1; }
      else { year += 1; month = 1; day = 1; }
      remaining -= 1;
    } else {
      if (day > 1) day -= 1;
      else if (month > 1) {
        month -= 1;
        const previousLeap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
        day = month === 2 ? (previousLeap ? 29 : 28) : ([4, 6, 9, 11].includes(month) ? 30 : 31);
      } else { year -= 1; month = 12; day = 31; }
      remaining += 1;
    }
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatDateKeyForBrowser(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return `${year}年${month}月${day}日`;
}

function formatMonthDayForBrowser(dateKey) {
  const [, month, day] = dateKey.split('-').map(Number);
  return `${month}月${day}日`;
}

async function waitForSpace(page, space) {
  await page.waitForFunction((expected) => document.querySelector('.todo-module-root')?.getAttribute('data-current-space') === expected, space, { timeout: 3000 });
  await page.locator('.todo-module-root .todo-module-page:not(.is-space-changing)').waitFor();
  if (await page.locator('.todo-module-root .todo-module-page').count() !== 1) throw new Error('A duplicate space preview remained after transition');
}

async function waitForTodoData(page) {
  await page.waitForFunction(() => document.querySelector('.todo-module-root')?.getAttribute('data-loading') === 'false');
}

async function readPeriodRecords(page) {
  return page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => { const request = indexedDB.open('life-space'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try { return await new Promise((resolve, reject) => { const request = database.transaction('periodRecords', 'readonly').objectStore('periodRecords').getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
    finally { database.close(); }
  });
}

async function readAnniversaryRecords(page) {
  return page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => { const request = indexedDB.open('life-space'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try { return await new Promise((resolve, reject) => { const request = database.transaction('anniversaryRecords', 'readonly').objectStore('anniversaryRecords').getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
    finally { database.close(); }
  });
}

async function createBrowserAnniversary(page, { title, date, recurrence = 'yearly', milestoneDays = [] }) {
  await page.getByRole('button', { name: '新建纪念日' }).click();
  await page.getByLabel('名称').fill(title);
  await page.getByLabel('日期', { exact: true }).fill(date);
  if (recurrence === 'once') await page.getByRole('radio', { name: /仅一次/ }).check();
  if (milestoneDays.length) {
    await page.getByRole('checkbox', { name: '天数纪念' }).check();
    for (const day of milestoneDays) {
      await page.getByRole('spinbutton', { name: '添加天数节点' }).fill(String(day));
      await page.getByRole('button', { name: '＋添加' }).click();
    }
  }
  await page.getByRole('button', { name: '保存' }).click();
  await page.getByRole('button', { name: `查看纪念日：${title}` }).waitFor();
}

async function readOtherFoundationStores(page) {
  return page.evaluate(async () => {
    const names = ['settings', 'modules', 'todoTasks', 'todoTags', 'todoOccurrences', 'coupleItems', 'coupleTags', 'periodRecords', 'periodSettings'];
    const database = await new Promise((resolve, reject) => { const request = indexedDB.open('life-space'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try {
      return await new Promise((resolve, reject) => {
        const tx = database.transaction(names, 'readonly');
        const values = {};
        for (const name of names) {
          const request = tx.objectStore(name).getAll();
          request.onsuccess = () => { values[name] = request.result; };
          request.onerror = () => reject(request.error);
        }
        tx.oncomplete = () => resolve(values);
        tx.onerror = () => reject(tx.error);
      });
    } finally { database.close(); }
  });
}

async function waitForPeriodCount(page, count) {
  await page.waitForFunction(async (expected) => {
    const database = await new Promise((resolve, reject) => { const request = indexedDB.open('life-space'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try { return await new Promise((resolve, reject) => { const request = database.transaction('periodRecords', 'readonly').objectStore('periodRecords').count(); request.onsuccess = () => resolve(request.result === expected); request.onerror = () => reject(request.error); }); }
    finally { database.close(); }
  }, count);
}

async function readPeriodSettings(page) {
  return page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => { const request = indexedDB.open('life-space'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try { return await new Promise((resolve, reject) => { const request = database.transaction('periodSettings', 'readonly').objectStore('periodSettings').get('root'); request.onsuccess = () => resolve(request.result?.value); request.onerror = () => reject(request.error); }); }
    finally { database.close(); }
  });
}

async function readNonPeriodStores(page) {
  return page.evaluate(async () => {
    const names = ['settings', 'modules', 'todoTasks', 'todoTags', 'todoOccurrences', 'coupleItems', 'coupleTags'];
    const database = await new Promise((resolve, reject) => { const request = indexedDB.open('life-space'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try {
      return await new Promise((resolve, reject) => {
        const tx = database.transaction(names, 'readonly');
        const values = {};
        for (const name of names) {
          const request = tx.objectStore(name).getAll();
          request.onsuccess = () => { values[name] = request.result; };
          request.onerror = () => reject(request.error);
        }
        tx.oncomplete = () => resolve(values);
        tx.onerror = () => reject(tx.error);
      });
    } finally { database.close(); }
  });
}

async function waitForLastModule(page, expectedModule) {
  await page.waitForFunction(async (expected) => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('life-space');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const request = database.transaction('settings', 'readonly').objectStore('settings').get('lastModule');
        request.onsuccess = () => resolve(request.result === expected);
        request.onerror = () => reject(request.error);
      });
    } finally { database.close(); }
  }, expectedModule);
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
  const dialog = page.getByRole('dialog', { name: '快速添加小事' });
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

async function addDetailedCoupleItem(page, { title, date, time, tag, note }, touch = false) {
  const interact = (locator) => touch ? locator.tap() : locator.click();
  await interact(page.getByRole('button', { name: '新增情侣事项' }));
  const dialog = page.getByRole('dialog', { name: '快速添加小事' });
  await dialog.waitFor();
  await dialog.getByRole('textbox', { name: '事项标题' }).fill(title);
  await interact(dialog.getByRole('button', { name: '详细' }));
  const details = page.getByRole('dialog', { name: '详细添加小事' });
  if (await details.getByRole('textbox', { name: '事项标题' }).inputValue() !== title) throw new Error('Switching couple add modes discarded the title');
  if (date) await details.getByLabel('安排日期').fill(date);
  if (time) await details.locator('input[type="time"]').fill(time);
  if (tag) {
    await details.getByRole('textbox', { name: '新建情侣标签' }).fill(tag);
    await interact(details.getByRole('button', { name: '添加标签' }));
    await details.getByRole('button', { name: tag, exact: true }).waitFor();
  }
  if (note) await details.getByRole('textbox', { name: '备注' }).fill(note);
  await interact(details.getByRole('button', { name: '添加', exact: true }));
  await details.waitFor({ state: 'detached' });
  await waitForCoupleItem(page, title, { scheduledDate: date || null });
}

function coupleCard(page, title) {
  return page.locator('.couple-card-body').filter({ hasText: title });
}

async function expandCoupleCard(page, title) {
  const card = coupleCard(page, title);
  if (await card.getAttribute('aria-expanded') !== 'true') await card.click();
  return card;
}

async function dragCoupleCard(page, title, targetSelector, steps = 8) {
  const card = coupleCard(page, title);
  const source = await card.boundingBox();
  const target = await page.locator(targetSelector).boundingBox();
  if (!source || !target) throw new Error(`Could not measure a couple card drop from ${title}`);
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps });
  await page.mouse.up();
}

try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await desktop.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(url);
  await page.getByRole('heading', { name: '个人待办', exact: true }).waitFor();
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
  const sameDateGroup = page.locator(`.todo-minimal-date-group[data-date-key="${expectedDate}"]`);
  await sameDateGroup.waitFor();
  if (await sameDateGroup.locator('[data-testid="todo-task-row"]').count() !== 2) throw new Error('All view did not place the same-day tasks in one date group');
  if (await page.locator('.todo-minimal-date-group').count() !== 1) throw new Error('All view rendered an empty or unexpected date group');
  if (await sameDateGroup.locator('.todo-minimal-task-list').count() !== 1) throw new Error('Date group does not use one shared task container');
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
  const editor = page.getByRole('dialog', { name: '编辑任务' });
  await editor.waitFor();
  await shot(page, 'todo-desktop-edit.png');
  await editor.getByRole('textbox', { name: '任务内容' }).fill('更新后的任务');
  const movedDate = await page.evaluate(() => { const date = new Date(); date.setDate(date.getDate() + 3); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; });
  await editor.getByLabel('任务日期').fill(movedDate);
  await editor.getByLabel('任务时间').fill('14:30');
  await editor.getByLabel('备注').fill('浏览器验证的任务备注');
  await editor.getByLabel('添加标签').fill('运营');
  await editor.getByRole('button', { name: '添加', exact: true }).click();
  await editor.getByLabel('添加子任务').fill('整理主图');
  await editor.getByRole('button', { name: '添加子任务' }).click();
  await editor.getByLabel('添加子任务').fill('导出图片');
  await editor.getByRole('button', { name: '添加子任务' }).click();
  await page.setViewportSize({ width: 390, height: 360 });
  const editMetrics = await editor.evaluate((element) => {
    const fields = element.querySelector('.todo-minimal-editor-fields');
    const save = element.querySelector('footer button[type="submit"]');
    const box = save?.getBoundingClientRect();
    return { scrollHeight: fields?.scrollHeight ?? 0, clientHeight: fields?.clientHeight ?? 0, saveBottom: box?.bottom ?? Infinity, viewportHeight: window.innerHeight };
  });
  if (editMetrics.scrollHeight <= editMetrics.clientHeight || editMetrics.saveBottom > editMetrics.viewportHeight) throw new Error(`Task editor does not scroll with a reachable save action in a keyboard-sized viewport: ${JSON.stringify(editMetrics)}`);
  await page.setViewportSize({ width: 1440, height: 900 });
  await editor.getByRole('button', { name: '保存' }).click();
  await editor.waitFor({ state: 'detached' });
  await page.getByRole('button', { name: '完成任务：更新后的任务' }).waitFor();
  await page.getByText('14:30', { exact: true }).waitFor();
  await page.getByText('运营', { exact: true }).waitFor();
  const subtaskProgress = page.getByRole('button', { name: /展开子任务：更新后的任务，0\/2/ });
  await subtaskProgress.waitFor();
  await subtaskProgress.click();
  await page.getByRole('button', { name: '完成子任务：整理主图' }).click();
  await page.getByRole('button', { name: /收起子任务：更新后的任务，1\/2/ }).waitFor();

  await page.getByRole('button', { name: '按日期' }).click();
  await page.getByRole('button', { name: '回到今天' }).waitFor();
  const selectedDateHeading = await page.locator('.todo-minimal-summary time').getAttribute('datetime');
  await swipe(page, '.todo-minimal-task-area', 290, 340, 130, 340);
  await page.waitForFunction((previous) => document.querySelector('.todo-minimal-summary time')?.getAttribute('datetime') !== previous, selectedDateHeading);
  await swipe(page, '.todo-minimal-task-area', 130, 340, 290, 340);
  await page.waitForFunction((previous) => document.querySelector('.todo-minimal-summary time')?.getAttribute('datetime') === previous, selectedDateHeading);
  await swipe(page, '.todo-minimal-task-area', 200, 300, 202, 420);
  if (await page.locator('.todo-minimal-summary time').getAttribute('datetime') !== selectedDateHeading) throw new Error('Vertical scrolling changed the selected date');
  await shot(page, 'todo-desktop-date-swipe.png');

  const personalSpaceToggleBounds = await page.getByRole('button', { name: '进入情侣专区' }).boundingBox();
  await page.getByRole('button', { name: '进入情侣专区' }).click();
  await waitForSpace(page, 'couple');
  const coupleSpaceToggleBounds = await page.getByRole('button', { name: '返回个人待办' }).boundingBox();
  if (!personalSpaceToggleBounds || !coupleSpaceToggleBounds || Math.abs(personalSpaceToggleBounds.x - coupleSpaceToggleBounds.x) > 1 || Math.abs(personalSpaceToggleBounds.y - coupleSpaceToggleBounds.y) > 1 || personalSpaceToggleBounds.width !== coupleSpaceToggleBounds.width || personalSpaceToggleBounds.height !== coupleSpaceToggleBounds.height) throw new Error('Personal and couple space toggles do not share the same upper-right position and size');
  await page.getByText('仅保存在此设备').waitFor();
  if (await page.locator('.couple-card-body').count() !== 0) throw new Error('A fresh couple board should not contain demo items');
  const coupleDate = await page.evaluate(() => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; });
  await addCoupleItem(page, '一起散步');
  await addCoupleItem(page, '在家看电影');

  await page.getByRole('button', { name: '一起散步', exact: true }).click();
  await page.getByRole('button', { name: '编辑：一起散步', exact: true }).click();
  const coupleEditor = page.locator('.couple-editor-page');
  await coupleEditor.getByRole('textbox', { name: '事项标题' }).fill('周末一起散步');
  await coupleEditor.getByLabel('安排日期').fill(coupleDate);
  await coupleEditor.getByLabel('安排时间').fill('18:30');
  await coupleEditor.getByRole('textbox', { name: '备注' }).fill('带上相机');
  await coupleEditor.getByRole('textbox', { name: '新建情侣标签' }).fill('周末');
  await coupleEditor.getByRole('button', { name: '添加标签' }).click();
  await coupleEditor.getByRole('button', { name: '周末' }).waitFor();
  await coupleEditor.getByRole('button', { name: '保存' }).click();
  await coupleCard(page, '周末一起散步').waitFor();

  await addDetailedCoupleItem(page, { title: '周末野餐', date: coupleDate, time: '12:00', tag: '户外', note: '带上野餐垫' });
  const outdoorTag = page.getByRole('button', { name: '户外', exact: true });
  const tagFontSize = await outdoorTag.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  if (tagFontSize < 11) throw new Error(`Couple tag text is too small (${tagFontSize}px)`);
  await outdoorTag.click();
  if (await page.locator('.couple-card-body').count() !== 1) throw new Error('Selecting a couple tag did not filter cards');
  await page.getByRole('button', { name: '周末', exact: true }).click();
  if (await page.locator('.couple-card-body').count() !== 2) throw new Error('Multiple couple tags should use OR filtering');
  const visibleCoupleCount = await page.locator('.couple-card-body').count();
  const filteredColumnCount = await page.locator('.couple-column-title small').evaluateAll((nodes) => nodes.reduce((sum, node) => sum + Number(node.textContent), 0));
  if (visibleCoupleCount !== filteredColumnCount) throw new Error('Couple column counts do not match filtered cards');
  await outdoorTag.click();
  await page.getByRole('button', { name: '周末', exact: true }).click();
  if (await page.locator('.couple-card-body').count() !== 3) throw new Error('Clearing tags should show every open couple item');

  const movieCard = coupleCard(page, '在家看电影');
  await movieCard.focus();
  await movieCard.press('Enter');
  await page.getByRole('button', { name: '编辑：在家看电影' }).waitFor();
  if (await movieCard.getAttribute('aria-expanded') !== 'true') throw new Error('Tapping a couple card did not expand it');
  await page.keyboard.press('Tab');
  if (await page.evaluate(() => document.activeElement?.getAttribute('aria-label')) !== '完成：在家看电影') throw new Error('Keyboard focus did not reach the complete action');
  await page.keyboard.press('Tab');
  if (await page.evaluate(() => document.activeElement?.getAttribute('aria-label')) !== '编辑：在家看电影') throw new Error('Keyboard focus did not reach the edit action');
  await page.keyboard.press('Enter');
  await page.locator('.couple-editor-page').waitFor();
  await page.getByRole('button', { name: '返回' }).click();
  await movieCard.waitFor();
  const movieBounds = await movieCard.boundingBox();
  if (!movieBounds) throw new Error('The unplanned couple card is not visible');
  const beforeSmallMove = (await readCoupleItems(page)).find((item) => item.title === '在家看电影');
  await page.mouse.move(movieBounds.x + movieBounds.width / 2, movieBounds.y + movieBounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(movieBounds.x + movieBounds.width / 2 + 3, movieBounds.y + movieBounds.height / 2 + 3);
  await page.mouse.up();
  if (await movieCard.getAttribute('aria-expanded') !== 'true') throw new Error('A short pointer movement should act as a tap, not a drag');
  if ((await readCoupleItems(page)).find((item) => item.title === '在家看电影')?.revision !== beforeSmallMove?.revision) throw new Error('A pointer movement below the drag threshold changed the task');
  await movieCard.click();
  const invalidTarget = await page.locator('.couple-header').boundingBox();
  if (!invalidTarget) throw new Error('The couple header is not visible');
  const beforeInvalidDrop = (await readCoupleItems(page)).find((item) => item.title === '在家看电影');
  await page.mouse.move(movieBounds.x + movieBounds.width / 2, movieBounds.y + movieBounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(invalidTarget.x + invalidTarget.width / 2, invalidTarget.y + invalidTarget.height / 2, { steps: 8 });
  await page.mouse.up();
  if ((await readCoupleItems(page)).find((item) => item.title === '在家看电影')?.revision !== beforeInvalidDrop?.revision) throw new Error('Dropping outside a valid column changed the task');
  await dragCoupleCard(page, '在家看电影', '[data-couple-drop-target="planned"]');
  await waitForCoupleItem(page, '在家看电影', { scheduledDate: coupleDate });
  if ((await readCoupleItems(page)).find((item) => item.title === '在家看电影')?.scheduledTime !== null) throw new Error('Scheduling by drop should clear the old time');
  await dragCoupleCard(page, '在家看电影', '[data-couple-drop-target="unplanned"]');
  await waitForCoupleItem(page, '在家看电影', { scheduledDate: null });
  if ((await readCoupleItems(page)).find((item) => item.title === '在家看电影')?.scheduledTime !== null) throw new Error('Unplanning did not clear the scheduled time');

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
  await page.reload();
  await page.getByRole('heading', { name: '个人待办', exact: true }).waitFor();
  await page.getByRole('button', { name: '进入情侣专区' }).click();
  await waitForSpace(page, 'couple');
  for (const title of ['周末一起散步', '在家看电影', '周末野餐']) await coupleCard(page, title).waitFor();
  const reloadItems = await readCoupleItems(page);
  const reloadedDetail = reloadItems.find((item) => item.title === '周末野餐');
  if (!reloadedDetail || reloadedDetail.scheduledTime !== '12:00' || reloadedDetail.note !== '带上野餐垫' || reloadedDetail.tags.length !== 1) throw new Error('Detailed couple data did not persist after reload');
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
  const periodRegion = page.getByRole('region', { name: '小月历', exact: true });
  await periodRegion.waitFor();
  await page.getByRole('heading', { name: '今天', exact: true }).waitFor();
  await page.getByRole('button', { name: '记录经期开始' }).click();
  await waitForPeriodCount(page, 1);
  await page.getByRole('status').getByRole('button', { name: '撤销' }).click();
  await waitForPeriodCount(page, 0);
  await page.getByRole('button', { name: '记录经期开始' }).click();
  await waitForPeriodCount(page, 1);
  await page.getByRole('button', { name: '取消这段记录' }).click();
  await waitForPeriodCount(page, 0);
  await page.getByRole('status').getByRole('button', { name: '撤销' }).click();
  await waitForPeriodCount(page, 1);
  const yesterday = await page.evaluate(() => { const date = new Date(); date.setDate(date.getDate() - 1); return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`; });
  await page.locator(`.period-day[aria-label^="${yesterday}"]`).click();
  await page.getByRole('heading', { name: yesterday, exact: true }).waitFor();
  await page.getByRole('button', { name: '记录经期开始' }).click();
  const backfillDialog = page.getByRole('dialog', { name: '补录历史经期' });
  await backfillDialog.waitFor();
  await backfillDialog.getByRole('button', { name: '补录记录' }).click();
  await waitForPeriodCount(page, 2);
  await page.getByRole('button', { name: '周期统计' }).click();
  await page.getByRole('heading', { name: '周期统计' }).waitFor();
  if (await page.getByText('还没有实际经期记录').count()) throw new Error('A real Period entry was not included in the statistics view');
  const firstHistoryRow = page.locator('.period-history-item').first();
  const recordLabel = await firstHistoryRow.locator('strong').innerText();
  await firstHistoryRow.getByRole('button', { name: /^编辑/ }).click();
  const editDialog = page.getByRole('dialog', { name: '编辑经期记录' });
  await editDialog.waitFor();
  const yearPicker = editDialog.getByRole('region', { name: '选择开始日期' }).getByLabel('选择年份');
  const currentYear = await page.evaluate(() => String(new Date().getFullYear()));
  await yearPicker.selectOption('1900');
  await yearPicker.selectOption(currentYear);
  if (await yearPicker.inputValue() !== currentYear) throw new Error('The date picker could not return to the current year after visiting 1900');
  await editDialog.getByRole('button', { name: '保存记录' }).click();
  await page.getByText(recordLabel, { exact: true }).waitFor();
  await page.getByRole('button', { name: '返回日历' }).click();
  await page.getByRole('heading', { name: '小月历', exact: true }).waitFor();
  await shot(page, 'period-desktop-calendar.png');
  await page.getByRole('button', { name: '小月历设置' }).click();
  await page.getByRole('heading', { name: '小月历设置' }).waitFor();
  await page.getByLabel('参考周期长度').fill('29');
  await page.getByRole('button', { name: '保存参数' }).click();
  await page.getByRole('status').filter({ hasText: '周期参数已保存' }).waitFor();
  await page.getByLabel('仅保存在本机').fill('synthetic browser memo');
  await page.getByRole('button', { name: '保存备忘' }).click();
  await page.getByRole('status').filter({ hasText: '关怀备忘已保存' }).waitFor();
  await page.getByRole('button', { name: '设置 PIN' }).click();
  const pinDialog = page.getByRole('dialog', { name: '小月历隐私锁' });
  await pinDialog.getByLabel('新 PIN（4–12 位数字）').fill('2468');
  await pinDialog.getByLabel('再次输入 PIN').fill('2468');
  await pinDialog.getByRole('button', { name: '设置 PIN' }).click();
  await page.getByText('小月历 PIN 已开启').waitFor();
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); });
  await page.getByRole('heading', { name: '小月历已锁定' }).waitFor();
  await page.getByRole('button', { name: '输入 PIN' }).click();
  await page.getByRole('dialog', { name: '小月历隐私锁' }).getByLabel('PIN').fill('2468');
  await page.getByRole('dialog', { name: '小月历隐私锁' }).getByRole('button', { name: '解锁' }).click();
  await page.getByRole('heading', { name: '小月历设置' }).waitFor();
  await desktopNav.getByRole('button', { name: '纪念日' }).click();
  await page.getByRole('region', { name: '纪念日', exact: true }).waitFor();
  await desktopNav.getByRole('button', { name: '待办' }).click();
  await page.getByRole('heading', { name: '个人待办', exact: true }).waitFor();
  await desktopNav.getByRole('button', { name: '小月历' }).click();
  await page.getByRole('heading', { name: '小月历已锁定' }).waitFor();
  await page.getByRole('button', { name: '输入 PIN' }).click();
  const unlockDialog = page.getByRole('dialog', { name: '小月历隐私锁' });
  await unlockDialog.getByLabel('PIN').fill('2468');
  await unlockDialog.getByRole('button', { name: '解锁' }).click();
  await page.getByRole('heading', { name: '小月历设置' }).waitFor();
  await page.getByRole('button', { name: '导出备份' }).click();
  const exportDialog = page.getByRole('dialog', { name: '导出加密备份' });
  await exportDialog.getByLabel('备份密码').fill('synthetic-browser-pass');
  await exportDialog.getByLabel('确认密码').fill('synthetic-browser-pass');
  const [backupDownload] = await Promise.all([page.waitForEvent('download'), exportDialog.getByRole('button', { name: '导出加密 .xyl' }).click()]);
  const backupPath = await backupDownload.path();
  if (!backupPath) throw new Error('The encrypted Period backup was not available for re-import verification');
  await page.getByRole('button', { name: '选择文件' }).waitFor();
  const storesBeforeImport = JSON.stringify(await readNonPeriodStores(page));
  await page.getByRole('button', { name: '选择文件' }).click();
  const importDialog = page.getByRole('dialog', { name: '从旧小月历导入' });
  await importDialog.getByLabel('备份文件').setInputFiles(backupPath);
  const periodsBeforeWrongPassword = JSON.stringify(await readPeriodRecords(page));
  await importDialog.getByLabel('备份密码').fill('wrong-synthetic-pass');
  await importDialog.getByRole('button', { name: '解密并预览' }).click();
  await importDialog.getByRole('alert').filter({ hasText: '密码不正确' }).waitFor();
  if (JSON.stringify(await readPeriodRecords(page)) !== periodsBeforeWrongPassword) throw new Error('A wrong backup password changed Period records');
  await waitForPeriodCount(page, 2);
  await importDialog.getByLabel('备份密码').fill('synthetic-browser-pass');
  await importDialog.getByRole('button', { name: '解密并预览' }).click();
  await importDialog.getByText('2 段真实记录').waitFor();
  const confirmImport = importDialog.getByLabel('我了解并确认替换小月历数据');
  await confirmImport.check();
  await importDialog.getByRole('button', { name: '确认替换小月历数据' }).click();
  await waitForPeriodCount(page, 2);
  if (JSON.stringify(await readNonPeriodStores(page)) !== storesBeforeImport) throw new Error('Period backup import altered Todo, Couple, settings, or module data');
  await page.reload();
  await page.getByRole('heading', { name: '小月历已锁定' }).waitFor();
  await page.getByRole('button', { name: '输入 PIN' }).click();
  await page.getByRole('dialog', { name: '小月历隐私锁' }).getByLabel('PIN').fill('2468');
  await page.getByRole('dialog', { name: '小月历隐私锁' }).getByRole('button', { name: '解锁' }).click();
  await page.getByRole('heading', { name: '小月历', exact: true }).waitFor();
  await waitForPeriodCount(page, 2);
  const restoredPeriodSettings = await readPeriodSettings(page);
  if (restoredPeriodSettings.referenceCycleLength !== 29 || restoredPeriodSettings.careMemo !== 'synthetic browser memo') throw new Error('Period settings did not persist through encrypted backup restore and page reload');
  await desktopNav.getByRole('button', { name: '纪念日' }).click();
  await page.getByRole('region', { name: '纪念日', exact: true }).waitFor();
  await desktopNav.getByRole('button', { name: '待办' }).click();
  await page.getByRole('heading', { name: '个人待办', exact: true }).waitFor();
  await desktopNav.getByRole('button', { name: '小月历' }).click();
  await page.getByRole('heading', { name: '小月历已锁定' }).waitFor();
  await page.getByRole('button', { name: '输入 PIN' }).click();
  await page.getByRole('dialog', { name: '小月历隐私锁' }).getByLabel('PIN').fill('2468');
  await page.getByRole('dialog', { name: '小月历隐私锁' }).getByRole('button', { name: '解锁' }).click();
  await page.getByRole('heading', { name: '小月历', exact: true }).waitFor();
  await desktopNav.getByRole('button', { name: '纪念日' }).click();
  await page.getByRole('region', { name: '纪念日', exact: true }).waitFor();
  await desktopNav.getByRole('button', { name: '设置' }).click();
  await page.getByRole('region', { name: '设置' }).waitFor();
  await page.locator('.settings-page').getByRole('button', { name: '返回' }).click();
  await page.getByRole('region', { name: '纪念日', exact: true }).waitFor();
  await desktopNav.getByRole('button', { name: '待办' }).click();
  if (await page.getByRole('button', { name: '回到今天' }).count()) await page.getByRole('button', { name: '回到今天' }).click();
  await page.getByRole('heading', { name: '个人待办', exact: true }).waitFor();

  await waitForLastModule(page, 'todo');
  await page.reload();
  await page.getByRole('heading', { name: '个人待办', exact: true }).waitFor();
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
  await page.context().setOffline(true);
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: '个人待办', exact: true }).waitFor();
    await desktopNav.getByRole('button', { name: '小月历' }).click();
    await page.getByRole('heading', { name: '小月历已锁定' }).waitFor();
  } finally { await page.context().setOffline(false); }
  const storesBeforeForgottenPinClear = JSON.stringify(await readNonPeriodStores(page));
  await page.getByRole('button', { name: '忘记 PIN？清除小月历数据' }).click();
  const clearPeriodDialog = page.getByRole('dialog', { name: '清除小月历数据？' });
  await clearPeriodDialog.getByLabel('我确认清除小月历数据').check();
  await clearPeriodDialog.getByRole('button', { name: '清除小月历' }).click();
  await waitForPeriodCount(page, 0);
  if ((await readPeriodSettings(page)).appLock.enabled) throw new Error('Clearing Period data from the lock screen did not reset its PIN');
  if (JSON.stringify(await readNonPeriodStores(page)) !== storesBeforeForgottenPinClear) throw new Error('Clearing Period data altered Todo, Couple, settings, or module data');

  await desktopNav.getByRole('button', { name: '纪念日' }).click();
  await page.getByRole('region', { name: '纪念日', exact: true }).waitFor();
  await page.getByRole('heading', { name: '还没有纪念日' }).waitFor();
  const foundationBeforeAnniversary = JSON.stringify(await readOtherFoundationStores(page));
  await page.getByRole('button', { name: '新建纪念日' }).click();
  await page.getByLabel('名称').fill('浏览器年度纪念日');
  await page.getByLabel('日期', { exact: true }).fill('2024-02-29');
  await page.getByLabel('备注').fill('合成数据：周年测试');
  const yearlyDayToggle = page.getByRole('checkbox', { name: '天数纪念' });
  if (await yearlyDayToggle.isChecked()) throw new Error('New Anniversary records should default day milestones off');
  await yearlyDayToggle.check();
  const anniversaryTodayKey = await page.evaluate(() => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; });
  const anniversaryCurrentDay = dateOrdinal(anniversaryTodayKey) - dateOrdinal('2024-02-29') + 1;
  if (anniversaryCurrentDay < 1) throw new Error('Browser Anniversary test date unexpectedly precedes its synthetic record');
  const enteredMilestoneDays = [500, 520, 600, 666, 1000, 1314, 520, anniversaryCurrentDay + 10];
  const expectedMilestoneDays = [...new Set(enteredMilestoneDays)].sort((left, right) => left - right);
  const milestoneInput = page.getByRole('spinbutton', { name: '添加天数节点' });
  for (const day of enteredMilestoneDays) {
    await milestoneInput.fill(String(day));
    await page.getByRole('button', { name: '＋添加' }).click();
  }
  await page.getByRole('button', { name: '保存' }).click();
  await page.getByRole('button', { name: '查看最近纪念日：浏览器年度纪念日' }).waitFor();
  await page.getByRole('button', { name: '查看最近纪念日：浏览器年度纪念日' }).click();
  await page.getByRole('heading', { name: '纪念日详情' }).waitFor();
  const yearlyBeforeEdit = (await readAnniversaryRecords(page)).find((record) => record.title === '浏览器年度纪念日');
  if (!yearlyBeforeEdit || yearlyBeforeEdit.date !== '2024-02-29' || yearlyBeforeEdit.recurrence !== 'yearly' || !yearlyBeforeEdit.milestoneEnabled || JSON.stringify(yearlyBeforeEdit.milestoneDays) !== JSON.stringify(expectedMilestoneDays)) throw new Error(`Anniversary yearly record or its custom milestones did not persist correctly: ${JSON.stringify(yearlyBeforeEdit)}`);
  const nextMilestoneDay = expectedMilestoneDays.find((day) => day >= anniversaryCurrentDay);
  const milestoneSummary = await page.getByRole('region', { name: '天数纪念' }).innerText();
  if (!milestoneSummary.includes(`相伴第 ${anniversaryCurrentDay} 天`)) throw new Error(`Anniversary current day count is incorrect: ${milestoneSummary}`);
  if (nextMilestoneDay === undefined) throw new Error('Browser test did not configure a future milestone');
  const expectedMilestoneDate = addCalendarDateDays('2024-02-29', nextMilestoneDay - 1);
  const milestoneNextEvent = (await page.locator('.anniversary-milestone-next').innerText()).replace(/\s+/g, '');
  const expectedMilestoneCountdown = nextMilestoneDay === anniversaryCurrentDay ? '就是今天' : `还有 ${nextMilestoneDay - anniversaryCurrentDay} 天`;
  if (!milestoneNextEvent.includes(`第 ${nextMilestoneDay} 天`.replace(/\s+/g, '')) || !milestoneNextEvent.includes(expectedMilestoneCountdown.replace(/\s+/g, '')) || !milestoneNextEvent.includes(formatDateKeyForBrowser(expectedMilestoneDate))) throw new Error(`Anniversary next milestone date or countdown is incorrect: ${milestoneNextEvent}`);
  await shot(page, 'anniversary-desktop-detail.png');
  await page.getByRole('button', { name: '编辑' }).click();
  await page.getByLabel('名称').fill('更新后的年度纪念日');
  await page.getByRole('button', { name: '删除 520 天节点' }).click();
  await page.getByRole('button', { name: '保存' }).click();
  await page.getByRole('heading', { name: '纪念日详情' }).waitFor();
  const yearlyAfterEdit = (await readAnniversaryRecords(page)).find((record) => record.title === '更新后的年度纪念日');
  const editedMilestoneDays = expectedMilestoneDays.filter((day) => day !== 520);
  if (!yearlyAfterEdit || yearlyAfterEdit.id !== yearlyBeforeEdit.id || yearlyAfterEdit.createdAt !== yearlyBeforeEdit.createdAt || JSON.stringify(yearlyAfterEdit.milestoneDays) !== JSON.stringify(editedMilestoneDays)) throw new Error('Anniversary edit changed the stable ID/time or did not remove the selected milestone');
  await page.getByRole('button', { name: '编辑' }).click();
  await page.getByRole('checkbox', { name: '天数纪念' }).uncheck();
  await page.getByRole('button', { name: '保存' }).click();
  await page.getByRole('heading', { name: '纪念日详情' }).waitFor();
  const milestonesWhenDisabled = (await readAnniversaryRecords(page)).find((record) => record.id === yearlyBeforeEdit.id);
  if (!milestonesWhenDisabled || milestonesWhenDisabled.milestoneEnabled || JSON.stringify(milestonesWhenDisabled.milestoneDays) !== JSON.stringify(editedMilestoneDays)) throw new Error('Disabling day milestones should hide the feature but retain its configured nodes');
  if (await page.getByRole('region', { name: '天数纪念' }).count()) throw new Error('Disabled day milestones remained visible in Anniversary detail');
  await page.getByRole('button', { name: '编辑' }).click();
  await page.getByRole('checkbox', { name: '天数纪念' }).check();
  await page.getByRole('button', { name: '保存' }).click();
  await page.getByRole('heading', { name: '纪念日详情' }).waitFor();
  const milestonesWhenReenabled = (await readAnniversaryRecords(page)).find((record) => record.id === yearlyBeforeEdit.id);
  if (!milestonesWhenReenabled?.milestoneEnabled || JSON.stringify(milestonesWhenReenabled.milestoneDays) !== JSON.stringify(editedMilestoneDays)) throw new Error('Re-enabling day milestones did not restore the retained nodes');
  await page.getByRole('button', { name: '返回' }).click();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await desktopNav.getByRole('button', { name: '纪念日' }).waitFor();
  await desktopNav.getByRole('button', { name: '纪念日' }).click();
  await page.getByRole('button', { name: '查看最近纪念日：更新后的年度纪念日' }).click();
  await page.getByRole('heading', { name: '纪念日详情' }).waitFor();
  if (!await page.getByRole('region', { name: '天数纪念' }).innerText().then((text) => text.includes(`相伴第 ${anniversaryCurrentDay} 天`))) throw new Error('Anniversary milestones did not survive a page refresh');
  await page.getByRole('button', { name: '返回' }).click();
  await page.getByRole('button', { name: '新建纪念日' }).click();
  await page.getByLabel('名称').fill('浏览器一次性日期');
  await page.getByLabel('日期', { exact: true }).fill('2099-01-01');
  await page.getByRole('radio', { name: /仅一次/ }).check();
  await page.getByRole('checkbox', { name: '天数纪念' }).check();
  for (const day of [1, 500]) {
    await page.getByRole('spinbutton', { name: '添加天数节点' }).fill(String(day));
    await page.getByRole('button', { name: '＋添加' }).click();
  }
  await page.getByRole('button', { name: '保存' }).click();
  const oneTimeWithMilestones = (await readAnniversaryRecords(page)).find((record) => record.title === '浏览器一次性日期');
  if (!oneTimeWithMilestones?.milestoneEnabled || JSON.stringify(oneTimeWithMilestones.milestoneDays) !== JSON.stringify([1, 500])) throw new Error('Once-only Anniversary records should also support independent day milestones');
  await page.getByRole('button', { name: '查看纪念日：浏览器一次性日期' }).click();
  await page.getByRole('heading', { name: '纪念日详情' }).waitFor();
  const futureMilestoneSummary = await page.getByRole('region', { name: '天数纪念' }).innerText();
  if (!futureMilestoneSummary.includes('纪念日尚未开始') || futureMilestoneSummary.includes('相伴第 -')) throw new Error(`A future Anniversary date showed an invalid negative day count: ${futureMilestoneSummary}`);
  await page.getByRole('button', { name: '返回' }).click();
  const expectationToday = anniversaryTodayKey;
  const expectationRecords = [
    { title: '期待周天数节点', date: addCalendarDateDays(expectationToday, -100), milestoneDays: [102, 104] },
    { title: '期待周周年事项', date: addCalendarDateDays(expectationToday, 3) },
    { title: '期待周单次事项', date: addCalendarDateDays(expectationToday, 6), recurrence: 'once' },
    { title: '期待周窗口外', date: addCalendarDateDays(expectationToday, 8), recurrence: 'once' }
  ];
  for (const event of expectationRecords) await createBrowserAnniversary(page, event);
  const expectationHero = page.getByRole('button', { name: '查看最近纪念日：期待周天数节点' });
  await expectationHero.waitFor();
  const expectationHeroText = await expectationHero.innerText();
  const expectationHeroCountdown = (await expectationHero.locator('.anniversary-countdown').innerText()).replace(/\s+/g, '');
  if (await expectationHero.locator('.anniversary-event-label').innerText() !== '第 102 天' || !expectationHeroText.includes(formatDateKeyForBrowser(addCalendarDateDays(expectationToday, 1))) || !expectationHeroCountdown.includes('还有1天')) throw new Error(`The nearest future milestone was not shown as the Anniversary Hero: ${expectationHeroText}`);
  const expectationWeek = page.getByRole('region', { name: '接下来这一周' });
  const expectationWeekText = await expectationWeek.innerText();
  if (!expectationWeekText.includes('第 104 天') || !expectationWeekText.includes('期待周周年事项') || !expectationWeekText.includes('期待周单次事项') || expectationWeekText.includes('期待周窗口外')) throw new Error(`The seven-day anchor week was not built from the expected candidates: ${expectationWeekText}`);
  const expectationWeekRange = `${formatMonthDayForBrowser(addCalendarDateDays(expectationToday, 1))} - ${formatMonthDayForBrowser(addCalendarDateDays(expectationToday, 7))}`;
  if (await expectationWeek.locator('.anniversary-week-range').innerText() !== expectationWeekRange) throw new Error(`The upcoming-week heading range is incorrect: ${await expectationWeek.locator('.anniversary-week-range').innerText()}`);
  if (await expectationWeek.getByRole('button').count() !== 3) throw new Error('The anchor week should contain its second milestone, same-day yearly event, and sixth-day once event');
  const sameDayMilestone = expectationWeek.getByRole('button', { name: '查看期待事项：期待周天数节点，第 104 天' });
  const sameDayYearly = expectationWeek.getByRole('button', { name: '查看期待事项：期待周周年事项，首次纪念日' });
  const expectedSharedDate = formatDateKeyForBrowser(addCalendarDateDays(expectationToday, 3));
  if (await sameDayMilestone.locator('.anniversary-week-date').innerText() !== expectedSharedDate) throw new Error('The milestone row did not show its node date');
  if (await sameDayYearly.locator('.anniversary-week-date').count() !== 0) throw new Error('The yearly event row should hide its date without leaving an empty date element');
  const onceWeekEvent = expectationWeek.getByRole('button', { name: '查看期待事项：期待周单次事项，一次' });
  if (await onceWeekEvent.locator('.anniversary-week-date').innerText() !== formatDateKeyForBrowser(addCalendarDateDays(expectationToday, 6))) throw new Error('The once-only event row did not show its date');
  const allAnniversaryRecords = page.getByRole('region', { name: '全部纪念日' });
  if (await allAnniversaryRecords.getByRole('button', { name: '查看纪念日：期待周周年事项' }).locator('.anniversary-record-date').count() !== 0) throw new Error('The yearly all-record row should hide its original date');
  if (await allAnniversaryRecords.getByRole('button', { name: '查看纪念日：期待周单次事项' }).locator('.anniversary-record-date').innerText() !== formatDateKeyForBrowser(addCalendarDateDays(expectationToday, 6))) throw new Error('The once-only all-record row should show its date');
  await expectationWeek.getByRole('button', { name: '查看期待事项：期待周周年事项，首次纪念日' }).click();
  if (await page.locator('.anniversary-detail-card h2').innerText() !== '期待周周年事项') throw new Error('Clicking a week event did not open its AnniversaryRecord detail');
  await page.getByRole('button', { name: '返回' }).click();
  for (const event of expectationRecords) {
    const recordCard = page.getByRole('button', { name: `查看纪念日：${event.title}` });
    await recordCard.click();
    await page.getByRole('button', { name: '删除' }).click();
    await page.getByRole('alertdialog', { name: '删除这条纪念日？' }).getByRole('button', { name: '确认删除' }).click();
    await recordCard.waitFor({ state: 'detached' });
  }
  await page.getByRole('button', { name: '查看最近纪念日：更新后的年度纪念日' }).waitFor();
  const browserOnceHeroDate = addCalendarDateDays(expectationToday, 1);
  await createBrowserAnniversary(page, { title: '首页单次事项', date: browserOnceHeroDate, recurrence: 'once' });
  const onceHero = page.getByRole('button', { name: '查看最近纪念日：首页单次事项' });
  await onceHero.waitFor();
  if (await onceHero.locator('.anniversary-hero-date').innerText() !== formatDateKeyForBrowser(browserOnceHeroDate) || await onceHero.locator('.anniversary-event-label').innerText() !== '一次') throw new Error('The once-only Hero did not show its event label and date');
  await onceHero.click();
  await page.getByRole('heading', { name: '纪念日详情' }).waitFor();
  if (await page.locator('.anniversary-detail-card h2').innerText() !== '首页单次事项') throw new Error('Clicking the once-only Hero did not open its record detail');
  await page.getByRole('button', { name: '返回' }).click();
  await page.getByRole('button', { name: '查看纪念日：首页单次事项' }).click();
  await page.getByRole('button', { name: '删除' }).click();
  await page.getByRole('alertdialog', { name: '删除这条纪念日？' }).getByRole('button', { name: '确认删除' }).click();
  const browserYearlyHeroDate = addCalendarDateDays(expectationToday, 2);
  await createBrowserAnniversary(page, { title: '首页周年事项', date: browserYearlyHeroDate });
  const yearlyHero = page.getByRole('button', { name: '查看最近纪念日：首页周年事项' });
  await yearlyHero.waitFor();
  if (await yearlyHero.locator('.anniversary-hero-date').innerText() !== formatDateKeyForBrowser(browserYearlyHeroDate) || await yearlyHero.locator('.anniversary-event-label').innerText() !== '首次纪念日') throw new Error('The yearly Hero did not show its event label and occurrence date');
  await yearlyHero.click();
  await page.getByRole('heading', { name: '纪念日详情' }).waitFor();
  if (await page.locator('.anniversary-detail-card h2').innerText() !== '首页周年事项') throw new Error('Clicking the yearly Hero did not open its record detail');
  await page.getByRole('button', { name: '返回' }).click();
  await page.getByRole('button', { name: '查看纪念日：首页周年事项' }).click();
  await page.getByRole('button', { name: '删除' }).click();
  await page.getByRole('alertdialog', { name: '删除这条纪念日？' }).getByRole('button', { name: '确认删除' }).click();
  await page.getByRole('button', { name: '查看最近纪念日：更新后的年度纪念日' }).waitFor();
  await shot(page, 'anniversary-desktop-home.png');
  await page.getByRole('button', { name: '查看最近纪念日：更新后的年度纪念日' }).click();
  await page.getByRole('button', { name: '删除' }).click();
  await page.getByRole('alertdialog', { name: '删除这条纪念日？' }).waitFor();
  await page.getByRole('button', { name: '保留' }).click();
  await page.getByRole('heading', { name: '纪念日详情' }).waitFor();
  await page.getByRole('button', { name: '删除' }).click();
  await page.getByRole('button', { name: '确认删除' }).click();
  await page.getByRole('button', { name: '查看最近纪念日：浏览器一次性日期' }).waitFor();
  if ((await readAnniversaryRecords(page)).some((record) => record.id === yearlyBeforeEdit.id)) throw new Error('Confirmed Anniversary deletion left the selected record in storage');
  if (JSON.stringify(await readOtherFoundationStores(page)) !== foundationBeforeAnniversary) throw new Error('Anniversary CRUD changed Todo, Couple, Period, Settings, or module data');

  await page.getByRole('button', { name: '查看纪念日：浏览器一次性日期' }).click();
  await page.getByRole('heading', { name: '纪念日详情' }).waitFor();
  await page.getByRole('button', { name: '删除' }).click();
  await desktopNav.getByRole('button', { name: '待办' }).click();
  await page.getByRole('heading', { name: '个人待办', exact: true }).waitFor();
  if (await page.getByRole('alertdialog').count()) throw new Error('Switching modules left an Anniversary confirmation over Todo');
  await desktopNav.getByRole('button', { name: '纪念日' }).click();
  await page.getByRole('heading', { name: '纪念日详情' }).waitFor();
  if (await page.getByRole('alertdialog').count()) throw new Error('Returning to Anniversary restored a stale delete confirmation');
  if (pageErrors.length) throw new Error(`Browser page errors: ${pageErrors.join('; ')}`);
  await desktop.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(url);
  await mobilePage.getByRole('heading', { name: '个人待办', exact: true }).waitFor();
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
  await mobilePage.getByRole('button', { name: '编辑任务：手机上的任务' }).tap();
  const mobileEditor = mobilePage.getByRole('dialog', { name: '编辑任务' });
  await mobileEditor.waitFor();
  await mobilePage.setViewportSize({ width: 390, height: 320 });
  await mobileEditor.evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => undefined)));
  });
  const mobileEditorMetrics = await mobileEditor.evaluate((element) => {
    const fields = element.querySelector('.todo-minimal-editor-fields');
    const save = element.querySelector('footer button[type="submit"]')?.getBoundingClientRect();
    return { overflowY: fields ? window.getComputedStyle(fields).overflowY : '', scrollHeight: fields?.scrollHeight ?? 0, clientHeight: fields?.clientHeight ?? 0, saveBottom: save?.bottom ?? Infinity, viewportHeight: window.innerHeight };
  });
  if (mobileEditorMetrics.overflowY !== 'auto' || mobileEditorMetrics.scrollHeight <= mobileEditorMetrics.clientHeight || mobileEditorMetrics.saveBottom > mobileEditorMetrics.viewportHeight) throw new Error(`Mobile task editor does not preserve scrolling and visible save controls: ${JSON.stringify(mobileEditorMetrics)}`);
  await mobileEditor.getByRole('button', { name: '取消编辑' }).tap();
  await mobilePage.setViewportSize({ width: 390, height: 844 });
  await mobilePage.getByRole('button', { name: '进入情侣专区' }).waitFor();
  await mobilePage.evaluate(() => {
    const selectors = '.todo-minimal-header h1,.todo-minimal-summary,.todo-minimal-date-group h2,.todo-minimal-task-title,.todo-minimal-task-meta,.todo-minimal-completed-toggle,.todo-minimal-empty';
    for (const element of document.querySelectorAll(`.todo-personal-minimal ${selectors}`)) {
      const currentSize = Number.parseFloat(getComputedStyle(element).fontSize);
      if (Number.isFinite(currentSize)) element.style.setProperty('font-size', `${currentSize * 1.25}px`, 'important');
    }
  });
  if (await mobilePage.evaluate(() => document.documentElement.scrollWidth) > 390) throw new Error('Personal Todo overflows at 390px with increased text sizing');
  await mobilePage.getByRole('button', { name: '进入情侣专区' }).tap();
  await waitForSpace(mobilePage, 'couple');
  const mobileCoupleDate = await mobilePage.evaluate(() => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; });
  await addDetailedCoupleItem(mobilePage, { title: '手机上的情侣事项', date: mobileCoupleDate, time: '10:30', tag: '手机计划', note: '手机端详细添加' }, true);
  await coupleCard(mobilePage, '手机上的情侣事项').waitFor();
  const mobileTag = mobilePage.getByRole('button', { name: '手机计划', exact: true });
  const mobileTagSize = await mobileTag.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  if (mobileTagSize < 11) throw new Error(`Mobile couple tag text is too small (${mobileTagSize}px)`);
  await mobileTag.tap();
  if (await mobilePage.locator('.couple-card-body').count() !== 1) throw new Error('Mobile couple tag selection did not filter the card');
  await mobileTag.tap();
  for (const width of [320, 360, 390, 430]) {
    await mobilePage.setViewportSize({ width, height: 844 });
    const scrollWidth = await mobilePage.evaluate(() => document.documentElement.scrollWidth);
    if (scrollWidth > width) throw new Error(`Couple board has horizontal overflow at ${width}px (${scrollWidth}px)`);
    const cardWidth = await coupleCard(mobilePage, '手机上的情侣事项').evaluate((element) => element.getBoundingClientRect().width);
    if (cardWidth < 120) throw new Error(`Couple card is too narrow at ${width}px (${cardWidth}px)`);
  }
  await mobilePage.setViewportSize({ width: 320, height: 844 });
  const textScaleStyle = await mobilePage.addStyleTag({ content: '.couple-card-body>strong,.couple-card-tags span,.couple-card-time,.couple-card-note,.couple-tags button,.couple-filter-label,.couple-empty{font-size:calc(1em * 1.25)!important}' });
  if (await mobilePage.evaluate(() => document.documentElement.scrollWidth) > 320) throw new Error('Couple board overflows at 320px with increased text sizing');
  await textScaleStyle.evaluate((element) => element.remove());
  await mobilePage.setViewportSize({ width: 390, height: 844 });
  await mobilePage.getByRole('button', { name: '新增情侣事项' }).tap();
  const quickCoupleDialog = mobilePage.getByRole('dialog', { name: '快速添加小事' });
  await quickCoupleDialog.getByRole('button', { name: '详细' }).tap();
  const smallDetailDialog = mobilePage.getByRole('dialog', { name: '详细添加小事' });
  await smallDetailDialog.getByRole('textbox', { name: '事项标题' }).fill('临时长表单');
  await mobilePage.setViewportSize({ width: 390, height: 320 });
  const sheetMetrics = await smallDetailDialog.evaluate((element) => ({ overflowY: getComputedStyle(element).overflowY, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight, paddingBottom: Number.parseFloat(getComputedStyle(element).paddingBottom) }));
  if (sheetMetrics.overflowY !== 'auto' || sheetMetrics.scrollHeight <= sheetMetrics.clientHeight) throw new Error(`Couple detail sheet did not scroll in a short keyboard-sized viewport: ${JSON.stringify(sheetMetrics)}`);
  if (sheetMetrics.paddingBottom < 16) throw new Error('Couple detail sheet has no bottom safe-area padding');
  await smallDetailDialog.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await smallDetailDialog.getByRole('button', { name: '添加', exact: true }).scrollIntoViewIfNeeded();
  await smallDetailDialog.getByRole('button', { name: '关闭' }).last().tap();
  await smallDetailDialog.waitFor({ state: 'detached' });
  await mobilePage.setViewportSize({ width: 390, height: 844 });
  await shot(mobilePage, 'todo-mobile-couple-board.png');
  const mobileCard = coupleCard(mobilePage, '手机上的情侣事项');
  await mobileCard.evaluate((element) => {
    const box = element.getBoundingClientRect();
    element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 31, pointerType: 'touch', button: 0, clientX: box.x + 16, clientY: box.y + 18 }));
    window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 31, pointerType: 'touch', clientX: box.x + 18, clientY: box.y + 46 }));
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 31, pointerType: 'touch', clientX: box.x + 18, clientY: box.y + 46 }));
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  if (await mobileCard.getAttribute('aria-expanded') !== 'false') throw new Error('A vertical touch scroll expanded or dragged the couple card');
  await mobileCard.dispatchEvent('pointerdown', { bubbles: true, pointerId: 32, pointerType: 'touch', button: 0, clientX: 20, clientY: 20 });
  await mobilePage.waitForTimeout(340);
  const unplannedMobileBounds = await mobilePage.getByRole('region', { name: '未安排' }).boundingBox();
  if (!unplannedMobileBounds) throw new Error('The unplanned couple column is not visible on mobile');
  await mobilePage.evaluate((bounds) => {
    const x = bounds.x + bounds.width / 2;
    const y = bounds.y + bounds.height / 2;
    window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 32, pointerType: 'touch', clientX: x, clientY: y }));
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 32, pointerType: 'touch', clientX: x, clientY: y }));
  }, unplannedMobileBounds);
  await waitForCoupleItem(mobilePage, '手机上的情侣事项', { scheduledDate: null });
  if ((await readCoupleItems(mobilePage)).find((item) => item.title === '手机上的情侣事项')?.scheduledTime !== null) throw new Error('Mobile long-press unplanning did not clear time');
  await mobileCard.tap();
  await mobilePage.getByRole('button', { name: '完成：手机上的情侣事项' }).waitFor();
  await mobilePage.getByRole('button', { name: '完成：手机上的情侣事项' }).tap();
  await mobilePage.getByRole('button', { name: '撤销完成：手机上的情侣事项' }).tap();
  await coupleCard(mobilePage, '手机上的情侣事项').waitFor();
  await mobileTag.tap();
  await mobilePage.emulateMedia({ reducedMotion: 'reduce' });
  const mobileSpaceView = mobilePage.locator('.todo-module-root .todo-module-page');
  if (await mobileSpaceView.evaluate((element) => getComputedStyle(element).transitionDuration) !== '0s') throw new Error('Reduced-motion preference did not remove the space transition');
  await mobilePage.getByRole('button', { name: '返回个人待办' }).tap();
  await waitForSpace(mobilePage, 'personal');
  await mobilePage.getByRole('button', { name: '进入情侣专区' }).tap();
  await waitForSpace(mobilePage, 'couple');
  if (await mobileTag.getAttribute('aria-pressed') !== 'true') throw new Error('Repeated space switches discarded the selected couple filter');
  await mobilePage.getByRole('button', { name: '返回个人待办' }).tap();
  await waitForSpace(mobilePage, 'personal');
  await mobilePage.getByRole('button', { name: '进入情侣专区' }).tap();
  await waitForSpace(mobilePage, 'couple');
  await coupleCard(mobilePage, '手机上的情侣事项').waitFor();
  await mobilePage.getByRole('button', { name: '小月历' }).tap();
  await mobilePage.getByRole('heading', { name: '小月历', exact: true }).waitFor();
  for (const width of [320, 360, 390, 430]) {
    await mobilePage.setViewportSize({ width, height: 844 });
    const scrollWidth = await mobilePage.evaluate(() => document.documentElement.scrollWidth);
    if (scrollWidth > width) throw new Error(`Period calendar has horizontal overflow at ${width}px (${scrollWidth}px)`);
    const calendarWidth = await mobilePage.locator('.period-calendar-card').evaluate((element) => element.getBoundingClientRect().width);
    if (calendarWidth < width - 48) throw new Error(`Period calendar is too narrow at ${width}px (${calendarWidth}px)`);
  }
  await mobilePage.setViewportSize({ width: 320, height: 844 });
  const periodTextScale = await mobilePage.addStyleTag({ content: '.period-module h1,.period-module h2,.period-module button,.period-module p,.period-module span,.period-module label,.period-module small,.period-module strong{font-size:calc(1rem * 1.2)!important}' });
  if (await mobilePage.evaluate(() => document.documentElement.scrollWidth) > 320) throw new Error('Period calendar overflows at 320px with increased text sizing');
  const periodCalendar = mobilePage.locator('.period-calendar-card');
  const yesterdayOnMobile = await mobilePage.evaluate(() => { const date = new Date(); date.setDate(date.getDate() - 1); return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`; });
  const mobileDateButton = mobilePage.locator(`.period-day[aria-label^="${yesterdayOnMobile}"]`);
  await mobileDateButton.tap();
  await mobilePage.waitForFunction((expected) => document.querySelector('.period-day[aria-pressed="true"]')?.getAttribute('aria-label')?.startsWith(expected) && document.querySelector('.period-day-detail h2')?.textContent === expected, yesterdayOnMobile, { timeout: 3000 }).catch(async () => {
    const selected = await mobilePage.locator('.period-day[aria-pressed="true"]').getAttribute('aria-label');
    const detail = await mobilePage.locator('.period-day-detail h2').innerText();
    throw new Error(`Mobile date tap did not select ${yesterdayOnMobile}; selected=${selected}; detail=${detail}`);
  });
  await shot(mobilePage, 'period-mobile-calendar.png');
  const monthBeforeSwipe = await periodCalendar.locator('.period-calendar-heading h2').innerText();
  const calendarDays = mobilePage.locator('.period-days');
  await calendarDays.evaluate((element) => {
    const box = element.getBoundingClientRect();
    element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 61, pointerType: 'touch', isPrimary: true, button: 0, clientX: box.x + box.width * 0.75, clientY: box.y + box.height / 2 }));
    element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 61, pointerType: 'touch', isPrimary: true, button: 0, clientX: box.x + box.width * 0.25, clientY: box.y + box.height / 2 }));
  });
  await mobilePage.waitForFunction((before) => document.querySelector('.period-calendar-heading h2')?.textContent !== before, monthBeforeSwipe);
  const monthAfterSwipe = await periodCalendar.locator('.period-calendar-heading h2').innerText();
  const detailAfterHorizontalSwipe = await mobilePage.locator('.period-day-detail h2').innerText();
  await calendarDays.evaluate((element) => {
    const box = element.getBoundingClientRect();
    element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 62, pointerType: 'touch', isPrimary: true, button: 0, clientX: box.x + box.width / 2, clientY: box.y + box.height * 0.25 }));
    element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 62, pointerType: 'touch', isPrimary: true, button: 0, clientX: box.x + box.width / 2, clientY: box.y + box.height * 0.75 }));
  });
  if (await periodCalendar.locator('.period-calendar-heading h2').innerText() !== monthAfterSwipe) throw new Error('A vertical calendar gesture changed the month instead of remaining a scroll gesture');
  if (await mobilePage.locator('.period-day-detail h2').innerText() !== detailAfterHorizontalSwipe) throw new Error('A vertical calendar gesture changed the selected date detail');
  await periodTextScale.evaluate((element) => element.remove());
  await mobilePage.setViewportSize({ width: 390, height: 320 });
  await mobilePage.getByRole('button', { name: '小月历设置' }).tap();
  await mobilePage.getByRole('heading', { name: '小月历设置' }).waitFor();
  await mobilePage.getByRole('button', { name: '选择文件' }).tap();
  const mobileImportDialog = mobilePage.getByRole('dialog', { name: '从旧小月历导入' });
  const mobileDialogMetrics = await mobileImportDialog.evaluate((element) => ({ overflowY: getComputedStyle(element).overflowY, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight, paddingBottom: Number.parseFloat(getComputedStyle(element).paddingBottom) }));
  if (mobileDialogMetrics.overflowY !== 'auto' || mobileDialogMetrics.scrollHeight <= mobileDialogMetrics.clientHeight) throw new Error(`Period import dialog does not scroll in a short keyboard-sized viewport: ${JSON.stringify(mobileDialogMetrics)}`);
  if (mobileDialogMetrics.paddingBottom < 16) throw new Error('Period dialog has no bottom safe-area padding');
  await mobileImportDialog.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await mobileImportDialog.getByRole('button', { name: '关闭' }).scrollIntoViewIfNeeded();
  await mobileImportDialog.getByRole('button', { name: '关闭' }).tap();
  await mobilePage.getByRole('heading', { name: '小月历设置' }).waitFor();
  await mobilePage.getByRole('button', { name: '返回日历' }).tap();
  await mobilePage.getByRole('heading', { name: '小月历', exact: true }).waitFor();
  await mobilePage.setViewportSize({ width: 390, height: 844 });
  await mobilePage.getByRole('button', { name: '纪念日' }).tap();
  await mobilePage.getByRole('heading', { name: '还没有纪念日' }).waitFor();
  for (const width of [320, 360, 390, 430]) {
    await mobilePage.setViewportSize({ width, height: 844 });
    const scrollWidth = await mobilePage.evaluate(() => document.documentElement.scrollWidth);
    if (scrollWidth > width) throw new Error(`Anniversary home overflows at ${width}px (${scrollWidth}px)`);
    const pageWidth = await mobilePage.locator('.anniversary-page').evaluate((element) => element.getBoundingClientRect().width);
    if (pageWidth > width) throw new Error(`Anniversary page exceeds its ${width}px viewport (${pageWidth}px)`);
  }
  await mobilePage.setViewportSize({ width: 320, height: 844 });
  const anniversaryTextScale = await mobilePage.addStyleTag({ content: '.anniversary-module h1,.anniversary-module h2,.anniversary-module button,.anniversary-module p,.anniversary-module span,.anniversary-module strong,.anniversary-module label,.anniversary-module small{font-size:calc(1em * 1.25)!important}' });
  if (await mobilePage.evaluate(() => document.documentElement.scrollWidth) > 320) throw new Error('Anniversary overflows at 320px with increased text sizing');
  anniversaryTextScale.evaluate((element) => element.remove());
  await mobilePage.setViewportSize({ width: 390, height: 320 });
  await mobilePage.getByRole('button', { name: '新建纪念日' }).tap();
  await mobilePage.getByRole('heading', { name: '新建纪念日' }).waitFor();
  const longAnniversaryTitle = '手机长标题验收'.repeat(8);
  await mobilePage.getByLabel('名称').fill(longAnniversaryTitle);
  await mobilePage.getByLabel('日期', { exact: true }).fill('2099-03-01');
  await mobilePage.getByLabel('备注').fill('合成备注。'.repeat(80));
  await mobilePage.getByRole('checkbox', { name: '天数纪念' }).check();
  const mobileMilestoneInput = mobilePage.getByRole('spinbutton', { name: '添加天数节点' });
  const mobileMilestoneDays = [500, 520, 600, 666, 1000, 1001, 1314, 2000];
  for (const day of mobileMilestoneDays) {
    await mobileMilestoneInput.tap();
    await mobileMilestoneInput.fill(String(day));
    const addMilestoneButton = mobilePage.getByRole('button', { name: '＋添加' });
    await addMilestoneButton.scrollIntoViewIfNeeded();
    await addMilestoneButton.tap();
  }
  const mobileChipRows = await mobilePage.locator('.anniversary-milestone-chip').evaluateAll((chips) => new Set(chips.map((chip) => Math.round(chip.getBoundingClientRect().y))).size);
  if (mobileChipRows < 2) throw new Error('Custom milestone chips did not wrap on the narrow mobile editor');
  for (const width of [320, 360, 390, 430]) {
    await mobilePage.setViewportSize({ width, height: 320 });
    const scrollWidth = await mobilePage.evaluate(() => document.documentElement.scrollWidth);
    if (scrollWidth > width) throw new Error(`Anniversary milestone editor overflows at ${width}px (${scrollWidth}px)`);
  }
  await mobilePage.setViewportSize({ width: 390, height: 320 });
  const anniversaryEditorScroll = await mobilePage.locator('.module-holder:visible').evaluate((element) => ({ scrollHeight: element.scrollHeight, clientHeight: element.clientHeight }));
  if (anniversaryEditorScroll.scrollHeight <= anniversaryEditorScroll.clientHeight) throw new Error('Anniversary editor did not scroll in a short keyboard-sized viewport');
  await mobilePage.getByRole('button', { name: '保存' }).scrollIntoViewIfNeeded();
  await mobilePage.getByRole('button', { name: '保存' }).tap();
  await mobilePage.getByRole('button', { name: `查看最近纪念日：${longAnniversaryTitle}` }).waitFor();
  const mobileAnniversaryRecord = (await readAnniversaryRecords(mobilePage)).find((record) => record.title === longAnniversaryTitle);
  if (!mobileAnniversaryRecord?.milestoneEnabled || JSON.stringify(mobileAnniversaryRecord.milestoneDays) !== JSON.stringify(mobileMilestoneDays)) throw new Error('Mobile day milestone entry did not persist all user-entered nodes');
  if (await mobilePage.evaluate(() => document.documentElement.scrollWidth) > 390) throw new Error('Long Anniversary title or note caused horizontal overflow on mobile');
  const mobileExpectationToday = await mobilePage.evaluate(() => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; });
  await createBrowserAnniversary(mobilePage, { title: '手机期待节点', date: addCalendarDateDays(mobileExpectationToday, -100), milestoneDays: [102, 104] });
  const mobileExpectationHero = mobilePage.getByRole('button', { name: '查看最近纪念日：手机期待节点' });
  await mobileExpectationHero.waitFor();
  if (!(await mobileExpectationHero.innerText()).includes('第 102 天')) throw new Error('Mobile Anniversary Hero did not show the configured day milestone');
  if (!(await mobilePage.getByRole('region', { name: '接下来这一周' }).innerText()).includes('第 104 天')) throw new Error('Mobile Anniversary anchor week omitted a nearby day milestone');
  await mobilePage.getByRole('button', { name: '查看期待事项：手机期待节点，第 104 天' }).tap();
  if (await mobilePage.locator('.anniversary-detail-card h2').innerText() !== '手机期待节点') throw new Error('Mobile week event did not open the correct Anniversary detail');
  await mobilePage.getByRole('button', { name: '返回' }).tap();
  await mobileExpectationHero.waitFor();
  for (const width of [320, 360, 390, 430]) {
    await mobilePage.setViewportSize({ width, height: 844 });
    const scrollWidth = await mobilePage.evaluate(() => document.documentElement.scrollWidth);
    if (scrollWidth > width) throw new Error(`Anniversary anchor week overflows at ${width}px (${scrollWidth}px)`);
  }
  await mobilePage.setViewportSize({ width: 320, height: 844 });
  const anniversaryHomeTextScale = await mobilePage.addStyleTag({ content: '.anniversary-module h1,.anniversary-module h2,.anniversary-module button,.anniversary-module p,.anniversary-module span,.anniversary-module strong,.anniversary-module label,.anniversary-module small{font-size:calc(1em * 1.25)!important}' });
  if (await mobilePage.evaluate(() => document.documentElement.scrollWidth) > 320) throw new Error('Anniversary anchor week overflows at 320px with increased text sizing');
  anniversaryHomeTextScale.evaluate((element) => element.remove());
  await mobilePage.setViewportSize({ width: 390, height: 844 });
  await shot(mobilePage, 'anniversary-mobile-home.png');
  await mobile.close();

  console.log(JSON.stringify({ desktop: { quickAddAndRepeatEntry: 'passed', selectedDateAndDateBrowse: 'passed', completionAndUndo: 'passed', foldedCompletedRestore: 'passed', titleDateEdit: 'passed', coupleCrud: 'passed', coupleQuickAndDetailAdd: 'passed', coupleDragThresholdTapDropAndPersistence: 'passed', coupleTagOrFilter: 'passed', coupleHistoryAndRestore: 'passed', personalDataPreserved: 'passed', periodToggleUndoBackfillEdit: 'passed', periodPinIsolation: 'passed', periodEncryptedExportImportIsolation: 'passed', anniversaryCreateEditDeleteNavigationStoreIsolationAndCustomDayMilestones: 'passed', anniversaryUpcomingAnchorWeekMilestonesSameDayEventsAndDetailNavigation: 'passed', moduleNavigationAndSettings: 'passed' }, mobile: { quickAdd: 'passed', completionAndUndo: 'passed', coupleDetailAddTagFilterAndCompletion: 'passed', touchScrollAndLongPressDrag: 'passed', periodCalendarSwipeAndDateSelection: 'passed', anniversaryWidthsFontScaleLongTextEditorScrollCustomDayMilestonesAndUpcomingWeek: 'passed', widths: [320, 360, 390, 430], coupleBoardNoHorizontalOverflow: 'passed', periodNoHorizontalOverflowWithTextScale: 'passed', noHorizontalOverflow: 'passed', fabInViewport: 'passed' }, pwa, screenshots: screenshotDir }, null, 2));
} finally {
  await browser.close();
}
