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

export function criarRascunhoOrcamento({ titulo, composicao, quantidade, precoUnitario, sinal = 0 }) {
  const nome = String(titulo ?? '').trim();
  const unidades = Number(quantidade);
  const preco = Number(precoUnitario);
  const entrada = Number(sinal);
  if (!nome) throw new Error('Informe o nome ou descrição que será exibido no orçamento.');
  if (!Number.isInteger(unidades) || unidades < 1) {
    throw new Error('A quantidade do produto deve ser um número inteiro maior que zero.');
  }
  if (!Number.isFinite(preco) || preco < 0) throw new Error('Informe um preço unitário válido.');
  if (!Number.isFinite(entrada) || entrada < 0) throw new Error('Informe um sinal válido.');

  const total = Math.round(preco * unidades * 100) / 100;
  if (entrada > total) throw new Error('O sinal não pode ser maior que o total do orçamento.');
  const itens = criarItensOS(composicao, unidades);
  const detalhes = [{
    nome,
    quantidade: unidades,
    precoUnitario: preco,
    subtotal: total,
    insumos: composicao.map((item) => ({
      nome: item.nome,
      quantidade: item.quantidade * unidades,
      unidade: item.unidade,
    })),
  }];
  return {
    titulo: nome,
    quantidade: unidades,
    itens,
    detalhes,
    valor_total: total,
    sinal: entrada,
    saldo: total - entrada,
  };
}
