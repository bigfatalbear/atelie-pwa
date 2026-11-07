import test from 'node:test';
import assert from 'node:assert/strict';
import {
  criarLinkWhatsapp,
  montarMensagemOrcamento,
  normalizarTelefoneWhatsapp,
} from '../js/whatsapp.mjs';

test('normaliza telefone brasileiro com DDD para o formato do wa.me', () => {
  assert.equal(normalizarTelefoneWhatsapp('(11) 99999-1234'), '5511999991234');
});

test('mantém número internacional informado com código do país', () => {
  assert.equal(normalizarTelefoneWhatsapp('+44 20 7946 0958'), '442079460958');
});

test('rejeita números curtos ou inválidos', () => {
  assert.throws(() => normalizarTelefoneWhatsapp('12345'), /número de WhatsApp válido/);
});

test('gera link click-to-chat com mensagem e valores detalhados do orçamento', () => {
  const mensagem = montarMensagemOrcamento({
    cliente: 'Ana',
    titulo: 'Convites de casamento',
    valorTotal: 1250,
    sinal: 250,
    detalhes: [{
      nome: 'Convite personalizado',
      quantidade: 2,
      precoUnitario: 625,
      subtotal: 1250,
      insumos: [{ nome: 'Papel especial', quantidade: 4, unidade: 'folhas' }],
    }],
    observacao: 'Prazo de produção: 7 dias úteis.',
  });
  const url = new URL(criarLinkWhatsapp('(11) 99999-1234', mensagem));

  assert.equal(url.origin + url.pathname, 'https://wa.me/5511999991234');
  assert.match(url.searchParams.get('text'), /Convites de casamento/);
  assert.match(url.searchParams.get('text'), /Valor total: R\$\s*1\.250,00/);
  assert.match(url.searchParams.get('text'), /Sinal: R\$\s*250,00/);
  assert.match(url.searchParams.get('text'), /Saldo restante: R\$\s*1\.000,00/);
  assert.match(url.searchParams.get('text'), /Convite personalizado — 2 × R\$\s*625,00 = R\$\s*1\.250,00/);
  assert.match(url.searchParams.get('text'), /Papel especial: 4 folhas/);
  assert.match(url.searchParams.get('text'), /Prazo de produção: 7 dias úteis\./);
});
