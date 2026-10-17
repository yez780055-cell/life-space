import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App';
import { DB_NAME, resetDatabaseConnectionForTests } from '../../shared/storage/database';
import { saveLastModule } from '../../shared/storage/settings';
import { todoRepository } from '../../modules/todo/data/repository';
import { todayKey } from '../../modules/todo/data/dates';
import { createAnniversary } from '../../modules/anniversary/data/repository';

beforeEach(async () => {
  resetDatabaseConnectionForTests();
  await new Promise<void>((resolve) => { const request = indexedDB.deleteDatabase(DB_NAME); request.onsuccess = () => resolve(); });
  history.replaceState(null, '');
});
afterEach(cleanup);

describe('application navigation', () => {
  it('waits for saved startup module and restores it', async () => {
    await saveLastModule('anniversary');
    render(<App/>);
    await waitFor(() => expect(screen.getByRole('main').querySelector('[aria-label="纪念日"]')?.parentElement?.hidden).toBe(false));
    expect(screen.getAllByRole('button', { name: '纪念日' }).length).toBeGreaterThan(0);
  });

  it('clears an Anniversary confirmation when switching modules and restores the module without a dialog', async () => {
    await createAnniversary({ title: '导航状态', date: '2030-01-01', recurrence: 'yearly' });
    render(<App/>);
    await screen.findByRole('region', { name: '待办' });
    const navigation = screen.getAllByRole('navigation', { name: '主要导航' }).at(-1)!;
    fireEvent.click(within(navigation).getByRole('button', { name: '纪念日' }));
    fireEvent.click(await screen.findByRole('button', { name: '查看纪念日：导航状态' }));
    fireEvent.click(await screen.findByRole('button', { name: '删除' }));
    await screen.findByRole('alertdialog');
    fireEvent.click(within(navigation).getByRole('button', { name: '小月历' }));
    await screen.findByRole('region', { name: '小月历' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    fireEvent.click(within(navigation).getByRole('button', { name: '纪念日' }));
    expect(await screen.findByRole('heading', { name: '纪念日详情' })).toBeTruthy();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('returns through the Todo editor and settings surfaces', async () => {
    await todoRepository.createQuickTask('编辑验证任务', todayKey());
    render(<App/>);
    await screen.findByRole('region', { name: '待办' });
    await screen.findByRole('button', { name: '编辑任务：编辑验证任务' });
    fireEvent.click(await screen.findByRole('button', { name: '编辑任务：编辑验证任务' }));
    const editor = await screen.findByRole('dialog', { name: '编辑待办' });
    const editorClose = editor.querySelector('header button') as HTMLButtonElement;
    const editorSave = within(editor).getByRole('button', { name: '保存' });
    expect(document.activeElement).toBe(within(editor).getByRole('textbox', { name: '任务内容' }));
    expect(document.querySelector('.todo-module-root')?.hasAttribute('inert')).toBe(true);
    editorClose.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(editorSave);
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(editorClose);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '编辑待办' })).toBeNull());
    await screen.findByRole('button', { name: '完成任务：编辑验证任务' });
    fireEvent.click(screen.getAllByRole('button', { name: '打开设置' })[0]);
    await screen.findByRole('region', { name: '设置' });
    fireEvent.click(screen.getByText('关于测试版本'));
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(within(screen.getByRole('region', { name: '设置' })).getByRole('button', { name: '返回' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: '设置' })).toBeNull());
    expect(await screen.findByRole('button', { name: '完成任务：编辑验证任务' })).toBeTruthy();
  });

  it('keeps the Todo record available after switching to another module and back', async () => {
    await todoRepository.createQuickTask('跨模块验证任务', todayKey());
    render(<App/>);
    await screen.findByRole('region', { name: '待办' });
    fireEvent.click(await screen.findByRole('button', { name: '编辑任务：跨模块验证任务' }));
    await screen.findByRole('heading', { name: '编辑待办' });
    fireEvent.click(within(screen.getByRole('dialog', { name: '编辑待办' })).getByRole('button', { name: '取消' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '编辑待办' })).toBeNull());
    await screen.findByRole('button', { name: '完成任务：跨模块验证任务' });
    const globalNavigation = screen.getAllByRole('navigation', { name: '主要导航' }).at(-1)!;
    fireEvent.click(within(globalNavigation).getByRole('button', { name: '小月历' }));
    await screen.findByRole('region', { name: '小月历' });
    fireEvent.click(within(globalNavigation).getByRole('button', { name: '待办' }));
    expect(await screen.findByRole('button', { name: '完成任务：跨模块验证任务' })).toBeTruthy();
  });
});
