import { agendarSincronizacao } from './db.js';

/**
 * precificacao.js — Motor de cálculo da precificação do ateliê.
 *
 * Fórmula:
 *   custoInsumos      = Σ (quantidade fracionada × custo unitário do insumo)
 *   custoMaoDeObra    = (tempoMinutos / 60) × valorHora
 *   custoBase         = custoInsumos + custoMaoDeObra
 *   custoTaxas        = custoBase × taxaPagamento          (ex.: 3% da maquineta)
 *   custoTotal        = custoBase + custoTaxas
 *   precoVenda        = custoTotal ÷ (1 − margemLucro)     (margem em decimal, ex.: 0.30)
 *
 * Também desconta automaticamente os insumos do estoque ao iniciar uma OS
 * (ver `descontarEstoque`), evitando estoque fantasma.
 */

/**
 * Calcula o preço de venda de um serviço/produto.
 * @param {object} p
 * @param {Array<{insumo: object, quantidade: number}>} p.insumos
 *   `insumo` = objeto do estoque ({ custo_unitario, unidade, nome }), `quantidade` = qty fracionada utilizada
 * @param {number} p.tempoMinutos - Tempo estimado de produção (min)
 * @param {number} p.valorHora    - Valor da hora/homem (R$)
 * @param {number} p.taxaPagamento- Taxa de pagamento em decimal (ex.: 0.033 para 3,3%)
 * @param {number} p.margemLucro  - Margem de lucro em decimal (ex.: 0.30 para 30%)
 * @returns {{custoInsumos, custoMaoDeObra, custoBase, custoTaxas, custoTotal, precoVenda, detalhes}}
 */
export function calcularPrecoVenda({ insumos = [], tempoMinutos = 0, valorHora = 0, taxaPagamento = 0, margemLucro = 0 }) {
  if (margemLucro >= 1) throw new Error('A margem de lucro deve ser menor que 100% (ex.: 0.30 = 30%).');

  let custoInsumos = 0;
  const detalhes = [];

  for (const item of insumos) {
    const custo = (item.insumo?.custo_unitario ?? 0) * (item.quantidade || 0);
    custoInsumos += custo;
    detalhes.push({
      nome: item.insumo?.nome ?? 'Insumo',
      quantidade: item.quantidade,
      unidade: item.insumo?.unidade ?? '',
      custoUnitario: item.insumo?.custo_unitario ?? 0,
      subtotal: custo,
    });
  }

  const custoMaoDeObra = (tempoMinutos / 60) * valorHora;
  const custoBase = custoInsumos + custoMaoDeObra;
  const custoTaxas = custoBase * taxaPagamento;
  const custoTotal = custoBase + custoTaxas;
  const precoVenda = custoTotal / (1 - margemLucro);

  return {
    custoInsumos: arred(custoInsumos),
    custoMaoDeObra: arred(custoMaoDeObra),
    custoBase: arred(custoBase),
    custoTaxas: arred(custoTaxas),
    custoTotal: arred(custoTotal),
    precoVenda: arred(precoVenda),
    detalhes,
  };
}

/**
 * Desconta automaticamente do estoque os insumos consumidos por uma OS.
 * Deve ser chamada ao mover a OS para "Em Produção".
 * @param {Dexie} db - instância Dexie
 * @param {Array<{insumo_id: number, quantidade: number}>} itens
 */
export async function descontarEstoque(db, itens = []) {
  await db.transaction('rw', db.insumos, async () => {
    for (const item of itens) {
      const insumo = await db.insumos.get(item.insumo_id);
      if (!insumo) continue;
      const novaQtd = (insumo.quantidade || 0) - (item.quantidade || 0);
      await db.insumos.update(item.insumo_id, {
        quantidade: novaQtd,
        synced: 0, // marca para sync
        atualizado_em: new Date().toISOString(),
      });
    }
  });
  agendarSincronizacao();
}

/**
 * Estorna insumos ao estoque (caso a OS seja cancelada/volte de status).
 */
export async function estornarEstoque(db, itens = []) {
  await db.transaction('rw', db.insumos, async () => {
    for (const item of itens) {
      const insumo = await db.insumos.get(item.insumo_id);
      if (!insumo) continue;
      await db.insumos.update(item.insumo_id, {
        quantidade: (insumo.quantidade || 0) + (item.quantidade || 0),
        synced: 0,
        atualizado_em: new Date().toISOString(),
      });
    }
  });
  agendarSincronizacao();
}

function arred(v) {
  return Math.round(v * 100) / 100;
}

/** Formata valor em Reais */
export function brl(v) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
