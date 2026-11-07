/**
 * kanban.js — Gestão do quadro Kanban de Ordens de Serviço
 * Colunas: Orçamento → Arte Aprovada → Aguardando Insumo → Em Produção → Pronto
 */
import { db, salvar, remover } from './db.js';
import { descontarEstoque, estornarEstoque, brl } from './precificacao.js';

export const COLUNAS = ['Orçamento', 'Arte Aprovada', 'Aguardando Insumo', 'Em Produção', 'Pronto'];

/** Cria uma nova OS na coluna "Orçamento" */
export async function novaOS(dados) {
  const id = await salvar('ordens_servico', {
    titulo: dados.titulo,
    cliente_id: dados.cliente_id ?? null,
    descricao: dados.descricao ?? '',
    itens: JSON.stringify(dados.itens ?? []),   // [{insumo_id, quantidade}]
    valor_total: dados.valor_total ?? 0,
    sinal: dados.sinal ?? 0,                   // Sinal pago na aprovação
    saldo: (dados.valor_total ?? 0) - (dados.sinal ?? 0), // Saldo devedor na entrega
    status: 'Orçamento',
    criado_em: new Date().toISOString(),
  });
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
    await descontarEstoque(db, itens);
  }
  // Se SAIR de "Em Produção" (cancelamento / voltar): estorna
  if (os.status === 'Em Produção' && novoStatus !== 'Em Produção') {
    await estornarEstoque(db, itens);
  }

  await salvar('ordens_servico', { ...os, status: novoStatus });
  await renderKanban();
}

/** Remove uma OS */
export async function excluirOS(id) {
  const os = await db.ordens_servico.get(id);
  if (!os) return;
  if (os.status === 'Em Produção') {
    // Estorna insumos consumidos
    const itens = typeof os.itens === 'string' ? JSON.parse(os.itens || '[]') : (os.itens || []);
    await estornarEstoque(db, itens);
  }
  await remover('ordens_servico', id);
  await renderKanban();
}

/** Registra entrega: valida saldo devedor e lança entrada no financeiro */
export async function entregarOS(id) {
  const os = await db.ordens_servico.get(id);
  if (!os) return;

  const saldo = Math.max(0, (os.valor_total || 0) - (os.sinal || 0));
  // Lança o saldo no fluxo de caixa como "entrada" na entrega
  if (saldo > 0) {
    await db.transaction('rw', db.ordens_servico, async () => {
      await salvar('ordens_servico', { ...os, status: 'Pronto', saldo_pago: new Date().toISOString() });
    });
  } else {
    await salvar('ordens_servico', { ...os, status: 'Pronto' });
  }
  await renderKanban();
}

/** Renderiza o quadro Kanban no elemento #kanban */
export async function renderKanban() {
  const el = document.getElementById('kanban');
  if (!el) return;

  const [ordens, clientes] = await Promise.all([db.ordens_servico.toArray(), db.clientes.toArray()]);
  const clientMap = Object.fromEntries(clientes.map((c) => [c.id, c.nome]));

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
          ${cards.map((o) => cardOS(o, clientMap[o.cliente_id] ?? '—')).join('') || '<p class="text-xs text-slate-400 text-center py-4 italic">Vazio</p>'}
        </div>
      </div>`;
  }).join('');

  vincularEventos();
}

function cardOS(os, cliente) {
  const saldo = Math.max(0, (os.valor_total || 0) - (os.sinal || 0));
  const idx = COLUNAS.indexOf(os.status);
  const proxima = idx >= 0 && idx < COLUNAS.length - 1 ? COLUNAS[idx + 1] : null;

  return `
    <article class="bg-white dark:bg-slate-700 rounded-lg shadow-sm p-3 border border-slate-200 dark:border-slate-600"
             data-id="${os.id}" draggable="true">
      <div class="flex justify-between items-start gap-2">
        <div>
          <h4 class="font-medium text-sm text-slate-800 dark:text-slate-100">${os.titulo}</h4>
          <p class="text-xs text-slate-500 dark:text-slate-400">${cliente} · ${os.criado_em?.slice(0, 10) ?? ''}</p>
        </div>
        <button class="text-slate-300 hover:text-red-500 text-lg leading-none" data-excluir="${os.id}" aria-label="Excluir OS">×</button>
      </div>
      <div class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
        <span class="font-semibold text-emerald-600 dark:text-emerald-400">${brl(os.valor_total || 0)}</span>
        <span>Sinal: ${brl(os.sinal || 0)}</span>
        ${saldo > 0 ? `<span class="text-amber-600 dark:text-amber-400">Saldo: ${brl(saldo)}</span>` : '<span class="text-emerald-600">Pago ✓</span>'}
      </div>
      <div class="mt-2 flex gap-1">
        ${proxima ? `<button class="text-xs bg-slate-800 dark:bg-slate-900 text-white rounded px-2 py-1 hover:bg-slate-700" data-mover="${os.id}" data-destino="${proxima}">→ ${proxima}</button>` : ''}
        ${os.status === 'Pronto' ? `<span class="text-xs bg-emerald-100 text-emerald-700 rounded px-2 py-1">Entregar</span>` : ''}
      </div>
    </article>`;
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
