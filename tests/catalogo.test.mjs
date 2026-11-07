import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularCustoFicha,
  criarItensOS,
  criarRascunhoOrcamento,
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

test('cria orçamento customizado mantendo preço, sinal e composição escalada', () => {
  const rascunho = criarRascunhoOrcamento({
    titulo: 'Álbum com capa personalizada',
    composicao: [{ insumo_id: 1, quantidade: 2, nome: 'Papel', unidade: 'folhas' }],
    quantidade: 3,
    precoUnitario: 45.5,
    sinal: 20,
  });

  assert.equal(rascunho.titulo, 'Álbum com capa personalizada');
  assert.equal(rascunho.valor_total, 136.5);
  assert.equal(rascunho.sinal, 20);
  assert.equal(rascunho.saldo, 116.5);
  assert.deepEqual(rascunho.itens, [{ insumo_id: 1, quantidade: 6 }]);
  assert.equal(rascunho.detalhes[0].precoUnitario, 45.5);
  assert.equal(rascunho.detalhes[0].insumos[0].quantidade, 6);
});

test('rejeita orçamento com sinal acima do preço ajustado pelo usuário', () => {
  assert.throws(() => criarRascunhoOrcamento({
    titulo: 'Caderno',
    composicao: [{ insumo_id: 1, quantidade: 1 }],
    quantidade: 1,
    precoUnitario: 50,
    sinal: 51,
  }), /sinal não pode ser maior/);
});

test('combina múltiplos produtos e soma quantidades do mesmo insumo', () => {
  const rascunho = criarRascunhoOrcamento({
    produtos: [
      {
        produtoId: 1,
        titulo: 'Caderno',
        quantidade: 2,
        precoUnitario: 25.5,
        composicao: [{ insumo_id: 1, nome: 'Papel', unidade: 'folhas', quantidade: 3 }],
      },
      {
        produtoId: 2,
        titulo: 'Álbum',
        quantidade: 1,
        precoUnitario: 80,
        composicao: [
          { insumo_id: 1, nome: 'Papel', unidade: 'folhas', quantidade: 2 },
          { insumo_id: 2, nome: 'Tecido', unidade: 'm', quantidade: 0.5 },
        ],
      },
    ],
    sinal: 20,
  });

  assert.equal(rascunho.titulo, 'Orçamento: 2 × Caderno + 1 × Álbum');
  assert.equal(rascunho.valor_total, 131);
  assert.equal(rascunho.saldo, 111);
  assert.deepEqual(rascunho.itens, [
    { insumo_id: 1, quantidade: 8 },
    { insumo_id: 2, quantidade: 0.5 },
  ]);
  assert.equal(rascunho.detalhes.length, 2);
  assert.deepEqual(rascunho.detalhes.map((item) => item.produto_id), [1, 2]);
});
