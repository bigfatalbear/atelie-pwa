/**
 * db.js — Banco local do Ateliê PWA (Dexie/IndexedDB, offline-first).
 */
export const db = new Dexie('AtelieDB');

db.version(1).stores({
  clientes: '++id, nome, telefone, &email, criado_em',
  insumos: '++id, nome, categoria, unidade, quantidade, custo_unitario, criado_em',
  produtos: '++id, nome, tipo, preco_base, criado_em',
  fichas_tecnicas: '++id, produto_id, nome, criado_em',
  ordens_servico: '++id, cliente_id, titulo, status, valor_total, sinal, criado_em, prazo',
});

export const TABELAS = ['clientes', 'insumos', 'produtos', 'fichas_tecnicas', 'ordens_servico'];

export function agendarSincronizacao() {
  try {
    localStorage.setItem('atelie-drive-local-dirty', '1');
  } catch {
    // O snapshot local continua sendo válido; sem este marcador a sincronização pedirá confirmação.
  }
  window.dispatchEvent(new CustomEvent('drive-sync-requested'));
}

/**
 * Persiste localmente e agenda a sincronização com o Drive quando conectado.
 */
export async function salvar(tabela, dados) {
  if (!TABELAS.includes(tabela)) throw new Error(`Tabela inválida: ${tabela}`);
  const registro = { ...dados, synced: 0, atualizado_em: new Date().toISOString() };
  const id = await db[tabela].put(registro);
  agendarSincronizacao();
  return id;
}

/**
 * Remove localmente; a próxima sincronização replica a exclusão no Drive.
 */
export async function remover(tabela, id) {
  if (!TABELAS.includes(tabela)) throw new Error(`Tabela inválida: ${tabela}`);
  await db[tabela].delete(id);
  agendarSincronizacao();
}
