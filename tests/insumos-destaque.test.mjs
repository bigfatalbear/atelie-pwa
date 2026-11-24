import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');

test('formulário de cadastro de insumos aparece no topo da página', () => {
  const form = html.indexOf('<form id="form-insumo"');
  const resumo = html.indexOf('id="estoque-resumo"');
  const movimentacoes = html.indexOf('Movimentações recentes');
  assert.ok(form > 0 && resumo > 0 && movimentacoes > 0);
  assert.ok(form < resumo, 'o formulário deve vir antes do resumo');
  assert.ok(form < movimentacoes, 'o formulário deve vir antes das movimentações');
});

test('cadastro de insumos está visualmente destacado', () => {
  const trecho = html.slice(html.indexOf('<form id="form-insumo"'), html.indexOf('<form id="form-insumo"') + 400);
  assert.match(trecho, /border-2 border-emerald-500/);
  assert.match(trecho, /text-xl font-bold text-emerald-800/);
  const aba = html.slice(html.indexOf('data-tab="insumos"'), html.indexOf('data-tab="insumos"') + 260);
  assert.match(aba, /bg-emerald-700/);
  assert.match(aba, /ring-emerald-300/);
  assert.match(aba, /Insumos<\/button>/);
});

test('atalho do cabeçalho leva ao cadastro e foca o nome', () => {
  assert.match(html, /id="btn-ir-insumos"/);
  assert.match(html, /Ir para cadastro de insumos/);
  assert.match(app, /btn-ir-insumos.*addEventListener\('click'/s);
  assert.match(app, /ativarAba\('insumos'\)/);
  assert.match(app, /\$\('#ins-nome'\)\?\.focus\(\)/);
});

test('aba de insumos mantém destaque mesmo quando outra aba está ativa', () => {
  assert.match(app, /const destaqueInsumos = !ativa && b\.dataset\.tab === 'insumos'/);
  assert.match(app, /classList\.toggle\('bg-emerald-700', destaqueInsumos\)/);
});
