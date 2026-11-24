/**
 * kanban.js — Gestão do quadro Kanban de Ordens de Serviço
 * Colunas: Orçamento → Arte Aprovada → Aguardando Insumo → Em Produção → Pronto
 */
import { agendarSincronizacao, db, salvar, remover } from './db.js';
import { descontarEstoque, estornarEstoque, brl } from './precificacao.js';
import { criarLinkWhatsapp, montarMensagemOrcamento } from './whatsapp.mjs';
import { calcularSaldoOrdemCentavos, paraCentavos } from './financeiro.mjs';

export const COLUNAS = ['Orçamento', 'Arte Aprovada', 'Aguardando Insumo', 'Em Produção', 'Pronto'];

/** Cria uma nova OS na coluna "Orçamento" */
export async function novaOS(dados) {
  const agora = new Date();
  const agoraIso = agora.toISOString();
  const criadoEm = {
    titulo: dados.titulo,
    cliente_id: dados.cliente_id ?? null,
    ...(dados.produto_id ? { produto_id: dados.produto_id } : {}),
    descricao: dados.descricao ?? '',
    itens: JSON.stringify(dados.itens ?? []),   // [{insumo_id, quantidade}]
    ...(dados.orcamento_detalhes ? { orcamento_detalhes: dados.orcamento_detalhes } : {}),
    ...(dados.mensagem_adicional ? { mensagem_adicional: dados.mensagem_adicional } : {}),
    valor_total: dados.valor_total ?? 0,
    sinal: dados.sinal ?? 0,                   // Sinal pago na aprovação
    saldo: (dados.valor_total ?? 0) - (dados.sinal ?? 0), // Saldo devedor na entrega
    status: 'Orçamento',
    criado_em: agoraIso,
    atualizado_em: agoraIso,
    synced: 0,
  };
  const sinalCentavos = paraCentavos(dados.sinal ?? 0);
  const data = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
  const id = await db.transaction('rw', db.ordens_servico, db.financeiro_lancamentos, async () => {
    const ordemId = await db.ordens_servico.add(criadoEm);
    if (sinalCentavos > 0) {
      await db.financeiro_lancamentos.add({
        tipo: 'entrada',
        status: 'recebido',
        valor_centavos: sinalCentavos,
        descricao: `Sinal · ${dados.titulo || `OS #${ordemId}`}`,
        categoria: 'Sinal de OS',
        data,
        vencimento: null,
        forma_pagamento: '',
        os_id: Number(ordemId),
        cliente_id: dados.cliente_id ?? null,
        observacao: '',
        origem: 'sinal-os',
        criado_em: agoraIso,
        atualizado_em: agoraIso,
        synced: 0,
      });
    }
    return ordemId;
  });
  agendarSincronizacao();
  window.dispatchEvent(new CustomEvent('render-financeiro'));
  await renderKanban();
  return id;
}

/** Move a OS para outra coluna, disparando efeitos de status */
export async function moverOS(id, novoStatus) {
  const os = await db.ordens_servico.get(id);
  if (!os || os.status === novoStatus) return;

  const itens = typeof os.itens === 'string' ? JSON.parse(os.itens || '[]') : (os.itens || []);

  // Ao ENTRAR em "Em Produção": desconta matéria-prima do estoque
  if (novoStatus === 'Em Produção' && os.status !== 'Em Produção') {
    await descontarEstoque(db, itens, os.id);
  }
  // Se SAIR de "Em Produção" (cancelamento / voltar): estorna
  if (os.status === 'Em Produção' && novoStatus !== 'Em Produção' && novoStatus !== 'Pronto') {
    await estornarEstoque(db, itens, os.id);
  }

  if (novoStatus === 'Pronto') {
    await entregarOS(id);
    return;
  }

  await salvar('ordens_servico', { ...os, status: novoStatus });
  window.dispatchEvent(new CustomEvent('render-financeiro'));
  await renderKanban();
}

/** Remove uma OS */
export async function excluirOS(id) {
  const os = await db.ordens_servico.get(id);
  if (!os) return;
  if (os.status === 'Em Produção') {
    // Estorna insumos consumidos
    const itens = typeof os.itens === 'string' ? JSON.parse(os.itens || '[]') : (os.itens || []);
    await estornarEstoque(db, itens, os.id);
  }
  await remover('ordens_servico', id);
  window.dispatchEvent(new CustomEvent('render-financeiro'));
  await renderKanban();
}

/** Registra entrega: valida saldo devedor e lança entrada no financeiro */
export async function entregarOS(id) {
  const agora = new Date();
  const agoraIso = agora.toISOString();
  const data = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
  await db.transaction('rw', db.ordens_servico, db.financeiro_lancamentos, async () => {
    const os = await db.ordens_servico.get(Number(id));
    if (!os) return;
    if (os.status === 'Pronto') return;
    const lancamentos = await db.financeiro_lancamentos.where('os_id').equals(Number(id)).toArray();
    const saldoCentavos = calcularSaldoOrdemCentavos(os, lancamentos);
    if (saldoCentavos > 0) {
      await db.financeiro_lancamentos.add({
        tipo: 'entrada',
        status: 'recebido',
        valor_centavos: saldoCentavos,
        descricao: `Saldo recebido · ${os.titulo || `OS #${os.id}`}`,
        categoria: 'Saldo de OS',
        data,
        vencimento: null,
        forma_pagamento: '',
        os_id: Number(os.id),
        cliente_id: os.cliente_id ?? null,
        observacao: '',
        origem: 'entrega-os',
        criado_em: agoraIso,
        atualizado_em: agoraIso,
        synced: 0,
      });
    }
    await db.ordens_servico.put({
      ...os,
      status: 'Pronto',
      financeiro_rastreado: true,
      ...(saldoCentavos > 0 ? { saldo_pago: agoraIso } : {}),
      synced: 0,
      atualizado_em: agoraIso,
    });
  });
  agendarSincronizacao();
  window.dispatchEvent(new CustomEvent('render-financeiro'));
  await renderKanban();
}

/** Renderiza o quadro Kanban no elemento #kanban */
export async function renderKanban() {
  const el = document.getElementById('kanban');
  if (!el) return;

  const [ordens, clientes, lancamentos] = await Promise.all([
    db.ordens_servico.toArray(),
    db.clientes.toArray(),
    db.financeiro_lancamentos.toArray(),
  ]);
  const clientMap = Object.fromEntries(clientes.map((c) => [c.id, c]));

  el.innerHTML = COLUNAS.map((col) => {
    const cards = ordens.filter((o) => o.status === col);
    const total = cards.reduce((s, o) => s + (o.valor_total || 0), 0);
    const cor = {
      'Orçamento': 'border-t-slate-400',
      'Arte Aprovada': 'border-t-sky-500',
      'Aguardando Insumo': 'border-t-amber-500',
      'Em Produção': 'border-t-orange-500',
      'Pronto': 'border-t-emerald-500',
    }[col];

    return `
      <div class="kanban-col min-w-[270px] w-[270px] flex-shrink-0 bg-slate-100 dark:bg-slate-800 rounded-xl p-2 border-t-4 ${cor}">
        <div class="flex items-center justify-between px-1 pb-2">
          <h3 class="font-semibold text-sm uppercase tracking-wide text-slate-700 dark:text-slate-200">${col}</h3>
          <span class="text-xs font-mono bg-white dark:bg-slate-700 rounded-full px-2 py-0.5 text-slate-600 dark:text-slate-300">
            ${cards.length} · ${brl(total)}
          </span>
        </div>
        <div class="flex flex-col gap-2" data-col="${col}">
          ${cards.map((o) => cardOS(o, clientMap[o.cliente_id] ?? null, lancamentos)).join('') || '<p class="text-xs text-slate-400 text-center py-4 italic">Vazio</p>'}
        </div>
      </div>`;
  }).join('');

  vincularEventos();
}

function cardOS(os, cliente, lancamentos = []) {
  const saldoCentavos = calcularSaldoOrdemCentavos(os, lancamentos);
  const saldo = saldoCentavos / 100;
  const recebido = Math.max(0, Math.round((Number(os.valor_total) || 0) * 100) - saldoCentavos) / 100;
  const idx = COLUNAS.indexOf(os.status);
  const proxima = idx >= 0 && idx < COLUNAS.length - 1 ? COLUNAS[idx + 1] : null;
  const acaoWhatsapp = criarAcaoWhatsapp(os, cliente);

  return `
    <article class="bg-white dark:bg-slate-700 rounded-lg shadow-sm p-3 border border-slate-200 dark:border-slate-600"
             data-id="${os.id}" draggable="true">
      <div class="flex justify-between items-start gap-2">
        <div>
          <h4 class="font-medium text-sm text-slate-800 dark:text-slate-100">${escaparHtml(os.titulo)}</h4>
          <p class="text-xs text-slate-500 dark:text-slate-400">${escaparHtml(cliente?.nome ?? '—')} · ${escaparHtml(os.criado_em?.slice(0, 10) ?? '')}</p>
        </div>
        <button class="text-slate-300 hover:text-red-500 text-lg leading-none" data-excluir="${os.id}" aria-label="Excluir OS">×</button>
      </div>
      <div class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
        <span class="font-semibold text-emerald-600 dark:text-emerald-400">${brl(os.valor_total || 0)}</span>
        <span>Recebido: ${brl(recebido)}</span>
        ${saldo > 0 ? `<span class="text-amber-600 dark:text-amber-400">Em aberto: ${brl(saldo)}</span>` : '<span class="text-emerald-600">Pago ✓</span>'}
      </div>
      <div class="mt-2 flex gap-1">
        ${proxima ? `<button class="text-xs bg-slate-800 dark:bg-slate-900 text-white rounded px-2 py-1 hover:bg-slate-700" data-mover="${os.id}" data-destino="${proxima}">→ ${proxima}</button>` : ''}
        ${acaoWhatsapp}
        ${os.status === 'Pronto' ? `<span class="text-xs bg-emerald-100 text-emerald-700 rounded px-2 py-1">Entregar</span>` : ''}
      </div>
    </article>`;
}

function criarAcaoWhatsapp(os, cliente) {
  if (os.status !== 'Orçamento') return '';
  if (!cliente) return '<button type="button" disabled title="Vincule um cliente ao orçamento" class="text-xs rounded px-2 py-1 bg-slate-700 text-slate-400 cursor-not-allowed">WhatsApp indisponível</button>';
  if (!cliente.telefone) return '<button type="button" disabled title="Cadastre o WhatsApp deste cliente" class="text-xs rounded px-2 py-1 bg-slate-700 text-slate-400 cursor-not-allowed">WhatsApp não cadastrado</button>';

  try {
    const mensagem = montarMensagemOrcamento({
      cliente: cliente.nome || 'tudo bem',
      titulo: os.titulo || 'Orçamento',
      valorTotal: os.valor_total,
      sinal: os.sinal,
      detalhes: lerDetalhesOrcamento(os.orcamento_detalhes),
      observacao: os.mensagem_adicional || '',
    });
    const href = criarLinkWhatsapp(cliente.telefone, mensagem);
    return `<a class="text-xs bg-emerald-700 hover:bg-emerald-600 text-white rounded px-2 py-1" href="${escaparHtml(href)}" target="_blank" rel="noopener noreferrer" aria-label="Revisar orçamento de ${escaparHtml(cliente.nome)} no WhatsApp">Revisar no WhatsApp</a>`;
  } catch {
    return '<button type="button" disabled title="Corrija o número no cadastro do cliente" class="text-xs rounded px-2 py-1 bg-slate-700 text-amber-400 cursor-not-allowed">WhatsApp inválido</button>';
  }
}

function lerDetalhesOrcamento(detalhes) {
  if (Array.isArray(detalhes)) return detalhes;
  if (typeof detalhes !== 'string') return [];
  try {
    const parsed = JSON.parse(detalhes);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function escaparHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

/** Eventos de clique + drag & drop nativo dos cards */
function vincularEventos() {
  document.querySelectorAll('[data-mover]').forEach((btn) => {
    btn.onclick = () => moverOS(Number(btn.dataset.mover), btn.dataset.destino);
  });
  document.querySelectorAll('[data-excluir]').forEach((btn) => {
    btn.onclick = () => excluirOS(Number(btn.dataset.excluir));
  });

  // Drag & Drop
  document.querySelectorAll('#kanban [draggable]').forEach((card) => {
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', card.dataset.id);
      card.classList.add('opacity-40');
    });
    card.addEventListener('dragend', () => card.classList.remove('opacity-40'));
  });
  document.querySelectorAll('[data-col]').forEach((zona) => {
    zona.addEventListener('dragover', (e) => {
      e.preventDefault();
      zona.classList.add('ring-2', 'ring-sky-400', 'rounded-lg');
    });
    zona.addEventListener('dragleave', () => zona.classList.remove('ring-2', 'ring-sky-400', 'rounded-lg'));
    zona.addEventListener('drop', async (e) => {
      e.preventDefault();
      zona.classList.remove('ring-2', 'ring-sky-400', 'rounded-lg');
      const id = Number(e.dataTransfer.getData('text/plain'));
      if (id) await moverOS(id, zona.dataset.col);
    });
  });
}
