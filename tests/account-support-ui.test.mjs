import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const sync = readFileSync(new URL('../js/supabase-sync.js', import.meta.url), 'utf8');

test('developer support button exposes the exact Pix copy-and-paste payload', () => {
  const payload = '00020126330014br.gov.bcb.pix0111015619225015204000053039865802BR5921FABIO SILVA DOS ANJOS6009Sao Paulo62290525REC6AF09CB01264A2203363336304C140';

  assert.match(html, /id="btn-ajude-dev"[^>]*>[\s\S]*Ajude o desenvolvedor/);
  assert.match(html, new RegExp(`<textarea id="pix-copia-cola"[^>]*>${payload}</textarea>`));
  assert.match(html, /id="btn-copiar-pix"/);
  assert.match(app, /navigator\.clipboard\.writeText\(campo\.value\)/);
});

test('password recovery requests an email link and accepts a replacement password', () => {
  assert.match(html, /id="btn-supabase-recuperar-senha"[^>]*>Esqueci minha senha/);
  assert.match(html, /id="supabase-recovery-password"/);
  assert.match(sync, /resetPasswordForEmail\(email\.trim\(\)/);
  assert.match(sync, /updateUser\(\{ password \}\)/);
  assert.match(app, /event\.detail\.event === 'PASSWORD_RECOVERY'/);
});
