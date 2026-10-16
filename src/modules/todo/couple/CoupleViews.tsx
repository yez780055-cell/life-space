import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent, type PointerEvent } from 'react';
import { Icon } from '../../../shared/ui/icons';
import { todayKey } from '../data/dates';
import { filterCoupleHistory, filterCoupleItemsByTags, formatCompletedAt, formatCoupleDate, sortOpenCoupleItems, validateHistoryRange } from './domain';
import type { CoupleHistoryRange, CoupleItem, CoupleItemDraft, CoupleTag } from './model';
import type { DateKey } from '../data/model';

function tagNames(item: CoupleItem, tags: CoupleTag[]) {
  const names = new Map(tags.map((tag) => [tag.id, tag.name]));
  return item.tags.map((id) => names.get(id)).filter((name): name is string => Boolean(name));
}

export function coupleHistoryRangeLabel(range: CoupleHistoryRange): string {
  if (range.kind === 'custom') return `${range.start} 至 ${range.end}`;
  return `近 ${range.days} 天`;
}

function CoupleCard({ item, tags, expanded, onComplete, onEdit, dragging, onPointerDown, onCardClick }: {
  item: CoupleItem; tags: CoupleTag[]; expanded: boolean; onComplete: () => void; onEdit: () => void;
  dragging: boolean; onPointerDown: (event: PointerEvent<HTMLElement>) => void; onCardClick: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const names = tagNames(item, tags);
  return <article className={`couple-item-card ${expanded ? 'is-expanded' : ''} ${dragging ? 'is-dragging' : ''}`} data-couple-item={item.id}>
    <button type="button" className="couple-card-body" aria-expanded={expanded} onPointerDown={onPointerDown} onClick={onCardClick}>
      <strong>{item.title}</strong>
      {names.length > 0 && <span className="couple-card-tags">{names.map((name) => <span key={name}>{name}</span>)}</span>}
      {item.scheduledDate && <span className="couple-card-time"><Icon name="calendar"/>{formatCoupleDate(item.scheduledDate)}<em>{item.scheduledTime ?? '不限时'}</em></span>}
      {item.note && <span className="couple-card-note">{item.note}</span>}
    </button>
    <div className="couple-card-actions" aria-hidden={!expanded}>
      <button type="button" onClick={onComplete} aria-label={`完成：${item.title}`} tabIndex={expanded ? 0 : -1}><Icon name="check"/></button>
      <button type="button" onClick={onEdit} aria-label={`编辑：${item.title}`} tabIndex={expanded ? 0 : -1}><Icon name="note"/></button>
    </div>
    <span className="couple-drag-handle" aria-hidden="true"><Icon name="calendar"/></span>
  </article>;
}

type DragSession = { itemId: string; pointerId: number; pointerType: string; startX: number; startY: number; body: HTMLButtonElement; dragging: boolean; moved: boolean; holdTimer?: number };

export function CoupleHome({ items, tags, loading, error, selectedTags, expandedCard, toggleRef, onToggleTag, onExpand, onEdit, onComplete, onUnplan, onHistory, onRetry, onDropSchedule }: {
  items: CoupleItem[]; tags: CoupleTag[]; loading: boolean; error: string; selectedTags: string[]; expandedCard: string | null;
  toggleRef?: (button: HTMLButtonElement | null) => void;
  onToggleTag: (tag: string) => void; onExpand: (id: string) => void; onEdit: (id: string) => void; onComplete: (item: CoupleItem) => void;
  onUnplan: (item: CoupleItem) => void; onHistory: () => void; onRetry: () => void; onDropSchedule: (item: CoupleItem) => void;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<'planned' | 'unplanned' | null>(null);
  const dragRef = useRef<DragSession | null>(null);
  const suppressClick = useRef<string | null>(null);
  const onDropRef = useRef<(item: CoupleItem, target: 'planned' | 'unplanned') => void>(() => undefined);
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  const finishDrag = useCallback((event: globalThis.PointerEvent) => {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (current.holdTimer !== undefined) window.clearTimeout(current.holdTimer);
    setDraggingId(null);
    if (!current.dragging) {
      if (current.moved) {
        suppressClick.current = current.itemId;
        window.setTimeout(() => { if (suppressClick.current === current.itemId) suppressClick.current = null; }, 0);
      }
      setDropTarget(null);
      return;
    }
    const pointTarget = typeof document.elementFromPoint === 'function'
      ? document.elementFromPoint(event.clientX, event.clientY)
      : event.target instanceof Element ? event.target : null;
    const zone = pointTarget?.closest<HTMLElement>('[data-couple-drop-target]');
    const target = zone?.dataset.coupleDropTarget;
    setDropTarget(null);
    suppressClick.current = current.itemId;
    window.setTimeout(() => { if (suppressClick.current === current.itemId) suppressClick.current = null; }, 0);
    const item = itemById.get(current.itemId);
    if (!item || (target !== 'planned' && target !== 'unplanned')) return;
    if (target === 'planned' && item.scheduledDate === null) onDropRef.current(item, 'planned');
    else if (target === 'unplanned' && item.scheduledDate !== null) onDropRef.current(item, 'unplanned');
  }, [itemById]);

  useEffect(() => {
    const move = (event: globalThis.PointerEvent) => {
      const current = dragRef.current;
      if (!current || current.pointerId !== event.pointerId) return;
      const dx = event.clientX - current.startX;
      const dy = event.clientY - current.startY;
      if (Math.hypot(dx, dy) > 8) {
        current.moved = true;
        if (current.pointerType === 'touch' && !current.dragging) {
          if (current.holdTimer !== undefined) window.clearTimeout(current.holdTimer);
          current.holdTimer = undefined;
        }
      }
      if (!current.dragging && current.pointerType !== 'touch' && Math.hypot(dx, dy) >= 6) activateDrag(current);
      if (!current.dragging) return;
      const pointTarget = typeof document.elementFromPoint === 'function'
        ? document.elementFromPoint(event.clientX, event.clientY)
        : event.target instanceof Element ? event.target : null;
      const zone = pointTarget?.closest<HTMLElement>('[data-couple-drop-target]');
      const target = zone?.dataset.coupleDropTarget;
      setDropTarget(target === 'planned' || target === 'unplanned' ? target : null);
    };
    const end = (event: globalThis.PointerEvent) => finishDrag(event);
    const cancel = (event: globalThis.PointerEvent) => {
      const current = dragRef.current;
      if (!current || current.pointerId !== event.pointerId) return;
      if (current.holdTimer !== undefined) window.clearTimeout(current.holdTimer);
      if (current.dragging) {
        suppressClick.current = current.itemId;
        window.setTimeout(() => { if (suppressClick.current === current.itemId) suppressClick.current = null; }, 0);
      }
      dragRef.current = null;
      setDraggingId(null);
      setDropTarget(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', cancel);
    };
  }, [finishDrag]);

  useEffect(() => {
    onDropRef.current = (item, target) => target === 'planned' ? onDropSchedule(item) : onUnplan(item);
  }, [onDropSchedule, onUnplan]);

  function activateDrag(session: DragSession) {
    if (dragRef.current !== session || session.dragging) return;
    if (session.holdTimer !== undefined) window.clearTimeout(session.holdTimer);
    session.holdTimer = undefined;
    session.dragging = true;
    setDraggingId(session.itemId);
    if (session.pointerType === 'touch') {
      try { session.body.setPointerCapture(session.pointerId); } catch { /* The browser may already have cancelled this touch. */ }
    }
  }

  const onCardPointerDown = (item: CoupleItem) => (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const target = event.target as HTMLElement;
    const body = target.closest<HTMLButtonElement>('.couple-card-body');
    if (!body || target.closest('.couple-card-actions, .couple-drag-handle, button:not(.couple-card-body), input, textarea, select')) return;
    const session: DragSession = { itemId: item.id, pointerId: event.pointerId, pointerType: event.pointerType, startX: event.clientX, startY: event.clientY, body, dragging: false, moved: false };
    dragRef.current = session;
    if (event.pointerType === 'touch') session.holdTimer = window.setTimeout(() => activateDrag(session), 300);
  };

  const filtered = filterCoupleItemsByTags(items, selectedTags);
  const columns = sortOpenCoupleItems(filtered);
  const renderColumn = (kind: 'planned' | 'unplanned', title: string, records: CoupleItem[]) => <section
    className={`couple-column ${dropTarget === kind ? 'is-drop-target' : ''}`} aria-label={title} data-couple-drop-target={kind}>
    <div className="couple-column-title"><span><i className={kind === 'planned' ? 'planned-dot' : 'unplanned-dot'}/>{title}</span><small>{records.length}</small></div>
    <div className="couple-card-list">{records.map((item) => <CoupleCard key={item.id} item={item} tags={tags}
      expanded={expandedCard === item.id} dragging={draggingId === item.id}
      onComplete={() => onComplete(item)} onEdit={() => onEdit(item.id)}
      onPointerDown={onCardPointerDown(item)} onCardClick={(event) => {
        if (suppressClick.current === item.id) { suppressClick.current = null; event.preventDefault(); return; }
        onExpand(item.id);
      }}/>) }
    {!loading && records.length === 0 && <p className="couple-empty">{selectedTags.length ? '没有符合所选标签的事项。' : kind === 'planned' ? '还没有安排好的事项。' : '暂时没有未安排的事项。'}</p>}
    </div>
  </section>;

  return <div className="todo-couple-content">
    <header className="todo-page-header couple-header">
      <div><h1>我们的小事</h1></div>
      <div className="couple-header-actions">
        <button className="todo-history-entry" type="button" onClick={onHistory} aria-label="查看已完成历史" title="已完成历史"><Icon name="history"/></button>
        <button ref={toggleRef} className="todo-space-toggle heart-toggle" data-space-toggle="true" type="button" aria-label="返回个人待办" title="返回个人待办"><Icon name="heart"/></button>
      </div>
    </header>
    <div className="couple-sync-status">仅保存在此设备</div>
    <div className="couple-filter-area">
      <div className="couple-filter-label"><span>标签</span><span>多选任一</span></div>
      <div className="couple-tags">{tags.map((tag) => <button type="button" key={tag.id} className={selectedTags.includes(tag.id) ? 'active' : ''} aria-pressed={selectedTags.includes(tag.id)} onClick={() => onToggleTag(tag.id)}>{tag.name}</button>)}
      {tags.length === 0 && <span className="couple-filter-empty">添加事项时可创建标签。</span>}</div>
    </div>
    {error && <p className="todo-data-error" role="alert">{error} <button type="button" onClick={onRetry}>重试</button></p>}
    {loading && <p className="couple-loading" role="status">正在读取本机情侣事项…</p>}
    <div className="couple-board">
      {renderColumn('planned', '已安排', columns.planned)}
      {renderColumn('unplanned', '未安排', columns.unplanned)}
    </div>
  </div>;
}

export function CoupleEditorPage({ item, missing, tags, onBack, onSave, onDelete, onCreateTag }: {
  item: CoupleItem | null; missing: boolean; tags: CoupleTag[]; onBack: () => void;
  onSave: (draft: CoupleItemDraft) => Promise<void>; onDelete: (item: CoupleItem) => Promise<void>;
  onCreateTag: (name: string) => Promise<CoupleTag>;
}) {
  const [title, setTitle] = useState(item?.title ?? '');
  const [date, setDate] = useState(item?.scheduledDate ?? '');
  const [time, setTime] = useState(item?.scheduledTime ?? '');
  const [note, setNote] = useState(item?.note ?? '');
  const [selected, setSelected] = useState<string[]>(item?.tags ?? []);
  const [newTag, setNewTag] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    setTitle(item?.title ?? '');
    setDate(item?.scheduledDate ?? '');
    setTime(item?.scheduledTime ?? '');
    setNote(item?.note ?? '');
    setSelected(item?.tags ?? []);
    setConfirmDelete(false);
    setFormError('');
  // Reset only when the edited record or its revision changes; a list refresh must not discard unsaved form edits.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, item?.revision]);

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!item || busy) return;
    setBusy(true);
    setFormError('');
    try {
      await onSave({ id: item.id, expectedRevision: item.revision, title, scheduledDate: date ? date as CoupleItem['scheduledDate'] : null, scheduledTime: date ? time || null : null, tags: selected, note });
      onBack();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : '保存失败，请重试。');
    } finally { setBusy(false); }
  };

  const handleCreateTag = async () => {
    if (!newTag.trim() || busy) return;
    setBusy(true);
    setFormError('');
    try {
      const tag = await onCreateTag(newTag);
      setSelected((current) => current.includes(tag.id) ? current : [...current, tag.id]);
      setNewTag('');
    } catch (error) { setFormError(error instanceof Error ? error.message : '标签创建失败。'); }
    finally { setBusy(false); }
  };

  const handleDelete = async () => {
    if (!item || busy) return;
    setBusy(true);
    setFormError('');
    try { await onDelete(item); onBack(); }
    catch (error) { setFormError(error instanceof Error ? error.message : '删除失败，请重试。'); }
    finally { setBusy(false); }
  };

  if (missing || !item) return <div className="todo-subpage todo-editor">
    <header className="todo-subpage-header"><button className="todo-back-button" type="button" onClick={onBack} aria-label="返回"><Icon name="arrow"/></button><div><h1>编辑小事</h1></div></header>
    <p className="todo-data-error" role="alert">这项情侣事项已不存在或尚未读取。</p>
  </div>;

  return <form className="todo-subpage todo-editor couple-editor-page" onSubmit={handleSave}>
    <header className="todo-subpage-header"><button type="button" className="todo-back-button" onClick={onBack} aria-label="返回"><Icon name="arrow"/></button><div><h1>编辑小事</h1></div><span className="todo-editor-space couple-editor-label">情侣专区</span></header>
    <label className="todo-form-field"><span>标题</span><input required maxLength={500} value={title} onChange={(event) => setTitle(event.target.value)} aria-label="事项标题" autoFocus/></label>
    <div className="todo-form-grid">
      <label className="todo-form-field"><span>安排日期</span><input type="date" value={date} onChange={(event) => { setDate(event.target.value); if (!event.target.value) setTime(''); }} aria-label="安排日期"/></label>
      <label className="todo-form-field"><span>时间（可选）</span><input type="time" value={time} disabled={!date} onChange={(event) => setTime(event.target.value)} aria-label="安排时间"/></label>
    </div>
    <div className="todo-form-field"><span><Icon name="tag"/>标签 · 可多选</span>
      <div className="todo-editor-tags">{tags.map((tag) => <button type="button" className={selected.includes(tag.id) ? 'active' : ''} aria-pressed={selected.includes(tag.id)} key={tag.id} onClick={() => setSelected((current) => current.includes(tag.id) ? current.filter((id) => id !== tag.id) : [...current, tag.id])}>{tag.name}</button>)}
      {tags.length === 0 && <span className="couple-filter-empty">还没有情侣标签。</span>}</div>
      <div className="couple-tag-create"><input aria-label="新建情侣标签" maxLength={80} value={newTag} onChange={(event) => setNewTag(event.target.value)} placeholder="新建或复用标签"/><button type="button" className="todo-secondary-button" disabled={!newTag.trim() || busy} onClick={() => void handleCreateTag()}>添加标签</button></div>
    </div>
    <label className="todo-form-field"><span>备注</span><textarea rows={4} maxLength={5000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="补充一点想法"/></label>
    {formError && <p className="todo-data-error" role="alert">{formError}</p>}
    {confirmDelete ? <p className="couple-delete-confirm" role="group" aria-label="确认删除事项"><span>确定删除“{item.title}”？此操作无法撤销。</span><button type="button" className="todo-secondary-button" disabled={busy} onClick={() => setConfirmDelete(false)}>取消删除</button><button type="button" className="couple-delete-button" disabled={busy} onClick={() => void handleDelete()}>{busy ? '删除中…' : '确认删除'}</button></p> : <div className="couple-editor-footer">
      <button type="button" className="couple-delete-button" onClick={() => setConfirmDelete(true)}>删除</button>
      <div className="todo-form-actions"><button type="button" className="todo-secondary-button" onClick={onBack}>取消</button><button className="todo-primary-button couple" type="submit" disabled={busy || !title.trim()}>{busy ? '保存中…' : '保存'}</button></div>
    </div>}
  </form>;
}

export function CoupleHistoryPage({ items, tags, selectedTags, range, onToggleTag, onRange, onBack, onRestore }: {
  items: CoupleItem[]; tags: CoupleTag[]; selectedTags: string[]; range: CoupleHistoryRange; onToggleTag: (id: string) => void;
  onRange: () => void; onBack: () => void; onRestore: (item: CoupleItem) => void;
}) {
  const entries = filterCoupleHistory(items, selectedTags, range);
  return <div className="todo-subpage todo-history-page">
    <header className="todo-subpage-header"><button className="todo-back-button" type="button" onClick={onBack} aria-label="返回"><Icon name="arrow"/></button><div><h1>完成的时光</h1></div><button className="todo-range-button" type="button" onClick={onRange} aria-label="筛选时间范围"><Icon name="calendar"/><span>{coupleHistoryRangeLabel(range)}</span><Icon name="chevron"/></button></header>
    <section className="history-filter-section"><div className="couple-filter-label"><span>标签</span><span>多选任一</span></div><div className="couple-tags">{tags.map((tag) => <button type="button" key={tag.id} className={selectedTags.includes(tag.id) ? 'active' : ''} aria-pressed={selectedTags.includes(tag.id)} onClick={() => onToggleTag(tag.id)}>{tag.name}</button>)}
      {tags.length === 0 && <span className="couple-filter-empty">暂无情侣标签。</span>}</div></section>
    {entries.length ? <section className="history-timeline" aria-label="完成时间线">{entries.map((entry, index) => <article key={entry.id} className="history-entry">
      <div className="history-rail"><i/><span className={index === entries.length - 1 ? 'last' : ''}/></div>
      <div className="history-entry-content"><time dateTime={new Date(entry.completedAt!).toISOString()}>{formatCompletedAt(entry.completedAt!)}</time><h2>{entry.title}</h2>
        {tagNames(entry, tags).length > 0 && <div className="couple-card-tags">{tagNames(entry, tags).map((name) => <span key={name}>{name}</span>)}</div>}
        <button type="button" className="history-restore-button" onClick={() => onRestore(entry)}>恢复到待办</button>
      </div>
    </article>)}</section> : <p className="couple-empty history-empty">这个时间范围内没有已完成的事项。</p>}
  </div>;
}

export function CoupleHistoryFilterDialog({ range, onBack, onApply }: {
  range: CoupleHistoryRange; onBack: () => void; onApply: (range: CoupleHistoryRange) => void;
}) {
  const [draft, setDraft] = useState<CoupleHistoryRange>(range);
  const [start, setStart] = useState<string>(range.kind === 'custom' ? range.start : todayKey());
  const [end, setEnd] = useState<string>(range.kind === 'custom' ? range.end : todayKey());
  const [error, setError] = useState('');
  const presets = [7, 30, 90, 180, 365] as const;
  const selectPreset = (days: typeof presets[number]) => setDraft({ kind: 'preset', days });
  const chooseCustom = () => setDraft({ kind: 'custom', start: start as DateKey, end: end as DateKey });

  const apply = () => {
    const next = draft.kind === 'custom' ? { kind: 'custom' as const, start: start as DateKey, end: end as DateKey } : draft;
    const validation = validateHistoryRange(next);
    if (validation) { setError(validation); return; }
    onApply(next);
    onBack();
  };

  return <div className="todo-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onBack(); }}>
    <section className="todo-filter-dialog" role="dialog" aria-modal="true" aria-labelledby="range-title">
      <div className="todo-dialog-heading"><span className="todo-dialog-mark"><Icon name="calendar"/></span><button type="button" className="todo-dialog-close" onClick={onBack} aria-label="关闭"><Icon name="close"/></button><p className="todo-kicker">HISTORY FILTER</p><h2 id="range-title">选择时间范围</h2></div>
      <div className="history-range-options">{presets.map((days) => { const selected = draft.kind === 'preset' && draft.days === days; return <button type="button" key={days} className={selected ? 'active' : ''} aria-pressed={selected} onClick={() => selectPreset(days)}><span>近 {days} 天</span>{selected && <Icon name="check"/>}</button>; })}
        <button type="button" className={draft.kind === 'custom' ? 'active' : ''} aria-pressed={draft.kind === 'custom'} onClick={chooseCustom}><span>自定义时间段</span>{draft.kind === 'custom' && <Icon name="check"/>}</button></div>
      {draft.kind === 'custom' && <div className="todo-form-grid custom-range"><label className="todo-form-field"><span>开始日期</span><input type="date" aria-label="开始日期" value={start} max={end} onChange={(event) => setStart(event.target.value)}/></label><label className="todo-form-field"><span>结束日期</span><input type="date" aria-label="结束日期" value={end} min={start} onChange={(event) => setEnd(event.target.value)}/></label></div>}
      {error && <p className="todo-data-error" role="alert">{error}</p>}
      <div className="todo-dialog-actions"><button type="button" className="todo-secondary-button" onClick={onBack}>取消</button><button type="button" className="todo-primary-button couple" onClick={apply}>完成</button></div>
    </section>
  </div>;
}
