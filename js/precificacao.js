import { agendarSincronizacao } from './db.js';
import { registrarMovimentacoesEstoque } from './estoque.mjs';
import { brl, calcularPrecoVenda } from './precificacao-core.mjs';

export { brl, calcularPrecoVenda };

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
/**
 * Desconta automaticamente do estoque os insumos consumidos por uma OS.
 * Deve ser chamada ao mover a OS para "Em Produção".
 * @param {Dexie} db - instância Dexie
 * @param {Array<{insumo_id: number, quantidade: number}>} itens
 */
export async function descontarEstoque(db, itens = [], osId = null) {
  await registrarMovimentacoesEstoque(db, itens.map((item) => ({
    insumo_id: item.insumo_id,
    quantidade: item.quantidade,
    tipo: 'saida',
    permitirNegativo: true,
    ignorarAusente: true,
    motivo: `Consumo automático na produção${osId ? ` da OS #${osId}` : ' da ordem de serviço'}`,
    origem: 'ordem_servico',
    referencia: osId ? `OS #${osId}` : '',
  })));
  if (itens.length) {
    agendarSincronizacao();
    window.dispatchEvent(new CustomEvent('estoque-atualizado'));
  }
}

/**
 * Estorna insumos ao estoque (caso a OS seja cancelada/volte de status).
 */
export async function estornarEstoque(db, itens = [], osId = null) {
  await registrarMovimentacoesEstoque(db, itens.map((item) => ({
    insumo_id: item.insumo_id,
    quantidade: item.quantidade,
    tipo: 'entrada',
    ignorarAusente: true,
    motivo: `Estorno de consumo${osId ? ` da OS #${osId}` : ' da ordem de serviço'}`,
    origem: 'ordem_servico',
    referencia: osId ? `OS #${osId}` : '',
  })));
  if (itens.length) {
    agendarSincronizacao();
    window.dispatchEvent(new CustomEvent('estoque-atualizado'));
  }
}
