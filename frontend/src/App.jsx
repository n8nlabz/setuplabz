import { useState, useEffect, useCallback, useRef } from 'react';
import { api, apiUpload, getToken, setToken, clearToken, connectWebSocket,
  fetchCredentials, fetchMetrics, updateToolImage,
  fetchContainerEnv, updateContainerEnv, fetchContainerLogs,
  systemCleanup, fetchCleanupInfo,
  fetchEnvironments, createEnvironment, destroyEnvironment } from './hooks/api.js';
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
            SETUP PANEL v2.3
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

  // Helper: parse container base name (before first dot = swarm replica suffix)
  const parseBase = (name) => { const d = name.indexOf('.'); return d > 0 ? name.slice(0, d) : name; };

  // Helper: filter only main stack containers (exclude test envs)
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

  // Smart greeting
  const getGreeting = () => {
    if (installed.length === 0) return 'Visao geral do seu servidor.';
    const statuses = installed.map((toolId) => {
      const tc = getMainContainers(toolId);
      const anyRunning = tc.some((c) => c.state === 'running');
      return { toolId, anyRunning };
    });
    const allOk = statuses.every((s) => s.anyRunning);
    const allDown = statuses.every((s) => !s.anyRunning);
    if (allOk) return 'Tudo funcionando normalmente. Seus servicos estao online.';
    if (allDown) return 'Atencao: nenhum servico esta respondendo. Verifique o monitoramento.';
    const down = statuses.filter((s) => !s.anyRunning).map((s) => TOOLS.find((t) => t.id === s.toolId)?.name || s.toolId);
    return `Atencao: ${down.join(', ')} ${down.length === 1 ? 'esta parado' : 'estao parados'}.`;
  };

  const chartTooltipStyle = {
    contentStyle: { background: '#1a1a2e', border: `1px solid ${colors.border}`, borderRadius: 8, fontFamily: mono, fontSize: 11 },
    labelStyle: { color: colors.textMuted },
  };

  return (
    <div style={{ animation: 'fadeUp 0.4s ease-out' }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 6 }}>Dashboard</h1>
      <p style={{ fontSize: 14, color: colors.textMuted, marginBottom: 28 }}>{getGreeting()}</p>

      {/* Server Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
        {[
          { label: 'IP do Servidor', value: sysInfo?.ip || '---', color: colors.brand },
          { label: 'RAM', value: sysInfo ? `${sysInfo.ram_used_mb}/${sysInfo.ram_total_mb} MB` : '---', sub: `${ramPerc}% em uso`, color: colors.purple },
          { label: 'Disco', value: sysInfo ? `${sysInfo.disk_used}/${sysInfo.disk_total}` : '---', sub: sysInfo?.disk_percentage || '', color: colors.yellow },
          { label: 'Containers', value: `${running}/${containers.length}`, sub: 'ativos', color: colors.green },
        ].map((s, i) => (
          <Card key={i} style={{ padding: 18 }}>
            <div style={{ fontSize: 9, color: colors.textDim, fontFamily: mono, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: mono, color: s.color }}>{s.value}</div>
            {s.sub && <div style={{ fontSize: 10, color: colors.textDim, fontFamily: mono, marginTop: 2 }}>{s.sub}</div>}
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 28 }}>
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

        <Card style={{ padding: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, fontFamily: mono, color: colors.textMuted, marginBottom: 16 }}>Uso de disco (30 dias)</div>
          {metricsData.disk.length === 0 ? (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 28, opacity: 0.3 }}>📊</div>
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
      </div>

      {/* Installed Tools */}
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 14 }}>Ferramentas Instaladas</h2>
      {installed.length === 0 ? (
        <Card style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 14 }}>👋</div>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Bem-vindo ao N8N LABZ!</h3>
          <p style={{ fontSize: 13, color: colors.textMuted, lineHeight: 1.6 }}>
            Nenhuma ferramenta instalada ainda. Va para a aba <strong>Instalar</strong> para comecar.
          </p>
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
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
              <Card key={toolId} style={{ padding: 20, borderColor: tool.color + '20' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, background: tool.color + '12', border: `1px solid ${tool.color}25` }}>
                    {tool.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, fontFamily: mono }}>{tool.name}</div>
                    <StatusBadge status={anyRunning ? 'running' : 'stopped'} />
                  </div>
                </div>
                <div style={{ fontSize: 11, color: colors.textMuted, fontFamily: mono, marginBottom: 2 }}>
                  Versao: {version}
                </div>
                <div style={{ fontSize: 11, color: colors.textDim, fontFamily: mono, marginBottom: 14 }}>
                  {toolContainers.length} container{toolContainers.length !== 1 ? 's' : ''}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {openUrl && (
                    <a href={openUrl} target="_blank" rel="noopener noreferrer" style={{
                      padding: '6px 14px', borderRadius: 10, fontSize: 11, fontWeight: 600, fontFamily: mono,
                      background: tool.color + '12', color: tool.color, border: `1px solid ${tool.color}25`,
                      textDecoration: 'none', display: 'inline-flex', alignItems: 'center',
                    }}>
                      Abrir
                    </a>
                  )}
                  <Btn variant="ghost" onClick={() => restartTool(toolId)} loading={actionLoading === toolId} style={{ padding: '6px 14px', fontSize: 11 }}>
                    Reiniciar
                  </Btn>
                  <Btn variant="ghost" onClick={() => setVersionModal(toolId)} style={{ padding: '6px 14px', fontSize: 11 }}>
                    Alterar versao
                  </Btn>
                </div>
              </Card>
            );
          })}
        </div>
      )}

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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 28 }}>
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
              <div style={{ width: 44, height: 44, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, background: tool.color + '12', border: `1px solid ${tool.color}25`, marginBottom: 14 }}>
                {tool.icon}
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
              <div style={{ width: 44, height: 44, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, background: modal.color + '12', border: `1px solid ${modal.color}25` }}>
                {modal.icon}
              </div>
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
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
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

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 22 }}>
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
    'n8n_Editor': 'O editor e onde voce cria e edita seus workflows',
    'n8n_Webhook': 'Responsavel por receber webhooks externos',
    'n8n_Worker': 'Processa suas automacoes em segundo plano',
    'n8n_Redis': 'Banco de dados em memoria usado para filas de execucao',
    'n8n_n8n': 'Servico principal do n8n (modo simples)',
    'evolution_API': 'Servico principal da Evolution API para integracao com WhatsApp',
    'evolution_Redis': 'Cache de sessoes e dados do WhatsApp',
    'portainer_Portainer': 'Interface visual para gerenciar containers Docker',
    'portainer_Agent': 'Agente de comunicacao entre Portainer e Docker',
    'postgres_PostgreSQL': 'Banco de dados relacional que armazena todos os seus dados',
    'traefik_Traefik': 'Proxy reverso responsavel pelo SSL e roteamento de dominios',
    'panel_Painel': 'Este painel de controle (N8N LABZ Setup Panel)',
  };

  const toolDefs = {
    n8n: { name: 'n8n', icon: '\u26A1', color: colors.brand, desc: 'Plataforma de automacao', managed: true },
    evolution: { name: 'Evolution API', icon: '\uD83D\uDCF1', color: colors.green, desc: 'API para WhatsApp', managed: true },
    portainer: { name: 'Portainer', icon: '\uD83D\uDC33', color: colors.blue, desc: 'Gerenciamento Docker', managed: true },
    postgres: { name: 'PostgreSQL', icon: '\uD83D\uDDC4\uFE0F', color: colors.purple, desc: 'Banco de dados', managed: false },
    traefik: { name: 'Traefik', icon: '\uD83D\uDD00', color: colors.yellow, desc: 'Proxy reverso e SSL', managed: false },
    panel: { name: 'Setup Panel', icon: '\uD83D\uDEE0\uFE0F', color: colors.brand, desc: 'Painel de controle', managed: false },
    env: { name: 'Ambientes de Teste', icon: '\uD83E\uDDEA', color: colors.textMuted, desc: 'Containers de ambientes de teste', managed: false },
    other: { name: 'Outros', icon: '\uD83D\uDCE6', color: colors.textMuted, desc: '', managed: false },
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

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
        {[
          { label: 'Containers', value: containers.length, color: colors.blue },
          { label: 'Ativos', value: running, color: colors.green },
          { label: 'RAM VPS', value: sysInfo ? `${sysInfo.ram_used_mb}/${sysInfo.ram_total_mb} MB` : '---', color: colors.brand },
          { label: 'Disco', value: sysInfo?.disk_percentage || '---', color: colors.purple },
        ].map((s, i) => (
          <Card key={i} style={{ padding: 18 }}>
            <div style={{ fontSize: 9, color: colors.textDim, fontFamily: mono, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, fontFamily: mono, color: s.color }}>{s.value}</div>
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
                  <div style={{ width: 44, height: 44, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, background: def.color + '12', border: `1px solid ${def.color}25` }}>
                    {def.icon}
                  </div>
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
                            <Tooltip text={isRunning ? 'Este servico esta funcionando normalmente' : 'Este servico esta parado'}>
                              <span style={{ width: 7, height: 7, borderRadius: '50%', background: isRunning ? colors.green : colors.red, display: 'inline-block', animation: isRunning ? 'pulse 2s infinite' : 'none' }} />
                            </Tooltip>
                            <Tooltip text="Quanto do processador este servico esta usando. Abaixo de 50% e normal">
                              <span style={{ fontSize: 11, fontFamily: mono, color: colors.textMuted }}>{cpuVal}</span>
                            </Tooltip>
                          </div>
                          <Tooltip text="Memoria consumida. Valores entre 100-500MB sao normais para a maioria dos servicos">
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

  const toolIcons = { portainer: '🐳', n8n: '⚡', evolution: '📱', postgres: '🗄️' };
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 18 }}>
          {toolEntries.map(([toolId, data]) => {
            const tool = TOOLS.find((t) => t.id === toolId) || { name: toolId, icon: toolIcons[toolId] || '🔧', color: toolColorMap[toolId] || colors.textMuted };
            const cardColor = toolColorMap[toolId] || colors.textMuted;
            const icon = toolIcons[toolId] || tool.icon || '🔧';
            const entries = Object.entries(data).filter(([k]) => k !== 'installed_at');
            const openUrl = data.editor_url || data.url || data.base_url || (data.domain ? 'https://' + data.domain : null);

            return (
              <Card key={toolId} style={{ overflow: 'hidden' }}>
                {/* Colored top border */}
                <div style={{ height: 3, background: cardColor }} />
                <div style={{ padding: '16px 20px', borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: cardColor + '08' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, background: cardColor + '15', border: `1px solid ${cardColor}25` }}>
                      {icon}
                    </div>
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 28 }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: 14 }}>
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
                      <span style={{ padding: '3px 10px', borderRadius: 8, fontSize: 11, fontFamily: mono, background: colors.brand + '12', color: colors.brand, border: `1px solid ${colors.brand}25` }}>n8n</span>
                    )}
                    {hasEvolution && (
                      <span style={{ padding: '3px 10px', borderRadius: 8, fontSize: 11, fontFamily: mono, background: colors.green + '12', color: colors.green, border: `1px solid ${colors.green}25` }}>Evolution</span>
                    )}
                    <span style={{ padding: '3px 10px', borderRadius: 8, fontSize: 11, fontFamily: mono, background: colors.purple + '12', color: colors.purple, border: `1px solid ${colors.purple}25` }}>PostgreSQL</span>
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
                { id: 'n8n', label: 'n8n', icon: '⚡' },
                { id: 'evolution', label: 'Evolution API', icon: '📱' },
              ].map((t) => (
                <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, border: `1px solid ${newEnvTools[t.id] ? colors.brand + '40' : colors.border}`, background: newEnvTools[t.id] ? colors.brand + '08' : 'transparent', cursor: 'pointer', transition: 'all 0.2s' }}>
                  <input type="checkbox" checked={newEnvTools[t.id]} onChange={(e) => setNewEnvTools((p) => ({ ...p, [t.id]: e.target.checked }))}
                    style={{ accentColor: colors.brand }} />
                  <span style={{ fontSize: 16 }}>{t.icon}</span>
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginBottom: 28 }}>
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

// ─── Main App ───
export default function App() {
  const [authed, setAuthed] = useState(!!getToken());
  const [view, setView] = useState('dashboard');
  const [sysInfo, setSysInfo] = useState(null);

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
  ];

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: colors.bg }}>
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
        @keyframes spin { to { transform:rotate(360deg); } }
        @keyframes progressBar { 0% { width:5%; } 50% { width:70%; } 100% { width:95%; } }
      `}</style>

      {/* Sidebar */}
      <aside style={{ width: 240, padding: '26px 18px', borderRight: `1px solid ${colors.border}`, background: 'rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ marginBottom: 36, padding: '0 8px' }}>
          <div style={{ fontSize: 20, fontWeight: 800, fontFamily: mono, background: `linear-gradient(135deg, ${colors.brand}, ${colors.brandDark})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>N8N LABZ</div>
          <div style={{ fontSize: 9, color: colors.textDim, fontFamily: mono, letterSpacing: '0.15em', marginTop: 4 }}>SETUP PANEL v2.3</div>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {nav.map((n) => (
            <button key={n.id} onClick={() => setView(n.id)} style={{
              display: 'flex', alignItems: 'center', gap: 11, padding: '11px 14px', borderRadius: 10,
              border: 'none', background: view === n.id ? 'rgba(255,109,90,0.08)' : 'transparent',
              color: view === n.id ? colors.brand : colors.textMuted, fontSize: 13, fontWeight: 500,
              cursor: 'pointer', fontFamily: sans, textAlign: 'left',
              borderLeft: view === n.id ? `2px solid ${colors.brand}` : '2px solid transparent',
              transition: 'all 0.2s',
            }}>
              <span style={{ fontSize: 16 }}>{n.icon}</span>{n.label}
            </button>
          ))}
        </nav>

        {/* Server info */}
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
          }}>
            Sair
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, padding: '30px 36px', overflowY: 'auto' }}>
        {view === 'dashboard' && <DashboardPage />}
        {view === 'install' && <InstallPage />}
        {view === 'monitor' && <MonitorPage />}
        {view === 'credentials' && <CredentialsPage />}
        {view === 'backup' && <BackupPage />}
        {view === 'environments' && <EnvironmentsPage />}
        {view === 'cleanup' && <CleanupPage />}
      </main>
    </div>
  );
}
