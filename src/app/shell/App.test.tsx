import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App';
import { DB_NAME, resetDatabaseConnectionForTests } from '../../shared/storage/database';
import { saveLastModule } from '../../shared/storage/settings';

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

  it('returns through modal, settings, and child page', async () => {
    render(<App/>);
    const page = await screen.findByRole('region', { name: '待办' });
    fireEvent.click(within(page).getByText('了解这个空间'));
    await screen.findByText('待办，正在准备中。');
    fireEvent.click(screen.getAllByRole('button', { name: '打开设置' })[0]);
    await screen.findByRole('region', { name: '设置' });
    fireEvent.click(screen.getByText('关于测试版本'));
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(within(screen.getByRole('region', { name: '设置' })).getByRole('button', { name: '返回' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: '设置' })).toBeNull());
    fireEvent.click(within(screen.getByRole('region', { name: '待办' })).getByRole('button', { name: '返回' }));
    await waitFor(() => expect(within(screen.getByRole('region', { name: '待办' })).getByText('你的空间，即将开始。')).toBeTruthy());
  });

  it('restores a module child page after tab switching and returns to its root', async () => {
    render(<App/>);
    const page = await screen.findByRole('region', { name: '待办' });
    fireEvent.click(within(page).getByText('了解这个空间'));
    await screen.findByText('待办，正在准备中。');
    fireEvent.click(screen.getAllByRole('navigation', { name: '主要导航' })[0].querySelectorAll('button')[1]);
    await waitFor(() => expect(screen.getByRole('region', { name: '小月历' })).toBeTruthy());
    fireEvent.click(screen.getAllByRole('navigation', { name: '主要导航' })[0].querySelectorAll('button')[0]);
    await screen.findByText('待办，正在准备中。');
    fireEvent.click(within(screen.getByRole('region', { name: '待办' })).getByRole('button', { name: '返回' }));
    await waitFor(() => expect(within(screen.getByRole('region', { name: '待办' })).getByText('你的空间，即将开始。')).toBeTruthy());
  });
});
