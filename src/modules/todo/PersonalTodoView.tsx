import { useEffect, useMemo, useRef, useState, type FormEvent, type TouchEvent } from 'react';
import { Icon } from '../../shared/ui/icons';
import { fromDateKey, todayKey } from './data/dates';
import type { DateKey, TaskInstance } from './data/model';

const dateFormatter = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
const longDateFormatter = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
const weekdayFormatter = new Intl.DateTimeFormat('zh-CN', { weekday: 'long' });

function dateLabel(date: DateKey) {
  return dateFormatter.format(fromDateKey(date)).replace('星期', '周');
}

function instanceSort(a: TaskInstance, b: TaskInstance) {
  return (a.scheduledDate ?? '').localeCompare(b.scheduledDate ?? '') || a.createdAt - b.createdAt;
}

function groupByDate(tasks: TaskInstance[]) {
  const groups = new Map<string, TaskInstance[]>();
  for (const task of [...tasks].sort(instanceSort)) {
    const date = task.scheduledDate ?? '';
    groups.set(date, [...(groups.get(date) ?? []), task]);
  }
  return [...groups.entries()];
}

export function trapDialogKeyboard(event: KeyboardEvent, dialog: HTMLElement | null, onClose: () => void) {
  if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
  if (event.key !== 'Tab' || !dialog) return;
  const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.closest('[inert], [aria-hidden="true"]'));
  if (!focusable.length) return;
  const first = focusable[0], last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

function TaskRow({ task, completed, onToggle, onEdit }: {
  task: TaskInstance;
  completed: boolean;
  onToggle: () => void;
  onEdit: (task: TaskInstance, trigger: HTMLElement) => void;
}) {
  return <article className="todo-minimal-task" data-task-key={task.instanceKey}>
    <button
      className={'todo-minimal-check' + (completed ? ' is-complete' : '')}
      type="button"
      aria-label={(completed ? '恢复任务：' : '完成任务：') + task.title}
      aria-pressed={completed}
      onClick={onToggle}
    >{completed && <Icon name="check"/>}</button>
    <button className="todo-minimal-task-title" type="button" onClick={(event) => onEdit(task, event.currentTarget)}>
      <span>{task.title}</span>
    </button>
    <button className="todo-minimal-edit" type="button" aria-label={'编辑任务：' + task.title} onClick={(event) => onEdit(task, event.currentTarget)}>
      <Icon name="chevron"/>
    </button>
  </article>;
}

export function PersonalTodoView({
  selectedDate, allView, onSelectDate, onSelectView, pendingTasks, completedTasks,
  onToggleTask, onEditTask, onOpenAdd, toggleRef
}: {
  selectedDate: DateKey;
  allView: boolean;
  onSelectDate: (date: DateKey) => void;
  onSelectView: (all: boolean) => void;
  pendingTasks: TaskInstance[];
  completedTasks: TaskInstance[];
  onToggleTask: (task: TaskInstance) => void;
  onEditTask: (task: TaskInstance, trigger: HTMLElement) => void;
  onOpenAdd: (trigger: HTMLElement) => void;
  toggleRef?: (button: HTMLButtonElement | null) => void;
}) {
  const today = todayKey();
  const [completedOpen, setCompletedOpen] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const completedGroups = useMemo(() => groupByDate(completedTasks), [completedTasks]);
  const pendingGroups = useMemo(() => groupByDate(pendingTasks), [pendingTasks]);
  const weekday = weekdayFormatter.format(fromDateKey(selectedDate)).replace('星期', '周');

  const shiftDate = (days: number) => {
    const date = fromDateKey(selectedDate);
    date.setDate(date.getDate() + days);
    onSelectDate(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` as DateKey);
  };

  useEffect(() => setCompletedOpen(false), [allView, selectedDate]);

  const onTouchStart = (event: TouchEvent<HTMLElement>) => {
    if (allView || event.touches.length !== 1) { touchStart.current = null; return; }
    const target = event.target as HTMLElement;
    if (target.closest('input,textarea,select,[role="dialog"],[data-ignore-date-swipe="true"]')) { touchStart.current = null; return; }
    const touch = event.touches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY };
  };
  const onTouchEnd = (event: TouchEvent<HTMLElement>) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || allView) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 58 || Math.abs(dx) < Math.abs(dy) * 1.35) return;
    const date = fromDateKey(selectedDate);
    date.setDate(date.getDate() + (dx < 0 ? 1 : -1));
    onSelectDate(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` as DateKey);
  };

  const renderRows = (tasks: TaskInstance[], completed: boolean) => tasks.map((task) => <TaskRow
    key={task.instanceKey}
    task={task}
    completed={completed}
    onToggle={() => onToggleTask(task)}
    onEdit={onEditTask}
  />);

  return <div className="todo-personal-content todo-personal-minimal" data-space-ui="personal">
    <header className="todo-page-header todo-minimal-header">
      <div>
        <p className="todo-kicker">个人待办</p>
        <h1>{allView ? '全部未完成' : selectedDate === today ? '今天' : longDateFormatter.format(fromDateKey(selectedDate))}</h1>
        <p className="todo-subtitle">{allView || selectedDate === today ? longDateFormatter.format(fromDateKey(selectedDate)) + ' · ' + weekday : weekday}</p>
      </div>
      <button ref={toggleRef} className="todo-space-toggle" data-space-toggle="true" type="button" aria-label="进入情侣专区" title="进入情侣专区"><Icon name="sun"/></button>
    </header>

    <div className="todo-minimal-toolbar" aria-label="待办视图">
      <div className="todo-minimal-tabs" role="group" aria-label="选择待办视图">
        <button type="button" aria-pressed={!allView} className={!allView ? 'selected' : ''} onClick={() => onSelectView(false)}>日期</button>
        <button type="button" aria-pressed={allView} className={allView ? 'selected' : ''} onClick={() => onSelectView(true)}>全部</button>
      </div>
      {!allView && <div className="todo-minimal-date-navigation" role="group" aria-label="日期导航">
        <button type="button" aria-label="前一天" onClick={() => shiftDate(-1)}><Icon name="chevron" className="previous"/></button>
        <button type="button" aria-label="后一天" onClick={() => shiftDate(1)}><Icon name="chevron" className="next"/></button>
        {selectedDate !== today && <button className="todo-minimal-today" type="button" onClick={() => onSelectDate(today)}>回到今天</button>}
      </div>}
    </div>

    <section
      className="todo-minimal-task-area"
      data-testid="todo-date-area"
      aria-label={allView ? '全部未完成任务' : dateLabel(selectedDate) + '任务'}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {allView ? <>
        {pendingGroups.map(([date, tasks]) => <section className="todo-minimal-date-group" key={date || 'undated'} aria-label={date ? dateLabel(date as DateKey) + '任务' : '未设置日期任务'}>
          <h2>{date ? dateLabel(date as DateKey) : '未设置日期'}</h2>
          <div className="todo-minimal-task-list">{renderRows(tasks, false)}</div>
        </section>)}
        {pendingTasks.length === 0 && <p className="todo-minimal-empty">还没有未完成的待办。</p>}
      </> : <div className="todo-minimal-task-list">
        {renderRows(pendingTasks, false)}
        {pendingTasks.length === 0 && <p className="todo-minimal-empty">这一天没有未完成的待办。</p>}
      </div>}
    </section>

    <section className="todo-minimal-completed" aria-label="已完成任务">
      <button className="todo-minimal-completed-toggle" type="button" aria-expanded={completedOpen} onClick={() => setCompletedOpen((open) => !open)}>
        <span><strong>已完成</strong><small>{completedTasks.length} 项</small></span>
        <Icon name="chevron" className={completedOpen ? 'is-open' : ''}/>
      </button>
      {completedOpen && <div className="todo-minimal-completed-content">
        {allView ? completedGroups.map(([date, tasks]) => <section className="todo-minimal-date-group" key={date || 'undated'} aria-label={date ? dateLabel(date as DateKey) + '已完成' : '未设置日期已完成'}>
          <h2>{date ? dateLabel(date as DateKey) : '未设置日期'}</h2>
          <div className="todo-minimal-task-list">{renderRows(tasks, true)}</div>
        </section>) : renderRows(completedTasks, true)}
        {completedTasks.length === 0 && <p className="todo-minimal-empty">还没有已完成的待办。</p>}
      </div>}
    </section>

    <button className="todo-minimal-fab" type="button" aria-label="快速新增待办" onClick={(event) => onOpenAdd(event.currentTarget)}><Icon name="plus"/></button>
  </div>;
}

export function MinimalTaskEditor({ task, removesSeriesHistory, onClose, onSave, onDelete }: {
  task: TaskInstance;
  removesSeriesHistory: boolean;
  onClose: () => void;
  onSave: (title: string, date: DateKey | null) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [title, setTitle] = useState(task.title);
  const [date, setDate] = useState(task.scheduledDate ?? '');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');
  const titleInput = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLFormElement>(null);
  const dateRequired = task.periodDate !== null;

  useEffect(() => { titleInput.current?.focus(); }, []);
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => trapDialogKeyboard(event, dialogRef.current, onClose);
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = title.trim();
    if (!normalized || saving) return;
    if (dateRequired && !date) { setError('重复任务需要保留日期。'); return; }
    setSaving(true);
    setError('');
    try { await onSave(normalized, date ? date as DateKey : null); onClose(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败，请重试。'); setSaving(false); }
  };

  const confirmRemoval = async () => {
    if (saving) return;
    setSaving(true);
    setError('');
    try { await onDelete(); onClose(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '删除失败，请重试。'); setSaving(false); }
  };

  const deleteWarning = task.periodDate !== null
    ? '只会移除这一天的重复任务，系列和其他周期会保留。'
    : removesSeriesHistory
      ? '这会删除整个重复任务系列和它的周期记录。'
      : '这会删除这项待办。';

  return <div className="todo-minimal-editor-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form ref={dialogRef} className="todo-minimal-editor" role="dialog" aria-modal="true" aria-labelledby="todo-minimal-editor-title" onSubmit={(event) => void submit(event)}>
      <header><div><p className="todo-kicker">个人待办</p><h2 id="todo-minimal-editor-title">编辑待办</h2></div><button type="button" aria-label="关闭" onClick={onClose}><Icon name="close"/></button></header>
      <div className="todo-minimal-editor-fields">
        <label className="todo-form-field"><span>任务内容</span><input ref={titleInput} aria-label="任务内容" value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={500}/></label>
        <label className="todo-form-field"><span>日期</span><input type="date" aria-label="任务日期" value={date} onChange={(event) => setDate(event.target.value)} required={dateRequired}/></label>
        {error && <p className="todo-minimal-error" role="alert">{error}</p>}
      </div>
      <footer>
        {confirmDelete ? <div className="todo-minimal-delete-confirm" role="group" aria-label="确认删除">
          <p>{deleteWarning}</p>
          <button type="button" onClick={() => setConfirmDelete(false)} disabled={saving}>取消</button>
          <button type="button" className="danger" onClick={() => void confirmRemoval()} disabled={saving}>{saving ? '删除中…' : '确认删除'}</button>
        </div> : <div className="todo-minimal-editor-actions">
          <button type="button" className="todo-minimal-delete-trigger" onClick={() => setConfirmDelete(true)}>删除</button>
          <button type="button" onClick={onClose}>取消</button>
          <button type="submit" className="todo-primary-button" disabled={!title.trim() || saving}>{saving ? '保存中…' : '保存'}</button>
        </div>}
      </footer>
    </form>
  </div>;
}
