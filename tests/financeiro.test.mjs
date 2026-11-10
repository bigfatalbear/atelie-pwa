import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularResumoFinanceiro,
  calcularSaldoOrdemCentavos,
  criarLancamentoFinanceiro,
  paraCentavos,
} from '../js/financeiro.mjs';

test('converte valores para centavos sem acumular frações binárias', () => {
  assert.equal(paraCentavos('12,34'), 1234);
  assert.equal(paraCentavos(0.1 + 0.2), 30);
  assert.throws(() => paraCentavos(-1), /valor válido/);
  assert.throws(() => paraCentavos(Number.MAX_SAFE_INTEGER), /muito alto/);
});

test('valida lançamentos de receita e despesa antes de persistir', () => {
  assert.deepEqual(criarLancamentoFinanceiro({
    tipo: 'entrada',
    descricao: ' Parcela do álbum ',
    valor: '25,50',
    data: '2026-11-10',
    forma_pagamento: 'pix',
    os_id: '4',
    cliente_id: '9',
  }), {
    tipo: 'entrada',
    status: 'recebido',
    valor_centavos: 2550,
    descricao: 'Parcela do álbum',
    categoria: 'Serviços',
    data: '2026-11-10',
    vencimento: null,
    forma_pagamento: 'pix',
    os_id: 4,
    cliente_id: 9,
    observacao: '',
    origem: 'manual',
  });

  assert.equal(criarLancamentoFinanceiro({
    tipo: 'saida',
    descricao: 'Aluguel',
    categoria: 'Estrutura',
    valor: 850,
    data: '2026-11-20',
    vencimento: '2026-11-20',
    status: 'pendente',
  }).status, 'pendente');

  assert.throws(() => criarLancamentoFinanceiro({
    tipo: 'entrada',
    descricao: 'Recebimento',
    valor: 10,
    data: '2026-02-30',
    forma_pagamento: 'pix',
  }), /data válida/);
  assert.throws(() => criarLancamentoFinanceiro({
    tipo: 'entrada',
    descricao: '',
    valor: 10,
    data: '2026-11-10',
    forma_pagamento: 'pix',
  }), /descrição/);
  assert.throws(() => criarLancamentoFinanceiro({
    tipo: 'entrada',
    descricao: 'Recebimento',
    valor: 10,
    data: '2026-11-10',
    forma_pagamento: 'cheque',
  }), /forma de recebimento/);
});

test('calcula saldo da OS com sinal e pagamentos parciais e impede saldo negativo', () => {
  const ordem = { id: 2, valor_total: 100, sinal: 20, status: 'Em Produção' };
  const pagamentos = [
    { tipo: 'entrada', status: 'recebido', os_id: 2, valor_centavos: 2500 },
    { tipo: 'saida', status: 'pago', os_id: 2, valor_centavos: 9000 },
    { tipo: 'entrada', status: 'pendente', os_id: 2, valor_centavos: 5000 },
  ];

  assert.equal(calcularSaldoOrdemCentavos(ordem, pagamentos), 5500);
  assert.equal(calcularSaldoOrdemCentavos(ordem, [
    ...pagamentos,
    { tipo: 'entrada', status: 'recebido', os_id: 2, valor_centavos: 10000 },
  ]), 0);
});

test('resume receitas, despesas pagas, contas a pagar e saldos das OS por mês', () => {
  const ordens = [
    {
      id: 1,
      titulo: 'Caderno artesanal',
      cliente_id: 8,
      valor_total: 120,
      sinal: 20,
      status: 'Em Produção',
      criado_em: '2026-11-03T10:00:00.000Z',
    },
    {
      id: 2,
      titulo: 'Álbum entregue legado',
      valor_total: 50,
      sinal: 10,
      status: 'Pronto',
      criado_em: '2026-10-25T10:00:00.000Z',
      saldo_pago: '2026-11-04T15:00:00.000Z',
    },
  ];
  const lancamentos = [
    {
      id: 1,
      tipo: 'entrada',
      status: 'recebido',
      os_id: 1,
      valor_centavos: 3000,
      data: '2026-11-05',
      descricao: 'Parcela',
    },
    {
      id: 2,
      tipo: 'saida',
      status: 'pago',
      valor_centavos: 1250,
      data: '2026-11-06',
      descricao: 'Embalagens',
    },
    {
      id: 3,
      tipo: 'saida',
      status: 'pendente',
      valor_centavos: 5000,
      data: '2026-11-20',
      vencimento: '2026-11-20',
      descricao: 'Aluguel',
    },
    {
      id: 4,
      tipo: 'entrada',
      status: 'pendente',
      valor_centavos: 100000,
      data: '2026-11-07',
      descricao: 'Não contabilizar até receber',
    },
  ];

  const resumo = calcularResumoFinanceiro({ ordens, lancamentos, mes: '2026-11' });
  assert.equal(resumo.receitas_centavos, 9000);
  assert.equal(resumo.despesas_pagas_centavos, 1250);
  assert.equal(resumo.despesas_pendentes_centavos, 5000);
  assert.equal(resumo.saldo_centavos, 7750);
  assert.equal(resumo.a_receber_centavos, 7000);
  assert.deepEqual(resumo.contasAReceber.map(({ ordem }) => ordem.id), [1]);
  assert.equal(resumo.movimentacoes.length, 5);
});

test('mantém o financeiro histórico das OS prontas sem duplicar sinais', () => {
  const antiga = {
    id: 5,
    titulo: 'Serviço entregue',
    valor_total: 80,
    sinal: 20,
    status: 'Pronto',
    criado_em: '2026-11-01T10:00:00.000Z',
    saldo_pago: '2026-11-08T12:00:00.000Z',
  };
  const resumoLegado = calcularResumoFinanceiro({
    ordens: [antiga],
    mes: '2026-11',
  });
  assert.equal(resumoLegado.receitas_centavos, 8000);
  assert.equal(calcularSaldoOrdemCentavos(antiga), 0);

  antiga.financeiro_rastreado = true;
  const resumoNovo = calcularResumoFinanceiro({
    ordens: [antiga],
    mes: '2026-11',
  });
  assert.equal(resumoNovo.receitas_centavos, 2000);
  assert.equal(calcularSaldoOrdemCentavos(antiga), 6000);
});

test('não duplica o sinal quando a OS já possui o lançamento financeiro original', () => {
  const ordem = {
    id: 12,
    titulo: 'Capa dura',
    valor_total: 90,
    sinal: 30,
    status: 'Orçamento',
    criado_em: '2026-11-09T15:00:00.000Z',
  };
  const sinal = {
    id: 7,
    tipo: 'entrada',
    status: 'recebido',
    origem: 'sinal-os',
    os_id: 12,
    valor_centavos: 3000,
    data: '2026-11-09',
    descricao: 'Sinal · Capa dura',
  };
  const resumo = calcularResumoFinanceiro({
    ordens: [ordem],
    lancamentos: [sinal],
    mes: '2026-11',
  });

  assert.equal(resumo.receitas_centavos, 3000);
  assert.equal(resumo.a_receber_centavos, 6000);
  assert.equal(calcularSaldoOrdemCentavos(ordem, [sinal]), 6000);
});
