import { useEffect, useState } from 'react';
import type { DataSource } from './types';
import { engineConfig, RemoteSource, savedCredentials } from './api';
import { AppShell } from './components/AppShell';
import { useToast } from './hooks/useToast';
import { JobsPage } from './pages/Jobs';
import { Overview } from './pages/Overview';
import { PublishPage } from './pages/Publish';
import { ReviewPage } from './pages/Review';
import { TemplatesPage } from './pages/Templates';
import { useRoute } from './router';
import { IconSpark } from './icons';

export default function App() {
  const [source, setSource] = useState<DataSource | null>(null);
  return source
    ? <OperatorApp source={source} onLogout={() => setSource(null)} />
    : <Login onReady={setSource} />;
}

function Login({ onReady }: { onReady: (s: DataSource) => void }) {
  const saved = savedCredentials();
  const [f, setF] = useState({
    siteSlug: saved?.siteSlug ?? 'sochumenh',
    email: saved?.email ?? '',
    password: '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.value });

  const signIn = async () => {
    setBusy(true);
    setErr('');
    try {
      const src = new RemoteSource({ ...engineConfig(), ...f });
      await src.signIn();
      await src.load();
      onReady(src);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login">
        <div className="brand"><IconSpark /><span style={{ fontSize: 16, fontWeight: 800 }}>pSEO.engine</span></div>
        <div className="card">
          <div><label>Site slug</label><input value={f.siteSlug} onChange={set('siteSlug')} placeholder="sochumenh" /></div>
          <div><label>Email</label><input value={f.email} onChange={set('email')} autoComplete="username" /></div>
          <div><label>Password</label><input type="password" value={f.password} onChange={set('password')} autoComplete="current-password" /></div>
          {err && <p className="hint" style={{ color: 'var(--coral)' }}>{err}</p>}
          <button type="button" className="btn-dark" disabled={busy} onClick={signIn}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </div>
      </div>
    </div>
  );
}

function OperatorApp({ source, onLogout }: { source: DataSource; onLogout: () => void }) {
  const route = useRoute();
  const { toast, notify } = useToast();
  const [flaggedCount, setFlaggedCount] = useState(0);

  useEffect(() => {
    source.load().then((d) => {
      const s = d.stats.items_by_status;
      setFlaggedCount((s.flagged ?? 0) + (s.failed_validation ?? 0));
    });
  }, [source, route]);

  let page: React.ReactNode;
  switch (route.page) {
    case 'overview':
      page = <Overview source={source} notify={notify} />;
      break;
    case 'templates':
      page = <TemplatesPage source={source} notify={notify} />;
      break;
    case 'jobs':
      page = <JobsPage source={source} notify={notify} />;
      break;
    case 'review':
      page = <ReviewPage source={source} jobId={route.jobId} notify={notify} />;
      break;
    case 'publish':
      page = <PublishPage source={source} notify={notify} />;
      break;
    default: {
      const _exhaustive: never = route;
      page = <Overview source={source} notify={notify} />;
      void _exhaustive;
    }
  }

  return (
    <>
      <AppShell
        route={route}
        adminName={source.adminName}
        flaggedCount={flaggedCount}
        onLogout={onLogout}
      >
        {page}
      </AppShell>
      {toast && <div className={`toast${toast.err ? ' err' : ''}`}>{toast.msg}</div>}
    </>
  );
}
