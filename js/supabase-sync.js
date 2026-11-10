/**
 * Sincronização do snapshot local Dexie com Supabase, protegida por Auth + RLS.
 */
import { db, TABELAS } from './db.js';

const CONFIG_KEY = 'atelie-supabase-config';
const DIRTY_KEY = 'atelie-supabase-local-dirty';
const TABLE = 'atelie_snapshots';
const BACKUPS_TABLE = 'atelie_snapshot_backups';
const DEFAULT_CONFIG = {
  url: 'https://nbekjeuadgiscrsgygyj.supabase.co',
  anonKey: 'sb_publishable_Uti5oA-kSPapoR6t15nQ4g_iq_81bHl',
};

let client = null;
let currentUser = null;
let activeConfig = null;
let syncQueue = Promise.resolve();
let passwordRecoveryPending = false;

export function lerConfiguracaoSupabase() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_KEY) || 'null') || DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function configurarSupabase(url, anonKey) {
  const projectUrl = String(url || '').trim().replace(/\/+$/, '');
  const publicKey = String(anonKey || '').trim();
  let parsedUrl;
  try {
    parsedUrl = new URL(projectUrl);
  } catch {
    throw new Error('Informe a URL HTTPS do projeto Supabase.');
  }
  if (parsedUrl.protocol !== 'https:' && parsedUrl.hostname !== 'localhost') {
    throw new Error('A URL do Supabase deve usar HTTPS.');
  }
  if (!publicKey) throw new Error('Informe a chave pública anon/publishable do Supabase.');
  if (!window.supabase?.createClient) {
    throw new Error('A biblioteca do Supabase não foi carregada. Verifique a conexão e recarregue o app.');
  }

  localStorage.setItem(CONFIG_KEY, JSON.stringify({ url: projectUrl, anonKey: publicKey }));
  if (client && activeConfig?.url === projectUrl && activeConfig.anonKey === publicKey) return client;
  client = window.supabase.createClient(projectUrl, publicKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  activeConfig = { url: projectUrl, anonKey: publicKey };
  client.auth.onAuthStateChange((event, session) => {
    currentUser = session?.user || null;
    if (event === 'PASSWORD_RECOVERY') passwordRecoveryPending = true;
    window.dispatchEvent(new CustomEvent('supabase-auth-changed', {
      detail: { user: currentUser ? { email: currentUser.email } : null, event },
    }));
  });
  return client;
}

export async function restaurarConfiguracaoSupabase() {
  const config = lerConfiguracaoSupabase();
  if (!config) return { configured: false, user: null };
  configurarSupabase(config.url, config.anonKey);
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  currentUser = data.session?.user || null;
  return { configured: true, user: currentUser ? { email: currentUser.email } : null };
}

function exigirCliente() {
  if (!client) throw new Error('Configure primeiro a URL e a chave pública do Supabase.');
  return client;
}

export async function cadastrarConta(email, password) {
  const supabase = exigirCliente();
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { emailRedirectTo: `${window.location.origin}${window.location.pathname}` },
  });
  if (error) throw error;
  currentUser = data.session?.user || null;
  return { user: currentUser, confirmationRequired: !data.session };
}

export async function reenviarConfirmacaoConta(email) {
  const supabase = exigirCliente();
  const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim() });
  if (error) throw error;
}

export async function solicitarRecuperacaoSenha(email) {
  const supabase = exigirCliente();
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${window.location.origin}${window.location.pathname}`,
  });
  if (error) throw error;
}

export async function atualizarSenhaConta(password) {
  const supabase = exigirCliente();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
  passwordRecoveryPending = false;
}

export function estaEmRecuperacaoSenha() {
  return passwordRecoveryPending;
}

export async function entrarConta(email, password) {
  const supabase = exigirCliente();
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
  currentUser = data.user;
  return currentUser;
}

export async function sairConta() {
  const supabase = exigirCliente();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  currentUser = null;
}

function authObrigatoria() {
  if (!currentUser) throw new Error('Entre na sua conta Supabase para sincronizar. Os dados continuam salvos neste dispositivo.');
  return currentUser;
}

function chaveHash(userId) {
  return `atelie-supabase-sync:${userId}`;
}

function semMetadados(registro) {
  const { synced, ...dados } = registro;
  return dados;
}

async function lerSnapshotLocal() {
  const snapshot = {};
  for (const tabela of TABELAS) {
    snapshot[tabela] = (await db[tabela].toArray())
      .map(semMetadados)
      .sort((a, b) => Number(a.id) - Number(b.id));
  }
  return snapshot;
}

function snapshotVazio(snapshot) {
  return TABELAS.every((tabela) => snapshot[tabela].length === 0);
}

function snapshotSemLancamentosFinanceiros(snapshot) {
  const { financeiro_lancamentos, ...legado } = snapshot;
  return legado;
}

function ordenarJson(value) {
  if (Array.isArray(value)) return `[${value.map(ordenarJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${ordenarJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function hashSnapshot(snapshot) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ordenarJson(snapshot)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function normalizarSnapshot(snapshot) {
  const normalized = {};
  for (const tabela of TABELAS) {
    const records = snapshot?.[tabela] ?? (
      ['movimentacoes_estoque', 'financeiro_lancamentos'].includes(tabela) ? [] : undefined
    );
    if (!Array.isArray(records)) throw new Error(`O snapshot Supabase não contém uma lista válida para "${tabela}".`);
    normalized[tabela] = records.map((record) => {
      if (!record || typeof record !== 'object' || Array.isArray(record) || !Number.isFinite(Number(record.id))) {
        throw new Error(`O snapshot Supabase contém um registro inválido em "${tabela}".`);
      }
      return { ...record, id: Number(record.id) };
    }).sort((a, b) => a.id - b.id);
  }
  return normalized;
}

async function lerSnapshotRemoto(userId) {
  const supabase = exigirCliente();
  const { data, error } = await supabase.from(TABLE)
    .select('data, updated_at')
    .eq('owner_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data ? { snapshot: normalizarSnapshot(data.data), updatedAt: data.updated_at } : null;
}

async function guardarBackup(userId, source, snapshot) {
  const supabase = exigirCliente();
  const { error } = await supabase.from(BACKUPS_TABLE).insert({
    owner_id: userId,
    source,
    data: snapshot,
  });
  if (error) {
    throw new Error(`Não foi possível criar o backup de segurança no Supabase: ${error.message}. Nenhum dado foi substituído.`);
  }
}

async function gravarSnapshotRemoto(userId, snapshot) {
  const supabase = exigirCliente();
  const { error } = await supabase.from(TABLE).upsert({
    owner_id: userId,
    data: snapshot,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'owner_id' });
  if (error) throw error;
}

async function substituirSnapshotLocal(snapshot) {
  await db.transaction('rw', ...TABELAS.map((tabela) => db[tabela]), async () => {
    for (const tabela of TABELAS) {
      await db[tabela].clear();
      const records = snapshot[tabela].map((record) => ({ ...record, synced: 1 }));
      if (records.length) await db[tabela].bulkPut(records);
    }
  });
}

function baixarBackupLocal(snapshot) {
  const blob = new Blob([JSON.stringify({
    criado_em: new Date().toISOString(),
    origem: 'Ateliê Manager — backup local antes da importação Supabase',
    tabelas: snapshot,
  }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `atelie-backup-local-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function preservarBackupLocal(snapshot) {
  const backup = {
    criado_em: new Date().toISOString(),
    origem: 'supabase-before-import',
    tabelas: snapshot,
  };
  await db.sync_backups.add(backup);
  baixarBackupLocal(snapshot);
}

function salvarBaseline(userId, hash) {
  localStorage.setItem(chaveHash(userId), hash);
  localStorage.removeItem(DIRTY_KEY);
}

function contar(snapshot) {
  return TABELAS.reduce((sum, tabela) => sum + snapshot[tabela].length, 0);
}

export function sincronizarSupabase(resolution = null) {
  const executar = () => executarSincronizacao(resolution);
  const result = syncQueue.then(executar, executar);
  syncQueue = result.catch(() => {});
  return result;
}

async function executarSincronizacao(resolution) {
  if (!navigator.onLine) return { ok: false, motivo: 'Sem internet. Os dados permanecem salvos neste dispositivo.' };
  const user = authObrigatoria();
  const local = await lerSnapshotLocal();
  const remoteResult = await lerSnapshotRemoto(user.id);
  const remote = remoteResult?.snapshot || Object.fromEntries(TABELAS.map((tabela) => [tabela, []]));
  const [localHash, remoteHash] = await Promise.all([hashSnapshot(local), hashSnapshot(remote)]);
  const previousHash = localStorage.getItem(chaveHash(user.id));
  const localHasData = !snapshotVazio(local);
  const remoteHasData = Boolean(remoteResult && !snapshotVazio(remote));
  const localDirty = localStorage.getItem(DIRTY_KEY) === '1';

  if (resolution === 'cloud') {
    if (!snapshotVazio(local)) await preservarBackupLocal(local);
    await substituirSnapshotLocal(remote);
    salvarBaseline(user.id, remoteHash);
    return { ok: true, action: 'imported', count: contar(remote) };
  }

  if (resolution === 'local') {
    if (remoteResult) await guardarBackup(user.id, 'supabase-before-local-overwrite', remote);
    await gravarSnapshotRemoto(user.id, local);
    salvarBaseline(user.id, localHash);
    return { ok: true, action: 'uploaded', count: contar(local) };
  }

  if (!remoteResult) {
    if (localHasData) {
      await gravarSnapshotRemoto(user.id, local);
      salvarBaseline(user.id, localHash);
      return { ok: true, action: 'uploaded', count: contar(local) };
    }
    return { ok: true, action: 'ready', count: 0 };
  }

  if (localHash === remoteHash) {
    salvarBaseline(user.id, localHash);
    return { ok: true, action: 'synced', count: contar(local) };
  }

  if (previousHash) {
    const [localLegacyHash, remoteLegacyHash] = await Promise.all([
      hashSnapshot(snapshotSemLancamentosFinanceiros(local)),
      hashSnapshot(snapshotSemLancamentosFinanceiros(remote)),
    ]);
    if (localLegacyHash === previousHash && remoteLegacyHash === previousHash) {
      const localFinanceiro = local.financeiro_lancamentos;
      const remotoFinanceiro = remote.financeiro_lancamentos;
      if (localFinanceiro.length > 0 && remotoFinanceiro.length === 0) {
        await gravarSnapshotRemoto(user.id, local);
        salvarBaseline(user.id, localHash);
        return { ok: true, action: 'uploaded', count: contar(local) };
      }
      if (localFinanceiro.length === 0 && remotoFinanceiro.length > 0) {
        await substituirSnapshotLocal(remote);
        salvarBaseline(user.id, remoteHash);
        return { ok: true, action: 'imported', count: contar(remote) };
      }
    }
  }

  if (previousHash && previousHash === localHash) {
    await substituirSnapshotLocal(remote);
    salvarBaseline(user.id, remoteHash);
    return { ok: true, action: 'imported', count: contar(remote) };
  }

  if (previousHash && previousHash === remoteHash && localDirty) {
    await gravarSnapshotRemoto(user.id, local);
    salvarBaseline(user.id, localHash);
    return { ok: true, action: 'uploaded', count: contar(local) };
  }

  if (!previousHash && !localHasData && remoteHasData && !localDirty) {
    await substituirSnapshotLocal(remote);
    salvarBaseline(user.id, remoteHash);
    return { ok: true, action: 'imported', count: contar(remote) };
  }

  if (!previousHash && !remoteHasData && localHasData) {
    await gravarSnapshotRemoto(user.id, local);
    salvarBaseline(user.id, localHash);
    return { ok: true, action: 'uploaded', count: contar(local) };
  }

  return {
    ok: false,
    needsChoice: true,
    localCount: contar(local),
    cloudCount: contar(remote),
    cloudUpdatedAt: remoteResult.updatedAt,
  };
}
