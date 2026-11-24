/**
 * ajuda.mjs — Orientação amigável e detalhada do Ateliê Manager.
 * Nasceu para quem está usando o sistema pela primeira vez e precisa de
 * explicações grandes, claras e acolhedoras, sem termos técnicos.
 */

const CHAVE_AJUDA_VISTA = 'atelie-ajuda-vista';

export const GUIAS = [
  {
    id: 'inicio',
    icone: '👋',
    titulo: 'Comece aqui — seu guia em poucos minutos',
    resumo: 'Uma visão geral, bem calma, de como o aplicativo funciona.',
    blocos: [
      { tipo: 'texto', texto: 'Que bom que você chegou até aqui! Este aplicativo foi feito para ajudar você a organizar o seu ateliê sem complicação. Não precisa saber nada de computador: basta ir preenchendo com calma, um pedacinho de cada vez.' },
      { tipo: 'passos', titulo: 'O caminho mais fácil para começar', itens: [
        'Primeiro, cadastre seus clientes. É só ir na aba 👥 Clientes e digitar nome e telefone.',
        'Depois, cadastre os materiais que você usa na aba 📦 Insumos papel, tinta, EVA, tecido etc.',
        'Monte seus produtos na aba 🧾 Produtos. Você escolhe quais materiais fazem parte de cada um e o sistema calcula o custo e o preço sugerido.',
        'Quando chegar um pedido, vá em 🗂️ Ordens de Serviço e crie uma nova ordem. Escolha o cliente, o produto e o valor.',
        'Por fim, use o botão de enviar pelo WhatsApp para mandar o orçamento. Tudo fica salvo, mesmo sem internet.',
      ] },
      { tipo: 'dica', titulo: 'Uma dica carinhosa', texto: 'Não tenha pressa e não precisa acertar tudo de primeira. Você pode voltar em qualquer tela e mudar o que quiser. Seu trabalho fica salvo automaticamente neste aparelho.' },
      { tipo: 'passos', titulo: 'O que significa cada aba do topo', itens: [
        '🗂️ Ordens de Serviço: seus pedidos, do primeiro contato até a entrega.',
        '👥 Clientes: a agenda de pessoas que compraram ou pediram algo.',
        '🧾 Produtos: o que você vende, com o custo de cada material.',
        '🎨 Personalização: o nome e a logo do seu ateliê.',
        '📦 Insumos: o estoque de materiais e as entradas e saídas.',
        '🧮 Precificação: uma calculadora para chegar ao preço de venda.',
        '💰 Financeiro: o que entra, o que sai e o que ainda vai receber.',
      ] },
    ],
  },
  {
    id: 'kanban',
    icone: '🗂️',
    titulo: 'Ordens de Serviço — seus pedidos',
    resumo: 'Como criar uma OS, acompanhar o andamento e enviar o orçamento.',
    blocos: [
      { tipo: 'texto', texto: 'Aqui fica cada pedido do seu ateliê. Pense nisso como uma prancheta: cada pedido é um cartão e ele vai andando entre as colunas até ficar pronto.' },
      { tipo: 'passos', titulo: 'Como criar uma nova ordem', itens: [
        'Toque no botão “+ Nova OS” no topo da tela.',
        'Escreva um título que você consiga reconhecer depois, por exemplo: “50 convites A5”.',
        'Escolha o cliente. Se ainda não cadastrou, vá na aba Clientes primeiro e volte depois.',
        'Coloque o valor total. Se ainda não souber, use a calculadora de precificação para chegar a um valor.',
        'Informe o sinal, se o cliente pagou parte agora. O restante aparece como saldo a receber.',
        'Se quiser, clique em “Adicionar produtos” para incluir itens do catálogo e em “Personalizar mensagem” para escrever prazo ou observações.',
        'Toque em “Criar OS”. O aplicativo abre o WhatsApp com o orçamento já escrito para você conferir e enviar.',
      ] },
      { tipo: 'passos', titulo: 'Como o pedido anda', itens: [
        'Cada cartão pode ser arrastado para a próxima coluna: Orçamento, Em produção, Pronto e Entregue.',
        'Você também pode abrir o cartão para editar valores, ver a mensagem ou revisar no WhatsApp.',
        'Ao marcar como pronto, o sistema guarda o histórico financeiro para não perder o que já foi combinado.',
      ] },
      { tipo: 'dica', titulo: 'Se você nunca mexeu com isso', texto: 'Não se preocupe com as colunas no começo. Crie a ordem, coloque o cliente e o valor. O resto você ajusta aos poucos, sem medo de errar.' },
    ],
  },
  {
    id: 'clientes',
    icone: '👥',
    titulo: 'Clientes — sua agenda de contatos',
    resumo: 'Cadastre quem pede e acompanha seus trabalhos.',
    blocos: [
      { tipo: 'texto', texto: 'Aqui você guarda o nome, o telefone e o e-mail de cada pessoa. Isso evita digitar o telefone toda vez que for enviar um orçamento.' },
      { tipo: 'passos', titulo: 'Como cadastrar', itens: [
        'Abra a aba 👥 Clientes.',
        'Digite o nome da pessoa ou da empresa.',
        'Coloque o telefone com DDD. Ele é usado para abrir a conversa no WhatsApp.',
        'O e-mail é opcional. Pode deixar em branco.',
        'Toque em “Salvar cliente”.',
      ] },
      { tipo: 'passos', titulo: 'Como editar ou apagar', itens: [
        'Na lista de clientes, use os botões “Editar” ou “Excluir” ao lado do nome.',
        'Se aparecer uma pergunta de confirmação, leia com calma antes de responder.',
      ] },
      { tipo: 'dica', titulo: 'Dica', texto: 'Cadastre o cliente antes de criar a ordem de serviço. Assim o orçamento já sai com o nome e o telefone certinhos.' },
    ],
  },
  {
    id: 'produtos',
    icone: '🧾',
    titulo: 'Produtos — o que você vende',
    resumo: 'Monte o catálogo, calcule custo e preço e gere orçamentos com fotos.',
    blocos: [
      { tipo: 'texto', texto: 'Um produto é qualquer coisa que você faz e vende: um álbum, uma caixa, um convite, uma capa. Aqui você ensina ao aplicativo quais materiais fazem parte dele e quanto tempo leva para produzir.' },
      { tipo: 'passos', titulo: 'Como cadastrar um produto', itens: [
        'Vá na aba 🧾 Produtos.',
        'Digite o nome do produto, por exemplo: “Álbum de fotos A5”.',
        'Escolha os insumos que ele usa e a quantidade de cada um. Isso é a “composição por unidade”.',
        'Informe quantos minutos você leva, o valor da sua hora, a taxa de pagamento e a margem de lucro desejada.',
        'Olhe o resultado: o aplicativo mostra quanto custa e sugere um preço de venda.',
        'Se quiser, envie fotos do produto no campo “Fotos do produto”. Você pode colocar até três fotos.',
        'Toque em “Salvar produto”.',
      ] },
      { tipo: 'passos', titulo: 'Como gerar um orçamento', itens: [
        'Abaixo do produto, digite quantas unidades o cliente quer.',
        'Toque em “Gerar orçamento”.',
        'Confira o cliente, a quantidade, o preço e o sinal.',
        'Quiser incluir outro produto? Use o botão “Adicionar produtos”.',
        'Quiser escrever um recado? Use “Personalizar mensagem para cliente”.',
        'Se o produto tiver fotos, elas aparecem na janela. Toque em “Compartilhar fotos no WhatsApp” para enviá-las junto.',
        'Toque em “Criar orçamento e abrir WhatsApp” para finalizar.',
      ] },
      { tipo: 'dica', titulo: 'Por que as fotos ajudam?', texto: 'Muitos clientes entendem melhor vendo. Coloque uma boa foto do seu trabalho: isso transmite confiança e evita dúvidas. No celular, o botão de compartilhar abre a lista de aplicativos — escolha o WhatsApp.' },
    ],
  },
  {
    id: 'personalizacao',
    icone: '🎨',
    titulo: 'Personalização — a cara do seu ateliê',
    resumo: 'Coloque o nome e a logo do seu negócio no aplicativo.',
    blocos: [
      { tipo: 'texto', texto: 'Esta aba deixa o aplicativo com a sua identidade. O nome que você colocar aparece no topo e no título da janela.' },
      { tipo: 'passos', titulo: 'Como personalizar', itens: [
        'Abra a aba 🎨 Personalização.',
        'No campo “Nome do aplicativo”, digite o nome do seu ateliê.',
        'Para trocar a logo, clique em “Escolher logo” e selecione uma imagem do seu computador ou celular.',
        'Espere a prévia aparecer e confira se gostou.',
        'Toque em “Salvar personalização”.',
      ] },
      { tipo: 'passos', titulo: 'Se quiser voltar atrás', itens: [
        'Toque em “Restaurar logo padrão” para voltar à imagem original.',
      ] },
      { tipo: 'dica', titulo: 'Dica', texto: 'Use uma imagem quadrada e simples. Assim a logo fica bonitinha tanto no celular quanto no computador.' },
    ],
  },
  {
    id: 'insumos',
    icone: '📦',
    titulo: 'Insumos — seu estoque de materiais',
    resumo: 'Cadastre materiais e registre entradas e saídas sem complicação.',
    blocos: [
      { tipo: 'texto', texto: 'Insumo é tudo o que você gasta para fazer o produto: papel, tinta, EVA, tecido, fita, caixa. Controlar isso ajuda a saber se ainda dá para fazer aquele pedido.' },
      { tipo: 'passos', titulo: 'Como cadastrar um insumo', itens: [
        'Abra a aba 📦 Insumos.',
        'Digite o nome, por exemplo: “Papel couchê 250 g”.',
        'Escolha a categoria, a unidade (folha, metro, quilo) e o fornecedor, se quiser.',
        'Informe a quantidade que você tem agora e o custo de cada unidade.',
        'Se quiser, marque um estoque mínimo: o sistema avisa quando estiver baixo.',
        'Toque em “Salvar insumo”.',
      ] },
      { tipo: 'passos', titulo: 'Como registrar entrada ou saída', itens: [
        'Toque em “Registrar movimentação”.',
        'Escolha o insumo e o tipo: entrada (você comprou) ou saída (você usou).',
        'Digite a quantidade e o motivo. Escrever o motivo ajuda a entender depois.',
        'Toque em “Salvar movimentação”. O estoque é atualizado na hora.',
      ] },
      { tipo: 'dica', titulo: 'Calma com os números', texto: 'Não precisa acertar o estoque no primeiro dia. Vá registrando o que entra e o que sai. Com o tempo, os números ficam cada vez mais confiáveis.' },
    ],
  },
  {
    id: 'preco',
    icone: '🧮',
    titulo: 'Precificação — quanto cobrar',
    resumo: 'Uma calculadora que transforma custo, tempo e margem em preço.',
    blocos: [
      { tipo: 'texto', texto: 'Muita gente tem dúvida nessa hora. Esta calculadora soma o custo dos materiais, o valor do seu tempo, a taxa do cartão e a margem de lucro para sugerir um preço justo.' },
      { tipo: 'passos', titulo: 'Como usar a calculadora', itens: [
        'Abra a aba 🧮 Precificação.',
        'Escolha os insumos usados e a quantidade de cada um.',
        'Informe o tempo de produção em minutos. Exemplo: 90 minutos.',
        'Coloque o valor da sua hora. Exemplo: 25 reais por hora.',
        'Se for receber por cartão, informe a taxa. Exemplo: 3,3 para 3,3%.',
        'Coloque a margem de lucro. Exemplo: 30 para 30%.',
        'Veja o resultado: custo total e preço sugerido.',
      ] },
      { tipo: 'dica', titulo: 'O que é margem?', texto: 'É a parte que sobra para o seu lucro e para imprevistos. Se você cobra só o custo, não sobra nada para crescer. Um valor entre 25% e 40% costuma ser um bom começo — ajuste conforme a sua realidade.' },
    ],
  },
  {
    id: 'financeiro',
    icone: '💰',
    titulo: 'Financeiro — entradas, saídas e saldo',
    resumo: 'Entenda o que entrou, o que saiu e o que ainda vai chegar.',
    blocos: [
      { tipo: 'texto', texto: 'Aqui você anota o dinheiro do ateliê. Não é complicado: toda vez que entra dinheiro, registre como recebimento. Toda vez que você paga algo, registre como despesa.' },
      { tipo: 'passos', titulo: 'Como registrar um recebimento', itens: [
        'Abra a aba 💰 Financeiro.',
        'No bloco “Registrar recebimento”, escreva uma descrição, por exemplo: “Sinal do pedido da Maria”.',
        'Coloque o valor e a data.',
        'Escolha se já recebeu ou se ainda vai receber.',
        'Toque em “Salvar recebimento”.',
      ] },
      { tipo: 'passos', titulo: 'Como registrar uma despesa', itens: [
        'No bloco “Registrar despesa”, escreva o que você pagou: papel, energia, aluguel.',
        'Coloque o valor e a data e toque em “Salvar despesa”.',
      ] },
      { tipo: 'passos', titulo: 'Como entender os resumos', itens: [
        '“Contas a receber” mostra o que foi combinado mas ainda não entrou.',
        '“Movimentações do período” mostra tudo o que foi registrado naquele mês.',
        'O saldo mostra quanto sobrou depois das despesas pagas.',
      ] },
      { tipo: 'dica', titulo: 'Dica importante', texto: 'Registrar com calma no dia a dia evita aquela dor de cabeça no fim do mês. Os números do financeiro também ajudam a decidir o preço dos seus produtos.' },
    ],
  },
  {
    id: 'fotos',
    icone: '📷',
    titulo: 'Fotos dos produtos',
    resumo: 'Como cadastrar fotos e enviá-las junto com o orçamento.',
    blocos: [
      { tipo: 'texto', texto: 'Fotos ajudam muito o cliente a entender o que ele está comprando. Você pode guardar até três fotos de cada produto e enviá-las no orçamento.' },
      { tipo: 'passos', titulo: 'Como cadastrar', itens: [
        'Vá na aba 🧾 Produtos e clique em “Editar ficha” do produto.',
        'No campo “Fotos do produto”, clique para escolher as imagens.',
        'Você pode selecionar até três de uma vez. Aceitamos PNG, JPG e WebP.',
        'Confira as miniaturas que aparecem embaixo. Se não gostar de alguma, clique no “×”.',
        'Salve o produto.',
      ] },
      { tipo: 'passos', titulo: 'Como enviar no orçamento', itens: [
        'Gere o orçamento do produto normalmente.',
        'Na janela de personalização, as fotos aparecem na parte “Fotos dos produtos”.',
        'Toque em “Compartilhar fotos no WhatsApp”.',
        'No celular, escolha o WhatsApp na lista que aparecer.',
        'No computador, as imagens são baixadas: anexe-as na conversa que o aplicativo abriu.',
      ] },
      { tipo: 'dica', titulo: 'Por que no computador é diferente?', texto: 'O aviso do WhatsApp no navegador não consegue anexar arquivos sozinho. Por isso o aplicativo baixa as fotos e abre a conversa pronta para você anexar. É só arrastar ou clicar em anexar.' },
    ],
  },
  {
    id: 'sync',
    icone: '☁️',
    titulo: 'Sincronização e segurança',
    resumo: 'O que significa o botão Supabase e por que o selo muda de cor.',
    blocos: [
      { tipo: 'texto', texto: 'Tudo o que você cadastra fica salvo neste aparelho, mesmo sem internet. O botão Supabase é opcional: ele permite guardar uma cópia em uma conta online, se você quiser.' },
      { tipo: 'passos', titulo: 'Entendendo o selo do topo', itens: [
        '🟢 Online: você tem internet e pode sincronizar, se quiser.',
        '🔴 Offline: sem internet, mas o aplicativo continua funcionando normalmente.',
      ] },
      { tipo: 'passos', titulo: 'Como sincronizar', itens: [
        'Configure sua conta na caixa “Sincronização segura com Supabase”.',
        'Toque no botão “Supabase” no topo.',
        'Se houver conflito, o aplicativo pergunta antes de substituir qualquer coisa.',
      ] },
      { tipo: 'dica', titulo: 'Fique tranquilo', texto: 'Você não é obrigado a usar a nuvem. Se preferir, continue usando somente o salvamento local. Seus dados continuam seguros no aparelho.' },
    ],
  },
  {
    id: 'dicas',
    icone: '💡',
    titulo: 'Dicas finais para o dia a dia',
    resumo: 'Pequenos cuidados que fazem muita diferença.',
    blocos: [
      { tipo: 'passos', titulo: 'Antes de começar', itens: [
        'Cadastre clientes e insumos. Isso deixa tudo mais rápido depois.',
        'Tire fotos dos seus produtos com boa luz.',
        'Use o mesmo nome de cliente sempre, para não criar duplicados.',
      ] },
      { tipo: 'passos', titulo: 'No dia a dia', itens: [
        'Registre as movimentações de estoque quando elas acontecem.',
        'Ao receber um valor, marque como recebido no financeiro.',
        'Revise a mensagem do WhatsApp antes de enviar. O aplicativo escreve por você, mas você pode mudar.',
      ] },
      { tipo: 'dica', titulo: 'Se algo der errado', texto: 'Respire fundo: nada aqui é irreversível. Você pode editar quase tudo. Se uma tela travar, recarregue a página. Seus dados continuam salvos.' },
    ],
  },
];

const escapar = (valor) => String(valor).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

let guiaAtual = 'inicio';

function blocoHtml(bloco) {
  if (bloco.tipo === 'texto') return `<p class="ajuda-texto">${escapar(bloco.texto)}</p>`;
  if (bloco.tipo === 'passos') {
    return `<h3 class="ajuda-subtitulo">${escapar(bloco.titulo)}</h3>
      <ol class="ajuda-passos">${bloco.itens.map((item) => `<li>${escapar(item)}</li>`).join('')}</ol>`;
  }
  return `<div class="ajuda-dica"><strong>${escapar(bloco.titulo)}</strong><p>${escapar(bloco.texto)}</p></div>`;
}

function criarEstrutura() {
  if (document.getElementById('ajuda-modal')) return;
  const modal = document.createElement('div');
  modal.id = 'ajuda-modal';
  modal.className = 'ajuda-modal hidden';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', 'Guia de como usar o Ateliê Manager');
  modal.innerHTML = `
    <div class="ajuda-fundo" data-ajuda-fechar></div>
    <div class="ajuda-caixa">
      <div class="ajuda-cabecalho">
        <div>
          <p class="ajuda-rotulo">GUIA DO ATELIÊ</p>
          <h2 class="ajuda-titulo-principal">Como usar o aplicativo</h2>
          <p class="ajuda-intro">Escolha um assunto à esquerda. As explicações são grandes e bem detalhadas — leia com calma.</p>
        </div>
        <button type="button" class="ajuda-fechar" data-ajuda-fechar aria-label="Fechar guia">✕ Fechar</button>
      </div>
      <div class="ajuda-corpo">
        <nav class="ajuda-lista" aria-label="Assuntos do guia"></nav>
        <article class="ajuda-conteudo" aria-live="polite"></article>
      </div>
      <div class="ajuda-rodape">
        <button type="button" class="ajuda-botao ajuda-botao--secundario" data-ajuda-rever>Rever guia de boas-vindas</button>
        <button type="button" class="ajuda-botao" data-ajuda-entendi>Entendi, pode fechar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  modal.querySelectorAll('[data-ajuda-fechar]').forEach((el) => el.addEventListener('click', fecharAjuda));
  modal.querySelector('[data-ajuda-entendi]').addEventListener('click', fecharAjuda);
  modal.querySelector('[data-ajuda-rever]').addEventListener('click', () => abrirAjuda('inicio'));

  const lista = modal.querySelector('.ajuda-lista');
  lista.innerHTML = GUIAS.map((guia) => `
    <button type="button" class="ajuda-topico" data-ajuda-topico="${guia.id}">
      <span class="ajuda-topico-icone" aria-hidden="true">${guia.icone}</span>
      <span><strong>${escapar(guia.titulo)}</strong><small>${escapar(guia.resumo)}</small></span>
    </button>`).join('');
  lista.querySelectorAll('[data-ajuda-topico]').forEach((botao) => {
    botao.addEventListener('click', () => abrirAjuda(botao.dataset.ajudaTopico));
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.classList.contains('hidden')) fecharAjuda();
  });
}

export function abrirAjuda(id = 'inicio') {
  criarEstrutura();
  const modal = document.getElementById('ajuda-modal');
  guiaAtual = GUIAS.some((guia) => guia.id === id) ? id : 'inicio';
  const guia = GUIAS.find((item) => item.id === guiaAtual);
  modal.querySelector('.ajuda-conteudo').innerHTML = `
    <p class="ajuda-icone-grande" aria-hidden="true">${guia.icone}</p>
    <h2 class="ajuda-titulo">${escapar(guia.titulo)}</h2>
    <p class="ajuda-resumo">${escapar(guia.resumo)}</p>
    ${guia.blocos.map(blocoHtml).join('')}`;
  modal.querySelectorAll('[data-ajuda-topico]').forEach((botao) => {
    const ativo = botao.dataset.ajudaTopico === guiaAtual;
    botao.classList.toggle('ajuda-topico--ativo', ativo);
    botao.setAttribute('aria-current', ativo ? 'true' : 'false');
  });
  modal.classList.remove('hidden');
  document.body.classList.add('ajuda-aberta');
  modal.querySelector('.ajuda-conteudo').scrollTop = 0;
  modal.querySelector('.ajuda-fechar').focus();
}

export function fecharAjuda() {
  const modal = document.getElementById('ajuda-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  document.body.classList.remove('ajuda-aberta');
  try { localStorage.setItem(CHAVE_AJUDA_VISTA, '1'); } catch { /* sem localStorage, guia abre só na sessão */ }
}

function adicionarBotoesContextuais() {
  document.querySelectorAll('[data-ajuda]').forEach((titulo) => {
    if (titulo.querySelector('[data-ajuda-contextual]')) return;
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'ajuda-contextual';
    botao.dataset.ajudaContextual = titulo.dataset.ajuda;
    botao.setAttribute('aria-label', `Abrir ajuda sobre ${titulo.textContent.trim()}`);
    botao.textContent = '❓ Como usar';
    titulo.appendChild(botao);
  });
  document.addEventListener('click', (event) => {
    const botao = event.target.closest('[data-ajuda-contextual]');
    if (botao) abrirAjuda(botao.dataset.ajudaContextual);
  });
}

/** Configura o botão flutuante, os botões contextuais e a boas-vindas. */
export function configurarAjuda() {
  criarEstrutura();
  adicionarBotoesContextuais();
  const botao = document.getElementById('btn-ajuda');
  botao?.addEventListener('click', () => abrirAjuda(guiaAtual));
  const botaoTopo = document.getElementById('btn-ajuda-topo');
  botaoTopo?.addEventListener('click', () => abrirAjuda(guiaAtual));
  let visto = false;
  try { visto = localStorage.getItem(CHAVE_AJUDA_VISTA) === '1'; } catch { /* segue sem lembrar */ }
  if (!visto) setTimeout(() => abrirAjuda('inicio'), 900);
}
