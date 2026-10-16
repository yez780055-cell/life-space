import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { NavigationSnapshot, TodoScreen, TodoSpace } from '../../app/navigation/model';
import { Icon } from '../../shared/ui/icons';
import { addDays, fromDateKey, todayKey } from './data/dates';
import type { DateKey, PersonalTask, TaskInstance } from './data/model';
import { allInstances, occurrencesInRange } from './data/recurrence';
import { reminderSchedule } from './data/reminders';
import { todoRepository } from './data/repository';
import { MinimalTaskEditor, PersonalTodoView, trapDialogKeyboard } from './PersonalTodoView';

type CoupleItem = { id: string; title: string; tags: string[]; planned?: string; time?: string };
type RippleState = { target: TodoSpace; x: number; y: number; radius: number; left: number; top: number; width: number; height: number; running: boolean };
type UndoEntry = { id: string; task: TaskInstance; expiresAt: number };

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

function plannedDate(offset: number) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function displayDate(key: DateKey) { return dateFormatter.format(fromDateKey(key)).replace('星期', '周'); }
function isDone(task: TaskInstance) { return task.completedAt !== null; }

function DemoNotice({ children }: { children: ReactNode }) {
  return <p className="todo-demo-note">{children}</p>;
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
  const titleInputRef = useRef<HTMLInputElement>(null);
  const quickDialogRef = useRef<HTMLFormElement>(null);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState<DateKey | ''>(targetDate ?? todayKey());
  const [saving, setSaving] = useState(false);

  useEffect(() => { titleInputRef.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    if (kind === 'history-filter') return;
    const handleKey = (event: KeyboardEvent) => trapDialogKeyboard(event, quickDialogRef.current, onBack);
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [kind, onBack]);
  const rangeOptions = ['近 7 天', '近 30 天', '近 90 天', '自定义时间段'];

  if (kind === 'history-filter') return <div className="todo-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onBack(); }}><section className="todo-filter-dialog" role="dialog" aria-modal="true" aria-labelledby="range-title">
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
    void onCreatePersonal(normalized, date ? date as DateKey : null).then(() => {
      setTitle('');
      setSaving(false);
      requestAnimationFrame(() => titleInputRef.current?.focus({ preventScroll: true }));
    }).catch((error: unknown) => {
      setSaving(false);
      onNotice(error instanceof Error ? error.message : '保存失败，请保留输入后重试。');
    });
  };
  return <div className={'todo-dialog-backdrop' + (personal ? ' todo-minimal-quick-backdrop' : '')} onMouseDown={(event) => { if (event.target === event.currentTarget) onBack(); }}><form ref={quickDialogRef} className={'todo-quick-dialog' + (personal ? ' todo-minimal-quick-dialog' : '')} onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="quick-title-heading">
    <button type="button" className="todo-dialog-close" onClick={onBack} aria-label="关闭"><Icon name="close"/></button><span className="todo-dialog-mark"><Icon name={personal ? 'plus' : 'heart'}/></span><p className="todo-kicker">{personal ? 'QUICK CAPTURE' : 'LIFE, TOGETHER'}</p><h2 id="quick-title-heading">{personal ? '快速添加' : '记一件我们的小事'}</h2>
    <label className="todo-form-field"><span>{personal ? '任务内容' : '事项标题'}</span><input ref={titleInputRef} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={personal ? '想做什么？' : '想一起做些什么？'} aria-label={personal ? '任务内容' : '事项标题'} maxLength={500} disabled={personal && saving}/></label>
    {personal ? <label className="todo-form-field"><span>日期</span><input type="date" value={date} onChange={(event) => setDate(event.target.value as DateKey | '')} aria-label="任务日期" disabled={saving}/></label> : <div className="todo-quick-destination"><Icon name="calendar"/><span>默认放入未安排</span></div>}
    {!personal && <p className="todo-form-disclaimer">情侣事项仍为演示内容，不会落盘。</p>}
    <div className="todo-dialog-actions"><button type="button" className="todo-secondary-button" onClick={onBack}>关闭</button><button className="todo-primary-button" type="submit" disabled={personal ? !title.trim() || saving : false}>{personal ? (saving ? '添加中…' : '添加') : '添加'}</button></div>
  </form></div>;
}

function FloatingAdd({ space, onClick }: { space: TodoSpace; onClick: () => void }) {
  return createPortal(<button className={`todo-fab todo-fab-${space}`} type="button" aria-label={space === 'personal' ? '快速新增待办' : '新增情侣事项'} onClick={onClick}><Icon name="plus"/><span>{space === 'personal' ? '记一件事' : '加一件小事'}</span></button>, document.body);
}

export function TodoModule({ snapshot, onSpaceChange, onScreenChange, showSurface, onBack, active }: {
  snapshot: NavigationSnapshot; onSpaceChange: (space: TodoSpace) => void; onScreenChange: (screen: TodoScreen) => void; showSurface: (surface: "todo-add-personal" | "todo-add-couple" | "history-filter") => void; onBack: () => void; active: boolean;
}) {
  const [selectedDate, setSelectedDate] = useState<DateKey>(() => todayKey());
  const [allView, setAllView] = useState(false);
  const [taskRecords, setTaskRecords] = useState<PersonalTask[]>([]);
  const [occurrenceRecords, setOccurrenceRecords] = useState<Awaited<ReturnType<typeof todoRepository.listOccurrences>>>([]);
  const [completionOverrides, setCompletionOverrides] = useState<Map<string, boolean>>(() => new Map());
  const completionOverridesRef = useRef(completionOverrides);
  const pendingCompletionWrites = useRef<Map<string, Promise<void>>>(new Map());
  const [undoEntries, setUndoEntries] = useState<UndoEntry[]>([]);
  const undoEntriesRef = useRef(undoEntries);
  const undoTimers = useRef<Map<string, number>>(new Map());
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
  const quickAddTriggerRef = useRef<HTMLElement | null>(null);
  const focusSpaceAfterChange = useRef<TodoSpace | null>(null);
  const rippleBusy = useRef(false);
  const finishRippleRef = useRef<() => void>(() => undefined);
  const animationTimer = useRef<number | undefined>(undefined);
  const noticeTimer = useRef<number | undefined>(undefined);
  const reminderTimers = useRef<Map<string, number>>(new Map());
  const sentReminders = useRef<Set<string>>(new Set());

  const refreshData = useCallback(async () => {
    const [nextTasks, nextOccurrences] = await Promise.all([
      todoRepository.listTasks(), todoRepository.listOccurrences()
    ]);
    setTaskRecords(nextTasks);
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
    const undoTimeouts = undoTimers.current;
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
      for (const timer of undoTimeouts.values()) window.clearTimeout(timer);
      undoTimeouts.clear();
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
  const wasQuickAdd = useRef(showQuickAdd);
  useEffect(() => {
    if (wasQuickAdd.current && !showQuickAdd && active) {
      const trigger = quickAddTriggerRef.current;
      requestAnimationFrame(() => { if (trigger?.isConnected && !trigger.closest('[inert]')) trigger.focus({ preventScroll: true }); });
    }
    wasQuickAdd.current = showQuickAdd;
  }, [active, showQuickAdd]);
  const currentDay = todayKey();
  const dateInstances = useMemo(() => occurrencesInRange(taskRecords, occurrenceRecords, selectedDate, selectedDate), [taskRecords, occurrenceRecords, selectedDate]);
  const projectedAllInstances = useMemo(() => allInstances(taskRecords, occurrenceRecords, currentDay), [taskRecords, occurrenceRecords, currentDay]);
  const displayedInstances = (allView ? projectedAllInstances : dateInstances).map((task) => {
    if (!completionOverrides.has(task.instanceKey)) return task;
    const completed = completionOverrides.get(task.instanceKey)!;
    return { ...task, completedAt: completed ? task.completedAt ?? Date.now() : null, completionSource: completed ? task.completionSource ?? 'manual' : null };
  });
  const pendingInstances = displayedInstances.filter((task) => !isDone(task));
  const completedInstances = displayedInstances.filter(isDone);
  const selectedBase = selectedTask ? taskRecords.find((task) => task.id === selectedTask.taskId) ?? null : null;

  const updateCompletionOverride = (key: string, completed: boolean | undefined) => {
    const next = new Map(completionOverridesRef.current);
    if (completed === undefined) next.delete(key);
    else next.set(key, completed);
    completionOverridesRef.current = next;
    setCompletionOverrides(next);
  };

  const removeUndoEntry = useCallback((id: string) => {
    const timer = undoTimers.current.get(id);
    if (timer !== undefined) window.clearTimeout(timer);
    undoTimers.current.delete(id);
    const next = undoEntriesRef.current.filter((entry) => entry.id !== id);
    undoEntriesRef.current = next;
    setUndoEntries(next);
  }, []);

  const addUndoEntry = useCallback((task: TaskInstance) => {
    const entry: UndoEntry = { id: task.instanceKey + ':' + Date.now() + ':' + Math.random(), task, expiresAt: Date.now() + 2000 };
    const next = [...undoEntriesRef.current.filter((item) => item.task.instanceKey !== task.instanceKey), entry];
    undoEntriesRef.current = next;
    setUndoEntries(next);
    undoTimers.current.set(entry.id, window.setTimeout(() => removeUndoEntry(entry.id), 2000));
    return entry.id;
  }, [removeUndoEntry]);

  const removeUndoForTask = (key: string) => {
    for (const entry of undoEntriesRef.current) if (entry.task.instanceKey === key) removeUndoEntry(entry.id);
  };

  const persistCompletion = (task: TaskInstance, completed: boolean, undoId?: string) => {
    const key = task.instanceKey;
    updateCompletionOverride(key, completed);
    const previous = pendingCompletionWrites.current.get(key);
    const write = (previous ?? Promise.resolve()).catch(() => undefined).then(() => todoRepository.setCompleted(task.taskId, task.periodDate, completed));
    pendingCompletionWrites.current.set(key, write);
    void write.then(async () => {
      try { await refreshData(); }
      catch (error) {
        if (pendingCompletionWrites.current.get(key) === write) onNotice(error instanceof Error ? error.message : '状态已保存，但列表刷新失败。');
        return;
      }
      if (pendingCompletionWrites.current.get(key) === write) {
        pendingCompletionWrites.current.delete(key);
        updateCompletionOverride(key, undefined);
      }
    }, (error: unknown) => {
      if (pendingCompletionWrites.current.get(key) !== write) return;
      pendingCompletionWrites.current.delete(key);
      updateCompletionOverride(key, undefined);
      if (undoId) removeUndoEntry(undoId);
      void refreshData().catch(() => undefined);
      onNotice(error instanceof Error ? error.message : '状态更新失败，请重试。');
    });
  };

  const handleTaskToggle = (task: TaskInstance) => {
    const key = task.instanceKey;
    const current = completionOverridesRef.current.has(key) ? completionOverridesRef.current.get(key)! : isDone(task);
    const completed = !current;
    if (completed) {
      const undoId = addUndoEntry(task);
      persistCompletion(task, true, undoId);
    } else {
      removeUndoForTask(key);
      persistCompletion(task, false);
    }
  };

  const undoCompletion = (id: string) => {
    const entry = undoEntriesRef.current.find((item) => item.id === id);
    if (!entry || entry.expiresAt < Date.now()) { removeUndoEntry(id); return; }
    removeUndoEntry(id);
    persistCompletion(entry.task, false);
  };

  const openPersonalAdd = (target: DateKey | null, trigger: HTMLElement) => { quickAddTriggerRef.current = trigger; setQuickTargetDate(target); showSurface('todo-add-personal'); };
  const createPersonalTask = async (title: string, targetDate: DateKey | null) => {
    await todoRepository.createQuickTask(title, targetDate);
    await refreshData();
    onNotice(targetDate ? '已添加到 ' + displayDate(targetDate) + '。' : '已添加。');
  };

  const openTaskEditor = (task: TaskInstance, trigger: HTMLElement) => {
    editorTriggerRef.current = trigger;
    setSelectedTask(task);
    onScreenChange('personal-editor');
  };

  const saveMinimalTask = async (title: string, date: DateKey | null) => {
    if (!selectedTask || !selectedBase) throw new Error('找不到正在编辑的任务，请刷新后重试。');
    try {
      if (selectedTask.periodDate && selectedBase.seriesId) {
        await todoRepository.saveOccurrenceOverride(selectedBase.id, selectedTask.periodDate, { title, scheduledDate: date ?? selectedTask.periodDate });
      } else {
        await todoRepository.saveTask({ ...selectedBase, title, scheduledDate: date });
      }
      await refreshData();
      onNotice('任务已保存。');
    } catch (error) {
      onNotice(error instanceof Error ? error.message : '保存失败，请重试。');
      throw error;
    }
  };

  const deleteMinimalTask = async () => {
    if (!selectedTask || !selectedBase) throw new Error('找不到正在删除的任务，请刷新后重试。');
    try {
      if (selectedTask.periodDate && selectedBase.seriesId) await todoRepository.skipOccurrence(selectedBase.id, selectedTask.periodDate);
      else await todoRepository.deleteTask(selectedBase.id);
      await refreshData();
      onNotice('任务已删除。');
    } catch (error) {
      onNotice(error instanceof Error ? error.message : '删除失败，请重试。');
      throw error;
    }
  };

  const personalHomeProps = {
    selectedDate,
    allView,
    onSelectDate: setSelectedDate,
    onSelectView: setAllView,
    pendingTasks: pendingInstances,
    completedTasks: completedInstances,
    onToggleTask: handleTaskToggle,
    onEditTask: openTaskEditor,
    onOpenAdd: (trigger: HTMLElement) => openPersonalAdd(allView ? todayKey() : selectedDate, trigger)
  };
  const captureToggleButton = (button: HTMLButtonElement | null) => { if (button) spaceToggleRef.current = button; };
  const personalHome = <PersonalTodoView {...personalHomeProps} toggleRef={captureToggleButton}/>;
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
  const closeTaskEditor = () => { setSelectedTask(null); onBack(); };
  const personalEditorOverlay = active && isPersonalEditor && selectedTask && selectedBase ? createPortal(<MinimalTaskEditor
    task={selectedTask}
    removesSeriesHistory={selectedBase.seriesId !== null && selectedTask.periodDate === null && selectedBase.recurrenceHistory.length > 0}
    onClose={closeTaskEditor}
    onSave={saveMinimalTask}
    onDelete={deleteMinimalTask}
  />, document.body) : null;
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
      {ripple.target === "personal" ? <PersonalTodoView {...personalHomeProps}/> : <CoupleHome expandedCard={expandedCard} onExpand={() => undefined} onEdit={() => undefined} selectedTags={selectedTags} onToggleTag={() => undefined} onHistory={() => undefined} onNotice={() => undefined}/>}
    </div>{ripple.target === "personal" ? <div className="todo-minimal-fab todo-preview-fab" aria-hidden="true"><Icon name="plus"/></div> : <div className="todo-fab todo-fab-couple todo-preview-fab" aria-hidden="true"><Icon name="plus"/><span>加一件小事</span></div>}</div>
  </div>;

  return <>
    <div ref={rootRef} className="todo-module-root" data-current-space={snapshot.todoSpace} data-loading={dataLoading ? "true" : "false"} aria-busy={rippleBusy.current} aria-hidden={isPersonalEditor || showQuickAdd || undefined} inert={!!ripple || isPersonalEditor || showQuickAdd} onClick={isHomeScreen ? handleRootToggle : undefined}>
      <section className={"todo-module-page todo-page-" + snapshot.todoSpace} aria-label={snapshot.todoSpace === "personal" ? "待办" : "我们的小事"}>
        {dataError && snapshot.todoSpace === "personal" && <p className="todo-data-error" role="alert">{dataError} 请检查存储空间后重试。 <button type="button" onClick={() => { setDataLoading(true); void refreshData().catch((error: unknown) => { setDataLoading(false); setDataError(error instanceof Error ? error.message : "读取失败。"); }); }}>重试</button></p>}
        {layout}
      </section>
    </div>
    {preview && createPortal(preview, document.body)}
    {personalEditorOverlay}
    {active && isHomeScreen && !dialogKind && !ripple && snapshot.todoSpace === "couple" && <FloatingAdd space="couple" onClick={() => showSurface("todo-add-couple")}/>}
    {active && dialogKind && <TodoDialog kind={dialogKind} onBack={onBack} onNotice={onNotice} onRangeChange={setHistoryRange} range={historyRange} targetDate={quickTargetDate} onCreatePersonal={createPersonalTask}/>}
    {active && isHomeScreen && snapshot.todoSpace === 'personal' && undoEntries.at(-1) && <div className="todo-undo-toast" role="status" aria-live="polite">
      <span>已完成「{undoEntries.at(-1)!.task.title}」</span>
      <button type="button" aria-label={'撤销完成：' + undoEntries.at(-1)!.task.title} onClick={() => undoCompletion(undoEntries.at(-1)!.id)}>撤销</button>
    </div>}
    {active && quickMessage && <div className="todo-live-message" role="status">{quickMessage}</div>}
  </>;
}
