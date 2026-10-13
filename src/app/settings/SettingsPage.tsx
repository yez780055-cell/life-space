import { Icon } from '../../shared/ui/icons';
import { privacyNote } from '../../shared/security/privacy';

export function SettingsPage({ onBack, onAbout }: { onBack: () => void; onAbout: () => void }) {
  return <section className="settings-page" aria-label="设置">
    <div className="subhead"><button className="icon-button" onClick={onBack} aria-label="返回"><Icon name="arrow"/></button><span>设置</span></div>
    <div className="settings-body"><p className="eyebrow">YOUR SPACE</p><h1>简单一点，刚刚好。</h1><p className="muted">这里会放与整个应用有关的设置。</p>
      <button className="setting-row" onClick={onAbout}><span><strong>关于测试版本</strong><small>版本与本地数据说明</small></span><span aria-hidden="true">↗</span></button>
      <p className="privacy-note">{privacyNote}</p>
    </div>
  </section>;
}
