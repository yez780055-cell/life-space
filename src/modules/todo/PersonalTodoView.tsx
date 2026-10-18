import { useEffect, useMemo, useRef, useState, type FormEvent, type TouchEvent } from 'react';
import { Icon } from '../../shared/ui/icons';
import { addDays, fromDateKey, todayKey } from './data/dates';
import type { DateKey, PersonalTag, ReminderSettings, TaskInstance } from './data/model';
import './personal-todo.css';

const dateFormatter = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' });
const weekdayFormatter = new Intl.DateTimeFormat('zh-CN', { weekday: 'short' });

function weekday(date: DateKey) {
  return weekdayFormatter.format(fromDateKey(date)).replace('星期', '周');
}

function monthDay(date: DateKey) {
  return dateFormatter.format(fromDateKey(date));
}

function dateGroupLabel(date: DateKey, today: DateKey) {
  if (date === today) return `今天 · ${monthDay(date)} ${weekday(date)}`;
  if (date === addDays(today, 1)) return `明天 · ${monthDay(date)} ${weekday(date)}`;
  return `${monthDay(date)} · ${weekday(date)}`;
}

function dateSummary(date: DateKey, today: DateKey) {
  if (date === today) return `今天 · ${monthDay(date)} ${weekday(date)}`;
  if (date === addDays(today, 1)) return `明天 · ${monthDay(date)} ${weekday(date)}`;
  return `${monthDay(date)} ${weekday(date)}`;
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

function TaskRow({ task, completed, tagLabels, onToggle, onEdit }: {
  task: TaskInstance;
  completed: boolean;
  tagLabels: Record<string, string>;
  onToggle: () => void;
  onEdit: (task: TaskInstance, trigger: HTMLElement) => void;
}) {
  const tagNames = task.tags.map((tagId) => tagLabels[tagId] ?? tagId).filter(Boolean);
  const visibleTags = tagNames.slice(0, 2);
  const moreTags = tagNames.length - visibleTags.length;
  const hasMetadata = Boolean(task.scheduledTime || tagNames.length);

  return <article className={'todo-minimal-task' + (completed ? ' is-complete' : '')} data-task-key={task.instanceKey} data-testid="todo-task-row" role="listitem">
    <button
      className={'todo-minimal-check' + (completed ? ' is-complete' : '')}
      type="button"
      aria-label={(completed ? '已完成任务：' : '完成任务：') + task.title}
      aria-pressed={completed}
      onClick={onToggle}
    ><span className="todo-minimal-check-mark">{completed && <Icon name="check"/>}</span></button>
    <div className="todo-minimal-row-copy">
      <div className="todo-minimal-title-line">
        <button className="todo-minimal-task-title" type="button" onClick={(event) => onEdit(task, event.currentTarget)}>
          <span>{task.title}</span>
        </button>
        {completed
          ? <button className="todo-minimal-restore" type="button" aria-label={'恢复任务：' + task.title} onClick={onToggle}>恢复</button>
          : <button className="todo-minimal-edit" type="button" aria-label={'编辑任务：' + task.title} onClick={(event) => onEdit(task, event.currentTarget)}><Icon name="chevron"/></button>}
      </div>
      {hasMetadata && <div className="todo-minimal-task-meta" aria-label="任务信息">
        {task.scheduledTime && <span className="todo-minimal-time"><Icon name="clock"/>{task.scheduledTime}</span>}
        {visibleTags.map((name, index) => <span className="todo-minimal-tag" key={`${task.tags[index]}-${name}`}>{name}</span>)}
        {moreTags > 0 && <span className="todo-minimal-tag todo-minimal-more-tags">+{moreTags}</span>}
      </div>}
    </div>
  </article>;
}

function TaskList({ tasks, completed, tagLabels, onToggleTask, onEditTask }: {
  tasks: TaskInstance[];
  completed: boolean;
  tagLabels: Record<string, string>;
  onToggleTask: (task: TaskInstance) => void;
  onEditTask: (task: TaskInstance, trigger: HTMLElement) => void;
}) {
  return <div className="todo-minimal-task-list" role="list">
    {tasks.map((task) => <TaskRow key={task.instanceKey} task={task} completed={completed} tagLabels={tagLabels}
      onToggle={() => onToggleTask(task)} onEdit={onEditTask}/>)}
  </div>;
}

export function PersonalTodoView({
  selectedDate, allView, onSelectDate, onSelectView, pendingTasks, completedTasks,
  onToggleTask, onEditTask, onOpenAdd, tagLabels, toggleRef
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
  tagLabels: Record<string, string>;
  toggleRef?: (button: HTMLButtonElement | null) => void;
}) {
  const today = todayKey();
  const [completedOpen, setCompletedOpen] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const completedGroups = useMemo(() => groupByDate(completedTasks), [completedTasks]);
  const pendingGroups = useMemo(() => groupByDate(pendingTasks), [pendingTasks]);
  const displayDate = allView ? today : selectedDate;

  const shiftDate = (days: number) => onSelectDate(addDays(selectedDate, days));

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
    shiftDate(dx < 0 ? 1 : -1);
  };

  return <div className="todo-personal-content todo-personal-minimal" data-space-ui="personal">
    <header className="todo-page-header todo-minimal-header">
      <div className="todo-minimal-heading">
        <h1>个人待办</h1>
        <p className="todo-minimal-summary"><strong>{pendingTasks.length} 项未完成</strong><span aria-hidden="true">·</span><time dateTime={displayDate}>{dateSummary(displayDate, today)}</time></p>
      </div>
      <button ref={toggleRef} className="todo-space-toggle" data-space-toggle="true" type="button" aria-label="进入情侣专区" title="进入情侣专区"><Icon name="sun"/></button>
    </header>

    <div className="todo-minimal-toolbar" aria-label="待办视图">
      <div className="todo-minimal-tabs" role="group" aria-label="选择待办视图">
        <button type="button" aria-pressed={allView} className={allView ? 'selected' : ''} onClick={() => onSelectView(true)}>全部</button>
        <button type="button" aria-pressed={!allView} className={!allView ? 'selected' : ''} onClick={() => onSelectView(false)}>按日期</button>
      </div>
      <button className="todo-minimal-completed-toggle" type="button" aria-expanded={completedOpen} aria-label={`已完成 ${completedTasks.length} 项`} onClick={() => setCompletedOpen((open) => !open)}>
        <span>已完成 {completedTasks.length}</span>
        <Icon name="chevron" className={completedOpen ? 'is-open' : ''}/>
      </button>
    </div>

    {!allView && <div className="todo-minimal-date-navigation" role="group" aria-label="日期导航">
      <button type="button" aria-label="前一天" onClick={() => shiftDate(-1)}><Icon name="chevron" className="previous"/></button>
      <button type="button" aria-label="后一天" onClick={() => shiftDate(1)}><Icon name="chevron" className="next"/></button>
      {selectedDate !== today && <button className="todo-minimal-today" type="button" onClick={() => onSelectDate(today)}>回到今天</button>}
    </div>}

    <section className="todo-minimal-task-area" data-testid="todo-date-area" aria-label={allView ? '全部未完成任务' : dateSummary(selectedDate, today) + '任务'} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {allView ? <>
        {pendingGroups.map(([date, tasks]) => <section className="todo-minimal-date-group" key={date || 'undated'} aria-label={date ? dateGroupLabel(date as DateKey, today) + '任务' : '未设置日期任务'} data-date-key={date || 'undated'}>
          <h2>{date ? dateGroupLabel(date as DateKey, today) : '未设置日期'}</h2>
          <TaskList tasks={tasks} completed={false} tagLabels={tagLabels} onToggleTask={onToggleTask} onEditTask={onEditTask}/>
        </section>)}
        {pendingTasks.length === 0 && <p className="todo-minimal-empty">还没有未完成的待办。</p>}
      </> : <>
        {pendingTasks.length > 0 && <section className="todo-minimal-date-group" aria-label={dateGroupLabel(selectedDate, today) + '任务'} data-date-key={selectedDate}>
          <h2>{dateGroupLabel(selectedDate, today)}</h2>
          <TaskList tasks={pendingTasks} completed={false} tagLabels={tagLabels} onToggleTask={onToggleTask} onEditTask={onEditTask}/>
        </section>}
        {pendingTasks.length === 0 && <p className="todo-minimal-empty">这一天没有未完成的待办。</p>}
      </>}
    </section>

    {completedOpen && <section className="todo-minimal-completed" aria-label="已完成任务">
      <h2 className="todo-minimal-completed-heading">已完成</h2>
      <div className="todo-minimal-completed-content">
        {allView ? completedGroups.map(([date, tasks]) => <section className="todo-minimal-date-group" key={date || 'undated'} aria-label={date ? dateGroupLabel(date as DateKey, today) + '已完成' : '未设置日期已完成'}>
          <h2>{date ? dateGroupLabel(date as DateKey, today) : '未设置日期'}</h2>
          <TaskList tasks={tasks} completed tagLabels={tagLabels} onToggleTask={onToggleTask} onEditTask={onEditTask}/>
        </section>) : completedTasks.length > 0 && <TaskList tasks={completedTasks} completed tagLabels={tagLabels} onToggleTask={onToggleTask} onEditTask={onEditTask}/>}
        {completedTasks.length === 0 && <p className="todo-minimal-empty">还没有已完成的待办。</p>}
      </div>
    </section>}

    <button className="todo-minimal-fab" type="button" aria-label="快速新增待办" onClick={(event) => onOpenAdd(event.currentTarget)}><Icon name="plus"/></button>
  </div>;
}

export type MinimalTaskDraft = {
  title: string;
  date: DateKey | null;
  time: string | null;
  note: string;
  tags: string[];
  newTags: string[];
  reminder: ReminderSettings;
};

export function MinimalTaskEditor({ task, tagOptions, removesSeriesHistory, onClose, onSave, onDelete }: {
  task: TaskInstance;
  tagOptions: PersonalTag[];
  removesSeriesHistory: boolean;
  onClose: () => void;
  onSave: (draft: MinimalTaskDraft) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [title, setTitle] = useState(task.title);
  const [date, setDate] = useState(task.scheduledDate ?? '');
  const [time, setTime] = useState(task.scheduledTime ?? '');
  const [note, setNote] = useState(task.note);
  const [tags, setTags] = useState(task.tags);
  const [newTags, setNewTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [reminderEnabled, setReminderEnabled] = useState(task.reminder.enabled);
  const [reminderMinutes, setReminderMinutes] = useState(task.reminder.minutesBefore);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');
  const titleInput = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLFormElement>(null);
  const dateRequired = task.periodDate !== null;
  const hasSchedule = Boolean(date && time);

  useEffect(() => { titleInput.current?.focus(); }, []);
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => trapDialogKeyboard(event, dialogRef.current, onClose);
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const addTag = () => {
    const normalized = tagInput.trim().replace(/\s+/g, ' ');
    if (!normalized) return;
    const existing = tagOptions.find((tag) => tag.normalizedName === normalized.toLocaleLowerCase());
    if (existing) {
      setTags((current) => current.includes(existing.id) ? current : [...current, existing.id]);
    } else {
      setNewTags((current) => current.some((value) => value.toLocaleLowerCase() === normalized.toLocaleLowerCase()) ? current : [...current, normalized]);
    }
    setTagInput('');
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = title.trim();
    if (!normalized || saving) return;
    if (dateRequired && !date) { setError('重复任务需要保留日期。'); return; }
    if (reminderEnabled && (!date || !time)) { setError('提醒需要同时设置日期和具体时间。'); return; }
    setSaving(true);
    setError('');
    try {
      await onSave({
        title: normalized,
        date: date ? date as DateKey : null,
        time: date && time ? time : null,
        note: note.trim(),
        tags,
        newTags,
        reminder: { enabled: reminderEnabled, minutesBefore: reminderMinutes }
      });
      onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败，请重试。'); setSaving(false); }
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
      <header>
        <button className="todo-minimal-editor-back" type="button" aria-label="取消编辑" onClick={onClose}><Icon name="arrow"/></button>
        <h2 id="todo-minimal-editor-title">编辑任务</h2>
        <button className="todo-minimal-editor-delete" type="button" aria-label="删除" onClick={() => setConfirmDelete(true)} disabled={saving}>删除</button>
      </header>
      <div className="todo-minimal-editor-fields">
        <label className="todo-minimal-title-editor"><span className="todo-minimal-title-editor-check" aria-hidden="true">{task.completedAt !== null && <Icon name="check"/>}</span><input ref={titleInput} aria-label="任务内容" value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={500}/></label>

        <section className="todo-minimal-editor-section todo-minimal-editor-properties" aria-label="任务基本信息">
          <label className="todo-minimal-setting-row"><span><Icon name="calendar"/>日期</span><input type="date" aria-label="任务日期" value={date} onChange={(event) => { const next = event.target.value; setDate(next); if (!next) { setTime(''); setReminderEnabled(false); } }}/></label>
          <label className="todo-minimal-setting-row"><span><Icon name="clock"/>时间</span><input type="time" aria-label="任务时间" value={time} disabled={!date} onChange={(event) => { setTime(event.target.value); if (!event.target.value) setReminderEnabled(false); }}/></label>
          <div className="todo-minimal-setting-row todo-minimal-tag-row"><span><Icon name="tag"/>标签</span><div className="todo-minimal-tag-options">
            {tagOptions.map((tag) => <button key={tag.id} className={tags.includes(tag.id) ? 'selected' : ''} type="button" aria-pressed={tags.includes(tag.id)} onClick={() => setTags((current) => current.includes(tag.id) ? current.filter((id) => id !== tag.id) : [...current, tag.id])}>{tag.name}</button>)}
            {newTags.map((tag) => <button key={tag} className="selected is-new" type="button" aria-label={`移除新标签：${tag}`} onClick={() => setNewTags((current) => current.filter((item) => item !== tag))}>{tag} ×</button>)}
            {tagOptions.length === 0 && newTags.length === 0 && <small>尚无标签</small>}
          </div><div className="todo-minimal-add-tag"><input aria-label="添加标签" value={tagInput} onChange={(event) => setTagInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addTag(); } }} placeholder="输入标签" maxLength={80}/><button type="button" onClick={addTag} disabled={!tagInput.trim()}>添加</button></div></div>
          <div className="todo-minimal-setting-row todo-minimal-reminder-row"><span><Icon name="bell"/>提醒</span><div><select aria-label="提醒时间" value={reminderMinutes} onChange={(event) => setReminderMinutes(Number(event.target.value))} disabled={!hasSchedule || !reminderEnabled}><option value={0}>准时</option><option value={5}>提前 5 分钟</option><option value={10}>提前 10 分钟</option><option value={15}>提前 15 分钟</option><option value={30}>提前 30 分钟</option><option value={60}>提前 1 小时</option></select><button type="button" aria-pressed={reminderEnabled} disabled={!hasSchedule} onClick={() => setReminderEnabled((enabled) => !enabled)}>{reminderEnabled ? '已开启' : hasSchedule ? '关闭' : '需设置时间'}</button></div></div>
        </section>

        {confirmDelete && <div className="todo-minimal-delete-confirm" role="group" aria-label="确认删除"><p>{deleteWarning}</p><button type="button" onClick={() => setConfirmDelete(false)} disabled={saving}>取消删除</button><button type="button" className="danger" onClick={() => void confirmRemoval()} disabled={saving}>{saving ? '删除中…' : '确认删除'}</button></div>}

        <section className="todo-minimal-editor-section todo-minimal-note-editor"><label htmlFor="todo-minimal-note"><span>备注</span><textarea id="todo-minimal-note" aria-label="备注" rows={3} maxLength={5000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="添加备注…"/></label></section>
        {error && <p className="todo-minimal-error" role="alert">{error}</p>}
      </div>
      <footer><button type="button" onClick={onClose} disabled={saving}>取消</button><button type="submit" className="todo-primary-button" disabled={!title.trim() || saving}>{saving ? '保存中…' : '保存'}</button></footer>
    </form>
  </div>;
}
