import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type MouseEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { NavigationSnapshot, TodoScreen, TodoSpace } from '../../app/navigation/model';
import { Icon } from '../../shared/ui/icons';

type TodoItem = { id: string; title: string; time?: string; done?: boolean; tags?: string[]; dayOffset: number };
type CoupleItem = { id: string; title: string; tags: string[]; planned?: string; time?: string };
type TimeView = 'today' | 'week' | 'month';
type RippleState = { target: TodoSpace; x: number; y: number; radius: number; left: number; top: number; width: number; height: number; running: boolean };

const personalTasks: TodoItem[] = [
  { id: 'water', title: '给绿植浇水', time: '09:30', dayOffset: 0 },
  { id: 'invoice', title: '整理本周工作票据', time: '14:00', dayOffset: 0 },
  { id: 'walk', title: '晚饭后散步二十分钟', time: '19:30', dayOffset: 0 },
  { id: 'book', title: '读一会儿《当下的力量》', time: '21:00', dayOffset: 0, done: true }
];
const collectionItems = ['想到一件要买的小东西', '周末给阳台收拾一下'];
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

function plannedDate(offset: number) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function dateAtOffset(offset: number, base = new Date()) {
  const date = startOfDay(base);
  date.setDate(date.getDate() + offset);
  return date;
}

function weekDates(date: Date) {
  const monday = startOfDay(date);
  const weekday = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - weekday);
  return Array.from({ length: 7 }, (_, index) => {
    const value = new Date(monday);
    value.setDate(monday.getDate() + index);
    return value;
  });
}

function displayTaskDate(date: Date, today: Date) {
  if (date.toDateString() === today.toDateString()) return '今天';
  const tomorrow = dateAtOffset(1, today);
  if (date.toDateString() === tomorrow.toDateString()) return '明天';
  return dateFormatter.format(date).replace('星期', '周');
}

function periodSummary(view: TimeView, now: Date) {
  if (view === 'today') return dateFormatter.format(now).replace('星期', '周');
  if (view === 'month') return fullDateFormatter.format(now);
  const days = weekDates(now);
  return `${shortDateFormatter.format(days[0])} — ${shortDateFormatter.format(days[6])}`;
}

function isSameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

function DemoNotice({ children }: { children: ReactNode }) {
  return <p className="todo-demo-note">{children}</p>;
}

function TaskLine({ task, onToggle, onOpen }: { task: TodoItem; onToggle: () => void; onOpen: () => void }) {
  return <div className={`todo-task-row ${task.done ? 'is-done' : ''}`}>
    <button className="todo-check" aria-label={`${task.done ? '恢复任务' : '完成任务'}：${task.title}`} aria-pressed={!!task.done} onClick={onToggle}><Icon name="check"/></button>
    <button className="todo-task-open" onClick={onOpen}>
      <span className="todo-task-title">{task.title}</span>
      {task.time && <span className="todo-task-time"><Icon name="clock"/>{task.time}</span>}
    </button>
    <button className="todo-task-edit" onClick={onOpen} aria-label={`编辑任务：${task.title}`}><Icon name="chevron"/></button>
  </div>;
}

function PersonalHome({
  view, onView, inboxOpen, onInbox, hideCompleted, onHideCompleted, tasks, onToggleTask, onEditTask, activeDate, onPickMonthDate, monthDate, preview, onOpenAdd, toggleRef
}: {
  view: TimeView; onView: (view: TimeView) => void; inboxOpen: boolean; onInbox: () => void; hideCompleted: boolean; onHideCompleted: () => void;
  tasks: TodoItem[]; onToggleTask: (id: string) => void; onEditTask: (id: string) => void; activeDate: Date; onPickMonthDate: (date: Date) => void; monthDate: Date; preview: boolean; onOpenAdd: () => void; toggleRef?: (button: HTMLButtonElement | null) => void;
}) {
  const today = startOfDay(new Date());
  const unfinished = tasks.filter((task) => !task.done);
  const finished = tasks.filter((task) => task.done);
  const shownTasks = hideCompleted ? unfinished : [...unfinished, ...finished];
  const calendarCells = useMemo(() => {
    const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    const count = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
    const total = Math.ceil((offset + count) / 7) * 7;
    return Array.from({ length: total }, (_, index) => {
      const day = index - offset + 1;
      return day > 0 && day <= count ? new Date(monthDate.getFullYear(), monthDate.getMonth(), day) : null;
    });
  }, [monthDate]);
  const markedDays = new Set([today.getDate(), Math.min(new Date(today.getFullYear(), today.getMonth(), 0).getDate(), today.getDate() - 2), Math.min(new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate(), today.getDate() + 2), Math.min(new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate(), today.getDate() + 5)]);
  const weekTasks: Array<{ date: Date; items: TodoItem[] }> = [
    { date: dateAtOffset(-2, today), items: [{ id: 'week-home', title: '收好换季衣物', time: '16:00', dayOffset: -2 }] },
    { date: today, items: tasks },
    { date: dateAtOffset(1, today), items: [{ id: 'week-call', title: '给家里打个电话', time: '20:00', dayOffset: 1 }, { id: 'week-water', title: '记得买饮用水', dayOffset: 1 }] },
    { date: dateAtOffset(4, today), items: [{ id: 'week-clean', title: '整理一下书桌', dayOffset: 4, done: true }] }
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  return <div className="todo-personal-content" data-preview={preview}>
    <header className="todo-page-header">
      <div><p className="todo-kicker">{dateFormatter.format(new Date()).replace('星期', '周')}</p><h1>待办</h1><p className="todo-subtitle">把重要的小事，放在眼前。</p></div>
      <button ref={toggleRef} className="todo-space-toggle" data-space-toggle="true" type="button" aria-label="进入情侣专区" title="进入情侣专区"><Icon name="sun"/></button>
    </header>
    <div className="todo-period-row" role="tablist" aria-label="待办时间范围">
      {(['today', 'week', 'month'] as const).map((id) => <button key={id} role="tab" aria-selected={view === id} className={view === id ? 'selected' : ''} onClick={() => onView(id)}>{id === 'today' ? '今天' : id === 'week' ? '本周' : '本月'}</button>)}
    </div>
    <button className={`todo-inbox ${inboxOpen ? 'expanded' : ''}`} onClick={onInbox} aria-expanded={inboxOpen}>
      <span className="todo-inbox-mark"><Icon name="inbox"/></span><span className="todo-inbox-copy"><strong>收集箱</strong><small>{collectionItems.length} 件待安排的小事</small></span><span className="todo-inbox-count">{collectionItems.length}</span><Icon name="chevron" className="todo-inbox-chevron"/>
    </button>
    {inboxOpen && <div className="todo-inbox-list" aria-label="收集箱示例任务">
      {collectionItems.map((item) => <button key={item} onClick={onOpenAdd}><span className="todo-small-dot"/>{item}<Icon name="chevron"/></button>)}
      <span className="todo-inbox-caption">界面示例 · 暂无真实任务数据</span>
    </div>}

    {view === 'today' && <section className="todo-day-section" aria-label="今天的任务">
      <div className="todo-section-heading"><div><p className="todo-overline">{dateFormatter.format(activeDate).replace('星期', '周')}</p><h2>今天</h2></div><button className="todo-subtle-button" onClick={onHideCompleted}>{hideCompleted ? '显示已完成' : '隐藏已完成'}</button></div>
      <div className="todo-task-list">{shownTasks.map((task) => <TaskLine key={task.id} task={task} onToggle={() => onToggleTask(task.id)} onOpen={() => onEditTask(task.id)}/>)}{shownTasks.length === 0 && <div className="todo-empty">今天还没有任务，留一点空白也很好。</div>}</div>
      <DemoNotice>示例任务仅用于界面预览；勾选状态不会保存。</DemoNotice>
    </section>}

    {view === 'week' && <section className="todo-week-section" aria-label="本周任务">
      <div className="todo-section-heading"><div><p className="todo-overline">{periodSummary('week', new Date())}</p><h2>这一周</h2></div><button className="todo-subtle-button" onClick={onHideCompleted}>{hideCompleted ? '显示已完成' : '隐藏已完成'}</button></div>
      <div className="todo-week-days">{weekTasks.map(({ date, items }) => {
        const visible = hideCompleted ? items.filter((item) => !item.done) : [...items.filter((item) => !item.done), ...items.filter((item) => item.done)];
        if (!visible.length) return null;
        return <section key={date.toISOString()} className="todo-week-day" aria-label={`${displayTaskDate(date, today)}的任务`}>
          <div className="todo-week-date"><span className={isSameDay(date, today) ? 'today-dot' : ''}>{date.toLocaleDateString('zh-CN', { weekday: 'short' })}</span><strong>{date.getDate()}</strong><small>{displayTaskDate(date, today)}</small></div>
          <div className="todo-task-list">{visible.map((task) => <TaskLine key={task.id} task={task} onToggle={() => onToggleTask(task.id)} onOpen={() => onEditTask(task.id)}/>)}</div>
        </section>;
      })}</div>
      <DemoNotice>本周仅展示部分示例日期；无任务的日期会保持留白。</DemoNotice>
    </section>}

    {view === 'month' && <section className="todo-month-section" aria-label="本月日历">
      <div className="todo-section-heading"><div><p className="todo-overline">任务日历</p><h2>{fullDateFormatter.format(monthDate)}</h2></div><span className="todo-calendar-summary">{markedDays.size} 个有安排的日期</span></div>
      <div className="todo-calendar" role="grid" aria-label={fullDateFormatter.format(monthDate)}>
        {['一', '二', '三', '四', '五', '六', '日'].map((day) => <span key={day} className="todo-calendar-weekday" role="columnheader">{day}</span>)}
        {calendarCells.map((date, index) => date ? <button key={date.toISOString()} className={`todo-calendar-day ${isSameDay(date, activeDate) ? 'is-current' : ''}`} role="gridcell" aria-label={`${date.getMonth() + 1}月${date.getDate()}日${markedDays.has(date.getDate()) ? '，有示例任务' : ''}`} aria-selected={isSameDay(date, activeDate)} onClick={() => onPickMonthDate(date)}><span>{date.getDate()}</span>{markedDays.has(date.getDate()) && <i/>}</button> : <span key={`blank-${index}`} className="todo-calendar-day blank" aria-hidden="true"/>)}
      </div>
      <DemoNotice>月历仅展示日期与示例任务提示；日期聚焦动画将在下一阶段实现。</DemoNotice>
    </section>}
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

function PersonalEditor({ onBack, onSaved }: { onBack: () => void; onSaved: () => void }) {
  const [tags, setTags] = useState(['工作']);
  const [reminder, setReminder] = useState(true);
  const toggleTag = (tag: string) => setTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]);
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); onSaved(); };
  return <form className="todo-subpage todo-editor" onSubmit={submit}>
    <header className="todo-subpage-header"><button type="button" className="todo-back-button" onClick={onBack} aria-label="返回"><Icon name="arrow"/></button><div><p className="todo-kicker">PERSONAL TASK</p><h1>编辑任务</h1></div><span className="todo-editor-space">个人待办</span></header>
    <label className="todo-form-field"><span>标题</span><input defaultValue="整理本周工作票据" aria-label="任务标题"/></label>
    <div className="todo-form-grid"><label className="todo-form-field"><span>日期</span><input type="date" defaultValue={new Date().toISOString().slice(0, 10)}/></label><label className="todo-form-field"><span>具体时间</span><input type="time" defaultValue="14:00"/></label></div>
    <label className="todo-form-field"><span>备注</span><textarea rows={3} placeholder="写下需要记住的细节"/></label>
    <label className="todo-form-field"><span><Icon name="repeat"/>重复规则</span><select defaultValue="none"><option value="none">不重复</option><option>每天</option><option>每周</option><option>每月</option></select></label>
    <button type="button" className={`todo-setting-row ${reminder ? 'enabled' : ''}`} onClick={() => setReminder(!reminder)}><span><Icon name="bell"/>提醒</span><span>{reminder ? '提前 10 分钟' : '关闭'}<i className={reminder ? 'on' : ''}/></span></button>
    <div className="todo-form-field"><span><Icon name="tag"/>标签</span><div className="todo-editor-tags">{['工作', '生活', '重要'].map((tag) => <button type="button" className={tags.includes(tag) ? 'active' : ''} aria-pressed={tags.includes(tag)} key={tag} onClick={() => toggleTag(tag)}>{tag}</button>)}</div></div>
    <div className="todo-form-field"><span><Icon name="subtask"/>子任务</span><div className="todo-subtasks"><label><input type="checkbox"/>整理电子票据</label><label><input type="checkbox" defaultChecked/>确认报销日期</label><button type="button" className="todo-add-subtask">＋ 添加子任务</button></div></div>
    <p className="todo-form-disclaimer">编辑页演示 · 当前不会保存更改</p><div className="todo-form-actions"><button type="button" className="todo-secondary-button" onClick={onBack}>取消</button><button className="todo-primary-button" type="submit">保存</button></div>
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

function TodoDialog({ kind, onBack, onNotice, onRangeChange, range }: { kind: 'todo-add-personal' | 'todo-add-couple' | 'history-filter'; onBack: () => void; onNotice: (text: string) => void; onRangeChange: (range: string) => void; range: string }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState('');
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
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); onNotice(personal ? '界面演示：待办尚未保存。' : '界面演示：情侣事项尚未创建。'); };
  return <div className="todo-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onBack(); }}><form className="todo-quick-dialog" ref={dialogRef as unknown as RefObject<HTMLFormElement>} onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="quick-title-heading">
    <button type="button" className="todo-dialog-close" onClick={onBack} aria-label="关闭"><Icon name="close"/></button><span className="todo-dialog-mark"><Icon name={personal ? 'inbox' : 'heart'}/></span><p className="todo-kicker">{personal ? 'QUICK CAPTURE' : 'LIFE, TOGETHER'}</p><h2 id="quick-title-heading">{personal ? '快速记录' : '记一件我们的小事'}</h2>
    <label className="todo-form-field"><span>{personal ? '任务标题' : '事项标题'}</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={personal ? '先把想法放进收集箱' : '想一起做些什么？'} aria-label={personal ? '任务标题' : '事项标题'}/></label>
    <div className="todo-quick-destination"><Icon name={personal ? 'inbox' : 'calendar'}/><span>{personal ? '默认放入收集箱' : '默认放入未安排'}</span></div>
    <p className="todo-form-disclaimer">这是界面演示，当前不会保存数据。</p><div className="todo-dialog-actions"><button type="button" className="todo-secondary-button" onClick={onBack}>取消</button><button className="todo-primary-button" type="submit" disabled={!title.trim()}>{personal ? '保存' : '添加'}</button></div>
  </form></div>;
}

function SpaceHome(props: {
  space: TodoSpace; view: TimeView; onView: (view: TimeView) => void; inboxOpen: boolean; onInbox: () => void; hideCompleted: boolean; onHideCompleted: () => void;
  tasks: TodoItem[]; onToggleTask: (id: string) => void; onEditTask: (id: string) => void; activeDate: Date; onPickMonthDate: (date: Date) => void; monthDate: Date; preview: boolean;
  expandedCard: string | null; onExpand: (id: string) => void; onEditCouple: (id: string) => void; selectedTags: string[]; onToggleTag: (tag: string) => void; onHistory: () => void; onNotice: (text: string) => void; onOpenAdd: () => void;
  onToggleRef?: (button: HTMLButtonElement | null) => void;
}) {
  const { onToggleRef, ...homeProps } = props;
  return <div className={`todo-space-view todo-${props.space}`}>
    {props.space === 'personal' ? <PersonalHome {...homeProps} toggleRef={onToggleRef}/> : <CoupleHome expandedCard={props.expandedCard} onExpand={props.onExpand} onEdit={props.onEditCouple} selectedTags={props.selectedTags} onToggleTag={props.onToggleTag} onHistory={props.onHistory} onNotice={props.onNotice} toggleRef={onToggleRef}/>}
  </div>;
}

function FloatingAdd({ space, onClick }: { space: TodoSpace; onClick: () => void }) {
  return createPortal(<button className={`todo-fab todo-fab-${space}`} type="button" aria-label={space === 'personal' ? '快速新增待办' : '新增情侣事项'} onClick={onClick}><Icon name="plus"/><span>{space === 'personal' ? '记一件事' : '加一件小事'}</span></button>, document.body);
}

export function TodoModule({ snapshot, onSpaceChange, onScreenChange, showSurface, onBack, active }: {
  snapshot: NavigationSnapshot; onSpaceChange: (space: TodoSpace) => void; onScreenChange: (screen: TodoScreen) => void; showSurface: (surface: 'todo-add-personal' | 'todo-add-couple' | 'history-filter') => void; onBack: () => void; active: boolean;
}) {
  const [view, setView] = useState<TimeView>('week');
  const [inboxOpen, setInboxOpen] = useState(false);
  const [hideCompleted, setHideCompleted] = useState(false);
  const [doneItems, setDoneItems] = useState<string[]>(personalTasks.filter((task) => task.done).map((task) => task.id));
  const [monthDate] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [activeDate, setActiveDate] = useState(() => startOfDay(new Date()));
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [historyRange, setHistoryRange] = useState('近 30 天');
  const [quickMessage, setQuickMessage] = useState('');
  const [ripple, setRipple] = useState<RippleState | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const spaceToggleRef = useRef<HTMLButtonElement>(null);
  const focusSpaceAfterChange = useRef<TodoSpace | null>(null);
  const rippleBusy = useRef(false);
  const finishRippleRef = useRef<() => void>(() => undefined);
  const animationTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (focusSpaceAfterChange.current !== snapshot.todoSpace) return;
    focusSpaceAfterChange.current = null;
    requestAnimationFrame(() => spaceToggleRef.current?.focus({ preventScroll: true }));
  }, [snapshot.todoSpace]);

  const tasks = personalTasks.map((task) => ({ ...task, done: doneItems.includes(task.id) }));
  const currentOverlay = snapshot.surfaces.at(-1);
  const showQuickAdd = currentOverlay === 'todo-add-personal' || currentOverlay === 'todo-add-couple';
  const showRangeDialog = currentOverlay === 'history-filter';
  const home = snapshot.todoScreen === 'home';

  useEffect(() => {
    const settle = () => finishRippleRef.current();
    const onVisibility = () => { if (document.visibilityState === 'hidden') settle(); };
    window.addEventListener('resize', settle);
    window.addEventListener('orientationchange', settle);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('resize', settle);
      window.removeEventListener('orientationchange', settle);
      document.removeEventListener('visibilitychange', onVisibility);
      if (animationTimer.current !== undefined) window.clearTimeout(animationTimer.current);
    };
  }, []);

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

  function startSpaceChange(target: TodoSpace, button: HTMLButtonElement) {
    if (rippleBusy.current) return;
    focusSpaceAfterChange.current = target;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (reduceMotion) { onSpaceChange(target); return; }
    const holder = rootRef.current?.closest('.module-holder') as HTMLElement | null;
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

  const onToggleTask = (id: string) => setDoneItems((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const captureToggleButton = (button: HTMLButtonElement | null) => { if (button) spaceToggleRef.current = button; };
  const onToggleTag = (tag: string) => setSelectedTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]);
  const onNotice = (message: string) => {
    setQuickMessage(message);
    window.setTimeout(() => setQuickMessage(''), 2800);
  };
  const dialogKind = showQuickAdd ? currentOverlay as 'todo-add-personal' | 'todo-add-couple' : showRangeDialog ? 'history-filter' : null;
  const layout = snapshot.todoScreen === 'personal-editor' ? <PersonalEditor onBack={onBack} onSaved={() => onNotice('界面演示：编辑内容尚未保存。')}/> : snapshot.todoScreen === 'couple-editor' ? <CoupleEditor onBack={onBack} onSaved={() => onNotice('界面演示：编辑内容尚未保存。')}/> : snapshot.todoScreen === 'couple-history' ? <CoupleHistory selectedTags={selectedTags} onToggleTag={onToggleTag} range={historyRange} onRange={() => showSurface('history-filter')} onBack={onBack}/> : <SpaceHome
    space={snapshot.todoSpace} view={view} onView={(next) => { if (view === next) { setActiveDate(startOfDay(new Date())); setHideCompleted(false); } else setView(next); }} inboxOpen={inboxOpen} onInbox={() => setInboxOpen((open) => !open)} hideCompleted={hideCompleted} onHideCompleted={() => setHideCompleted((hidden) => !hidden)}
    tasks={tasks} onToggleTask={onToggleTask} onEditTask={() => onScreenChange('personal-editor')} activeDate={activeDate} onPickMonthDate={setActiveDate} monthDate={monthDate} preview={false} expandedCard={expandedCard} onExpand={(id) => setExpandedCard((current) => current === id ? null : id)} onEditCouple={() => onScreenChange('couple-editor')} selectedTags={selectedTags} onToggleTag={onToggleTag} onHistory={() => onScreenChange('couple-history')} onNotice={onNotice} onOpenAdd={() => showSurface(snapshot.todoSpace === 'personal' ? 'todo-add-personal' : 'todo-add-couple')} onToggleRef={captureToggleButton}/>;

  const toggleButton = (event: MouseEvent<HTMLDivElement>) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-space-toggle="true"]');
    if (!button) return;
    spaceToggleRef.current = button;
    startSpaceChange(snapshot.todoSpace === 'personal' ? 'couple' : 'personal', button);
  };

  const preview = ripple && <div
    className={`todo-ripple-layer ${ripple.running ? 'is-running' : ''}`}
    data-testid="space-ripple"
    data-target-space={ripple.target}
    aria-hidden="true"
    inert
    style={{ left: ripple.left, top: ripple.top, width: ripple.width, height: ripple.height, '--ripple-x': `${ripple.x}px`, '--ripple-y': `${ripple.y}px`, '--ripple-radius': `${ripple.radius}px` } as CSSProperties}
    onAnimationEnd={(event) => { if (event.target === event.currentTarget) finishRipple(ripple.target); }}
  ><div className="todo-ripple-content"><div className={`todo-module-page todo-page-${ripple.target}`}><SpaceHome
    space={ripple.target} view={view} onView={() => undefined} inboxOpen={inboxOpen} onInbox={() => undefined} hideCompleted={hideCompleted} onHideCompleted={() => undefined} tasks={tasks} onToggleTask={() => undefined} onEditTask={() => undefined} activeDate={activeDate} onPickMonthDate={() => undefined} monthDate={monthDate} preview onOpenAdd={() => undefined}
    expandedCard={expandedCard} onExpand={() => undefined} onEditCouple={() => undefined} selectedTags={selectedTags} onToggleTag={() => undefined} onHistory={() => undefined} onNotice={() => undefined}/></div><div className={`todo-fab todo-fab-${ripple.target} todo-preview-fab`} aria-hidden="true"><Icon name="plus"/><span>{ripple.target === 'personal' ? '记一件事' : '加一件小事'}</span></div></div></div>;

  return <>
    <div ref={rootRef} className="todo-module-root" data-current-space={snapshot.todoSpace} aria-busy={rippleBusy.current} inert={!!ripple} onClick={home ? toggleButton : undefined}>
      <section className={`todo-module-page todo-page-${snapshot.todoSpace}`} aria-label={snapshot.todoSpace === 'personal' ? '待办' : '我们的小事'}>
        {layout}
      </section>
    </div>
    {preview && createPortal(preview, document.body)}
    {active && home && !dialogKind && !ripple && <FloatingAdd space={snapshot.todoSpace} onClick={() => showSurface(snapshot.todoSpace === 'personal' ? 'todo-add-personal' : 'todo-add-couple')}/>}
    {active && dialogKind && <TodoDialog kind={dialogKind} onBack={onBack} onNotice={onNotice} onRangeChange={setHistoryRange} range={historyRange}/>}
    {active && quickMessage && <div className="todo-live-message" role="status">{quickMessage}</div>}
  </>;
}
