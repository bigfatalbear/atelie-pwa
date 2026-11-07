import { calcularPrecoVenda } from './precificacao-core.mjs';

export function lerComposicaoFicha(ficha) {
  const itens = ficha?.itens ?? [];
  if (Array.isArray(itens)) return itens;
  if (typeof itens !== 'string') throw new Error('A composição salva neste produto está inválida.');
  try {
    const parsed = JSON.parse(itens || '[]');
    if (!Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch {
    throw new Error('A composição salva neste produto está inválida.');
  }
}

export function calcularCustoFicha({ itens, insumos, tempoMinutos = 0, valorHora = 0, taxaPagamento = 0, margemLucro = 0 }) {
  if (!Array.isArray(itens) || !itens.length) {
    throw new Error('Adicione ao menos um insumo à composição do produto.');
  }
  if (![tempoMinutos, valorHora, taxaPagamento, margemLucro].every(Number.isFinite)
    || tempoMinutos < 0 || valorHora < 0 || taxaPagamento < 0 || margemLucro < 0 || margemLucro >= 1) {
    throw new Error('Confira os valores de tempo, mão de obra, taxa e margem.');
  }

  const estoque = new Map(insumos.map((insumo) => [Number(insumo.id), insumo]));
  const quantidades = new Map();
  for (const item of itens) {
    const insumoId = Number(item.insumo_id);
    const quantidade = Number(item.quantidade);
    if (!Number.isInteger(insumoId) || !Number.isFinite(quantidade) || quantidade <= 0) {
      throw new Error('Cada insumo precisa ter uma quantidade maior que zero.');
    }
    if (!estoque.has(insumoId)) throw new Error('Um insumo desta composição não está mais cadastrado no estoque.');
    quantidades.set(insumoId, (quantidades.get(insumoId) || 0) + quantidade);
  }

  const composicao = [...quantidades].map(([insumo_id, quantidade]) => {
    const insumo = estoque.get(insumo_id);
    return { insumo_id, quantidade, nome: insumo.nome, unidade: insumo.unidade || '' };
  });
  const calculo = calcularPrecoVenda({
    insumos: composicao.map((item) => ({
      insumo: estoque.get(item.insumo_id),
      quantidade: item.quantidade,
    })),
    tempoMinutos,
    valorHora,
    taxaPagamento,
    margemLucro,
  });

  return { composicao, calculo };
}

export function criarItensOS(composicao, unidades = 1) {
  const quantidade = Number(unidades);
  if (!Number.isInteger(quantidade) || quantidade < 1) {
    throw new Error('A quantidade do produto deve ser um número inteiro maior que zero.');
  }
  return composicao.map((item) => ({
    insumo_id: item.insumo_id,
    quantidade: item.quantidade * quantidade,
  }));
}
