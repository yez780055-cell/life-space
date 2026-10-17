import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { NavigationSnapshot, TodoScreen, TodoSpace } from '../../app/navigation/model';
import { Icon } from '../../shared/ui/icons';
import { addDays, fromDateKey, todayKey } from './data/dates';
import type { DateKey, PersonalTag, PersonalTask, TaskInstance } from './data/model';
import { allInstances, occurrencesInRange } from './data/recurrence';
import { reminderSchedule } from './data/reminders';
import { todoRepository } from './data/repository';
import { MinimalTaskEditor, PersonalTodoView, trapDialogKeyboard, type MinimalTaskDraft } from './PersonalTodoView';
import { CoupleEditorPage, CoupleHistoryFilterDialog, CoupleHistoryPage, CoupleHome } from './couple/CoupleViews';
import { DEFAULT_COUPLE_HISTORY_RANGE, type CoupleHistoryRange, type CoupleItem, type CoupleItemDraft, type CoupleTag } from './couple/model';
import { useCoupleTodo } from './couple/useCoupleTodo';


type UndoEntry = { id: string; task: TaskInstance; expiresAt: number };

const dateFormatter = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });


function displayDate(key: DateKey) { return dateFormatter.format(fromDateKey(key)).replace('星期', '周'); }
function isDone(task: TaskInstance) { return task.completedAt !== null; }

function TodoDialog({ kind, onBack, onNotice, targetDate, coupleTags, onCreatePersonal, onCreateCouple, onCreateCoupleDetail, onCreateTag }: {
  kind: 'todo-add-personal' | 'todo-add-couple'; onBack: () => void; onNotice: (text: string) => void;
  targetDate: DateKey | null; coupleTags: CoupleTag[];
  onCreatePersonal: (title: string, date: DateKey | null) => Promise<void>; onCreateCouple: (title: string) => Promise<void>;
  onCreateCoupleDetail: (draft: CoupleItemDraft) => Promise<void>; onCreateTag: (name: string) => Promise<CoupleTag>;
}) {
  const titleInputRef = useRef<HTMLInputElement>(null);
  const quickDialogRef = useRef<HTMLFormElement>(null);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState<DateKey | ''>(kind === 'todo-add-personal' ? targetDate ?? todayKey() : '');
  const [coupleMode, setCoupleMode] = useState<'quick' | 'detail'>('quick');
  const [time, setTime] = useState('');
  const [note, setNote] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [pendingTags, setPendingTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const personal = kind === 'todo-add-personal';

  useEffect(() => { titleInputRef.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => trapDialogKeyboard(event, quickDialogRef.current, onBack);
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onBack]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = title.trim();
    if (!normalized || saving) return;
    setSaving(true);
    setFormError('');
    try {
      if (personal) {
        await onCreatePersonal(normalized, date ? date as DateKey : null);
      } else if (coupleMode === 'quick') {
        await onCreateCouple(normalized);
      } else {
        const tagIds = [...selectedTags];
        for (const name of pendingTags) tagIds.push((await onCreateTag(name)).id);
        await onCreateCoupleDetail({ title: normalized, scheduledDate: date ? date as DateKey : null, scheduledTime: date ? time || null : null, tags: [...new Set(tagIds)], note });
        onBack();
        return;
      }
      setTitle('');
      requestAnimationFrame(() => titleInputRef.current?.focus({ preventScroll: true }));
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存失败，请保留输入后重试。';
      if (!personal && coupleMode === 'detail') setFormError(message);
      else onNotice(message);
    } finally { setSaving(false); }
  };

  const addTag = async () => {
    if (!newTag.trim() || saving) return;
    const name = newTag.trim().replace(/\s+/g, ' ');
    setFormError('');
    setPendingTags((current) => current.some((value) => value.toLocaleLowerCase() === name.toLocaleLowerCase()) ? current : [...current, name]);
    setNewTag('');
  };

  return <div className={'todo-dialog-backdrop' + (personal ? ' todo-minimal-quick-backdrop' : ' todo-couple-add-backdrop')} onMouseDown={(event) => { if (event.target === event.currentTarget) onBack(); }}>
    <form ref={quickDialogRef} className={'todo-quick-dialog' + (personal ? ' todo-minimal-quick-dialog' : ' todo-couple-add-dialog')} onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="quick-title-heading">
      <button type="button" className="todo-dialog-close" onClick={onBack} aria-label="关闭"><Icon name="close"/></button>
      <span className="todo-dialog-mark"><Icon name={personal ? 'plus' : 'heart'}/></span>
      {personal && <p className="todo-kicker">QUICK CAPTURE</p>}
      <h2 id="quick-title-heading">{personal ? '快速添加' : coupleMode === 'quick' ? '快速添加小事' : '详细添加小事'}</h2>
      {!personal && <div className="couple-add-modes" role="group" aria-label="添加方式">
        <button type="button" disabled={saving} aria-pressed={coupleMode === 'quick'} className={coupleMode === 'quick' ? 'active' : ''} onClick={() => setCoupleMode('quick')}>快速</button>
        <button type="button" disabled={saving} aria-pressed={coupleMode === 'detail'} className={coupleMode === 'detail' ? 'active' : ''} onClick={() => setCoupleMode('detail')}>详细</button>
      </div>}
      <label className="todo-form-field"><span>{personal ? '任务内容' : '事项标题'}</span>
        <input ref={titleInputRef} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={personal ? '想做什么？' : '想一起做些什么？'} aria-label={personal ? '任务内容' : '事项标题'} maxLength={500} disabled={saving}/>
      </label>
      {personal
        ? <label className="todo-form-field"><span>日期</span><input type="date" value={date} onChange={(event) => setDate(event.target.value as DateKey | '')} aria-label="任务日期" disabled={saving}/></label>
        : coupleMode === 'quick'
          ? <div className="todo-quick-destination"><Icon name="calendar"/><span>添加到未安排</span></div>
          : <>
            <div className="todo-form-grid">
              <label className="todo-form-field"><span>安排日期</span><input type="date" value={date} onChange={(event) => { setDate(event.target.value as DateKey | ''); if (!event.target.value) setTime(''); }} aria-label="安排日期" disabled={saving}/></label>
              <label className="todo-form-field"><span>时间（可选）</span><input type="time" value={time} onChange={(event) => setTime(event.target.value)} aria-label="安排时间" disabled={!date || saving}/></label>
            </div>
            <div className="todo-form-field"><span>标签</span><div className="todo-editor-tags couple-add-tags">{coupleTags.map((tag) => <button type="button" disabled={saving} className={selectedTags.includes(tag.id) ? 'active' : ''} aria-pressed={selectedTags.includes(tag.id)} key={tag.id} onClick={() => setSelectedTags((current) => current.includes(tag.id) ? current.filter((id) => id !== tag.id) : [...current, tag.id])}>{tag.name}</button>)}{pendingTags.map((name) => <button type="button" className="active is-pending-tag" aria-pressed="true" key={name} title="提交后创建" onClick={() => setPendingTags((current) => current.filter((value) => value !== name))}>{name}</button>)}{coupleTags.length === 0 && pendingTags.length === 0 && <span className="couple-filter-empty">暂无标签</span>}</div>
              <div className="couple-tag-create"><input aria-label="新建情侣标签" maxLength={40} value={newTag} onChange={(event) => setNewTag(event.target.value)} placeholder="新建标签" disabled={saving}/><button type="button" className="todo-secondary-button" disabled={!newTag.trim() || saving} onClick={() => void addTag()}>添加标签</button></div>
            </div>
            <label className="todo-form-field"><span>备注</span><textarea rows={3} maxLength={5000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="备注（可选）" disabled={saving}/></label>
          </>}
      {formError && <p className="todo-data-error" role="alert">{formError}</p>}
      <div className="todo-dialog-actions"><button type="button" className="todo-secondary-button" onClick={onBack}>关闭</button>
        <button className={'todo-primary-button' + (!personal ? ' couple' : '')} type="submit" disabled={!title.trim() || saving}>{saving ? '添加中…' : '添加'}</button>
      </div>
    </form>
  </div>;
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
  const [personalTagRecords, setPersonalTagRecords] = useState<PersonalTag[]>([]);
  const [occurrenceRecords, setOccurrenceRecords] = useState<Awaited<ReturnType<typeof todoRepository.listOccurrences>>>([]);
  const [completionOverrides, setCompletionOverrides] = useState<Map<string, boolean>>(() => new Map());
  const completionOverridesRef = useRef(completionOverrides);
  const pendingCompletionWrites = useRef<Map<string, Promise<void>>>(new Map());
  const [undoEntries, setUndoEntries] = useState<UndoEntry[]>([]);
  const undoEntriesRef = useRef(undoEntries);
  const undoTimers = useRef<Map<string, number>>(new Map());
  const coupleUndoTimer = useRef<number | undefined>(undefined);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState("");
  const [notificationPermission, setNotificationPermission] = useState(() => typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  const [reminderRefreshTick, setReminderRefreshTick] = useState(0);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedCoupleItemId, setSelectedCoupleItemId] = useState<string | null>(null);
  const [coupleUndoEntry, setCoupleUndoEntry] = useState<CoupleItem | null>(null);
  const coupleData = useCoupleTodo();
  const [historyRange, setHistoryRange] = useState<CoupleHistoryRange>(DEFAULT_COUPLE_HISTORY_RANGE);
  const [quickTargetDate, setQuickTargetDate] = useState<DateKey | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskInstance | null>(null);
  const [quickMessage, setQuickMessage] = useState("");
  const [spaceChanging, setSpaceChanging] = useState(false);
  const spaceToggleRef = useRef<HTMLButtonElement>(null);
  const editorTriggerRef = useRef<HTMLElement | null>(null);
  const quickAddTriggerRef = useRef<HTMLElement | null>(null);
  const previousSpace = useRef(snapshot.todoSpace);
  const noticeTimer = useRef<number | undefined>(undefined);
  const reminderTimers = useRef<Map<string, number>>(new Map());
  const sentReminders = useRef<Set<string>>(new Set());

  const refreshData = useCallback(async () => {
    const [nextTasks, nextOccurrences, nextTags] = await Promise.all([
      todoRepository.listTasks(), todoRepository.listOccurrences(), todoRepository.listTags()
    ]);
    setTaskRecords(nextTasks);
    setOccurrenceRecords(nextOccurrences);
    setPersonalTagRecords(nextTags);
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

  useLayoutEffect(() => {
    if (previousSpace.current === snapshot.todoSpace) return;
    previousSpace.current = snapshot.todoSpace;
    setSpaceChanging(true);
    const frame = requestAnimationFrame(() => {
      setSpaceChanging(false);
      requestAnimationFrame(() => spaceToggleRef.current?.focus({ preventScroll: true }));
    });
    return () => cancelAnimationFrame(frame);
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

  useEffect(() => {
    const timers = reminderTimers.current;
    const undoTimeouts = undoTimers.current;
    return () => {
      if (noticeTimer.current !== undefined) window.clearTimeout(noticeTimer.current);
      for (const timer of timers.values()) window.clearTimeout(timer);
      timers.clear();
      for (const timer of undoTimeouts.values()) window.clearTimeout(timer);
      undoTimeouts.clear();
      if (coupleUndoTimer.current !== undefined) window.clearTimeout(coupleUndoTimer.current);
    };
  }, []);

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

  const createCoupleQuick = async (title: string) => {
    await coupleData.createQuick(title);
    onNotice('已添加到未安排。');
  };
  const createCoupleDetailed = async (draft: CoupleItemDraft) => {
    await coupleData.save(draft);
    onNotice('情侣事项已保存到此设备。');
  };
  const openCoupleEditor = (id: string) => {
    setSelectedCoupleItemId(id);
    setExpandedCard(null);
    onScreenChange('couple-editor');
  };
  const saveCoupleItem = async (draft: CoupleItemDraft) => {
    await coupleData.save(draft);
    onNotice('情侣事项已保存到此设备。');
  };
  const deleteCoupleItem = async (item: CoupleItem) => {
    await coupleData.remove(item.id, item.revision);
    onNotice('情侣事项已删除。');
  };
  const createCoupleTag = async (name: string) => coupleData.upsertTag(name);
  const unplanCoupleItem = async (item: CoupleItem) => {
    try {
      await coupleData.save({ id: item.id, expectedRevision: item.revision, title: item.title, scheduledDate: null, scheduledTime: null, tags: item.tags, note: item.note });
      onNotice('已移回未安排。');
    } catch (error) { onNotice(error instanceof Error ? error.message : '取消安排失败，请重试。'); }
  };
  const scheduleByDrop = async (item: CoupleItem) => {
    try {
      await coupleData.save({ id: item.id, expectedRevision: item.revision, title: item.title, scheduledDate: todayKey(), scheduledTime: null, tags: item.tags, note: item.note });
      onNotice('已安排到今天；可打开事项调整日期和时间。');
    } catch (error) { onNotice(error instanceof Error ? error.message : '安排失败，请重试。'); }
  };
  const completeCoupleItem = async (item: CoupleItem) => {
    try {
      const completed = await coupleData.complete(item);
      setCoupleUndoEntry(completed);
      if (coupleUndoTimer.current !== undefined) window.clearTimeout(coupleUndoTimer.current);
      coupleUndoTimer.current = window.setTimeout(() => {
        setCoupleUndoEntry((current) => current?.id === completed.id ? null : current);
        coupleUndoTimer.current = undefined;
      }, 5000);
    } catch (error) { onNotice(error instanceof Error ? error.message : '完成状态保存失败，请重试。'); }
  };
  const undoCoupleCompletion = () => {
    const item = coupleUndoEntry;
    if (!item) return;
    if (coupleUndoTimer.current !== undefined) window.clearTimeout(coupleUndoTimer.current);
    coupleUndoTimer.current = undefined;
    setCoupleUndoEntry(null);
    void coupleData.restore(item).then(() => onNotice('已撤销完成。'))
      .catch((error: unknown) => onNotice(error instanceof Error ? error.message : '撤销失败，请从历史记录重试。'));
  };
  const restoreCoupleHistory = (item: CoupleItem) => {
    void coupleData.restore(item).then(() => onNotice('已恢复到待办。'))
      .catch((error: unknown) => onNotice(error instanceof Error ? error.message : '恢复失败，请重试。'));
  };

  const openTaskEditor = (task: TaskInstance, trigger: HTMLElement) => {
    editorTriggerRef.current = trigger;
    setSelectedTask(task);
    onScreenChange('personal-editor');
  };

  const saveMinimalTask = async (draft: MinimalTaskDraft) => {
    if (!selectedTask || !selectedBase) throw new Error('找不到正在编辑的任务，请刷新后重试。');
    try {
      const tagIds = [...draft.tags];
      for (const name of draft.newTags) tagIds.push((await todoRepository.upsertTag(name)).id);
      const taskTags = [...new Set(tagIds)];
      if (selectedTask.periodDate && selectedBase.seriesId) {
        await todoRepository.saveOccurrenceOverride(selectedBase.id, selectedTask.periodDate, {
          title: draft.title,
          scheduledDate: draft.date ?? selectedTask.periodDate,
          scheduledTime: draft.time,
          note: draft.note,
          tags: taskTags,
          subtasks: draft.subtasks,
          reminder: draft.reminder
        });
      } else {
        await todoRepository.saveTask({
          ...selectedBase,
          title: draft.title,
          scheduledDate: draft.date,
          scheduledTime: draft.time,
          note: draft.note,
          tags: taskTags,
          subtasks: draft.subtasks,
          reminder: draft.reminder
        });
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
    onToggleSubtask: async (task: TaskInstance, subtaskId: string, checked: boolean) => {
      try {
        await todoRepository.setSubtaskChecked(task.taskId, task.periodDate, subtaskId, checked);
        await refreshData();
      } catch (error) {
        onNotice(error instanceof Error ? error.message : '子任务状态保存失败，请重试。');
      }
    },
    onEditTask: openTaskEditor,
    onOpenAdd: (trigger: HTMLElement) => openPersonalAdd(allView ? todayKey() : selectedDate, trigger),
    tagLabels: Object.fromEntries(personalTagRecords.map((tag) => [tag.id, tag.name]))
  };
  const captureToggleButton = (button: HTMLButtonElement | null) => { if (button) spaceToggleRef.current = button; };
  const personalHome = <PersonalTodoView {...personalHomeProps} toggleRef={captureToggleButton}/>;
  const toggleCoupleTag = (tagId: string) => setSelectedTags((current) => current.includes(tagId) ? current.filter((item) => item !== tagId) : [...current, tagId]);
  const coupleHomeProps = {
    items: coupleData.items, tags: coupleData.tags, loading: coupleData.loading, error: coupleData.error,
    selectedTags, expandedCard, toggleRef: captureToggleButton,
    onToggleTag: toggleCoupleTag,
    onExpand: (id: string) => setExpandedCard((current) => current === id ? null : id),
    onEdit: openCoupleEditor,
    onComplete: completeCoupleItem,
    onUnplan: unplanCoupleItem,
    onHistory: () => onScreenChange('couple-history'),
    onRetry: () => { void coupleData.retry(); },
    onDropSchedule: scheduleByDrop
  };
  const coupleHome = <CoupleHome {...coupleHomeProps}/>;
  const coupleEditorItem = coupleData.items.find((item) => item.id === selectedCoupleItemId) ?? null;
  let layout: ReactNode;
  if (snapshot.todoScreen === 'couple-editor') {
    layout = <CoupleEditorPage item={coupleEditorItem} missing={selectedCoupleItemId !== null && !coupleEditorItem && !coupleData.loading} tags={coupleData.tags}
      onBack={() => { setSelectedCoupleItemId(null); onBack(); }} onSave={saveCoupleItem} onDelete={deleteCoupleItem} onCreateTag={createCoupleTag}/>;
  } else if (snapshot.todoScreen === 'couple-history') {
    layout = <CoupleHistoryPage items={coupleData.items} tags={coupleData.tags} selectedTags={selectedTags} range={historyRange}
      onToggleTag={toggleCoupleTag} onRange={() => showSurface('history-filter')} onBack={onBack} onRestore={restoreCoupleHistory}/>;
  } else if (snapshot.todoSpace === 'couple') {
    layout = coupleHome;
  } else {
    layout = personalHome;
  }
  const dialogKind = showQuickAdd ? currentOverlay as 'todo-add-personal' | 'todo-add-couple' : null;
  const closeTaskEditor = () => { setSelectedTask(null); onBack(); };
  const personalEditorOverlay = active && isPersonalEditor && selectedTask && selectedBase ? createPortal(<MinimalTaskEditor
    task={selectedTask}
    tagOptions={personalTagRecords}
    removesSeriesHistory={selectedBase.seriesId !== null && selectedTask.periodDate === null && selectedBase.recurrenceHistory.length > 0}
    onClose={closeTaskEditor}
    onSave={saveMinimalTask}
    onDelete={deleteMinimalTask}
  />, document.body) : null;
  const handleRootToggle = (event: MouseEvent<HTMLDivElement>) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-space-toggle='true']");
    if (!button) return;
    spaceToggleRef.current = button;
    onSpaceChange(snapshot.todoSpace === "personal" ? "couple" : "personal");
  };

  return <>
    <div className="todo-module-root" data-current-space={snapshot.todoSpace} data-loading={dataLoading ? "true" : "false"} aria-hidden={isPersonalEditor || showQuickAdd || showRangeDialog || undefined} inert={isPersonalEditor || showQuickAdd || showRangeDialog} onClick={isHomeScreen ? handleRootToggle : undefined}>
      <section className={"todo-module-page todo-page-" + snapshot.todoSpace + (spaceChanging ? ' is-space-changing' : '')} aria-label={snapshot.todoSpace === "personal" ? "待办" : "我们的小事"}>
        {dataError && snapshot.todoSpace === "personal" && <p className="todo-data-error" role="alert">{dataError} 请检查存储空间后重试。 <button type="button" onClick={() => { setDataLoading(true); void refreshData().catch((error: unknown) => { setDataLoading(false); setDataError(error instanceof Error ? error.message : "读取失败。"); }); }}>重试</button></p>}
        {layout}
      </section>
    </div>
    {personalEditorOverlay}
    {active && isHomeScreen && !dialogKind && !showRangeDialog && snapshot.todoSpace === "couple" && <FloatingAdd space="couple" onClick={() => showSurface("todo-add-couple")}/>}
    {active && dialogKind && <TodoDialog kind={dialogKind} onBack={onBack} onNotice={onNotice} targetDate={quickTargetDate} coupleTags={coupleData.tags} onCreatePersonal={createPersonalTask} onCreateCouple={createCoupleQuick} onCreateCoupleDetail={createCoupleDetailed} onCreateTag={createCoupleTag}/>}
    {active && showRangeDialog && snapshot.todoScreen === 'couple-history' && <CoupleHistoryFilterDialog range={historyRange} onBack={onBack} onApply={setHistoryRange}/>}
    {active && isHomeScreen && snapshot.todoSpace === 'couple' && coupleUndoEntry && <div className="todo-undo-toast" role="status" aria-live="polite">
      <span>已完成「{coupleUndoEntry.title}」</span><button type="button" aria-label={`撤销完成：${coupleUndoEntry.title}`} onClick={undoCoupleCompletion}>撤销</button>
    </div>}
    {active && isHomeScreen && snapshot.todoSpace === 'personal' && undoEntries.at(-1) && <div className="todo-undo-toast" role="status" aria-live="polite">
      <span>已完成「{undoEntries.at(-1)!.task.title}」</span>
      <button type="button" aria-label={'撤销完成：' + undoEntries.at(-1)!.task.title} onClick={() => undoCompletion(undoEntries.at(-1)!.id)}>撤销</button>
    </div>}
    {active && quickMessage && <div className="todo-live-message" role="status">{quickMessage}</div>}
  </>;
}
