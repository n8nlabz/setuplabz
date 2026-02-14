import { useState, useEffect, useCallback, useRef } from 'react';
import { api, apiUpload, getToken, setToken, clearToken, connectWebSocket,
  fetchCredentials, fetchMetrics, updateToolImage,
  fetchContainerEnv, updateContainerEnv, fetchContainerLogs,
  systemCleanup, fetchCleanupInfo,
  fetchEnvironments, createEnvironment, destroyEnvironment,
  fetchVapidKey, subscribePush, unsubscribePush, sendTestPush,
  fetchPushPrefs, savePushPrefs, urlBase64ToUint8Array } from './hooks/api.js';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';

// ─── Styles ───
const mono = "'JetBrains Mono', monospace";
const sans = "'Inter', sans-serif";
const colors = {
  bg: '#07080a', surface: 'rgba(255,255,255,0.02)', border: 'rgba(255,255,255,0.06)',
  brand: '#ff6d5a', brandDark: '#ff4444', green: '#22c55e', red: '#ef4444',
  blue: '#0db7ed', purple: '#a78bfa', yellow: '#eab308',
  text: '#fff', textMuted: 'rgba(255,255,255,0.45)', textDim: 'rgba(255,255,255,0.25)',
};

// ─── SVG Logo Components ───
function N8nLogo({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <rect width="40" height="40" rx="10" fill="#ff6d5a"/>
      <text x="20" y="26" textAnchor="middle" fill="white" fontWeight="bold" fontSize="14" fontFamily="monospace">n8n</text>
    </svg>
  );
}

function EvolutionLogo({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <rect width="40" height="40" rx="10" fill="#25d366"/>
      <path d="M20 9C14 9 9 13.6 9 19.2c0 2 .6 3.8 1.7 5.3l-1.1 4.1 4.3-1.1c1.5.9 3.2 1.4 5.1 1.4C26 28.9 31 24.3 31 18.7 31 13.6 26 9 20 9zm0 17.5c-1.5 0-2.9-.4-4.1-1.1l-.3-.2-2.9.8.8-2.8-.2-.3c-.9-1.3-1.4-2.8-1.4-4.4 0-4.3 3.7-7.7 8.1-7.7s8.1 3.4 8.1 7.7c0 4.3-3.7 7.7-8.1 8z" fill="white" opacity="0.95"/>
    </svg>
  );
}

function PortainerLogo({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <rect width="40" height="40" rx="10" fill="#13b5ea"/>
      <rect x="10" y="17" width="8" height="8" rx="2" fill="white"/>
      <rect x="20" y="17" width="8" height="8" rx="2" fill="white" opacity="0.7"/>
      <rect x="10" y="10" width="8" height="5" rx="1.5" fill="white" opacity="0.5"/>
      <rect x="20" y="10" width="8" height="5" rx="1.5" fill="white" opacity="0.35"/>
      <rect x="29" y="17" width="3" height="8" rx="1" fill="white" opacity="0.3"/>
    </svg>
  );
}

function PostgresLogo({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <rect width="40" height="40" rx="10" fill="#336791"/>
      <ellipse cx="20" cy="15" rx="8" ry="5" fill="none" stroke="white" strokeWidth="2"/>
      <path d="M12 15v9c0 2.8 3.6 5 8 5s8-2.2 8-5v-9" fill="none" stroke="white" strokeWidth="2"/>
      <path d="M12 20.5c0 2.5 3.6 4.5 8 4.5s8-2 8-4.5" fill="none" stroke="white" strokeWidth="1.5" opacity="0.4"/>
    </svg>
  );
}

function RedisLogo({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <rect width="40" height="40" rx="10" fill="#dc382d"/>
      <polygon points="20,10 28,16 28,24 20,30 12,24 12,16" fill="none" stroke="white" strokeWidth="2"/>
      <polygon points="20,14 24,17 24,23 20,26 16,23 16,17" fill="white" opacity="0.25"/>
      <circle cx="20" cy="20" r="3" fill="white"/>
    </svg>
  );
}

function TraefikLogo({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <rect width="40" height="40" rx="10" fill="#1a8b8d"/>
      <circle cx="13" cy="13" r="3" fill="white"/>
      <circle cx="27" cy="13" r="3" fill="white" opacity="0.7"/>
      <circle cx="13" cy="27" r="3" fill="white" opacity="0.7"/>
      <circle cx="27" cy="27" r="3" fill="white"/>
      <line x1="16" y1="13" x2="24" y2="13" stroke="white" strokeWidth="1.5" opacity="0.5"/>
      <line x1="13" y1="16" x2="13" y2="24" stroke="white" strokeWidth="1.5" opacity="0.5"/>
      <line x1="27" y1="16" x2="27" y2="24" stroke="white" strokeWidth="1.5" opacity="0.5"/>
      <line x1="16" y1="27" x2="24" y2="27" stroke="white" strokeWidth="1.5" opacity="0.5"/>
      <line x1="15.5" y1="15.5" x2="24.5" y2="24.5" stroke="white" strokeWidth="1.5" opacity="0.3"/>
    </svg>
  );
}

function DockerLogo({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <rect width="40" height="40" rx="10" fill="#2496ed"/>
      <rect x="8" y="20" width="5" height="4" rx="0.8" fill="white"/>
      <rect x="14" y="20" width="5" height="4" rx="0.8" fill="white"/>
      <rect x="20" y="20" width="5" height="4" rx="0.8" fill="white"/>
      <rect x="14" y="15" width="5" height="4" rx="0.8" fill="white" opacity="0.7"/>
      <rect x="20" y="15" width="5" height="4" rx="0.8" fill="white" opacity="0.7"/>
      <rect x="20" y="10" width="5" height="4" rx="0.8" fill="white" opacity="0.5"/>
      <path d="M26 22c2-1 4-0.5 5 0.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
    </svg>
  );
}

function PanelLogo({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <rect width="40" height="40" rx="10" fill="#ff6d5a"/>
      <rect x="9" y="12" width="22" height="16" rx="3" fill="none" stroke="white" strokeWidth="2"/>
      <line x1="9" y1="18" x2="31" y2="18" stroke="white" strokeWidth="1.5" opacity="0.5"/>
      <circle cx="13" cy="15" r="1.2" fill="white" opacity="0.7"/>
      <circle cx="17" cy="15" r="1.2" fill="white" opacity="0.7"/>
      <circle cx="21" cy="15" r="1.2" fill="white" opacity="0.7"/>
    </svg>
  );
}

function ToolLogo({ toolId, size = 40 }) {
  const logos = { n8n: N8nLogo, evolution: EvolutionLogo, portainer: PortainerLogo, postgres: PostgresLogo, redis: RedisLogo, traefik: TraefikLogo, docker: DockerLogo, panel: PanelLogo };
  const Comp = logos[toolId];
  if (Comp) return <Comp size={size} />;
  return (
    <div style={{ width: size, height: size, borderRadius: size / 4, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4, color: colors.textDim }}>?</div>
  );
}

// ─── Educational Helpers ───
function ProgressBar({ value }) {
  const pct = Math.min(Math.max(value || 0, 0), 100);
  const barColor = pct < 60 ? colors.green : pct < 80 ? colors.yellow : colors.red;
  return (
    <div style={{ width: '100%', height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.06)' }}>
      <div style={{ width: pct + '%', height: '100%', borderRadius: 4, background: barColor, transition: 'width 0.5s ease' }} />
    </div>
  );
}

function getResourceText(type, value) {
  if (type === 'cpu') {
    if (value < 30) return 'Seu servidor esta tranquilo. A CPU processa todas as tarefas das suas automacoes. Abaixo de 70% esta tudo bem.';
    if (value < 70) return 'Uso moderado. Suas automacoes estao rodando normalmente.';
    return 'Uso alto! Verifique se ha automacoes travadas ou loops infinitos.';
  }
  if (type === 'ram') {
    if (value < 50) return 'Memoria de sobra! A RAM e usada pelas ferramentas para processar dados. Se passar de 80%, considere fazer upgrade da VPS.';
    if (value < 80) return 'Uso saudavel de memoria. A RAM e usada pelas ferramentas para processar dados.';
    return 'Memoria ficando apertada. Considere fazer upgrade da VPS.';
  }
  if (value < 50) return 'Espaco de sobra no disco! Aqui ficam seus workflows, banco de dados e instancias do WhatsApp.';
  if (value < 80) return 'Disco em uso moderado. Fique de olho.';
  return 'Disco quase cheio! Va em "Limpeza" no menu lateral para liberar espaco.';
}

const TOOLS = [
  {
    id: 'portainer', name: 'Portainer', icon: '🐳', color: colors.blue,
    desc: 'Gerenciamento visual de containers Docker via navegador',
    tooltip: 'O Portainer permite visualizar, criar e gerenciar seus containers, stacks e volumes Docker de forma visual. Ideal para acompanhar deploys e debugar servicos.',
    category: 'Infraestrutura', time: '~2 min',
    fields: [
      { key: 'domain_portainer', label: 'Dominio Portainer', placeholder: 'portainer.seudominio.com' },
      { key: 'admin_password', label: 'Senha Admin', placeholder: 'Gerada automaticamente', type: 'password', autoGenerate: true },
    ],
  },
  {
    id: 'n8n', name: 'n8n', icon: '⚡', color: colors.brand,
    desc: 'Plataforma de automacao com workflows visuais',
    tooltip: 'O n8n permite criar automacoes conectando APIs, bancos de dados e servicos. No modo Simples, roda em 1 container. No modo Avancado (Queue), separa editor, webhook e worker para maior performance.',
    category: 'Automacao', time: '~3 min', hasMode: true,
    modes: {
      simple: {
        label: 'Simples', desc: '1 container (ideal para comecar)',
        fields: [
          { key: 'domain_n8n', label: 'Dominio n8n', placeholder: 'n8n.seudominio.com' },
        ],
      },
      queue: {
        label: 'Avancado (Queue)', desc: 'Editor + Webhook + Worker + Redis',
        fields: [
          { key: 'domain_n8n', label: 'Dominio Editor', placeholder: 'n8n.seudominio.com' },
          { key: 'domain_webhook', label: 'Dominio Webhook', placeholder: 'webhook.seudominio.com' },
          { key: 'smtp_host', label: 'SMTP Host (opcional)', placeholder: 'smtp.gmail.com' },
          { key: 'smtp_port', label: 'SMTP Porta', placeholder: '587' },
          { key: 'smtp_email', label: 'SMTP Email', placeholder: 'seu@email.com' },
          { key: 'smtp_user', label: 'SMTP Usuario', placeholder: 'seu@email.com' },
          { key: 'smtp_pass', label: 'SMTP Senha', placeholder: 'app password', type: 'password' },
        ],
      },
    },
  },
  {
    id: 'evolution', name: 'Evolution API', icon: '📱', color: colors.green,
    desc: 'API para integracao com WhatsApp multi-dispositivo',
    tooltip: 'A Evolution API conecta seu WhatsApp ao n8n e outros servicos. Suporta envio/recebimento de mensagens, gerenciamento de instancias e webhooks automaticos.',
    category: 'Comunicacao', time: '~2 min',
    fields: [
      { key: 'domain_evolution', label: 'Dominio Evolution', placeholder: 'evolution.seudominio.com' },
      { key: 'evolution_key', label: 'API Key (opcional)', placeholder: 'Gerada automaticamente' },
    ],
  },
];

// ─── Shared Components ───
function StatusBadge({ status }) {
  const ok = status === 'running';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 20,
      background: ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
      border: `1px solid ${ok ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
      fontSize: 11, fontWeight: 600, fontFamily: mono, color: ok ? colors.green : colors.red,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: ok ? colors.green : colors.red, animation: ok ? 'pulse 2s infinite' : 'none' }} />
      {ok ? 'Running' : 'Stopped'}
    </span>
  );
}

function Spinner({ size = 14, color = colors.brand }) {
  return <span style={{ display: 'inline-block', width: size, height: size, border: `2px solid ${color}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />;
}

function Btn({ children, onClick, variant = 'primary', disabled, loading, style: s }) {
  const styles = {
    primary: { bg: `linear-gradient(135deg, ${colors.brand}, ${colors.brandDark})`, color: '#fff', border: 'none', shadow: '0 4px 20px rgba(255,68,68,0.2)' },
    ghost: { bg: 'rgba(255,255,255,0.03)', color: colors.textMuted, border: `1px solid ${colors.border}`, shadow: 'none' },
    danger: { bg: 'rgba(239,68,68,0.1)', color: colors.red, border: `1px solid rgba(239,68,68,0.2)`, shadow: 'none' },
    success: { bg: 'rgba(34,197,94,0.1)', color: colors.green, border: `1px solid rgba(34,197,94,0.2)`, shadow: 'none' },
  };
  const v = styles[variant];
  return (
    <button onClick={onClick} disabled={disabled || loading} style={{
      padding: '8px 18px', borderRadius: 10, background: v.bg, color: v.color,
      border: v.border, fontSize: 12, fontWeight: 600, fontFamily: mono, cursor: disabled ? 'not-allowed' : 'pointer',
      transition: 'all 0.2s', opacity: disabled ? 0.5 : 1, boxShadow: v.shadow,
      display: 'inline-flex', alignItems: 'center', gap: 8, ...s,
    }}>
      {loading && <Spinner size={12} color={v.color} />}
      {children}
    </button>
  );
}

function Card({ children, style: s, onClick }) {
  return (
    <div onClick={onClick} style={{ borderRadius: 14, border: `1px solid ${colors.border}`, background: colors.surface, ...s }}>
      {children}
    </div>
  );
}

function Terminal({ logs }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [logs]);
  const typeColor = { error: colors.red, success: colors.green, info: colors.brand, default: 'rgba(255,255,255,0.5)' };
  return (
    <Card style={{ padding: 16, fontFamily: mono, fontSize: 12 }}>
      <div ref={ref} style={{ maxHeight: 220, overflowY: 'auto' }}>
        <div style={{ display: 'flex', gap: 5, marginBottom: 12 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#ff5f57' }} />
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#ffbd2e' }} />
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#28c840' }} />
        </div>
        {logs.map((l, i) => (
          <div key={i} style={{ color: typeColor[l.type] || typeColor.default, marginBottom: 3, lineHeight: 1.7 }}>
            <span style={{ color: 'rgba(255,255,255,0.15)', marginRight: 8 }}>{l.time}</span>{l.text}
          </div>
        ))}
        <span style={{ color: 'rgba(255,255,255,0.2)', animation: 'pulse 1s infinite' }}>█</span>
      </div>
    </Card>
  );
}

function Tooltip({ text, children }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <div style={{
          position: 'absolute', bottom: '120%', left: '50%', transform: 'translateX(-50%)',
          background: '#1a1a2e', border: `1px solid ${colors.border}`, borderRadius: 10,
          padding: '10px 14px', fontSize: 11, color: colors.textMuted, lineHeight: 1.6,
          width: 260, zIndex: 100, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          {text}
        </div>
      )}
    </span>
  );
}

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={copy} style={{
      padding: '3px 8px', borderRadius: 6, border: `1px solid ${colors.border}`,
      background: copied ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.03)',
      color: copied ? colors.green : colors.textMuted, fontSize: 10, fontFamily: mono,
      cursor: 'pointer', transition: 'all 0.2s',
    }}>
      {copied ? 'Copiado!' : 'Copiar'}
    </button>
  );
}

// ─── Modal Overlay ───
function ModalOverlay({ children, onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      {children}
    </div>
  );
}

// ─── Login Page ───
function LoginPage({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) { setLoading(false); return; }
    api('/auth/check').then((d) => {
      if (d.valid) onLogin();
      else { clearToken(); setLoading(false); }
    }).catch(() => { clearToken(); setLoading(false); });
  }, []);

  const handleLogin = async () => {
    if (!email || !password) { setError('Preencha email e senha'); return; }
    setError('');
    setSubmitting(true);
    try {
      const d = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      if (d.token) { setToken(d.token); onLogin(); }
      else setError('Credenciais invalidas');
    } catch (e) { setError(e.message); }
    setSubmitting(false);
  };

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spinner size={32} /></div>;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: colors.bg }}>
      <div style={{ width: 400, padding: 40 }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 32, fontWeight: 800, fontFamily: mono, background: `linear-gradient(135deg, ${colors.brand}, ${colors.brandDark})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            N8N LABZ
          </div>
          <div style={{ fontSize: 11, color: colors.textDim, fontFamily: mono, letterSpacing: '0.15em', marginTop: 6 }}>
            SETUP PANEL v2.8
          </div>
        </div>

        <Card style={{ padding: 28 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Acesso ao Painel</h3>
          <p style={{ fontSize: 13, color: colors.textMuted, marginBottom: 20 }}>
            Entre com seu email e senha de administrador.
          </p>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@email.com" type="email"
            style={{ width: '100%', padding: '12px 16px', borderRadius: 10, border: `1px solid ${colors.border}`, background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: 14, fontFamily: mono, outline: 'none', marginBottom: 12, boxSizing: 'border-box' }}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()} />
          <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Senha" type="password"
            style={{ width: '100%', padding: '12px 16px', borderRadius: 10, border: `1px solid ${colors.border}`, background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: 14, fontFamily: mono, outline: 'none', marginBottom: 16, boxSizing: 'border-box' }}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()} />
          <Btn onClick={handleLogin} loading={submitting} disabled={submitting} style={{ width: '100%', padding: '14px', justifyContent: 'center' }}>
            Entrar
          </Btn>
          {error && <p style={{ color: colors.red, fontSize: 12, marginTop: 12, textAlign: 'center' }}>{error}</p>}
        </Card>
      </div>
    </div>
  );
}

// ─── Dashboard Page ───
function DashboardPage() {
  const [sysInfo, setSysInfo] = useState(null);
  const [installed, setInstalled] = useState([]);
  const [containers, setContainers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [metricsData, setMetricsData] = useState({ realtime: [], disk: [] });
  const [creds, setCreds] = useState(null);
  const [versionModal, setVersionModal] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [sys, status, cData] = await Promise.all([
        api('/system/info'),
        api('/install/status'),
        api('/containers'),
      ]);
      setSysInfo(sys);
      setInstalled(status.installed || []);
      setContainers(cData.containers || []);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); const i = setInterval(refresh, 15000); return () => clearInterval(i); }, [refresh]);

  useEffect(() => {
    fetchMetrics().then((data) => {
      setMetricsData({
        realtime: data.realtime || [],
        disk: (data.disk || []).map((d) => ({
          ...d,
          percentageNum: typeof d.percentage === 'string' ? parseFloat(d.percentage.replace('%', '')) : (d.percentage || 0),
        })),
      });
    }).catch(() => {});
  }, []);

  useEffect(() => {
    fetchCredentials().then(setCreds).catch(() => {});
  }, []);

  const parseBase = (name) => { const d = name.indexOf('.'); return d > 0 ? name.slice(0, d) : name; };

  const getMainContainers = (toolId) => {
    return containers.filter((c) => {
      const base = parseBase(c.name).toLowerCase();
      if (toolId === 'portainer') return base.startsWith('portainer_');
      if (toolId === 'n8n') return base.startsWith('n8n_') && !base.includes('n8nlabz');
      if (toolId === 'evolution') return base.startsWith('evolution_');
      return false;
    });
  };

  const restartTool = async (toolId) => {
    setActionLoading(toolId);
    try {
      const toolContainers = getMainContainers(toolId).filter((c) => c.state === 'running');
      for (const c of toolContainers) {
        await api(`/containers/${c.id}/restart`, { method: 'POST' });
      }
      await refresh();
    } catch {}
    setActionLoading(null);
  };

  if (loading) return <div style={{ padding: 60, textAlign: 'center' }}><Spinner size={28} /></div>;

  const running = containers.filter((c) => c.state === 'running').length;
  const ramPerc = sysInfo ? Math.round((sysInfo.ram_used_mb / sysInfo.ram_total_mb) * 100) : 0;
  const cpuPerc = metricsData.realtime.length > 0 ? metricsData.realtime[metricsData.realtime.length - 1].cpu : 0;
  const diskPerc = sysInfo ? parseFloat(String(sysInfo.disk_percentage || '0').replace('%', '')) : 0;

  const getTimeGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Bom dia!';
    if (h < 18) return 'Boa tarde!';
    return 'Boa noite!';
  };

  const getStatusMessage = () => {
    if (installed.length === 0) return 'Visao geral do seu servidor. Instale suas ferramentas para comecar.';
    const statuses = installed.map((toolId) => {
      const tc = getMainContainers(toolId);
      return { toolId, anyRunning: tc.some((c) => c.state === 'running') };
    });
    if (statuses.every((s) => s.anyRunning)) return 'Tudo funcionando normalmente. Seus servicos estao online.';
    if (statuses.every((s) => !s.anyRunning)) return 'Atencao: nenhum servico esta respondendo. Verifique o monitoramento.';
    const down = statuses.filter((s) => !s.anyRunning).map((s) => TOOLS.find((t) => t.id === s.toolId)?.name || s.toolId);
    return `Atencao: ${down.join(', ')} ${down.length === 1 ? 'esta parado' : 'estao parados'}.`;
  };

  const toolDescs = { n8n: 'Plataforma de automacao de workflows', evolution: 'API para integracao com WhatsApp', portainer: 'Gerenciamento visual de containers' };

  const chartTooltipStyle = {
    contentStyle: { background: '#1a1a2e', border: `1px solid ${colors.border}`, borderRadius: 8, fontFamily: mono, fontSize: 11 },
    labelStyle: { color: colors.textMuted },
  };

  return (
    <div style={{ animation: 'fadeUp 0.4s ease-out' }}>
      {/* Greeting */}
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 6 }}>{getTimeGreeting()} <span role="img">&#128075;</span></h1>
      <p style={{ fontSize: 14, color: colors.textMuted, marginBottom: 28 }}>{getStatusMessage()}</p>

      {/* Health Cards */}
      <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 28 }}>
        {/* CPU */}
        <Card style={{ padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <span style={{ fontSize: 20 }}>&#128187;</span>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Processador (CPU)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 28, fontWeight: 700, fontFamily: mono, color: cpuPerc < 60 ? colors.green : cpuPerc < 80 ? colors.yellow : colors.red }}>{cpuPerc}%</span>
          </div>
          <ProgressBar value={cpuPerc} />
          <p style={{ fontSize: 12, color: colors.textMuted, lineHeight: 1.6, marginTop: 12, marginBottom: 0 }}>
            {getResourceText('cpu', cpuPerc)}
          </p>
        </Card>

        {/* RAM */}
        <Card style={{ padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <span style={{ fontSize: 20 }}>&#129504;</span>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Memoria RAM</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 28, fontWeight: 700, fontFamily: mono, color: ramPerc < 60 ? colors.green : ramPerc < 80 ? colors.yellow : colors.red }}>{ramPerc}%</span>
            <span style={{ fontSize: 11, color: colors.textDim, fontFamily: mono }}>{sysInfo ? sysInfo.ram_used_mb + '/' + sysInfo.ram_total_mb + ' MB' : ''}</span>
          </div>
          <ProgressBar value={ramPerc} />
          <p style={{ fontSize: 12, color: colors.textMuted, lineHeight: 1.6, marginTop: 12, marginBottom: 0 }}>
            {getResourceText('ram', ramPerc)}
          </p>
        </Card>

        {/* Disk */}
        <Card style={{ padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <span style={{ fontSize: 20 }}>&#128190;</span>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Armazenamento (Disco)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 28, fontWeight: 700, fontFamily: mono, color: diskPerc < 60 ? colors.green : diskPerc < 80 ? colors.yellow : colors.red }}>{diskPerc}%</span>
            <span style={{ fontSize: 11, color: colors.textDim, fontFamily: mono }}>{sysInfo ? sysInfo.disk_used + '/' + sysInfo.disk_total : ''}</span>
          </div>
          <ProgressBar value={diskPerc} />
          <p style={{ fontSize: 12, color: colors.textMuted, lineHeight: 1.6, marginTop: 12, marginBottom: 0 }}>
            {getResourceText('disk', diskPerc)}
          </p>
        </Card>
      </div>

      {/* Charts with side explanations */}
      <div className="grid-73" style={{ display: 'grid', gridTemplateColumns: '7fr 3fr', gap: 14, marginBottom: 28 }}>
        <Card style={{ padding: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, fontFamily: mono, color: colors.textMuted, marginBottom: 16 }}>CPU & RAM (ultima hora)</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={metricsData.realtime}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: colors.textDim, fontFamily: mono }} stroke="rgba(255,255,255,0.06)" />
              <YAxis tick={{ fontSize: 10, fill: colors.textDim, fontFamily: mono }} stroke="rgba(255,255,255,0.06)" unit="%" />
              <RechartsTooltip {...chartTooltipStyle} />
              <Line type="monotone" dataKey="cpu" stroke={colors.brand} strokeWidth={2} dot={false} name="CPU" />
              <Line type="monotone" dataKey="ram" stroke={colors.purple} strokeWidth={2} dot={false} name="RAM" />
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card style={{ padding: 20, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>&#128200; O que e isso?</div>
          <p style={{ fontSize: 12, color: colors.textMuted, lineHeight: 1.7, marginBottom: 8 }}>
            Este grafico mostra o uso do processador (laranja) e memoria (roxo) na ultima hora.
          </p>
          <p style={{ fontSize: 12, color: colors.textMuted, lineHeight: 1.7, marginBottom: 12 }}>
            Se a linha subir muito, pode indicar que uma automacao esta consumindo muitos recursos.
          </p>
          <div style={{ fontSize: 11, color: colors.yellow, lineHeight: 1.6 }}>
            &#128161; Dica: Automacoes com muitos dados podem causar picos temporarios. Isso e normal.
          </div>
        </Card>
      </div>

      <div className="grid-73" style={{ display: 'grid', gridTemplateColumns: '7fr 3fr', gap: 14, marginBottom: 28 }}>
        <Card style={{ padding: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, fontFamily: mono, color: colors.textMuted, marginBottom: 16 }}>Uso de disco (30 dias)</div>
          {metricsData.disk.length === 0 ? (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 28, opacity: 0.3 }}>&#128202;</div>
              <div style={{ fontSize: 12, color: colors.textDim, fontFamily: mono, textAlign: 'center' }}>Dados de disco serao coletados nas proximas horas.</div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={metricsData.disk}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: colors.textDim, fontFamily: mono }} stroke="rgba(255,255,255,0.06)" />
                <YAxis tick={{ fontSize: 10, fill: colors.textDim, fontFamily: mono }} stroke="rgba(255,255,255,0.06)" unit="%" />
                <RechartsTooltip {...chartTooltipStyle} />
                <Area type="monotone" dataKey="percentageNum" stroke={colors.yellow} fill={colors.yellow + '20'} strokeWidth={2} name="Disco %" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>
        <Card style={{ padding: 20, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>&#128200; O que e isso?</div>
          <p style={{ fontSize: 12, color: colors.textMuted, lineHeight: 1.7, marginBottom: 8 }}>
            Mostra quanto do seu disco esta sendo usado ao longo dos dias.
          </p>
          <p style={{ fontSize: 12, color: colors.textMuted, lineHeight: 1.7, marginBottom: 12 }}>
            Se crescer rapido, va em "Limpeza" no menu lateral para liberar espaco.
          </p>
          <div style={{ fontSize: 11, color: colors.yellow, lineHeight: 1.6 }}>
            &#128161; Dica: Faca limpeza mensal para manter o servidor saudavel.
          </div>
        </Card>
      </div>

      {/* Installed Tools */}
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 14 }}>Ferramentas Instaladas</h2>
      {installed.length === 0 ? (
        <Card style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ marginBottom: 14 }}><ToolLogo toolId="n8n" size={48} /></div>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Bem-vindo ao N8N LABZ!</h3>
          <p style={{ fontSize: 13, color: colors.textMuted, lineHeight: 1.6 }}>
            Nenhuma ferramenta instalada ainda. Va para a aba <strong>Instalar</strong> para comecar.
          </p>
        </Card>
      ) : (
        <div className="grid-auto" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
          {installed.map((toolId) => {
            const tool = TOOLS.find((t) => t.id === toolId);
            if (!tool) return null;
            const toolContainers = getMainContainers(toolId);
            const anyRunning = toolContainers.some((c) => c.state === 'running');
            const mainContainer = toolContainers.find((c) => {
              const n = c.name.toLowerCase();
              return !n.includes('redis') && !n.includes('agent');
            }) || toolContainers[0];
            const version = mainContainer ? (mainContainer.image.split(':').pop() || 'latest') : '---';
            const toolCreds = creds?.[toolId];
            const openUrl = toolCreds?.editor_url || toolCreds?.url || toolCreds?.base_url || (toolCreds?.domain ? 'https://' + toolCreds.domain : null);

            return (
              <Card key={toolId} style={{ padding: 22, borderColor: tool.color + '20' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                  <ToolLogo toolId={toolId} size={48} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 16, fontWeight: 700, fontFamily: mono, color: tool.color }}>{tool.name}</span>
                      <StatusBadge status={anyRunning ? 'running' : 'stopped'} />
                    </div>
                    <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>{toolDescs[toolId] || tool.desc}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: 11, fontFamily: mono, color: colors.textDim, marginBottom: 14 }}>
                  <span>Versao: {version}</span>
                  <span>{toolContainers.length} container{toolContainers.length !== 1 ? 's' : ''} {anyRunning ? 'ativos' : ''}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {openUrl && (
                    <a href={openUrl} target="_blank" rel="noopener noreferrer" style={{
                      padding: '7px 16px', borderRadius: 10, fontSize: 11, fontWeight: 600, fontFamily: mono,
                      background: tool.color + '12', color: tool.color, border: `1px solid ${tool.color}25`,
                      textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6,
                    }}>
                      &#128279; Abrir {tool.name}
                    </a>
                  )}
                  <Btn variant="ghost" onClick={() => restartTool(toolId)} loading={actionLoading === toolId} style={{ padding: '7px 16px', fontSize: 11 }}>
                    &#128260; Reiniciar
                  </Btn>
                  <Btn variant="ghost" onClick={() => setVersionModal(toolId)} style={{ padding: '7px 16px', fontSize: 11 }}>
                    &#128230; Versao
                  </Btn>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Push Notifications */}
      <PushNotificationCard />

      {versionModal && (
        <VersionModal
          toolId={versionModal}
          toolName={TOOLS.find((t) => t.id === versionModal)?.name || versionModal}
          onClose={() => setVersionModal(null)}
        />
      )}
    </div>
  );
}

// ─── Install Page ───
function InstallPage() {
  const [installed, setInstalled] = useState([]);
  const [formData, setFormData] = useState({});
  const [installing, setInstalling] = useState(null);
  const [logs, setLogs] = useState([{ time: '--:--:--', text: 'N8N LABZ Setup pronto.', type: 'info' }]);
  const [domainBase, setDomainBase] = useState(null);
  const [modal, setModal] = useState(null);
  const [n8nMode, setN8nMode] = useState('simple');
  const [resultCreds, setResultCreds] = useState(null);

  useEffect(() => {
    api('/install/status').then((d) => setInstalled(d.installed || [])).catch(() => {});
    api('/install/suggestions').then((suggestions) => {
      if (suggestions && suggestions.domain_n8n) {
        setDomainBase(true);
        setFormData((prev) => {
          const merged = { ...prev };
          Object.keys(suggestions).forEach((key) => {
            if (!merged[key]) merged[key] = suggestions[key];
          });
          return merged;
        });
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const cleanup = connectWebSocket((msg) => {
      if (msg.type === 'install_log') {
        addLog(msg.text, msg.logType || 'info');
      }
    });
    return cleanup;
  }, []);

  const addLog = (text, type = 'default') => {
    setLogs((p) => [...p, { text, type, time: new Date().toLocaleTimeString('pt-BR', { hour12: false }).slice(0, 8) }]);
  };

  const openModal = (tool) => {
    setModal(tool);
    setResultCreds(null);
  };

  const install = async () => {
    if (!modal) return;
    const tool = modal;
    setInstalling(tool.id);
    setModal(null);
    addLog(`Instalando ${tool.name}...`, 'info');

    try {
      const config = { ...formData };
      if (tool.hasMode) config.n8n_mode = n8nMode;

      const result = await api(`/install/${tool.id}`, { method: 'POST', body: JSON.stringify(config) });
      if (result.logs) result.logs.forEach((l) => addLog(l.text, l.type));
      if (result.success) {
        setInstalled((p) => [...p, tool.id]);
        addLog(`${tool.name} instalado com sucesso!`, 'success');
        if (result.credentials) setResultCreds({ tool: tool.name, ...result.credentials });
      } else {
        addLog(`Falha: ${result.error}`, 'error');
      }
    } catch (e) {
      addLog(`Erro: ${e.message}`, 'error');
    }
    setInstalling(null);
  };

  const uninstall = async (toolId) => {
    if (!confirm('Tem certeza que deseja desinstalar? Os dados serao perdidos.')) return;
    addLog(`Desinstalando ${toolId}...`, 'info');
    try {
      await api(`/install/${toolId}`, { method: 'DELETE' });
      setInstalled((p) => p.filter((x) => x !== toolId));
      addLog(`${toolId} desinstalado.`, 'success');
    } catch (e) {
      addLog(`Erro: ${e.message}`, 'error');
    }
  };

  const getFields = (tool) => {
    if (tool.hasMode) {
      return tool.modes[n8nMode]?.fields || [];
    }
    return tool.fields || [];
  };

  return (
    <div style={{ animation: 'fadeUp 0.4s ease-out' }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 6 }}>Instalar Ferramentas</h1>
      <p style={{ fontSize: 14, color: colors.textMuted, marginBottom: 28 }}>
        Clique em uma ferramenta para configurar e instalar.
        {domainBase && <span style={{ display: 'block', fontSize: 11, color: colors.green, marginTop: 6, fontFamily: mono }}>Subdominios pre-preenchidos com base no seu dominio.</span>}
      </p>

      {/* Tool Cards */}
      <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 28 }}>
        {TOOLS.map((tool) => {
          const isInstalled = installed.includes(tool.id);
          const isInstalling = installing === tool.id;
          return (
            <Card key={tool.id} onClick={() => !isInstalling && openModal(tool)}
              style={{
                padding: 22, cursor: isInstalling ? 'wait' : 'pointer', position: 'relative',
                opacity: isInstalling ? 0.7 : 1, transition: 'all 0.2s',
                borderColor: isInstalled ? colors.green + '30' : isInstalling ? tool.color + '40' : colors.border,
                background: isInstalled ? 'rgba(34,197,94,0.03)' : colors.surface,
              }}>
              {isInstalled && <div style={{ position: 'absolute', top: 12, right: 14, fontSize: 10, fontFamily: mono, color: colors.green, fontWeight: 600 }}>Instalado</div>}
              {isInstalling && <div style={{ position: 'absolute', top: 12, right: 14 }}><Spinner size={14} color={tool.color} /></div>}
              <div style={{ marginBottom: 14 }}>
                <ToolLogo toolId={tool.id} size={48} />
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, fontFamily: mono, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                {tool.name}
                {tool.tooltip && (
                  <Tooltip text={tool.tooltip}>
                    <span style={{ fontSize: 12, color: colors.textDim, cursor: 'help' }}>?</span>
                  </Tooltip>
                )}
              </div>
              <div style={{ fontSize: 12, color: colors.textDim, lineHeight: 1.5 }}>{tool.desc}</div>
              <div style={{ fontSize: 10, color: colors.textDim, fontFamily: mono, marginTop: 8 }}>{tool.time}</div>
              {isInstalling && (
                <div style={{ marginTop: 12, width: '100%', height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.04)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: tool.color, borderRadius: 2, animation: 'progressBar 3s ease-in-out infinite' }} />
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Config Modal */}
      {modal && (
        <ModalOverlay onClose={() => setModal(null)}>
          <Card style={{ width: 480, padding: 28, background: '#0d0e12', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22 }}>
              <ToolLogo toolId={modal.id} size={48} />
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>
                  {installed.includes(modal.id) ? 'Gerenciar' : 'Instalar'} {modal.name}
                </div>
                <div style={{ fontSize: 12, color: colors.textMuted }}>{modal.desc}</div>
              </div>
            </div>

            {installed.includes(modal.id) ? (
              <div>
                <p style={{ fontSize: 13, color: colors.textMuted, marginBottom: 16 }}>Esta ferramenta ja esta instalada.</p>
                <div style={{ display: 'flex', gap: 10 }}>
                  <Btn variant="danger" onClick={() => { uninstall(modal.id); setModal(null); }}>Desinstalar</Btn>
                  <Btn variant="ghost" onClick={() => setModal(null)}>Fechar</Btn>
                </div>
              </div>
            ) : (
              <>
                {modal.hasMode && (
                  <div style={{ marginBottom: 20 }}>
                    <label style={{ fontSize: 9, fontWeight: 600, color: colors.textDim, fontFamily: mono, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Modo de instalacao</label>
                    <div className="grid-modal-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      {Object.entries(modal.modes).map(([key, mode]) => (
                        <div key={key} onClick={() => setN8nMode(key)} style={{
                          padding: '12px 14px', borderRadius: 10, cursor: 'pointer', transition: 'all 0.2s',
                          border: `1px solid ${n8nMode === key ? modal.color + '50' : colors.border}`,
                          background: n8nMode === key ? modal.color + '08' : 'transparent',
                        }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: n8nMode === key ? '#fff' : colors.textMuted, fontFamily: mono }}>{mode.label}</div>
                          <div style={{ fontSize: 11, color: colors.textDim, marginTop: 2 }}>{mode.desc}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid-modal-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 22 }}>
                  {getFields(modal).map((f) => (
                    <div key={f.key} style={{ gridColumn: f.key === 'smtp_host' || f.key === 'smtp_email' ? 'span 1' : undefined }}>
                      <label style={{ fontSize: 9, fontWeight: 600, color: colors.textDim, fontFamily: mono, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>{f.label}</label>
                      <input type={f.type || 'text'} placeholder={f.placeholder} value={formData[f.key] || ''}
                        onChange={(e) => setFormData((p) => ({ ...p, [f.key]: e.target.value }))}
                        style={{ width: '100%', padding: '9px 13px', borderRadius: 9, border: `1px solid rgba(255,255,255,0.07)`, background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: 13, fontFamily: mono, outline: 'none', boxSizing: 'border-box' }}
                        onFocus={(e) => e.target.style.borderColor = modal.color + '50'}
                        onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.07)'} />
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <Btn onClick={install} style={{ flex: 1, justifyContent: 'center' }}>Instalar {modal.name}</Btn>
                  <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
                </div>
              </>
            )}
          </Card>
        </ModalOverlay>
      )}

      {/* Post-install Credentials */}
      {resultCreds && (
        <ModalOverlay onClose={() => setResultCreds(null)}>
          <Card style={{ width: 480, padding: 28, background: '#0d0e12' }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6, color: colors.green }}>Instalacao concluida!</h3>
            <p style={{ fontSize: 12, color: colors.textMuted, marginBottom: 20 }}>Credenciais do {resultCreds.tool}:</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {Object.entries(resultCreds).filter(([k]) => k !== 'tool').map(([key, val]) => (
                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: `1px solid ${colors.border}` }}>
                  <div>
                    <span style={{ fontSize: 10, color: colors.textDim, fontFamily: mono, textTransform: 'uppercase' }}>{key.replace(/_/g, ' ')}</span>
                    <div style={{ fontSize: 13, fontFamily: mono, color: '#fff', wordBreak: 'break-all' }}>{typeof val === 'object' ? JSON.stringify(val) : String(val)}</div>
                  </div>
                  <CopyBtn text={typeof val === 'object' ? JSON.stringify(val) : String(val)} />
                </div>
              ))}
            </div>
            <Btn variant="ghost" onClick={() => setResultCreds(null)} style={{ width: '100%', justifyContent: 'center' }}>Fechar</Btn>
          </Card>
        </ModalOverlay>
      )}

      {/* Terminal */}
      <Terminal logs={logs} />
    </div>
  );
}

// ─── Log Modal ───
function LogModal({ containerId, containerName, onClose }) {
  const [logs, setLogs] = useState('');
  const [loading, setLoading] = useState(true);
  const ref = useRef(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchContainerLogs(containerId);
      setLogs(data.logs || '');
    } catch (e) {
      setLogs('Erro ao carregar logs: ' + e.message);
    }
    setLoading(false);
  }, [containerId]);

  useEffect(() => { loadLogs(); }, [loadLogs]);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [logs]);

  return (
    <ModalOverlay onClose={onClose}>
      <Card style={{ width: 700, padding: 24, background: '#0d0e12', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>Logs</h3>
            <span style={{ fontSize: 11, color: colors.textDim, fontFamily: mono }}>{containerName}</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="ghost" onClick={loadLogs} loading={loading} style={{ padding: '5px 12px', fontSize: 10 }}>Atualizar</Btn>
            <Btn variant="ghost" onClick={onClose} style={{ padding: '5px 12px', fontSize: 10 }}>Fechar</Btn>
          </div>
        </div>
        <Card style={{ padding: 14, flex: 1 }}>
          <div style={{ display: 'flex', gap: 5, marginBottom: 10 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#ff5f57' }} />
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#ffbd2e' }} />
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#28c840' }} />
          </div>
          {loading ? (
            <div style={{ padding: 20, textAlign: 'center' }}><Spinner size={18} /></div>
          ) : (
            <div ref={ref} style={{ maxHeight: 400, overflowY: 'auto', fontFamily: mono, fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {logs || 'Nenhum log encontrado.'}
            </div>
          )}
        </Card>
      </Card>
    </ModalOverlay>
  );
}

// ─── Env Modal ───
function EnvModal({ serviceId, containerName, onClose }) {
  const [envVars, setEnvVars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const envTooltips = {
    'GENERIC_TIMEZONE': 'Fuso horario. Padrao: America/Sao_Paulo',
    'EXECUTIONS_MODE': "Modo de execucao. 'queue' usa Redis e e mais performatico",
    'N8N_COMMUNITY_PACKAGES_ENABLED': 'Permite instalar nodes da comunidade',
    'N8N_AI_ENABLED': 'Habilita recursos de IA no n8n',
    'DB_POSTGRESDB_HOST': 'Endereco do servidor PostgreSQL',
    'N8N_ENCRYPTION_KEY': 'Chave de criptografia dos dados. NAO altere!',
  };

  useEffect(() => {
    setLoading(true);
    fetchContainerEnv(serviceId).then((data) => {
      const vars = data.env || [];
      setEnvVars(vars);
      const vals = {};
      vars.forEach((v) => { vals[v.key] = v.value; });
      setEditValues(vals);
    }).catch(() => {
      setEnvVars([]);
    }).finally(() => setLoading(false));
  }, [serviceId]);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const changed = {};
      envVars.forEach((v) => {
        if (editValues[v.key] !== v.value) {
          changed[v.key] = editValues[v.key];
        }
      });
      if (Object.keys(changed).length === 0) {
        setMsg({ type: 'info', text: 'Nenhuma alteracao detectada.' });
        setSaving(false);
        return;
      }
      await updateContainerEnv(serviceId, changed);
      setMsg({ type: 'success', text: 'Variaveis atualizadas com sucesso! O container sera reiniciado.' });
      setEditing(false);
    } catch (e) {
      setMsg({ type: 'error', text: 'Erro: ' + e.message });
    }
    setSaving(false);
  };

  return (
    <ModalOverlay onClose={onClose}>
      <Card style={{ width: 650, padding: 24, background: '#0d0e12', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>Variaveis de Ambiente</h3>
            <span style={{ fontSize: 11, color: colors.textDim, fontFamily: mono }}>{containerName}</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {!editing ? (
              <Btn variant="ghost" onClick={() => setEditing(true)} style={{ padding: '5px 12px', fontSize: 10 }}>Editar</Btn>
            ) : (
              <>
                <Btn variant="success" onClick={save} loading={saving} style={{ padding: '5px 12px', fontSize: 10 }}>Salvar</Btn>
                <Btn variant="ghost" onClick={() => setEditing(false)} style={{ padding: '5px 12px', fontSize: 10 }}>Cancelar</Btn>
              </>
            )}
            <Btn variant="ghost" onClick={onClose} style={{ padding: '5px 12px', fontSize: 10 }}>Fechar</Btn>
          </div>
        </div>

        {msg && (
          <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 12, background: msg.type === 'success' ? 'rgba(34,197,94,0.1)' : msg.type === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(255,109,90,0.05)', border: `1px solid ${msg.type === 'success' ? 'rgba(34,197,94,0.2)' : msg.type === 'error' ? 'rgba(239,68,68,0.2)' : 'rgba(255,109,90,0.15)'}`, color: msg.type === 'success' ? colors.green : msg.type === 'error' ? colors.red : colors.brand, fontSize: 12, fontFamily: mono }}>
            {msg.text}
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', maxHeight: 500 }}>
          {loading ? (
            <div style={{ padding: 30, textAlign: 'center' }}><Spinner size={18} /></div>
          ) : envVars.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: colors.textDim, fontSize: 13 }}>Nenhuma variavel encontrada.</div>
          ) : (
            envVars.map((v, i) => (
              <div key={v.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: `1px solid rgba(255,255,255,0.03)`, background: i % 2 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                <div style={{ flex: '0 0 200px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 10, color: colors.textDim, fontFamily: mono, textTransform: 'uppercase', wordBreak: 'break-all' }}>{v.key}</span>
                  {envTooltips[v.key] && (
                    <Tooltip text={envTooltips[v.key]}>
                      <span style={{ fontSize: 10, color: colors.textDim, cursor: 'help' }}>?</span>
                    </Tooltip>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {editing ? (
                    <input value={editValues[v.key] || ''} onChange={(e) => setEditValues((p) => ({ ...p, [v.key]: e.target.value }))}
                      style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: `1px solid rgba(255,255,255,0.07)`, background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: 11, fontFamily: mono, outline: 'none', boxSizing: 'border-box' }} />
                  ) : (
                    <span style={{ fontSize: 11, fontFamily: mono, color: '#fff', wordBreak: 'break-all' }}>{v.value}</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </ModalOverlay>
  );
}

// ─── Version Modal ───
function VersionModal({ toolId, toolName, onClose }) {
  const [version, setVersion] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const update = async () => {
    if (!version.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const data = await updateToolImage(toolId, version.trim());
      setResult({ type: 'success', text: data.message || `Imagem atualizada para versao ${version}. Os containers serao recriados.` });
    } catch (e) {
      setResult({ type: 'error', text: 'Erro: ' + e.message });
    }
    setLoading(false);
  };

  return (
    <ModalOverlay onClose={onClose}>
      <Card style={{ width: 440, padding: 24, background: '#0d0e12' }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Atualizar Versao</h3>
        <p style={{ fontSize: 12, color: colors.textMuted, marginBottom: 20, fontFamily: mono }}>{toolName}</p>

        <label style={{ fontSize: 9, fontWeight: 600, color: colors.textDim, fontFamily: mono, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Versao da imagem</label>
        <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder='Ex: 1.94.1 ou latest'
          style={{ width: '100%', padding: '10px 14px', borderRadius: 9, border: `1px solid rgba(255,255,255,0.07)`, background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: 13, fontFamily: mono, outline: 'none', marginBottom: 16, boxSizing: 'border-box' }}
          onKeyDown={(e) => e.key === 'Enter' && update()} />

        {result && (
          <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 14, background: result.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${result.type === 'success' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`, color: result.type === 'success' ? colors.green : colors.red, fontSize: 12, fontFamily: mono }}>
            {result.text}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <Btn onClick={update} loading={loading} disabled={!version.trim()} style={{ flex: 1, justifyContent: 'center' }}>Atualizar</Btn>
          <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
        </div>
      </Card>
    </ModalOverlay>
  );
}

// ─── Monitor Page ───
function MonitorPage() {
  const [containers, setContainers] = useState([]);
  const [sysInfo, setSysInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [logModal, setLogModal] = useState(null);
  const [envModal, setEnvModal] = useState(null);
  const [versionModal, setVersionModal] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [cData, sData] = await Promise.all([api('/containers'), api('/system/info')]);
      setContainers(cData.containers || []);
      setSysInfo(sData);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); const i = setInterval(refresh, 10000); return () => clearInterval(i); }, [refresh]);

  const action = async (id, act) => {
    setActionLoading(`${id}_${act}`);
    try { await api(`/containers/${id}/${act}`, { method: 'POST' }); await refresh(); } catch {}
    setActionLoading(null);
  };

  // ── Helpers ──
  const parseBase = (name) => { const d = name.indexOf('.'); return d > 0 ? name.slice(0, d) : name; };

  // Main stack prefixes
  const mainPrefixes = ['n8n_', 'evolution_', 'portainer_', 'postgres_', 'traefik_', 'panel_', 'n8nlabz'];

  const getToolGroup = (name) => {
    const b = parseBase(name).toLowerCase();
    if (b.includes('n8nlabz') || b === 'panel') return 'panel';
    // Check if it belongs to a main stack
    if (b.startsWith('n8n_')) return 'n8n';
    if (b.startsWith('evolution_')) return 'evolution';
    if (b.startsWith('portainer_')) return 'portainer';
    if (b.startsWith('postgres_')) return 'postgres';
    if (b.startsWith('traefik_')) return 'traefik';
    // If not a main stack prefix, it's a test env or other
    const isMainStack = mainPrefixes.some((p) => b.startsWith(p));
    if (!isMainStack) return 'env';
    return 'other';
  };

  const getFriendly = (name, group) => {
    const b = parseBase(name).toLowerCase();
    if (group === 'n8n') { if (b.includes('editor')) return 'Editor'; if (b.includes('webhook')) return 'Webhook'; if (b.includes('worker')) return 'Worker'; if (b.includes('redis')) return 'Redis'; return 'n8n'; }
    if (group === 'evolution') { if (b.includes('redis')) return 'Redis'; return 'API'; }
    if (group === 'portainer') { if (b.includes('agent')) return 'Agent'; return 'Portainer'; }
    if (group === 'postgres') return 'PostgreSQL';
    if (group === 'traefik') return 'Traefik';
    if (group === 'panel') return 'Painel';
    if (group === 'env') return parseBase(name);
    return parseBase(name);
  };

  const parseUptime = (status) => {
    if (!status) return null;
    const m = status.match(/Up\s+(.+)/i);
    if (!m) return null;
    const raw = m[1].replace(/\s*\(.*\)/, '').trim();
    return 'Online ha ' + raw
      .replace(/About an hour/, '~1 hora')
      .replace(/About a minute/, '~1 minuto')
      .replace(/(\d+)\s*seconds?/, '$1 segundos')
      .replace(/(\d+)\s*minutes?/, '$1 minutos')
      .replace(/(\d+)\s*hours?/, '$1 horas')
      .replace(/(\d+)\s*days?/, '$1 dias')
      .replace(/(\d+)\s*weeks?/, '$1 semanas')
      .replace(/(\d+)\s*months?/, '$1 meses');
  };

  const subTooltips = {
    'n8n_Editor': 'O Editor e a interface visual onde voce cria e edita seus workflows. E aqui que voce arrasta os nos e configura suas automacoes.',
    'n8n_Webhook': 'O Webhook recebe chamadas externas (como mensagens do WhatsApp) e dispara seus workflows automaticamente.',
    'n8n_Worker': 'O Worker e o "motor" que executa suas automacoes em segundo plano. Quanto mais automacoes rodando, mais o Worker trabalha.',
    'n8n_Redis': 'O Redis e um banco de dados ultra-rapido que organiza a fila de execucao. Ele decide qual automacao roda primeiro.',
    'n8n_n8n': 'Servico principal do n8n no modo simples. Aqui rodam o editor, webhook e execucoes em um unico container.',
    'evolution_API': 'A API da Evolution e o que conecta seu servidor ao WhatsApp. Cada instancia conectada aparece aqui.',
    'evolution_Redis': 'Cache de sessoes e dados do WhatsApp. Mantem as conexoes ativas e rapidas.',
    'portainer_Portainer': 'O Portainer e a interface visual para gerenciar seus containers Docker. O painel N8N LABZ ja faz isso por voce!',
    'portainer_Agent': 'O Agent coleta informacoes dos containers e envia para o Portainer visualizar.',
    'postgres_PostgreSQL': 'O PostgreSQL e o banco de dados principal. Aqui ficam salvos todos os seus workflows, credenciais e dados das automacoes.',
    'traefik_Traefik': 'O Traefik e o proxy reverso que gerencia seus dominios e certificados SSL automaticamente. Ele direciona o trafego para cada ferramenta.',
    'panel_Painel': 'Este painel de controle (N8N LABZ Setup Panel). E daqui que voce gerencia tudo!',
  };

  const toolDefs = {
    n8n: { name: 'n8n', color: colors.brand, desc: 'Plataforma de automacao', managed: true },
    evolution: { name: 'Evolution API', color: colors.green, desc: 'API para WhatsApp', managed: true },
    portainer: { name: 'Portainer', color: colors.blue, desc: 'Gerenciamento Docker', managed: true },
    postgres: { name: 'PostgreSQL', color: colors.purple, desc: 'Banco de dados principal', managed: false },
    traefik: { name: 'Traefik', color: colors.yellow, desc: 'Proxy reverso e SSL', managed: false },
    panel: { name: 'Setup Panel', color: colors.brand, desc: 'Painel de controle', managed: false },
    env: { name: 'Ambientes de Teste', color: colors.textMuted, desc: 'Containers de ambientes de teste', managed: false },
    other: { name: 'Outros', color: colors.textMuted, desc: '', managed: false },
  };

  // ── Group containers by tool ──
  const toolGroups = {};
  containers.forEach((c) => {
    const g = getToolGroup(c.name);
    if (!toolGroups[g]) toolGroups[g] = [];
    toolGroups[g].push(c);
  });

  const groupOrder = ['n8n', 'evolution', 'portainer', 'postgres', 'traefik', 'panel', 'env', 'other'];
  const visibleGroups = Object.entries(toolGroups)
    .filter(([g, items]) => {
      if (!showAdvanced && g === 'panel') return false;
      if (!showAdvanced && g === 'env') return false;
      if (!showAdvanced && items.every((c) => c.state !== 'running')) return false;
      return true;
    })
    .sort((a, b) => groupOrder.indexOf(a[0]) - groupOrder.indexOf(b[0]));

  const running = containers.filter((c) => c.state === 'running').length;

  if (loading) return <div style={{ padding: 60, textAlign: 'center' }}><Spinner size={28} /></div>;

  return (
    <div style={{ animation: 'fadeUp 0.4s ease-out' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 6 }}>Monitoramento</h1>
          <p style={{ fontSize: 14, color: colors.textMuted }}>Status em tempo real dos seus servicos. Atualizacao a cada 10s.</p>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: colors.textMuted, fontFamily: mono, whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={showAdvanced} onChange={(e) => setShowAdvanced(e.target.checked)} style={{ accentColor: colors.brand }} />
          Mostrar detalhes avancados
        </label>
      </div>

      {/* Stats with educational descriptions */}
      <div className="grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
        {[
          { label: 'Containers', value: containers.length, color: colors.blue, edu: 'Cada ferramenta roda dentro de um "container" isolado no servidor.' },
          { label: 'Ativos', value: running, color: colors.green, edu: running === containers.length ? 'Todos os seus containers estao funcionando normalmente.' : 'Alguns containers estao parados. Verifique abaixo.' },
          { label: 'RAM VPS', value: sysInfo ? `${sysInfo.ram_used_mb}/${sysInfo.ram_total_mb} MB` : '---', color: colors.brand, edu: 'Memoria usada por todas as ferramentas. Mais ferramentas = mais RAM.' },
          { label: 'Disco', value: sysInfo?.disk_percentage || '---', color: colors.purple, edu: 'Espaco usado por workflows, banco de dados e instancias.' },
        ].map((s, i) => (
          <Card key={i} style={{ padding: 18 }}>
            <div style={{ fontSize: 9, color: colors.textDim, fontFamily: mono, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, fontFamily: mono, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: colors.textDim, marginTop: 8, lineHeight: 1.5 }}>{s.edu}</div>
          </Card>
        ))}
      </div>

      {/* Tool Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {visibleGroups.map(([group, items]) => {
          const def = toolDefs[group] || toolDefs.other;
          const someRunning = items.some((c) => c.state === 'running');
          const mainContainer = items.find((c) => {
            const fn = getFriendly(c.name, group);
            return fn !== 'Redis' && fn !== 'Agent';
          }) || items[0];
          const version = mainContainer ? (mainContainer.image.split(':').pop() || 'latest') : '---';

          // Deduplicate by friendly name when advanced is off (Bug 3)
          let displayItems;
          if (showAdvanced) {
            displayItems = items;
          } else {
            const running = items.filter((c) => c.state === 'running');
            const seen = new Set();
            displayItems = [];
            for (const c of running) {
              const friendly = getFriendly(c.name, group);
              if (!seen.has(friendly)) {
                seen.add(friendly);
                displayItems.push(c);
              }
            }
          }

          const borderColor = someRunning ? colors.green : colors.red;

          return (
            <Card key={group} style={{ overflow: 'hidden', borderColor: def.color + '20' }}>
              {/* Tool header */}
              <div style={{ padding: '18px 22px', borderBottom: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <ToolLogo toolId={group} size={40} />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 16, fontWeight: 700, fontFamily: mono }}>{def.name}</span>
                      <Tooltip text={someRunning ? 'Servico esta funcionando' : 'Todos os servicos estao parados'}>
                        <StatusBadge status={someRunning ? 'running' : 'stopped'} />
                      </Tooltip>
                    </div>
                    <div style={{ fontSize: 12, color: colors.textDim, marginTop: 2 }}>{def.desc}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Tooltip text="Versao da imagem Docker em uso">
                    <span style={{ fontSize: 11, fontFamily: mono, color: colors.textMuted, padding: '4px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: `1px solid ${colors.border}` }}>
                      {version}
                    </span>
                  </Tooltip>
                  {def.managed && (
                    <Btn variant="ghost" onClick={() => setVersionModal({ id: group, name: def.name })} style={{ padding: '6px 12px', fontSize: 11 }}>
                      Alterar versao
                    </Btn>
                  )}
                </div>
              </div>

              {/* Sub-container mini-cards */}
              <div style={{ padding: 18 }}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                  {displayItems.map((c) => {
                    const friendly = getFriendly(c.name, group);
                    const isRunning = c.state === 'running';
                    const ramVal = c.ram ? c.ram.split('/')[0].trim() : '---';
                    const cpuVal = c.cpu || '---';
                    const uptime = parseUptime(c.status);
                    const leftColor = isRunning ? colors.green : colors.red;
                    return (
                      <Tooltip key={c.id} text={subTooltips[group + '_' + friendly] || ('Container do servico ' + friendly)}>
                        <div style={{
                          padding: '12px 16px', borderRadius: 10, minWidth: 120,
                          border: `1px solid ${isRunning ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'}`,
                          background: isRunning ? 'rgba(34,197,94,0.03)' : 'rgba(239,68,68,0.03)',
                          borderLeft: `3px solid ${leftColor}`,
                        }}>
                          <div style={{ fontWeight: 600, fontSize: 13, fontFamily: mono, color: '#fff', marginBottom: 8 }}>{friendly}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <Tooltip text={isRunning ? 'Este container esta funcionando normalmente.' : 'Este container esta parado. Clique em "Iniciar" para liga-lo.'}>
                              <span style={{ width: 7, height: 7, borderRadius: '50%', background: isRunning ? colors.green : colors.red, display: 'inline-block', animation: isRunning ? 'pulse 2s infinite' : 'none' }} />
                            </Tooltip>
                            <Tooltip text={'CPU: quanto do processador este container esta usando. Abaixo de 50% e normal. Valores muito altos podem indicar automacao travada ou loop.'}>
                              <span style={{ fontSize: 11, fontFamily: mono, color: colors.textMuted }}>{cpuVal}</span>
                            </Tooltip>
                          </div>
                          <Tooltip text={'RAM: memoria que este container esta consumindo. Valores entre 100-500MB sao normais. Se passar de 800MB, pode indicar uso excessivo.'}>
                            <div style={{ fontSize: 11, fontFamily: mono, color: colors.textDim }}>{ramVal}</div>
                          </Tooltip>
                          {uptime && (
                            <div style={{ fontSize: 10, fontFamily: mono, color: colors.textDim, marginTop: 6, opacity: 0.7 }}>{uptime}</div>
                          )}
                        </div>
                      </Tooltip>
                    );
                  })}
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Btn variant="ghost" onClick={() => { items.filter((c) => c.state === 'running').forEach((c) => action(c.id, 'restart')); }}
                    loading={items.some((c) => actionLoading === `${c.id}_restart`)} style={{ fontSize: 11 }}>
                    Reiniciar
                  </Btn>
                  <Btn variant="danger" onClick={() => { items.filter((c) => c.state === 'running').forEach((c) => action(c.id, 'stop')); }}
                    loading={items.some((c) => actionLoading === `${c.id}_stop`)} style={{ fontSize: 11 }}>
                    Parar
                  </Btn>
                  {!items.every((c) => c.state === 'running') && (
                    <Btn variant="success" onClick={() => { items.filter((c) => c.state !== 'running').forEach((c) => action(c.id, 'start')); }}
                      loading={items.some((c) => actionLoading === `${c.id}_start`)} style={{ fontSize: 11 }}>
                      Iniciar
                    </Btn>
                  )}
                  <Btn variant="ghost" onClick={() => setLogModal({ id: (mainContainer || items[0]).id, name: def.name })} style={{ fontSize: 11 }}>
                    Ver Logs
                  </Btn>
                  {def.managed && (
                    <Btn variant="ghost" onClick={() => setEnvModal({ id: (mainContainer || items[0]).service_id || (mainContainer || items[0]).id, name: def.name })} style={{ fontSize: 11 }}>
                      Variaveis
                    </Btn>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {containers.length === 0 && (
        <Card style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ color: colors.textDim, fontSize: 14 }}>Nenhum container encontrado</div>
        </Card>
      )}

      {/* Modals */}
      {logModal && <LogModal containerId={logModal.id} containerName={logModal.name} onClose={() => setLogModal(null)} />}
      {envModal && <EnvModal serviceId={envModal.id} containerName={envModal.name} onClose={() => setEnvModal(null)} />}
      {versionModal && <VersionModal toolId={versionModal.id} toolName={versionModal.name} onClose={() => setVersionModal(null)} />}
    </div>
  );
}

// ─── Credentials Page ───
function CredentialsPage() {
  const [creds, setCreds] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPass, setShowPass] = useState({});

  useEffect(() => {
    fetchCredentials()
      .then((data) => { setCreds(data); setLoading(false); })
      .catch(() => { setCreds({}); setLoading(false); });
  }, []);

  const togglePass = (key) => setShowPass((p) => ({ ...p, [key]: !p[key] }));

  const sensitiveKeys = ['password', 'api_key', 'encryption_key', 'db_password', 'smtp_pass'];
  const isSensitive = (key) => sensitiveKeys.some((s) => key.toLowerCase().includes(s));

  const toolColorMap = { portainer: colors.blue, n8n: colors.brand, evolution: colors.green, postgres: colors.purple };

  if (loading) return <div style={{ padding: 60, textAlign: 'center' }}><Spinner size={28} /></div>;

  const toolEntries = creds ? Object.entries(creds) : [];

  return (
    <div style={{ animation: 'fadeUp 0.4s ease-out' }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 6 }}>Credenciais</h1>
      <p style={{ fontSize: 14, color: colors.textMuted, marginBottom: 28 }}>Senhas, chaves e URLs das ferramentas instaladas.</p>

      {toolEntries.length === 0 ? (
        <Card style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 14 }}>🔐</div>
          <p style={{ fontSize: 13, color: colors.textMuted }}>Nenhuma credencial encontrada. Instale uma ferramenta primeiro.</p>
        </Card>
      ) : (
        <div className="grid-auto" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 18 }}>
          {toolEntries.map(([toolId, data]) => {
            const tool = TOOLS.find((t) => t.id === toolId) || { name: toolId, color: toolColorMap[toolId] || colors.textMuted };
            const cardColor = toolColorMap[toolId] || colors.textMuted;
            const entries = Object.entries(data).filter(([k]) => k !== 'installed_at');
            const openUrl = data.editor_url || data.url || data.base_url || (data.domain ? 'https://' + data.domain : null);

            return (
              <Card key={toolId} style={{ overflow: 'hidden' }}>
                {/* Colored top border */}
                <div style={{ height: 3, background: cardColor }} />
                <div style={{ padding: '16px 20px', borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: cardColor + '08' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <ToolLogo toolId={toolId} size={38} />
                    <span style={{ fontSize: 15, fontWeight: 700, fontFamily: mono }}>{tool.name || toolId}</span>
                  </div>
                  {openUrl && (
                    <a href={openUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: cardColor, fontFamily: mono, textDecoration: 'none', fontWeight: 600 }}>
                      Abrir →
                    </a>
                  )}
                </div>
                <div style={{ padding: '4px 0' }}>
                  {entries.map(([key, val]) => {
                    const valStr = typeof val === 'object' ? JSON.stringify(val) : String(val);
                    const sensitive = isSensitive(key);
                    const uid = toolId + '_' + key;
                    return (
                      <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 20px', borderBottom: `1px solid rgba(255,255,255,0.02)` }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 10, color: colors.textDim, fontFamily: mono, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{key.replace(/_/g, ' ')}</div>
                          <div style={{ fontSize: 13, fontFamily: mono, color: '#fff', wordBreak: 'break-all', marginTop: 2 }}>
                            {sensitive && !showPass[uid] ? '••••••••••••' : valStr}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, marginLeft: 12, flexShrink: 0 }}>
                          {sensitive && (
                            <button onClick={() => togglePass(uid)} style={{
                              padding: '3px 8px', borderRadius: 6, border: `1px solid ${colors.border}`,
                              background: 'rgba(255,255,255,0.03)', color: colors.textMuted, fontSize: 10,
                              fontFamily: mono, cursor: 'pointer',
                            }}>
                              {showPass[uid] ? 'Ocultar' : 'Mostrar'}
                            </button>
                          )}
                          <CopyBtn text={valStr} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                {data.installed_at && (
                  <div style={{ padding: '10px 20px', borderTop: `1px solid ${colors.border}`, background: 'rgba(255,255,255,0.01)' }}>
                    <span style={{ fontSize: 10, color: colors.textDim, fontFamily: mono }}>Instalado em {new Date(data.installed_at).toLocaleDateString('pt-BR')}</span>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Backup Page ───
function BackupPage() {
  const [backups, setBackups] = useState([]);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [msg, setMsg] = useState(null);
  const [wsStatus, setWsStatus] = useState(null);
  const fileRef = useRef(null);

  const refresh = useCallback(async () => {
    try { const d = await api('/backup'); setBackups(d.backups || []); } catch {}
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const cleanup = connectWebSocket((msg) => {
      if (msg.type === 'backup' || msg.type === 'restore') {
        setWsStatus(msg);
        if (msg.status === 'completed') {
          refresh();
          setCreating(false);
          setRestoring(false);
        }
        if (msg.status === 'error') {
          setCreating(false);
          setRestoring(false);
        }
      }
    });
    return cleanup;
  }, [refresh]);

  const create = async () => {
    setCreating(true); setMsg(null); setWsStatus(null);
    try {
      const d = await api('/backup/create', { method: 'POST' });
      setMsg({ type: 'success', text: `Backup criado: ${d.filename} (${d.sizeFormatted})` });
      refresh();
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
    setCreating(false);
  };

  const restore = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm('Tem certeza? Isso ira substituir os dados atuais pelo backup.')) { e.target.value = ''; return; }
    setRestoring(true); setMsg(null); setWsStatus(null);
    try {
      const d = await apiUpload('/backup/restore', file);
      setMsg({ type: 'success', text: d.message || 'Backup restaurado!' });
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
    setRestoring(false);
    e.target.value = '';
  };

  const download = (filename) => {
    const token = getToken();
    window.open(`/api/backup/download/${filename}?token=${token}`, '_blank');
  };

  const del = async (filename) => {
    if (!confirm('Deletar este backup?')) return;
    try { await api(`/backup/${filename}`, { method: 'DELETE' }); refresh(); } catch {}
  };

  return (
    <div style={{ animation: 'fadeUp 0.4s ease-out' }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 6 }}>Backup & Restore</h1>
      <p style={{ fontSize: 14, color: colors.textMuted, marginBottom: 12 }}>
        Copias de seguranca automaticas e manuais do seu servidor.
      </p>

      <Card style={{ padding: '18px 22px', marginBottom: 20, background: 'rgba(34,197,94,0.03)', borderColor: 'rgba(34,197,94,0.1)' }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: colors.text }}>O que e salvo no backup:</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
          {[
            'Todos os seus workflows e automacoes do n8n',
            'Instancias e configuracoes do WhatsApp (Evolution)',
            'Banco de dados completo (PostgreSQL)',
            'Suas credenciais e configuracoes do painel',
          ].map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: colors.textMuted, fontFamily: mono }}>
              <span style={{ color: colors.green }}>&#10003;</span> {item}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: colors.textMuted, fontFamily: mono, paddingTop: 10, borderTop: `1px solid ${colors.border}` }}>
          <span>&#9200;</span> Backup automatico todo dia as 03:00 (horario de Brasilia). Mantem os 7 mais recentes.
        </div>
      </Card>

      {msg && (
        <div style={{ padding: '12px 18px', borderRadius: 10, marginBottom: 20, background: msg.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${msg.type === 'success' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`, color: msg.type === 'success' ? colors.green : colors.red, fontSize: 13, fontFamily: mono }}>
          {msg.text}
        </div>
      )}

      {wsStatus && wsStatus.step && (
        <div style={{ padding: '10px 18px', borderRadius: 10, marginBottom: 20, background: 'rgba(255,109,90,0.05)', border: `1px solid rgba(255,109,90,0.15)`, fontSize: 12, fontFamily: mono, color: colors.brand, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Spinner size={12} color={colors.brand} />
          {wsStatus.step}
        </div>
      )}

      <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 28 }}>
        <Card style={{ padding: 26 }}>
          <div style={{ fontSize: 36, marginBottom: 14 }}>📦</div>
          <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 6 }}>Criar Backup</h3>
          <p style={{ fontSize: 12, color: colors.textMuted, marginBottom: 18, lineHeight: 1.6 }}>Salva uma copia de seguranca de tudo. Recomendado antes de atualizar versoes.</p>
          <Btn onClick={create} loading={creating} disabled={creating}>Gerar Backup</Btn>
        </Card>

        <Card style={{ padding: 26 }}>
          <div style={{ fontSize: 36, marginBottom: 14 }}>🔄</div>
          <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 6 }}>Restaurar Backup</h3>
          <p style={{ fontSize: 12, color: colors.textMuted, marginBottom: 18, lineHeight: 1.6 }}>Importa de um arquivo .tar.gz</p>
          <input type="file" ref={fileRef} accept=".tar.gz,.tgz" onChange={restore} style={{ display: 'none' }} />
          <Btn variant="success" onClick={() => fileRef.current?.click()} loading={restoring} disabled={restoring}>Enviar Backup</Btn>
        </Card>
      </div>

      <Card>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${colors.border}` }}>
          <span style={{ fontSize: 13, fontWeight: 600, fontFamily: mono, color: colors.textMuted }}>Historico ({backups.length}/7)</span>
        </div>
        {backups.map((b, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderBottom: `1px solid rgba(255,255,255,0.03)` }}>
            <div>
              <div style={{ fontSize: 13, fontFamily: mono, color: '#fff' }}>{b.filename}</div>
              <div style={{ fontSize: 11, color: colors.textDim }}>{b.sizeFormatted} · {new Date(b.date).toLocaleString('pt-BR')}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn variant="ghost" onClick={() => download(b.filename)} style={{ padding: '5px 12px', fontSize: 10 }}>Download</Btn>
              <Btn variant="danger" onClick={() => del(b.filename)} style={{ padding: '5px 12px', fontSize: 10 }}>Deletar</Btn>
            </div>
          </div>
        ))}
        {backups.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: colors.textDim, fontSize: 13 }}>Nenhum backup encontrado</div>}
      </Card>
    </div>
  );
}

// ─── Environments Page ───
function EnvironmentsPage() {
  const [environments, setEnvironments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newEnvName, setNewEnvName] = useState('');
  const [newEnvTools, setNewEnvTools] = useState({ n8n: true, evolution: false });
  const [creating, setCreating] = useState(false);
  const [destroying, setDestroying] = useState(null);
  const [msg, setMsg] = useState(null);
  const [domainBase, setDomainBase] = useState('');
  const [showPass, setShowPass] = useState({});

  const refresh = useCallback(async () => {
    try {
      const data = await fetchEnvironments();
      setEnvironments(data.environments || []);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    api('/install/suggestions').then((s) => {
      if (s && s.domain_n8n) {
        const parts = s.domain_n8n.split('.');
        if (parts.length > 2) setDomainBase(parts.slice(1).join('.'));
        else if (parts.length === 2) setDomainBase(s.domain_n8n);
      }
    }).catch(() => {});
  }, []);

  const handleCreate = async () => {
    if (!newEnvName.trim()) return;
    setCreating(true);
    setMsg(null);
    try {
      const tools = Object.entries(newEnvTools).filter(([, v]) => v).map(([k]) => k);
      await createEnvironment(newEnvName.trim(), tools);
      setMsg({ type: 'success', text: `Ambiente "${newEnvName.trim()}" criado com sucesso!` });
      setShowCreateModal(false);
      setNewEnvName('');
      setNewEnvTools({ n8n: true, evolution: false });
      refresh();
    } catch (e) {
      setMsg({ type: 'error', text: 'Erro: ' + e.message });
    }
    setCreating(false);
  };

  const handleDestroy = async (name) => {
    if (!confirm(`Tem certeza que deseja destruir o ambiente "${name}"? Todos os dados serao perdidos.`)) return;
    setDestroying(name);
    setMsg(null);
    try {
      await destroyEnvironment(name);
      setMsg({ type: 'success', text: `Ambiente "${name}" destruido com sucesso.` });
      refresh();
    } catch (e) {
      setMsg({ type: 'error', text: 'Erro: ' + e.message });
    }
    setDestroying(null);
  };

  if (loading) return <div style={{ padding: 60, textAlign: 'center' }}><Spinner size={28} /></div>;

  return (
    <div style={{ animation: 'fadeUp 0.4s ease-out' }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 6 }}>Ambientes de Teste</h1>
      <p style={{ fontSize: 14, color: colors.textMuted, marginBottom: 28 }}>Crie ambientes isolados para testar automacoes antes de colocar em producao.</p>

      {/* Warning */}
      <Card style={{ padding: '14px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(234,179,8,0.04)', borderColor: 'rgba(234,179,8,0.15)' }}>
        <span style={{ fontSize: 16 }}>⚠️</span>
        <span style={{ fontSize: 12, color: colors.yellow, fontFamily: mono }}>Cada ambiente consome recursos adicionais (RAM, CPU, disco). Use com moderacao.</span>
      </Card>

      {msg && (
        <div style={{ padding: '12px 18px', borderRadius: 10, marginBottom: 20, background: msg.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${msg.type === 'success' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`, color: msg.type === 'success' ? colors.green : colors.red, fontSize: 13, fontFamily: mono }}>
          {msg.text}
        </div>
      )}

      <div style={{ marginBottom: 24 }}>
        <Btn onClick={() => setShowCreateModal(true)}>Criar ambiente</Btn>
      </div>

      {/* Environments list */}
      {environments.length === 0 ? (
        <Card style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 14 }}>🧪</div>
          <p style={{ fontSize: 13, color: colors.textMuted }}>Nenhum ambiente de teste criado ainda.</p>
        </Card>
      ) : (
        <div className="grid-auto" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: 14 }}>
          {environments.map((env) => {
            const stacks = env.stacks || [];
            const hasN8n = stacks.some((s) => s.includes('_n8n'));
            const hasEvolution = stacks.some((s) => s.includes('_evolution'));
            const urls = [];
            if (hasN8n && domainBase) urls.push({ label: 'n8n', url: `https://${env.name}-n8n.${domainBase}` });
            if (hasEvolution && domainBase) urls.push({ label: 'Evolution', url: `https://${env.name}-evolution.${domainBase}` });

            return (
              <Card key={env.name} style={{ overflow: 'hidden' }}>
                <div style={{ padding: '18px 22px', borderBottom: `1px solid ${colors.border}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, fontFamily: mono, marginBottom: 4 }}>{env.name}</div>
                      <StatusBadge status={env.status === 'running' ? 'running' : 'stopped'} />
                    </div>
                    <Btn variant="danger" onClick={() => handleDestroy(env.name)} loading={destroying === env.name} style={{ padding: '5px 12px', fontSize: 10 }}>
                      Destruir ambiente
                    </Btn>
                  </div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 11, color: colors.textDim, fontFamily: mono, marginTop: 8 }}>
                    {env.created_at && <span>Criado em {new Date(env.created_at).toLocaleDateString('pt-BR')}</span>}
                    {env.containers_total !== undefined && <span>{env.containers_running || 0}/{env.containers_total} containers ativos</span>}
                  </div>
                </div>

                {/* URLs */}
                {urls.length > 0 && (
                  <div style={{ padding: '14px 22px', borderBottom: `1px solid ${colors.border}` }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: colors.textMuted, fontFamily: mono, marginBottom: 8 }}>Links de acesso:</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {urls.map((u) => (
                        <div key={u.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 11, color: colors.textDim, fontFamily: mono, minWidth: 70 }}>{u.label}:</span>
                          <a href={u.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontFamily: mono, color: colors.brand, textDecoration: 'none' }}>
                            {u.url}
                          </a>
                          <CopyBtn text={u.url} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tools info */}
                <div style={{ padding: '12px 22px' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: colors.textMuted, fontFamily: mono, marginBottom: 6 }}>Ferramentas:</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {hasN8n && (
                      <span style={{ padding: '3px 10px', borderRadius: 8, fontSize: 11, fontFamily: mono, background: colors.brand + '12', color: colors.brand, border: `1px solid ${colors.brand}25`, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <ToolLogo toolId="n8n" size={16} /> n8n
                      </span>
                    )}
                    {hasEvolution && (
                      <span style={{ padding: '3px 10px', borderRadius: 8, fontSize: 11, fontFamily: mono, background: colors.green + '12', color: colors.green, border: `1px solid ${colors.green}25`, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <ToolLogo toolId="evolution" size={16} /> Evolution
                      </span>
                    )}
                    <span style={{ padding: '3px 10px', borderRadius: 8, fontSize: 11, fontFamily: mono, background: colors.purple + '12', color: colors.purple, border: `1px solid ${colors.purple}25`, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <ToolLogo toolId="postgres" size={16} /> PostgreSQL
                    </span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <ModalOverlay onClose={() => setShowCreateModal(false)}>
          <Card style={{ width: 440, padding: 28, background: '#0d0e12' }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Criar Ambiente de Teste</h3>
            <p style={{ fontSize: 12, color: colors.textMuted, marginBottom: 20 }}>Configure o nome e as ferramentas que deseja incluir.</p>

            <label style={{ fontSize: 9, fontWeight: 600, color: colors.textDim, fontFamily: mono, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Nome do ambiente</label>
            <input value={newEnvName} onChange={(e) => setNewEnvName(e.target.value)} placeholder='Ex: teste, staging'
              style={{ width: '100%', padding: '10px 14px', borderRadius: 9, border: `1px solid rgba(255,255,255,0.07)`, background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: 13, fontFamily: mono, outline: 'none', marginBottom: 18, boxSizing: 'border-box' }} />

            <label style={{ fontSize: 9, fontWeight: 600, color: colors.textDim, fontFamily: mono, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 10 }}>Ferramentas</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 22 }}>
              {[
                { id: 'n8n', label: 'n8n' },
                { id: 'evolution', label: 'Evolution API' },
              ].map((t) => (
                <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, border: `1px solid ${newEnvTools[t.id] ? colors.brand + '40' : colors.border}`, background: newEnvTools[t.id] ? colors.brand + '08' : 'transparent', cursor: 'pointer', transition: 'all 0.2s' }}>
                  <input type="checkbox" checked={newEnvTools[t.id]} onChange={(e) => setNewEnvTools((p) => ({ ...p, [t.id]: e.target.checked }))}
                    style={{ accentColor: colors.brand }} />
                  <ToolLogo toolId={t.id} size={28} />
                  <span style={{ fontSize: 13, fontFamily: mono, color: newEnvTools[t.id] ? '#fff' : colors.textMuted }}>{t.label}</span>
                </label>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <Btn onClick={handleCreate} loading={creating} disabled={!newEnvName.trim()} style={{ flex: 1, justifyContent: 'center' }}>Criar</Btn>
              <Btn variant="ghost" onClick={() => setShowCreateModal(false)}>Cancelar</Btn>
            </div>
          </Card>
        </ModalOverlay>
      )}
    </div>
  );
}

// ─── Cleanup Page ───
function CleanupPage() {
  const [cleanupInfo, setCleanupInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cleaningType, setCleaningType] = useState(null);
  const [results, setResults] = useState({});

  const refresh = useCallback(async () => {
    try {
      const data = await fetchCleanupInfo();
      setCleanupInfo(data);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleCleanup = async (type) => {
    if (type === 'all' && !confirm('Tem certeza que deseja executar uma limpeza completa? Isso remover imagens, containers parados, volumes orfaos e cache.')) return;
    setCleaningType(type);
    setResults((p) => ({ ...p, [type]: null }));
    try {
      const data = await systemCleanup(type);
      setResults((p) => ({ ...p, [type]: { type: 'success', text: data.message || 'Limpeza concluida!', spaceFreed: data.spaceFreed } }));
      refresh();
    } catch (e) {
      setResults((p) => ({ ...p, [type]: { type: 'error', text: 'Erro: ' + e.message } }));
    }
    setCleaningType(null);
  };

  if (loading) return <div style={{ padding: 60, textAlign: 'center' }}><Spinner size={28} /></div>;

  const cleanupItems = [
    { type: 'images', label: 'Imagens nao utilizadas', icon: '📦', color: colors.blue, count: cleanupInfo?.dangling_images, desc: 'Imagens Docker sem referencia que ocupam espaco desnecessario.' },
    { type: 'containers', label: 'Containers parados', icon: '🛑', color: colors.red, count: cleanupInfo?.stopped_containers, desc: 'Containers que nao estao em execucao e podem ser removidos.' },
    { type: 'volumes', label: 'Volumes orfaos', icon: '💿', color: colors.purple, count: cleanupInfo?.dangling_volumes, desc: 'Volumes Docker sem nenhum container associado.' },
    { type: 'build', label: 'Cache de build', icon: '🔨', color: colors.yellow, count: null, desc: 'Cache utilizado durante a construcao de imagens Docker.' },
  ];

  return (
    <div style={{ animation: 'fadeUp 0.4s ease-out' }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 6 }}>Limpeza do Sistema</h1>
      <p style={{ fontSize: 14, color: colors.textMuted, marginBottom: 28 }}>Remova recursos Docker nao utilizados para liberar espaco no disco.</p>

      <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginBottom: 28 }}>
        {cleanupItems.map((item) => (
          <Card key={item.type} style={{ padding: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div style={{ width: 42, height: 42, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, background: item.color + '12', border: `1px solid ${item.color}25` }}>
                {item.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, fontFamily: mono }}>{item.label}</div>
                {item.count !== null && item.count !== undefined && (
                  <div style={{ fontSize: 20, fontWeight: 700, fontFamily: mono, color: item.color }}>{item.count}</div>
                )}
              </div>
            </div>
            <p style={{ fontSize: 11, color: colors.textDim, lineHeight: 1.6, marginBottom: 14 }}>{item.desc}</p>
            {results[item.type] && (
              <div style={{ padding: '8px 12px', borderRadius: 8, marginBottom: 12, background: results[item.type].type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${results[item.type].type === 'success' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`, color: results[item.type].type === 'success' ? colors.green : colors.red, fontSize: 11, fontFamily: mono }}>
                {results[item.type].text}
                {results[item.type].spaceFreed && <span style={{ display: 'block', marginTop: 4 }}>Espaco liberado: {results[item.type].spaceFreed}</span>}
              </div>
            )}
            <Btn variant="ghost" onClick={() => handleCleanup(item.type)} loading={cleaningType === item.type} disabled={cleaningType !== null} style={{ fontSize: 11 }}>
              Limpar
            </Btn>
          </Card>
        ))}
      </div>

      {/* Clean all */}
      <Card style={{ padding: 22, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(239,68,68,0.03)', borderColor: 'rgba(239,68,68,0.1)' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, fontFamily: mono, marginBottom: 4 }}>Limpar tudo</div>
          <p style={{ fontSize: 11, color: colors.textDim }}>Executa todas as limpezas acima de uma vez. Use com cautela.</p>
        </div>
        <Btn variant="danger" onClick={() => handleCleanup('all')} loading={cleaningType === 'all'} disabled={cleaningType !== null}>
          Limpar tudo
        </Btn>
      </Card>
      {results['all'] && (
        <div style={{ padding: '10px 18px', borderRadius: 10, marginTop: 14, background: results['all'].type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${results['all'].type === 'success' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`, color: results['all'].type === 'success' ? colors.green : colors.red, fontSize: 12, fontFamily: mono }}>
          {results['all'].text}
          {results['all'].spaceFreed && <span style={{ display: 'block', marginTop: 4 }}>Espaco liberado: {results['all'].spaceFreed}</span>}
        </div>
      )}
    </div>
  );
}

// ─── Push Notification Helper ───
function PushNotificationCard() {
  const [pushStatus, setPushStatus] = useState('unknown'); // unknown, unsupported, denied, subscribed, unsubscribed
  const [loading, setLoading] = useState(false);
  const [testSent, setTestSent] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPushStatus('unsupported');
      return;
    }
    checkSubscription();
  }, []);

  const checkSubscription = async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setPushStatus(sub ? 'subscribed' : 'unsubscribed');
    } catch {
      setPushStatus('unsubscribed');
    }
  };

  const subscribe = async () => {
    setLoading(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setPushStatus('denied');
        setLoading(false);
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const { publicKey } = await fetchVapidKey();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      await subscribePush(sub.toJSON());
      setPushStatus('subscribed');
    } catch (err) {
      console.error('Push subscribe error:', err);
    }
    setLoading(false);
  };

  const unsubscribe = async () => {
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await unsubscribePush(sub.endpoint);
        await sub.unsubscribe();
      }
      setPushStatus('unsubscribed');
    } catch {}
    setLoading(false);
  };

  const sendTest = async () => {
    try {
      await sendTestPush();
      setTestSent(true);
      setTimeout(() => setTestSent(false), 3000);
    } catch {}
  };

  if (pushStatus === 'unsupported') return null;

  return (
    <Card style={{ padding: 22, marginTop: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <span style={{ fontSize: 22 }}>&#128276;</span>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Notificacoes Push</div>
          <div style={{ fontSize: 12, color: colors.textMuted }}>Receba alertas no celular quando algo precisar da sua atencao.</div>
        </div>
      </div>
      {pushStatus === 'denied' && (
        <div style={{ fontSize: 12, color: colors.red, marginBottom: 12, fontFamily: mono }}>
          Notificacoes bloqueadas pelo navegador. Habilite nas configuracoes do browser.
        </div>
      )}
      {pushStatus === 'subscribed' && (
        <div style={{ fontSize: 12, color: colors.green, marginBottom: 12, fontFamily: mono, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>&#10003;</span> Notificacoes ativadas neste dispositivo
        </div>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        {pushStatus === 'subscribed' ? (
          <>
            <Btn variant="ghost" onClick={unsubscribe} loading={loading} style={{ fontSize: 11 }}>Desativar</Btn>
            <Btn variant="ghost" onClick={sendTest} style={{ fontSize: 11 }}>
              {testSent ? 'Enviado!' : 'Enviar teste'}
            </Btn>
          </>
        ) : (
          <Btn onClick={subscribe} loading={loading} style={{ fontSize: 12 }}>Ativar notificacoes</Btn>
        )}
      </div>
    </Card>
  );
}

// ─── Settings Page ───
function SettingsPage() {
  const [prefs, setPrefs] = useState({ service_down: true, high_resource: true, backup_reminder: true, new_version: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchPushPrefs()
      .then((data) => { setPrefs(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const togglePref = (key) => {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      await savePushPrefs(prefs);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
    setSaving(false);
  };

  if (loading) return <div style={{ padding: 60, textAlign: 'center' }}><Spinner size={28} /></div>;

  const alertOptions = [
    { key: 'service_down', label: 'Servicos offline', desc: 'Alerta quando n8n, Evolution ou Portainer cair.' },
    { key: 'high_resource', label: 'Uso alto de recursos', desc: 'Alerta quando CPU > 80%, RAM > 80% ou Disco > 90%.' },
    { key: 'backup_reminder', label: 'Lembrete de backup', desc: 'Avisa se nao fizer backup ha mais de 7 dias.' },
    { key: 'new_version', label: 'Novas versoes', desc: 'Avisa quando uma ferramenta tiver atualizacao.' },
  ];

  return (
    <div style={{ animation: 'fadeUp 0.4s ease-out' }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 6 }}>Configuracoes</h1>
      <p style={{ fontSize: 14, color: colors.textMuted, marginBottom: 28 }}>
        Gerencie notificacoes e preferencias do painel.
      </p>

      {/* Push Notifications */}
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 14 }}>Notificacoes Push</h2>
      <PushNotificationCard />

      {/* Alert Preferences */}
      <h2 style={{ fontSize: 16, fontWeight: 600, marginTop: 28, marginBottom: 14 }}>Tipos de alerta</h2>
      <Card style={{ overflow: 'hidden' }}>
        {alertOptions.map((opt, i) => (
          <div key={opt.key} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '16px 22px', borderBottom: i < alertOptions.length - 1 ? `1px solid ${colors.border}` : 'none',
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{opt.label}</div>
              <div style={{ fontSize: 11, color: colors.textDim }}>{opt.desc}</div>
            </div>
            <label style={{ position: 'relative', display: 'inline-block', width: 42, height: 24, cursor: 'pointer' }}>
              <input type="checkbox" checked={prefs[opt.key]} onChange={() => togglePref(opt.key)}
                style={{ opacity: 0, width: 0, height: 0 }} />
              <span style={{
                position: 'absolute', inset: 0, borderRadius: 12, transition: 'all 0.3s',
                background: prefs[opt.key] ? colors.green : 'rgba(255,255,255,0.1)',
              }}>
                <span style={{
                  position: 'absolute', top: 3, left: prefs[opt.key] ? 21 : 3, width: 18, height: 18,
                  borderRadius: '50%', background: '#fff', transition: 'all 0.3s',
                }} />
              </span>
            </label>
          </div>
        ))}
      </Card>

      <div style={{ marginTop: 18, display: 'flex', gap: 12, alignItems: 'center' }}>
        <Btn onClick={save} loading={saving} style={{ fontSize: 12 }}>Salvar preferencias</Btn>
        {saved && <span style={{ fontSize: 12, color: colors.green, fontFamily: mono }}>Salvo!</span>}
      </div>

      {/* PWA Info */}
      <h2 style={{ fontSize: 16, fontWeight: 600, marginTop: 28, marginBottom: 14 }}>Instalar como App</h2>
      <Card style={{ padding: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <span style={{ fontSize: 22 }}>&#128241;</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Instale o N8N LABZ no seu celular</div>
            <div style={{ fontSize: 12, color: colors.textMuted }}>Acesse mais rapido direto da tela inicial.</div>
          </div>
        </div>
        <div style={{ fontSize: 12, color: colors.textDim, lineHeight: 1.7 }}>
          <strong>Chrome/Edge:</strong> Toque no menu (3 pontinhos) e em "Adicionar a tela inicial".<br/>
          <strong>Safari (iOS):</strong> Toque no botao de compartilhar e em "Adicionar a Tela de Inicio".
        </div>
      </Card>
    </div>
  );
}

// ─── Main App ───
export default function App() {
  const [authed, setAuthed] = useState(!!getToken());
  const [view, setView] = useState('dashboard');
  const [sysInfo, setSysInfo] = useState(null);
  const [showPwaBanner, setShowPwaBanner] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    const dismissed = localStorage.getItem('n8nlabz_pwa_dismissed');
    const isMobile = /Mobi|Android/i.test(navigator.userAgent);
    if (isMobile && !isStandalone && !dismissed) setShowPwaBanner(true);
  }, []);

  const navigateTo = (id) => { setView(id); setSidebarOpen(false); };

  useEffect(() => {
    if (authed) {
      api('/system/info').then(setSysInfo).catch(() => {});
      const i = setInterval(() => { api('/system/info').then(setSysInfo).catch(() => {}); }, 30000);
      return () => clearInterval(i);
    }
  }, [authed]);

  if (!authed) return <LoginPage onLogin={() => setAuthed(true)} />;

  const nav = [
    { id: 'dashboard', label: 'Dashboard', icon: '🏠' },
    { id: 'install', label: 'Instalar', icon: '⚙️' },
    { id: 'monitor', label: 'Monitorar', icon: '📊' },
    { id: 'credentials', label: 'Credenciais', icon: '🔑' },
    { id: 'backup', label: 'Backup', icon: '💾' },
    { id: 'environments', label: 'Ambientes', icon: '🧪' },
    { id: 'cleanup', label: 'Limpeza', icon: '🧹' },
    { id: 'settings', label: 'Configuracoes', icon: '⚙️' },
  ];

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: colors.bg }}>
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
        @keyframes spin { to { transform:rotate(360deg); } }
        @keyframes progressBar { 0% { width:5%; } 50% { width:70%; } 100% { width:95%; } }

        .mobile-header { display: none; }
        .sidebar-overlay { display: none; }

        @media (max-width: 768px) {
          .mobile-header {
            display: flex !important;
            align-items: center;
            gap: 14px;
            padding: 14px 18px;
            background: rgba(0,0,0,0.4);
            border-bottom: 1px solid rgba(255,255,255,0.06);
            position: sticky;
            top: 0;
            z-index: 998;
          }
          .n8n-sidebar {
            position: fixed !important;
            left: -280px;
            top: 0;
            height: 100vh;
            width: 270px !important;
            z-index: 1001;
            transition: left 0.3s ease;
            overflow-y: auto;
          }
          .n8n-sidebar.open { left: 0; }
          .sidebar-overlay.show {
            display: block !important;
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.55);
            z-index: 1000;
          }
          .n8n-main {
            padding: 20px 16px !important;
          }
          .grid-3 { grid-template-columns: 1fr !important; }
          .grid-4 { grid-template-columns: 1fr 1fr !important; }
          .grid-2 { grid-template-columns: 1fr !important; }
          .grid-73 { grid-template-columns: 1fr !important; }
          .grid-auto { grid-template-columns: 1fr !important; }
          .grid-modal-2 { grid-template-columns: 1fr !important; }
          .sidebar-close { display: flex !important; }
          .n8n-main h1 { font-size: 22px !important; }
        }
        @media (min-width: 769px) {
          .sidebar-close { display: none !important; }
        }
      `}</style>

      {/* PWA Install Banner */}
      {showPwaBanner && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 2000,
          background: 'linear-gradient(135deg, rgba(255,109,90,0.95), rgba(255,68,68,0.95))',
          padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          backdropFilter: 'blur(10px)',
        }}>
          <div style={{ fontSize: 13, color: '#fff', lineHeight: 1.4 }}>
            <strong>&#128241; Instale o N8N LABZ!</strong> Toque em "Adicionar a tela inicial" no navegador.
          </div>
          <button onClick={() => { setShowPwaBanner(false); localStorage.setItem('n8nlabz_pwa_dismissed', '1'); }}
            style={{ background: 'none', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer', padding: '0 4px', opacity: 0.8 }}>
            &#10005;
          </button>
        </div>
      )}

      {/* Mobile Header */}
      <div className="mobile-header">
        <button onClick={() => setSidebarOpen(true)} style={{
          background: 'none', border: 'none', color: colors.brand, fontSize: 24, cursor: 'pointer',
          width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
        }}>&#9776;</button>
        <span style={{ fontSize: 16, fontWeight: 800, fontFamily: mono, background: `linear-gradient(135deg, ${colors.brand}, ${colors.brandDark})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>N8N LABZ</span>
      </div>

      {/* Sidebar Overlay */}
      <div className={`sidebar-overlay ${sidebarOpen ? 'show' : ''}`} onClick={() => setSidebarOpen(false)} />

      {/* Sidebar */}
      <aside className={`n8n-sidebar ${sidebarOpen ? 'open' : ''}`} style={{ width: 240, padding: '26px 18px', borderRight: `1px solid ${colors.border}`, background: 'rgba(7,8,10,0.98)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 36, padding: '0 8px' }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: mono, background: `linear-gradient(135deg, ${colors.brand}, ${colors.brandDark})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>N8N LABZ</div>
            <div style={{ fontSize: 9, color: colors.textDim, fontFamily: mono, letterSpacing: '0.15em', marginTop: 4 }}>SETUP PANEL v2.8</div>
          </div>
          <button className="sidebar-close" onClick={() => setSidebarOpen(false)} style={{
            background: 'none', border: 'none', color: colors.textMuted, fontSize: 20, cursor: 'pointer',
            width: 36, height: 36, alignItems: 'center', justifyContent: 'center', padding: 0, borderRadius: 8,
          }}>&#10005;</button>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {nav.map((n) => (
            <button key={n.id} onClick={() => navigateTo(n.id)} style={{
              display: 'flex', alignItems: 'center', gap: 11, padding: '11px 14px', borderRadius: 10,
              border: 'none', background: view === n.id ? 'rgba(255,109,90,0.08)' : 'transparent',
              color: view === n.id ? colors.brand : colors.textMuted, fontSize: 13, fontWeight: 500,
              cursor: 'pointer', fontFamily: sans, textAlign: 'left',
              borderLeft: view === n.id ? `2px solid ${colors.brand}` : '2px solid transparent',
              transition: 'all 0.2s', minHeight: 44,
            }}>
              <span style={{ fontSize: 16 }}>{n.icon}</span>{n.label}
            </button>
          ))}
        </nav>

        <div style={{ marginTop: 'auto' }}>
          <Card style={{ padding: 14 }}>
            <div style={{ fontSize: 9, color: colors.textDim, fontFamily: mono, letterSpacing: '0.1em', marginBottom: 8 }}>SERVIDOR</div>
            {sysInfo ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: colors.textMuted }}>IP</span>
                  <span style={{ fontSize: 11, fontFamily: mono, color: colors.brand }}>{sysInfo.ip}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: colors.textMuted }}>RAM</span>
                  <span style={{ fontSize: 11, fontFamily: mono, color: colors.brand }}>{sysInfo.ram_used_mb}/{sysInfo.ram_total_mb} MB</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: colors.textMuted }}>Disco</span>
                  <span style={{ fontSize: 11, fontFamily: mono, color: colors.purple }}>{sysInfo.disk_used}/{sysInfo.disk_total}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: colors.textMuted }}>Hostname</span>
                  <span style={{ fontSize: 11, fontFamily: mono, color: colors.green }}>{sysInfo.hostname}</span>
                </div>
              </>
            ) : <Spinner size={14} />}
          </Card>

          <button onClick={() => { clearToken(); setAuthed(false); }} style={{
            width: '100%', marginTop: 12, padding: '10px', borderRadius: 8, border: `1px solid ${colors.border}`,
            background: 'transparent', color: colors.textDim, fontSize: 11, fontFamily: mono, cursor: 'pointer',
            minHeight: 44,
          }}>
            Sair
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="n8n-main" style={{ flex: 1, padding: '30px 36px', overflowY: 'auto' }}>
        {view === 'dashboard' && <DashboardPage />}
        {view === 'install' && <InstallPage />}
        {view === 'monitor' && <MonitorPage />}
        {view === 'credentials' && <CredentialsPage />}
        {view === 'backup' && <BackupPage />}
        {view === 'environments' && <EnvironmentsPage />}
        {view === 'cleanup' && <CleanupPage />}
        {view === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}
