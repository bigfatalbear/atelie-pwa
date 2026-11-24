/**
 * Cálculo puro de preço, compartilhado pela calculadora e pelo catálogo.
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

export function brl(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function arred(valor) {
  return Math.round(valor * 100) / 100;
}
