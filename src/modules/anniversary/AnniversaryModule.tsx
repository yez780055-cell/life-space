import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type { NavigationSnapshot } from '../../app/navigation/model';
import { Icon } from '../../shared/ui/icons';
import { formatDateKey, isValidDateKey, localTodayKey, millisecondsToNextLocalMidnight } from './domain/date';
import { anniversaryNumberLabel, occurrenceFor, selectNextAnniversary, sortAnniversaries } from './domain/anniversary';
import { MAX_MILESTONE_DAY, maximumMilestoneDay, nextMilestone, normalizeMilestoneDays } from './domain/milestones';
import { createAnniversary, deleteAnniversary, listAnniversaries, updateAnniversary } from './data/repository';
import type { AnniversaryDraft, AnniversaryRecord } from './types';
import './anniversary.css';

type Props = {
  snapshot: NavigationSnapshot;
  active: boolean;
  onScreen: (screen: 'detail' | 'editor', recordId?: string) => void;
  onSurface: (surface: 'anniversary-delete') => void;
  onBack: () => void;
  onReturnHome: () => void;
  onError: (message: string) => void;
};

function useLocalToday(active: boolean): string {
  const [today, setToday] = useState(() => localTodayKey());
  useEffect(() => {
    if (!active) return;
    let timer = 0;
    const refresh = () => {
      setToday(localTodayKey());
      window.clearTimeout(timer);
      timer = window.setTimeout(refresh, millisecondsToNextLocalMidnight(new Date()) + 25);
    };
    const onVisibility = () => { if (document.visibilityState === 'visible') refresh(); };
    refresh();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', refresh);
    };
  }, [active]);
  return today;
}

function TypeLabel({ recurrence }: { recurrence: AnniversaryRecord['recurrence'] }) {
  return <span className="anniversary-type">{recurrence === 'yearly' ? '每年' : '一次'}</span>;
}

function RecordCard({ item, onOpen }: { item: ReturnType<typeof sortAnniversaries>[number]; onOpen: () => void }) {
  return <button className="anniversary-record" onClick={onOpen} aria-label={`查看纪念日：${item.record.title}`}>
    <span className="anniversary-record-copy"><strong>{item.record.title}</strong><span>{formatDateKey(item.record.date)} <TypeLabel recurrence={item.record.recurrence}/></span></span>
    <span className="anniversary-record-status">{item.status}</span>
    <Icon name="arrow" className="anniversary-record-arrow"/>
  </button>;
}

function AnniversaryForm({ record, today, saving, onCancel, onSave }: {
  record?: AnniversaryRecord;
  today: string;
  saving: boolean;
  onCancel: () => void;
  onSave: (draft: AnniversaryDraft) => void;
}) {
  const [title, setTitle] = useState(record?.title ?? '');
  const [date, setDate] = useState(record?.date ?? today);
  const [recurrence, setRecurrence] = useState<AnniversaryDraft['recurrence']>(record?.recurrence ?? 'yearly');
  const [note, setNote] = useState(record?.note ?? '');
  const [milestoneEnabled, setMilestoneEnabled] = useState(record?.milestoneEnabled ?? false);
  const [milestoneDays, setMilestoneDays] = useState(record?.milestoneDays ?? []);
  const [milestoneInput, setMilestoneInput] = useState('');
  const [milestoneError, setMilestoneError] = useState('');
  const yearLimit = String(Number(today.slice(0, 4)) + 100).padStart(4, '0') + '-12-31';
  const maximumDay = isValidDateKey(date) ? maximumMilestoneDay(date) : 0;

  const addMilestone = () => {
    const input = milestoneInput.trim();
    if (!/^\d+$/.test(input)) {
      setMilestoneError('请输入大于 0 的整数天数。');
      return;
    }
    const value = Number(input);
    try {
      const normalized = normalizeMilestoneDays([...milestoneDays, value], date);
      if (normalized.length === milestoneDays.length) setMilestoneError('这个天数节点已添加。');
      else setMilestoneError('');
      setMilestoneDays(normalized);
      setMilestoneInput('');
    } catch (error) {
      setMilestoneError(error instanceof Error ? error.message : '请输入有效的天数节点。');
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    try { normalizeMilestoneDays(milestoneDays, date); }
    catch (error) {
      setMilestoneError(error instanceof Error ? error.message : '请检查天数节点。');
      return;
    }
    onSave({ title, date, recurrence, note, milestoneEnabled, milestoneDays });
  };
  return <section className="anniversary-page anniversary-editor" aria-label={record ? '编辑纪念日' : '新建纪念日'}>
    <header className="anniversary-subhead"><button className="icon-button" onClick={onCancel} aria-label="返回"><Icon name="arrow"/></button><div><p className="anniversary-eyebrow">ANNIVERSARY</p><h1>{record ? '编辑纪念日' : '新建纪念日'}</h1></div></header>
    <form onSubmit={submit} className="anniversary-form">
      <label>名称<input autoFocus maxLength={160} required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：第一次旅行"/></label>
      <label>日期<input type="date" required min="1900-01-01" max={yearLimit} value={date} onChange={(event) => { const nextDate = event.target.value; setDate(nextDate); setMilestoneError(''); if (milestoneDays.length && isValidDateKey(nextDate)) { const nextMaximum = maximumMilestoneDay(nextDate); if (milestoneDays.some((day) => day > nextMaximum)) setMilestoneError(`新日期最多支持 ${nextMaximum.toLocaleString('zh-CN')} 天节点。请开启天数纪念并删除超出范围的节点，或选择更早的日期。`); } }}/></label>
      <fieldset><legend>重复方式</legend><label className="anniversary-choice"><input type="radio" name="recurrence" value="yearly" checked={recurrence === 'yearly'} onChange={() => setRecurrence('yearly')}/><span>每年</span><small>适合生日、相识日等每年重来的日子</small></label><label className="anniversary-choice"><input type="radio" name="recurrence" value="once" checked={recurrence === 'once'} onChange={() => setRecurrence('once')}/><span>仅一次</span><small>适合旅行、演出等单次日期</small></label></fieldset>
      <label>备注 <span className="anniversary-optional">选填</span><textarea maxLength={2000} rows={4} value={note} onChange={(event) => setNote(event.target.value)} placeholder="留下一句简短的记忆"/></label>
      <section className="anniversary-milestone-settings" aria-label="天数纪念设置">
        <label className="anniversary-milestone-toggle"><input type="checkbox" aria-label="天数纪念" checked={milestoneEnabled} onChange={(event) => setMilestoneEnabled(event.target.checked)}/><span>天数纪念</span><small>原始纪念日当天算作第 1 天</small></label>
        {milestoneEnabled && <fieldset className="anniversary-milestone-editor"><legend>天数节点</legend>
          {milestoneDays.length > 0 && <div className="anniversary-milestone-chips">{milestoneDays.map((day) => <span className="anniversary-milestone-chip" key={day}>{day} 天<button type="button" aria-label={`删除 ${day} 天节点`} onClick={() => { setMilestoneDays((currentDays) => currentDays.filter((currentDay) => currentDay !== day)); setMilestoneError(''); }}><Icon name="close"/></button></span>)}</div>}
          <div className="anniversary-milestone-add"><input type="number" inputMode="numeric" min={1} max={maximumDay} step={1} value={milestoneInput} aria-label="添加天数节点" aria-describedby="anniversary-milestone-limit" onChange={(event) => { setMilestoneInput(event.target.value); setMilestoneError(''); }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addMilestone(); } }} placeholder="输入天数"/><button type="button" className="anniversary-secondary" onClick={addMilestone}>＋添加</button></div>
          <p id="anniversary-milestone-limit" className="anniversary-milestone-help">输入 1 至 {maximumDay.toLocaleString('zh-CN')} 天；单项上限为 {MAX_MILESTONE_DAY.toLocaleString('zh-CN')} 天。</p>
        </fieldset>}
        {milestoneError && <p className="anniversary-milestone-error" role="alert">{milestoneError}</p>}
      </section>
      <div className="anniversary-form-actions"><button type="button" className="anniversary-secondary" onClick={onCancel}>取消</button><button type="submit" className="anniversary-primary" disabled={saving || !title.trim() || !date}>{saving ? '正在保存…' : '保存'}</button></div>
    </form>
  </section>;
}

export function AnniversaryModule({ snapshot, active, onScreen, onSurface, onBack, onReturnHome, onError }: Props) {
  const [records, setRecords] = useState<AnniversaryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const today = useLocalToday(active);
  const current = records.find((record) => record.id === snapshot.anniversaryRecordId);
  const occurrence = current ? occurrenceFor(current, today) : null;
  const milestone = current?.milestoneEnabled ? nextMilestone(current.date, today, current.milestoneDays) : null;
  const sorted = useMemo(() => sortAnniversaries(records, today), [records, today]);
  const next = useMemo(() => selectNextAnniversary(records, today), [records, today]);
  const isDeleteOpen = snapshot.surfaces.at(-1) === 'anniversary-delete';

  const reload = useCallback(async () => {
    setLoading(true);
    try { setRecords(await listAnniversaries()); }
    catch { onError('无法读取纪念日本机数据，请检查设备存储。'); }
    finally { setLoading(false); }
  }, [onError]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    if (!isDeleteOpen) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); onBack(); } };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isDeleteOpen, onBack]);

  const save = async (draft: AnniversaryDraft) => {
    setSaving(true);
    try {
      if (snapshot.anniversaryRecordId) {
        const updated = await updateAnniversary(snapshot.anniversaryRecordId, draft);
        setRecords((currentRecords) => currentRecords.map((record) => record.id === updated.id ? updated : record));
      } else {
        const created = await createAnniversary(draft);
        setRecords((currentRecords) => [...currentRecords, created]);
      }
      onBack();
    } catch (error) {
      onError(error instanceof Error ? error.message : '保存纪念日失败，请检查设备存储。');
    } finally { setSaving(false); }
  };

  const remove = async () => {
    if (!snapshot.anniversaryRecordId) return;
    setSaving(true);
    try {
      await deleteAnniversary(snapshot.anniversaryRecordId);
      setRecords((currentRecords) => currentRecords.filter((record) => record.id !== snapshot.anniversaryRecordId));
      onReturnHome();
    } catch (error) {
      onError(error instanceof Error ? error.message : '删除纪念日失败，请检查设备存储。');
    } finally { setSaving(false); }
  };

  let view;
  if (snapshot.anniversaryScreen === 'editor') {
    view = <AnniversaryForm key={`editor-${snapshot.anniversaryRecordId ?? 'new'}-${current?.createdAt ?? (snapshot.anniversaryRecordId ? 'loading' : 'new')}`} record={current} today={today} saving={saving} onCancel={onBack} onSave={(draft) => void save(draft)}/>;
  } else if (snapshot.anniversaryScreen === 'detail') {
    view = current && occurrence ? <section className="anniversary-page" aria-label="纪念日详情">
      <header className="anniversary-subhead"><button className="icon-button" onClick={onBack} aria-label="返回"><Icon name="arrow"/></button><div><p className="anniversary-eyebrow">ANNIVERSARY</p><h1>纪念日详情</h1></div></header>
      <article className="anniversary-detail-card"><TypeLabel recurrence={current.recurrence}/><h2>{current.title}</h2><p className="anniversary-detail-date">{formatDateKey(current.date)}</p><div className="anniversary-detail-status"><strong>{occurrence.status}</strong>{current.recurrence === 'yearly' && occurrence.anniversaryNumber !== null && <span>{anniversaryNumberLabel(occurrence.anniversaryNumber)}</span>}{current.recurrence === 'yearly' && occurrence.nextDate && <span>下一次：{formatDateKey(occurrence.nextDate)}</span>}</div>{current.recurrence === 'once' && occurrence.daysPast !== null && <p className="anniversary-detail-past">这件事已过去 {occurrence.daysPast} 天。</p>}{milestone && <section className="anniversary-milestone-summary" aria-label="天数纪念"><h3>天数纪念</h3>{milestone.currentDay === null ? <strong>纪念日尚未开始</strong> : <strong>相伴第 {milestone.currentDay} 天</strong>}{milestone.nextMilestoneDay !== null && milestone.nextMilestoneDate && <><p>{milestone.isMilestoneToday ? `${milestone.nextMilestoneDay} 天 · 就是今天` : `下一节点 ${milestone.nextMilestoneDay} 天 · 还有 ${milestone.daysUntilNextMilestone} 天`}</p><p>{milestone.nextMilestoneDay} 天：{formatDateKey(milestone.nextMilestoneDate)}</p></>}{milestone.allCompleted && <p>已完成全部天数节点</p>}{!current.milestoneDays.length && <p>还没有设置天数节点</p>}</section>}{current.note && <div className="anniversary-note"><span>备注</span><p>{current.note}</p></div>}<footer><button className="anniversary-secondary" onClick={() => onScreen('editor', current.id)}>编辑</button><button className="anniversary-danger" onClick={() => onSurface('anniversary-delete')}>删除</button></footer></article>
    </section> : <section className="anniversary-page" aria-label="纪念日详情"><header className="anniversary-subhead"><button className="icon-button" onClick={onBack} aria-label="返回"><Icon name="arrow"/></button><h1>纪念日详情</h1></header><div className="anniversary-empty"><h2>找不到这条纪念日</h2><button className="anniversary-secondary" onClick={onReturnHome}>回到列表</button></div></section>;
  } else {
    view = <section className="anniversary-page anniversary-home" aria-label="纪念日">
      <header className="anniversary-home-head"><div><p className="anniversary-eyebrow">ANNIVERSARY</p><h1>纪念日</h1></div><button className="anniversary-create" onClick={() => onScreen('editor')} aria-label="新建纪念日"><Icon name="plus"/><span>添加</span></button></header>
      {loading ? <p className="anniversary-loading" role="status">正在读取本地纪念日…</p> : <>
        {next ? <button className="anniversary-hero" onClick={() => onScreen('detail', next.record.id)} aria-label={`查看最近纪念日：${next.record.title}`}><span className="anniversary-hero-top"><span>下一件值得期待的事</span><Icon name="calendar"/></span><strong>{next.record.title}</strong><span className="anniversary-hero-date">{formatDateKey(next.nextDate!)}</span><span className="anniversary-hero-bottom"><span>{next.status}</span>{next.record.recurrence === 'yearly' && next.anniversaryNumber !== null && <span>{anniversaryNumberLabel(next.anniversaryNumber)}</span>}</span></button> : <div className="anniversary-empty"><span className="anniversary-empty-mark"><Icon name="calendar"/></span><h2>{records.length ? '暂无未来纪念日' : '还没有纪念日'}</h2><p>{records.length ? '已过去的一次性日期仍会保留在下面。' : '先留下一件对你有意义的日子。'}</p><button className="anniversary-primary" onClick={() => onScreen('editor')}>创建纪念日</button></div>}
        <section className="anniversary-list" aria-label="全部纪念日"><header><div><h2>全部纪念日</h2><span>{records.length}</span></div></header>{sorted.length ? <div>{sorted.map((item) => <RecordCard key={item.record.id} item={item} onOpen={() => onScreen('detail', item.record.id)}/>)}</div> : <p className="anniversary-list-empty">创建后会显示在这里。</p>}</section>
      </>}
    </section>;
  }

  return <div className="anniversary-module">
    {view}
    {isDeleteOpen && <div className="anniversary-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onBack(); }}><section className="anniversary-confirm" role="alertdialog" aria-modal="true" aria-labelledby="anniversary-delete-title"><button className="icon-button anniversary-confirm-close" onClick={onBack} aria-label="取消删除"><Icon name="close"/></button><p className="anniversary-eyebrow">DELETE</p><h2 id="anniversary-delete-title">删除这条纪念日？</h2><p>{current?.title ?? '这条纪念日'}将从本机纪念日列表中删除。</p><footer><button className="anniversary-secondary" onClick={onBack}>保留</button><button className="anniversary-danger" disabled={saving} onClick={() => void remove()}>{saving ? '正在删除…' : '确认删除'}</button></footer></section></div>}
  </div>;
}
