const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('n8nlabz_jwt') || '';
}

function setToken(token) {
  localStorage.setItem('n8nlabz_jwt', token);
}

function clearToken() {
  localStorage.removeItem('n8nlabz_jwt');
}

async function api(endpoint, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erro na requisição');
  return data;
}

async function apiUpload(endpoint, file) {
  const token = getToken();
  const formData = new FormData();
  formData.append('backup', file);

  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erro no upload');
  return data;
}

function connectWebSocket(onMessage) {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${proto}//${window.location.host}/api/ws/logs`;
  let ws = null;
  let reconnectTimer = null;

  function connect() {
    ws = new WebSocket(url);
    ws.onopen = () => {};
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (onMessage) onMessage(data);
      } catch {}
    };
    ws.onclose = () => {
      reconnectTimer = setTimeout(connect, 3000);
    };
    ws.onerror = () => {
      ws.close();
    };
  }

  connect();

  return () => {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (ws) ws.close();
  };
}

async function fetchCredentials() {
  return api('/credentials');
}

async function fetchMetrics() {
  return api('/system/metrics');
}

async function updateToolImage(toolId, version) {
  return api(`/tools/${toolId}/update-image`, { method: 'POST', body: JSON.stringify({ version }) });
}

async function fetchContainerEnv(serviceId) {
  return api(`/containers/${serviceId}/env`);
}

async function updateContainerEnv(serviceId, env) {
  return api(`/containers/${serviceId}/env`, { method: 'POST', body: JSON.stringify({ env }) });
}

async function fetchContainerLogs(containerId, lines = 100) {
  return api(`/containers/${containerId}/logs?lines=${lines}`);
}

async function systemCleanup(type) {
  return api('/system/cleanup', { method: 'POST', body: JSON.stringify({ type }) });
}

async function fetchCleanupInfo() {
  return api('/system/cleanup/info');
}

async function fetchEnvironments() {
  return api('/environments');
}

async function createEnvironment(name, tools) {
  return api('/environments', { method: 'POST', body: JSON.stringify({ name, tools }) });
}

async function destroyEnvironment(name) {
  return api(`/environments/${name}`, { method: 'DELETE' });
}

async function verifyDns(subdomains) {
  return api('/environments/verify-dns', { method: 'POST', body: JSON.stringify({ subdomains }) });
}

// ─── Push Notifications ───

async function fetchVapidKey() {
  return api('/push/vapid-key');
}

async function subscribePush(subscription) {
  return api('/push/subscribe', { method: 'POST', body: JSON.stringify(subscription) });
}

async function unsubscribePush(endpoint) {
  return api('/push/subscribe', { method: 'DELETE', body: JSON.stringify({ endpoint }) });
}

async function sendTestPush() {
  return api('/push/test', { method: 'POST' });
}

async function fetchPushPrefs() {
  return api('/push/prefs');
}

async function savePushPrefs(prefs) {
  return api('/push/prefs', { method: 'POST', body: JSON.stringify(prefs) });
}

// ─── Snapshots ───

async function fetchSnapshots() {
  return api('/snapshots');
}

async function createSnapshot() {
  return api('/snapshots/create', { method: 'POST' });
}

async function restoreSnapshot(id) {
  return api(`/snapshots/restore/${id}`, { method: 'POST' });
}

async function deleteSnapshot(id) {
  return api(`/snapshots/${id}`, { method: 'DELETE' });
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export {
  api, apiUpload, getToken, setToken, clearToken, connectWebSocket,
  fetchCredentials, fetchMetrics, updateToolImage,
  fetchContainerEnv, updateContainerEnv, fetchContainerLogs,
  systemCleanup, fetchCleanupInfo,
  fetchEnvironments, createEnvironment, destroyEnvironment, verifyDns,
  fetchVapidKey, subscribePush, unsubscribePush, sendTestPush,
  fetchPushPrefs, savePushPrefs, urlBase64ToUint8Array,
  fetchSnapshots, createSnapshot, restoreSnapshot, deleteSnapshot,
};
