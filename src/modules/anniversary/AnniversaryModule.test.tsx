import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { initialSnapshot } from '../../app/navigation/model';
import { AnniversaryModule } from './AnniversaryModule';

const { listAnniversaries } = vi.hoisted(() => ({ listAnniversaries: vi.fn() }));
vi.mock('./data/repository', () => ({
  listAnniversaries,
  createAnniversary: vi.fn(),
  updateAnniversary: vi.fn(),
  deleteAnniversary: vi.fn(),
}));

beforeEach(() => { listAnniversaries.mockResolvedValue([]); });
afterEach(cleanup);

describe('Anniversary module UI', () => {
  it('shows a real empty state without demo records and exposes the create route', async () => {
    const onScreen = vi.fn();
    render(<AnniversaryModule snapshot={initialSnapshot('anniversary')} active onScreen={onScreen} onSurface={vi.fn()} onBack={vi.fn()} onReturnHome={vi.fn()} onError={vi.fn()}/>);
    await screen.findByRole('heading', { name: '还没有纪念日' });
    expect(document.querySelector('.anniversary-module')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /查看最近纪念日/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '新建纪念日' }));
    expect(onScreen).toHaveBeenCalledWith('editor');
  });
});
