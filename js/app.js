/**
 * app.js — Inicialização, navegação e interfaces (Insumos, Precificação, Nova OS)
 */
import { db, salvar } from './db.js';
import { conectarDrive, lerConfiguracaoDrive, sincronizarDrive } from './google-drive.js';
import { calcularPrecoVenda, brl } from './precificacao.js';
import { renderKanban, novaOS, COLUNAS } from './kanban.js';

const $ = (sel) => document.querySelector(sel);
let driveConexaoEmAndamento = false;

// ============================================================
// INICIALIZAÇÃO
// ============================================================
// Registra o Service Worker (PWA offline)
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('[SW] registro falhou:', e));
}

document.addEventListener('DOMContentLoaded', async () => {
  configurarTabs();
  configurarGoogleDrive();
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

function configurarGoogleDrive() {
  const config = lerConfiguracaoDrive();
  if (config) {
    $('#drive-client-id').value = config.clientId || '';
    $('#drive-folder-url').value = config.folderUrl || '';
    definirStatusDrive('Dados locais preservados. Conecte-se para verificar a planilha no Drive.');
  } else {
    definirStatusDrive('Os dados ficam neste dispositivo até você conectar uma pasta do Google Drive.');
  }

  $('#btn-sync')?.addEventListener('click', () => conectarEAtualizar());
  $('#btn-drive-conectar')?.addEventListener('click', () => conectarEAtualizar());
  document.querySelectorAll('[data-drive-resolution]').forEach((button) => {
    button.addEventListener('click', () => conectarEAtualizar(button.dataset.driveResolution));
  });

  let timer;
  const sincronizarAutomaticamente = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (!navigator.onLine) {
        definirStatusDrive('Sem internet. As alterações foram salvas neste dispositivo e serão sincronizadas ao reconectar.');
        return;
      }
      try {
        const resultado = await sincronizarDrive();
        if (!resultado.ok && resultado.motivo?.startsWith('Conecte-se ao Google Drive')) {
          definirStatusDrive('Alterações salvas localmente. Conecte-se ao Google Drive para sincronizá-las.');
          return;
        }
        await mostrarResultadoDrive(resultado);
      } catch (error) {
        definirStatusDrive(`Falha na sincronização automática: ${error.message}`, true);
      }
    }, 800);
  };
  window.addEventListener('drive-sync-requested', sincronizarAutomaticamente);
  window.addEventListener('online', sincronizarAutomaticamente);
}

async function conectarEAtualizar(resolution = null) {
  if (driveConexaoEmAndamento) return;
  driveConexaoEmAndamento = true;
  const buttons = [...document.querySelectorAll('#btn-sync, #btn-drive-conectar, [data-drive-resolution]')];
  buttons.forEach((button) => { button.disabled = true; });
  definirStatusDrive('Conectando ao Google Drive e verificando os dados…');
  try {
    const resultado = await conectarDrive({
      clientId: $('#drive-client-id').value,
      folderUrl: $('#drive-folder-url').value,
      resolution,
    });
    await mostrarResultadoDrive(resultado);
  } catch (error) {
    definirStatusDrive(`Não foi possível sincronizar: ${error.message}`, true);
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
    driveConexaoEmAndamento = false;
  }
}

function definirStatusDrive(message, error = false) {
  const status = $('#drive-status');
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('text-red-600', error);
  status.classList.toggle('text-slate-600', !error);
}

async function mostrarResultadoDrive(resultado) {
  const choices = $('#drive-resolution');
  if (resultado.precisaEscolha) {
    choices?.classList.remove('hidden');
    choices?.classList.add('flex');
    definirStatusDrive(
      `Há dados diferentes nos dois lugares (${resultado.registrosLocais} locais e ${resultado.registrosDrive} na planilha). Escolha qual versão manter; um backup será criado no Drive antes da substituição.`
    );
    return;
  }
  choices?.classList.add('hidden');
  choices?.classList.remove('flex');
  if (!resultado.ok) {
    definirStatusDrive(resultado.motivo || 'A sincronização não foi concluída.', true);
    return;
  }
  const mensagens = {
    importado: `${resultado.registros} registro(s) carregado(s) da planilha do Google Drive.`,
    enviado: `${resultado.registros} registro(s) salvo(s) na planilha do Google Drive.`,
    atualizado: `${resultado.registros} registro(s) conferidos. Dados locais e do Drive estão iguais.`,
  };
  definirStatusDrive(mensagens[resultado.acao] || 'Sincronização concluída.');
  if (resultado.acao === 'importado') {
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
