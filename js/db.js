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

db.version(2).stores({
  clientes: '++id, nome, telefone, &email, criado_em',
  insumos: '++id, nome, categoria, unidade, quantidade, custo_unitario, criado_em',
  produtos: '++id, nome, tipo, preco_base, criado_em',
  fichas_tecnicas: '++id, produto_id, nome, criado_em',
  ordens_servico: '++id, cliente_id, titulo, status, valor_total, sinal, criado_em, prazo',
  sync_backups: '++id, criado_em',
});

db.version(3).stores({
  clientes: '++id, nome, telefone, &email, criado_em',
  insumos: '++id, nome, categoria, unidade, quantidade, custo_unitario, estoque_minimo, criado_em',
  produtos: '++id, nome, tipo, preco_base, criado_em',
  fichas_tecnicas: '++id, produto_id, nome, criado_em',
  ordens_servico: '++id, cliente_id, titulo, status, valor_total, sinal, criado_em, prazo',
  sync_backups: '++id, criado_em',
  movimentacoes_estoque: '++id, insumo_id, tipo, criado_em',
});

db.version(4).stores({
  clientes: '++id, nome, telefone, &email, criado_em',
  insumos: '++id, nome, categoria, unidade, quantidade, custo_unitario, estoque_minimo, criado_em',
  produtos: '++id, nome, tipo, preco_base, criado_em',
  fichas_tecnicas: '++id, produto_id, nome, criado_em',
  ordens_servico: '++id, cliente_id, titulo, status, valor_total, sinal, criado_em, prazo',
  sync_backups: '++id, criado_em',
  movimentacoes_estoque: '++id, insumo_id, tipo, criado_em',
  financeiro_lancamentos: '++id, tipo, status, data, vencimento, os_id, criado_em',
});

export const TABELAS = [
  'clientes',
  'insumos',
  'produtos',
  'fichas_tecnicas',
  'ordens_servico',
  'movimentacoes_estoque',
  'financeiro_lancamentos',
];

export function agendarSincronizacao() {
  try {
    localStorage.setItem('atelie-supabase-local-dirty', '1');
  } catch {
    // O banco local continua disponível; sem o marcador será pedida confirmação de conflito.
  }
  window.dispatchEvent(new CustomEvent('supabase-sync-requested'));
}

/**
 * Persiste localmente e agenda a sincronização com o Supabase quando conectado.
 */
export async function salvar(tabela, dados) {
  if (!TABELAS.includes(tabela)) throw new Error(`Tabela inválida: ${tabela}`);
  const registro = { ...dados, synced: 0, atualizado_em: new Date().toISOString() };
  const id = await db[tabela].put(registro);
  agendarSincronizacao();
  return id;
}

/**
 * Remove localmente; a próxima sincronização replica a exclusão no Supabase.
 */
export async function remover(tabela, id) {
  if (!TABELAS.includes(tabela)) throw new Error(`Tabela inválida: ${tabela}`);
  await db[tabela].delete(id);
  agendarSincronizacao();
}
