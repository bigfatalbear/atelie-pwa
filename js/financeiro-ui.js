import { db, remover, salvar } from './db.js';
import {
  calcularResumoFinanceiro,
  calcularSaldoOrdemCentavos,
  criarLancamentoFinanceiro,
  paraCentavos,
} from './financeiro.mjs';

const $ = (selector) => document.querySelector(selector);
const dinheiro = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
let listenersConfigurados = false;

function hojeLocal() {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const dia = String(agora.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

function mesAtual() {
  return hojeLocal().slice(0, 7);
}

function formatarData(data) {
  if (!data) return '—';
  const [ano, mes, dia] = String(data).slice(0, 10).split('-');
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : '—';
}

function escaparHtml(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

function dinheiroCentavos(valor) {
  return dinheiro.format((Number(valor) || 0) / 100);
}

function statusFinanceiro(mensagem, erro = false) {
  const status = $('#financeiro-status');
  if (!status) return;
  status.textContent = mensagem;
  status.classList.toggle('text-red-400', erro);
  status.classList.toggle('text-emerald-400', !erro);
}

function preencherOS(ordens, clientes, lancamentos) {
  const select = $('#financeiro-os');
  if (!select) return;
  const valorAtual = select.value;
  const clientesPorId = new Map(clientes.map((cliente) => [Number(cliente.id), cliente]));
  const disponiveis = ordens.map((ordem) => ({
    ordem,
    saldo: calcularSaldoOrdemCentavos(ordem, lancamentos),
  })).filter((item) => item.saldo > 0);

  select.innerHTML = '<option value="">Receita sem vínculo com OS</option>' + disponiveis.map(({ ordem, saldo }) => {
    const cliente = clientesPorId.get(Number(ordem.cliente_id));
    const label = `${ordem.titulo || `OS #${ordem.id}`} · ${cliente?.nome || 'Sem cliente'} · ${dinheiroCentavos(saldo)} em aberto`;
    return `<option value="${Number(ordem.id)}">${escaparHtml(label)}</option>`;
  }).join('');
  select.value = disponiveis.some(({ ordem }) => String(ordem.id) === valorAtual) ? valorAtual : '';
  atualizarLimiteRecebimento(ordens, lancamentos);
}

function atualizarLimiteRecebimento(ordens, lancamentos) {
  const campo = $('#financeiro-valor-entrada');
  const ajuda = $('#financeiro-entrada-ajuda');
  const osId = Number($('#financeiro-os')?.value);
  const ordem = ordens.find((item) => Number(item.id) === osId);
  if (!campo) return;
  const saldo = ordem ? calcularSaldoOrdemCentavos(ordem, lancamentos) : null;
  campo.max = saldo === null ? '' : (saldo / 100).toFixed(2);
  if (ajuda) ajuda.textContent = saldo === null
    ? 'Receita avulsa não altera o saldo de uma OS.'
    : `Saldo disponível desta OS: ${dinheiroCentavos(saldo)}.`;
}

async function carregarDados() {
  const [ordens, lancamentos, clientes] = await Promise.all([
    db.ordens_servico.toArray(),
    db.financeiro_lancamentos.toArray(),
    db.clientes.toArray(),
  ]);
  return { ordens, lancamentos, clientes };
}

export async function renderFinanceiro() {
  const painel = $('#financeiro-painel');
  if (!painel) return;

  try {
    const mes = $('#financeiro-periodo')?.value || mesAtual();
    const { ordens, lancamentos, clientes } = await carregarDados();
    const resumo = calcularResumoFinanceiro({ ordens, lancamentos, mes });
    preencherOS(ordens, clientes, lancamentos);
    renderIndicadores(painel, resumo);
    renderContasAReceber(resumo.contasAReceber, ordens, lancamentos, clientes);
    renderMovimentacoes(resumo.movimentacoes);
  } catch (error) {
    painel.innerHTML = `<p class="text-red-400" role="alert">Não foi possível carregar o financeiro: ${escaparHtml(error.message)}.</p>`;
  }
}

function renderIndicadores(painel, resumo) {
  painel.innerHTML = `
    <div class="financeiro-resumo" aria-live="polite">
      <article class="financeiro-saldo">
        <h3>Saldo do período</h3>
        <p class="${resumo.saldo_centavos < 0 ? 'text-rose-300' : 'text-sky-300'}">${dinheiroCentavos(resumo.saldo_centavos)}</p>
        <span>Recebimentos menos despesas pagas.</span>
      </article>
      <div class="financeiro-indicadores">
        <article class="financeiro-indicador">
          <h3>Recebido no mês</h3>
          <p class="text-emerald-300">${dinheiroCentavos(resumo.receitas_centavos)}</p>
          <span>Sinais e recebimentos registrados.</span>
        </article>
        <article class="financeiro-indicador">
          <h3>Despesas pagas</h3>
          <p>${dinheiroCentavos(resumo.despesas_pagas_centavos)}</p>
          <span>${dinheiroCentavos(resumo.despesas_pendentes_centavos)} a vencer no mês.</span>
        </article>
        <article class="financeiro-indicador">
          <h3>Contas a receber</h3>
          <p class="text-amber-300">${dinheiroCentavos(resumo.a_receber_centavos)}</p>
          <span>Saldo aberto em todas as OS.</span>
        </article>
        <article class="financeiro-indicador">
          <h3>Despesas vencidas</h3>
          <p class="text-rose-300">${dinheiroCentavos(resumo.despesas_vencidas_centavos)}</p>
          <span>Pagamentos pendentes em atraso.</span>
        </article>
      </div>
    </div>`;
}

function renderContasAReceber(contas, ordens, lancamentos, clientes) {
  const lista = $('#financeiro-contas-receber');
  if (!lista) return;
  const clientesPorId = new Map(clientes.map((cliente) => [Number(cliente.id), cliente]));
  lista.innerHTML = contas.map(({ ordem, saldo_centavos }) => {
    const cliente = clientesPorId.get(Number(ordem.cliente_id));
    const recebido = Math.max(0, paraCentavos(ordem.valor_total || 0) - saldo_centavos);
    return `
      <tr>
        <td><strong>${escaparHtml(ordem.titulo || `OS #${ordem.id}`)}</strong><span>${escaparHtml(cliente?.nome || 'Sem cliente')} · ${escaparHtml(ordem.status || '')}</span></td>
        <td>${dinheiroCentavos(recebido)}</td>
        <td class="text-amber-300">${dinheiroCentavos(saldo_centavos)}</td>
        <td>${formatarData(ordem.prazo)}</td>
        <td><button type="button" class="financeiro-link" data-financeiro-receber="${Number(ordem.id)}">Registrar recebimento</button></td>
      </tr>`;
  }).join('') || '<tr><td colspan="5" class="financeiro-vazio">Todas as ordens estão quitadas. Novos recebimentos avulsos podem ser lançados abaixo.</td></tr>';

  lista.querySelectorAll('[data-financeiro-receber]').forEach((botao) => {
    botao.addEventListener('click', () => {
      const ordem = ordens.find((item) => Number(item.id) === Number(botao.dataset.financeiroReceber));
      if (!ordem) return;
      $('#financeiro-os').value = String(ordem.id);
      atualizarLimiteRecebimento(ordens, lancamentos);
      $('#financeiro-valor-entrada').focus();
    });
  });
}

function renderMovimentacoes(movimentacoes) {
  const lista = $('#financeiro-movimentacoes');
  if (!lista) return;
  lista.innerHTML = movimentacoes.map((item) => {
    const entrada = item.tipo === 'entrada';
    const status = item.status === 'pendente' ? 'Pendente' : entrada ? 'Recebido' : 'Pago';
    const data = item.status === 'pendente' ? item.vencimento || item.data : item.data;
    const descricao = item.os_id ? `${item.descricao} · OS #${Number(item.os_id)}` : item.descricao;
    const excluir = item.origem !== 'sinal-os';
    const acoes = item.id
      ? `<div class="flex flex-wrap gap-2">
          ${!entrada ? `<button type="button" class="financeiro-link" data-financeiro-toggle="${Number(item.id)}" data-financeiro-status="${item.status}">${item.status === 'pendente' ? 'Marcar como paga' : 'Voltar para pendente'}</button>` : ''}
          ${excluir ? `<button type="button" class="financeiro-link financeiro-link--perigo" data-financeiro-excluir="${Number(item.id)}">Excluir</button>` : '<span class="text-xs text-slate-500">Sinal vinculado à OS</span>'}
        </div>`
      : '<span class="text-xs text-slate-500">Gerado pela OS</span>';
    return `
      <tr>
        <td>${formatarData(data)}</td>
        <td><strong>${escaparHtml(descricao)}</strong><span>${escaparHtml(item.categoria || '—')}${item.forma_pagamento ? ` · ${escaparHtml(item.forma_pagamento)}` : ''}</span></td>
        <td><span class="financeiro-status financeiro-status--${entrada ? 'entrada' : item.status}">${status}</span></td>
        <td class="${entrada ? 'text-emerald-300' : item.status === 'pendente' ? 'text-amber-300' : 'text-rose-300'}">${entrada ? '+' : '−'}${dinheiroCentavos(item.valor_centavos)}</td>
        <td>${acoes}</td>
      </tr>`;
  }).join('') || '<tr><td colspan="5" class="financeiro-vazio">Nenhum lançamento neste mês. Registre recebimentos e despesas para acompanhar o caixa.</td></tr>';
}

async function aoRegistrarRecebimento(event) {
  event.preventDefault();
  const botao = $('#financeiro-salvar-entrada');
  botao.disabled = true;
  try {
    const { ordens, lancamentos } = await carregarDados();
    const osId = $('#financeiro-os').value;
    const ordem = ordens.find((item) => String(item.id) === osId);
    const registro = criarLancamentoFinanceiro({
      tipo: 'entrada',
      descricao: $('#financeiro-descricao-entrada').value || (ordem ? `Recebimento · ${ordem.titulo}` : 'Receita avulsa'),
      valor: $('#financeiro-valor-entrada').value,
      data: $('#financeiro-data-entrada').value,
      forma_pagamento: $('#financeiro-forma').value,
      os_id: ordem?.id,
      cliente_id: ordem?.cliente_id,
      observacao: $('#financeiro-observacao-entrada').value,
    });
    if (ordem && registro.valor_centavos > calcularSaldoOrdemCentavos(ordem, lancamentos)) {
      throw new Error('O valor excede o saldo em aberto desta OS.');
    }
    await salvar('financeiro_lancamentos', registro);
    $('#form-financeiro-entrada').reset();
    definirDatasPadrao();
    statusFinanceiro('Recebimento registrado e incluído no saldo da OS.');
    await renderFinanceiro();
  } catch (error) {
    statusFinanceiro(error.message || 'Não foi possível registrar o recebimento.', true);
  } finally {
    botao.disabled = false;
  }
}

async function aoRegistrarDespesa(event) {
  event.preventDefault();
  const botao = $('#financeiro-salvar-despesa');
  botao.disabled = true;
  try {
    const registro = criarLancamentoFinanceiro({
      tipo: 'saida',
      descricao: $('#financeiro-descricao-despesa').value,
      categoria: $('#financeiro-categoria-despesa').value,
      valor: $('#financeiro-valor-despesa').value,
      data: $('#financeiro-vencimento-despesa').value,
      vencimento: $('#financeiro-vencimento-despesa').value,
      status: $('#financeiro-status-despesa').value,
      observacao: $('#financeiro-observacao-despesa').value,
    });
    await salvar('financeiro_lancamentos', registro);
    $('#form-financeiro-despesa').reset();
    definirDatasPadrao();
    atualizarRotuloDataDespesa();
    statusFinanceiro('Despesa registrada.');
    await renderFinanceiro();
  } catch (error) {
    statusFinanceiro(error.message || 'Não foi possível registrar a despesa.', true);
  } finally {
    botao.disabled = false;
  }
}

async function alterarStatusDespesa(id, statusAtual) {
  try {
    const lancamento = await db.financeiro_lancamentos.get(id);
    if (!lancamento || lancamento.tipo !== 'saida') throw new Error('A despesa selecionada não foi encontrada.');
    const agora = hojeLocal();
    const pendente = statusAtual !== 'pendente';
    await salvar('financeiro_lancamentos', {
      ...lancamento,
      status: pendente ? 'pendente' : 'pago',
      data: pendente ? lancamento.vencimento || lancamento.data : agora,
      ...(pendente ? { pago_em: null } : { pago_em: new Date().toISOString() }),
    });
    statusFinanceiro(pendente ? 'Despesa voltou para pendente.' : 'Despesa marcada como paga.');
    await renderFinanceiro();
  } catch (error) {
    statusFinanceiro(error.message || 'Não foi possível atualizar a despesa.', true);
  }
}

async function excluirLancamento(id) {
  try {
    const lancamento = await db.financeiro_lancamentos.get(id);
    if (!lancamento) {
      statusFinanceiro('O lançamento não foi encontrado.', true);
      return;
    }
    if (!window.confirm(`Excluir o lançamento "${lancamento.descricao}" de ${dinheiroCentavos(lancamento.valor_centavos)}?`)) return;
    await remover('financeiro_lancamentos', id);
    statusFinanceiro('Lançamento excluído.');
    await renderFinanceiro();
  } catch (error) {
    statusFinanceiro(error.message || 'Não foi possível excluir o lançamento.', true);
  }
}

function aoAcionarMovimentacao(event) {
  const toggle = event.target.closest('[data-financeiro-toggle]');
  if (toggle) {
    void alterarStatusDespesa(Number(toggle.dataset.financeiroToggle), toggle.dataset.financeiroStatus);
    return;
  }
  const excluir = event.target.closest('[data-financeiro-excluir]');
  if (excluir) void excluirLancamento(Number(excluir.dataset.financeiroExcluir));
}

function definirDatasPadrao() {
  const data = hojeLocal();
  $('#financeiro-data-entrada').value = data;
  $('#financeiro-vencimento-despesa').value = data;
}

function atualizarRotuloDataDespesa() {
  const label = $('#financeiro-data-despesa-label');
  if (label) {
    label.textContent = $('#financeiro-status-despesa').value === 'pago'
      ? 'Data do pagamento'
      : 'Vencimento';
  }
}

export function configurarFinanceiro() {
  if (listenersConfigurados) return;
  listenersConfigurados = true;

  $('#financeiro-periodo')?.addEventListener('change', () => { void renderFinanceiro(); });
  $('#form-financeiro-entrada')?.addEventListener('submit', aoRegistrarRecebimento);
  $('#form-financeiro-despesa')?.addEventListener('submit', aoRegistrarDespesa);
  $('#financeiro-status-despesa')?.addEventListener('change', atualizarRotuloDataDespesa);
  $('#financeiro-movimentacoes')?.addEventListener('click', aoAcionarMovimentacao);
  $('#financeiro-os')?.addEventListener('change', async () => {
    try {
      const { ordens, lancamentos } = await carregarDados();
      atualizarLimiteRecebimento(ordens, lancamentos);
    } catch (error) {
      statusFinanceiro(error.message || 'Não foi possível atualizar o saldo desta OS.', true);
    }
  });
  $('#financeiro-periodo').value = mesAtual();
  definirDatasPadrao();
  window.addEventListener('render-financeiro', () => { void renderFinanceiro(); });
}
