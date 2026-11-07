/**
 * Persistência do Google Drive: uma planilha por pasta, com uma aba por tabela.
 * Os dados continuam no IndexedDB e o token OAuth permanece apenas em memória.
 */
import { db, TABELAS } from './db.js';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const SHEETS_API = 'https://sheets.googleapis.com/v4';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets';
const CONFIG_KEY = 'atelie-drive-config';
const LOCAL_DIRTY_KEY = 'atelie-drive-local-dirty';
const FILE_NAME = 'Atelie Manager';

let accessToken = null;
let planilhaAtiva = null;
let filaSincronizacao = Promise.resolve();

function extrairIdPasta(link) {
  const match = String(link || '').trim().match(/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([a-zA-Z0-9_-]+)/);
  if (!match) throw new Error('Cole o link completo de uma pasta do Google Drive.');
  return match[1];
}

function salvarConfiguracao(clientId, folderUrl) {
  const idPasta = extrairIdPasta(folderUrl);
  if (!String(clientId || '').trim()) throw new Error('Informe o ID do cliente OAuth do Google.');
  localStorage.setItem(CONFIG_KEY, JSON.stringify({
    clientId: String(clientId).trim(),
    folderUrl: String(folderUrl).trim(),
    folderId: idPasta,
  }));
  return { clientId: String(clientId).trim(), folderId: idPasta };
}

export function lerConfiguracaoDrive() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_KEY) || 'null');
  } catch {
    return null;
  }
}

function carregarGoogleIdentity() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (window.googleIdentityPromise) return window.googleIdentityPromise;

  window.googleIdentityPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => window.google?.accounts?.oauth2
      ? resolve()
      : reject(new Error('O serviço de autenticação do Google não foi carregado.'));
    script.onerror = () => reject(new Error('Não foi possível carregar a autenticação do Google.'));
    document.head.appendChild(script);
  });
  return window.googleIdentityPromise;
}

async function autorizar(clientId) {
  if (!window.isSecureContext) {
    throw new Error('A conexão Google exige HTTPS (ou localhost).');
  }
  await carregarGoogleIdentity();
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error_description || response.error || 'Autorização Google não concluída.'));
          return;
        }
        accessToken = response.access_token;
        resolve();
      },
      error_callback: (error) => reject(new Error(error.message || 'A janela de autorização Google foi bloqueada.')),
    });
    client.requestAccessToken({ prompt: '' });
  });
}

async function requisicao(url, options = {}) {
  if (!accessToken) throw new Error('Autorize sua conta Google para sincronizar.');
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    if (response.status === 401) accessToken = null;
    const message = body?.error?.message || body?.error_description || `Erro da API Google (${response.status}).`;
    throw new Error(message);
  }
  return body;
}

async function validarPasta(folderId) {
  const folder = await requisicao(`${DRIVE_API}/files/${encodeURIComponent(folderId)}?fields=id,name,mimeType,trashed`);
  if (folder.trashed || folder.mimeType !== 'application/vnd.google-apps.folder') {
    throw new Error('O link informado não aponta para uma pasta válida do Google Drive.');
  }
  return folder;
}

async function localizarPlanilha(folderId) {
  const query = `'${folderId}' in parents and name = '${FILE_NAME}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`;
  const params = new URLSearchParams({ q: query, fields: 'files(id,name)', pageSize: '100' });
  const result = await requisicao(`${DRIVE_API}/files?${params}`);
  if (result.files.length > 1) {
    throw new Error(`Há mais de uma planilha "${FILE_NAME}" nessa pasta. Renomeie ou remova as duplicadas.`);
  }
  return result.files[0] || null;
}

async function criarPlanilha(folderId) {
  return requisicao(`${DRIVE_API}/files?fields=id,name`, {
    method: 'POST',
    body: JSON.stringify({
      name: FILE_NAME,
      mimeType: 'application/vnd.google-apps.spreadsheet',
      parents: [folderId],
    }),
  });
}

async function garantirAbas(spreadsheetId) {
  const result = await requisicao(`${SHEETS_API}/spreadsheets/${spreadsheetId}?fields=sheets.properties`);
  const sheets = result.sheets || [];
  const names = new Set(sheets.map((sheet) => sheet.properties.title));
  const requests = [];
  const defaultSheet = sheets.find((sheet) => !TABELAS.includes(sheet.properties.title));

  for (const [index, table] of TABELAS.entries()) {
    if (names.has(table)) continue;
    if (index === 0 && defaultSheet) {
      requests.push({
        updateSheetProperties: {
          properties: { sheetId: defaultSheet.properties.sheetId, title: table },
          fields: 'title',
        },
      });
      names.add(table);
    } else {
      requests.push({ addSheet: { properties: { title: table } } });
      names.add(table);
    }
  }

  if (requests.length) {
    await requisicao(`${SHEETS_API}/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({ requests }),
    });
  }
}

function semMetadadosLocais(registro) {
  const { synced, ...dados } = registro;
  return dados;
}

async function lerSnapshotLocal() {
  const snapshot = {};
  for (const table of TABELAS) {
    snapshot[table] = (await db[table].toArray())
      .map(semMetadadosLocais)
      .sort((a, b) => Number(a.id) - Number(b.id));
  }
  return snapshot;
}

function temDados(snapshot) {
  return TABELAS.some((table) => snapshot[table].length > 0);
}

function serializarOrdenado(value) {
  if (Array.isArray(value)) return `[${value.map(serializarOrdenado).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${serializarOrdenado(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function hashSnapshot(snapshot) {
  const content = serializarOrdenado(snapshot);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function lerSnapshotDrive(spreadsheetId) {
  const params = new URLSearchParams({ majorDimension: 'ROWS' });
  for (const table of TABELAS) params.append('ranges', `${table}!A:B`);
  const result = await requisicao(`${SHEETS_API}/spreadsheets/${spreadsheetId}/values:batchGet?${params}`);
  const snapshot = {};
  const rowCounts = {};

  for (const [index, table] of TABELAS.entries()) {
    const values = result.valueRanges?.[index]?.values || [];
    const start = values[0]?.[0] === 'id' ? 1 : 0;
    const records = [];
    for (const row of values.slice(start)) {
      if (!row?.[0] && !row?.[1]) continue;
      const id = Number(row[0]);
      if (!Number.isFinite(id) || !row[1]) {
        throw new Error(`A aba "${table}" contém uma linha inválida. Corrija-a antes de sincronizar.`);
      }
      let record;
      try {
        record = JSON.parse(row[1]);
      } catch {
        throw new Error(`A aba "${table}" contém dados JSON inválidos na linha ${records.length + start + 1}.`);
      }
      if (!record || typeof record !== 'object' || Array.isArray(record)) {
        throw new Error(`A aba "${table}" contém um registro inválido.`);
      }
      records.push({ ...record, id });
    }
    records.sort((a, b) => Number(a.id) - Number(b.id));
    snapshot[table] = records;
    rowCounts[table] = records.length;
  }
  return { snapshot, rowCounts };
}

async function gravarSnapshotDrive(spreadsheetId, snapshot, oldRowCounts) {
  const data = TABELAS.map((table) => {
    const records = snapshot[table];
    const rowCount = Math.max(records.length, oldRowCounts[table] || 0);
    const values = [['id', 'dados_json']];
    for (const record of records) values.push([record.id, JSON.stringify(record)]);
    while (values.length < rowCount + 1) values.push(['', '']);
    return { range: `${table}!A1:B${rowCount + 1}`, values };
  });
  await requisicao(`${SHEETS_API}/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ valueInputOption: 'RAW', data }),
  });
}

async function criarBackup(folderId, nome, snapshot) {
  const boundary = `atelie-${Date.now()}`;
  const metadata = JSON.stringify({ name: nome, mimeType: 'application/json', parents: [folderId] });
  const content = JSON.stringify({ criado_em: new Date().toISOString(), tabelas: snapshot }, null, 2);
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n`,
    `--${boundary}--`,
  ], { type: `multipart/related; boundary=${boundary}` });
  const response = await fetch(`${DRIVE_API}/files?uploadType=multipart&fields=id,name`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || 'Não foi possível criar o backup no Google Drive.');
  return result;
}

async function substituirDadosLocais(snapshot) {
  await db.transaction('rw', ...TABELAS.map((table) => db[table]), async () => {
    for (const table of TABELAS) {
      await db[table].clear();
      const records = snapshot[table].map((record) => ({ ...record, synced: 1 }));
      if (records.length) await db[table].bulkPut(records);
    }
  });
}

function chaveSync(spreadsheetId) {
  return `atelie-drive-sync:${spreadsheetId}`;
}

function salvarHashSync(spreadsheetId, hash) {
  localStorage.setItem(chaveSync(spreadsheetId), hash);
  localStorage.removeItem(LOCAL_DIRTY_KEY);
}

function contarRegistros(snapshot) {
  return TABELAS.reduce((total, table) => total + snapshot[table].length, 0);
}

export async function conectarDrive({ clientId, folderUrl, resolution = null }) {
  const config = salvarConfiguracao(clientId, folderUrl);
  await autorizar(config.clientId);
  const folder = await validarPasta(config.folderId);
  let spreadsheet = await localizarPlanilha(config.folderId);
  const novaPlanilha = !spreadsheet;
  if (!spreadsheet) spreadsheet = await criarPlanilha(config.folderId);
  await garantirAbas(spreadsheet.id);
  planilhaAtiva = { folderId: folder.id, folderName: folder.name, spreadsheetId: spreadsheet.id };
  return sincronizarDrive(resolution, { novaPlanilha });
}

export function sincronizarDrive(resolution = null, options = {}) {
  const executar = () => executarSincronizacaoDrive(resolution, options);
  const resultado = filaSincronizacao.then(executar, executar);
  filaSincronizacao = resultado.catch(() => {});
  return resultado;
}

async function executarSincronizacaoDrive(resolution, { novaPlanilha = false } = {}) {
  if (!planilhaAtiva || !accessToken) {
    return { ok: false, motivo: 'Conecte-se ao Google Drive para autorizar a sincronização.' };
  }

  const local = await lerSnapshotLocal();
  const { snapshot: drive, rowCounts } = await lerSnapshotDrive(planilhaAtiva.spreadsheetId);
  const [localHash, driveHash] = await Promise.all([hashSnapshot(local), hashSnapshot(drive)]);
  const lastHash = localStorage.getItem(chaveSync(planilhaAtiva.spreadsheetId));
  const localHasData = temDados(local);
  const driveHasData = temDados(drive);
  const localDirty = localStorage.getItem(LOCAL_DIRTY_KEY) === '1';

  if (novaPlanilha || (!localHasData && !driveHasData)) {
    await gravarSnapshotDrive(planilhaAtiva.spreadsheetId, local, rowCounts);
    salvarHashSync(planilhaAtiva.spreadsheetId, localHash);
    return { ok: true, acao: 'enviado', registros: contarRegistros(local) };
  }

  if (resolution === 'drive') {
    if (localHasData) {
      await criarBackup(planilhaAtiva.folderId, `Backup local antes da importação - ${new Date().toISOString()}.json`, local);
    }
    await substituirDadosLocais(drive);
    salvarHashSync(planilhaAtiva.spreadsheetId, driveHash);
    return { ok: true, acao: 'importado', registros: contarRegistros(drive) };
  }

  if (resolution === 'device') {
    if (driveHasData) {
      await criarBackup(planilhaAtiva.folderId, `Backup da planilha antes da substituição - ${new Date().toISOString()}.json`, drive);
    }
    await gravarSnapshotDrive(planilhaAtiva.spreadsheetId, local, rowCounts);
    salvarHashSync(planilhaAtiva.spreadsheetId, localHash);
    return { ok: true, acao: 'enviado', registros: contarRegistros(local) };
  }

  if (localHash === driveHash) {
    salvarHashSync(planilhaAtiva.spreadsheetId, localHash);
    return { ok: true, acao: 'atualizado', registros: contarRegistros(local) };
  }

  if (lastHash && lastHash === localHash) {
    await substituirDadosLocais(drive);
    salvarHashSync(planilhaAtiva.spreadsheetId, driveHash);
    return { ok: true, acao: 'importado', registros: contarRegistros(drive) };
  }

  if (lastHash && lastHash === driveHash && localDirty) {
    await gravarSnapshotDrive(planilhaAtiva.spreadsheetId, local, rowCounts);
    salvarHashSync(planilhaAtiva.spreadsheetId, localHash);
    return { ok: true, acao: 'enviado', registros: contarRegistros(local) };
  }

  if (!lastHash && !driveHasData && localHasData) {
    await gravarSnapshotDrive(planilhaAtiva.spreadsheetId, local, rowCounts);
    salvarHashSync(planilhaAtiva.spreadsheetId, localHash);
    return { ok: true, acao: 'enviado', registros: contarRegistros(local) };
  }

  if (!lastHash && !localHasData && driveHasData && !localDirty) {
    await substituirDadosLocais(drive);
    salvarHashSync(planilhaAtiva.spreadsheetId, driveHash);
    return { ok: true, acao: 'importado', registros: contarRegistros(drive) };
  }

  return {
    ok: false,
    precisaEscolha: true,
    registrosLocais: contarRegistros(local),
    registrosDrive: contarRegistros(drive),
  };
}
