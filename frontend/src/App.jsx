import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  BrainCircuit,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  CloudUpload,
  FileText,
  GraduationCap,
  HelpCircle,
  Home,
  Eye,
  EyeOff,
  Lightbulb,
  ListChecks,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Map,
  Menu,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  Send,
  Settings,
  Sparkles,
  Target,
  TrendingUp,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import { api } from './api';
import { restoreSession, sendResetEmail, signInWithEmail, signInWithGoogle, signOutSession } from './firebase';
import NotebookWorkspace from './NotebookWorkspace';

const NAV = [
  { id: 'workspace', label: 'Workspace', icon: BookOpen },
  { id: 'map', label: 'Topic map', icon: Map },
  { id: 'practice', label: 'Practice', icon: BrainCircuit },
  { id: 'planner', label: 'Study plan', icon: CalendarDays },
  { id: 'report', label: 'Daily report', icon: BarChart3 },
];

const formatBytes = (bytes) => `${(bytes / 1_000_000).toFixed(1)} MB`;
const formatDate = (value) => value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'No date';

function Logo({ compact = false }) {
  return (
    <div className={`logo ${compact ? 'compact' : ''}`}>
      <span className="logo-mark"><BrainCircuit size={20} strokeWidth={2.3} /></span>
      {!compact && <span>Prism</span>}
    </div>
  );
}

function AuthScreen({ onLogin }) {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const session = await signInWithEmail(email, password, mode === 'signup');
      onLogin(session);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function googleLogin() {
    setLoading(true);
    setError('');
    setNotice('');
    try {
      onLogin(await signInWithGoogle());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function demoLogin() {
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const session = await api.loginDemo();
      localStorage.setItem('prism-session', JSON.stringify(session));
      onLogin(session);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword() {
    if (!email) return setError('Enter your email address first.');
    setError('');
    try {
      await sendResetEmail(email);
      setNotice('Password reset email sent.');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-visual" aria-label="Prism learning preview">
        <div className="auth-brand"><Logo /></div>
        <div className="auth-map" aria-hidden="true">
          <span className="preview-line line-a" />
          <span className="preview-line line-b" />
          <span className="preview-line line-c" />
          <div className="preview-node node-a"><Check size={14} /> Algebra</div>
          <div className="preview-node node-b"><Check size={14} /> Separable DE</div>
          <div className="preview-node node-c active"><Zap size={14} /> Bernoulli</div>
          <div className="preview-node node-d"><LockKeyhole size={13} /> Exact DE</div>
        </div>
        <div className="auth-quote">
          <span className="quote-rule" />
          <p>Work inside the subject. Prism stays quiet while you are right, and steps in only when you get stuck.</p>
        </div>
      </section>

      <section className="auth-form-wrap">
        <form className="auth-form" onSubmit={submit}>
          <div className="mobile-logo"><Logo /></div>
          <p className="kicker">Your study workspace</p>
          <h1>{mode === 'signin' ? 'Welcome back' : 'Create your account'}</h1>
          <p className="auth-subtitle">{mode === 'signin' ? 'Pick up exactly where your understanding left off.' : 'Start with one subject and build from there.'}</p>

          <button className="google-button" type="button" onClick={googleLogin} disabled={loading}>
            <span className="google-g">G</span>
            Continue with Google
          </button>
          <div className="or"><span>or continue with email</span></div>

          <label className="field-label" htmlFor="email">Email address</label>
          <input id="email" className="text-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <label className="field-label" htmlFor="password">Password</label>
          <div className="password-field">
            <input id="password" className="text-input" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required />
            <button type="button" onClick={() => setShowPassword((value) => !value)} title={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
          </div>
          {mode === 'signin' && <button className="forgot-button" type="button" onClick={resetPassword}>Forgot password?</button>}
          {error && <p className="form-error">{error}</p>}
          {notice && <p className="form-notice">{notice}</p>}
          <button className="primary-button auth-submit" type="submit" disabled={loading}>
            {loading ? <LoaderCircle className="spin" size={18} /> : <>{mode === 'signin' ? 'Sign in' : 'Create account'} <ArrowRight size={18} /></>}
          </button>
          <p className="auth-footnote">{mode === 'signin' ? 'New to Prism?' : 'Already have an account?'} <button type="button" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); }}>{mode === 'signin' ? 'Create an account' : 'Sign in'}</button></p>
          <div className="demo-divider"><span>Hackathon preview</span></div>
          <button className="demo-button" type="button" onClick={demoLogin} disabled={loading}>Explore demo workspace <ArrowRight size={15} /></button>
        </form>
      </section>
    </main>
  );
}

function Sidebar({ subjects, activeSubjectId, onSubject, view, onView, open, onClose, onNewSubject, user }) {
  const initials = (user?.name || 'Student').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  return (
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="sidebar-top">
        <Logo />
        <button className="icon-button mobile-close" onClick={onClose} title="Close menu"><X size={18} /></button>
      </div>
      <nav className="main-nav" aria-label="Workspace navigation">
        {NAV.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => { onView(item.id); onClose(); }} title={item.label}>
              <Icon size={18} /> <span>{item.label}</span>
              {item.id === 'practice' && <span className="nav-count">4</span>}
            </button>
          );
        })}
      </nav>

      <div className="subject-label"><span>Subjects</span><button onClick={onNewSubject} title="Create subject"><Plus size={16} /></button></div>
      <div className="subject-list">
        {subjects.map((subject) => (
          <button key={subject.id} className={activeSubjectId === subject.id ? 'active' : ''} onClick={() => onSubject(subject.id)}>
            <span className="subject-swatch" style={{ background: subject.accent }} />
            <span className="subject-copy"><strong>{subject.name}</strong><small>{subject.code} Â· {subject.mastery}%</small></span>
            <ChevronRight size={15} />
          </button>
        ))}
      </div>

      <div className="sidebar-bottom">
        <button title="Settings"><Settings size={18} /><span>Settings</span></button>
        <div className="user-chip">
          <span className="avatar">{initials}</span>
          <span><strong>{user?.name || 'Student'}</strong><small>{user?.semester || 'Current semester'}</small></span>
          <MoreHorizontal size={17} />
        </div>
      </div>
    </aside>
  );
}

function Topbar({ subject, onMenu, onLogout, ai }) {
  return (
    <header className="topbar">
      <button className="icon-button menu-button" onClick={onMenu} title="Open menu"><Menu size={19} /></button>
      <div className="course-picker">
        <span className="course-dot" style={{ background: subject?.accent || '#186A5A' }} />
        <div><strong>{subject?.name || 'Loading subject'}</strong><span>{subject?.code || 'Workspace'}</span></div>
        <ChevronDown size={16} />
      </div>
      <div className="top-actions">
        <span className={`ai-badge ${ai?.active ? 'live' : 'fallback'}`} title={ai?.active ? 'GLM is generating live study guidance' : 'Add GLM_API_KEY to enable live study guidance'}>
          <Sparkles size={14} />
          <span><strong>{ai?.model || 'glm-4.7-flash'}</strong><small>{ai?.active ? 'Live agent' : 'Local fallback'}</small></span>
        </span>
        <button className="search-button"><Search size={17} /><span>Search notes and questions</span><kbd>âŒ˜ K</kbd></button>
        <button className="icon-button" title="Notifications"><Bell size={18} /><span className="notification-dot" /></button>
        <button className="icon-button logout-button" onClick={onLogout} title="Sign out"><LogOut size={18} /></button>
      </div>
    </header>
  );
}

function Stat({ icon: Icon, label, value, note, tone }) {
  return (
    <article className="stat-item">
      <span className={`stat-icon ${tone || ''}`}><Icon size={18} /></span>
      <div><span>{label}</span><strong>{value}</strong><small>{note}</small></div>
    </article>
  );
}

function CurriculumMap({ data, large = false, onPractice }) {
  const [selected, setSelected] = useState(null);
  if (!data) return <div className="map-loading"><LoaderCircle className="spin" /> Mapping your curriculum...</div>;
  const byId = Object.fromEntries(data.topics.map((topic) => [topic.id, topic]));
  const stages = Array.from(new globalThis.Map(data.topics.map((topic) => [topic.x, topic.stage])).entries()).sort((a, b) => a[0] - b[0]);
  return (
    <div className={`curriculum-map ${large ? 'large' : ''}`}>
      <div className="map-stage" style={{ '--mobile-height': `${30 + data.topics.length * 90}px` }}>
        <div className="map-stage-labels" aria-hidden="true">
          {stages.map(([x, stage]) => <span key={`${x}-${stage}`} style={{ left: `${x}%` }}>{stage}</span>)}
        </div>
        <svg className="map-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <defs><marker id={`map-arrow-${large ? 'large' : 'small'}`} markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" /></marker></defs>
          {data.edges.filter(([from, to]) => byId[from] && byId[to]).map(([from, to]) => (
            <line key={`${from}-${to}`} x1={byId[from].x} y1={byId[from].y} x2={byId[to].x} y2={byId[to].y} markerEnd={`url(#map-arrow-${large ? 'large' : 'small'})`} />
          ))}
        </svg>
        {data.topics.map((topic, index) => (
          <button
            key={topic.id}
            data-topic={topic.id}
            className={`map-node ${topic.status} ${topic.dimmed ? 'dimmed' : ''} ${selected?.id === topic.id ? 'selected' : ''}`}
            style={{ left: `${topic.x}%`, top: `${topic.y}%`, '--mobile-top': `${15 + index * 90}px` }}
            onClick={() => setSelected(topic)}
            aria-label={`${topic.name}, ${topic.mastery}% mastery`}
          >
            <span className="node-ring" style={{ '--progress': `${topic.mastery * 3.6}deg` }}>
              <span>{topic.status === 'locked' ? <LockKeyhole size={14} /> : `${topic.mastery}%`}</span>
            </span>
            <span className="node-label"><small>{topic.unit}</small><strong>{topic.name}</strong><em>{topic.weight}% exam weight</em></span>
          </button>
        ))}
      </div>
      <div className="map-footer">
        <div className="map-legend"><span><i className="strong" /> Strong</span><span><i className="focus" /> Needs focus</span><span><i className="locked" /> Not started</span></div>
        {selected ? (
          <div className="node-detail-strip">
            <button className="popover-close" onClick={() => setSelected(null)}><X size={14} /></button>
            <div><small>{selected.unit} Â· {selected.stage}</small><strong>{selected.name}</strong></div>
            <div className="detail-mastery"><span>Mastery</span><b>{selected.mastery}%</b><div className="progress-track"><span style={{ width: `${selected.mastery}%` }} /></div></div>
            <div className="detail-weight"><span>Exam weight</span><b>{selected.weight}%</b></div>
            <button className="text-button" onClick={onPractice}>Practice <ArrowRight size={14} /></button>
          </div>
        ) : (
          <p className="map-help">Select a concept to see mastery and exam importance.</p>
        )}
      </div>
    </div>
  );
}

function ResourceList({ resources, subjectId, onRefresh, pushToast }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function handleFiles(files) {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of files) await api.upload(subjectId, file);
      pushToast(`${files.length} resource${files.length > 1 ? 's' : ''} added. Parsing in the background.`);
      await onRefresh();
      window.setTimeout(onRefresh, 1600);
    } catch (error) {
      pushToast(error.message, 'error');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="resources-layout">
      <div
        className={`upload-zone ${dragging ? 'dragging' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
      >
        <input ref={inputRef} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.txt,.docx" onChange={(e) => handleFiles(e.target.files)} />
        <span className="upload-icon"><CloudUpload size={23} /></span>
        <div><strong>Drop study material here</strong><span>PDFs, notes, photos, past papers Â· up toã}=¶‰žËkºwµçAµ¥¹ÕÑ•Ì°‘…åÌô¤ì(€€€Í•ÑA±…¸¡É•ÍÕ±Ð¹‰±½­Ì¤ì(€€€ÁÕÍ¡Q½…ÍÐ MÑÕ‘äÁ±…¸É•…±Õ±…Ñ•…É½Õ¹å½ÕÈ•á…´‘…Ñ”¸œ¤ì(€ô(€É•ÑÕÉ¸€ (€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰Á…”Á±…¹¹•ÈµÁ…”ˆø(€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰Á…”µ¡•…‘¥¹œÍÁ±¥Ðµ¡•…‘¥¹œˆøñ‘¥ØøñÀ±…ÍÍ9…µ”ô‰­¥­•Èˆù…±•¹‘…Èµ…Ý…É”Á±…¸ð½Àøñ Äù5…­”Ñ¡”Ý••¬™¥Ð¸ð½ ÄøñÀù5¥ÍÍ•Í•ÍÍ¥½¹ÌÉ½±°™½ÉÝ…É¸Q¡”Á±…¸‰•¹‘ÌÝ¥Ñ¡½ÕÐ‰É•…­¥¹œ¸ð½Àøð½‘¥Øøñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰Í•½¹‘…Éäµ‰ÕÑÑ½¸ˆøñ…±•¹‘…É…åÌÍ¥é”õìÄÙô€¼øAÕÍ Ñ¼½½±”…±•¹‘…Èð½‰ÕÑÑ½¸øð½‘¥Øø(€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰Á±…¹¹•ÈµÉ¥ˆø(€€€€€€€€ñÍ•Ñ¥½¸±…ÍÍ9…µ”ô‰Í•Ñ¥½¸µ‰±½¬…Ù…¥±…‰¥±¥ÑäµÁ…¹•°ˆøñ ÈùMÑÕ‘ä…Ù…¥±…‰¥±¥Ñäð½ ÈøñÀùM•Ð„É•…±¥ÍÑ¥Œ‘…¥±äÑ…É•Ð¸ð½Àøñ‘¥Ø±…ÍÍ9…µ”ô‰µ¥¹ÕÑ•ÌµÁ¥­•Èˆøñ‰ÕÑÑ½¸½¹±¥¬õì ¤€ôøÍ•Ñ5¥¹ÕÑ•Ì¡5…Ñ ¹µ…à ÄÔ°µ¥¹ÕÑ•Ì€´€Ô¤¥ôûŠ"Hð½‰ÕÑÑ½¸øñÍÑÉ½¹œùíµ¥¹ÕÑ•ÍôñÍÁ…¸ùµ¥¸½‘…äð½ÍÁ…¸øð½ÍÑÉ½¹œøñ‰ÕÑÑ½¸½¹±¥¬õì ¤€ôøÍ•Ñ5¥¹ÕÑ•Ì¡5…Ñ ¹µ¥¸ ÌØÀ°µ¥¹ÕÑ•Ì€¬€Ô¤¥ôø¬ð½‰ÕÑÑ½¸øð½‘¥Øøñ‘¥Ø±…ÍÍ9…µ”ô‰‘…äµÁ¥­•ÈˆùíÝ••­‘…åÌ¹µ…À ¡‘…ä¤€ôø€ñ‰ÕÑÑ½¸­•äõí‘…åô±…ÍÍ9…µ”õí‘…åÌ¹¥¹±Õ‘•Ì¡‘…ä¤€ü€…Ñ¥Ù”œ€è€œô½¹±¥¬õì ¤€ôøÍ•Ñ…åÌ ¡¥Ñ•µÌ¤€ôø¥Ñ•µÌ¹¥¹±Õ‘•Ì¡‘…ä¤€ü¥Ñ•µÌ¹™¥±Ñ•È ¡¥Ñ•´¤€ôø¥Ñ•´€„ôô‘…ä¤€èl¸¸¹¥Ñ•µÌ°‘…åt¥ôùí‘…ä¹Í±¥” À°€Ä¥ôð½‰ÕÑÑ½¸ø¥ôð½‘¥Øøñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰ÁÉ¥µ…Éäµ‰ÕÑÑ½¸™Õ±°ˆ½¹±¥¬õí•¹•É…Ñ•ôøñMÁ…É­±•ÌÍ¥é”õìÄÙô€¼øI•…±Õ±…Ñ”Á±…¸ð½‰ÕÑÑ½¸øð½Í•Ñ¥½¸ø(€€€€€€€€ñÍ•Ñ¥½¸±…ÍÍ9…µ”ô‰Í•Ñ¥½¸µ‰±½¬Ý••¬µÁ±…¸ˆøñ‘¥Ø±…ÍÍ9…µ”ô‰Í•Ñ¥½¸µ¡•…‘¥¹œˆøñ‘¥ØøñÍÁ…¸±…ÍÍ9…µ”ô‰Í•Ñ¥½¸µ¥½¸É••¸ˆøñ…±•¹‘…É…åÌÍ¥é”õìÄÝô€¼øð½ÍÁ…¸øñ‘¥Øøñ Èù9•áÐÍÑÕ‘ä‰±½­Ìð½ ÈøñÀù=É‘•É•‰ä‘•Á•¹‘•¹ä…¹•á…´Ý•¥¡Ðð½Àøð½‘¥Øøð½‘¥Øøð½‘¥Øùì¡Á±…¸ñðmì‘…Ñ”è€œÈÀÈØ´Àà´ÄÐœ°µ¥¹ÕÑ•Ìè€ÈÀ°½¹•ÁÐè€	•É¹½Õ±±¤É•½¹¥Ñ¥½¸œô°ì‘…Ñ”è€œÈÀÈØ´Àà´ÄÔœ°µ¥¹ÕÑ•Ìè€ÈÔ°½¹•ÁÐè€á…Ð•ÅÕ…Ñ¥½¹Ìœô°ì‘…Ñ”è€œÈÀÈØ´Àà´ÄØœ°µ¥¹ÕÑ•Ìè€ÄÔ°½¹•ÁÐè€5¥á•Á…ÍÐµÁ…Á•ÈÁÉ…Ñ¥”œõt¤¹µ…À ¡‰±½¬°¥¹‘•à¤€ôø€ñ…ÉÑ¥±”±…ÍÍ9…µ”ô‰Á±…¸µÉ½Üˆ­•äõí€‘í‰±½¬¹‘…Ñ•ô´‘í¥¹‘•áõôøñ‘¥Ø±…ÍÍ9…µ”ô‰Á±…¸µ‘…Ñ”ˆøñÍÑÉ½¹œùí¹•Ü…Ñ”¡€‘í‰±½¬¹‘…Ñ•õPÀÀèÀÀèÀÁ€¤¹Ñ½1½…±•…Ñ•MÑÉ¥¹œ •¸µ%8œ°ìÝ••­‘…äè€Í¡½ÉÐœô¥ôð½ÍÑÉ½¹œøñÍÁ…¸ùí™½Éµ…Ñ…Ñ”¡‰±½¬¹‘…Ñ”¥ôð½ÍÁ…¸øð½‘¥ØøñÍÁ…¸±…ÍÍ9…µ”õíÁ±…¸µ±¥¹”Ñ½¹”´‘í¥¹‘•à€¬€Åõô€¼øñ‘¥ØøñÍÑÉ½¹œùí‰±½¬¹½¹•ÁÑôð½ÍÑÉ½¹œøñÍµ…±°ùí‰±½¬¹µ¥¹ÕÑ•Íôµ¥¸ƒ
Üí¥¹‘•à€ôôô€È€ü€á…´ÁÉ…Ñ¥”œ€è€‘…ÁÑ¥Ù”ÁÉ…Ñ¥”ôð½Íµ…±°øð½‘¥Øøñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰¥½¸µ‰ÕÑÑ½¸¡½ÍÐˆøñ5½É•!½É¥é½¹Ñ…°Í¥é”õìÄÝô€¼øð½‰ÕÑÑ½¸øð½…ÉÑ¥±”ø¥ôð½Í•Ñ¥½¸ø(€€€€€€ð½‘¥Øø(€€€€ð½‘¥Øø(€€¤ì)ô()™Õ¹Ñ¥½¸I•Á½ÉÑA…”¡ìÉ•Á½ÉÐô¤ì(€¥˜€ …É•Á½ÉÐ¤É•ÑÕÉ¸€ñ‘¥Ø±…ÍÍ9…µ”ô‰Á…”±½…‘¥¹œµÁ…”ˆøñ1½…‘•É¥É±”±…ÍÍ9…µ”ô‰ÍÁ¥¸ˆ€¼øð½‘¥Øøì(€½¹ÍÐµ…áÉÉ½È€ô5…Ñ ¹µ…à ¸¸¹É•Á½ÉÐ¹•ÉÉ½ÉÌ¹µ…À ¡¥Ñ•´¤€ôø¥Ñ•´¹½Õ¹Ð¤¤ì(€É•ÑÕÉ¸€ (€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰Á…”É•Á½ÉÐµÁ…”ˆø(€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰Á…”µ¡•…‘¥¹œÍÁ±¥Ðµ¡•…‘¥¹œˆøñ‘¥ØøñÀ±…ÍÍ9…µ”ô‰­¥­•Èˆù…¥±ä±•…É¹¥¹œÉ•Á½ÉÐð½Àøñ ÄùQ½‘…ä°¥¸•Ù¥‘•¹”¸ð½ ÄøñÀùe½ÕÈÁ…Ñ °µ¥ÍÑ…­•Ì°…¹Ý¡…Ð½µ•Ì¹•áÐ¸ð½Àøð½‘¥ØøñÍÁ…¸±…ÍÍ9…µ”ô‰É•Á½ÉÐµ‘…Ñ”ˆùí¹•Ü…Ñ” ¤¹Ñ½1½…±•…Ñ•MÑÉ¥¹œ •¸µ%8œ°ì‘…äè€¹Õµ•É¥Œœ°µ½¹Ñ è€Í¡½ÉÐœ°å•…Èè€¹Õµ•É¥Œœô¥ôð½ÍÁ…¸øð½‘¥Øø(€€€€€€ñÍ•Ñ¥½¸±…ÍÍ9…µ”ô‰ÍÑ…ÑÌµÍÑÉ¥ÀÉ•Á½ÉÐµÍÑ…ÑÌˆøñMÑ…Ð¥½¸õí±½¬Íô±…‰•°ô‰½ÕÍ•Ñ¥µ”ˆÙ…±Õ”õí€‘íÉ•Á½ÉÐ¹Ñ¥µ•}µ¥¹ÕÑ•Íôµ¥¹ô¹½Ñ”ôˆ¬ÄÈµ¥¸ÙÌ…Ù•É…”ˆÑ½¹”ô‰É••¸ˆ€¼øñMÑ…Ð¥½¸õí1¥ÍÑ¡•­Íô±…‰•°ô‰EÕ•ÍÑ¥½¹ÌˆÙ…±Õ”õíÉ•Á½ÉÐ¹…ÑÑ•µÁÑ•‘ô¹½Ñ”ôˆÐ½¹•ÁÑÌ½Ù•É•ˆÑ½¹”ô‰‰±Õ”ˆ€¼øñMÑ…Ð¥½¸õíQ…É•Ñô±…‰•°ô‰ÕÉ…äˆÙ…±Õ”õí€‘íÉ•Á½ÉÐ¹…ÕÉ…åô•ô¹½Ñ”ôˆ¬à”Ñ¡¥ÌÝ••¬ˆÑ½¹”ô‰å•±±½Üˆ€¼øñMÑ…Ð¥½¸õíQÉ•¹‘¥¹UÁô±…‰•°ô‰Må±±…‰ÕÌˆÙ…±Õ”õí€‘íÉ•Á½ÉÐ¹Íå±±…‰ÕÍ}½Ù•É…•ô•ô¹½Ñ”ô‰=¸ÑÉ…¬™½È•á…´ˆÑ½¹”ô‰½É…°ˆ€¼øð½Í•Ñ¥½¸ø(€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰É•Á½ÉÐµÉ¥ˆø(€€€€€€€€ñÍ•Ñ¥½¸±…ÍÍ9…µ”ô‰Í•Ñ¥½¸µ‰±½¬¡…ÉÐµ‰±½¬ˆøñ‘¥Ø±…ÍÍ9…µ”ô‰Í•Ñ¥½¸µ¡•…‘¥¹œˆøñ‘¥ØøñÍÁ…¸±…ÍÍ9…µ”ô‰Í•Ñ¥½¸µ¥½¸É••¸ˆøñQÉ•¹‘¥¹UÀÍ¥é”õìÄÝô€¼øð½ÍÁ…¸øñ‘¥Øøñ Èù!¥¹Ð‘•Á•¹‘•¹”¥Ì™…±±¥¹œð½ ÈøñÀùÙ•É…”¡¥¹Ð±•Ù•°ÕÍ•Á•ÈÍ•ÍÍ¥½¸ð½Àøð½‘¥Øøð½‘¥ØøñÍÑÉ½¹œ±…ÍÍ9…µ”ô‰Á½Í¥Ñ¥Ù”ˆûŠ"HÔÔ”ð½ÍÑÉ½¹œøð½‘¥Øøñ‘¥Ø±…ÍÍ9…µ”ô‰±¥¹”µ¡…ÉÐˆøñÍÙœÙ¥•Ý	½àôˆÀ€À€ÔÀÀ€ÄàÀˆÁÉ•Í•ÉÙ•ÍÁ•ÑI…Ñ¥¼ô‰¹½¹”ˆøñÁ…Ñ ±…ÍÍ9…µ”ô‰¡…ÉÐµ…É•„ˆô‰4ÄÀ°ÌÔäÔ°ÔÀ€ÄÈÀ°ØÔ€ÄØÔ°ÜÔLÈØÀ°ÄÀÀ€ÌÌÀ°ÄÄÔLÐÈÀ°ÄÌÌ€ÐäÀ°ÄÔÀ0ÐäÀ°ÄÜÔ0ÄÀ°ÄÜÔhˆ€¼øñÁ…Ñ ±…ÍÍ9…µ”ô‰¡…ÉÐµ±¥¹”ˆô‰4ÄÀ°ÌÔäÔ°ÔÀ€ÄÈÀ°ØÔ€ÄØÔ°ÜÔLÈØÀ°ÄÀÀ€ÌÌÀ°ÄÄÔLÐÈÀ°ÄÌÌ€ÐäÀ°ÄÔÀˆ€¼øð½ÍÙœøñ‘¥Ø±…ÍÍ9…µ”ô‰¡…ÉÐµ±…‰•±ÌˆøñÍÁ…¸ù5½¸ð½ÍÁ…¸øñÍÁ…¸ùQÕ”ð½ÍÁ…¸øñÍÁ…¸ù]•ð½ÍÁ…¸øñÍÁ…¸ùQ¡Ôð½ÍÁ…¸øñÍÁ…¸ùQ½‘…äð½ÍÁ…¸øð½‘¥Øøð½‘¥Øøð½Í•Ñ¥½¸ø(€€€€€€€€ñÍ•Ñ¥½¸±…ÍÍ9…µ”ô‰Í•Ñ¥½¸µ‰±½¬…±¥‰É…Ñ¥½¸µ‰±½¬ˆøñ‘¥Ø±…ÍÍ9…µ”ô‰Í•Ñ¥½¸µ¡•…‘¥¹œˆøñ‘¥ØøñÍÁ…¸±…ÍÍ9…µ”ô‰Í•Ñ¥½¸µ¥½¸‰±Õ”ˆøñQ…É•ÐÍ¥é”õìÄÝô€¼øð½ÍÁ…¸øñ‘¥Øøñ Èù½¹™¥‘•¹”…±¥‰É…Ñ¥½¸ð½ ÈøñÀù!½ÜÝ•±°•ÉÑ…¥¹Ñäµ…Ñ¡•Ì½ÉÉ•Ñ¹•ÍÌð½Àøð½‘¥Øøð½‘¥Øøð½‘¥Øøñ‘¥Ø±…ÍÍ9…µ”ô‰…±¥‰É…Ñ¥½¸µÍ½É”ˆøñ‘¥Ø±…ÍÍ9…µ”ô‰‘½¹ÕÐˆÍÑå±”õíì€œ´µÍ½É”œè€‘íÉ•Á½ÉÐ¹½¹™¥‘•¹•}Í½É”€¨€Ì¸Ùõ‘•€õôøñÍÁ…¸øñÍÑÉ½¹œùíÉ•Á½ÉÐ¹½¹™¥‘•¹•}Í½É•ôð½ÍÑÉ½¹œøñÍµ…±°ø¼ÄÀÀð½Íµ…±°øð½ÍÁ…¸øð½‘¥Øøñ‘¥ØøñÍÑÉ½¹œù]•±°…±¥‰É…Ñ•ð½ÍÑÉ½¹œøñÀùe½ÔÝ•É”•ÉÑ…¥¸€àÑ¥µ•Ì¸€ÜÝ•É”½ÉÉ•Ð¸I•Ù¥•ÜÑ¡”½¹”½¹™¥‘•¹Ðµ¥ÍÌ¸ð½Àøð½‘¥Øøð½‘¥Øøð½Í•Ñ¥½¸ø(€€€€€€€€ñÍ•Ñ¥½¸±…ÍÍ9…µ”ô‰Í•Ñ¥½¸µ‰±½¬•ÉÉ½ÉÌµ‰±½¬ˆøñ‘¥Ø±…ÍÍ9…µ”ô‰Í•Ñ¥½¸µ¡•…‘¥¹œˆøñ‘¥ØøñÍÁ…¸±…ÍÍ9…µ”ô‰Í•Ñ¥½¸µ¥½¸½É…°ˆøñ¥É±•±•ÉÐÍ¥é”õìÄÝô€¼øð½ÍÁ…¸øñ‘¥Øøñ ÈùÉÉ½ÈÁ…ÑÑ•É¹Ìð½ ÈøñÀù9½Ð…±°ÝÉ½¹œ…¹ÍÝ•ÉÌµ•…¸Ñ¡”Í…µ”Ñ¡¥¹œð½Àøð½‘¥Øøð½‘¥Øøð½‘¥Øøñ‘¥Ø±…ÍÍ9…µ”ô‰•ÉÉ½Èµ‰…ÉÌˆùíÉ•Á½ÉÐ¹•ÉÉ½ÉÌ¹µ…À ¡•ÉÉ½È¤€ôø€ñ‘¥Ø­•äõí•ÉÉ½È¹ÑåÁ•ôøñÍÁ…¸ùí•ÉÉ½È¹ÑåÁ•ôð½ÍÁ…¸øñ‘¥Øøñ¤ÍÑå±”õíìÝ¥‘Ñ è€‘ì¡•ÉÉ½È¹½Õ¹Ð€¼µ…áÉÉ½È¤€¨€ÄÀÁô•€°‰…­É½Õ¹è•ÉÉ½È¹½±½Èõô€¼øð½‘¥ØøñÍÑÉ½¹œùí•ÉÉ½È¹½Õ¹Ñôð½ÍÑÉ½¹œøð½‘¥Øø¥ôð½‘¥Øøð½Í•Ñ¥½¸ø(€€€€€€€€ñÍ•Ñ¥½¸±…ÍÍ9…µ”ô‰Í•Ñ¥½¸µ‰±½¬Ñ½µ½ÉÉ½Üµ‰±½¬ˆøñ‘¥Ø±…ÍÍ9…µ”ô‰Í•Ñ¥½¸µ¡•…‘¥¹œˆøñ‘¥ØøñÍÁ…¸±…ÍÍ9…µ”ô‰Í•Ñ¥½¸µ¥½¸å•±±½Üˆøñi…ÀÍ¥é”õìÄÝô€¼øð½ÍÁ…¸øñ‘¥Øøñ ÈùQ½µ½ÉÉ½ÜÌÅÕ•Õ”ð½ ÈøñÀù•¹•É…Ñ•™É½´Ñ½‘…äÌ•Ù¥‘•¹”ð½Àøð½‘¥Øøð½‘¥Øøð½‘¥ØùíÉ•Á½ÉÐ¹Ñ½µ½ÉÉ½Ü¹µ…À ¡¥Ñ•´°¥¹‘•à¤€ôø€ñ…ÉÑ¥±”­•äõí¥Ñ•µôøñÍÁ…¸ùí¥¹‘•à€¬€Åôð½ÍÁ…¸øñÍÑÉ½¹œùí¥Ñ•µôð½ÍÑÉ½¹œøñ¡•ÙÉ½¹I¥¡ÐÍ¥é”õìÄÙô€¼øð½…ÉÑ¥±”ø¥ôð½Í•Ñ¥½¸ø(€€€€€€ð½‘¥Øø(€€€€ð½‘¥Øø(€€¤ì)ô()™Õ¹Ñ¥½¸¥…¹½ÍÑ¥5½‘…°¡ìÍÕ‰©•Ñ%°½¹±½Í”°ÁÕÍ¡Q½…ÍÐô¤ì(€½¹ÍÐm‘…Ñ„°Í•Ñ…Ñ…t€ôÕÍ•MÑ…Ñ”¡¹Õ±°¤ì(€½¹ÍÐm¥¹‘•à°Í•Ñ%¹‘•át€ôÕÍ•MÑ…Ñ” À¤ì(€½¹ÍÐmÍ•±•Ñ•°Í•ÑM•±•Ñ•‘t€ôÕÍ•MÑ…Ñ” œœ¤ì(€½¹ÍÐmÉ•ÍÕ±Ð°Í•ÑI•ÍÕ±Ñt€ôÕÍ•MÑ…Ñ”¡¹Õ±°¤ì(€ÕÍ•™™•Ð  ¤€ôøì…Á¤¹‘¥…¹½ÍÑ¥Œ¡ÍÕ‰©•Ñ%¤¹Ñ¡•¸¡Í•Ñ…Ñ„¤¹…Ñ  ¡•ÉÉ½È¤€ôøÁÕÍ¡Q½…ÍÐ¡•ÉÉ½È¹µ•ÍÍ…”°€•ÉÉ½Èœ¤¤ìô°mÍÕ‰©•Ñ%°ÁÕÍ¡Q½…ÍÑt¤ì(€½¹ÍÐÅÕ•ÍÑ¥½¸€ô‘…Ñ„ü¹ÅÕ•ÍÑ¥½¹Ìü¹m¥¹‘•átì(€…Íå¹Œ™Õ¹Ñ¥½¸…¹ÍÝ•È ¤ì(€€€½¹ÍÐÉ•ÍÁ½¹Í”€ô…Ý…¥Ð…Á¤¹…¹ÍÝ•É¥…¹½ÍÑ¥Œ¡ÍÕ‰©•Ñ%°ìÅÕ•ÍÑ¥½¹}¥èÅÕ•ÍÑ¥½¸¹¥°…¹ÍÝ•ÈèÍ•±•Ñ•ô¤ì(€€€Í•ÑI•ÍÕ±Ð¡É•ÍÁ½¹Í”¤ì(€ô(€™Õ¹Ñ¥½¸¹•áÐ ¤ì(€€€¥˜€¡¥¹‘•à€¬€Ä€øô‘…Ñ„¹ÅÕ•ÍÑ¥½¹Ì¹±•¹Ñ ¤É•ÑÕÉ¸½¹±½Í” ¤ì(€€€Í•Ñ%¹‘•à ¡Ù…±Õ”¤€ôøÙ…±Õ”€¬€Ä¤ìÍ•ÑM•±•Ñ• œœ¤ìÍ•ÑI•ÍÕ±Ð¡¹Õ±°¤ì(€ô(€É•ÑÕÉ¸€ (€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰µ½‘…°µ‰…­‘É½ÀˆøñÍ•Ñ¥½¸±…ÍÍ9…µ”ô‰‘¥…¹½ÍÑ¥Œµµ½‘…°ˆøñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰µ½‘…°µàˆ½¹±¥¬õí½¹±½Í•ôøñ`Í¥é”õìÄáô€¼øð½‰ÕÑÑ½¸ùì…ÅÕ•ÍÑ¥½¸€ü€ñ‘¥Ø±…ÍÍ9…µ”ô‰µ½‘…°µ±½…‘¥¹œˆøñ1½…‘•É¥É±”±…ÍÍ9…µ”ô‰ÍÁ¥¸ˆ€¼øð½‘¥Øø€è€ðøñ‘¥Ø±…ÍÍ9…µ”ô‰‘¥…¹½ÍÑ¥ŒµÁÉ½É•ÍÌˆøñÍÁ…¸ÍÑå±”õíìÝ¥‘Ñ è€‘ì ¡¥¹‘•à€¬€Ä¤€¼‘…Ñ„¹ÅÕ•ÍÑ¥½¹Ì¹±•¹Ñ ¤€¨€ÄÀÁô•€õô€¼øð½‘¥ØøñÀ±…ÍÍ9…µ”ô‰­¥­•ÈˆùA±…•µ•¹Ð¡•¬ƒ
ÜíÅÕ•ÍÑ¥½¸¹½¹•ÁÑôð½Àøñ ÈùíÅÕ•ÍÑ¥½¸¹ÁÉ½µÁÑôð½ ÈøñÀ±…ÍÍ9…µ”ô‰ÅÕ•ÍÑ¥½¸µ½Õ¹ÐˆùEÕ•ÍÑ¥½¸í¥¹‘•à€¬€Åô½˜í‘…Ñ„¹ÅÕ•ÍÑ¥½¹Ì¹±•¹Ñ¡ôð½Àøñ‘¥Ø±…ÍÍ9…µ”ô‰…¹ÍÝ•Èµ½ÁÑ¥½¹ÌˆùíÅÕ•ÍÑ¥½¸¹½ÁÑ¥½¹Ì¹µ…À ¡½ÁÑ¥½¸°½ÁÑ¥½¹%¹‘•à¤€ôø€ñ‰ÕÑÑ½¸­•äõí½ÁÑ¥½¹ô±…ÍÍ9…µ”õí€‘íÍ•±•Ñ•€ôôô½ÁÑ¥½¸€ü€Í•±•Ñ•œ€è€œô€‘íÉ•ÍÕ±Ð€˜˜½ÁÑ¥½¸€ôôôÍ•±•Ñ•€ü€¡É•ÍÕ±Ð¹½ÉÉ•Ð€ü€½ÉÉ•Ðœ€è€¥¹½ÉÉ•Ðœ¤€è€œõô½¹±¥¬õì ¤€ôø€…É•ÍÕ±Ð€˜˜Í•ÑM•±•Ñ•¡½ÁÑ¥½¸¥ôøñÍÁ…¸ùíMÑÉ¥¹œ¹™É½µ¡…É½‘” ØÔ€¬½ÁÑ¥½¹%¹‘•à¥ôð½ÍÁ…¸ùí½ÁÑ¥½¹õíÉ•ÍÕ±Ð€˜˜½ÁÑ¥½¸€ôôôÍ•±•Ñ•€˜˜€¡É•ÍÕ±Ð¹½ÉÉ•Ð€ü€ñ¡•¬Í¥é”õìÄÙô€¼ø€è€ñ`Í¥é”õìÄÙô€¼ø¥ôð½‰ÕÑÑ½¸ø¥ôð½‘¥ØùíÉ•ÍÕ±Ð€˜˜€ñÀ±…ÍÍ9…µ”õí‘¥…¹½ÍÑ¥Œµ™••‘‰…¬€‘íÉ•ÍÕ±Ð¹½ÉÉ•Ð€ü€½ÉÉ•Ðœ€è€œõôùíÉ•ÍÕ±Ð¹•áÁ±…¹…Ñ¥½¹ôð½Àùôñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰ÁÉ¥µ…Éäµ‰ÕÑÑ½¸™Õ±°ˆ½¹±¥¬õíÉ•ÍÕ±Ð€ü¹•áÐ€è…¹ÍÝ•Éô‘¥Í…‰±•õì…Í•±•Ñ•‘ôùíÉ•ÍÕ±Ð€ü€¡¥¹‘•à€¬€Ä€ôôô‘…Ñ„¹ÅÕ•ÍÑ¥½¹Ì¹±•¹Ñ €ü€¥¹¥Í ¡•¬œ€è€9•áÐÅÕ•ÍÑ¥½¸œ¤€è€¡•¬…¹ÍÝ•Èô€ñÉÉ½ÝI¥¡ÐÍ¥é”õìÄÙô€¼øð½‰ÕÑÑ½¸øð¼ùôð½Í•Ñ¥½¸øð½‘¥Øø(€€¤ì)ô()™Õ¹Ñ¥½¸9•ÝMÕ‰©•Ñ5½‘…°¡ì½¹±½Í”°½¹É•…Ñ•°ÁÕÍ¡Q½…ÍÐô¤ì(€½¹ÍÐm¹…µ”°Í•Ñ9…µ•t€ôÕÍ•MÑ…Ñ” œœ¤ì(€½¹ÍÐm½‘”°Í•Ñ½‘•t€ôÕÍ•MÑ…Ñ” œœ¤ì(€½¹ÍÐm•á…µ…Ñ”°Í•Ñá…µ…Ñ•t€ôÕÍ•MÑ…Ñ” œœ¤ì(€…Íå¹Œ™Õ¹Ñ¥½¸ÍÕ‰µ¥Ð¡•Ù•¹Ð¤ì(€€€•Ù•¹Ð¹ÁÉ•Ù•¹Ñ•™…Õ±Ð ¤ì(€€€ÑÉäì½¹ÍÐÍÕ‰©•Ð€ô…Ý…¥Ð…Á¤¹É•…Ñ•MÕ‰©•Ð¡ì¹…µ”°½‘”è½‘”ñð€9\œ°•á…µ}‘…Ñ”è•á…µ…Ñ”ñð¹Õ±°ô¤ì½¹É•…Ñ•¡ÍÕ‰©•Ð¤ìô…Ñ €¡•ÉÉ½È¤ìÁÕÍ¡Q½…ÍÐ¡•ÉÉ½È¹µ•ÍÍ…”°€•ÉÉ½Èœ¤ìô(€ô(€É•ÑÕÉ¸€ñ‘¥Ø±…ÍÍ9…µ”ô‰µ½‘…°µ‰…­‘É½Àˆøñ™½É´±…ÍÍ9…µ”ô‰¹•ÜµÍÕ‰©•Ðµµ½‘…°ˆ½¹MÕ‰µ¥ÐõíÍÕ‰µ¥Ñôøñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰µ½‘…°µàˆÑåÁ”ô‰‰ÕÑÑ½¸ˆ½¹±¥¬õí½¹±½Í•ôøñ`Í¥é”õìÄáô€¼øð½‰ÕÑÑ½¸øñÍÁ…¸±…ÍÍ9…µ”ô‰µ½‘…°µ¥½¸ˆøñÉ…‘Õ…Ñ¥½¹…ÀÍ¥é”õìÈÉô€¼øð½ÍÁ…¸øñÀ±…ÍÍ9…µ”ô‰­¥­•Èˆù9•ÜÝ½É­ÍÁ…”ð½Àøñ Èù‘„ÍÕ‰©•Ðð½ ÈøñÀùMÑ…ÉÐÝ¥Ñ Ñ¡”¹…µ”¸e½Ô…¸ÕÁ±½…µ…Ñ•É¥…°¥µµ•‘¥…Ñ•±ä…™Ñ•È¸ð½Àøñ±…‰•°±…ÍÍ9…µ”ô‰™¥•±µ±…‰•°ˆùMÕ‰©•Ð¹…µ”ñ¥¹ÁÕÐ±…ÍÍ9…µ”ô‰Ñ•áÐµ¥¹ÁÕÐˆÙ…±Õ”õí¹…µ•ô½¹¡…¹”õì¡”¤€ôøÍ•Ñ9…µ”¡”¹Ñ…É•Ð¹Ù…±Õ”¥ôÁ±…•¡½±‘•Èô‰”¹œ¸¹¥¹••É¥¹œA¡åÍ¥ÌˆÉ•ÅÕ¥É•€¼øð½±…‰•°øñ‘¥Ø±…ÍÍ9…µ”ô‰™¥•±µÉ¥ˆøñ±…‰•°±…ÍÍ9…µ”ô‰™¥•±µ±…‰•°ˆù½ÕÉÍ”½‘”ñ¥¹ÁÕÐ±…ÍÍ9…µ”ô‰Ñ•áÐµ¥¹ÁÕÐˆÙ…±Õ”õí½‘•ô½¹¡…¹”õì¡”¤€ôøÍ•Ñ½‘”¡”¹Ñ…É•Ð¹Ù…±Õ”¥ôÁ±…•¡½±‘•Èô‰A ÈÀÄˆ€¼øð½±…‰•°øñ±…‰•°±…ÍÍ9…µ”ô‰™¥•±µ±…‰•°ˆùá…´‘…Ñ”ñ¥¹ÁÕÐ±…ÍÍ9…µ”ô‰Ñ•áÐµ¥¹ÁÕÐˆÑåÁ”ô‰‘…Ñ”ˆÙ…±Õ”õí•á…µ…Ñ•ô½¹¡…¹”õì¡”¤€ôøÍ•Ñá…µ…Ñ”¡”¹Ñ…É•Ð¹Ù…±Õ”¥ô€¼øð½±…‰•°øð½‘¥Øøñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰ÁÉ¥µ…Éäµ‰ÕÑÑ½¸™Õ±°ˆÑåÁ”ô‰ÍÕ‰µ¥ÐˆøñA±ÕÌÍ¥é”õìÄÝô€¼øÉ•…Ñ”ÍÕ‰©•Ðð½‰ÕÑÑ½¸øð½™½É´øð½‘¥Øøì)ô()™Õ¹Ñ¥½¸Q½…ÍÐ¡ìÑ½…ÍÐ°½¹±½Í”ô¤ì(€ÕÍ•™™•Ð  ¤€ôøì½¹ÍÐÑ¥µ•È€ôÝ¥¹‘½Ü¹Í•ÑQ¥µ•½ÕÐ¡½¹±½Í”°€ÌÔÀÀ¤ìÉ•ÑÕÉ¸€ ¤€ôø±•…ÉQ¥µ•½ÕÐ¡Ñ¥µ•È¤ìô°mÑ½…ÍÐ°½¹±½Í•t¤ì(€É•ÑÕÉ¸€ñ‘¥Ø±…ÍÍ9…µ”õíÑ½…ÍÐ€‘íÑ½…ÍÐ¹ÑåÁ”ñð€œõôùíÑ½…ÍÐ¹ÑåÁ”€ôôô€•ÉÉ½Èœ€ü€ñ¥É±•±•ÉÐÍ¥é”õìÄáô€¼ø€è€ñ¡•­¥É±”ÈÍ¥é”õìÄáô€¼ùôñÍÁ…¸ùíÑ½…ÍÐ¹µ•ÍÍ…•ôð½ÍÁ…¸øñ‰ÕÑÑ½¸½¹±¥¬õí½¹±½Í•ôøñ`Í¥é”õìÄÕô€¼øð½‰ÕÑÑ½¸øð½‘¥Øøì)ô()™Õ¹Ñ¥½¸µÁÑåMÕ‰©•ÑMÑ…Ñ”¡ì½¹É•…Ñ”ô¤ì(€É•ÑÕÉ¸€ (€€€€ñµ…¥¸±…ÍÍ9…µ”ô‰•µÁÑäµÝ½É­ÍÁ…”ˆø(€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰•µÁÑäµÝ½É­ÍÁ…”µ¥½¸ˆøñÉ…‘Õ…Ñ¥½¹…ÀÍ¥é”õìÈÝô€¼øð½ÍÁ…¸ø(€€€€€€ñÀ±…ÍÍ9…µ”ô‰­¥­•Èˆùe½ÕÈ™¥ÉÍÐÝ½É­ÍÁ…”ð½Àø(€€€€€€ñ Äù‘„ÍÕ‰©•ÐÑ¼‰•¥¸¸ð½ Äø(€€€€€€ñÀùUÁ±½…¹½Ñ•Ì°ÅÕ•ÍÑ¥½¸‰…¹­Ì°Á…ÍÐÁ…Á•ÉÌ°½È„Íå±±…‰ÕÌ…™Ñ•ÈÉ•…Ñ¥¹œ¥Ð¸ð½Àø(€€€€€€ñ‰ÕÑÑ½¸±…ÍÍ9…µ”ô‰ÁÉ¥µ…Éäµ‰ÕÑÑ½¸ˆ½¹±¥¬õí½¹É•…Ñ•ôøñA±ÕÌÍ¥é”õìÄÝô€¼ø9•ÜÍÕ‰©•Ðð½‰ÕÑÑ½¸ø(€€€€ð½µ…¥¸ø(€€¤ì)ô()•áÁ½ÉÐ‘•™…Õ±Ð™Õ¹Ñ¥½¸ÁÀ ¤ì(€½¹ÍÐmÍ•ÍÍ¥½¸°Í•ÑM•ÍÍ¥½¹t€ôÕÍ•MÑ…Ñ”¡¹Õ±°¤ì(€½¹ÍÐm…ÕÑ¡I•…‘ä°Í•ÑÕÑ¡I•…‘åt€ôÕÍ•MÑ…Ñ”¡™…±Í”¤ì(€½¹ÍÐm‘…Í¡‰½…É°Í•Ñ…Í¡‰½…É‘t€ôÕÍ•MÑ…Ñ”¡¹Õ±°¤ì(€½¹ÍÐm…Ñ¥Ù•MÕ‰©•Ñ%°Í•ÑÑ¥Ù•MÕ‰©•Ñ%‘t€ôÕÍ•MÑ…Ñ”¡¹Õ±°¤ì(€½¹ÍÐm‘•Ñ…¥°°Í•Ñ•Ñ…¥±t€ôÕÍ•MÑ…Ñ”¡¹Õ±°¤ì(€½¹ÍÐmµ…Á…Ñ„°Í•Ñ5…Á…Ñ…t€ôÕÍ•MÑ…Ñ”¡¹Õ±°¤ì(€½¹ÍÐmÁÉ…Ñ¥”°Í•ÑAÉ…Ñ¥•t€ôÕÍ•MÑ…Ñ”¡¹Õ±°¤ì(€½¹ÍÐmÉ•Á½ÉÐ°Í•ÑI•Á½ÉÑt€ôÕÍ•MÑ…Ñ”¡¹Õ±°¤ì(€½¹ÍÐmÙ¥•Ü°Í•ÑY¥•Ýt€ôÕÍ•MÑ…Ñ” Ý½É­ÍÁ…”œ¤ì(€½¹ÍÐmµ½‰¥±•9…Ø°Í•Ñ5½‰¥±•9…Ùt€ôÕÍ•MÑ…Ñ”¡™…±Í”¤ì(€½¹ÍÐm‘¥…¹½ÍÑ¥=Á•¸°Í•Ñ¥…¹½ÍÑ¥=Á•¹t€ôÕÍ•MÑ…Ñ”¡™…±Í”¤ì(€½¹ÍÐmÍÕ‰©•Ñ5½‘…°°Í•ÑMÕ‰©•Ñ5½‘…±t€ôÕÍ•MÑ…Ñ”¡™…±Í”¤ì(€½¹ÍÐmÑ½…ÍÐ°Í•ÑQ½…ÍÑt€ôÕÍ•MÑ…Ñ”¡¹Õ±°¤ì((€½¹ÍÐÁÕÍ¡Q½…ÍÐ€ôÕÍ•…±±‰…¬ ¡µ•ÍÍ…”°ÑåÁ”€ô€œœ¤€ôøÍ•ÑQ½…ÍÐ¡ìµ•ÍÍ…”°ÑåÁ”°¥è…Ñ”¹¹½Ü ¤ô¤°mt¤ì((€ÕÍ•™™•Ð  ¤€ôøì(€€€É•ÍÑ½É•M•ÍÍ¥½¸ ¤¹Ñ¡•¸¡Í•ÑM•ÍÍ¥½¸¤¹™¥¹…±±ä  ¤€ôøÍ•ÑÕÑ¡I•…‘ä¡ÑÉÕ”¤¤ì(€ô°mt¤ì((€½¹ÍÐ±½…‘…Í¡‰½…É€ôÕÍ•…±±‰…¬¡…Íå¹Œ€ ¤€ôøì(€€€½¹ÍÐ‘…Ñ„€ô…Ý…¥Ð…Á¤¹‘…Í¡‰½…É ¤ì(€€€Í•Ñ…Í¡‰½…É¡‘…Ñ„¤ì(€€€Í•ÑÑ¥Ù•MÕ‰©•Ñ% ¡ÕÉÉ•¹Ð¤€ôøÕÉÉ•¹Ðñð‘…Ñ„¹…Ñ¥Ù•}ÍÕ‰©•Ñ}¥¤ì(€ô°mt¤ì((€½¹ÍÐ±½…‘MÕ‰©•Ð€ôÕÍ•…±±‰…¬¡…Íå¹Œ€ ¤€ôøì(€€€¥˜€ ……Ñ¥Ù•MÕ‰©•Ñ%¤É•ÑÕÉ¸ì(€€€½¹ÍÐmÍÕ‰©•Ñ…Ñ„°É…Á °ÁÉ…Ñ¥•…Ñ„°É•Á½ÉÑ…Ñ…t€ô…Ý…¥ÐAÉ½µ¥Í”¹…±°¡l(€€€€€…Á¤¹ÍÕ‰©•Ð¡…Ñ¥Ù•MÕ‰©•Ñ%¤°…Á¤¹µ…À¡…Ñ¥Ù•MÕ‰©•Ñ%¤°…Á¤¹ÁÉ…Ñ¥”¡…Ñ¥Ù•MÕ‰©•Ñ%¤°…Á¤¹É•Á½ÉÐ¡…Ñ¥Ù•MÕ‰©•Ñ%¤°(€€€t¤ì(€€€Í•Ñ•Ñ…¥°¡ÍÕ‰©•Ñ…Ñ„¤ìÍ•Ñ5…Á…Ñ„¡É…Á ¤ìÍ•ÑAÉ…Ñ¥”¡ÁÉ…Ñ¥•…Ñ„¤ìÍ•ÑI•Á½ÉÐ¡É•Á½ÉÑ…Ñ„¤ì(€ô°m…Ñ¥Ù•MÕ‰©•Ñ%‘t¤ì((€ÕÍ•™™•Ð  ¤€ôøì¥˜€¡Í•ÍÍ¥½¸¤±½…‘…Í¡‰½…É ¤¹…Ñ  ¡•ÉÉ½È¤€ôøÁÕÍ¡Q½…ÍÐ¡•ÉÉ½È¹µ•ÍÍ…”°€•ÉÉ½Èœ¤¤ìô°mÍ•ÍÍ¥½¸°±½…‘…Í¡‰½…É°ÁÕÍ¡Q½…ÍÑt¤ì(€ÕÍ•™™•Ð  ¤€ôøì±½…‘MÕ‰©•Ð ¤¹…Ñ  ¡•ÉÉ½È¤€ôøÁÕÍ¡Q½…ÍÐ¡•ÉÉ½È¹µ•ÍÍ…”°€•ÉÉ½Èœ¤¤ìô°m±½…‘MÕ‰©•Ð°ÁÕÍ¡Q½…ÍÑt¤ì(€ÕÍ•™™•Ð  ¤€ôøìÝ¥¹‘½Ü¹ÍÉ½±±Q¼¡ìÑ½Àè€À°‰•¡…Ù¥½Èè€¥¹ÍÑ…¹Ðœô¤ìô°mÙ¥•Ýt¤ì(€ÕÍ•™™•Ð  ¤€ôøì(€€€½¹ÍÐ¡…¹‘±•U¹…ÕÑ¡½É¥é•€ô€ ¤€ôøìÍ¥¹=ÕÑM•ÍÍ¥½¸ ¤ìÍ•ÑM•ÍÍ¥½¸¡¹Õ±°¤ìÍ•Ñ…Í¡‰½…É¡¹Õ±°¤ìôì(€€€Ý¥¹‘½Ü¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ÁÉ¥Í´éÕ¹…ÕÑ¡½É¥é•œ°¡…¹‘±•U¹…ÕÑ¡½É¥é•¤ì(€€€É•ÑÕÉ¸€ ¤€ôøÝ¥¹‘½Ü¹É•µ½Ù•Ù•¹Ñ1¥ÍÑ•¹•È ÁÉ¥Í´éÕ¹…ÕÑ¡½É¥é•œ°¡…¹‘±•U¹…ÕÑ¡½É¥é•¤ì(€ô°mt¤ì((€½¹ÍÐÍÕ‰©•Ð€ôÕÍ•5•µ¼  ¤€ôø‘…Í¡‰½…Éü¹ÍÕ‰©•ÑÌ¹™¥¹ ¡¥Ñ•´¤€ôø¥Ñ•´¹¥€ôôô…Ñ¥Ù•MÕ‰©•Ñ%¤ñð‘•Ñ…¥°ü¹ÍÕ‰©•Ð°m‘…Í¡‰½…É°…Ñ¥Ù•MÕ‰©•Ñ%°‘•Ñ…¥±t¤ì((€…Íå¹Œ™Õ¹Ñ¥½¸±½½ÕÐ ¤ì…Ý…¥ÐÍ¥¹=ÕÑM•ÍÍ¥½¸ ¤ìÍ•ÑM•ÍÍ¥½¸¡¹Õ±°¤ìÍ•Ñ…Í¡‰½…É¡¹Õ±°¤ìô(€…Íå¹Œ™Õ¹Ñ¥½¸½¹MÕ‰©•ÑÉ•…Ñ•¡¹•ÝMÕ‰©•Ð¤ìÍ•ÑMÕ‰©•Ñ5½‘…°¡™…±Í”¤ì…Ý…¥Ð±½…‘…Í¡‰½…É ¤ìÍ•ÑÑ¥Ù•MÕ‰©•Ñ%¡¹•ÝMÕ‰©•Ð¹¥¤ìÍ•ÑY¥•Ü Ý½É­ÍÁ…”œ¤ìÁÕÍ¡Q½…ÍÐ¡€‘í¹•ÝMÕ‰©•Ð¹¹…µ•ôÝ½É­ÍÁ…”É•…Ñ•¹€¤ìô((€¥˜€ ……ÕÑ¡I•…‘ä¤É•ÑÕÉ¸€ñ‘¥Ø±…ÍÍ9…µ”ô‰…ÁÀµ±½…‘¥¹œˆøñ1½¼€¼øñ1½…‘•É¥É±”±…ÍÍ9…µ”ô‰ÍÁ¥¸ˆ€¼øð½‘¥Øøì(€¥˜€ …Í•ÍÍ¥½¸¤É•ÑÕÉ¸€ñÕÑ¡MÉ••¸½¹1½¥¸õíÍ•ÑM•ÍÍ¥½¹ô€¼øì(€¥˜€ …‘…Í¡‰½…É¤É•ÑÕÉ¸€ñ‘¥Ø±…ÍÍ9…µ”ô‰…ÁÀµ±½…‘¥¹œˆøñ1½¼€¼øñ1½…‘•É¥É±”±…ÍÍ9…µ”ô‰ÍÁ¥¸ˆ€¼øð½‘¥Øøì((€É•ÑÕÉ¸€ (€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰…ÁÀµÍ¡•±°ˆø(€€€€€€ñ‘¥Ø±…ÍÍ9…µ”õíµ½‰¥±”µ½Ù•É±…ä€‘íµ½‰¥±•9…Ø€ü€Í¡½Üœ€è€œõô½¹±¥¬õì ¤€ôøÍ•Ñ5½‰¥±•9…Ø¡™…±Í”¥ô€¼ø(€€€€€€ñM¥‘•‰…ÈÍÕ‰©•ÑÌõí‘…Í¡‰½…É¹ÍÕ‰©•ÑÍô…Ñ¥Ù•MÕ‰©•Ñ%õí…Ñ¥Ù•MÕ‰©•Ñ%‘ô½¹MÕ‰©•ÐõíÍ•ÑÑ¥Ù•MÕ‰©•Ñ%‘ôÙ¥•ÜõíÙ¥•Ýô½¹Y¥•ÜõíÍ•ÑY¥•Ýô½Á•¸õíµ½‰¥±•9…Ùô½¹±½Í”õì ¤€ôøÍ•Ñ5½‰¥±•9…Ø¡™…±Í”¥ô½¹9•ÝMÕ‰©•Ðõì ¤€ôøÍ•ÑMÕ‰©•Ñ5½‘…°¡ÑÉÕ”¥ôÕÍ•Èõí‘…Í¡‰½…É¹ÕÍ•Éô€¼ø(€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰…ÁÀµµ…¥¸ˆø(€€€€€€€€ñQ½Á‰…ÈÍÕ‰©•ÐõíÍÕ‰©•Ñô½¹5•¹Ôõì ¤€ôøÍ•Ñ5½‰¥±•9…Ø¡ÑÉÕ”¥ô½¹1½½ÕÐõí±½½ÕÑô…¤õí‘…Í¡‰½…É¹…¥ô€¼ø(€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰Á…”µÍÉ½±°ˆø(€€€€€€€€€ì…ÍÕ‰©•Ð€˜˜€ñµÁÑåMÕ‰©•ÑMÑ…Ñ”½¹É•…Ñ”õì ¤€ôøÍ•ÑMÕ‰©•Ñ5½‘…°¡ÑÉÕ”¥ô€¼ùô(€€€€€€€€€íÍÕ‰©•Ð€˜˜Ù¥•Ü€ôôô€Ý½É­ÍÁ…”œ€˜˜€ñ9½Ñ•‰½½­]½É­ÍÁ…”ÍÕ‰©•ÐõíÍÕ‰©•Ñô‘•Ñ…¥°õí‘•Ñ…¥±ô½¹Y¥•ÜõíÍ•ÑY¥•Ýô½¹I•™É•Í õí±½…‘MÕ‰©•ÑôÁÕÍ¡Q½…ÍÐõíÁÕÍ¡Q½…ÍÑô€¼ùô(€€€€€€€€€íÍÕ‰©•Ð€˜˜Ù¥•Ü€ôôô€µ…Àœ€˜˜€ñQ½Á¥5…ÁA…”ÍÕ‰©•ÐõíÍÕ‰©•Ñô‘…Ñ„õíµ…Á…Ñ…ô½¹AÉ…Ñ¥”õì ¤€ôøÍ•ÑY¥•Ü ÁÉ…Ñ¥”œ¥ô€¼ùô(€€€€€€€€€íÍÕ‰©•Ð€˜˜Ù¥•Ü€ôôô€ÁÉ…Ñ¥”œ€˜˜€ñAÉ…Ñ¥•A…”ÍÕ‰©•Ñ%õí…Ñ¥Ù•MÕ‰©•Ñ%‘ôÁÉ…Ñ¥”õíÁÉ…Ñ¥•ôÉ•±½…õí±½…‘MÕ‰©•ÑôÁÕÍ¡Q½…ÍÐõíÁÕÍ¡Q½…ÍÑô€¼ùô(€€€€€€€€€íÍÕ‰©•Ð€˜˜Ù¥•Ü€ôôô€Á±…¹¹•Èœ€˜˜€ñA±…¹¹•ÉA…”ÍÕ‰©•Ñ%õí…Ñ¥Ù•MÕ‰©•Ñ%‘ôÁÕÍ¡Q½…ÍÐõíÁÕÍ¡Q½…ÍÑô€¼ùô(€€€€€€€€€íÍÕ‰©•Ð€˜˜Ù¥•Ü€ôôô€É•Á½ÉÐœ€˜˜€ñI•Á½ÉÑA…”É•Á½ÉÐõíÉ•Á½ÉÑô€¼ùô(€€€€€€€€ð½‘¥Øø(€€€€€€ð½‘¥Øø(€€€€€íÍÕ‰©•Ð€˜˜€ñ¹…Ø±…ÍÍ9…µ”ô‰µ½‰¥±”µÑ…‰‰…Èˆùí9X¹Í±¥” À°€Ô¤¹µ…À ¡¥Ñ•´¤€ôøì½¹ÍÐ%½¸€ô¥Ñ•´¹¥½¸ìÉ•ÑÕÉ¸€ñ‰ÕÑÑ½¸­•äõí¥Ñ•´¹¥‘ô±…ÍÍ9…µ”õíÙ¥•Ü€ôôô¥Ñ•´¹¥€ü€…Ñ¥Ù”œ€è€œô½¹±¥¬õì ¤€ôøÍ•ÑY¥•Ü¡¥Ñ•´¹¥¥ôøñ%½¸Í¥é”õìÄåô€¼øñÍÁ…¸ùí¥Ñ•´¹±…‰•°¹ÍÁ±¥Ð œ€œ¥lÁuôð½ÍÁ…¸øð½‰ÕÑÑ½¸øìô¥ôð½¹…Øùô(€€€€€í‘¥…¹½ÍÑ¥=Á•¸€˜˜ÍÕ‰©•Ð€˜˜€ñ¥…¹½ÍÑ¥5½‘…°ÍÕ‰©•Ñ%õí…Ñ¥Ù•MÕ‰©•Ñ%‘ô½¹±½Í”õì ¤€ôøÍ•Ñ¥…¹½ÍÑ¥=Á•¸¡™…±Í”¥ôÁÕÍ¡Q½…ÍÐõíÁÕÍ¡Q½…ÍÑô€¼ùô(€€€€€íÍÕ‰©•Ñ5½‘…°€˜˜€ñ9•ÝMÕ‰©•Ñ5½‘…°½¹±½Í”õì ¤€ôøÍ•ÑMÕ‰©•Ñ5½‘…°¡™…±Í”¥ô½¹É•…Ñ•õí½¹MÕ‰©•ÑÉ•…Ñ•‘ôÁÕÍ¡Q½…ÍÐõíÁÕÍ¡Q½…ÍÑô€¼ùô(€€€€€íÑ½…ÍÐ€˜˜€ñQ½…ÍÐÑ½…ÍÐõíÑ½…ÍÑô½¹±½Í”õì ¤€ôøÍ•ÑQ½…ÍÐ¡¹Õ±°¥ô€¼ùô(€€€€ð½‘¥Øø(€€¤ì)ô