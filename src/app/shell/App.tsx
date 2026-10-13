import { useCallback, useEffect, useRef, useState } from 'react';
import { loadLastModule, MODULES, type ModuleId } from '../../shared/storage/settings';
import { useNavigation } from '../navigation/useNavigation';
import { Icon } from '../../shared/ui/icons';
import { todayLabel } from '../../shared/date/today';
import { todoContent } from '../../modules/todo';
import { periodContent } from '../../modules/period';
import { anniversaryContent } from '../../modules/anniversary';
import { SettingsPage } from '../settings/SettingsPage';
import { isAndroidApp } from '../../shared/platform/platform';

const content = { todo: todoContent, period: periodContent, anniversary: anniversaryContent };

function ModulePage({ module, page, onGuide, onBack }: { module: ModuleId; page: 'home' | 'guide'; onGuide: () => void; onBack: () => void }) {
  const item = content[module];
  return <section className={`module-page ${item.color}`} aria-label={item.title}>
    {page === 'guide' ? <><div className="subhead"><button className="icon-button" onClick={onBack} aria-label="返回"><Icon name="arrow"/></button><span>{item.title}</span></div><div className="guide-body"><span className="large-mark"><Icon name={module}/></span><p className="eyebrow">COMING NEXT</p><h1>{item.title}，正在准备中。</h1><p className="muted">这是一页基础导航预览。实际记录功能会在后续阶段加入。</p></div></> : <>
      <div className="module-top"><p className="eyebrow">{todayLabel()}</p><span className="module-index">0{MODULES.indexOf(module) + 1} / 03</span></div>
      <div className="hero"><div className="hero-symbol"><Icon name={module}/></div><h1>{item.title}</h1><p className="lead">{item.subtitle}</p><p className="muted">{item.description}</p></div>
      <div className="coming"><div className="coming-line"/><p className="eyebrow">A LITTLE SPACE FOR YOU</p><h2>你的空间，即将开始。</h2><p>这一部分的记录功能还没有开放。先熟悉这个轻盈的入口，之后再慢慢填满它。</p><button className="text-button" onClick={onGuide}>了解这个空间 <span aria-hidden="true">↗</span></button></div>
    </>}
  </section>;
}

function AboutDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.querySelector<HTMLElement>('button')?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key !== 'Tab' || !ref.current) return;
      const focusable = [...ref.current.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])')].filter((element) => !element.hasAttribute('disabled'));
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('keydown', handleKey); previous?.focus(); };
  }, [onClose]);
  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="dialog" ref={ref} role="dialog" aria-modal="true" aria-labelledby="about-title"><button className="icon-button close" onClick={onClose} aria-label="关闭"><Icon name="close"/></button><span className="brand-mark"><Icon name="spark"/></span><p className="eyebrow">FOUNDATION PREVIEW</p><h2 id="about-title">Life Space</h2><p>开发测试版 0.1.0</p><p className="muted">当前只有应用框架和三个占位空间。显示名称与正式 Android 包名尚未确定。</p><button className="primary-button" onClick={onClose}>知道了</button></div></div>;
}

function ReadyApp({ startModule, onError }: { startModule: ModuleId; onError: (message: string) => void }) {
  const { snapshot, historyReady, exitHint, selectModule, showGuide, showSurface, back } = useNavigation(startModule, onError);
  const isSettings = snapshot.surfaces.includes('settings');
  const isAbout = snapshot.surfaces.at(-1) === 'about';
  if (!historyReady) return <div className="loading"><span className="brand-mark"><Icon name="spark"/></span><p>正在打开你的空间…</p></div>;
  return <div className="app-frame">
    <aside className="sidebar" inert={isAbout}><div className="brand"><span className="brand-mark"><Icon name="spark"/></span><span><strong>Life Space</strong><small>开发测试版</small></span></div><p className="sidebar-caption">MY LITTLE WORLD</p><nav aria-label="主要导航" inert={isSettings}>{MODULES.map((id) => <button key={id} className={`nav-link ${snapshot.module === id ? 'active' : ''}`} onClick={() => selectModule(id)} aria-current={snapshot.module === id ? 'page' : undefined}><Icon name={id}/><span>{content[id].title}</span><span className="nav-dot"/></button>)}</nav><button className="sidebar-settings" disabled={isSettings} onClick={() => showSurface('settings')}><Icon name="settings"/> 设置</button><div className="sidebar-foot">给生活留一点<br/>柔软的空间。</div></aside>
    <main className="main-area" inert={isAbout}><header className="mobile-header"><div className="mobile-brand"><span className="brand-mark"><Icon name="spark"/></span><span>Life Space <small>测试版</small></span></div><button className="icon-button" disabled={isSettings} onClick={() => showSurface('settings')} aria-label="打开设置"><Icon name="settings"/></button></header>
      {MODULES.map((id) => <div key={id} className={`module-holder ${snapshot.module === id && !isSettings ? 'visible' : ''}`} hidden={snapshot.module !== id || isSettings}><ModulePage module={id} page={snapshot.pages[id]} onGuide={showGuide} onBack={() => void back()}/></div>)}
      {isSettings && <SettingsPage onBack={() => void back()} onAbout={() => showSurface('about')}/>}
      <nav className="bottom-nav" aria-label="主要导航" inert={isSettings}>{MODULES.map((id) => <button key={id} className={snapshot.module === id ? 'active' : ''} onClick={() => selectModule(id)} aria-current={snapshot.module === id ? 'page' : undefined}><Icon name={id}/><span>{content[id].title}</span></button>)}</nav>
    </main>
    {isAbout && <AboutDialog onClose={() => void back()}/>}
    {exitHint && <div className="toast" role="status">再按一次返回键退出测试版</div>}
    {isAndroidApp() && <span className="sr-only">Android 测试版本</span>}
  </div>;
}

export default function App() {
  const [startModule, setStartModule] = useState<ModuleId | null>(null);
  const [error, setError] = useState('');
  const onError = useCallback((message: string) => setError(message), []);
  useEffect(() => {
    let active = true;
    loadLastModule().then((module) => { if (active) setStartModule(module); }).catch(() => { if (active) { setError('无法读取本地设置。本次将从待办开始；请检查设备存储。'); setStartModule('todo'); } });
    return () => { active = false; };
  }, []);
  return <>{startModule ? <ReadyApp startModule={startModule} onError={onError}/> : <div className="loading"><span className="brand-mark"><Icon name="spark"/></span><p>正在打开你的空间…</p></div>}{error && <div className="error-banner" role="alert">{error}<button onClick={() => setError('')}>关闭</button></div>}</>;
}
