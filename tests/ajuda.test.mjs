import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const ajuda = readFileSync(new URL('../js/ajuda.mjs', import.meta.url), 'utf8');
const css = readFileSync(new URL('../css/styles.css', import.meta.url), 'utf8');

test('oferece ajuda permanente no topo e botão flutuante sempre visível', () => {
  assert.match(html, /id="btn-ajuda-topo"[^>]*>❓ Ajuda/);
  assert.match(html, /id="btn-ajuda"[^>]*>❓ Como usar/);
  assert.match(css, /#btn-ajuda \{[\s\S]*position: fixed/);
  assert.match(ajuda, /botaoTopo\?\.addEventListener\('click'/);
});

test('cobre todos os módulos do sistema com explicações detalhadas', () => {
  for (const id of ['inicio', 'kanban', 'clientes', 'produtos', 'personalizacao', 'insumos', 'preco', 'financeiro', 'fotos', 'sync', 'dicas']) {
    assert.match(ajuda, new RegExp(`id: '${id}'`));
  }
  const passos = (ajuda.match(/tipo: 'passos'/g) || []).length;
  assert.ok(passos >= 15, `Esperava muitos passos, encontrei ${passos}`);
});

test('ajuda contextual existe em cada módulo e pode ser reaberta a qualquer momento', () => {
  for (const id of ['kanban', 'produtos', 'clientes', 'personalizacao', 'insumos', 'preco', 'financeiro', 'sync']) {
    assert.match(html, new RegExp(`data-ajuda="${id}"`));
  }
  assert.match(ajuda, /data-ajuda-contextual/);
  assert.match(ajuda, /adicionarBotoesContextuais\(\)/);
  assert.match(ajuda, /data-ajuda-rever/);
  assert.match(ajuda, /localStorage\.setItem\(CHAVE_AJUDA_VISTA/);
});

test('tipografia grande e contraste alto para facilitar a leitura', () => {
  assert.match(css, /\.ajuda-texto \{[\s\S]*font-size: 1\.2rem/);
  assert.match(css, /\.ajuda-passos li \{[\s\S]*font-size: 1\.15rem/);
  assert.match(css, /\.ajuda-titulo \{[\s\S]*font-size: 2\.1rem/);
  assert.match(css, /\.ajuda-dica \{[\s\S]*border: 3px solid/);
  assert.match(css, /@media \(max-width: 900px\)/);
});

test('guia é carregado junto com o aplicativo', () => {
  assert.match(app, /import \{ configurarAjuda \} from '\.\/ajuda\.mjs'/);
  assert.match(app, /configurarAjuda\(\);/);
});
