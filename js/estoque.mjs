export const TIPOS_MOVIMENTACAO = ['entrada', 'saida', 'perda', 'ajuste'];

export function validarDadosInsumo(dados) {
  const nome = String(dados.nome ?? '').trim();
  const unidade = String(dados.unidade ?? '').trim();
  const quantidade = Number(dados.quantidade);
  const custo_unitario = Number(dados.custo_unitario);
  const estoque_minimo = Number(dados.estoque_minimo ?? 0);

  if (!nome) throw new Error('Informe o nome do insumo.');
  if (!unidade) throw new Error('Selecione uma unidade de medida.');
  if (!Number.isFinite(quantidade) || quantidade < 0) throw new Error('A quantidade em estoque deve ser zero ou maior.');
  if (!Number.isFinite(custo_unitario) || custo_unitario < 0) throw new Error('O custo unitário deve ser zero ou maior.');
  if (!Number.isFinite(estoque_minimo) || estoque_minimo < 0) throw new Error('O estoque mínimo deve ser zero ou maior.');

  return {
    ...dados,
    nome,
    unidade,
    quantidade,
    custo_unitario,
    estoque_minimo,
    categoria: String(dados.categoria ?? '').trim() || 'Sem categoria',
    fornecedor: String(dados.fornecedor ?? '').trim(),
    localizacao: String(dados.localizacao ?? '').trim(),
  };
}

export function calcularResumoEstoque(insumos) {
  return insumos.reduce((resumo, insumo) => {
    const quantidade = Number(insumo.quantidade) || 0;
    const minimo = Number(insumo.estoque_minimo) || 0;
    resumo.itens += 1;
    resumo.valor += Math.max(0, quantidade) * (Number(insumo.custo_unitario) || 0);
    if (quantidade <= 0) resumo.zerados += 1;
    else if (minimo > 0 && quantidade <= minimo) resumo.baixos += 1;
    else resumo.regulares += 1;
    return resumo;
  }, { itens: 0, valor: 0, baixos: 0, zerados: 0, regulares: 0 });
}

export function classificarEstoque(insumo) {
  const quantidade = Number(insumo.quantidade) || 0;
  const minimo = Number(insumo.estoque_minimo) || 0;
  if (quantidade <= 0) return 'zerado';
  if (minimo > 0 && quantidade <= minimo) return 'baixo';
  return 'regular';
}

export function calcularSaldoMovimentacao({ saldoAtual, tipo, quantidade, permitirNegativo = false }) {
  const saldo = Number(saldoAtual);
  const valor = Number(quantidade);
  if (!Number.isFinite(saldo) || saldo < 0 && !permitirNegativo && tipo !== 'ajuste') {
    throw new Error('O saldo atual do insumo é inválido.');
  }
  if (!TIPOS_MOVIMENTACAO.includes(tipo)) throw new Error('Selecione um tipo de movimentação válido.');
  if (!Number.isFinite(valor) || valor < 0 || (tipo !== 'ajuste' && valor <= 0)) {
    throw new Error('Informe uma quantidade maior que zero.');
  }

  const variacao = tipo === 'entrada' ? valor
    : tipo === 'ajuste' ? valor - saldo
      : -valor;
  const saldoPosterior = saldo + variacao;
  if (saldoPosterior < 0 && !permitirNegativo) throw new Error('A quantidade informada é maior que o saldo disponível.');
  return { variacao, saldoPosterior };
}

export function calcularCustoMedio({ saldoAtual, custoAtual, quantidadeEntrada, custoEntrada }) {
  const saldo = Math.max(0, Number(saldoAtual) || 0);
  const quantidade = Number(quantidadeEntrada);
  const custo = Number(custoEntrada);
  if (!Number.isFinite(quantidade) || quantidade <= 0 || !Number.isFinite(custo) || custo < 0) {
    throw new Error('Informe quantidade e custo de entrada válidos.');
  }
  return ((saldo * (Number(custoAtual) || 0)) + (quantidade * custo)) / (saldo + quantidade);
}

export async function criarInsumoComEstoque(db, dados) {
  return db.transaction('rw', db.insumos, db.movimentacoes_estoque, async () => {
    const agora = new Date().toISOString();
    const insumoId = await db.insumos.add({
      ...dados,
      synced: 0,
      criado_em: agora,
      atualizado_em: agora,
    });
    if (dados.quantidade > 0) {
      await db.movimentacoes_estoque.add({
        insumo_id: insumoId,
        insumo_nome: dados.nome,
        tipo: 'entrada',
        quantidade: dados.quantidade,
        variacao: dados.quantidade,
        saldo_anterior: 0,
        saldo_posterior: dados.quantidade,
        custo_unitario: dados.custo_unitario,
        motivo: 'Estoque inicial',
        origem: 'cadastro',
        criado_em: agora,
        synced: 0,
      });
    }
    return insumoId;
  });
}

export async function registrarMovimentacoesEstoque(db, movimentacoes) {
  return db.transaction('rw', db.insumos, db.movimentacoes_estoque, async () => {
    const criadas = [];
    for (const dados of movimentacoes) {
      const insumo = await db.insumos.get(Number(dados.insumo_id));
      if (!insumo && dados.ignorarAusente) continue;
      if (!insumo) throw new Error('Um dos insumos selecionados não está mais cadastrado.');
      const saldoAtual = Number(insumo.quantidade) || 0;
      const { variacao, saldoPosterior } = calcularSaldoMovimentacao({
        saldoAtual,
        tipo: dados.tipo,
        quantidade: dados.quantidade,
        permitirNegativo: Boolean(dados.permitirNegativo),
      });
      const custoEntrada = dados.custo_unitario == null || dados.custo_unitario === ''
        ? Number(insumo.custo_unitario) || 0
        : Number(dados.custo_unitario);
      if (!Number.isFinite(custoEntrada) || custoEntrada < 0) throw new Error('O custo unitário deve ser zero ou maior.');
      const custoMedio = dados.tipo === 'entrada' && variacao > 0
        ? calcularCustoMedio({
          saldoAtual,
          custoAtual: insumo.custo_unitario,
          quantidadeEntrada: variacao,
          custoEntrada,
        })
        : Number(insumo.custo_unitario) || 0;
      const agora = new Date().toISOString();
      const movimento = {
        insumo_id: insumo.id,
        insumo_nome: insumo.nome,
        tipo: dados.tipo,
        quantidade: Number(dados.quantidade),
        variacao,
        saldo_anterior: saldoAtual,
        saldo_posterior: saldoPosterior,
        custo_unitario: custoEntrada,
        motivo: String(dados.motivo ?? '').trim(),
        origem: dados.origem || 'manual',
        referencia: String(dados.referencia ?? ''),
        criado_em: agora,
        synced: 0,
      };
      const movimentoId = await db.movimentacoes_estoque.add(movimento);
      await db.insumos.update(insumo.id, {
        quantidade: saldoPosterior,
        custo_unitario: custoMedio,
        synced: 0,
        atualizado_em: agora,
      });
      criadas.push({ ...movimento, id: movimentoId });
    }
    return criadas;
  });
}
