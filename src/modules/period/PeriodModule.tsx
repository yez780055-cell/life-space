import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Icon } from '../../shared/ui/icons';
import { addDays, localDateString } from './domain/date';
import { formatDate, monthGrid, monthTitle, parseLocalDate, sameMonth, shiftMonth, weekdayLabel } from './domain/date';
import { calculateForecast, classifyCalendarDate, forecastCountdown } from './domain/forecast';
import { calculatePeriodStatistics } from './domain/statistics';
import { addCompletedPeriod, completedPeriodLength, getActivePeriod, getPeriodOnDate, periodDayNumber, sortPeriods, togglePeriodForDate, undoPeriodToggle, validatePeriod } from './domain/periods';
import { prepareRestoredData } from './domain/backup';
import { createPinHash, decryptBackup, encryptBackup, verifyPin } from './domain/security';
import { claimPeriodReminder, clearPeriodData, loadPeriodSnapshot, mutatePeriodRecords, replacePeriodData, updatePeriodSettings, type PeriodSnapshot } from './data/repository';
import type { AppData, AppSettings, PeriodRecord, Forecast } from './types';
import { defaultSettings } from './domain/storage';
import { getCalendarSwipeDirection } from './domain/calendarSwipe';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const EMPTY_PERIODS: PeriodRecord[] = [];
type Screen = 'calendar' | 'stats' | 'settings';
type Dialog = 'record' | 'backfill' | 'delete' | 'pin' | 'export' | 'import' | 'clear';
type PinMode = 'unlock' | 'setup' | 'disable';
type ToggleUndo = { action: 'started' | 'ended' | 'cancelled'; changedRecord: PeriodRecord; previousRecord: PeriodRecord | null };
type RecordMutation = { record: PeriodRecord; error?: undefined } | { error: string; record?: undefined };
type ImportPreview = { fileName: string; data: AppData; startDate: string | null; endDate: string | null };

function hasSettings(settings: AppSettings): boolean {
  const defaults = defaultSettings();
  return settings.onboardingComplete !== defaults.onboardingComplete ||
    settings.referenceCycleLength !== defaults.referenceCycleLength ||
    settings.referencePeriodLength !== defaults.referencePeriodLength ||
    settings.careMemo !== defaults.careMemo ||
    JSON.stringify(settings.reminders) !== JSON.stringify(defaults.reminders) ||
    JSON.stringify(settings.appLock) !== JSON.stringify(defaults.appLock) ||
    settings.deliveredReminders.length > 0;
}

function DatePicker({ value, today, label, onChange }: { value: string; today: string; label: string; onChange: (date: string) => void }) {
  const [month, setMonth] = useState(value.slice(0, 7) + '-01');
  useEffect(() => { if (value) setMonth(value.slice(0, 7) + '-01'); }, [value]);
  const date = parseLocalDate(month);
  const year = date.getFullYear();
  const monthNumber = date.getMonth() + 1;
  const latestYear = Number(today.slice(0, 4));
  const changeMonth = (y: number, m: number) => {
    const next = y + '-' + String(m).padStart(2, '0') + '-01';
    setMonth(next.slice(0, 7) > today.slice(0, 7) ? today.slice(0, 7) + '-01' : next);
  };
  return <section className="period-date-picker" aria-label={label}>
    <div className="period-date-picker-head">
      <button type="button" aria-label="上个月" disabled={month.slice(0, 7) <= '1900-01'} onClick={() => setMonth(shiftMonth(month, -1))}>‹</button>
      <select aria-label="选择年份" value={year} onChange={(event) => changeMonth(Number(event.target.value), monthNumber)}>{Array.from({ length: latestYear - 1899 }, (_, index) => latestYear - index).map((item) => <option key={item} value={item}>{item}年</option>)}</select>
      <select aria-label="选择月份" value={monthNumber} onChange={(event) => changeMonth(year, Number(event.target.value))}>{Array.from({ length: 12 }, (_, index) => index + 1).map((item) => <option key={item} value={item} disabled={year === latestYear && item > Number(today.slice(5, 7))}>{item}月</option>)}</select>
      <button type="button" aria-label="下个月" disabled={month.slice(0, 7) >= today.slice(0, 7)} onClick={() => setMonth(shiftMonth(month, 1))}>›</button>
    </div>
    <div className="period-date-picker-grid">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}{monthGrid(month).map((dateValue) => <button type="button" key={dateValue} disabled={dateValue > today} className={(sameMonth(dateValue, month) ? '' : 'outside ') + (dateValue === value ? 'selected' : '')} aria-label={dateValue} aria-pressed={dateValue === value} onClick={() => onChange(dateValue)}>{Number(dateValue.slice(-2))}</button>)}</div>
  </section>;
}

function Calendar({ periods, forecast, today, selectedDate, onSelect, onMonthChange }: { periods: PeriodRecord[]; forecast: Forecast; today: string; selectedDate: string; onSelect: (date: string) => void; onMonthChange: (amount: number) => void }) {
  const month = selectedDate.slice(0, 7) + '-01';
  const pointer = useRef<{ x: number; y: number; time: number; id: number } | null>(null);
  const suppressClickUntil = useRef(0);
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch' && event.isPrimary) pointer.current = { x: event.clientX, y: event.clientY, time: event.timeStamp, id: event.pointerId };
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = pointer.current;
    pointer.current = null;
    if (!start || start.id !== event.pointerId) return;
    const direction = getCalendarSwipeDirection(event.clientX - start.x, event.clientY - start.y, event.timeStamp - start.time);
    if (direction) { suppressClickUntil.current = Date.now() + 450; onMonthChange(direction); }
  };
  return <section className="period-calendar-card" aria-label={monthTitle(month) + '小月历'}>
    <header className="period-calendar-heading"><button aria-label="上个月" onClick={() => onMonthChange(-1)}>‹</button><h2>{monthTitle(month)}</h2><button aria-label="下个月" onClick={() => onMonthChange(1)}>›</button></header>
    <div className="period-weekdays" aria-hidden="true">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
    <div className="period-days" onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => { pointer.current = null; }} onClickCapture={(event) => { if (Date.now() < suppressClickUntil.current) { event.preventDefault(); event.stopPropagation(); } }}>
      {monthGrid(month).map((dateValue, index) => {
        const kind = classifyCalendarDate(dateValue, periods, forecast, today);
        const classes = ['period-day', sameMonth(dateValue, month) ? '' : 'outside', kind === 'none' ? '' : 'kind-' + kind, dateValue === selectedDate ? 'selected' : '', dateValue === today ? 'today' : ''].filter(Boolean).join(' ');
        const annotation = kind === 'actual' ? '，实际经期' : kind === 'predicted' ? '，预测经期' : kind === 'uncertain' ? '，可能范围' : '';
        return <button type="button" key={index + '-' + dateValue} className={classes} aria-label={formatDate(dateValue) + annotation + (dateValue === today ? '，今天' : '')} aria-pressed={dateValue === selectedDate} onClick={() => { if (Date.now() >= suppressClickUntil.current) onSelect(dateValue); }}><span>{Number(dateValue.slice(-2))}</span>{dateValue === today && <i aria-hidden="true" />}</button>;
      })}
    </div>
    <div className="period-legend"><span><i className="actual" />实际</span><span><i className="predicted" />预测</span><span><i className="uncertain" />可能范围</span></div>
  </section>;
}

function PeriodTrendCard({ title, values, emptyText, bar = false }: { title: string; values: number[]; emptyText: string; bar?: boolean }) {
  const width = 320;
  const height = 136;
  const left = 24;
  const right = 296;
  const top = 17;
  const bottom = 94;
  const minimum = values.length ? Math.min(...values) : 0;
  const maximum = values.length ? Math.max(...values) : 1;
  const padding = Math.max(2, (maximum - minimum) * 0.3);
  const low = minimum - padding;
  const high = maximum + padding;
  const points = values.map((value, index) => ({
    value,
    x: values.length < 2 ? (left + right) / 2 : left + (right - left) * index / (values.length - 1),
    y: bottom - ((value - low) / (high - low)) * (bottom - top)
  }));
  const line = points.map((point) => point.x + ',' + point.y).join(' ');

  return <article className="period-trend-card"><header><h3>{title}</h3><span>单位：天</span></header>{values.length < 2 ? <p className="period-trend-empty">{values.length === 1 ? '已记录 1 个真实数据点' : emptyText}</p> : <svg className="period-trend-chart" viewBox={'0 0 ' + width + ' ' + height} role="img" aria-label={title + '：' + values.map((value) => value + '天').join('、')}>
    {[0, 1, 2, 3].map((index) => { const y = top + ((bottom - top) / 3) * index; return <line key={index} x1={left} y1={y} x2={right} y2={y} className="period-trend-gridline" />; })}
    {!bar && <polyline points={line} className="period-trend-line" />}
    {points.map((point, index) => bar ? <g key={index}><rect x={point.x - 8} y={point.y} width="16" height={bottom - point.y} rx="5" className="period-trend-bar" /><text x={point.x} y={point.y - 6} textAnchor="middle" className="period-trend-value">{point.value}</text><text x={point.x} y="122" textAnchor="middle" className="period-trend-label">第{index + 1}次</text></g> : <g key={index}><circle cx={point.x} cy={point.y} r="4" className="period-trend-point" /><text x={point.x} y={point.y - 9} textAnchor="middle" className="period-trend-value">{point.value}</text><text x={point.x} y="122" textAnchor="middle" className="period-trend-label">第{index + 1}次</text></g>)}
  </svg>}</article>;
}

export function PeriodModule({ active, screen, dialogOpen, onScreen, onDialog, onBack, onError }: { active: boolean; screen: Screen; dialogOpen: boolean; onScreen: (screen: Screen) => void; onDialog: () => void; onBack: () => void; onError: (message: string) => void }) {
  const [snapshot, setSnapshot] = useState<PeriodSnapshot | null>(null);
  const [today, setToday] = useState(localDateString());
  const [selectedDate, setSelectedDate] = useState(localDateString());
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [record, setRecord] = useState<PeriodRecord | null>(null);
  const [recordStart, setRecordStart] = useState(localDateString());
  const [recordEnd, setRecordEnd] = useState(localDateString());
  const [backfillStart, setBackfillStart] = useState('');
  const [backfillMax, setBackfillMax] = useState(localDateString());
  const [formError, setFormError] = useState('');
  const [pinMode, setPinMode] = useState<PinMode>('unlock');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinError, setPinError] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [message, setMessage] = useState('');
  const [undo, setUndo] = useState<ToggleUndo | null>(null);
  const [confirmAction, setConfirmAction] = useState(false);
  const [cycleLength, setCycleLength] = useState('');
  const [periodLength, setPeriodLength] = useState('');
  const [memo, setMemo] = useState('');
  const [exportPassword, setExportPassword] = useState('');
  const [importPassword, setImportPassword] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const [importError, setImportError] = useState('');
  const [yearFilter, setYearFilter] = useState('all');
  const toastTimer = useRef<number | undefined>(undefined);

  const periods = snapshot?.periods ?? EMPTY_PERIODS;
  const settings = snapshot?.settings;
  const forecast = useMemo(() => calculateForecast(periods, { referenceCycleLength: settings?.referenceCycleLength ?? null, referencePeriodLength: settings?.referencePeriodLength ?? null }, today), [periods, settings?.referenceCycleLength, settings?.referencePeriodLength, today]);
  const locked = Boolean(active && settings?.appLock.enabled && !unlocked);
  const hasContent = periods.length > 0 || Boolean(settings && hasSettings(settings));

  const reload = useCallback(async () => {
    const next = await loadPeriodSnapshot();
    setSnapshot(next);
    setCycleLength(next.settings.referenceCycleLength?.toString() ?? '');
    setPeriodLength(next.settings.referencePeriodLength?.toString() ?? '');
    setMemo(next.settings.careMemo);
  }, []);
  useEffect(() => {
    let alive = true;
    loadPeriodSnapshot().then((next) => { if (alive) { setSnapshot(next); setCycleLength(next.settings.referenceCycleLength?.toString() ?? ''); setPeriodLength(next.settings.referencePeriodLength?.toString() ?? ''); setMemo(next.settings.careMemo); } }).catch((error: unknown) => { if (alive) onError(error instanceof Error ? error.message : '无法读取小月历本机数据。'); });
    return () => { alive = false; };
  }, [onError]);
  useEffect(() => { const timer = window.setInterval(() => setToday(localDateString()), 60_000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { if (!active && settings?.appLock.enabled) setUnlocked(false); }, [active, settings?.appLock.enabled]);
  useEffect(() => {
    if (!settings?.appLock.enabled) return;
    const lockWhenHidden = () => { if (document.visibilityState === 'hidden') setUnlocked(false); };
    document.addEventListener('visibilitychange', lockWhenHidden);
    return () => document.removeEventListener('visibilitychange', lockWhenHidden);
  }, [settings?.appLock.enabled]);
  useEffect(() => { if (!undo) return; const timer = window.setTimeout(() => setUndo(null), 8000); return () => window.clearTimeout(timer); }, [undo]);
useEffect(() => {
    if (!active || !settings || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const check = async () => {
      const now = new Date();
      const currentTime = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
      const due: { key: string; title: string; body: string }[] = [];
      if (settings.reminders.forecastEnabled && forecast.status === 'ready' && forecast.expectedStart &&
          addDays(forecast.expectedStart, -settings.reminders.forecastDaysBefore) === today &&
          currentTime >= settings.reminders.forecastTime) {
        due.push({ key: 'forecast:' + forecast.expectedStart, title: '小月历预测提醒', body: '预计经期将于 ' + formatDate(forecast.expectedStart) + ' 开始。' });
      }
      const ongoing = getActivePeriod(periods);
      if (settings.reminders.checkEnabled && ongoing &&
          periodDayNumber(ongoing, today) >= settings.reminders.checkAfterDays &&
          currentTime >= settings.reminders.checkTime) {
        due.push({ key: 'check:' + ongoing.startDate, title: '小月历记录核对', body: '这段经期已记录 ' + periodDayNumber(ongoing, today) + ' 天，可以核对结束日期。' });
      }
      for (const reminder of due) {
        try {
          if (await claimPeriodReminder(reminder.key)) new Notification(reminder.title, { body: reminder.body, tag: reminder.key });
        } catch (error) {
          onError(error instanceof Error ? error.message : '保存提醒状态失败。');
        }
      }
    };
    void check();
    const timer = window.setInterval(() => { void check(); }, 60_000);
    return () => window.clearInterval(timer);
  }, [active, forecast, onError, periods, settings, today]);
  useEffect(() => () => { if (toastTimer.current) window.clearTimeout(toastTimer.current); }, []);

  const toast = useCallback((value: string) => { setMessage(value); if (toastTimer.current) window.clearTimeout(toastTimer.current); toastTimer.current = window.setTimeout(() => setMessage(''), 4500); }, []);
  const openDialog = (kind: Dialog) => {
    setDialog(kind); setRecord(null); setFormError(''); setPinError(''); setImportError(''); setConfirmAction(false); setPreview(null); setReplaceConfirmed(false); setPin(''); setPinConfirm(''); setImportPassword(''); setExportPassword(''); setImportFile(null); onDialog();
  };
  const closeDialog = () => { setDialog(null); setRecord(null); setPreview(null); setImportFile(null); setImportPassword(''); setExportPassword(''); setPin(''); setPinConfirm(''); onBack(); };
  const openRecord = (target: PeriodRecord | null, start = selectedDate) => { setRecord(target); setRecordStart(target?.startDate ?? start); setRecordEnd(target ? target.endDate ?? '' : today); setFormError(''); setDialog('record'); onDialog(); };
  const selected = getPeriodOnDate(periods, selectedDate, today);
  const selectedType = classifyCalendarDate(selectedDate, periods, forecast, today);

  const toggle = async (enabled: boolean) => {
    try {
      const outcome = await mutatePeriodRecords((current) => {
        const previous = getActivePeriod(current);
        const result = togglePeriodForDate(current, selectedDate, enabled, today);
        return { periods: result.ok && result.changed ? result.periods : current, value: { result, previous } };
      });
      if (!outcome.result.ok) { toast(outcome.result.message); return; }
      if (!outcome.result.changed) {
        if (outcome.result.action === 'backfill-required') {
          setBackfillStart(outcome.result.startDate); setBackfillMax(outcome.result.endDateMax); setRecordEnd(outcome.result.endDateMax); setFormError(''); setDialog('backfill'); onDialog();
        }
        return;
      }
      await reload();
      setUndo({ action: outcome.result.action, changedRecord: outcome.result.record, previousRecord: outcome.previous });
      toast(outcome.result.action === 'started' ? '已开始记录' : outcome.result.action === 'ended' ? '已记录结束日期' : '已取消这段记录');
    } catch (error) { onError(error instanceof Error ? error.message : '保存经期记录失败，请检查设备存储后重试。'); }
  };

  const undoToggle = async () => {
    if (!undo) return;
    try {
      const item = undo;
      const restored = await mutatePeriodRecords((current) => {
        const next = undoPeriodToggle(current, item.action, item.changedRecord, item.previousRecord, today);
        return { periods: next ?? current, value: next !== null };
      });
      if (!restored) { toast('记录已变化，无法撤销。'); return; }
      setUndo(null); await reload(); toast('已撤销');
    } catch (error) { onError(error instanceof Error ? error.message : '撤销失败，请检查设备存储后重试。'); }
  };

  const saveRecord = async () => {
    const endDate = recordEnd || recordStart;
    try {
      const result = await mutatePeriodRecords<RecordMutation>((current) => {
        if (record) {
          const validation = validatePeriod({ startDate: recordStart, endDate: recordEnd || null }, current, { excludeId: record.id, allowOngoing: !recordEnd, today });
          if (!validation.valid) return { periods: current, value: { error: validation.message ?? '无法保存这段经期。' } };
          const updated = { ...record, startDate: recordStart, endDate: recordEnd || null, updatedAt: new Date().toISOString() };
          return { periods: sortPeriods(current.map((item) => item.id === updated.id ? updated : item)), value: { record: updated } };
        }
        const created = addCompletedPeriod(current, recordStart, endDate, today);
        return created.ok ? { periods: created.periods, value: { record: created.record } } : { periods: current, value: { error: created.message } };
      });
      if (result.error) { setFormError(result.error); return; }
      if (!result.record) { setFormError('无法保存这段经期。'); return; }
      closeDialog(); await reload(); setSelectedDate(result.record.startDate); toast('经期记录已保存');
    } catch (error) { setFormError(error instanceof Error ? error.message : '保存失败，请检查设备存储后重试。'); }
  };

  const saveBackfill = async () => {
    if (!backfillStart || recordEnd < backfillStart || recordEnd > backfillMax) { setFormError('结束日期必须不早于开始日期，并且不能与已有记录重叠。'); return; }
    try {
      const result = await mutatePeriodRecords<RecordMutation>((current) => {
        const created = addCompletedPeriod(current, backfillStart, recordEnd, today);
        return created.ok ? { periods: created.periods, value: { record: created.record } } : { periods: current, value: { error: created.message } };
      });
      if (result.error) { setFormError(result.error); return; }
      if (!result.record) { setFormError('无法保存这段经期。'); return; }
      closeDialog(); await reload(); setSelectedDate(backfillStart); toast('历史记录已补录');
    } catch (error) { setFormError(error instanceof Error ? error.message : '补录失败，请检查设备存储后重试。'); }
  };

  const deleteRecord = async () => {
    if (!record || !confirmAction) return;
    try { await mutatePeriodRecords((current) => ({ periods: current.filter((item) => item.id !== record.id), value: undefined })); closeDialog(); await reload(); toast('记录已删除'); }
    catch (error) { onError(error instanceof Error ? error.message : '删除记录失败，请检查设备存储后重试。'); }
  };

  const saveCycle = async () => {
    const cycle = cycleLength.trim() ? Number(cycleLength) : null;
    const length = periodLength.trim() ? Number(periodLength) : null;
    if ((cycle !== null && (!Number.isInteger(cycle) || cycle < 15 || cycle > 90)) || (length !== null && (!Number.isInteger(length) || length < 1 || length > 15))) { toast('参考周期需为 15–90 天，经期需为 1–15 天。'); return; }
    try { await updatePeriodSettings({ referenceCycleLength: cycle, referencePeriodLength: length }); await reload(); toast('周期参数已保存'); }
    catch (error) { onError(error instanceof Error ? error.message : '保存设置失败。'); }
  };
  const saveMemo = async () => {
    try { await updatePeriodSettings({ careMemo: memo }); await reload(); toast('关怀备忘已保存'); }
    catch (error) { onError(error instanceof Error ? error.message : '保存关怀备忘失败。'); }
  };
  const setReminder = async (name: 'forecastEnabled' | 'checkEnabled', checked: boolean) => {
    if (checked && typeof Notification !== 'undefined' && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch { /* permission may not be available */ } }
    try { await updatePeriodSettings({ reminders: { ...settings!.reminders, [name]: checked } }); await reload(); }
    catch (error) { onError(error instanceof Error ? error.message : '保存提醒设置失败。'); }
  };

  const savePin = async () => {
    if (!settings) return;
    if (pinMode !== 'setup') {
      if (!settings.appLock.salt || !settings.appLock.hash || !await verifyPin(pin, settings.appLock.salt, settings.appLock.hash)) { setPinError('PIN 不正确。'); return; }
      if (pinMode === 'unlock') { setUnlocked(true); closeDialog(); return; }
      try { await updatePeriodSettings({ appLock: { enabled: false, salt: null, hash: null } }); setUnlocked(false); await reload(); closeDialog(); toast('小月历 PIN 已关闭'); }
      catch (error) { setPinError(error instanceof Error ? error.message : '保存隐私设置失败。'); }
      return;
    }
    if (!/^\d{4,12}$/.test(pin)) { setPinError('PIN 需为 4 至 12 位数字。'); return; }
    if (pin !== pinConfirm) { setPinError('两次输入的 PIN 不一致。'); return; }
    try { const hash = await createPinHash(pin); await updatePeriodSettings({ appLock: { enabled: true, ...hash } }); setUnlocked(true); await reload(); closeDialog(); toast('小月历 PIN 已开启'); }
    catch (error) { setPinError(error instanceof Error ? error.message : '保存隐私设置失败。'); }
  };

  const exportBackup = async () => {
    if (!snapshot || exportPassword.length < 8 || exportPassword !== pinConfirm) { setImportError('密码需至少 8 位且两次输入一致。'); return; }
    try {
      const safeData: AppData = { periods: snapshot.periods, settings: { ...snapshot.settings, appLock: { enabled: false, salt: null, hash: null }, deliveredReminders: [] } };
      const text = await encryptBackup(safeData, exportPassword);
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'xiaoyueli-' + today + '.xyl'; link.click(); URL.revokeObjectURL(url);
      closeDialog(); toast('加密 .xyl 备份已导出');
    } catch (error) { setImportError(error instanceof Error ? error.message : '创建加密备份失败。'); }
  };

  const prepareImport = async () => {
    if (!importFile || !importPassword) { setImportError('请选择 .xyl 文件并输入备份密码。'); return; }
    if (importFile.size > 10 * 1024 * 1024) { setImportError('备份文件不能大于 10 MB。'); return; }
    try {
      const data = prepareRestoredData(await decryptBackup(await importFile.text(), importPassword), today);
      const sorted = sortPeriods(data.periods);
      setPreview({ fileName: importFile.name, data, startDate: sorted[0]?.startDate ?? null, endDate: sorted.at(-1)?.endDate ?? sorted.at(-1)?.startDate ?? null });
      setImportError(''); setReplaceConfirmed(false); setImportPassword('');
    } catch (error) { setImportError(error instanceof Error ? error.message : '文件无法解密或校验，未更改本机数据。'); }
  };

  const applyImport = async () => {
    if (!preview) return;
    if (hasContent && !replaceConfirmed) { setImportError('请确认替换现有小月历数据；建议先导出当前加密备份。'); return; }
    try { await replacePeriodData(preview.data, replaceConfirmed); closeDialog(); await reload(); setSelectedDate(today); onScreen('calendar'); toast('小月历已从加密备份恢复'); }
    catch (error) { setImportError(error instanceof Error ? error.message : '导入失败，原有小月历数据未更改。'); }
  };

  const clearData = async () => {
    if (!confirmAction) return;
    try { await clearPeriodData(); closeDialog(); await reload(); setSelectedDate(today); setUnlocked(false); toast('小月历本机数据已清除'); }
    catch (error) { onError(error instanceof Error ? error.message : '清除小月历数据失败。'); }
  };

  const statistics = calculatePeriodStatistics(periods);
  const intervals = statistics.cycleIntervals;

  const history = [...periods].sort((a, b) => b.startDate.localeCompare(a.startDate));
  const years = [...new Set(periods.map((period) => period.startDate.slice(0, 4)))].sort().reverse();
  const shownHistory = yearFilter === 'all' ? history : history.filter((period) => period.startDate.slice(0, 4) === yearFilter);

  if (!snapshot) return <section className="period-module" aria-label="小月历"><div className="period-loading">正在打开小月历…</div></section>;
  if (locked) return <section className="period-module period-lock-gate" aria-label="小月历已锁定"><div className="period-lock-card"><span className="period-lock-mark"><Icon name="period" /></span><p className="period-kicker">PRIVATE SPACE</p><h1>小月历已锁定</h1><p>PIN 只遮挡 Period 内容，不是设备级数据库加密。</p><button className="period-primary" onClick={() => { setPinMode('unlock'); openDialog('pin'); }}>输入 PIN</button><button className="period-lock-reset" onClick={() => openDialog('clear')}>忘记 PIN？清除小月历数据</button></div>{dialogOpen && dialog === 'pin' && <PeriodDialog title='小月历隐私锁' onClose={closeDialog}><PinFields mode={pinMode} pin={pin} confirm={pinConfirm} error={pinError} setPin={setPin} setConfirm={setPinConfirm} onSubmit={() => void savePin()} onClose={closeDialog} /></PeriodDialog>}{dialogOpen && dialog === 'clear' && <PeriodDialog title="清除小月历数据？" onClose={closeDialog}><p className="period-dialog-note">这会删除 Period 经期记录、设置和 PIN，不影响个人待办、情侣待办或 Life Space 其他数据。清除后无法从本机恢复。</p><label className="period-confirm-row"><input type="checkbox" checked={confirmAction} onChange={(event) => setConfirmAction(event.target.checked)} />我确认清除小月历数据</label><div className="period-dialog-actions"><button className="period-danger" disabled={!confirmAction} onClick={() => void clearData()}>清除小月历</button></div></PeriodDialog>}</section>;

  return <section className="period-module" aria-label="小月历">
    {screen === 'calendar' && <div className="period-page">
      <header className="period-topbar"><div><p className="period-kicker">YOUR CYCLE</p><h1>小月历</h1></div><div className="period-top-actions"><button aria-label="周期统计" onClick={() => onScreen('stats')}><Icon name="history" /></button><button aria-label="小月历设置" onClick={() => onScreen('settings')}><Icon name="settings" /></button></div></header>
      <p className="period-summary">{forecast.status === 'ready' ? forecastCountdown(forecast) : periods.length ? '继续记录，积累周期趋势' : '记录开始日期，了解自己的节奏'}{forecast.confidence === 'low' && <small>样本较少，预测仅供参考</small>}</p>
      <Calendar periods={periods} forecast={forecast} today={today} selectedDate={selectedDate} onSelect={setSelectedDate} onMonthChange={(amount) => setSelectedDate(shiftMonth(selectedDate, amount))} />
      <section className="period-day-detail" aria-live="polite"><header><div><p className="period-kicker">{selectedDate === today ? 'TODAY' : weekdayLabel(selectedDate)}</p><h2>{selectedDate === today ? '今天' : formatDate(selectedDate)}</h2></div>{selected && <span className="period-status">{selected.endDate ? '已结束' : '进行中'} · 第 {periodDayNumber(selected, today)} 天</span>}{selectedType === 'predicted' && <span className="period-status predicted-label">预测日期</span>}</header>
        <p>{selected ? (selected.endDate ? '实际经期：' + formatDate(selected.startDate, false) + ' – ' + formatDate(selected.endDate, false) : '从 ' + formatDate(selected.startDate, false) + ' 开始记录') : selectedType === 'predicted' ? '按已记录周期估算，实际情况可能不同。' : selectedType === 'uncertain' ? '开始日期可能落在这段范围内。' : '选择日期记录实际经期。'}</p>
        <div className="period-detail-actions">{selected?.endDate === null ? <button className="period-primary" onClick={() => void toggle(false)}>{selected.startDate === selectedDate ? '取消这段记录' : '结束经期'}</button> : selected ? <button className="period-secondary" onClick={() => onScreen('stats')}>编辑历史记录</button> : <button className="period-primary" disabled={selectedDate > today} onClick={() => void toggle(true)}>记录经期开始</button>}<button className="period-secondary" onClick={() => openRecord(null, selectedDate)}><Icon name="plus" />补录</button></div>
      </section>
    </div>}

    {screen === 'stats' && <div className="period-page"><header className="period-subheader"><button aria-label="返回日历" onClick={onBack}><Icon name="arrow" /></button><div><p className="period-kicker">YOUR HISTORY</p><h1>周期统计</h1></div><button className="period-header-action" onClick={() => openRecord(null, today)}>补录</button></header>
      <section className="period-forecast-card"><div><span className="period-kicker">下一次预测</span><strong>{forecast.status === 'ready' ? formatDate(forecast.expectedStart!) : '记录尚少'}</strong><small>{forecast.reason}</small></div><span className="period-forecast-mark"><Icon name="period" /></span></section>
      <div className="period-stats-grid"><article><span>平均周期</span><strong>{statistics.averageCycle ? Math.round(statistics.averageCycle) + ' 天' : '—'}</strong><small>最近 {intervals.length} 个真实间隔</small></article><article><span>平均经期</span><strong>{statistics.averagePeriod ? statistics.averagePeriod.toFixed(1) + ' 天' : '—'}</strong><small>仅统计已结束记录</small></article></div>
      <div className="period-trends"><PeriodTrendCard title="周期长度趋势" values={statistics.cycleIntervals} emptyText="再记录几次开始日期后，这里会显示真实趋势。" /><PeriodTrendCard title="经期长度趋势" values={statistics.completedLengths} bar emptyText="结束并保存经期后，这里会显示真实趋势。" /></div>
      {forecast.confidence === 'low' && <p className="period-sample-note">样本较少，预测不代表医疗建议。</p>}
      <div className="period-history-heading"><h2>真实记录</h2><select aria-label="按年份筛选" value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}><option value="all">全部年份</option>{years.map((year) => <option key={year} value={year}>{year}</option>)}</select></div>
      {shownHistory.length ? <div className="period-history-list">{shownHistory.map((item) => <article key={item.id} className="period-history-item"><span className="period-history-dot" /><div><strong>{formatDate(item.startDate)} – {item.endDate ? formatDate(item.endDate) : '进行中'}</strong><small>{item.endDate ? '经期 ' + completedPeriodLength(item) + ' 天' : '已记录 ' + periodDayNumber(item, today) + ' 天'}</small></div><button aria-label={'编辑 ' + formatDate(item.startDate) + ' 记录'} onClick={() => openRecord(item)}>编辑</button><button aria-label={'删除 ' + formatDate(item.startDate) + ' 记录'} onClick={() => { openDialog('delete'); setRecord(item); }}>删除</button></article>)}</div> : <div className="period-empty"><Icon name="calendar" /><p>还没有实际经期记录</p><small>开始记录后，统计会逐步形成。</small><button className="period-secondary" onClick={() => openRecord(null, today)}>添加记录</button></div>}
    </div>}

    {screen === 'settings' && settings && <div className="period-page"><header className="period-subheader"><button aria-label="返回日历" onClick={onBack}><Icon name="arrow" /></button><div><p className="period-kicker">YOUR PREFERENCES</p><h1>小月历设置</h1></div><span /></header>
      <section className="period-setting-group"><h2>周期参数</h2><div className="period-setting-card"><label>参考周期长度 <span><input type="number" min="15" max="90" value={cycleLength} placeholder="—" onChange={(event) => setCycleLength(event.target.value)} /> 天</span></label><label>参考经期长度 <span><input type="number" min="1" max="15" value={periodLength} placeholder="—" onChange={(event) => setPeriodLength(event.target.value)} /> 天</span></label><button className="period-secondary" onClick={() => void saveCycle()}>保存参数</button></div></section>
      <section className="period-setting-group"><h2>关怀备忘</h2><div className="period-setting-card"><label htmlFor="period-care-memo">仅保存在本机</label><textarea id="period-care-memo" maxLength={500} value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="记下希望记住的小事…" /><button className="period-secondary" onClick={() => void saveMemo()}>保存备忘</button></div></section>
      <section className="period-setting-group"><h2>提醒</h2><div className="period-setting-card"><label className="period-check-row"><span><strong>预测经期提醒</strong><small>预计日期前 {settings.reminders.forecastDaysBefore} 天 · {settings.reminders.forecastTime}</small></span><input type="checkbox" checked={settings.reminders.forecastEnabled} onChange={(event) => void setReminder('forecastEnabled', event.target.checked)} /></label><div className="period-reminder-config"><label>提前天数 <input type="number" min="1" max="7" value={settings.reminders.forecastDaysBefore} onChange={(event) => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 1 && value <= 7) void updatePeriodSettings({ reminders: { ...settings.reminders, forecastDaysBefore: value } }).then(reload).catch(onError); }} /></label><label>提醒时间 <input type="time" value={settings.reminders.forecastTime} onChange={(event) => { const value = event.target.value; if (/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) void updatePeriodSettings({ reminders: { ...settings.reminders, forecastTime: value } }).then(reload).catch(onError); }} /></label></div><label className="period-check-row"><span><strong>进行中记录核对</strong><small>持续 {settings.reminders.checkAfterDays} 天后 · {settings.reminders.checkTime}</small></span><input type="checkbox" checked={settings.reminders.checkEnabled} onChange={(event) => void setReminder('checkEnabled', event.target.checked)} /></label><div className="period-reminder-config"><label>核对天数 <input type="number" min="1" max="20" value={settings.reminders.checkAfterDays} onChange={(event) => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 1 && value <= 20) void updatePeriodSettings({ reminders: { ...settings.reminders, checkAfterDays: value } }).then(reload).catch(onError); }} /></label><label>提醒时间 <input type="time" value={settings.reminders.checkTime} onChange={(event) => { const value = event.target.value; if (/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) void updatePeriodSettings({ reminders: { ...settings.reminders, checkTime: value } }).then(reload).catch(onError); }} /></label></div><p className="period-setting-note">浏览器通知仅在权限允许且小月历打开时尝试；关闭网页后无法保证送达。</p></div></section>
      <section className="period-setting-group"><h2>隐私与备份</h2><div className="period-setting-card"><div className="period-setting-action"><span><strong>小月历 PIN</strong><small>{settings.appLock.enabled ? '已开启 · 仅遮挡 Period 页面' : '关闭'}</small></span><button className="period-secondary" onClick={() => { setPinMode(settings.appLock.enabled ? 'disable' : 'setup'); openDialog('pin'); }}>{settings.appLock.enabled ? '关闭 PIN' : '设置 PIN'}</button></div><p className="period-setting-note">PIN 不加密设备数据库；旧备份不含 PIN。</p><div className="period-setting-action"><span><strong>加密备份</strong><small>兼容旧版 .xyl 格式</small></span><button className="period-secondary" onClick={() => openDialog('export')}>导出备份</button></div><div className="period-setting-action"><span><strong>从旧小月历导入</strong><small>选择 .xyl 文件并输入密码</small></span><button className="period-secondary" onClick={() => openDialog('import')}>选择文件</button></div><div className="period-setting-action danger"><span><strong>清除小月历数据</strong><small>只清除 Period 记录与设置</small></span><button className="period-danger" onClick={() => openDialog('clear')}>清除</button></div></div></section>
    </div>}

    {dialogOpen && dialog && <PeriodDialog title={dialogTitle(dialog, record)} onClose={closeDialog}>
      {dialog === 'record' && <><p className="period-dialog-note">日期按本地日历计算，只能保存不晚于今天的实际记录。</p><label className="period-date-label">开始日期<DatePicker value={recordStart} today={today} label="选择开始日期" onChange={setRecordStart} /></label><label className="period-date-label">{record && <span>经期状态 <input type="checkbox" checked={!recordEnd} onChange={(event) => setRecordEnd(event.target.checked ? '' : today)} />仍在进行</span>}{recordEnd && <DatePicker value={recordEnd} today={today} label="选择结束日期" onChange={setRecordEnd} />}</label>{formError && <p className="period-form-error" role="alert">{formError}</p>}<div className="period-dialog-actions"><button className="period-primary" onClick={() => void saveRecord()}>保存记录</button></div></>}
      {dialog === 'backfill' && <><p className="period-dialog-note">开始日为 {formatDate(backfillStart)}；结束日须早于下一条记录 {formatDate(backfillMax)}。</p><label className="period-date-label">结束日期<DatePicker value={recordEnd} today={backfillMax} label="选择补录结束日期" onChange={setRecordEnd} /></label>{formError && <p className="period-form-error" role="alert">{formError}</p>}<div className="period-dialog-actions"><button className="period-primary" onClick={() => void saveBackfill()}>补录记录</button></div></>}
      {dialog === 'delete' && <><p className="period-dialog-note">{record ? formatDate(record.startDate) + ' – ' + (record.endDate ? formatDate(record.endDate) : '进行中') : ''}。删除只影响小月历。</p><label className="period-confirm-row"><input type="checkbox" checked={confirmAction} onChange={(event) => setConfirmAction(event.target.checked)} />我确认删除这段记录</label><div className="period-dialog-actions"><button className="period-danger" disabled={!confirmAction} onClick={() => void deleteRecord()}>删除记录</button></div></>}
      {dialog === 'pin' && <PinFields mode={pinMode} pin={pin} confirm={pinConfirm} error={pinError} setPin={setPin} setConfirm={setPinConfirm} onSubmit={() => void savePin()} onClose={closeDialog} />}
      {dialog === 'export' && <><p className="period-dialog-note">采用旧版兼容的 PBKDF2-SHA-256 与 AES-GCM。PIN 不写入备份。</p><label className="period-password-field">备份密码<input type="password" autoComplete="new-password" value={exportPassword} onChange={(event) => setExportPassword(event.target.value)} /></label><label className="period-password-field">确认密码<input type="password" autoComplete="new-password" value={pinConfirm} onChange={(event) => setPinConfirm(event.target.value)} /></label>{importError && <p role="alert" className="period-form-error">{importError}</p>}<div className="period-dialog-actions"><button className="period-primary" disabled={exportPassword.length < 8 || exportPassword !== pinConfirm} onClick={() => void exportBackup()}>导出加密 .xyl</button></div></>}
      {dialog === 'import' && (!preview ? <><p className="period-dialog-note">选择旧版加密 .xyl 文件并输入密码。解密和校验前不会写入。</p><label className="period-password-field">备份文件<input type="file" accept=".xyl,application/json" onChange={(event) => setImportFile(event.target.files?.[0] ?? null)} /></label><label className="period-password-field">备份密码<input type="password" autoComplete="current-password" value={importPassword} onChange={(event) => setImportPassword(event.target.value)} /></label><div className="period-dialog-actions"><button className="period-primary" disabled={!importFile || !importPassword} onClick={() => void prepareImport()}>解密并预览</button></div></> : <><p className="period-dialog-note">{preview.fileName} 已通过解密和日期校验。</p><div className="period-import-summary"><strong>{preview.data.periods.length} 段真实记录</strong><span>{preview.startDate ? formatDate(preview.startDate) + ' – ' + formatDate(preview.endDate!) : '没有经期记录'}</span><small>仅替换 Life Space 本机 Period 记录与设置。不会读取旧网站，也不会修改 Todo、情侣待办或全局设置。</small></div>{hasContent && <><p className="period-form-error">当前小月历已有内容。建议先导出加密备份；确认后将替换 Period 数据。</p><label className="period-confirm-row"><input type="checkbox" checked={replaceConfirmed} onChange={(event) => setReplaceConfirmed(event.target.checked)} />我了解并确认替换小月历数据</label></>}<div className="period-dialog-actions"><button className="period-primary" disabled={hasContent && !replaceConfirmed} onClick={() => void applyImport()}>{hasContent ? '确认替换小月历数据' : '确认导入'}</button></div></>)}
      {dialog === 'clear' && <><p className="period-dialog-note">只删除小月历经期记录、设置、备忘和 PIN。个人待办、情侣待办、周年纪念与全局设置不变。</p><label className="period-confirm-row"><input type="checkbox" checked={confirmAction} onChange={(event) => setConfirmAction(event.target.checked)} />我确认清除小月历数据</label><div className="period-dialog-actions"><button className="period-danger" disabled={!confirmAction} onClick={() => void clearData()}>清除小月历</button></div></>}
      {importError && dialog === 'import' && <p role="alert" className="period-form-error">{importError}</p>}
    </PeriodDialog>}
    {message && <div className="period-toast" role="status">{message}{undo && screen === 'calendar' && <button onClick={() => void undoToggle()}>撤销</button>}</div>}
  </section>;
}

function dialogTitle(dialog: Dialog, record: PeriodRecord | null): string {
  if (dialog === 'record') return record ? '编辑经期记录' : '添加经期记录';
  if (dialog === 'backfill') return '补录历史经期';
  if (dialog === 'delete') return '删除这段记录？';
  if (dialog === 'pin') return '小月历隐私锁';
  if (dialog === 'export') return '导出加密备份';
  if (dialog === 'import') return '从旧小月历导入';
  return '清除小月历数据？';
}

function PeriodDialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="period-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="period-dialog" role="dialog" aria-modal="true" aria-labelledby="period-dialog-title"><button className="period-dialog-close" aria-label="关闭" onClick={onClose}><Icon name="close" /></button><p className="period-kicker">小月历</p><h2 id="period-dialog-title">{title}</h2>{children}</section></div>;
}

function PinFields({ mode, pin, confirm, error, setPin, setConfirm, onSubmit }: { mode: PinMode; pin: string; confirm: string; error: string; setPin: (value: string) => void; setConfirm: (value: string) => void; onSubmit: () => void; onClose: () => void }) {
  return <><p className="period-dialog-note">PIN 只遮挡 Period 页面，不是设备级加密；旧备份不包含 PIN。</p><label className="period-password-field">{mode === 'setup' ? '新 PIN（4–12 位数字）' : 'PIN'}<input type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(event) => setPin(event.target.value)} /></label>{mode === 'setup' && <label className="period-password-field">再次输入 PIN<input type="password" inputMode="numeric" autoComplete="off" value={confirm} onChange={(event) => setConfirm(event.target.value)} /></label>}{error && <p className="period-form-error" role="alert">{error}</p>}<div className="period-dialog-actions"><button className="period-primary" onClick={onSubmit}>{mode === 'unlock' ? '解锁' : mode === 'setup' ? '设置 PIN' : '关闭 PIN'}</button></div></>;
}
