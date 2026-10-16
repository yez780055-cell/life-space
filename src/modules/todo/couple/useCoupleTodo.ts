import { useCallback, useEffect, useState } from 'react';
import type { CoupleItem, CoupleItemDraft, CoupleTag, CoupleTodoRepository } from './model';
import { coupleRepository } from './repository';

function message(error: unknown): string {
  return error instanceof Error ? error.message : '情侣事项操作失败，请重试。';
}

export function useCoupleTodo(repository: CoupleTodoRepository = coupleRepository) {
  const [items, setItems] = useState<CoupleItem[]>([]);
  const [tags, setTags] = useState<CoupleTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const [nextItems, nextTags] = await Promise.all([repository.listItems(), repository.listTags()]);
    setItems(nextItems);
    setTags(nextTags);
    setError('');
    setLoading(false);
  }, [repository]);

  useEffect(() => {
    let current = true;
    void Promise.all([repository.listItems(), repository.listTags()]).then(([nextItems, nextTags]) => {
      if (!current) return;
      setItems(nextItems);
      setTags(nextTags);
      setLoading(false);
    }).catch((reason: unknown) => {
      if (!current) return;
      setError(message(reason));
      setLoading(false);
    });
    return () => { current = false; };
  }, [repository]);

  const run = useCallback(async <T,>(operation: () => Promise<T>): Promise<T> => {
    try {
      const result = await operation();
      await refresh();
      return result;
    } catch (reason) {
      setError(message(reason));
      throw reason;
    }
  }, [refresh]);

  const retry = useCallback(async () => {
    setLoading(true);
    try { await refresh(); }
    catch (reason) { setError(message(reason)); setLoading(false); }
  }, [refresh]);

  return {
    items, tags, loading, error, retry, refresh,
    createQuick: (title: string) => run(() => repository.createQuickItem(title)),
    save: (draft: CoupleItemDraft) => run(() => repository.saveItem(draft)),
    remove: (id: string, revision?: number) => run(() => repository.deleteItem(id, revision)),
    complete: (item: CoupleItem) => run(() => repository.setCompleted(item.id, Date.now(), item.revision)),
    restore: (item: CoupleItem) => run(() => repository.setCompleted(item.id, null, item.revision)),
    upsertTag: (name: string) => run(() => repository.upsertTag(name))
  };
}
