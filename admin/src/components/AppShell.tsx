import type { ReactNode } from 'react';
import type { Route } from '../router';
import { navigate } from '../router';
import {
  IconCalendar, IconDoc, IconFlag, IconHome, IconLogout, IconSpark,
} from '../icons';

const NAV: { route: Route; title: string; icon: () => JSX.Element; badge?: 'flagged' }[] = [
  { route: { page: 'overview' }, title: 'Overview', icon: IconHome, badge: 'flagged' },
  { route: { page: 'templates' }, title: 'Templates', icon: IconDoc },
  { route: { page: 'jobs' }, title: 'Jobs', icon: IconCalendar },
  { route: { page: 'publish' }, title: 'Publish', icon: IconFlag },
];

export function AppShell({
  route,
  adminName,
  flaggedCount,
  onLogout,
  children,
}: {
  route: Route;
  adminName: string;
  flaggedCount: number;
  onLogout: () => void;
  children: ReactNode;
}) {
  const active = (r: Route) => {
    if (route.page === 'review' && r.page === 'jobs') return true;
    if (route.page !== r.page) return false;
    if (route.page === 'review' && r.page === 'review') return route.jobId === r.jobId;
    return true;
  };

  return (
    <div className="frame">
      <aside className="side">
        <div className="brand"><IconSpark /><span>pSEO.engine</span></div>
        <nav className="nav">
          {NAV.map(({ route: r, title, icon: Icon, badge }) => (
            <button
              key={r.page}
              className={`nav-btn${active(r) ? ' active' : ''}`}
              title={title}
              onClick={() => navigate(r)}
            >
              <Icon />
              {badge === 'flagged' && flaggedCount > 0 && <span className="dot" />}
            </button>
          ))}
        </nav>
        <div className="spacer" />
        <nav className="nav secondary">
          <button className="nav-btn" title="Sign out" onClick={onLogout}><IconLogout /></button>
        </nav>
        <div className="avatar">{adminName.slice(0, 1).toUpperCase()}</div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
