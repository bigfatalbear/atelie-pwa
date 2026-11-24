export const FORMAS_PAGAMENTO = ['pix', 'dinheiro', 'transferencia', 'cartao', 'outro'];

export function paraCentavos(valor) {
  const numero = typeof valor === 'string' ? Number(valor.trim().replace(',', '.')) : Number(valor);
  if (!Number.isFinite(numero) || numero < 0) throw new Error('Informe um valor válido igual ou maior que zero.');
  const centavos = Math.round((numero + Number.EPSILON) * 100);
  if (!Number.isSafeInteger(centavos)) throw new Error('O valor informado é muito alto.');
  return centavos;
}

function dataValida(data) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data))) return false;
  const [ano, mes, dia] = data.split('-').map(Number);
  const dataLida = new Date(Date.UTC(ano, mes - 1, dia));
  return dataLida.getUTCFullYear() === ano && dataLida.getUTCMonth() === mes - 1 && dataLida.getUTCDate() === dia;
}

function dataRegistro(data) {
  if (!dataValida(data)) throw new Error('Informe uma data válida.');
  return data;
}

export function criarLancamentoFinanceiro(dados) {
  const tipo = String(dados.tipo ?? '');
  if (!['entrada', 'saida'].includes(tipo)) throw new Error('Selecione uma receita ou despesa válida.');

  const valor_centavos = paraCentavos(dados.valor);
  if (valor_centavos <= 0) throw new Error('O valor do lançamento deve ser maior que zero.');

  const descricao = String(dados.descricao ?? '').trim();
  if (!descricao) throw new Error('Informe uma descrição para o lançamento.');
  if (descricao.length > 160) throw new Error('A descrição deve ter no máximo 160 caracteres.');

  const data = dataRegistro(dados.data);
  const status = tipo === 'entrada'
    ? 'recebido'
    : String(dados.status ?? 'pendente');
  if (tipo === 'saida' && !['pago', 'pendente'].includes(status)) {
    throw new Error('Selecione se a despesa está paga ou pendente.');
  }

  const vencimento = tipo === 'saida' ? dataRegistro(dados.vencimento || data) : null;
  const forma_pagamento = String(dados.forma_pagamento ?? '');
  if (tipo === 'entrada' && !FORMAS_PAGAMENTO.includes(forma_pagamento)) {
    throw new Error('Selecione uma forma de recebimento válida.');
  }

  const os_id = dados.os_id == null || dados.os_id === '' ? null : Number(dados.os_id);
  const cliente_id = dados.cliente_id == null || dados.cliente_id === '' ? null : Number(dados.cliente_id);
  if (os_id !== null && (!Number.isSafeInteger(os_id) || os_id <= 0)) throw new Error('A ordem de serviço selecionada é inválida.');
  if (cliente_id !== null && (!Number.isSafeInteger(cliente_id) || cliente_id <= 0)) throw new Error('O cliente selecionado é inválido.');

  return {
    tipo,
    status,
    valor_centavos,
    descricao,
    categoria: String(dados.categoria ?? '').trim().slice(0, 60) || (tipo === 'entrada' ? 'Serviços' : 'Outros'),
    data: status === 'pendente' ? vencimento : data,
    vencimento,
    forma_pagamento: tipo === 'entrada' ? forma_pagamento : '',
    os_id,
    cliente_id,
    observacao: String(dados.observacao ?? '').trim().slice(0, 300),
    origem: String(dados.origem ?? 'manual'),
  };
}

function valorOrdemCentavos(ordem) {
  try {
    return paraCentavos(ordem?.valor_total ?? 0);
  } catch {
    return 0;
  }
}

function sinalOrdemCentavos(ordem) {
  try {
    return paraCentavos(ordem?.sinal ?? 0);
  } catch {
    return 0;
  }
}

export function calcularSaldoOrdemCentavos(ordem, lancamentos = []) {
  const total = valorOrdemCentavos(ordem);
  const entradas = lancamentos.filter((lancamento) =>
    lancamento.tipo === 'entrada'
    && lancamento.status !== 'pendente'
    && lancamento.origem !== 'sinal-os'
    && Number(lancamento.os_id) === Number(ordem?.id));
  const recebido = sinalOrdemCentavos(ordem)
    + entradas.reduce((soma, lancamento) => soma + (Number(lancamento.valor_centavos) || 0), 0);

  if (ordem?.status === 'Pronto' && !ordem.financeiro_rastreado && entradas.length === 0) return 0;
  return Math.max(0, total - recebido);
}

function mesDaData(data) {
  return dataLocal(data).slice(0, 7);
}

function dataLocal(valor) {
  const texto = String(valor ?? '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return texto.slice(0, 10);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

function dataLegadaOS(ordem) {
  return dataLocal(ordem.saldo_pago || ordem.atualizado_em || ordem.criado_em || '');
}

export function calcularResumoFinanceiro({ ordens = [], lancamentos = [], mes }) {
  const receitas = [];
  const pagamentosPorOS = new Map();
  const sinaisPorOS = new Set();
  for (const lancamento of lancamentos) {
    if (lancamento.tipo === 'entrada' && lancamento.origem === 'sinal-os' && lancamento.os_id) {
      sinaisPorOS.add(Number(lancamento.os_id));
    }
    if (lancamento.tipo !== 'entrada' || lancamento.status === 'pendente' || !lancamento.os_id) continue;
    if (lancamento.origem === 'sinal-os') continue;
    const id = Number(lancamento.os_id);
    pagamentosPorOS.set(id, (pagamentosPorOS.get(id) || 0) + 1);
  }

  for (const ordem of ordens) {
    const sinal = sinalOrdemCentavos(ordem);
    if (sinal > 0 && !sinaisPorOS.has(Number(ordem.id))) {
      receitas.push({
        tipo: 'entrada',
        status: 'recebido',
        valor_centavos: sinal,
        descricao: `Sinal · ${ordem.titulo || `OS #${ordem.id}`}`,
        categoria: 'Sinal de OS',
        data: dataLocal(ordem.criado_em),
        os_id: ordem.id,
        cliente_id: ordem.cliente_id ?? null,
        origem: 'sinal-os',
      });
    }

    if (ordem.status === 'Pronto' && !ordem.financeiro_rastreado && !pagamentosPorOS.has(Number(ordem.id))) {
      const saldo = Math.max(0, valorOrdemCentavos(ordem) - sinal);
      if (saldo > 0) {
        receitas.push({
          tipo: 'entrada',
          status: 'recebido',
          valor_centavos: saldo,
          descricao: `Saldo recebido · ${ordem.titulo || `OS #${ordem.id}`}`,
          categoria: 'Saldo de OS',
          data: dataLegadaOS(ordem),
          os_id: ordem.id,
          cliente_id: ordem.cliente_id ?? null,
          origem: 'saldo-os-legado',
        });
      }
    }
  }

  const receitasDoPeriodo = [
    ...receitas.filter((item) => mesDaData(item.data) === mes),
    ...lancamentos.filter((item) =>
      item.tipo === 'entrada'
      && item.status !== 'pendente'
      && mesDaData(item.data) === mes),
  ];
  const despesasDoPeriodo = lancamentos.filter((item) =>
    item.tipo === 'saida'
    && (item.status === 'pendente'
      ? mesDaData(item.vencimento || item.data) === mes
      : mesDaData(item.data) === mes));
  const despesasPagas = despesasDoPeriodo
    .filter((item) => item.status === 'pago')
    .reduce((soma, item) => soma + (Number(item.valor_centavos) || 0), 0);
  const despesasPendentes = despesasDoPeriodo
    .filter((item) => item.status === 'pendente')
    .reduce((soma, item) => soma + (Number(item.valor_centavos) || 0), 0);
  const totalRecebido = receitasDoPeriodo.reduce((soma, item) => soma + item.valor_centavos, 0);

  const contasAReceber = ordens.map((ordem) => ({
    ordem,
    saldo_centavos: calcularSaldoOrdemCentavos(ordem, lancamentos),
  })).filter((item) => item.saldo_centavos > 0)
    .sort((a, b) => String(a.ordem.prazo || '').localeCompare(String(b.ordem.prazo || '')));

  const agora = new Date();
  const hoje = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
  const despesasVencidas = lancamentos
    .filter((item) => item.tipo === 'saida' && item.status === 'pendente' && (item.vencimento || item.data) < hoje)
    .reduce((soma, item) => soma + (Number(item.valor_centavos) || 0), 0);

  const movimentacoes = [
    ...receitasDoPeriodo,
    ...despesasDoPeriodo,
  ].sort((a, b) => String(b.status === 'pendente' ? b.vencimento || b.data : b.data)
    .localeCompare(String(a.status === 'pendente' ? a.vencimento || a.data : a.data))
    || Number(b.id || 0) - Number(a.id || 0));

  return {
    receitas_centavos: totalRecebido,
    despesas_pagas_centavos: despesasPagas,
    despesas_pendentes_centavos: despesasPendentes,
    saldo_centavos: totalRecebido - despesasPagas,
    a_receber_centavos: contasAReceber.reduce((soma, item) => soma + item.saldo_centavos, 0),
    despesas_vencidas_centavos: despesasVencidas,
    contasAReceber,
    movimentacoes,
  };
}
