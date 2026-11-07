import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularCustoMedio,
  calcularResumoEstoque,
  calcularSaldoMovimentacao,
  classificarEstoque,
  registrarMovimentacoesEstoque,
  validarDadosInsumo,
} from '../js/estoque.mjs';

test('preserva cadastros antigos e normaliza os novos campos do insumo', () => {
  assert.deepEqual(validarDadosInsumo({
    nome: '  Papel couchê ',
    unidade: 'folha',
    quantidade: '25.5',
    custo_unitario: '1.2',
  }), {
    nome: 'Papel couchê',
    unidade: 'folha',
    quantidade: 25.5,
    custo_unitario: 1.2,
    estoque_minimo: 0,
    categoria: 'Sem categoria',
    fornecedor: '',
    localizacao: '',
  });
});

test('rejeita dados inválidos de estoque e custo', () => {
  assert.throws(() => validarDadosInsumo({
    nome: '',
    unidade: 'un',
    quantidade: 1,
    custo_unitario: 2,
  }), /nome/);
  assert.throws(() => validarDadosInsumo({
    nome: 'Tecido',
    unidade: 'm',
    quantidade: -1,
    custo_unitario: 2,
  }), /quantidade/);
});

test('classifica alertas de estoque mínimo e calcula indicadores financeiros', () => {
  const insumos = [
    { quantidade: 2, estoque_minimo: 3, custo_unitario: 10 },
    { quantidade: 0, estoque_minimo: 5, custo_unitario: 7 },
    { quantidade: 12, estoque_minimo: 3, custo_unitario: 2 },
    { quantidade: 4, custo_unitario: 5 },
  ];

  assert.deepEqual(insumos.map(classificarEstoque), ['baixo', 'zerado', 'regular', 'regular']);
  assert.deepEqual(calcularResumoEstoque(insumos), {
    itens: 4,
    valor: 64,
    baixos: 1,
    zerados: 1,
    regulares: 2,
  });
});

test('valida entradas, saídas, perdas e ajuste para saldo informado', () => {
  assert.deepEqual(calcularSaldoMovimentacao({
    saldoAtual: 5,
    tipo: 'entrada',
    quantidade: 2,
  }), { variacao: 2, saldoPosterior: 7 });
  assert.deepEqual(calcularSaldoMovimentacao({
    saldoAtual: 5,
    tipo: 'saida',
    quantidade: 1.5,
  }), { variacao: -1.5, saldoPosterior: 3.5 });
  assert.deepEqual(calcularSaldoMovimentacao({
    saldoAtual: 5,
    tipo: 'ajuste',
    quantidade: 0,
  }), { variacao: -5, saldoPosterior: 0 });
  assert.throws(() => calcularSaldoMovimentacao({
    saldoAtual: 1,
    tipo: 'perda',
    quantidade: 2,
  }), /saldo disponível/);
});

test('calcula custo médio ponderado de entradas sem perder precisão fracionada', () => {
  assert.equal(calcularCustoMedio({
    saldoAtual: 10,
    custoAtual: 2,
    quantidadeEntrada: 5,
    custoEntrada: 5,
  }), 3);
});

test('persiste saldo e histórico juntos, calculando custo médio na entrada de compra', async () => {
  const registros = new Map([[1, {
    id: 1,
    nome: 'Papel',
    quantidade: 10,
    custo_unitario: 2,
  }]]);
  const movimentos = [];
  const insumosTable = {
    get: async (id) => registros.get(id),
    update: async (id, dados) => registros.set(id, { ...registros.get(id), ...dados }),
  };
  const movimentosTable = {
    add: async (movimento) => {
      const id = movimentos.length + 1;
      movimentos.push({ ...movimento, id });
      return id;
    },
  };
  const db = {
    insumos: insumosTable,
    movimentacoes_estoque: movimentosTable,
    transaction: async (_mode, _insumos, _movimentacoes, callback) => callback(),
  };

  await registrarMovimentacoesEstoque(db, [{
    insumo_id: 1,
    tipo: 'entrada',
    quantidade: 5,
    custo_unitario: 5,
    motivo: 'Reposição',
  }]);

  assert.equal(registros.get(1).quantidade, 15);
  assert.equal(registros.get(1).custo_unitario, 3);
  assert.equal(movimentos.length, 1);
  assert.equal(movimentos[0].saldo_anterior, 10);
  assert.equal(movimentos[0].saldo_posterior, 15);
  assert.equal(movimentos[0].motivo, 'Reposição');
});
