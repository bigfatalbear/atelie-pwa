/**
 * app.js — Inicialização, navegação e interfaces (Insumos, Precificação, Nova OS)
 */
import { db, salvar } from './db.js';
import {
  cadastrarConta,
  entrarConta,
  restaurarConfiguracaoSupabase,
  sairConta,
  sincronizarSupabase,
} from './supabase-sync.js';
import { calcularPrecoVenda, brl } from './precificacao.js';
import { renderKanban, novaOS, COLUNAS } from './kanban.js';

const $ = (sel) => document.querySelector(sel);
let supabaseAcaoEmAndamento = false;

// ============================================================
// INICIALIZAÇÃO
// ============================================================
// Registra o Service Worker (PWA offline)
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('[SW] registro falhou:', e));
}

document.addEventListener('DOMContentLoaded', async () => {
  configurarTabs();
  await configurarSupabaseUI();
  window.addEventListener('render-financeiro', renderFinanceiro);
  renderFinanceiro();
  await renderKanban();
  await renderInsumos();
  await renderCalcInsumos();
  await renderSelectInsumos();
  await renderClientes();

  $('#form-insumo')?.addEventListener('submit', aoCadastrarInsumo);
  $('#form-os')?.addEventListener('submit', aoCadastrarOS);
  $('#form-calc')?.addEventListener('input', calcularPreview);
  // Selo online/offline
  atualizarSelo();
  window.addEventListener('online', atualizarSelo);
  window.addEventListener('offline', atualizarSelo);
});

function atualizarSelo() {
  const selo = $('#selo-sync');
  if (!selo) return;
  const on = navigator.onLine;
  selo.textContent = on ? '🟢 Online' : '🔴 Offline';
  selo.title = on ? 'Conexão com a internet disponível' : 'Dados continuam salvos neste dispositivo';
}

async function configurarSupabaseUI() {
  try {
    const state = await restaurarConfiguracaoSupabase();
    atualizarSessaoSupabase(state.user);
    definirStatusSupabase(state.user
      ? `Conectado como ${state.user.email}.`
      : 'Projeto Supabase pronto. Entre ou crie sua conta para sincronizar.');
    if (state.user) agendarSincronizacaoAutomatica();
  } catch (error) {
    definirStatusSupabase(`Não foi possível iniciar a conexão Supabase: ${error.message}`, true);
  }

  $('#btn-supabase-entrar')?.addEventListener('click', () => autenticarSupabase('login'));
  $('#btn-supabase-criar-conta')?.addEventListener('click', () => autenticarSupabase('signup'));
  $('#btn-supabase-sair')?.addEventListener('click', desconectarSupabase);
  $('#btn-sync')?.addEventListener('click', () => sincronizarEAtualizar());
  document.querySelectorAll('[data-supabase-resolution]').forEach((button) => {
    button.addEventListener('click', () => sincronizarEAtualizar(button.dataset.supabaseResolution));
  });
  window.addEventListener('supabase-auth-changed', (event) => {
    atualizarSessaoSupabase(event.detail.user);
  });
  window.addEventListener('supabase-sync-requested', agendarSincronizacaoAutomatica);
  window.addEventListener('online', () => {
    atualizarSelo();
    agendarSincronizacaoAutomatica();
  });
}

function atualizarSessaoSupabase(user) {
  $('#supabase-session')?.classList.toggle('hidden', !user);
  $('#supabase-account')?.classList.toggle('hidden', Boolean(user));
  $('#supabase-session-email').textContent = user?.email || '';
}

async function autenticarSupabase(mode) {
  if (supabaseAcaoEmAndamento) return;
  supabaseAcaoEmAndamento = true;
  const buttons = [...document.querySelectorAll('#btn-supabase-entrar, #btn-supabase-criar-conta')];
  buttons.forEach((button) => { button.disabled = true; });
  try {
    const email = $('#supabase-email').value.trim();
    const password = $('#supabase-password').value;
    if (!email || !password) throw new Error('Informe seu e-mail e sua senha.');
    if (mode === 'signup') {
      const result = await cadastrarConta(email, password);
      if (result.confirmationRequired) {
        $('#supabase-password').value = '';
        definirStatusSupabase(`Conta criada. Enviamos um e-mail de confirmação para ${email}. Verifique sua caixa de entrada e a pasta de spam e confirme o cadastro antes de entrar.`);
        return;
      }
    } else {
      await entrarConta(email, password);
    }
    $('#supabase-password').value = '';
    atualizarSessaoSupabase({ email });
    definirStatusSupabase(`Conectado como ${email}. Verificando a sincronização…`);
    await sincronizarEAtualizar();
  } catch (error) {
    definirStatusSupabase(`Não foi possível autenticar: ${error.message}`, true);
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
    supabaseAcaoEmAndamento = false;
  }
}

async function desconectarSupabase() {
  try {
    await sairConta();
    atualizarSessaoSupabase(null);
    definirStatusSupabase('Sessão encerrada. Os dados locais permanecem neste dispositivo.');
  } catch (error) {
    definirStatusSupabase(`Não foi possível encerrar a sessão: ${error.message}`, true);
  }
}

let supabaseSyncTimer;
function agendarSincronizacaoAutomatica() {
  clearTimeout(supabaseSyncTimer);
  supabaseSyncTimer = setTimeout(async () => {
    if (!navigator.onLine) {
      definirStatusSupabase('Sem internet. As alterações permanecem salvas neste dispositivo.');
      return;
    }
    if ($('#supabase-session')?.classList.contains('hidden')) {
      definirStatusSupabase('As alterações foram salvas neste dispositivo. Entre na sua conta Supabase para sincronizar.');
      return;
    }
    try {
      const result = await sincronizarSupabase();
      await mostrarResultadoSupabase(result);
    } catch (error) {
      definirStatusSupabase(`Falha na sincronização automática: ${error.message}`, true);
    }
  }, 800);
}

async function sincronizarEAtualizar(resolution = null) {
  if (supabaseAcaoEmAndamento) return;
  supabaseAcaoEmAndamento = true;
  const buttons = [...document.querySelectorAll('#btn-sync, [data-supabase-resolution]')];
  buttons.forEach((button) => { button.disabled = true; });
  definirStatusSupabase('Sincronizando dados…');
  try {
    const result = await sincronizarSupabase(resolution);
    await mostrarResultadoSupabase(result);
  } catch (error) {
    definirStatusSupabase(`Não foi possível sincronizar: ${error.message}`, true);
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
    supabaseAcaoEmAndamento = false;
  }
}

function definirStatusSupabase(message, error = false) {
  const status = $('#supabase-status');
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('text-red-600', error);
  status.classList.toggle('text-slate-600', !error);
}

async function mostrarResultadoSupabase(result) {
  const choices = $('#supabase-resolution');
  if (result.needsChoice) {
    choices?.classList.remove('hidden');
    choices?.classList.add('flex');
    definirStatusSupabase(
      `Os dados locais (${result.localCount}) e os da nuvem (${result.cloudCount}) são diferentes. Escolha qual manter. Ao usar a nuvem, o app baixa um backup local antes da substituição; ao usar o dispositivo, cria um backup da nuvem.`
    );
    return;
  }
  choices?.classList.add('hidden');
  choices?.classList.remove('flex');
  if (!result.ok) {
    definirStatusSupabase(result.motivo || 'A sincronização não foi concluída.', true);
    return;
  }
  const mensagens = {
    imported: `${result.count} registro(s) carregado(s) do Supabase.`,
    uploaded: `${result.count} registro(s) salvo(s) no Supabase.`,
    synced: `${result.count} registro(s) sincronizados.`,
    ready: 'Supabase conectado; nenhum dado para sincronizar ainda.',
  };
  definirStatusSupabase(mensagens[result.action] || 'Sincronização concluída.');
  if (result.action === 'imported') {
    await Promise.all([
      renderKanban(),
      renderFinanceiro(),
      renderInsumos(),
      renderCalcInsumos(),
      renderSelectInsumos(),
      renderClientes(),
    ]);
  }
}

// ============================================================
// NAVEGAÇÃO (abas)
// ============================================================
function configurarTabs() {
  document.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-tab]').forEach((b) =>
        b.classList.toggle('bg-slate-800', b === btn) || b.classList.toggle('text-white', b === btn));
      document.querySelectorAll('[data-page]').forEach((p) => {
        p.classList.toggle('hidden', p.dataset.page !== btn.dataset.tab);
      });
    });
  });
}

// ============================================================
// CADASTRO DE INSUMOS
// ============================================================
async function aoCadastrarInsumo(e) {
  e.preventDefault();
  const nome = $('#ins-nome').value.trim();
  const quantidade = parseFloat($('#ins-qtd').value) || 0;
  const unidade = $('#ins-unidade').value;
  const custo_unitario = parseFloat($('#ins-custo').value) || 0;
  if (!nome) return;
  await salvar('insumos', { nome, quantidade, unidade, custo_unitario, categoria: 'matéria-prima', criado_em: new Date().toISOString() });
  e.target.reset();
  await renderInsumos();
  await renderCalcInsumos();
  await renderSelectInsumos();
}

async function renderInsumos() {
  const lista = $('#lista-insumos');
  if (!lista) return;
  const insumos = await db.insumos.toArray();
  lista.innerHTML = insumos.map((i) => `
    <li class="flex justify-between items-center bg-white dark:bg-slate-700 rounded-lg px-3 py-2 text-sm border border-slate-200 dark:border-slate-600">
      <span><strong>${i.nome}</strong> <em class="text-slate-500">(${i.unidade ?? ''})</em></span>
      <span class="tabular-nums ${i.quantidade <= 0 ? 'text-red-500 font-bold' : ''}">
        ${i.quantidade} × ${brl(i.custo_unitario || 0)}
      </span>
    </li>`).join('') || '<li class="text-sm text-slate-400 italic">Nenhum insumo cadastrado.</li>';
}

async function renderSelectInsumos() {
  const sel = $('#os-insumos-multiplo');
  if (!sel) return;
  const insumos = await db.insumos.toArray();
  sel.innerHTML = insumos.map((i) =>
    `<label class="flex items-center gap-2 text-sm py-1 flex-wrap">
      <input type="checkbox" value="${i.id}" data-nome="${i.nome}" data-custo="${i.custo_unitario || 0}">
      <span>${i.nome} <span class="text-xs text-slate-400">(estoque: ${i.quantidade})</span></span>
      <input type="number" min="0" step="0.01" value="1" placeholder="Qtd" class="input !w-20 !py-1 ml-auto">
    </label>`).join('');
}

// ============================================================
// PRECIFICAÇÃO
// ============================================================
async function renderCalcInsumos() {
  const el = $('#calc-insumos');
  if (!el) return;
  const insumos = await db.insumos.toArray();
  el.innerHTML = insumos.map((i) => `
    <label class="flex items-center gap-2 text-sm py-1">
      <input type="checkbox" value="${i.id}" data-nome="${i.nome}" data-custo="${i.custo_unitario || 0}">
      <span>${i.nome} <span class="text-xs text-slate-400">${brl(i.custo_unitario || 0)}/${i.unidade ?? 'un'}</span></span>
      <input type="number" min="0" step="0.01" value="1" placeholder="Qtd" class="input !w-20 !py-1 ml-auto">
    </label>`).join('') || '<p class="text-xs text-slate-400 italic">Cadastre insumos primeiro.</p>';
}

function coletarInsumosSelecionados() {
  return [...document.querySelectorAll('#calc-insumos label:has(input:checked)')].map((label) => {
    const cb = label.querySelector('input[type=checkbox]');
    const qtd = label.querySelector('input[type=number]');
    return {
      _id: Number(cb.value),
      insumo: { nome: cb.dataset.nome, custo_unitario: parseFloat(cb.dataset.custo) || 0 },
      quantidade: parseFloat(qtd?.value) || 1,
    };
  });
}

function calcularPreview() {
  const tempoMinutos = parseFloat($('#calc-tempo').value) || 0;
  const valorHora = parseFloat($('#calc-hora').value) || 0;
  const taxaPagamento = (parseFloat($('#calc-taxa').value) || 0) / 100;
  const margemLucro = (parseFloat($('#calc-margem').value) || 0) / 100;

  const insumos = coletarInsumosSelecionados().map((i) => ({ ...i, quantidade: i.quantidade || 1 }));

  try {
    const r = calcularPrecoVenda({ insumos, tempoMinutos, valorHora, taxaPagamento, margemLucro });
    $('#calc-resultado').innerHTML = `
      <dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt class="text-slate-500">Insumos</dt><dd class="text-right tabular-nums">${brl(r.custoInsumos)}</dd>
        <dt class="text-slate-500">Mão de obra</dt><dd class="text-right tabular-nums">${brl(r.custoMaoDeObra)}</dd>
        <dt class="text-slate-500">Taxas</dt><dd class="text-right tabular-nums">${brl(r.custoTaxas)}</dd>
        <dt class="text-slate-500 font-medium">Custo total</dt><dd class="text-right tabular-nums font-medium">${brl(r.custoTotal)}</dd>
        <dt class="col-span-2 mt-2 text-slate-500">Preço de venda sugerido</dt>
        <dd class="col-span-2 text-right text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">${brl(r.precoVenda)}</dd>
      </dl>`;
    $('#calc-resultado').dataset.valor = r.precoVenda;
  } catch (err) {
    $('#calc-resultado').innerHTML = `<p class="text-red-500 text-sm">${err.message}</p>`;
  }
}

// ============================================================
// NOVA ORDEM DE SERVIÇO
// ============================================================
async function aoCadastrarOS(e) {
  e.preventDefault();
  const titulo = $('#os-titulo').value.trim();
  if (!titulo) return;

  const valor_total = parseFloat($('#calc-resultado').dataset.valor || '0') || parseFloat($('#os-valor').value) || 0;
  const sinal = parseFloat($('#os-sinal').value) || 0;

  const itens = [...document.querySelectorAll('#os-insumos-multiplo input:checked')].map((cb) => ({
    insumo_id: Number(cb.value),
    quantidade: parseFloat(cb.closest('label')?.querySelector('input[type=number]')?.value) || 1,
  }));

  await novaOS({ titulo, itens: itens.filter((it) => it.insumo_id), valor_total, sinal });
  e.target.reset();
  $('#calc-resultado').innerHTML = '';
  $('#calc-resultado').dataset.valor = '';
  alert('✅ OS criada na coluna "Orçamento". Os insumos serão descontados ao mover para "Em Produção".');
}

// ============================================================
// FINANCEIRO (Sinal + Saldo Devedor na Entrega)
// ============================================================
async function renderFinanceiro() {
  const painel = $('#financeiro-painel');
  if (!painel) return;
  const ordens = await db.ordens_servico.toArray();
  const sinais = ordens.reduce((s, o) => s + (o.sinal || 0), 0);
  const prontos = ordens.filter((o) => o.status === 'Pronto');
  const saldosRecebidos = prontos.reduce((s, o) => s + Math.max(0, (o.valor_total || 0) - (o.sinal || 0)), 0);
  const pendente = ordens
    .filter((o) => o.status !== 'Pronto')
    .reduce((s, o) => s + Math.max(0, (o.valor_total || 0) - (o.sinal || 0)), 0);

  painel.innerHTML = `
    <div class="grid gap-3 sm:grid-cols-3 text-center">
      <div class="bg-emerald-50 dark:bg-emerald-900/30 rounded-lg p-3">
        <p class="text-xs uppercase text-slate-500">Sinais recebidos</p>
        <p class="text-xl font-bold text-emerald-600 tabular-nums">${brl(sinais)}</p>
      </div>
      <div class="bg-sky-50 dark:bg-sky-900/30 rounded-lg p-3">
        <p class="text-xs uppercase text-slate-500">Saldos recebidos (entregues)</p>
        <p class="text-xl font-bold text-sky-600 tabular-nums">${brl(saldosRecebidos)}</p>
      </div>
      <div class="bg-amber-50 dark:bg-amber-900/30 rounded-lg p-3">
        <p class="text-xs uppercase text-slate-500">Saldo devedor em aberto</p>
        <p class="text-xl font-bold text-amber-600 tabular-nums">${brl(pendente)}</p>
      </div>
    </div>`;
}

// ============================================================
// CLIENTES
// ============================================================
async function renderClientes() {
  const sel = $('#os-cliente');
  if (!sel) return;
  const clientes = await db.clientes.toArray();
  sel.innerHTML = '<option value="">— Sem cliente —</option>' +
    clientes.map((c) => `<option value="${c.id}">${c.nome}</option>`).join('');
}
