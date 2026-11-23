import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_FOTOS_ORCAMENTO,
  MAX_FOTOS_PRODUTO,
  coletarFotosOrcamento,
  normalizarFotosProduto,
} from '../js/catalogo.mjs';

const foto = (n) => `data:image/webp;base64,YWJj${n}`;

test('normaliza fotos aceitando apenas data URLs de imagem válidas, sem duplicatas e dentro do limite', () => {
  const entrada = [foto(1), foto(1), 'javascript:alert(1)', 42, foto(2), foto(3), foto(4)];
  assert.deepEqual(normalizarFotosProduto(entrada), [foto(1), foto(2), foto(3)]);
  assert.equal(MAX_FOTOS_PRODUTO, 3);
});

test('rejeita foto maior que o limite de tamanho e retorna vazio para entrada inválida', () => {
  const gigante = `data:image/png;base64,${'A'.repeat(400_000)}`;
  assert.deepEqual(normalizarFotosProduto([gigante]), []);
  assert.deepEqual(normalizarFotosProduto(null), []);
  assert.deepEqual(normalizarFotosProduto('foto'), []);
});

test('coleta fotos de todas as linhas do orçamento sem repetir e respeita o limite global', () => {
  const linhas = [
    { fotos: [foto(1), foto(2)] },
    { fotos: [foto(2), foto(3)] },
    { fotos: 'invalido' },
    {},
  ];
  assert.deepEqual(coletarFotosOrcamento(linhas), [foto(1), foto(2), foto(3)]);
  assert.deepEqual(coletarFotosOrcamento(null), []);
  assert.equal(MAX_FOTOS_ORCAMENTO, 10);
  assert.equal(coletarFotosOrcamento([{ fotos: Array.from({ length: 20 }, (_, i) => foto(i)) }]).length, 10);
});
