import { CSSProperties, FormEvent, ReactNode, useEffect, useState } from 'react';
import QRCode from 'qrcode';

type Role = 'organizer' | 'staff' | 'admin';
type AccountRole = 'member' | Role;
type Page = 'overview' | 'events' | 'checkin' | 'reviews' | 'nfc' | 'tasks' | 'market' | 'accounts';
type MemberPage = 'home' | 'market' | 'tasks' | 'friends' | 'settings';
type AccessoryId = 'bright-star' | 'sunny-cap' | 'petal-pin' | 'trail-scarf' | 'cloud-mitts' | 'meadow-socks' | 'tide-loop';
type MemberProfile = { id: string; name: string; email: string; plushieName: string; plushieType: string; plushiePaired: boolean; accessories: AccessoryId[]; pendingAccessories: AccessoryId[]; equippedAccessories: AccessoryId[]; friendIds: string[]; notificationPreferences: { dailyGreeting: boolean; tasks: boolean; events: boolean; friends: boolean; orders: boolean }; streak: number; points: number; lifetimePoints: number; lastPlushieScanAt: string | null; questBoardDate: string | null; dailyQuests: Array<{ id: string; title: string; description: string; points: number; completed: boolean }> };
type Identity = { token: string; account: { id: string; name: string; email: string; role: AccountRole }; role: AccountRole; handoffToken?: string; member?: MemberProfile };

const accessoryCatalog: { id: AccessoryId; name: string; category: string; rarity: string; tone: string; color: string; primary: string; deep: string; soft: string; secondary: string }[] = [
  { id: 'bright-star', name: 'Bright star', category: 'Badge', rarity: 'Rare', tone: 'lime', color: '#F8F5B7', primary: '#F5E94B', deep: '#3D3A12', soft: '#FFFDEA', secondary: '#F3D95C' },
  { id: 'sunny-cap', name: 'Sunny cap', category: 'Hat', rarity: 'Uncommon', tone: 'peach', color: '#FFF1C4', primary: '#FF9B55', deep: '#5F3517', soft: '#FFF4E7', secondary: '#F7BD4B' },
  { id: 'petal-pin', name: 'Petal pin', category: 'Badge', rarity: 'Common', tone: 'peach', color: '#FFE0E8', primary: '#FF8178', deep: '#773345', soft: '#FFF0F3', secondary: '#E94C86' },
  { id: 'trail-scarf', name: 'Trail scarf', category: 'Scarf', rarity: 'Epic', tone: 'lavender', color: '#E8E0FF', primary: '#8C78D5', deep: '#453778', soft: '#F2EEFF', secondary: '#5D91DB' },
  { id: 'cloud-mitts', name: 'Cloud mitts', category: 'Hand mitts', rarity: 'Rare', tone: 'blue', color: '#DDF8EF', primary: '#6FD3BC', deep: '#1D574E', soft: '#ECFBF7', secondary: '#4DAF9C' },
  { id: 'meadow-socks', name: 'Meadow socks', category: 'Socks', rarity: 'Common', tone: 'lime', color: '#E1F2DF', primary: '#78C977', deep: '#2D5B2C', soft: '#F0FAEC', secondary: '#A4D968' },
  { id: 'tide-loop', name: 'Tide loop', category: 'Bracelet', rarity: 'Legendary', tone: 'blue', color: '#DDF4FA', primary: '#55C4D8', deep: '#1E5265', soft: '#EBFAFD', secondary: '#5E92E8' },
];

const openSourceCredits = [
  { name: 'OpenStreetMap', detail: 'Map data © OpenStreetMap contributors', license: 'Open Data Commons Open Database License', url: 'https://www.openstreetmap.org/copyright' },
  { name: 'OpenFreeMap', detail: 'Map styles and tile delivery', license: 'Open map service', url: 'https://openfreemap.org/' },
  { name: 'MapLibre GL JS', detail: 'Interactive map rendering', license: 'BSD 3-Clause', url: 'https://github.com/maplibre/maplibre-gl-js' },
  { name: 'React, React Native & React DOM', detail: 'Application interfaces and runtime', license: 'MIT License', url: 'https://github.com/facebook/react' },
  { name: 'Expo', detail: 'Cross-platform application tooling and modules', license: 'MIT License', url: 'https://github.com/expo/expo' },
  { name: 'Three.js & React Three Fiber', detail: '3D plushie and accessory rendering', license: 'MIT License', url: 'https://github.com/pmndrs/react-three-fiber' },
  { name: 'Ionicons', detail: 'Mobile interface iconography', license: 'MIT License', url: 'https://github.com/ionic-team/ionicons' },
  { name: 'react-native-nfc-manager', detail: 'NFC pairing and plushie interaction', license: 'MIT License', url: 'https://github.com/revtel/react-native-nfc-manager' },
  { name: 'react-native-qrcode-svg', detail: 'Friend and accessory QR codes', license: 'MIT License', url: 'https://github.com/Expensify/react-native-qrcode-svg' },
  { name: 'React Native WebView', detail: 'Native map presentation', license: 'MIT License', url: 'https://github.com/react-native-webview/react-native-webview' },
  { name: 'Express, SQLite & Zod', detail: 'API, persistent storage and validation', license: 'Open-source software', url: 'https://github.com/expressjs/express' },
  { name: 'Vite', detail: 'Web development and production build tooling', license: 'MIT License', url: 'https://github.com/vitejs/vite' },
] as const;

type EventItem = {
  id: string;
  title: string;
  place: string;
  date: string;
  time: string;
  duration: string;
  capacity: number | null;
  attending: number;
  points: number;
  status: 'Open' | 'Draft' | 'Completed';
};

const initialEvents: EventItem[] = [];

const navByRole: Record<Role, { page: Page; label: string; icon: IconName }[]> = {
  organizer: [
    { page: 'overview', label: 'Overview', icon: 'grid' },
    { page: 'events', label: 'My events', icon: 'calendar' },
    { page: 'checkin', label: 'Check-in', icon: 'scan' },
  ],
  staff: [
    { page: 'overview', label: 'Overview', icon: 'grid' },
    { page: 'reviews', label: 'Review queue', icon: 'spark' },
    { page: 'nfc', label: 'Physical tags', icon: 'scan' },
    { page: 'tasks', label: 'Tasks & events', icon: 'map' },
    { page: 'market', label: 'Marketplace', icon: 'bag' },
  ],
  admin: [
    { page: 'overview', label: 'Overview', icon: 'grid' },
    { page: 'reviews', label: 'Review queue', icon: 'spark' },
    { page: 'nfc', label: 'Physical tags', icon: 'scan' },
    { page: 'tasks', label: 'Tasks & events', icon: 'map' },
    { page: 'market', label: 'Marketplace', icon: 'bag' },
    { page: 'accounts', label: 'Accounts', icon: 'people' },
  ],
};

type IconName = 'home' | 'settings' | 'grid' | 'calendar' | 'scan' | 'spark' | 'map' | 'bag' | 'people' | 'plus' | 'arrow' | 'leaf' | 'clock' | 'pin' | 'check' | 'search' | 'more' | 'phone' | 'shield' | 'logout' | 'menu' | 'close';

const iconPaths: Record<IconName, ReactNode> = {
  home: <><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10M9 20v-6h6v6"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1A1.7 1.7 0 0 0 2.9 13H3V9h-.1A1.7 1.7 0 0 0 4.6 8a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.16.37.38.71.66 1 .28.28.63.5 1.04.6V13a1.7 1.7 0 0 0-1.1.4 1.7 1.7 0 0 0-.6 1.6Z"/></>,
  grid: <><rect x="4" y="4" width="6" height="6" rx="2"/><rect x="14" y="4" width="6" height="6" rx="2"/><rect x="4" y="14" width="6" height="6" rx="2"/><rect x="14" y="14" width="6" height="6" rx="2"/></>,
  calendar: <><path d="M7 3v3M17 3v3M4 9h16"/><rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 13h3M13 13h3M8 17h3"/></>,
  scan: <><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M8 12h8"/></>,
  spark: <><path d="m12 3 1.35 4.1L17 9l-3.65 1.9L12 15l-1.35-4.1L7 9l3.65-1.9L12 3Z"/><path d="m18 15 .7 2.1L21 18l-2.3.9L18 21l-.7-2.1L15 18l2.3-.9L18 15Z"/></>,
  map: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z"/><path d="M9 3v15M15 6v15"/></>,
  bag: <><path d="M5 8h14l1 13H4L5 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></>,
  people: <><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 4a3 3 0 0 1 0 6M17 13a5 5 0 0 1 4 5v2"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  arrow: <path d="m9 18 6-6-6-6"/>,
  leaf: <><path d="M20 4C10 4 5 9 5 15c0 3 2 5 5 5 6 0 10-6 10-16Z"/><path d="M5 20c2-5 6-8 11-11"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  phone: <><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 18h4"/></>,
  shield: <path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6l-7-3Z"/>,
  logout: <><path d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9"/></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16"/>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
};

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconPaths[name]}</svg>;
}

function Logo({ operations = true }: { operations?: boolean }) {
  return <div className="logo" aria-label="novo"><span className="logo-mark"><span /></span><strong>novo</strong>{operations && <em>operations</em>}</div>;
}

export function App() {
  const [role, setRole] = useState<Role | null>(null);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [page, setPage] = useState<Page>('overview');
  const [participantGate, setParticipantGate] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [events, setEvents] = useState(initialEvents);
  const [eventModal, setEventModal] = useState(false);
  const [toast, setToast] = useState('');

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2400);
  };

  const applyIdentity = (next: Identity) => {
    window.localStorage.setItem('novo-web-session', next.token);
    setIdentity(next);
    setParticipantGate(false);
    if (next.role !== 'member') {
      setRole(next.role);
      setPage('overview');
    } else {
      setRole(null);
    }
  };

  const signOut = () => {
    window.localStorage.removeItem('novo-web-session');
    setIdentity(null);
    setRole(null);
    setParticipantGate(false);
  };

  useEffect(() => {
    const token = window.localStorage.getItem('novo-web-session');
    if (!token) {
      setAuthReady(true);
      return;
    }
    fetch('/api/auth/session', { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        if (!response.ok) throw new Error('Session expired');
        return response.json() as Promise<Omit<Identity, 'token'>>;
      })
      .then((session) => applyIdentity({ ...session, token }))
      .catch(() => window.localStorage.removeItem('novo-web-session'))
      .finally(() => setAuthReady(true));
  }, []);

  useEffect(() => {
    document.title = identity?.role === 'member' ? 'novo' : 'novo operations';
  }, [identity]);

  useEffect(() => {
    if (!identity || identity.role === 'member') return;
    fetch('/api/portal/events', { headers: { Authorization: `Bearer ${identity.token}` } })
      .then((response) => response.json())
      .then((result: { events?: Array<{ id: string; title: string; location: string; startsAt: string; durationMinutes: number; capacity: number | null; attendees: string[]; points: number; status: 'draft' | 'open' | 'completed' }> }) => setEvents((result.events ?? []).map((event) => { const starts = new Date(event.startsAt); return { id: event.id, title: event.title, place: event.location, date: starts.toLocaleDateString('en-SG', { day: '2-digit', month: 'short' }), time: starts.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: false }), duration: event.durationMinutes >= 60 && event.durationMinutes % 60 === 0 ? `${event.durationMinutes / 60} hr` : `${event.durationMinutes} min`, capacity: event.capacity, attending: event.attendees.length, points: event.points, status: event.status === 'open' ? 'Open' : event.status === 'draft' ? 'Draft' : 'Completed' }; })))
      .catch(() => setEvents([]));
  }, [identity]);

  const isPhone = window.matchMedia('(max-width: 800px)').matches;

  if (!authReady) return <div className="auth-loading"><Logo /><span /></div>;

  if (!identity) return <AccessScreen onAuthenticated={applyIdentity} />;

  if (identity.role === 'member') {
    if (isPhone || participantGate) return <DownloadExperience identity={identity} onBack={participantGate && !isPhone ? () => setParticipantGate(false) : undefined} onSignOut={signOut} />;
    return <MemberWeb identity={identity} onGetApp={() => setParticipantGate(true)} onSignOut={signOut} />;
  }

  if (!role) return null;

  const navigate = (next: Page) => { setPage(next); setMobileNav(false); };

  return (
    <div className="portal-shell">
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <div className="side-top"><Logo /><button className="icon-button side-close" onClick={() => setMobileNav(false)} aria-label="Close navigation"><Icon name="close" /></button></div>
        <div className="workspace-chip"><span className="avatar">{identity.account.name[0]}</span><span><small>Signed in as</small><b>{role === 'admin' ? 'Administrator' : role === 'staff' ? 'Staff member' : 'Event organizer'}</b></span></div>
        <nav aria-label="Portal navigation">
          <p className="nav-label">Workspace</p>
          {navByRole[role].map((item) => <button key={item.page} className={page === item.page ? 'nav-item active' : 'nav-item'} onClick={() => navigate(item.page)}><Icon name={item.icon} /><span>{item.label}</span>{page === item.page && <i />}</button>)}
        </nav>
        <div className="side-spacer" />
        <div className="app-promo"><span className="promo-icon"><Icon name={role === 'organizer' ? 'scan' : 'shield'} /></span><b>{role === 'organizer' ? 'Scanning is built in' : 'Secure operations'}</b><p>{role === 'organizer' ? 'Check in attendees from this page on any phone—no app required.' : 'Your role and permissions stay with your verified account.'}</p><button onClick={() => role === 'organizer' ? navigate('checkin') : showToast('Your operations session is protected')} >{role === 'organizer' ? 'Open check-in' : 'Session protected'} <Icon name="arrow" size={16} /></button></div>
        <button className="nav-item sign-out" onClick={signOut}><Icon name="logout" /><span>Sign out</span></button>
      </aside>

      {mobileNav && <button className="scrim" onClick={() => setMobileNav(false)} aria-label="Close navigation" />}

      <main className="main-content">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Icon name="menu" /></button>
          <div><p className="eyebrow">NOVO OPERATIONS</p><h1>{pageTitle(page)}</h1></div>
          <div className="top-actions"><label className="search"><Icon name="search" size={18} /><input aria-label="Search portal" placeholder="Search" /></label><button className="avatar-button" aria-label="Account menu">{identity.account.name[0]}<span /></button></div>
        </header>

        <div className="content-wrap">
          {page === 'overview' && <Overview role={role} name={identity.account.name} events={events} onNavigate={navigate} onCreate={() => setEventModal(true)} />}
          {page === 'events' && <Events token={identity.token} events={events} onEvents={setEvents} onCreate={() => setEventModal(true)} onCheckin={() => navigate('checkin')} showToast={showToast} />}
          {page === 'checkin' && <CheckIn token={identity.token} events={events} showToast={showToast} />}
          {page === 'reviews' && <Reviews token={identity.token} showToast={showToast} />}
          {page === 'nfc' && <NfcTags token={identity.token} showToast={showToast} />}
          {page === 'tasks' && <Tasks token={identity.token} events={events} onEvents={setEvents} showToast={showToast} />}
          {page === 'market' && <Marketplace token={identity.token} showToast={showToast} />}
          {page === 'accounts' && role === 'admin' && <Accounts token={identity.token} showToast={showToast} />}
        </div>
      </main>

      {eventModal && <CreateEvent token={identity.token} organizerId={identity.account.id} onClose={() => setEventModal(false)} onCreate={(event) => { setEvents((current) => [event, ...current]); setEventModal(false); setPage('events'); showToast('Event published successfully'); }} />}
      {toast && <div className="toast"><span><Icon name="check" size={17} /></span>{toast}</div>}
    </div>
  );
}

function AccessScreen({ onAuthenticated }: { onAuthenticated: (identity: Identity) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/auth/web-sign-in', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? 'Unable to sign in.');
      onAuthenticated(result as Identity);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to sign in.');
    } finally {
      setBusy(false);
    }
  };

  return <div className="access-page"><div className="access-art"><Logo /><div className="art-copy"><span className="kicker">ONE NOVO · THE RIGHT WORKSPACE</span><h1>Small actions.<br/><em>Visible impact.</em></h1><p>Sign in once. novo will open the member experience or Operations based on your verified role.</p></div><div className="impact-card"><div className="impact-icon"><Icon name="leaf" /></div><span><small>Connected system</small><b>Plushie to planet</b><p>verified actions stay in one shared account</p></span></div><div className="orbit orbit-one" /><div className="orbit orbit-two" /></div><section className="login-panel"><form className="login-inner auth-form" onSubmit={submit}><div className="mobile-logo"><Logo /></div><p className="eyebrow">WELCOME BACK</p><h2>Sign in to novo</h2><p className="muted">We’ll take you to the right experience automatically.</p><label className="auth-field"><span>Email</span><input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com"/></label><label className="auth-field"><span>Password</span><input type="password" required minLength={6} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 6 characters"/></label>{error && <p className="auth-error" role="alert">{error}</p>}<button className="primary wide" type="submit" disabled={busy}>{busy ? 'Opening novo…' : 'Continue'}<Icon name="arrow" /></button><p className="legal">Protected workspace · Your permissions follow your verified account</p></form></section></div>;
}

function DownloadExperience({ identity, onBack, onSignOut }: { identity: Identity; onBack?: () => void; onSignOut: () => void }) {
  const handoff = identity.handoffToken ?? '';
  const deepLink = `novo://auth/handoff?token=${encodeURIComponent(handoff)}`;
  const plushieName = identity.member?.plushieName || 'Your plushie';
  return <div className="access-page"><div className="access-art"><Logo /><div className="art-copy"><span className="kicker">SIGNED IN · READY TO CONTINUE</span><h1>Your planet pal<br/>is waiting.</h1><p>Install novo, then open your secure sign-in link to continue as {identity.account.name} without entering your password again.</p></div><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="phone-mock"><div className="phone-notch"/><div className="mini-logo">novo</div><div className="mini-bear">●<span>ᴗ</span>●</div><b>{plushieName}</b><small>Your planet pal</small></div></div><section className="download-panel"><div className="download-actions">{onBack && <button className="text-button" onClick={onBack}>← Back to web</button>}<button className="text-button" onClick={onSignOut}>Sign out</button></div><span className="download-icon"><Icon name="phone" size={30}/></span><p className="eyebrow">NOVO MOBILE</p><h2>Continue in the app</h2><p className="muted">You’re signed in as <b>{identity.account.email}</b>. Install the internal APK or store release supplied by your novo administrator, then use this one-time handoff.</p><a className="primary wide open-app" href={deepLink}>Open novo and sign in<Icon name="arrow"/></a><div className="handoff-note"><Icon name="shield"/><span><b>Private sign-in handoff</b><small>After installing, return here and tap “Open novo and sign in”. The link works once.</small></span></div></section></div>;
}

function MemberWeb({ identity, onGetApp, onSignOut }: { identity: Identity; onGetApp: () => void; onSignOut: () => void }) {
  const [active, setActive] = useState<MemberPage>('home');
  const fallback: MemberProfile = { id: identity.account.id, name: identity.account.name, email: identity.account.email, plushieName: '', plushieType: 'Natural calico bear', plushiePaired: false, accessories: [], pendingAccessories: [], equippedAccessories: [], friendIds: [], notificationPreferences: { dailyGreeting: true, tasks: true, events: true, friends: true, orders: true }, streak: 0, points: 0, lifetimePoints: 0, lastPlushieScanAt: null, questBoardDate: null, dailyQuests: [] };
  const [profile, setProfile] = useState<MemberProfile>(identity.member ?? fallback);
  const [closetOpen, setClosetOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [syncState, setSyncState] = useState<'syncing' | 'synced' | 'offline'>('syncing');
  const memberNav: { id: MemberPage; label: string; icon: IconName; cta?: boolean }[] = [
    { id: 'home', label: 'Home', icon: 'home' },
    { id: 'market', label: 'Market', icon: 'bag' },
    { id: 'tasks', label: 'Tasks', icon: 'map', cta: true },
    { id: 'friends', label: 'Friends', icon: 'people' },
    { id: 'settings', label: 'Settings', icon: 'settings' },
  ];
  const notify = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(''), 2600); };
  const refreshMember = async () => {
    setSyncState('syncing');
    try {
      const response = await fetch('/api/member/profile', { headers: { Authorization: `Bearer ${identity.token}` } });
      const data = await response.json() as { user?: MemberProfile; message?: string };
      if (!response.ok || !data.user) throw new Error(data.message ?? 'Could not refresh your profile.');
      setProfile(data.user);
      setSyncState('synced');
    } catch {
      setSyncState('offline');
    }
  };
  useEffect(() => {
    void refreshMember();
    const refreshOnFocus = () => void refreshMember();
    const refreshWhenVisible = () => { if (document.visibilityState === 'visible') void refreshMember(); };
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') void refreshMember(); }, 15000);
    window.addEventListener('focus', refreshOnFocus);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshOnFocus);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [identity.token]);
  const updateMember = async (path: string, body: object, success: string) => {
    if (busy) return;
    setBusy(true);
    setSyncState('syncing');
    try {
      const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${identity.token}` }, body: JSON.stringify(body) });
      const data = await response.json() as { user?: MemberProfile; message?: string };
      if (!response.ok || !data.user) throw new Error(data.message ?? 'Could not update your novo profile.');
      setProfile(data.user);
      setSyncState('synced');
      notify(success);
    } catch (error) {
      setSyncState('offline');
      notify(error instanceof Error ? error.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };
  const firstPalette = accessoryCatalog.find((item) => item.id === profile.equippedAccessories[0]) ?? accessoryCatalog[0];
  const lastEquipped = profile.equippedAccessories[profile.equippedAccessories.length - 1];
  const lastPalette = accessoryCatalog.find((item) => item.id === lastEquipped) ?? firstPalette;
  const memberStyle = { '--member-accent': firstPalette.primary, '--member-deep': lastPalette.deep, '--member-soft': firstPalette.soft, '--member-secondary': lastPalette.secondary, '--member-glow-one': `${firstPalette.primary}66`, '--member-glow-two': `${lastPalette.secondary}55` } as CSSProperties;

  return <div className="member-web" style={memberStyle}><header><Logo operations={false}/><nav aria-label="Member navigation">{memberNav.map((item) => <button key={item.id} className={`${active === item.id ? 'active' : ''} ${item.cta ? 'member-nav-cta' : ''}`} onClick={() => setActive(item.id)} aria-current={active === item.id ? 'page' : undefined}><span><Icon name={item.icon} size={17}/></span>{item.label}</button>)}</nav><div><button className={`sync-state ${syncState}`} onClick={() => void refreshMember()} aria-label="Refresh mobile app sync"><i/>{syncState === 'syncing' ? 'Syncing…' : syncState === 'offline' ? 'Tap to retry' : 'Synced'}</button><button className="soft-button app-bridge-button" onClick={onGetApp}><Icon name="phone" size={17}/>Open app</button><button className="avatar-button" aria-label="Account menu" onClick={() => setActive('settings')}>{identity.account.name[0]}</button></div></header><main className={`member-main member-${active}`}>
    {active === 'home' && <MemberHome profile={profile} onCloset={() => setClosetOpen(true)} onTasks={() => setActive('tasks')} onGetApp={onGetApp} />}
    {active === 'market' && <MemberMarketplace profile={profile} busy={busy} onBuy={(_id, name) => { notify(`Choose a real pickup locker in the app for ${name}`); onGetApp(); }} onContribute={(amount) => updateMember('/api/member/charity/contribute', { points: amount, causeId: 'clean-shores', causeName: 'Singapore Clean Shores' }, `${amount} leaves given to Singapore Clean Shores`)} />}
    {active === 'tasks' && <MemberTasks token={identity.token} />}
    {active === 'friends' && <MemberFriends token={identity.token} userId={profile.id} onCopy={() => { navigator.clipboard?.writeText(`novo://friends/add?user=${encodeURIComponent(profile.id)}`); notify('Invite link copied'); }} />}
    {active === 'settings' && <MemberSettings identity={identity} profile={profile} onProfile={setProfile} onGetApp={onGetApp} onSignOut={onSignOut} notify={notify} />}
  </main>{closetOpen && <AccessoryCloset profile={profile} busy={busy} onEquip={(id, name) => updateMember('/api/member/accessories/equip', { accessoryId: id }, `${name} ${profile.equippedAccessories.includes(id) ? 'removed from' : 'equipped on'} ${profile.plushieName || 'your plushie'}`)} onClose={() => setClosetOpen(false)} onGetApp={onGetApp} />}{notice && <div className="member-notice" role="status"><Icon name="check" size={16}/>{notice}</div>}<footer className="member-footer"><span><i/>Your leaves, wardrobe and progress stay in sync with the novo app.</span><button className="text-button" onClick={onGetApp}><Icon name="phone" size={15}/>Continue in app</button></footer></div>;
}

function MemberHome({ profile, onCloset, onTasks, onGetApp }: { profile: MemberProfile; onCloset: () => void; onTasks: () => void; onGetApp: () => void }) {
  const level = getMemberLevel(profile.lifetimePoints);
  const firstName = profile.name.split(' ')[0]?.toUpperCase() || 'FRIEND';
  return <><section className="member-hero"><div className="member-copy"><p className="eyebrow">HI, {firstName}</p><h1>Small choices,<br/><em>big change.</em></h1><p>Your web companion keeps everyday progress close. Use the installed app for NFC, camera tasks and {profile.plushieName || 'your plushie'} in full 3D.</p><div className="member-stats"><span aria-label={`${profile.streak} day streak`}><b>🔥 {profile.streak}</b><small>plushie-tap streak</small></span><span><b><Icon name="leaf" size={18}/> {profile.points.toLocaleString()}</b><small>spendable leaves</small></span><span><b>Level {level.level}</b><small>{(level.required - level.current).toLocaleString()} to next level</small></span></div><div className="lifetime-progress"><span><b>{profile.lifetimePoints.toLocaleString()} lifetime leaves</b><small>{level.current.toLocaleString()} / {level.required.toLocaleString()} towards level {level.level + 1}</small></span><i><em style={{ width: `${Math.max(4, Math.round(level.progress * 100))}%` }}/></i></div></div><div className="web-plushie"><span className="plushie-glow glow-one"/><span className="plushie-glow glow-two"/><div className="css-bear"><i className="ear left"/><i className="ear right"/><span className="bear-head"><i/><i/><b>ᴗ</b></span><span className="bear-body"/>{profile.equippedAccessories.includes('bright-star') && <strong className="bear-star">★</strong>}{profile.equippedAccessories.includes('trail-scarf') && <strong className="bear-scarf"/>}</div><span className="web-preview-label"><Icon name="phone" size={13}/>Interactive 3D in app</span><h2>{profile.plushieName || 'Not paired yet'}</h2><p>{profile.plushieType} · {profile.equippedAccessories.length} equipped</p><div className="plushie-actions"><button className="primary" onClick={onCloset}><Icon name="bag" size={18}/>Accessories <span>{profile.equippedAccessories.length}</span></button><button className="soft-button" onClick={onGetApp}><Icon name="scan" size={18}/>Scan in app</button></div></div></section><section className="member-section"><div className="section-heading"><div><p className="eyebrow">TODAY’S QUEST BOARD</p><h2>{profile.dailyQuests.length ? 'Ready after your plushie tap' : 'Tap your plushie to refresh'}</h2></div><button className="text-button" onClick={onTasks}>See all tasks<Icon name="arrow" size={16}/></button></div><div className="member-task-grid">{profile.dailyQuests.map((quest, index) => <article key={quest.id}><span className={`task-art ${['green','purple','peach'][index % 3]}`}><Icon name="leaf" size={28}/></span><div><p className="eyebrow">DAILY QUEST</p><h3>{quest.title}</h3><p>{quest.description}</p><footer><b>+{quest.points} leaves</b><button onClick={onTasks}>View task</button></footer></div></article>)}{!profile.dailyQuests.length && <article><span className="task-art green"><Icon name="scan" size={28}/></span><div><p className="eyebrow">PHYSICAL INTERACTION</p><h3>Scan your plushie in the app</h3><p>The quest board only refreshes after a verified NFC tap.</p><footer><b>Streak protected</b><button onClick={onGetApp}>Open app</button></footer></div></article>}</div></section><MemberAppBridge onGetApp={onGetApp}/></>;
}

function getMemberLevel(lifetimePoints: number) {
  let level = 1;
  let current = Math.max(0, lifetimePoints);
  let required = 400;
  while (current >= required && level < 50) { current -= required; level += 1; required = Math.round(400 * 1.6 ** (level - 1)); }
  return { level, current, required, progress: Math.min(1, current / required) };
}

function MemberAppBridge({ onGetApp }: { onGetApp: () => void }) {
  return <section className="member-app-bridge"><span><Icon name="phone" size={24}/></span><div><p className="eyebrow">PICK UP WHERE YOU LEFT OFF</p><h2>The app unlocks the full novo experience.</h2><p>Use NFC, scan physical accessories, submit camera evidence and rotate your plushie in 3D. Your account and progress are already synced.</p></div><button className="primary" onClick={onGetApp}>Open mobile app<Icon name="arrow"/></button></section>;
}

function MemberMarketplace({ profile, busy, onBuy, onContribute }: { profile: MemberProfile; busy: boolean; onBuy: (id: AccessoryId, name: string) => void; onContribute: (amount: number) => void }) {
  const offers = [{ id: 'sunny-cap' as const, cost: 320 }, { id: 'trail-scarf' as const, cost: 460 }];
  return <div className="member-page"><div className="member-page-title"><div><p className="eyebrow">SPEND WITH PURPOSE</p><h1>Marketplace</h1><p>The same rewards, balance and community causes as the mobile app.</p></div><span className="leaf-balance"><Icon name="leaf"/><b>{profile.points.toLocaleString()}</b><small>available leaves</small></span></div><section className="member-market-hero"><div><p className="eyebrow">LIMITED DROP</p><h2>Wear the change.</h2><p>Accessories made to celebrate better habits. Anything you unlock appears in the app too.</p></div><span>✦</span></section><div className="member-shop-grid compact-offers">{offers.map((offer) => { const item = accessoryCatalog.find((candidate) => candidate.id === offer.id)!; const paired = profile.accessories.includes(offer.id); const waiting = profile.pendingAccessories.includes(offer.id); const unavailable = !paired && !waiting && profile.points < offer.cost; return <article key={item.id}><div className="shop-art" style={{ background: item.color }}><Icon name="bag" size={38}/></div><div><small>{item.category} · {item.rarity}</small><h3>{item.name}</h3><footer><b><Icon name="leaf" size={16}/>{offer.cost}</b><button disabled={busy || unavailable || paired || waiting} className={paired || waiting ? 'soft-button' : 'primary small'} onClick={() => onBuy(item.id, item.name)}>{paired ? 'Paired' : waiting ? 'Awaiting QR' : unavailable ? 'Earn more' : 'Get reward'}</button></footer></div></article>; })}</div><section className="charity-banner"><span><Icon name="leaf" size={30}/></span><div><p className="eyebrow">GIVE POINTS</p><h2>Singapore Clean Shores</h2><p>Fund gloves and collection bags. Your new balance syncs everywhere.</p></div><button className="primary" disabled={busy || profile.points < 100} onClick={() => onContribute(100)}>Give 100</button></section></div>;
}

function MemberTasks({ token }: { token: string }) {
  const [locations, setLocations] = useState<Array<{ id: string; kind: string; name: string; address: string; hours: string }>>([]);
  const [quests, setQuests] = useState<Array<{ id: string; title: string; description: string; points: number }>>([]);
  useEffect(() => {
    Promise.all([
      fetch('/api/locations').then((response) => response.json()),
      fetch('/api/member/tasks', { headers: { Authorization: `Bearer ${token}` } }).then((response) => response.json()),
    ]).then(([locationResult, taskResult]) => { setLocations(locationResult.locations ?? []); setQuests(taskResult.quests ?? []); }).catch(() => undefined);
  }, [token]);
  return <div className="member-page"><div className="member-page-title"><div><p className="eyebrow">VERIFIED AROUND SINGAPORE</p><h1>Tasks</h1><p>Daily quests come from your plushie tap. Pickup lockers and Return Right machines come from the shared location feed.</p></div></div><section className="member-map-layout"><div className="member-map"><div className="map-roads"><i/><i/><i/><i/></div><span className="map-water"/>{locations.slice(0, 6).map((location, index) => <button key={location.id} className={`map-pin ${location.kind === 'return-right' ? 'recycle' : ''}`} style={{ left: `${18 + index * 12}%`, top: `${28 + index % 3 * 18}%` }} aria-label={location.name}><Icon name={location.kind === 'return-right' ? 'leaf' : 'pin'} size={18}/></button>)}<div className="map-key"><span><i/>Pick! & SingPost</span><span><i/>Return Right</span></div></div><aside className="member-task-panel"><div className="section-heading"><div><p className="eyebrow">{quests.length} DAILY QUESTS · {locations.length} VERIFIED PLACES</p><h2>Today</h2></div></div>{quests.map((quest) => <article className="compact-task" key={quest.id}><span><Icon name="leaf"/></span><div><b>{quest.title}</b><small>{quest.description} · +{quest.points} leaves</small></div></article>)}{locations.slice(0, 3).map((location) => <article className="compact-task" key={location.id}><span className="purple"><Icon name="map"/></span><div><b>{location.name}</b><small>{location.address} · {location.hours}</small></div></article>)}{!quests.length && !locations.length && <p className="supporting-copy">No tasks or verified locations are available yet.</p>}</aside></section></div>;
}

function MemberFriends({ token, userId, onCopy }: { token: string; userId: string; onCopy: () => void }) {
  const [friends, setFriends] = useState<Array<{ id: string; name: string; plushieName: string; lifetimePoints: number }>>([]);
  useEffect(() => { fetch('/api/member/friends', { headers: { Authorization: `Bearer ${token}` } }).then((response) => response.json()).then((result) => setFriends(result.friends ?? [])).catch(() => setFriends([])); }, [token]);
  return <div className="member-page"><div className="member-page-title"><div><p className="eyebrow">YOUR CIRCLE</p><h1>Friends</h1><p>Invite friends and keep your connected circle close.</p></div><button className="primary" onClick={onCopy}><Icon name="plus"/>Invite a friend</button></div><section className="invite-banner"><div className="invite-qr"><QrPattern/></div><div><p className="eyebrow">YOUR PRIVATE INVITE</p><h2>Grow your circle.</h2><p>Your invite opens the novo app for account {userId.slice(0, 8)}.</p><button className="soft-button" onClick={onCopy}>Copy invite link</button></div><span className="friend-orbit">✦</span></section><div className="section-heading member-friend-heading"><h2>Your friends</h2><span>{friends.length} friends</span></div><div className="friend-card-grid">{friends.map((friend, index) => <article key={friend.id}><div className={`friend-plushie ${['lime','lavender','peach'][index % 3]}`}/><h3>{friend.plushieName}</h3><p>{friend.name}</p><div><span>{friend.lifetimePoints.toLocaleString()} lifetime leaves</span></div></article>)}</div>{!friends.length && <p className="supporting-copy">No friends yet. Share your invite to grow your circle.</p>}</div>;
}

function MemberSettings({ identity, profile, onProfile, onGetApp, onSignOut, notify }: { identity: Identity; profile: MemberProfile; onProfile: (profile: MemberProfile) => void; onGetApp: () => void; onSignOut: () => void; notify: (message: string) => void }) {
  const [showCredits, setShowCredits] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  if (showCredits) return <MemberCredits onBack={() => setShowCredits(false)} />;
  if (showNotifications) return <MemberNotificationSettings token={identity.token} profile={profile} onProfile={onProfile} onBack={() => setShowNotifications(false)} notify={notify}/>;
  return <div className="member-page settings-page"><div className="member-page-title"><div><p className="eyebrow">MAKE IT YOURS</p><h1>Settings</h1><p>Account preferences are shared with the mobile app.</p></div></div><div className="member-settings-grid"><section><div className="member-profile"><span>{identity.account.name[0]}</span><div><h2>{identity.account.name}</h2><p>{identity.account.email}</p></div><button className="soft-button" onClick={() => notify('Profile editor opened')}>Edit profile</button></div><div className="setting-list"><button onClick={() => setShowNotifications(true)}><span><Icon name="spark"/></span><div><b>Notifications</b><small>Plushie, tasks, events, friends and orders</small></div><Icon name="arrow"/></button><button onClick={() => notify('Accessibility preferences opened')}><span><Icon name="people"/></span><div><b>Accessibility</b><small>Motion, contrast and interface preferences</small></div><Icon name="arrow"/></button><button onClick={() => notify('Privacy controls opened')}><span><Icon name="shield"/></span><div><b>Privacy</b><small>Visibility, permissions and blocked accounts</small></div><Icon name="arrow"/></button><button onClick={() => setShowCredits(true)}><span><Icon name="leaf"/></span><div><b>Credits</b><small>Open-source software, maps and acknowledgements</small></div><Icon name="arrow"/></button><button onClick={onGetApp}><span><Icon name="phone"/></span><div><b>Open mobile app</b><small>NFC pairing, QR scanning and full 3D plushie</small></div><Icon name="arrow"/></button></div></section><aside><div className="web-limits"><span className="mobile-exclusive">MOBILE CORE</span><Icon name="phone" size={28}/><h3>Continue seamlessly</h3><p>Open the app with the same account, points and wardrobe. Plushie pairing and camera features stay safely on your phone.</p><button className="primary wide" onClick={onGetApp}>Open mobile app</button></div><button className="outline-button wide" onClick={() => notify('Plushie unpairing is available in the app')}>Unpair in app</button><button className="danger-button wide" onClick={onSignOut}>Sign out</button></aside></div></div>;
}

function MemberNotificationSettings({ token, profile, onProfile, onBack, notify }: { token: string; profile: MemberProfile; onProfile: (profile: MemberProfile) => void; onBack: () => void; notify: (message: string) => void }) {
  const options: Array<[keyof MemberProfile['notificationPreferences'], string, string]> = [['dailyGreeting','Daily plushie greeting','Streak and quest-board reminder'],['tasks','Task reminders','Before daily tasks expire'],['events','Events nearby','Registration and schedule updates'],['friends','Friend activity','Invites and shared quest activity'],['orders','Orders and pickup','Locker and QR-pairing reminders']];
  const toggle = async (key: keyof MemberProfile['notificationPreferences']) => { const preferences = { ...profile.notificationPreferences, [key]: !profile.notificationPreferences[key] }; const response = await fetch('/api/member/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(preferences) }); const result = await response.json(); if (!response.ok || !result.user) return notify(result.message ?? 'Preferences could not be saved'); onProfile(result.user); notify('Notification preferences synced'); };
  return <div className="member-page credits-page"><div className="member-page-title credits-title"><div><button className="text-button credits-back" onClick={onBack}>← Back to Settings</button><p className="eyebrow">REMINDERS</p><h1>Notifications</h1><p>These preferences sync with the installed novo app.</p></div></div><section className="web-notification-list">{options.map(([key,title,detail]) => <button key={key} onClick={() => toggle(key)}><span><Icon name="spark"/></span><div><b>{title}</b><small>{detail}</small></div><i className={profile.notificationPreferences[key] ? 'web-toggle on' : 'web-toggle'}><em/></i></button>)}</section></div>;
}

function MemberCredits({ onBack }: { onBack: () => void }) {
  return <div className="member-page credits-page"><div className="member-page-title credits-title"><div><button className="text-button credits-back" onClick={onBack}>← Back to Settings</button><p className="eyebrow">OPEN SOURCE</p><h1>Credits</h1><p>novo is made possible by open-source software and open map data. Thank you to every contributor behind these projects.</p></div></div><div className="credits-grid">{openSourceCredits.map((credit) => <a key={credit.name} className="credit-card" href={credit.url} target="_blank" rel="noreferrer"><span><Icon name={credit.name === 'OpenStreetMap' ? 'map' : 'spark'}/></span><div><h2>{credit.name}</h2><p>{credit.detail}</p><small>{credit.license}</small></div><Icon name="arrow" size={18}/></a>)}</div><p className="credits-note">Individual copyright notices, map attribution and licence texts are available here from each project.</p></div>;
}

function AccessoryCloset({ profile, busy, onEquip, onClose, onGetApp }: { profile: MemberProfile; busy: boolean; onEquip: (id: AccessoryId, name: string) => void; onClose: () => void; onGetApp: () => void }) {
  const rarityRank: Record<string, number> = { Legendary: 5, Epic: 4, Rare: 3, Uncommon: 2, Common: 1 };
  const all = [...accessoryCatalog].sort((left, right) => rarityRank[right.rarity] - rarityRank[left.rarity] || left.name.localeCompare(right.name));
  return <div className="closet-layer"><button className="closet-scrim" onClick={onClose} aria-label="Close wardrobe"/><aside className="closet-panel"><header><div><p className="eyebrow">{profile.plushieName.toUpperCase()}’S COLLECTION</p><h2>Wardrobe</h2><p>Rarest first · wear more than one</p></div><button className="icon-button" onClick={onClose} aria-label="Close wardrobe"><Icon name="close"/></button></header><div className="closet-filter"><button className="active">All</button><button>Hats</button><button>Scarves</button><button>Badges</button></div><div className="closet-grid">{all.map((item) => { const hasItem = profile.accessories.includes(item.id); const waiting = profile.pendingAccessories.includes(item.id); const isEquipped = profile.equippedAccessories.includes(item.id); return <button key={item.id} className={`${item.tone} ${isEquipped ? 'equipped' : ''}`} style={{ background: item.color }} disabled={!hasItem || busy} onClick={() => onEquip(item.id, item.name)}><span><Icon name="bag"/></span><b>{item.name}</b><small>{item.category} · {item.rarity}</small><em>{waiting ? 'Awaiting QR pairing' : !hasItem ? 'Order in Market' : isEquipped ? 'Equipped' : 'Equip'}</em></button>; })}</div><footer><div><Icon name="scan"/><span><b>Enable a physical accessory</b><small>Scan its unique QR code in the mobile app after pickup.</small></span></div><button className="primary" onClick={onGetApp}>Open app</button></footer></aside></div>;
}

function Overview({ role, name, events, onNavigate, onCreate }: { role: Role; name: string; events: EventItem[]; onNavigate: (page: Page) => void; onCreate: () => void }) {
  const organizer = role === 'organizer';
  return <div className="page-stack"><section className="welcome-banner"><div><p className="eyebrow">FRIDAY, 18 SEPTEMBER</p><h2>Good afternoon, {name.split(' ')[0]}.</h2><p>{organizer ? 'Your next event is filling up. Here’s what needs your attention.' : 'The community is moving. Here’s what needs your attention.'}</p></div><button className="primary" onClick={organizer ? onCreate : () => onNavigate('reviews')}><Icon name={organizer ? 'plus' : 'spark'} />{organizer ? 'Create event' : 'Review submissions'}</button><span className="banner-shape shape-one"/><span className="banner-shape shape-two"/></section><div className="metric-grid"><Metric tone="lime" icon="leaf" value={organizer ? '184' : '2,680'} label={organizer ? 'People registered' : 'Leaves issued this week'} change="↑ 12%"/><Metric tone="lavender" icon={organizer ? 'calendar' : 'spark'} value={organizer ? '3' : '28'} label={organizer ? 'Upcoming events' : 'Waiting for review'} change={organizer ? '1 draft' : '6 high priority'}/><Metric tone="blue" icon={organizer ? 'check' : 'people'} value={organizer ? '92%' : '1,842'} label={organizer ? 'Average attendance' : 'Active members'} change="Healthy"/></div><div className="dashboard-grid"><section className="surface span-two"><div className="section-heading"><div><p className="eyebrow">UP NEXT</p><h3>{organizer ? 'Your upcoming events' : 'Community activity'}</h3></div><button className="text-button" onClick={() => onNavigate(organizer ? 'events' : 'tasks')}>View all <Icon name="arrow" size={16}/></button></div><div className="event-list">{events.slice(0, 3).map((event) => <EventRow key={event.id} event={event} onClick={() => onNavigate(organizer ? 'checkin' : 'tasks')}/>)}</div></section><section className="surface impact-panel"><div className="section-heading"><div><p className="eyebrow">IMPACT</p><h3>Waste diverted</h3></div><button className="icon-button"><Icon name="more"/></button></div><div className="donut"><div><b>1.28t</b><small>this month</small></div></div><div className="legend"><span><i className="green"/>Recycled <b>64%</b></span><span><i className="purple"/>Reused <b>23%</b></span><span><i className="peach"/>Repaired <b>13%</b></span></div></section></div></div>;
}

function Metric({ tone, icon, value, label, change }: { tone: string; icon: IconName; value: string; label: string; change: string }) {
  return <article className={`metric-card ${tone}`}><span className="metric-icon"><Icon name={icon}/></span><div><b>{value}</b><p>{label}</p></div><small>{change}</small></article>;
}

function EventRow({ event, onClick }: { event: EventItem; onClick: () => void }) {
  const fill = event.capacity ? Math.min(100, Math.round(event.attending / event.capacity * 100)) : 58;
  return <button className="event-row" onClick={onClick}><span className="date-tile"><b>{event.date.split(' ')[0]}</b><small>{event.date.split(' ')[1]}</small></span><span className="event-main"><b>{event.title}</b><small><Icon name="pin" size={14}/>{event.place}<i>·</i><Icon name="clock" size={14}/>{event.time}</small></span><span className="attendance"><small>{event.attending}{event.capacity ? ` / ${event.capacity}` : ''} attending</small><i><span style={{ width: `${fill}%` }}/></i></span><span className={`status ${event.status.toLowerCase()}`}>{event.status}</span><Icon name="arrow"/></button>;
}

function Events({ token, events, onEvents, onCreate, onCheckin, showToast }: { token: string; events: EventItem[]; onEvents: (events: EventItem[]) => void; onCreate: () => void; onCheckin: () => void; showToast: (message: string) => void }) {
  const [filter, setFilter] = useState('All events');
  const edit = async (event: EventItem) => { const title = window.prompt('Event name', event.title)?.trim(); if (!title) return; const place = window.prompt('Location', event.place)?.trim(); if (!place) return; const points = Number(window.prompt('Leaves rewarded', String(event.points))); if (!Number.isFinite(points)) return; const response = await fetch(`/api/portal/events/${event.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ title, location: place, points: Math.max(0, Math.round(points)) }) }); const result = await response.json().catch(() => ({})); if (!response.ok) return showToast(result.message ?? 'Event could not be updated'); onEvents(events.map((item) => item.id === event.id ? { ...item, title, place, points: Math.max(0, Math.round(points)) } : item)); showToast('Event updated'); };
  const remove = async (event: EventItem) => { if (!window.confirm(`Delete “${event.title}”?`)) return; const response = await fetch(`/api/portal/events/${event.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }); if (!response.ok) return showToast('Event could not be deleted'); onEvents(events.filter((item) => item.id !== event.id)); showToast('Event deleted'); };
  return <div className="page-stack"><div className="action-row"><div className="segmented">{['All events', 'Upcoming', 'Drafts', 'Past'].map((item) => <button key={item} className={filter === item ? 'selected' : ''} onClick={() => setFilter(item)}>{item}</button>)}</div><button className="primary" onClick={onCreate}><Icon name="plus"/>Create event</button></div><section className="surface table-surface"><div className="table-toolbar"><label className="search"><Icon name="search" size={18}/><input placeholder="Search events" aria-label="Search events"/></label><button className="soft-button">Newest first</button></div><div className="event-cards">{events.filter((event) => filter === 'All events' || filter === 'Drafts' && event.status === 'Draft' || filter === 'Upcoming' && event.status === 'Open' || filter === 'Past' && event.status === 'Completed').map((event) => <article className="event-card" key={event.id}><div className="event-cover"><span>{event.date}</span><i className={event.status.toLowerCase()}>{event.status}</i></div><div className="event-card-body"><h3>{event.title}</h3><p><Icon name="pin" size={15}/>{event.place}</p><p><Icon name="clock" size={15}/>{event.time} · {event.duration}</p><div className="event-card-footer"><span><b>{event.attending}</b><small>{event.capacity ? ` of ${event.capacity} registered` : 'registered · unlimited'}</small></span><span><b>{event.points}</b><small>leaves</small></span></div><div className="card-actions triple"><button className="soft-button" onClick={() => void edit(event)}>Edit</button><button className="danger-button" onClick={() => void remove(event)}>Delete</button><button className="primary small" onClick={onCheckin}><Icon name="scan" size={17}/>Check in</button></div></div></article>)}</div></section></div>;
}

function CheckIn({ token, events, showToast }: { token: string; events: EventItem[]; showToast: (message: string) => void }) {
  const [running, setRunning] = useState(false);
  const [code, setCode] = useState('');
  const [checked, setChecked] = useState<string[]>([]);
  const eventItem = events[0];
  if (!eventItem) return <section className="surface empty-review"><Icon name="calendar" size={34}/><h2>No event ready for check-in</h2><p>Create an event first, then return here to scan attendees.</p></section>;
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!code.trim()) return; const response = await fetch(`/api/portal/events/${eventItem.id}/check-in`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ attendeeId: code.trim() }) }); const result = await response.json(); if (!response.ok) return showToast(result.message ?? 'Could not check in attendee'); setChecked((current) => [code.trim(), ...current]); setCode(''); showToast(`Attendee checked in · ${result.pointsQueued} leaves queued`); };
  const total = eventItem.attending + checked.length; const percentage = eventItem.capacity ? Math.min(100, Math.round(total / eventItem.capacity * 100)) : 100;
  return <div className="checkin-layout"><section className="scanner-card"><div className="scanner-head"><div><p className="eyebrow">LIVE CHECK-IN</p><h2>{eventItem.title}</h2><p><Icon name="pin" size={15}/>{eventItem.place} · {eventItem.date}, {eventItem.time}</p></div><span className="live-badge"><i/>Live</span></div><div className={running ? 'camera running' : 'camera'}><div className="scan-frame"><i/><i/><i/><i/></div>{running ? <><span className="scan-line"/><p>Hold the attendee QR code inside the frame</p></> : <div className="camera-empty"><span><Icon name="scan" size={34}/></span><b>Ready to scan</b><p>Use this device’s camera to check attendees in.</p><button className="primary" onClick={() => setRunning(true)}>Start scanner</button></div>}</div><form className="manual-code" onSubmit={submit}><span>Or enter their member ID</span><div><input value={code} onChange={(event) => setCode(event.target.value)} placeholder="Member ID from QR" aria-label="Attendance code"/><button className="soft-button" type="submit">Check in</button></div></form></section><aside className="attendance-panel surface"><div className="attendance-total"><span><Icon name="people"/></span><div><b>{total}</b><small>{eventItem.capacity ? `of ${eventItem.capacity} checked in` : 'checked in'}</small></div><strong>{percentage}%</strong></div><div className="attendance-progress"><span style={{ width: `${percentage}%` }}/></div><div className="section-heading compact"><div><p className="eyebrow">JUST ARRIVED</p><h3>Recent check-ins</h3></div></div><div className="people-list">{checked.map((memberId, index) => <div key={`${memberId}-${index}`}><span className={`avatar tone-${index % 3}`}>{memberId[0]}</span><span><b>{memberId}</b><small>{index === 0 ? 'Just now' : `${index + 1} min ago`} · +{eventItem.points} leaves queued</small></span><i><Icon name="check" size={15}/></i></div>)}</div></aside></div>;
}

function Reviews({ token, showToast }: { token: string; showToast: (message: string) => void }) {
  const [active, setActive] = useState(0);
  const [points, setPoints] = useState(80);
  const [assisted, setAssisted] = useState(false);
  const [submissions, setSubmissions] = useState<Array<{ id: string; userId: string; task: string; note: string; photoDataUrl: string; status: string; aiConfidence: number | null; aiLabel: string | null; createdAt: string }>>([]);
  const load = () => fetch('/api/portal/submissions', { headers: { Authorization: `Bearer ${token}` } }).then((response) => response.json()).then((result) => setSubmissions(result.submissions ?? []));
  useEffect(() => { load().catch(() => undefined); }, [token]);
  const item = submissions[active];
  const decide = async (decision: 'approved' | 'changes_requested') => { if (!item) return; const response = await fetch(`/api/portal/submissions/${item.id}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ decision, points }) }); if (!response.ok) return showToast('Review could not be saved'); setSubmissions((current) => current.filter((submission) => submission.id !== item.id)); setActive(0); showToast(decision === 'approved' ? `${points} leaves awarded · removed from queue` : 'Changes requested · removed from queue'); };
  const remove = async () => { if (!item || !window.confirm(`Permanently delete “${item.task}” from the review records?`)) return; const response = await fetch(`/api/portal/submissions/${item.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }); if (!response.ok) return showToast('Submission could not be deleted'); setSubmissions((current) => current.filter((submission) => submission.id !== item.id)); setActive(0); showToast('Submission deleted'); };
  if (!item) return <section className="surface empty-review"><Icon name="check" size={34}/><h2>Review queue is clear</h2><p>Custom tasks below 80% automated confidence will appear here.</p></section>;
  return <div className="review-layout"><section className="review-queue surface"><div className="section-heading"><div><p className="eyebrow">{submissions.length} PENDING</p><h3>Review queue</h3></div></div><div className="submission-list">{submissions.map((submission, index) => <button key={submission.id} className={active === index ? 'submission active' : 'submission'} onClick={() => { setActive(index); setAssisted(false); }}><span className={`avatar tone-${index % 3}`}>{submission.task[0]}</span><span><b>{submission.task}</b><small>pending</small><em>{new Date(submission.createdAt).toLocaleString()}</em></span><Icon name="arrow"/></button>)}</div></section><section className="review-detail surface"><div className="review-title"><span className="avatar large">{item.task[0]}</span><div><p className="eyebrow">CUSTOM TASK</p><h2>{item.task}</h2><p>{new Date(item.createdAt).toLocaleString()}</p></div><span className="status draft">pending</span></div><div className="evidence-grid single"><img src={item.photoDataUrl} alt="Member task evidence" className="evidence-photo"/></div><div className="submission-note"><p className="eyebrow">MEMBER NOTE</p><p>{item.note}</p></div><div className="ai-card"><span className="ai-icon"><Icon name="spark"/></span><div><p className="eyebrow">YOLO CHECK</p><b>{item.aiConfidence === null ? 'Manual review required' : `${Math.round(item.aiConfidence * 100)}% confidence${item.aiLabel ? ` · ${item.aiLabel}` : ''}`}</b><p>{item.aiConfidence !== null && item.aiConfidence >= .8 ? 'This submission met the automation threshold.' : 'Below 80% or unavailable: staff makes the final decision.'}</p></div><button className="soft-button" onClick={() => setAssisted(true)}>{assisted ? 'Checked' : 'Inspect'}</button></div><div className="reward-row"><div><p className="eyebrow">REWARD</p><h3>Assign leaves</h3></div><div className="points-stepper"><button onClick={() => setPoints(Math.max(0, points - 10))}>−</button><label><input type="number" value={points} onChange={(event) => setPoints(Number(event.target.value))}/><small>leaves</small></label><button onClick={() => setPoints(points + 10)}>+</button></div></div><div className="decision-actions review-actions"><button className="danger-button" onClick={() => void remove()}>Delete</button><button className="soft-button" onClick={() => void decide('changes_requested')}>Request changes</button><button className="primary" onClick={() => void decide('approved')}><Icon name="check"/>Approve · {points}</button></div></section></div>;
}

function NfcTags({ token, showToast }: { token: string; showToast: (message: string) => void }) {
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [payload, setPayload] = useState('');
  const [tags, setTags] = useState<Array<{ id: string; label: string; status: string; pairedUserId: string | null; createdAt: string }>>([]);
  const [accessoryLabel, setAccessoryLabel] = useState('');
  const [accessoryId, setAccessoryId] = useState<AccessoryId>('sunny-cap');
  const [accessoryPayload, setAccessoryPayload] = useState('');
  const [accessoryQr, setAccessoryQr] = useState('');
  const [accessoryTags, setAccessoryTags] = useState<Array<{ id: string; label: string; accessoryId: AccessoryId; status: string; pairedUserId: string | null; createdAt: string }>>([]);
  const [orders, setOrders] = useState<Array<{ id: string; userId: string; memberName: string; accessoryId: AccessoryId; lockerLocation: string; status: 'confirmed' | 'tagged' | 'dispatched' | 'delivered' | 'cancelled'; createdAt: string }>>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const load = () => fetch('/api/portal/nfc-tags', { headers: { Authorization: `Bearer ${token}` } }).then((response) => response.json()).then((result) => setTags(result.tags ?? []));
  const loadAccessoryTags = () => fetch('/api/portal/accessory-tags', { headers: { Authorization: `Bearer ${token}` } }).then((response) => response.json()).then((result) => setAccessoryTags(result.tags ?? []));
  const loadOrders = () => fetch('/api/portal/fulfillment-orders', { headers: { Authorization: `Bearer ${token}` } }).then((response) => response.json()).then((result) => setOrders(result.orders ?? []));
  useEffect(() => { load().catch(() => undefined); loadAccessoryTags().catch(() => undefined); loadOrders().catch(() => undefined); }, [token]);
  useEffect(() => { if (!accessoryPayload) return setAccessoryQr(''); QRCode.toDataURL(accessoryPayload, { width: 260, margin: 2, color: { dark: '#17352A', light: '#FFFFFF' } }).then(setAccessoryQr).catch(() => setAccessoryQr('')); }, [accessoryPayload]);
  const prepare = async () => {
    if (!label.trim()) return;
    setBusy(true);
    try {
      const response = await fetch('/api/portal/nfc-tags', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ label: label.trim() }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? 'Could not prepare tag.');
      setPayload(result.ndefUrl);
      const NDEFReaderClass = (window as unknown as { NDEFReader?: new () => { write: (message: unknown) => Promise<void> } }).NDEFReader;
      if (NDEFReaderClass) {
        const writer = new NDEFReaderClass();
        await writer.write({ records: [{ recordType: 'url', data: result.ndefUrl }] });
        showToast('NFC tag prepared and ready to pair');
      } else {
        showToast('Tag record created · use a Web NFC Android device to write it');
      }
      setLabel('');
      await load();
    } catch (error) { showToast(error instanceof Error ? error.message : 'Could not prepare tag'); } finally { setBusy(false); }
  };
  const prepareAccessory = async () => {
    if (!accessoryLabel.trim()) return;
    setBusy(true);
    try {
      const response = await fetch('/api/portal/accessory-tags', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ label: accessoryLabel.trim(), accessoryId, ...(selectedOrderId ? { orderId: selectedOrderId } : {}) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? 'Could not prepare accessory QR.');
      setAccessoryPayload(result.qrPayload); setAccessoryLabel(''); setSelectedOrderId(null); await Promise.all([loadAccessoryTags(), loadOrders()]); showToast('Unique accessory QR created');
    } catch (error) { showToast(error instanceof Error ? error.message : 'Could not prepare accessory QR'); } finally { setBusy(false); }
  };
  const prepareOrder = (order: typeof orders[number]) => { setSelectedOrderId(order.id); setAccessoryId(order.accessoryId); setAccessoryLabel(`${order.accessoryId.toUpperCase()}-${order.id.slice(-6).toUpperCase()}`); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const updateOrder = async (orderId: string, status: typeof orders[number]['status']) => { const response = await fetch(`/api/portal/fulfillment-orders/${orderId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ status }) }); if (!response.ok) return showToast('Order could not be updated'); await loadOrders(); showToast(`Order marked ${status}`); };
  const editTag = async (kind: 'nfc' | 'accessory', id: string, current: string) => { const label = window.prompt('Tag label', current)?.trim(); if (!label) return; const response = await fetch(`/api/portal/${kind === 'nfc' ? 'nfc-tags' : 'accessory-tags'}/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ label }) }); if (!response.ok) return showToast('Tag could not be updated'); await (kind === 'nfc' ? load() : loadAccessoryTags()); showToast('Tag updated'); };
  const deleteTag = async (kind: 'nfc' | 'accessory', id: string) => { if (!window.confirm('Delete this unused physical tag record?')) return; const response = await fetch(`/api/portal/${kind === 'nfc' ? 'nfc-tags' : 'accessory-tags'}/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }); const result = response.status === 204 ? {} : await response.json().catch(() => ({})); if (!response.ok) return showToast(result.message ?? 'Tag could not be deleted'); await (kind === 'nfc' ? load() : loadAccessoryTags()); showToast('Tag deleted'); };
  return <div className="page-stack">
    <section className="nfc-setup surface"><div><p className="eyebrow">PLUSHIE PROVISIONING</p><h2>Prepare a novo NFC tag</h2><p>Each prepared tag receives a private payload. Pairing binds it to one member; later taps verify daily interaction and streaks.</p><label className="field"><span>Internal plushie label</span><input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Batch or plushie serial"/></label><button className="primary" disabled={busy || !label.trim()} onClick={prepare}><Icon name="scan"/>{busy ? 'Hold tag near phone…' : 'Create and write NFC tag'}</button>{payload && <div className="ndef-payload"><small>Latest NDEF URL</small><code>{payload}</code></div>}</div><aside><Icon name="phone" size={34}/><h3>Writing requirements</h3><p>Use this page in Chrome on an NFC-capable Android phone. Staff and administrators can create tags; ordinary member accounts cannot.</p></aside></section>
    <section className="surface table-surface fulfillment-queue"><div className="section-heading"><div><p className="eyebrow">FULFILLMENT QUEUE</p><h3>Accessories to tag and deliver</h3></div><span className="queue-count">{orders.filter((order) => order.status !== 'delivered' && order.status !== 'cancelled').length} active</span></div><div className="nfc-tag-list">{orders.length ? orders.map((order) => <div key={order.id}><span><Icon name="bag"/></span><div><b>{accessoryCatalog.find((item) => item.id === order.accessoryId)?.name} · {order.memberName}</b><small>{order.lockerLocation} · {new Date(order.createdAt).toLocaleString()}</small></div><div className="queue-actions"><i className={`status ${order.status === 'delivered' ? 'open' : 'draft'}`}>{order.status}</i>{order.status === 'confirmed' && <button className="soft-button compact" onClick={() => prepareOrder(order)}>Prepare QR</button>}{order.status === 'tagged' && <button className="soft-button compact" onClick={() => void updateOrder(order.id, 'dispatched')}>Dispatch</button>}{order.status === 'dispatched' && <button className="primary small" onClick={() => void updateOrder(order.id, 'delivered')}>Delivered</button>}</div></div>) : <p>No accessory orders are waiting for fulfillment.</p>}</div></section>
    <section className="nfc-setup surface"><div><p className="eyebrow">ACCESSORY PROVISIONING</p><h2>Create a one-time accessory QR</h2><p>Attach this QR to the matching physical accessory. An ordered item stays locked in the member’s wardrobe until this unique code is scanned.</p>{selectedOrderId && <div className="selected-order"><Icon name="bag"/><span><b>Preparing ordered item</b><small>{orders.find((order) => order.id === selectedOrderId)?.memberName}</small></span></div>}<div className="field-grid"><label className="field"><span>Accessory</span><select value={accessoryId} onChange={(event) => setAccessoryId(event.target.value as AccessoryId)}>{accessoryCatalog.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="field"><span>Serial or batch label</span><input value={accessoryLabel} onChange={(event) => setAccessoryLabel(event.target.value)} placeholder="e.g. SCARF-A-104"/></label></div><button className="primary" disabled={busy || !accessoryLabel.trim()} onClick={prepareAccessory}><Icon name="plus"/>{busy ? 'Creating…' : 'Create accessory QR'}</button>{accessoryPayload && <div className="ndef-payload"><small>Latest unique QR payload</small><code>{accessoryPayload}</code></div>}</div><aside className="accessory-qr-preview">{accessoryQr ? <><img src={accessoryQr} alt="Scannable accessory pairing QR code"/><a className="soft-button" href={accessoryQr} download={`${accessoryLabel || accessoryId}-qr.png`}>Download QR</a></> : <><Icon name="scan" size={34}/><h3>Ready to generate</h3><p>The scannable code appears here for printing and attachment.</p></>}</aside></section>
    <section className="surface table-surface"><div className="section-heading"><div><p className="eyebrow">TAG INVENTORY</p><h3>Prepared plushies</h3></div></div><div className="nfc-tag-list">{tags.length ? tags.map((tag) => <div key={tag.id}><span><Icon name="scan"/></span><div><b>{tag.label}</b><small>{new Date(tag.createdAt).toLocaleString()}</small></div><div className="queue-actions"><i className={`status ${tag.status === 'paired' ? 'open' : 'draft'}`}>{tag.status}</i><button className="soft-button compact" onClick={() => void editTag('nfc', tag.id, tag.label)}>Edit</button>{tag.status !== 'paired' && <button className="danger-button compact" onClick={() => void deleteTag('nfc', tag.id)}>Delete</button>}</div></div>) : <p>No tags have been prepared yet.</p>}</div></section>
    <section className="surface table-surface"><div className="section-heading"><div><p className="eyebrow">ACCESSORY INVENTORY</p><h3>Physical QR tags</h3></div></div><div className="nfc-tag-list">{accessoryTags.length ? accessoryTags.map((tag) => <div key={tag.id}><span><Icon name="bag"/></span><div><b>{tag.label}</b><small>{accessoryCatalog.find((item) => item.id === tag.accessoryId)?.name} · {new Date(tag.createdAt).toLocaleString()}</small></div><div className="queue-actions"><i className={`status ${tag.status === 'paired' ? 'open' : 'draft'}`}>{tag.status}</i><button className="soft-button compact" onClick={() => void editTag('accessory', tag.id, tag.label)}>Edit</button>{tag.status !== 'paired' && <button className="danger-button compact" onClick={() => void deleteTag('accessory', tag.id)}>Delete</button>}</div></div>) : <p>No accessory QR tags have been prepared yet.</p>}</div></section>
  </div>;
}

function Tasks({ token, events, onEvents, showToast }: { token: string; events: EventItem[]; onEvents: (events: EventItem[]) => void; showToast: (message: string) => void }) {
  const update = async (event: EventItem) => { const nextStatus = event.status === 'Draft' ? 'open' : event.status === 'Open' ? 'completed' : 'draft'; const response = await fetch(`/api/portal/events/${event.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ status: nextStatus }) }); if (!response.ok) return showToast('Event could not be updated'); const status = nextStatus === 'open' ? 'Open' : nextStatus === 'draft' ? 'Draft' : 'Completed'; onEvents(events.map((item) => item.id === event.id ? { ...item, status } : item)); showToast(`Event marked ${status.toLowerCase()}`); };
  const remove = async (event: EventItem) => { if (!window.confirm(`Delete “${event.title}”?`)) return; const response = await fetch(`/api/portal/events/${event.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }); if (!response.ok) return showToast('Event could not be deleted'); onEvents(events.filter((item) => item.id !== event.id)); showToast('Event deleted'); };
  return <div className="page-stack"><div className="action-row"><div className="segmented"><button className="selected">Events</button><button onClick={() => showToast('Custom member tasks are managed in Review queue')}>Member tasks</button></div></div><section className="surface table-surface"><div className="data-table"><div className="data-head"><span>Event</span><span>Type</span><span>Participation</span><span>Reward</span><span>Status</span><span>Actions</span></div>{events.map((event, index) => <div className="data-row" key={event.id}><span><i className={`table-icon tone-${index % 3}`}><Icon name="calendar" size={18}/></i><b>{event.title}</b><small>{event.place}</small></span><span>Event</span><span><b>{event.attending}</b> people</span><span><b>{event.points}</b> leaves</span><span><i className={`status ${event.status.toLowerCase()}`}>{event.status}</i></span><span className="row-actions"><button className="soft-button compact" onClick={() => void update(event)}>Change</button><button className="danger-button compact" onClick={() => void remove(event)}>Delete</button></span></div>)}</div>{!events.length && <p className="supporting-copy">No events have been created.</p>}</section></div>;
}

function Marketplace({ token, showToast }: { token: string; showToast: (message: string) => void }) {
  const [items, setItems] = useState<Array<{ id: string; name: string; category: 'accessory' | 'charity'; stock: number | null; price: number; active: boolean }>>([]);
  const load = () => fetch('/api/portal/market', { headers: { Authorization: `Bearer ${token}` } }).then((response) => response.json()).then((result) => setItems(result.items ?? []));
  useEffect(() => { load().catch(() => undefined); }, [token]);
  const add = async () => { const name = window.prompt('Item or charity name'); if (!name?.trim()) return; const category = window.prompt('Type: accessory or charity', 'accessory') === 'charity' ? 'charity' : 'accessory'; const price = Number(window.prompt('Leaf cost', '100')); if (!Number.isFinite(price) || price < 0) return; const response = await fetch('/api/portal/market', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ name: name.trim(), category, price: Math.round(price), stock: category === 'charity' ? null : 0, active: true }) }); if (!response.ok) return showToast('Marketplace item could not be saved'); await load(); showToast('Marketplace item added'); };
  const edit = async (item: typeof items[number]) => { const name = window.prompt('Item or charity name', item.name)?.trim(); if (!name) return; const price = Number(window.prompt('Leaf cost', String(item.price))); if (!Number.isFinite(price) || price < 0) return; const stockInput = item.category === 'accessory' ? window.prompt('Stock', String(item.stock ?? 0)) : null; const stock = item.category === 'charity' ? null : Number(stockInput); if (stock !== null && (!Number.isFinite(stock) || stock < 0)) return; const response = await fetch(`/api/portal/market/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ name, price: Math.round(price), stock: stock === null ? null : Math.round(stock) }) }); if (!response.ok) return showToast('Marketplace item could not be updated'); await load(); showToast('Marketplace item updated'); };
  const toggle = async (item: typeof items[number]) => { const response = await fetch(`/api/portal/market/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ active: !item.active }) }); if (!response.ok) return showToast('Marketplace item could not be updated'); await load(); showToast(item.active ? 'Marketplace item hidden' : 'Marketplace item activated'); };
  const remove = async (item: typeof items[number]) => { if (!window.confirm(`Delete “${item.name}”?`)) return; const response = await fetch(`/api/portal/market/${item.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }); if (!response.ok) return showToast('Marketplace item could not be deleted'); await load(); showToast('Marketplace item deleted'); };
  return <div className="page-stack"><div className="action-row"><div><p className="supporting-copy">Manage rewards members can unlock with their leaves.</p></div><button className="primary" onClick={add}><Icon name="plus"/>Add item</button></div><div className="market-grid">{items.map((item, index) => <article className="market-item surface" key={item.id}><div className={`market-art ${['lavender','lime','blue','peach'][index % 4]}`}><span><Icon name={item.category === 'charity' ? 'leaf' : 'bag'} size={32}/></span><div className="market-card-actions"><button className="icon-button" onClick={() => void edit(item)} aria-label={`Edit ${item.name}`}><Icon name="settings"/></button><button className="icon-button danger-icon" onClick={() => void remove(item)} aria-label={`Delete ${item.name}`}><Icon name="close"/></button></div></div><div><span className="category-label">{item.category}</span><h3>{item.name}</h3><p>{item.stock === null ? 'Open contribution' : `${item.stock} in stock`}</p><footer><b><Icon name="leaf" size={16}/>{item.price}</b><button className={`status status-button ${item.active ? 'open' : 'draft'}`} onClick={() => void toggle(item)}>{item.active ? 'Active' : 'Inactive'}</button></footer></div></article>)}</div>{!items.length && <section className="surface empty-review"><Icon name="bag" size={34}/><h2>Marketplace is empty</h2><p>Add the first verified accessory or charity.</p></section>}</div>;
}

function Accounts({ token, showToast }: { token: string; showToast: (message: string) => void }) {
  const [query, setQuery] = useState('');
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string; email: string; role: AccountRole; status: string }>>([]);
  const load = () => fetch('/api/portal/accounts', { headers: { Authorization: `Bearer ${token}` } }).then((response) => response.json()).then((result) => setAccounts(result.accounts ?? []));
  useEffect(() => { load().catch(() => undefined); }, [token]);
  const changeRole = async (id: string, role: AccountRole) => { const response = await fetch(`/api/portal/accounts/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ role }) }); if (!response.ok) return showToast('Account role could not be updated'); await load(); showToast('Account role updated'); };
  const changeStatus = async (id: string, status: string) => { const response = await fetch(`/api/portal/accounts/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ status }) }); if (!response.ok) return showToast('Account status could not be updated'); await load(); showToast('Account status updated'); };
  const add = async () => { const name = window.prompt('Display name')?.trim(); if (!name) return; const email = window.prompt('Email address')?.trim(); if (!email) return; const roleInput = window.prompt('Role: member, organizer, staff or admin', 'member'); const role: AccountRole = roleInput === 'organizer' || roleInput === 'staff' || roleInput === 'admin' ? roleInput : 'member'; const response = await fetch('/api/portal/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ name, email, role, status: 'active' }) }); const result = await response.json().catch(() => ({})); if (!response.ok) return showToast(result.message ?? 'Account could not be created'); await load(); showToast('Account created'); };
  const edit = async (account: typeof accounts[number]) => { const name = window.prompt('Display name', account.name)?.trim(); if (!name) return; const email = window.prompt('Email address', account.email)?.trim(); if (!email) return; const response = await fetch(`/api/portal/accounts/${account.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ name, email }) }); const result = await response.json().catch(() => ({})); if (!response.ok) return showToast(result.message ?? 'Account could not be updated'); await load(); showToast('Account updated'); };
  const remove = async (account: typeof accounts[number]) => { if (!window.confirm(`Delete ${account.name} and revoke their sessions?`)) return; const response = await fetch(`/api/portal/accounts/${account.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }); const result = response.status === 204 ? {} : await response.json().catch(() => ({})); if (!response.ok) return showToast(result.message ?? 'Account could not be deleted'); await load(); showToast('Account deleted'); };
  const shown = accounts.filter((account) => `${account.name} ${account.email}`.toLowerCase().includes(query.toLowerCase()));
  const privileged = accounts.filter((account) => account.role !== 'member').length; const attention = accounts.filter((account) => account.status !== 'active').length;
  return <div className="page-stack"><div className="metric-grid account-metrics"><Metric tone="lime" icon="people" value={String(accounts.length)} label="Total accounts" change="Live database"/><Metric tone="lavender" icon="shield" value={String(privileged)} label="Organizers & staff" change="Role controlled"/><Metric tone="peach" icon="spark" value={String(attention)} label="Needs attention" change={attention ? 'Review now' : 'All clear'}/></div><section className="surface table-surface"><div className="table-toolbar"><label className="search"><Icon name="search" size={18}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or email"/></label><button className="primary" onClick={() => void add()}><Icon name="plus"/>Add account</button></div><div className="data-table accounts-table"><div className="data-head"><span>Account</span><span>Role</span><span>Status</span><span>Actions</span><span/></div>{shown.map((account, index) => <div className="data-row" key={account.email}><span><i className={`avatar tone-${index % 3}`}>{account.name[0]}</i><b>{account.name}</b><small>{account.email}</small></span><span><select value={account.role} onChange={(event) => void changeRole(account.id, event.target.value as AccountRole)} aria-label={`Role for ${account.name}`}><option value="member">Member</option><option value="organizer">Organizer</option><option value="staff">Staff</option><option value="admin">Admin</option></select></span><span><select value={account.status} onChange={(event) => void changeStatus(account.id, event.target.value)} aria-label={`Status for ${account.name}`}><option value="active">Active</option><option value="review">Review</option><option value="suspended">Suspended</option></select></span><span className="row-actions"><button className="soft-button compact" onClick={() => void edit(account)}>Edit</button><button className="danger-button compact" onClick={() => void remove(account)}>Delete</button></span><span/></div>)}</div></section></div>;
}

function CreateEvent({ token, organizerId, onClose, onCreate }: { token: string; organizerId: string; onClose: () => void; onCreate: (event: EventItem) => void }) {
  const [unlimited, setUnlimited] = useState(false);
  const [title, setTitle] = useState('');
  const [place, setPlace] = useState('');
  const [date, setDate] = useState('2026-09-26');
  const [time, setTime] = useState('09:00');
  const [duration, setDuration] = useState('2 hours');
  const [capacity, setCapacity] = useState(50);
  const [points, setPoints] = useState(120);
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!title.trim() || !place.trim()) return; const durationMinutes = duration === '30 minutes' ? 30 : duration === '1 hour' ? 60 : duration === '90 minutes' ? 90 : duration === 'Half day' ? 240 : 120; const response = await fetch('/api/portal/events', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ organizerId, title: title.trim(), location: place.trim(), startsAt: new Date(`${date}T${time}:00+08:00`).toISOString(), durationMinutes, capacity: unlimited ? null : capacity, points, status: 'open' }) }); const result = await response.json(); if (!response.ok) return; const created = result.event as { id: string; startsAt: string }; const starts = new Date(created.startsAt); onCreate({ id: created.id, title: title.trim(), place: place.trim(), date: starts.toLocaleDateString('en-SG', { day: '2-digit', month: 'short' }), time, duration, capacity: unlimited ? null : capacity, attending: 0, points, status: 'Open' }); };
  return <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="create-title"><button className="modal-scrim" onClick={onClose} aria-label="Close create event"/><form className="event-drawer" onSubmit={submit}><header><div><p className="eyebrow">NEW COMMUNITY EVENT</p><h2 id="create-title">Create an event</h2><p>Give people everything they need to show up and make an impact.</p></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close event form"><Icon name="close"/></button></header><div className="form-body"><label className="field full"><span>Event name</span><input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Marina Bay litter walk"/></label><label className="field full"><span>Location</span><div><Icon name="pin" size={18}/><input required value={place} onChange={(event) => setPlace(event.target.value)} placeholder="Search for a location"/></div></label><div className="field-grid"><label className="field"><span>Date</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)}/></label><label className="field"><span>Start time</span><input type="time" value={time} onChange={(event) => setTime(event.target.value)}/></label></div><label className="field full"><span>Time required</span><select value={duration} onChange={(event) => setDuration(event.target.value)}><option>30 minutes</option><option>1 hour</option><option>90 minutes</option><option>2 hours</option><option>Half day</option></select></label><div className="field full"><span>Attendance</span><div className="capacity-control"><label className={!unlimited ? 'choice active' : 'choice'}><input type="radio" checked={!unlimited} onChange={() => setUnlimited(false)}/><span>Limited</span>{!unlimited && <input type="number" min="1" value={capacity} onChange={(event) => setCapacity(Number(event.target.value))} aria-label="Maximum attendees"/>}</label><label className={unlimited ? 'choice active' : 'choice'}><input type="radio" checked={unlimited} onChange={() => setUnlimited(true)}/><span>Unlimited</span></label></div></div><label className="field full"><span>Leaves rewarded</span><div className="points-input"><Icon name="leaf"/><input type="number" min="0" step="10" value={points} onChange={(event) => setPoints(Number(event.target.value))}/><small>per verified attendee</small></div></label><div className="form-note"><Icon name="spark"/><span><b>Fair reward guide</b><p>Events of about {duration} usually reward 80–160 leaves. Staff can adjust rewards after attendance review.</p></span></div></div><footer><button className="text-button" type="button" onClick={onClose}>Cancel</button><button className="soft-button" type="button">Save draft</button><button className="primary" type="submit">Publish event<Icon name="arrow"/></button></footer></form></div>;
}

function QrPattern() { return <div className="qr-pattern">{Array.from({ length: 36 }, (_, index) => <i key={index} className={[0,1,2,6,7,8,12,13,14,4,10,16,19,21,23,25,27,28,29,33,34,35].includes(index) ? 'on' : ''}/>)}</div>; }

function pageTitle(page: Page) {
  return ({ overview: 'Overview', events: 'Events', checkin: 'Attendance', reviews: 'Submission review', nfc: 'Physical tags', tasks: 'Tasks & events', market: 'Marketplace', accounts: 'Account management' })[page];
}
