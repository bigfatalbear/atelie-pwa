import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularCustoFicha,
  criarItensOS,
  lerComposicaoFicha,
} from '../js/catalogo.mjs';

const insumos = [
  { id: 1, nome: 'Papel', unidade: 'folhas', custo_unitario: 10 },
  { id: 2, nome: 'Tecido', unidade: 'm', custo_unitario: 20 },
];

test('calcula custo, taxas, mão de obra e preço sugerido da ficha técnica', () => {
  const resultado = calcularCustoFicha({
    itens: [
      { insumo_id: 1, quantidade: 2 },
      { insumo_id: 2, quantidade: 0.5 },
    ],
    insumos,
    tempoMinutos: 30,
    valorHora: 60,
    taxaPagamento: 0.1,
    margemLucro: 0.25,
  });

  assert.equal(resultado.calculo.custoInsumos, 30);
  assert.equal(resultado.calculo.custoMaoDeObra, 30);
  assert.equal(resultado.calculo.custoTotal, 66);
  assert.equal(resultado.calculo.precoVenda, 88);
});

test('mescla quantidades repetidas do mesmo insumo e aceita ficha persistida como JSON', () => {
  const ficha = { itens: '[{"insumo_id":1,"quantidade":1},{"insumo_id":1,"quantidade":2}]' };
  const composicao = lerComposicaoFicha(ficha);
  const resultado = calcularCustoFicha({ itens: composicao, insumos });

  assert.equal(resultado.composicao.length, 1);
  assert.equal(resultado.composicao[0].quantidade, 3);
  assert.equal(resultado.calculo.custoTotal, 30);
});

test('valida ficha técnica, insumos removidos e quantidade para orçamento', () => {
  assert.throws(() => calcularCustoFicha({ itens: [], insumos }), /ao menos um insumo/);
  assert.throws(() => calcularCustoFicha({
    itens: [{ insumo_id: 5, quantidade: 1 }],
    insumos,
  }), /não está mais cadastrado/);
  assert.throws(() => criarItensOS([{ insumo_id: 1, quantidade: 2 }], 0), /inteiro maior que zero/);
  assert.deepEqual(criarItensOS([{ insumo_id: 1, quantidade: 2 }], 3), [
    { insumo_id: 1, quantidade: 6 },
  ]);
});
