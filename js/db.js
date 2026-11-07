/**
 * db.js — Camada de dados do Ateliê PWA
 * Dexie.js (IndexedDB offline-first) + Supabase (sync na nuvem)
 */

// ============================================================
// CONFIGURAÇÃO SUPABASE (habilite o modo offline antes de sync)
// Preencha com as credenciais do seu projeto (dashboard > Settings > API)
// ============================================================
export const SUPABASE_URL = 'https://SEU_PROJETO.supabase.co';
export const SUPABASE_ANON_KEY = 'SUA_CHAVE_ANON_PUBLICA';

// Cliente Supabase — só é instanciado se as credenciais forem preenchidas.
export const supabase =
  SUPABASE_URL.includes('SEU_PROJETO')
    ? null
    : supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// DEXIE — TABELAS LOCAIS (IndexedDB)
// ============================================================
export const db = new Dexie('AtelieDB');

db.version(1).stores({
  // Chaves primárias "++id" = auto-incremento; campos indexados após o &
  clientes:      '++id, nome, telefone, &email, criado_em',
  insumos:       '++id, nome, categoria, unidade, quantidade, custo_unitario, criado_em',
  produtos:      '++id, nome, tipo, preco_base, criado_em',
  fichas_tecnicas: '++id, produto_id, nome, criado_em',
  ordens_servico:  '++id, cliente_id, titulo, status, valor_total, sinal, criado_em, prazo',
});

// Tabela de metadados de sincronização (fila de envio)
db.version(1).stores().forEach(() => {}); // mantém a versão única

// ============================================================
// FILA DE SINCRONIZAÇÃO OFFLINE → SUPABASE
// ============================================================
// Estratégia: quando uma escrita ocorre offline, marcar `synced = 0`.
// Ao voltar a conexão (evento 'online'), envia em lote para o Supabase.

/**
 * Salva um registro em qualquer tabela local, marcando como pendente de sync.
 * @param {string} tabela - 'clientes' | 'insumos' | 'produtos' | 'fichas_tecnicas' | 'ordens_servico'
 * @param {object} dados - objeto com os campos (sem id para novo registro)
 * @returns {Promise<number>} id gerado
 */
export async function salvar(tabela, dados) {
  const registro = { ...dados, synced: 0, atualizado_em: new Date().toISOString() };
  return db[tabela].put(registro);
}

/**
 * Remove um registro localmente; se sync ativo, remove também na nuvem.
 */
export async function remover(tabela, id) {
  await db[tabela].delete(id);
  if (supabase) {
    await supabase.from(tabela).delete().eq('id', id);
  }
}

/**
 * Envia todos os registros pendentes ('synced = 0') para o Supabase (upsert).
 * Não faz nada se não houver cliente Supabase configurado ou conexão.
 */
export async function sincronizar() {
  if (!supabase || !navigator.onLine) return { ok: false, motivo: 'sem conexão ou credenciais' };

  const tabelas = ['clientes', 'insumos', 'produtos', 'fichas_tecnicas', 'ordens_servico'];
  const resultado = { ok: true, enviados: 0, erros: [] };

  for (const tabela of tabelas) {
    try {
      const pendentes = await db[tabela].filter((r) => !r.synced).toArray();
      if (pendentes.length === 0) continue;

      const { error } = await supabase.from(tabela).upsert(pendentes, { onConflict: 'id' });
      if (error) throw error;

      await db[tabela].bulkPut(pendentes.map((r) => ({ ...r, synced: 1 })));
      resultado.enviados += pendentes.length;
    } catch (e) {
      resultado.ok = false;
      resultado.erros.push({ tabela, erro: e.message });
    }
  }
  return resultado;
}

// Dispara sync automático ao voltar a conexão
window.addEventListener('online', () => {
  sincronizar().then((r) => {
    if (r.enviados) console.log(`[Ateliê] Sync automático: ${r.enviados} registros enviados.`);
  });
});

// Dispara sync na inicialização (se online)
if (supabase && navigator.onLine) {
  setTimeout(() => sincronizar(), 3000);
}
