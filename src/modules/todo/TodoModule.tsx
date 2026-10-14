import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type MouseEvent, type ReactNode, type RefObject, type TouchEvent } from 'react';
import { createPortal } from 'react-dom';
import type { NavigationSnapshot, TodoScreen, TodoSpace } from '../../app/navigation/model';
import { Icon } from '../../shared/ui/icons';
import { addDays, fromDateKey, monthGridKeys, shiftMonth, startOfWeek, todayKey, weekKeys } from './data/dates';
import type { DateKey, PersonalTag, PersonalTask, RepeatFrequency, TaskDraft, TaskInstance, TaskOverride } from './data/model';
import { validateTaskDraft } from './data/model';
import { occurrencesInRange } from './data/recurrence';
import { reminderSchedule } from './data/reminders';
import { todoRepository } from './data/repository';

type CoupleItem = { id: string; title: string; tags: string[]; planned?: string; time?: string };
type TimeView = 'today' | 'week' | 'month';
type RippleState = { target: TodoSpace; x: number; y: number; radius: number; left: number; top: number; width: number; height: number; running: boolean };

const coupleItems: CoupleItem[] = [
  { id: 'dinner', title: '找一家喜欢的日料店', tags: ['一起吃饭', '约会'], planned: plannedDate(2), time: '18:30' },
  { id: 'market', title: '去逛周末花市', tags: ['一起出门'], planned: plannedDate(4), time: '10:00' },
  { id: 'movie', title: '在家看一部老电影', tags: ['在家'], planned: plannedDate(5), time: '20:00' },
  { id: 'lake', title: '找个天气好的傍晚去湖边', tags: ['一起出门', '约会'] },
  { id: 'dessert', title: '试试那家新开的甜品店', tags: ['一起吃饭'] },
  { id: 'photos', title: '把最近的照片洗出来', tags: ['纪念'] }
];
const historySamples = [
  { title: '在家一起做了晚饭', completed: '今天 20:15', tags: ['在家', '一起吃饭'] },
  { title: '去西太湖散步看日落', completed: '10月11日 18:42', tags: ['一起出门'] },
  { title: '挑了一束喜欢的花', completed: '10月8日 16:20', tags: ['纪念'] },
  { title: '周末一起看了电影', completed: '10月4日 21:06', tags: ['约会', '在家'] }
];
const allTags = ['约会', '一起吃饭', '一起出门', '在家', '纪念'];
const dateFormatter = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
const shortDateFormatter = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' });
const fullDateFormatter = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long' });
const weekdayFormatter = new Intl.DateTimeFormat('zh-CN', { weekday: 'short' });

function plannedDate(offset: number) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function displayDate(key: DateKey) { return dateFormatter.format(fromDateKey(key)).replace('星期', '周'); }
function displayPeriod(view: TimeView, anchor: DateKey) {
  if (view === 'today') return displayDate(anchor);
  if (view === 'month') return fullDateFormatter.format(fromDateKey(anchor));
  const days = weekKeys(anchor);
  return `${shortDateFormatter.format(fromDateKey(days[0]))} — ${shortDateFormatter.format(fromDateKey(days[6]))}`;
}
function isDone(task: TaskInstance) { return task.completedAt !== null; }
function taskSort(a: TaskInstance, b: TaskInstance) { return Number(isDone(a)) - Number(isDone(b)) || (a.scheduledTime ?? '').localeCompare(b.scheduledTime ?? '') || a.createdAt - b.createdAt; }

function DemoNotice({ children }: { children: ReactNode }) {
  return <p className="todo-demo-note">{children}</p>;
}

function TaskSubtaskControl({ subtask, onToggle }: { subtask: TaskInstance['subtasks'][number]; onToggle: (checked: boolean) => Promise<void> }) {
  const [pendingChecked, setPendingChecked] = useState<boolean | null>(null);
  useEffect(() => setPendingChecked(null), [subtask.checked]);
  const checked = pendingChecked ?? subtask.checked;
  return <label className={checked ? 'is-checked' : ''}>
    <input type="checkbox" checked={checked} aria-label={'子任务：' + (subtask.title || '未命名')} onChange={(event) => {
      const next = event.target.checked;
      setPendingChecked(next);
      void onToggle(next).catch(() => setPendingChecked(null));
    }}/>
    <span>{subtask.title}</span>
  </label>;
}

function TaskLine({ task, onToggle, onToggleSubtask, onOpen, tagNames }: { task: TaskInstance; onToggle: () => void; onToggleSubtask: (subtaskId: string, checked: boolean) => Promise<void>; onOpen: (trigger: HTMLElement) => void; tagNames: Map<string, string> }) {
  const done = isDone(task);
  return <div className={"todo-task-row " + (done ? "is-done" : "")} data-task-key={task.instanceKey}>
    <button className="todo-check" aria-label={(done ? "恢复任务：" : "完成任务：") + task.title} aria-pressed={done} onClick={onToggle}><Icon name="check"/></button>
    <div className="todo-task-main">
      <button type="button" className="todo-task-open" onClick={(event) => onOpen(event.currentTarget)} aria-label={"打开任务：" + task.title}>
        <span className="todo-task-title">{task.title}</span>
        <span className="todo-task-meta">
          {task.scheduledTime && <span className="todo-task-time"><Icon name="clock"/>{task.scheduledTime}</span>}
          {!!task.tags.length && <span className="todo-task-tags">{task.tags.map((id) => tagNames.get(id)).filter(Boolean).slice(0, 2).map((name) => <span key={name}>{name}</span>)}</span>}
          {!!task.subtasks.length && <span className="todo-task-subtask-count">{task.subtasks.filter((item) => item.checked).length}/{task.subtasks.length} 子任务</span>}
        </span>
      </button>
      {!!task.subtasks.length && <div className="todo-task-subtasks" aria-label={task.title + "的子任务"}>
        {task.subtasks.map((subtask) => <TaskSubtaskControl key={subtask.id} subtask={subtask} onToggle={(checked) => onToggleSubtask(subtask.id, checked)}/>)}
      </div>}
    </div>
    <button type="button" className="todo-task-edit" onClick={(event) => onOpen(event.currentTarget)} aria-label={"编辑任务：" + task.title}><Icon name="chevron"/></button>
  </div>;
}

function PersonalHome({
  view, onView, onShiftPeriod, onResetPeriod, periodAnchor, inboxOpen, onInbox, hideCompleted, onHideCompleted, tasks, inboxTasks, overdueTasks,
  onToggleTask, onToggleSubtask, onEditTask, focusDate, focusOpen, onFocusDate, onCloseFocus, onOpenAdd, tags, toggleRef
}: {
  view: TimeView; onView: (view: TimeView) => void; onShiftPeriod: (delta: number) => void; onResetPeriod: () => void; periodAnchor: DateKey;
  inboxOpen: boolean; onInbox: () => void; hideCompleted: boolean; onHideCompleted: () => void;
  tasks: TaskInstance[]; inboxTasks: TaskInstance[]; overdueTasks: TaskInstance[]; onToggleTask: (task: TaskInstance) => void; onToggleSubtask: (task: TaskInstance, subtaskId: string, checked: boolean) => Promise<void>; onEditTask: (task: TaskInstance, trigger: HTMLElement) => void;
  focusDate: DateKey | null; focusOpen: boolean; onFocusDate: (date: DateKey) => void; onCloseFocus: () => void; onOpenAdd: (date: DateKey | null) => void;
  tags: PersonalTag[]; toggleRef?: (button: HTMLButtonElement | null) => void;
}) {
  const today = todayKey();
  const tagNames = useMemo(() => new Map(tags.map((tag) => [tag.id, tag.name])), [tags]);
  const shown = (items: TaskInstance[]) => (hideCompleted ? items.filter((item) => !isDone(item)) : [...items]).sort(taskSort);
  const visibleTasks = shown(tasks);
  const inboxVisible = shown(inboxTasks);
  const overdueVisible = shown(overdueTasks);
  const byDate = useMemo(() => {
    const map = new Map<DateKey, TaskInstance[]>();
    for (const task of tasks) if (task.scheduledDate) map.set(task.scheduledDate, [...(map.get(task.scheduledDate) ?? []), task]);
    return map;
  }, [tasks]);
  const monthCells = useMemo(() => monthGridKeys(periodAnchor), [periodAnchor]);
  const monthWeeks = useMemo(() => Array.from({ length: monthCells.length / 7 }, (_, week) => monthCells.slice(week * 7, week * 7 + 7)), [monthCells]);
  const markedCount = [...byDate.values()].filter((items) => shown(items).length > 0).length;
  const isFocus = view === "month" && focusOpen && focusDate !== null;
  const periodTitle = view === "today" ? (periodAnchor === today ? "今天" : (fromDateKey(periodAnchor).getMonth() + 1) + "月" + fromDateKey(periodAnchor).getDate() + "日") : view === "week" ? "这一周" : fullDateFormatter.format(fromDateKey(periodAnchor));
  const periodTasks = view === "today" ? visibleTasks.filter((task) => task.scheduledDate === periodAnchor) : visibleTasks;
  const startTouch = useRef<{ x: number; y: number } | null>(null);
  const handleTouchEnd = (event: TouchEvent<HTMLElement>) => {
    const start = startTouch.current; startTouch.current = null;
    if (!start || (view === "month" && focusOpen)) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x, dy = touch.clientY - start.y;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.35) onShiftPeriod(dx < 0 ? 1 : -1);
  };
  const taskLine = (task: TaskInstance) => <TaskLine key={task.instanceKey} task={task} tagNames={tagNames} onToggle={() => onToggleTask(task)} onToggleSubtask={(subtaskId, checked) => onToggleSubtask(task, subtaskId, checked)} onOpen={(trigger) => onEditTask(task, trigger)}/>;

  return <div className="todo-personal-content" data-space-ui="personal">
    <header className="todo-page-header">
      <div><p className="todo-kicker">{dateFormatter.format(new Date()).replace("星期", "周")}</p><h1>待办</h1><p className="todo-subtitle">把重要的小事，放在眼前。</p></div>
      <button ref={toggleRef} className="todo-space-toggle" data-space-toggle="true" type="button" aria-label="进入情侣专区" title="进入情侣专区"><Icon name="sun"/></button>
    </header>
    <div className="todo-period-row" role="tablist" aria-label="待办时间范围">
      {(["today", "week", "month"] as const).map((id) => <button key={id} role="tab" aria-selected={view === id} className={view === id ? "selected" : ""} onClick={() => onView(id)}>{id === "today" ? "今天" : id === "week" ? "本周" : "本月"}</button>)}
    </div>
    <button className={"todo-inbox " + (inboxOpen ? "expanded" : "")} onClick={onInbox} aria-expanded={inboxOpen}>
      <span className="todo-inbox-mark"><Icon name="inbox"/></span><span className="todo-inbox-copy"><strong>收集箱</strong><small>{inboxTasks.length} 件待安排的小事</small></span><span className="todo-inbox-count">{inboxTasks.length}</span><Icon name="chevron" className="todo-inbox-chevron"/>
    </button>
    {inboxOpen && <div className="todo-inbox-list" aria-label="收集箱任务">
      {inboxVisible.length ? inboxVisible.map(taskLine) : <p className="todo-inbox-empty">收集箱还是空的，先记下一个想法吧。</p>}
    </div>}

    <section className={"todo-" + view + "-section"} aria-label={view === "today" ? periodTitle + "任务" : view === "week" ? "本周任务" : "本月日历"}
      onTouchStart={(event) => { const touch = event.touches[0]; startTouch.current = { x: touch.clientX, y: touch.clientY }; }}
      onTouchEnd={handleTouchEnd}>
      <div className="todo-section-heading">
        <div><p className="todo-overline">{displayPeriod(view, periodAnchor)}</p><h2>{periodTitle}</h2></div>
        <div className="todo-period-controls">
          <button className="todo-period-arrow" onClick={() => onShiftPeriod(-1)} aria-label="上一个周期"><Icon name="arrow"/></button>
          <button className="todo-subtle-button" onClick={onResetPeriod}>回到今天</button>
          <button className="todo-period-arrow next" onClick={() => onShiftPeriod(1)} aria-label="下一个周期"><Icon name="arrow"/></button>
          {view !== "month" && <button className="todo-subtle-button" onClick={onHideCompleted}>{hideCompleted ? "显示已完成" : "隐藏已完成"}</button>}
        </div>
      </div>
      {view === "today" && <>
        {periodAnchor === today && overdueVisible.length > 0 && <section className="todo-overdue" aria-label="逾期未完成"><div className="todo-overdue-heading"><strong>逾期未完成</strong><span>{overdueVisible.length}</span></div><div className="todo-task-list">{overdueVisible.map(taskLine)}</div></section>}
        <div className="todo-task-list">{periodTasks.map(taskLine)}{periodTasks.length === 0 && <div className="todo-empty">{hideCompleted && tasks.some((task) => task.scheduledDate === periodAnchor && isDone(task)) ? "已完成的任务已隐藏。" : "这一天还没有任务，留一点空白也很好。"}</div>}</div>
      </>}
      {view === "week" && <div className="todo-week-days">{weekKeys(periodAnchor).map((key) => {
        const visible = shown(tasks.filter((task) => task.scheduledDate === key));
        if (!visible.length) return null;
        return <section key={key} className="todo-week-day" aria-label={displayDate(key) + "的任务"}>
          <div className="todo-week-date"><span className={key === today ? "today-dot" : ""}>{weekdayFormatter.format(fromDateKey(key))}</span><strong>{fromDateKey(key).getDate()}</strong><small>{key === today ? "今天" : ""}</small></div>
          <div className="todo-task-list">{visible.map(taskLine)}</div>
        </section>;
      })}{!visibleTasks.length && <div className="todo-empty">这一周还没有安排任务。</div>}</div>}
      {view === "month" && <>
        <div className={"todo-calendar " + (isFocus ? "is-focused" : "")} role="grid" aria-label={fullDateFormatter.format(fromDateKey(periodAnchor))} data-focused-date={isFocus ? focusDate ?? undefined : undefined}>
          {["一", "二", "三", "四", "五", "六", "日"].map((day) => <span key={day} className="todo-calendar-weekday" role="columnheader">{day}</span>)}
          {monthWeeks.map((week, weekIndex) => {
            const rowHasFocus = !!focusDate && week.includes(focusDate);
            return <div className={"todo-calendar-week-row " + (rowHasFocus ? "has-focus" : "")} key={"week-" + weekIndex}>
              {week.map((date, column) => {
                if (!date) return <span key={"empty-" + weekIndex + "-" + column} className="todo-calendar-day blank" aria-hidden="true"/>;
                const dayItems = shown(byDate.get(date) ?? []);
                const selected = focusDate === date && isFocus;
                const startColumn = Math.min(column + 1, 4);
                const focusStyle: CSSProperties | undefined = selected ? { gridColumn: startColumn + " / span 4" } : undefined;
                return <div key={date} className={"todo-calendar-day " + (date === today ? "is-today " : "") + (selected ? "is-focused-day" : "")} style={focusStyle}>
                  <button className={"todo-calendar-date " + (date === periodAnchor ? "is-current " : "") + (selected ? "is-selected" : "")} role="gridcell" aria-label={(fromDateKey(date).getMonth() + 1) + "月" + fromDateKey(date).getDate() + "日" + (dayItems.length ? "，" + dayItems.length + "项任务" : "")} aria-selected={date === periodAnchor || selected} onClick={() => onFocusDate(date)}><span>{fromDateKey(date).getDate()}</span>{dayItems.length > 0 && <i/>}</button>
                  {selected && <div className="todo-calendar-focus-content">
                    <div className="todo-focus-heading"><div><small>日期聚焦</small><strong>{displayDate(date)}</strong></div><button className="todo-focus-close" type="button" onClick={onCloseFocus} aria-label="收起日期"><Icon name="chevron"/></button></div>
                    <div className="todo-focus-actions"><span>{dayItems.length} 项任务</span><button type="button" onClick={() => onOpenAdd(date)}><Icon name="plus"/>添加当天任务</button></div>
                    <div className="todo-calendar-focus-list">{dayItems.length ? dayItems.map(taskLine) : <p className="todo-focus-empty">这一天还没有任务。</p>}</div>
                  </div>}
                </div>;
              })}
            </div>;
          })}
        </div>
        <p className="todo-calendar-hint">选择日期，可在月历中展开并查看当天任务。</p>
        <div className="todo-month-completed-control"><button className="todo-subtle-button" onClick={onHideCompleted}>{hideCompleted ? "显示已完成" : "隐藏已完成"}</button><span>{markedCount} 天有任务</span></div>
      </>}
    </section>
    <p className="todo-storage-note">个人待办仅保存在这台设备。</p>
  </div>;
}

function CoupleCard({ item, expanded, onToggle, onComplete, onEdit }: { item: CoupleItem; expanded: boolean; onToggle: () => void; onComplete: () => void; onEdit: () => void }) {
  return <article className={`couple-item-card ${expanded ? 'is-expanded' : ''}`}>
    <div className="couple-card-actions" aria-hidden={!expanded}>
      <button onClick={onComplete} aria-label={`完成：${item.title}`} tabIndex={expanded ? 0 : -1}><Icon name="check"/></button>
      <button onClick={onEdit} aria-label={`编辑：${item.title}`} tabIndex={expanded ? 0 : -1}><Icon name="note"/></button>
    </div>
    <button className="couple-card-body" aria-expanded={expanded} onClick={onToggle}>
      <strong>{item.title}</strong><span className="couple-card-tags">{item.tags.map((tag) => <span key={tag}>{tag}</span>)}</span>
      {item.planned && <span className="couple-card-time"><Icon name="calendar"/>{item.planned}<em>{item.time}</em></span>}
    </button>
  </article>;
}

function CoupleHome({ expandedCard, onExpand, onEdit, selectedTags, onToggleTag, onHistory, onNotice, toggleRef }: {
  expandedCard: string | null; onExpand: (id: string) => void; onEdit: (id: string) => void; selectedTags: string[]; onToggleTag: (tag: string) => void; onHistory: () => void; onNotice: (text: string) => void; toggleRef?: (button: HTMLButtonElement | null) => void;
}) {
  const planned = coupleItems.filter((item) => item.planned);
  const unplanned = coupleItems.filter((item) => !item.planned);
  return <div className="todo-couple-content">
    <header className="todo-page-header couple-header">
      <div><p className="todo-kicker">LIFE, TOGETHER</p><h1>我们的小事</h1><p className="todo-subtitle">把想一起做的事，慢慢安排好。</p></div>
      <div className="couple-header-actions"><button className="todo-history-entry" onClick={onHistory} aria-label="查看已完成历史" title="已完成历史"><Icon name="history"/></button><button ref={toggleRef} className="todo-space-toggle heart-toggle" data-space-toggle="true" type="button" aria-label="返回个人待办" title="返回个人待办"><Icon name="heart"/></button></div>
    </header>
    <div className="couple-filter-area"><div className="couple-filter-label"><span>标签</span><span>可多选 · 内容筛选为演示交互</span></div><div className="couple-tags">{allTags.map((tag) => <button key={tag} className={selectedTags.includes(tag) ? 'active' : ''} aria-pressed={selectedTags.includes(tag)} onClick={() => onToggleTag(tag)}>{tag}</button>)}</div></div>
    <div className="couple-board">
      <section className="couple-column" aria-label="已安排"><div className="couple-column-title"><span><i className="planned-dot"/>已安排</span><small>{planned.length}</small></div><div className="couple-card-list">{planned.map((item) => <CoupleCard key={item.id} item={item} expanded={expandedCard === item.id} onToggle={() => onExpand(item.id)} onComplete={() => onNotice('完成操作仅为界面演示，暂未写入历史记录。')} onEdit={() => onEdit(item.id)}/>)}</div></section>
      <section className="couple-column" aria-label="未安排"><div className="couple-column-title"><span><i className="unplanned-dot"/>未安排</span><small>{unplanned.length}</small></div><div className="couple-card-list">{unplanned.map((item) => <CoupleCard key={item.id} item={item} expanded={expandedCard === item.id} onToggle={() => onExpand(item.id)} onComplete={() => onNotice('完成操作仅为界面演示，暂未写入历史记录。')} onEdit={() => onEdit(item.id)}/>)}</div></section>
    </div>
    <DemoNotice>示例事项仅用于页面预览；拖动安排、标签筛选与完成历史将在后续阶段接入。</DemoNotice>
  </div>;
}

function CoupleHistory({ selectedTags, onToggleTag, range, onRange, onBack }: { selectedTags: string[]; onToggleTag: (tag: string) => void; range: string; onRange: () => void; onBack: () => void }) {
  return <div className="todo-subpage todo-history-page">
    <header className="todo-subpage-header"><button className="todo-back-button" onClick={onBack} aria-label="返回"><Icon name="arrow"/></button><div><p className="todo-kicker">TOGETHER</p><h1>完成的时光</h1></div><button className="todo-range-button" onClick={onRange} aria-label="筛选时间范围"><Icon name="calendar"/><span>{range}</span><Icon name="chevron"/></button></header>
    <section className="history-filter-section"><div className="couple-filter-label"><span>标签筛选</span><span>仅为交互预览</span></div><div className="couple-tags">{allTags.map((tag) => <button key={tag} className={selectedTags.includes(tag) ? 'active' : ''} aria-pressed={selectedTags.includes(tag)} onClick={() => onToggleTag(tag)}>{tag}</button>)}</div></section>
    <section className="history-timeline" aria-label="完成时间线">{historySamples.map((entry, index) => <article key={entry.title} className="history-entry"><div className="history-rail"><i/><span className={index === historySamples.length - 1 ? 'last' : ''}/></div><div className="history-entry-content"><time>{entry.completed}</time><h2>{entry.title}</h2><div className="couple-card-tags">{entry.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></div></article>)}</section>
    <DemoNotice>示例时间按完成时刻倒序排列；历史记录与筛选逻辑尚未接入。</DemoNotice>
  </div>;
}

type EditorScope = "occurrence" | "series";

function PersonalEditor({ task, baseTask, tags, onBack, onSave, onDelete, onAddTag, onNotice, guardActive }: {
  task: TaskInstance; baseTask: PersonalTask; tags: PersonalTag[]; onBack: () => void;
  onSave: (draft: TaskDraft, scope: EditorScope, periodDate: DateKey | null) => Promise<void>;
  onDelete: (scope: EditorScope, periodDate: DateKey | null) => Promise<void>;
  onAddTag: (name: string) => Promise<PersonalTag>; onNotice: (message: string) => void; guardActive: boolean;
}) {
  const recurringInstance = baseTask.seriesId !== null && task.periodDate !== null;
  const [scope, setScope] = useState<EditorScope>(recurringInstance ? "occurrence" : "series");
  const [title, setTitle] = useState(task.title);
  const [note, setNote] = useState(task.note);
  const [date, setDate] = useState(task.scheduledDate ?? "");
  const [time, setTime] = useState(task.scheduledTime ?? "");
  const [selectedTags, setSelectedTags] = useState(task.tags);
  const [subtasks, setSubtasks] = useState(task.subtasks);
  const [tagInput, setTagInput] = useState("");
  const [frequency, setFrequency] = useState<RepeatFrequency | "none">(baseTask.recurrence?.frequency ?? "none");
  const [interval, setInterval] = useState(baseTask.recurrence?.interval ?? 1);
  const [weekdays, setWeekdays] = useState(baseTask.recurrence?.weekdays ?? []);
  const [endsOn, setEndsOn] = useState(baseTask.recurrence?.endsOn ?? "");
  const [reminderEnabled, setReminderEnabled] = useState(task.reminder.enabled);
  const [minutesBefore, setMinutesBefore] = useState(task.reminder.minutesBefore);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [permission, setPermission] = useState(() => typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  const [tagError, setTagError] = useState("");
  const dayNames = ["日", "一", "二", "三", "四", "五", "六"];
  const isSeriesEditor = !recurringInstance || scope === "series";
  const existingRule = baseTask.recurrence;
  const defaultWeekday = existingRule ? fromDateKey(existingRule.startsOn).getDay() : -1;
  const hasAdvancedRule = !!existingRule && (existingRule.interval !== 1 || existingRule.endsOn !== null || (existingRule.frequency === "weekly" && (existingRule.weekdays.length !== 1 || existingRule.weekdays[0] !== defaultWeekday)));
  const [advancedRepeatOpen, setAdvancedRepeatOpen] = useState(hasAdvancedRule);
  const editorRef = useRef<HTMLFormElement>(null);
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    const editor = editorRef.current;
    editor?.querySelector<HTMLInputElement>('[aria-label="任务标题"]')?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onBackRef.current(); return; }
      if (event.key !== "Tab" || !editorRef.current) return;
      const items = [...editorRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), summary')]
        .filter((item) => item.getAttribute("aria-hidden") !== "true" && item.offsetParent !== null);
      if (!items.length) return;
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!dirty || !guardActive) return;
    const preventClose = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", preventClose);
    return () => window.removeEventListener("beforeunload", preventClose);
  }, [dirty, guardActive]);

  useEffect(() => {
    if (!guardActive) return;
    const guard = (event: Event) => {
      if (dirtyRef.current && !window.confirm("还有未保存的修改，确定离开吗？")) event.preventDefault();
    };
    window.addEventListener("life-space-navigation-back", guard);
    return () => window.removeEventListener("life-space-navigation-back", guard);
  }, [guardActive]);

  const leave = () => onBack();
  const change = <T,>(setter: (value: T) => void, value: T) => { setter(value); dirtyRef.current = true; setDirty(true); };
  const toggleTag = (id: string) => change(setSelectedTags, selectedTags.includes(id) ? selectedTags.filter((item) => item !== id) : [...selectedTags, id]);
  const toggleWeekday = (weekday: number) => change(setWeekdays, weekdays.includes(weekday) ? weekdays.filter((item) => item !== weekday) : [...weekdays, weekday]);
  const addSubtask = () => change(setSubtasks, [...subtasks, { id: globalThis.crypto?.randomUUID?.() ?? "subtask-" + Date.now(), title: "", checked: false }]);
  const updateSubtask = (id: string, updates: Partial<(typeof subtasks)[number]>) => change(setSubtasks, subtasks.map((item) => item.id === id ? { ...item, ...updates } : item));
  const requestNotificationPermission = async () => {
    if (typeof Notification === "undefined") { setPermission("unsupported"); onNotice("当前浏览器不支持通知提醒；提醒设置仍可保存。"); return; }
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      window.dispatchEvent(new Event("life-space-notification-permission"));
      onNotice(result === "granted" ? "浏览器通知已允许；网页打开时会尝试提醒。" : "通知权限未开启；任务和提醒设置仍会保留。");
    } catch {
      onNotice("无法请求通知权限；任务和提醒设置仍会保留。");
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedDate = date || (recurringInstance && task.periodDate ? task.periodDate : null);
    const recurrence = isSeriesEditor && frequency !== "none" && normalizedDate ? {
      frequency, interval: Math.max(1, interval), startsOn: normalizedDate as DateKey,
      endsOn: endsOn ? endsOn as DateKey : null,
      weekdays: frequency === "weekly" ? (weekdays.length ? weekdays : [fromDateKey(normalizedDate).getDay()]) : []
    } : isSeriesEditor ? null : baseTask.recurrence;
    const draft: TaskDraft = {
      id: baseTask.id, title, note,
      scheduledDate: normalizedDate as DateKey | null,
      scheduledTime: normalizedDate ? (time || null) : null,
      tags: selectedTags,
      subtasks: subtasks.filter((item) => item.title.trim()).map((item) => ({ ...item, title: item.title.trim() })),
      recurrence,
      recurrenceHistory: baseTask.recurrenceHistory,
      reminder: { enabled: reminderEnabled, minutesBefore }
    };
    const validation = validateTaskDraft({ ...draft, recurrence: scope === "occurrence" && recurringInstance ? null : recurrence });
    if (validation) { onNotice(validation); return; }
    setSaving(true);
    try {
      await onSave(draft, scope, task.periodDate);
      dirtyRef.current = false;
      setDirty(false);
      onBack();
    } catch {
      setSaving(false);
      return;
    }
    setSaving(false);
  };

  const remove = async (target: EditorScope) => {
    if (target === "occurrence") {
      if (!window.confirm("仅跳过这一次？系列其他日期和已完成记录会保留。")) return;
    } else if (!window.confirm(recurringInstance ? "删除整个重复系列及其周期记录？此操作无法撤销。" : "删除这项任务？此操作无法撤销。")) return;
    dirtyRef.current = false;
    try { await onDelete(target, task.periodDate); setDirty(false); }
    catch { dirtyRef.current = true; setDirty(true); }
  };

  const addTag = async () => {
    try {
      const tag = await onAddTag(tagInput);
      setSelectedTags((items) => items.includes(tag.id) ? items : [...items, tag.id]);
      setTagInput(""); setTagError(""); dirtyRef.current = true; setDirty(true);
    } catch (error) { setTagError(error instanceof Error ? error.message : "标签保存失败。"); }
  };

  const repeatSummary = frequency === "none" ? "不重复" : frequency === "daily"
    ? `${interval === 1 ? "每天" : `每 ${interval} 天`}${endsOn ? ` · 到 ${endsOn} 结束` : ""}`
    : frequency === "weekly"
      ? `${interval === 1 ? "每周" : `每 ${interval} 周`} · ${weekdays.map((day) => `周${dayNames[day]}`).join("、") || "未选择星期"}${endsOn ? ` · 到 ${endsOn} 结束` : ""}`
      : `${interval === 1 ? "每月" : `每 ${interval} 个月`} · 同一日期${endsOn ? ` · 到 ${endsOn} 结束` : ""}`;

  return <form ref={editorRef} className="todo-subpage todo-editor" role="dialog" aria-modal="true" aria-labelledby="todo-editor-title" onSubmit={(event) => void submit(event)} onChange={() => { dirtyRef.current = true; setDirty(true); }}>
    <header className="todo-subpage-header"><button type="button" className="todo-back-button" onClick={leave} aria-label="返回"><Icon name="arrow"/></button><div><p className="todo-kicker">PERSONAL TASK</p><h1 id="todo-editor-title">编辑任务</h1></div><span className="todo-editor-space">个人待办</span></header>
    <div className="todo-editor-scroll">
      {recurringInstance && <fieldset className="todo-editor-scope"><legend>修改范围</legend><label><input type="radio" name="edit-scope" checked={scope === "occurrence"} onChange={() => { setScope("occurrence"); if (task.scheduledDate) setDate(task.scheduledDate); }}/>仅此周期</label><label><input type="radio" name="edit-scope" checked={scope === "series"} onChange={() => { setScope("series"); if (task.periodDate) setDate(task.periodDate); }}/>此周期及之后</label><p>之前周期的完成记录会保留。</p></fieldset>}
      <label className="todo-form-field"><span>标题</span><input value={title} onChange={(event) => change(setTitle, event.target.value)} aria-label="任务标题" required/></label>
      <div className="todo-form-grid"><label className="todo-form-field"><span>{isSeriesEditor && frequency !== "none" ? "开始日期" : "日期"}</span><input type="date" value={date} onChange={(event) => change(setDate, event.target.value)} aria-label="任务日期"/></label><label className="todo-form-field"><span>具体时间</span><input type="time" value={time} onChange={(event) => change(setTime, event.target.value)} aria-label="具体时间"/></label></div>
      <section className="todo-form-field todo-editor-subtask-field"><span><Icon name="subtask"/>子任务</span><div className="todo-subtasks">{subtasks.map((item) => <div key={item.id} className="todo-subtask-editor-row"><input type="checkbox" checked={item.checked} onChange={(event) => updateSubtask(item.id, { checked: event.target.checked })}/><input value={item.title} onChange={(event) => updateSubtask(item.id, { title: event.target.value })} placeholder="子任务标题" aria-label="子任务标题"/><button type="button" className="todo-remove-subtask" aria-label={"删除子任务：" + (item.title || "未命名")} onClick={() => change(setSubtasks, subtasks.filter((subtask) => subtask.id !== item.id))}><Icon name="close"/></button></div>)}<button type="button" className="todo-add-subtask" onClick={addSubtask}>＋ 添加子任务</button></div></section>
      <details className="todo-editor-more"><summary>更多设置<span>备注、重复、提醒与标签</span></summary><div className="todo-editor-more-content">
        <label className="todo-form-field"><span>备注</span><textarea rows={3} value={note} onChange={(event) => change(setNote, event.target.value)} placeholder="写下需要记住的细节" aria-label="备注"/></label>
        {isSeriesEditor && <section className="todo-form-field todo-recurrence-field"><label htmlFor="todo-recurrence"><span><Icon name="repeat"/>重复规则</span></label><select id="todo-recurrence" aria-label="重复规则" value={frequency} onChange={(event) => { const next = event.target.value as typeof frequency; setFrequency(next); if (next === "weekly" && !weekdays.length) setWeekdays([fromDateKey((date || task.scheduledDate || todayKey()) as DateKey).getDay()]); setDirty(true); }}><option value="none">不重复</option><option value="daily">每天</option><option value="weekly">每周</option><option value="monthly">每月</option></select>
          <p className="todo-repeat-summary" aria-live="polite">{repeatSummary}{frequency === "monthly" && <small> · 当月不存在该日期时会跳过</small>}</p>
          {frequency !== "none" && <details className="todo-repeat-advanced" open={advancedRepeatOpen} onToggle={(event) => setAdvancedRepeatOpen(event.currentTarget.open)}><summary>高级设置</summary><div className="todo-repeat-options"><label>每 <input type="number" min="1" max="365" value={interval} aria-label="重复间隔" onChange={(event) => change(setInterval, Number(event.target.value))}/> {frequency === "daily" ? "天" : frequency === "weekly" ? "周" : "个月"}</label>
            {frequency === "weekly" && <div className="todo-weekday-options" aria-label="选择重复星期">{dayNames.map((name, index) => <button type="button" key={index} aria-pressed={weekdays.includes(index)} className={weekdays.includes(index) ? "selected" : ""} onClick={() => toggleWeekday(index)}>周{name}</button>)}</div>}
            <label className="todo-repeat-end">结束日期（可选）<input type="date" value={endsOn} min={date || undefined} aria-label="重复结束日期" onChange={(event) => change(setEndsOn, event.target.value)}/></label>
          </div></details>}
        </section>}
        <section className="todo-form-field"><span><Icon name="bell"/>提醒</span><label className="todo-setting-row" htmlFor="todo-reminder"><span>开启提醒</span><input id="todo-reminder" type="checkbox" checked={reminderEnabled} onChange={(event) => change(setReminderEnabled, event.target.checked)}/></label>
          {reminderEnabled && <><label>提前 <select value={minutesBefore} onChange={(event) => change(setMinutesBefore, Number(event.target.value))}><option value="0">准时</option><option value="5">5 分钟</option><option value="10">10 分钟</option><option value="30">30 分钟</option><option value="60">1 小时</option></select></label><div className="todo-reminder-capability"><span>{permission === "granted" ? "通知权限已允许" : permission === "denied" ? "通知权限已拒绝，可在浏览器设置中更改" : permission === "unsupported" ? "浏览器不支持通知，提醒会保留但无法弹出" : "网页打开时可尝试提醒；关闭网页后不保证触发"}</span>{permission !== "granted" && permission !== "unsupported" && <button type="button" onClick={() => void requestNotificationPermission()}>允许浏览器通知</button>}</div></>}
        </section>
        <section className="todo-form-field"><span><Icon name="tag"/>个人标签</span><div className="todo-editor-tags">{tags.map((tag) => <button type="button" className={selectedTags.includes(tag.id) ? "active" : ""} aria-pressed={selectedTags.includes(tag.id)} key={tag.id} onClick={() => toggleTag(tag.id)}>{tag.name}</button>)}</div>
          <div className="todo-create-tag"><input value={tagInput} onChange={(event) => { setTagInput(event.target.value); setDirty(true); }} placeholder="新标签名称" aria-label="新标签名称"/><button type="button" onClick={() => void addTag()} disabled={!tagInput.trim()}>添加标签</button></div>{tagError && <p className="todo-field-error">{tagError}</p>}
        </section>
      </div></details>
      <div className="todo-editor-danger"><button type="button" className="todo-delete-button" onClick={() => void remove("occurrence")}>{recurringInstance ? "跳过这一次" : "删除任务"}</button>{recurringInstance && <button type="button" className="todo-delete-button" onClick={() => void remove("series")}>删除整个系列</button>}</div>
      <p className="todo-form-disclaimer">个人任务和标签保存在本机 IndexedDB。网页关闭后不会可靠发送提醒。</p>
    </div>
    <div className="todo-form-actions"><button type="button" className="todo-secondary-button" onClick={leave}>取消</button><button className="todo-primary-button" type="submit" disabled={!title.trim() || saving}>{saving ? "保存中…" : "保存"}</button></div>
  </form>;
}

function CoupleEditor({ onBack, onSaved }: { onBack: () => void; onSaved: () => void }) {
  const [tags, setTags] = useState(['约会']);
  const toggleTag = (tag: string) => setTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]);
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); onSaved(); };
  return <form className="todo-subpage todo-editor" onSubmit={submit}>
    <header className="todo-subpage-header"><button type="button" className="todo-back-button" onClick={onBack} aria-label="返回"><Icon name="arrow"/></button><div><p className="todo-kicker">LIFE, TOGETHER</p><h1>编辑小事</h1></div><span className="todo-editor-space couple-editor-label">情侣专区</span></header>
    <label className="todo-form-field"><span>标题</span><input defaultValue="找一家喜欢的日料店" aria-label="事项标题"/></label>
    <div className="todo-form-grid"><label className="todo-form-field"><span>安排日期</span><input type="date" defaultValue={new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10)}/></label><label className="todo-form-field"><span>时间</span><input type="time" defaultValue="18:30"/></label></div>
    <div className="todo-form-field"><span><Icon name="tag"/>标签 · 可多选</span><div className="todo-editor-tags">{allTags.map((tag) => <button type="button" className={tags.includes(tag) ? 'active' : ''} aria-pressed={tags.includes(tag)} key={tag} onClick={() => toggleTag(tag)}>{tag}</button>)}</div></div>
    <label className="todo-form-field"><span>备注</span><textarea rows={4} placeholder="补充一点想法"/></label>
    <p className="todo-form-disclaimer">编辑页演示 · 当前不会保存更改</p><div className="todo-form-actions"><button type="button" className="todo-secondary-button" onClick={onBack}>取消</button><button className="todo-primary-button" type="submit">保存</button></div>
  </form>;
}

function TodoDialog({ kind, onBack, onNotice, onRangeChange, range, targetDate, onCreatePersonal }: { kind: 'todo-add-personal' | 'todo-add-couple' | 'history-filter'; onBack: () => void; onNotice: (text: string) => void; onRangeChange: (range: string) => void; range: string; targetDate: DateKey | null; onCreatePersonal: (title: string, date: DateKey | null) => Promise<void> }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const rangeOptions = ['近 7 天', '近 30 天', '近 3 个月', '近 6 个月', '近 1 年', '自定义时间段'];
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const input = dialogRef.current?.querySelector<HTMLElement>('input:not([type="checkbox"]), button');
    input?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onBack(); }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const items = [...dialogRef.current.querySelectorAll<HTMLElement>('button, input, textarea, select')].filter((item) => !item.hasAttribute('disabled'));
      if (!items.length) return;
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
      if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); previous?.focus(); };
  }, [kind, onBack]);

  if (kind === 'history-filter') return <div className="todo-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onBack(); }}><section className="todo-filter-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="range-title">
    <div className="todo-dialog-heading"><span className="todo-dialog-mark"><Icon name="calendar"/></span><button className="todo-dialog-close" onClick={onBack} aria-label="关闭"><Icon name="close"/></button><p className="todo-kicker">HISTORY FILTER</p><h2 id="range-title">选择时间范围</h2></div>
    <div className="history-range-options">{rangeOptions.map((option) => <button key={option} className={range === option ? 'active' : ''} aria-pressed={range === option} onClick={() => onRangeChange(option)}><span>{option}</span>{range === option && <Icon name="check"/>}</button>)}</div>
    {range === '自定义时间段' && <div className="todo-form-grid custom-range"><label className="todo-form-field"><span>开始日期</span><input type="date" aria-label="开始日期"/></label><label className="todo-form-field"><span>结束日期</span><input type="date" aria-label="结束日期"/></label></div>}
    <div className="todo-dialog-actions"><button className="todo-secondary-button" onClick={onBack}>取消</button><button className="todo-primary-button" onClick={() => { onNotice('时间筛选为界面演示，当前未筛选示例记录。'); onBack(); }}>完成</button></div>
  </section></div>;

  const personal = kind === 'todo-add-personal';
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!personal) { onNotice('情侣事项仍为 Phase 2A 界面演示，内容不会保存。'); return; }
    const normalized = title.trim();
    if (!normalized || saving) return;
    setSaving(true);
    void onCreatePersonal(normalized, targetDate).then(() => { setTitle(''); onBack(); }).catch((error: unknown) => {
      setSaving(false);
      onNotice(error instanceof Error ? error.message : '保存失败，请保留输入后重试。');
    });
  };
  return <div className="todo-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onBack(); }}><form className="todo-quick-dialog" ref={dialogRef as unknown as RefObject<HTMLFormElement>} onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="quick-title-heading">
    <button type="button" className="todo-dialog-close" onClick={onBack} aria-label="关闭"><Icon name="close"/></button><span className="todo-dialog-mark"><Icon name={personal ? 'inbox' : 'heart'}/></span><p className="todo-kicker">{personal ? 'QUICK CAPTURE' : 'LIFE, TOGETHER'}</p><h2 id="quick-title-heading">{personal ? '快速记录' : '记一件我们的小事'}</h2>
    <label className="todo-form-field"><span>{personal ? '任务标题' : '事项标题'}</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={personal ? '先把想法放进收集箱' : '想一起做些什么？'} aria-label={personal ? '任务标题' : '事项标题'}/></label>
    <div className="todo-quick-destination"><Icon name={personal ? 'inbox' : 'calendar'}/><span>{personal ? (targetDate ? '保存到 ' + displayDate(targetDate) : '默认放入收集箱') : '默认放入未安排'}</span></div>
    <p className="todo-form-disclaimer">{personal ? '保存后写入本机 IndexedDB，可在编辑页补充详情。' : '情侣事项仍为演示内容，不会落盘。'}</p><div className="todo-dialog-actions"><button type="button" className="todo-secondary-button" onClick={onBack}>取消</button><button className="todo-primary-button" type="submit" disabled={!title.trim() || saving}>{personal ? (saving ? '保存中…' : '保存') : '添加'}</button></div>
  </form></div>;
}

function FloatingAdd({ space, onClick }: { space: TodoSpace; onClick: () => void }) {
  return createPortal(<button className={`todo-fab todo-fab-${space}`} type="button" aria-label={space === 'personal' ? '快速新增待办' : '新增情侣事项'} onClick={onClick}><Icon name="plus"/><span>{space === 'personal' ? '记一件事' : '加一件小事'}</span></button>, document.body);
}

export function TodoModule({ snapshot, onSpaceChange, onScreenChange, showSurface, onBack, active }: {
  snapshot: NavigationSnapshot; onSpaceChange: (space: TodoSpace) => void; onScreenChange: (screen: TodoScreen) => void; showSurface: (surface: "todo-add-personal" | "todo-add-couple" | "history-filter") => void; onBack: () => void; active: boolean;
}) {
  const [view, setView] = useState<TimeView>("week");
  const [periodAnchor, setPeriodAnchor] = useState<DateKey>(() => todayKey());
  const [focusDate, setFocusDate] = useState<DateKey | null>(null);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [hideCompleted, setHideCompleted] = useState(false);
  const [taskRecords, setTaskRecords] = useState<PersonalTask[]>([]);
  const [occurrenceRecords, setOccurrenceRecords] = useState<Awaited<ReturnType<typeof todoRepository.listOccurrences>>>([]);
  const [personalTags, setPersonalTags] = useState<PersonalTag[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState("");
  const [notificationPermission, setNotificationPermission] = useState(() => typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  const [reminderRefreshTick, setReminderRefreshTick] = useState(0);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [historyRange, setHistoryRange] = useState("近 30 天");
  const [quickTargetDate, setQuickTargetDate] = useState<DateKey | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskInstance | null>(null);
  const [quickMessage, setQuickMessage] = useState("");
  const [ripple, setRipple] = useState<RippleState | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const spaceToggleRef = useRef<HTMLButtonElement>(null);
  const editorTriggerRef = useRef<HTMLElement | null>(null);
  const editorOriginScreen = useRef<TodoScreen>("home");
  const focusSpaceAfterChange = useRef<TodoSpace | null>(null);
  const rippleBusy = useRef(false);
  const finishRippleRef = useRef<() => void>(() => undefined);
  const animationTimer = useRef<number | undefined>(undefined);
  const noticeTimer = useRef<number | undefined>(undefined);
  const reminderTimers = useRef<Map<string, number>>(new Map());
  const sentReminders = useRef<Set<string>>(new Set());

  const refreshData = useCallback(async () => {
    const [nextTasks, nextTags, nextOccurrences] = await Promise.all([
      todoRepository.listTasks(), todoRepository.listTags(), todoRepository.listOccurrences()
    ]);
    setTaskRecords(nextTasks);
    setPersonalTags(nextTags);
    setOccurrenceRecords(nextOccurrences);
    setDataError("");
    setDataLoading(false);
  }, []);

  useEffect(() => {
    let activeRequest = true;
    void refreshData().catch((error: unknown) => {
      if (!activeRequest) return;
      setDataLoading(false);
      setDataError(error instanceof Error ? error.message : "无法读取本地待办数据。");
    });
    return () => { activeRequest = false; };
  }, [refreshData]);

  useEffect(() => {
    if (focusSpaceAfterChange.current !== snapshot.todoSpace) return;
    focusSpaceAfterChange.current = null;
    requestAnimationFrame(() => spaceToggleRef.current?.focus({ preventScroll: true }));
  }, [snapshot.todoSpace]);

  const onNotice = useCallback((message: string) => {
    setQuickMessage(message);
    if (noticeTimer.current !== undefined) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setQuickMessage(""), 3200);
  }, []);

  useEffect(() => {
    const updatePermission = () => setNotificationPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
    window.addEventListener("life-space-notification-permission", updatePermission);
    return () => window.removeEventListener("life-space-notification-permission", updatePermission);
  }, []);

  useEffect(() => {
    const refresh = () => setReminderRefreshTick((tick) => tick + 1);
    const interval = window.setInterval(refresh, 60 * 60 * 1000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  useEffect(() => {
    const timers = reminderTimers.current;
    for (const timer of timers.values()) window.clearTimeout(timer);
    timers.clear();
    if (notificationPermission !== "granted" || typeof Notification === "undefined") return;
    const now = Date.now();
    const from = todayKey();
    const through = addDays(from, 14);
    const instances = occurrencesInRange(taskRecords, occurrenceRecords, from, through);
    for (const task of instances) {
      if (task.completedAt || !task.reminder.enabled || !task.scheduledDate || !task.scheduledTime) continue;
      const schedule = reminderSchedule(task, now);
      if (!schedule || schedule.firesAt > now + 14 * 86_400_000 || sentReminders.current.has(schedule.key)) continue;
      const reminderKey = schedule.key;
      const delay = schedule.firesAt - now;
      const timer = window.setTimeout(() => {
        timers.delete(reminderKey);
        const notificationOptions = { body: schedule.body, tag: reminderKey };
        const display = async () => {
          try {
            if ("serviceWorker" in navigator) {
              const registration = await navigator.serviceWorker.ready;
              await registration.showNotification(schedule.title, notificationOptions);
            } else new Notification(schedule.title, notificationOptions);
            sentReminders.current.add(reminderKey);
          } catch { onNotice("当前浏览器未能显示通知；提醒设置仍已保留。"); }
        };
        void display();
      }, Math.min(delay, 2_147_000_000));
      timers.set(reminderKey, timer);
    }
    return () => {
      for (const timer of timers.values()) window.clearTimeout(timer);
      timers.clear();
    };
  }, [notificationPermission, occurrenceRecords, reminderRefreshTick, taskRecords, onNotice]);

  function finishRipple(target?: TodoSpace) {
    if (!rippleBusy.current) return;
    const next = target ?? ripple?.target;
    rippleBusy.current = false;
    if (animationTimer.current !== undefined) window.clearTimeout(animationTimer.current);
    animationTimer.current = undefined;
    finishRippleRef.current = () => undefined;
    setRipple(null);
    if (next) onSpaceChange(next);
  }

  useEffect(() => {
    const timers = reminderTimers.current;
    const settle = () => finishRippleRef.current();
    const onVisibility = () => { if (document.visibilityState === "hidden") settle(); };
    window.addEventListener("resize", settle);
    window.addEventListener("orientationchange", settle);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("resize", settle);
      window.removeEventListener("orientationchange", settle);
      document.removeEventListener("visibilitychange", onVisibility);
      if (animationTimer.current !== undefined) window.clearTimeout(animationTimer.current);
      if (noticeTimer.current !== undefined) window.clearTimeout(noticeTimer.current);
      for (const timer of timers.values()) window.clearTimeout(timer);
      timers.clear();
    };
  }, []);

  function startSpaceChange(target: TodoSpace, button: HTMLButtonElement) {
    if (rippleBusy.current) return;
    focusSpaceAfterChange.current = target;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reduceMotion) { onSpaceChange(target); return; }
    const holder = rootRef.current?.closest(".module-holder") as HTMLElement | null;
    const bounds = holder?.getBoundingClientRect() ?? rootRef.current?.getBoundingClientRect();
    const buttonBounds = button.getBoundingClientRect();
    if (!bounds || !bounds.width || !bounds.height) { onSpaceChange(target); return; }
    const x = Math.max(0, Math.min(bounds.width, buttonBounds.left + buttonBounds.width / 2 - bounds.left));
    const y = Math.max(0, Math.min(bounds.height, buttonBounds.top + buttonBounds.height / 2 - bounds.top));
    const radius = Math.max(Math.hypot(x, y), Math.hypot(bounds.width - x, y), Math.hypot(x, bounds.height - y), Math.hypot(bounds.width - x, bounds.height - y)) + 4;
    const finish = () => finishRipple(target);
    rippleBusy.current = true;
    finishRippleRef.current = finish;
    setRipple({ target, x, y, radius, left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height, running: false });
    requestAnimationFrame(() => setRipple((current) => current ? { ...current, running: true } : current));
    animationTimer.current = window.setTimeout(finish, 720);
  }

  const currentOverlay = snapshot.surfaces.at(-1);
  const showQuickAdd = currentOverlay === "todo-add-personal" || currentOverlay === "todo-add-couple";
  const showRangeDialog = currentOverlay === "history-filter";
  const isFocusScreen = snapshot.todoScreen === "personal-month-focus";
  const isPersonalEditor = snapshot.todoScreen === "personal-editor";
  const isHomeScreen = snapshot.todoScreen === "home";
  const wasPersonalEditor = useRef(isPersonalEditor);

  useEffect(() => {
    if (wasPersonalEditor.current && !isPersonalEditor && active) {
      const trigger = editorTriggerRef.current;
      requestAnimationFrame(() => {
        if (trigger?.isConnected && !trigger.closest("[inert]")) trigger.focus({ preventScroll: true });
      });
    }
    wasPersonalEditor.current = isPersonalEditor;
  }, [active, isPersonalEditor]);
  const currentDay = todayKey();
  const monthFirst = (periodAnchor.slice(0, 7) + "-01") as DateKey;
  const from = view === "today" ? periodAnchor : view === "week" ? startOfWeek(periodAnchor) : monthFirst;
  const through = view === "today" ? periodAnchor : view === "week" ? addDays(startOfWeek(periodAnchor), 6) : addDays(shiftMonth(monthFirst, 1), -1);
  const rangeInstances = useMemo(() => occurrencesInRange(taskRecords, occurrenceRecords, from, through), [taskRecords, occurrenceRecords, from, through]);
  const inboxInstances = useMemo(() => taskRecords.filter((task) => task.scheduledDate === null && task.recurrence === null).map((task): TaskInstance => ({
    instanceKey: task.id, taskId: task.id, periodDate: null, title: task.title, note: task.note, scheduledDate: null, scheduledTime: null,
    tags: task.tags, subtasks: task.subtasks, completedAt: task.completedAt, completionSource: task.completionSource, recurrence: null,
    reminder: task.reminder, createdAt: task.createdAt, updatedAt: task.updatedAt
  })), [taskRecords]);
  const overdueInstances = useMemo(() => taskRecords.filter((task) => task.recurrence === null && task.scheduledDate !== null && task.scheduledDate < currentDay && task.completedAt === null).map((task): TaskInstance => ({
    instanceKey: task.id, taskId: task.id, periodDate: null, title: task.title, note: task.note, scheduledDate: task.scheduledDate, scheduledTime: task.scheduledTime,
    tags: task.tags, subtasks: task.subtasks, completedAt: task.completedAt, completionSource: task.completionSource, recurrence: null,
    reminder: task.reminder, createdAt: task.createdAt, updatedAt: task.updatedAt
  })), [taskRecords, currentDay]);
  const selectedInstance = selectedTask ? [...rangeInstances, ...inboxInstances, ...overdueInstances].find((item) => item.instanceKey === selectedTask.instanceKey) ?? selectedTask : null;
  const selectedBase = selectedInstance ? taskRecords.find((task) => task.id === selectedInstance.taskId) ?? null : null;

  const openPersonalAdd = (target: DateKey | null) => { setQuickTargetDate(target); showSurface("todo-add-personal"); };
  const createPersonalTask = async (title: string, targetDate: DateKey | null) => {
    await todoRepository.createQuickTask(title, targetDate);
    await refreshData();
    onNotice(targetDate ? "已保存到 " + displayDate(targetDate) + "。" : "已保存到收集箱。");
  };

  const handleTaskToggle = async (task: TaskInstance) => {
    try {
      await todoRepository.setCompleted(task.taskId, task.periodDate, !isDone(task));
      await refreshData();
    } catch (error) { onNotice(error instanceof Error ? error.message : "任务状态更新失败，请重试。"); }
  };

  const handleSubtaskToggle = async (task: TaskInstance, subtaskId: string, checked: boolean) => {
    try {
      await todoRepository.setSubtaskChecked(task.taskId, task.periodDate, subtaskId, checked);
      await refreshData();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "子任务状态更新失败，请重试。");
      throw error;
    }
  };

  const openTaskEditor = (task: TaskInstance, trigger: HTMLElement) => {
    editorTriggerRef.current = trigger;
    editorOriginScreen.current = snapshot.todoScreen;
    setSelectedTask(task);
    onScreenChange("personal-editor");
  };

  const savePersonalTask = async (draft: TaskDraft, scope: EditorScope, periodDate: DateKey | null) => {
    if (!selectedInstance || !selectedBase) throw new Error("找不到正在编辑的任务，请刷新后重试。");
    try {
      if (scope === "occurrence" && selectedBase.seriesId && periodDate) {
        const override: TaskOverride = {
          title: draft.title, note: draft.note, scheduledDate: draft.scheduledDate ?? periodDate, scheduledTime: draft.scheduledTime,
          tags: draft.tags, subtasks: draft.subtasks, reminder: draft.reminder
        };
        await todoRepository.saveOccurrenceOverride(selectedBase.id, periodDate, override);
      } else {
        await todoRepository.saveTask(draft, selectedBase.seriesId && periodDate ? periodDate : undefined);
      }
      await refreshData();
      onNotice("任务已保存。");
    } catch (error) {
      const message = error instanceof Error ? error.message : "保存失败，请保留输入后重试。";
      onNotice(message);
      throw error;
    }
  };

  const deletePersonalTask = async (scope: EditorScope, periodDate: DateKey | null) => {
    if (!selectedBase) return;
    try {
      if (scope === "occurrence" && selectedBase.seriesId && periodDate) {
        await todoRepository.skipOccurrence(selectedBase.id, periodDate);
        onNotice("已跳过这一次，系列其他周期仍会保留。");
      } else {
        await todoRepository.deleteTask(selectedBase.id);
        onNotice("任务已删除。");
      }
      await refreshData();
      onBack();
    } catch (error) { onNotice(error instanceof Error ? error.message : "删除失败，请重试。"); throw error; }
  };

  const addPersonalTag = async (name: string) => {
    const tag = await todoRepository.upsertTag(name);
    await refreshData();
    return tag;
  };

  const shiftPeriod = (delta: number) => {
    if (isFocusScreen) onBack();
    setPeriodAnchor((current) => view === "today" ? addDays(current, delta) : view === "week" ? addDays(current, 7 * delta) : shiftMonth(current, delta));
    if (view === "month") setFocusDate(null);
  };
  const resetPeriod = () => {
    if (isFocusScreen) onBack();
    setPeriodAnchor(todayKey());
    setFocusDate(todayKey());
    setHideCompleted(false);
  };
  const changeView = (next: TimeView) => {
    if (isFocusScreen) onBack();
    if (view === next) { resetPeriod(); return; }
    setView(next);
    setPeriodAnchor(todayKey());
    setFocusDate(todayKey());
  };
  const chooseFocusDate = (date: DateKey) => {
    setFocusDate(date);
    if (!isFocusScreen) onScreenChange("personal-month-focus");
  };

  const personalHomeProps = {
    view, onView: changeView, onShiftPeriod: shiftPeriod, onResetPeriod: resetPeriod, periodAnchor, inboxOpen,
    onInbox: () => setInboxOpen((open) => !open), hideCompleted, onHideCompleted: () => setHideCompleted((hidden) => !hidden),
    tasks: rangeInstances, inboxTasks: inboxInstances, overdueTasks: view === "today" && periodAnchor === currentDay ? overdueInstances : [],
    onToggleTask: (task: TaskInstance) => void handleTaskToggle(task), onToggleSubtask: (task: TaskInstance, id: string, checked: boolean) => handleSubtaskToggle(task, id, checked), onEditTask: openTaskEditor,
    focusDate, focusOpen: isFocusScreen || (isPersonalEditor && editorOriginScreen.current === "personal-month-focus"), onFocusDate: chooseFocusDate, onCloseFocus: onBack, onOpenAdd: openPersonalAdd, tags: personalTags
  };

  const captureToggleButton = (button: HTMLButtonElement | null) => { if (button) spaceToggleRef.current = button; };
  const personalHome = <PersonalHome {...personalHomeProps} toggleRef={captureToggleButton}/>;
  const coupleHome = <CoupleHome expandedCard={expandedCard} onExpand={(id) => setExpandedCard((current) => current === id ? null : id)} onEdit={() => onScreenChange("couple-editor")} selectedTags={selectedTags} onToggleTag={(tag) => setSelectedTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag])} onHistory={() => onScreenChange("couple-history")} onNotice={onNotice} toggleRef={captureToggleButton}/>;
  let layout: ReactNode;
  if (snapshot.todoScreen === "couple-editor") {
    layout = <CoupleEditor onBack={onBack} onSaved={() => onNotice("情侣事项仍为演示内容，未写入数据。")}/>;
  } else if (snapshot.todoScreen === "couple-history") {
    layout = <CoupleHistory selectedTags={selectedTags} onToggleTag={(tag) => setSelectedTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag])} range={historyRange} onRange={() => showSurface("history-filter")} onBack={onBack}/>;
  } else if (snapshot.todoSpace === "couple") {
    layout = coupleHome;
  } else {
    layout = personalHome;
  }
  const dialogKind = showQuickAdd ? currentOverlay as "todo-add-personal" | "todo-add-couple" : showRangeDialog ? "history-filter" : null;
  const personalEditorOverlay = active && isPersonalEditor && selectedInstance && selectedBase ? createPortal(<div className="todo-editor-overlay"><div className="todo-editor-sheet"><PersonalEditor task={selectedInstance} baseTask={selectedBase} tags={personalTags} onBack={onBack} onSave={savePersonalTask} onDelete={deletePersonalTask} onAddTag={addPersonalTag} onNotice={onNotice} guardActive={snapshot.surfaces.length === 0}/></div></div>, document.body) : null;
  const handleRootToggle = (event: MouseEvent<HTMLDivElement>) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-space-toggle='true']");
    if (!button) return;
    spaceToggleRef.current = button;
    startSpaceChange(snapshot.todoSpace === "personal" ? "couple" : "personal", button);
  };
  const preview = ripple && <div className={"todo-ripple-layer " + (ripple.running ? "is-running" : "")} data-testid="space-ripple" data-target-space={ripple.target} aria-hidden="true" inert
    style={{ left: ripple.left, top: ripple.top, width: ripple.width, height: ripple.height, "--ripple-x": ripple.x + "px", "--ripple-y": ripple.y + "px", "--ripple-radius": ripple.radius + "px" } as CSSProperties}
    onAnimationEnd={(event) => { if (event.target === event.currentTarget) finishRipple(ripple.target); }}>
    <div className="todo-ripple-content"><div className={"todo-module-page todo-page-" + ripple.target}>
      {ripple.target === "personal" ? <PersonalHome {...personalHomeProps} toggleRef={undefined}/> : <CoupleHome expandedCard={expandedCard} onExpand={() => undefined} onEdit={() => undefined} selectedTags={selectedTags} onToggleTag={() => undefined} onHistory={() => undefined} onNotice={() => undefined}/>}
    </div><div className={"todo-fab todo-fab-" + ripple.target + " todo-preview-fab"} aria-hidden="true"><Icon name="plus"/><span>{ripple.target === "personal" ? "记一件事" : "加一件小事"}</span></div></div>
  </div>;

  return <>
    <div ref={rootRef} className="todo-module-root" data-current-space={snapshot.todoSpace} data-loading={dataLoading ? "true" : "false"} aria-busy={rippleBusy.current} aria-hidden={isPersonalEditor || undefined} inert={!!ripple || isPersonalEditor} onClick={isHomeScreen ? handleRootToggle : undefined}>
      <section className={"todo-module-page todo-page-" + snapshot.todoSpace} aria-label={snapshot.todoSpace === "personal" ? "待办" : "我们的小事"}>
        {dataError && snapshot.todoSpace === "personal" && <p className="todo-data-error" role="alert">{dataError} 请检查存储空间后重试。 <button type="button" onClick={() => { setDataLoading(true); void refreshData().catch((error: unknown) => { setDataLoading(false); setDataError(error instanceof Error ? error.message : "读取失败。"); }); }}>重试</button></p>}
        {layout}
      </section>
    </div>
    {preview && createPortal(preview, document.body)}
    {personalEditorOverlay}
    {active && isHomeScreen && !dialogKind && !ripple && <FloatingAdd space={snapshot.todoSpace} onClick={() => snapshot.todoSpace === "personal" ? openPersonalAdd(null) : showSurface("todo-add-couple")}/>}
    {active && dialogKind && <TodoDialog kind={dialogKind} onBack={onBack} onNotice={onNotice} onRangeChange={setHistoryRange} range={historyRange} targetDate={quickTargetDate} onCreatePersonal={createPersonalTask}/>}
    {active && quickMessage && <div className="todo-live-message" role="status">{quickMessage}</div>}
  </>;
}
