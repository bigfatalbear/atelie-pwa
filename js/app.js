/**
 * app.js — Inicialização, navegação e interfaces (Insumos, Precificação, Nova OS)
 */
import { agendarSincronizacao, db, remover, salvar } from './db.js';
import {
  cadastrarConta,
  atualizarSenhaConta,
  estaEmRecuperacaoSenha,
  entrarConta,
  reenviarConfirmacaoConta,
  restaurarConfiguracaoSupabase,
  solicitarRecuperacaoSenha,
  sairConta,
  sincronizarSupabase,
} from './supabase-sync.js';
import { calcularPrecoVenda, brl } from './precificacao.js';
import { renderKanban, novaOS, COLUNAS } from './kanban.js';
import { criarLinkWhatsapp, montarMensagemOrcamento, normalizarTelefoneWhatsapp } from './whatsapp.mjs';
import { calcularCustoFicha, criarRascunhoOrcamento, lerComposicaoFicha } from './catalogo.mjs';
import {
  calcularResumoEstoque,
  classificarEstoque,
  criarInsumoComEstoque,
  registrarMovimentacoesEstoque,
  validarDadosInsumo,
} from './estoque.mjs';

const $ = (sel) => document.querySelector(sel);
const CHAVE_IDENTIDADE = 'atelie-identidade-visual';
const NOME_PADRAO = 'Ateliê Manager';
const LOGO_PADRAO = 'icons/icon-192.jpg';
const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const MAX_LOGO_DATA_URL_LENGTH = 400_000;
const escaparHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
})[char]);
let supabaseAcaoEmAndamento = false;
let emailConfirmacaoPendente = null;
let cooldownReenvioAte = 0;
let timerCooldownReenvio = null;
let logoSelecionada = null;
let orcamentoProdutosPendentes = [];
let osProdutosSelecionados = [];

// ============================================================
// INICIALIZAÇÃO
// ============================================================
// Registra o Service Worker (PWA offline)
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('[SW] registro falhou:', e));
}

document.addEventListener('DOMContentLoaded', async () => {
  configurarTabs();
  configurarIdentidadeVisual();
  await configurarSupabaseUI();
  window.addEventListener('render-financeiro', renderFinanceiro);
  renderFinanceiro();
  await renderKanban();
  await renderInsumos();
  await renderCalcInsumos();
  await renderSelectInsumos();
  await renderClientes();
  await renderCatalogo();

  $('#form-insumo')?.addEventListener('submit', aoCadastrarInsumo);
  $('#ins-cancelar')?.addEventListener('click', cancelarEdicaoInsumo);
  $('#estoque-busca')?.addEventListener('input', renderInsumos);
  ['#estoque-filtro-categoria', '#estoque-filtro-situacao', '#estoque-ordenacao'].forEach((selector) => {
    $(selector)?.addEventListener('change', renderInsumos);
  });
  $('#btn-estoque-nova-movimentacao')?.addEventListener('click', () => abrirMovimentacaoEstoque());
  $('#form-movimentacao-estoque')?.addEventListener('submit', aoRegistrarMovimentacaoEstoque);
  $('#mov-tipo')?.addEventListener('change', atualizarCamposMovimentacao);
  $('#mov-cancelar')?.addEventListener('click', () => $('#dialog-movimentacao-estoque').close());
  $('#lista-insumos')?.addEventListener('click', aoAcionarInsumoEstoque);
  window.addEventListener('estoque-atualizado', atualizarVistasEstoque);
  $('#form-os')?.addEventListener('submit', aoCadastrarOS);
  $('#btn-os-adicionar-produtos')?.addEventListener('click', alternarPainelProdutosOS);
  $('#btn-os-personalizar-mensagem')?.addEventListener('click', alternarPainelMensagemOS);
  $('#os-produto-selecao')?.addEventListener('change', preencherPrecoProdutoOS);
  $('#btn-os-confirmar-produto')?.addEventListener('click', adicionarProdutoOS);
  $('#os-produtos-selecionados')?.addEventListener('click', removerProdutoOS);
  $('#form-cliente')?.addEventListener('submit', aoSalvarCliente);
  $('#cliente-cancelar')?.addEventListener('click', cancelarEdicaoCliente);
  $('#form-identidade')?.addEventListener('submit', salvarIdentidadeVisual);
  $('#identidade-logo-arquivo')?.addEventListener('change', selecionarLogoVisual);
  $('#identidade-logo-remover')?.addEventListener('click', restaurarLogoVisual);
  $('#form-calc')?.addEventListener('input', calcularPreview);
  $('#form-produto')?.addEventListener('submit', aoSalvarProduto);
  $('#form-produto')?.addEventListener('input', atualizarPreviewProduto);
  $('#form-produto')?.addEventListener('change', atualizarPreviewProduto);
  $('#produto-cancelar')?.addEventListener('click', cancelarEdicaoProduto);
  $('#lista-produtos')?.addEventListener('click', aoAcionarProduto);
  $('#form-orcamento-produto')?.addEventListener('submit', salvarOrcamentoProduto);
  $('#orcamento-produto-fechar')?.addEventListener('click', fecharEditorOrcamento);
  $('#btn-adicionar-produtos')?.addEventListener('click', alternarPainelAdicionarProdutos);
  $('#btn-confirmar-adicao-produto')?.addEventListener('click', adicionarProdutoAoOrcamento);
  $('#adicionar-produto-selecao')?.addEventListener('change', preencherPrecoProdutoAdicional);
  $('#orcamento-produto-itens')?.addEventListener('click', removerProdutoDoOrcamento);
  $('#btn-personalizar-mensagem')?.addEventListener('click', alternarPersonalizacaoMensagem);
  ['#orcamento-produto-quantidade', '#orcamento-produto-preco', '#orcamento-produto-sinal'].forEach((selector) => {
    $(selector)?.addEventListener('input', atualizarPreviewOrcamentoProduto);
  });
  $('#orcamento-produto-cliente')?.addEventListener('change', atualizarPreviewOrcamentoProduto);
  $('#orcamento-produto-titulo')?.addEventListener('input', atualizarPreviewOrcamentoProduto);
  $('#orcamento-produto-mensagem')?.addEventListener('input', atualizarPreviewOrcamentoProduto);
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

function configurarIdentidadeVisual() {
  const campoNome = $('#identidade-nome');
  if (!campoNome) return;
  try {
    const identidade = lerIdentidadeVisual();
    campoNome.value = identidade.nome;
    aplicarIdentidadeVisual(identidade);
  } catch (error) {
    campoNome.value = NOME_PADRAO;
    aplicarIdentidadeVisual({ nome: NOME_PADRAO, logoDataUrl: null });
    definirStatusIdentidade(`Não foi possível carregar a personalização salva: ${error.message}`, true);
  }
}

function lerIdentidadeVisual() {
  const valor = localStorage.getItem(CHAVE_IDENTIDADE);
  if (!valor) return { nome: NOME_PADRAO, logoDataUrl: null };
  const identidade = JSON.parse(valor);
  const nome = typeof identidade.nome === 'string' && identidade.nome.trim()
    ? identidade.nome.trim().slice(0, 50)
    : NOME_PADRAO;
  const logoDataUrl = typeof identidade.logoDataUrl === 'string'
    && identidade.logoDataUrl.length <= MAX_LOGO_DATA_URL_LENGTH
    && /^data:image\/(?:webp|png);base64,/.test(identidade.logoDataUrl)
    ? identidade.logoDataUrl
    : null;
  return { nome, logoDataUrl };
}

function aplicarIdentidadeVisual(identidade) {
  const nome = identidade.nome || NOME_PADRAO;
  const logo = identidade.logoDataUrl || LOGO_PADRAO;
  $('#app-name').textContent = nome;
  $('#footer-app-name').textContent = nome;
  document.title = nome;
  const logoTopo = $('#app-logo');
  logoTopo.src = logo;
  logoTopo.alt = `Logo de ${nome}`;
  logoTopo.classList.toggle('object-contain', Boolean(identidade.logoDataUrl));
  logoTopo.classList.toggle('object-cover', !identidade.logoDataUrl);
  const preview = $('#identidade-logo-preview');
  preview.src = logo;
  preview.alt = `Prévia da logo de ${nome}`;
}

async function selecionarLogoVisual(event) {
  const arquivo = event.target.files?.[0];
  if (!arquivo) return;
  try {
    logoSelecionada = await otimizarLogo(arquivo);
    $('#identidade-logo-preview').src = logoSelecionada;
    $('#identidade-logo-preview').alt = 'Prévia da nova logo';
    definirStatusIdentidade('Logo validada. Salve a personalização para aplicar.');
  } catch (error) {
    logoSelecionada = null;
    event.target.value = '';
    try {
      $('#identidade-logo-preview').src = lerIdentidadeVisual().logoDataUrl || LOGO_PADRAO;
    } catch {
      $('#identidade-logo-preview').src = LOGO_PADRAO;
    }
    definirStatusIdentidade(error.message || 'Não foi possível processar a imagem.', true);
  }
}

async function otimizarLogo(arquivo) {
  const tiposPermitidos = ['image/png', 'image/jpeg', 'image/webp'];
  if (!tiposPermitidos.includes(arquivo.type)) {
    throw new Error('Escolha uma imagem PNG, JPEG ou WebP. SVG e outros formatos não são aceitos.');
  }
  if (arquivo.size > MAX_LOGO_BYTES) throw new Error('A imagem deve ter no máximo 5 MB.');

  const imagemOriginal = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo de imagem.'));
    reader.readAsDataURL(arquivo);
  });
  const imagem = await new Promise((resolve, reject) => {
    const elemento = new Image();
    elemento.onload = () => resolve(elemento);
    elemento.onerror = () => reject(new Error('O arquivo selecionado não contém uma imagem válida.'));
    elemento.src = imagemOriginal;
  });
  if (!imagem.naturalWidth || !imagem.naturalHeight) {
    throw new Error('A imagem selecionada não possui dimensões válidas.');
  }
  if (imagem.naturalWidth * imagem.naturalHeight > 32_000_000) {
    throw new Error('A imagem possui resolução excessiva. Escolha um arquivo menor.');
  }

  const escala = Math.min(1, 512 / Math.max(imagem.naturalWidth, imagem.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(imagem.naturalWidth * escala));
  canvas.height = Math.max(1, Math.round(imagem.naturalHeight * escala));
  const contexto = canvas.getContext('2d');
  if (!contexto) throw new Error('Este navegador não permite processar a imagem selecionada.');
  contexto.drawImage(imagem, 0, 0, canvas.width, canvas.height);

  const dataUrl = canvas.toDataURL('image/webp', 0.82);
  if (!/^data:image\/(?:webp|png);base64,/.test(dataUrl)) {
    throw new Error('Não foi possível converter a imagem para um formato seguro.');
  }
  if (dataUrl.length > MAX_LOGO_DATA_URL_LENGTH) {
    throw new Error('A imagem otimizada ficou muito grande. Escolha uma imagem mais simples.');
  }
  return dataUrl;
}

function salvarIdentidadeVisual(event) {
  event.preventDefault();
  const nome = $('#identidade-nome').value.trim();
  if (!nome) {
    definirStatusIdentidade('Informe o nome que será exibido no aplicativo.', true);
    return;
  }

  try {
    let atual;
    try {
      atual = lerIdentidadeVisual();
    } catch {
      atual = { nome: NOME_PADRAO, logoDataUrl: null };
    }
    const identidade = {
      nome: nome.slice(0, 50),
      logoDataUrl: logoSelecionada || atual.logoDataUrl,
    };
    localStorage.setItem(CHAVE_IDENTIDADE, JSON.stringify(identidade));
    aplicarIdentidadeVisual(identidade);
    logoSelecionada = null;
    $('#identidade-logo-arquivo').value = '';
    definirStatusIdentidade('Personalização salva neste dispositivo e disponível offline.');
  } catch (error) {
    definirStatusIdentidade(`Não foi possível salvar a personalização: ${error.message}`, true);
  }
}

function restaurarLogoVisual() {
  try {
    let atual;
    try {
      atual = lerIdentidadeVisual();
    } catch {
      atual = { nome: NOME_PADRAO, logoDataUrl: null };
    }
    const identidade = { ...atual, logoDataUrl: null };
    localStorage.setItem(CHAVE_IDENTIDADE, JSON.stringify(identidade));
    aplicarIdentidadeVisual(identidade);
    logoSelecionada = null;
    $('#identidade-logo-arquivo').value = '';
    definirStatusIdentidade('Logo padrão restaurada neste dispositivo.');
  } catch (error) {
    definirStatusIdentidade(`Não foi possível restaurar a logo: ${error.message}`, true);
  }
}

function definirStatusIdentidade(mensagem, erro = false) {
  const status = $('#identidade-status');
  if (!status) return;
  status.textContent = mensagem;
  status.classList.toggle('text-red-500', erro);
  status.classList.toggle('text-emerald-500', !erro);
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
  $('#btn-supabase-recuperar-senha')?.addEventListener('click', recuperarSenhaSupabase);
  $('#form-supabase-nova-senha')?.addEventListener('submit', salvarNovaSenhaSupabase);
  $('#btn-supabase-resend-confirmation')?.addEventListener('click', reenviarEmailConfirmacao);
  $('#btn-ajude-dev')?.addEventListener('click', () => $('#dialog-ajude-dev')?.showModal());
  $('#btn-fechar-ajude-dev')?.addEventListener('click', () => $('#dialog-ajude-dev')?.close());
  $('#btn-copiar-pix')?.addEventListener('click', copiarChavePix);
  $('#auth-toast-dismiss')?.addEventListener('click', () => $('#auth-toast')?.classList.add('hidden'));
  $('#btn-supabase-sair')?.addEventListener('click', desconectarSupabase);
  $('#btn-sync')?.addEventListener('click', () => sincronizarEAtualizar());
  document.querySelectorAll('[data-supabase-resolution]').forEach((button) => {
    button.addEventListener('click', () => sincronizarEAtualizar(button.dataset.supabaseResolution));
  });
  window.addEventListener('supabase-auth-changed', (event) => {
    atualizarSessaoSupabase(event.detail.user);
    if (event.detail.event === 'PASSWORD_RECOVERY') mostrarFormularioRecuperacaoSenha();
  });
  if (estaEmRecuperacaoSenha()) mostrarFormularioRecuperacaoSenha();
  window.addEventListener('supabase-sync-requested', agendarSincronizacaoAutomatica);
  window.addEventListener('online', () => {
    atualizarSelo();
    agendarSincronizacaoAutomatica();
  });
}

function mostrarFormularioRecuperacaoSenha() {
  $('#supabase-recovery-password')?.classList.remove('hidden');
  definirStatusSupabase('Link confirmado. Defina sua nova senha.');
  $('#supabase-nova-senha')?.focus();
}

async function recuperarSenhaSupabase() {
  if (supabaseAcaoEmAndamento) return;
  const button = $('#btn-supabase-recuperar-senha');
  const email = $('#supabase-email').value.trim();
  try {
    if (!email || !$('#supabase-email').checkValidity()) {
      throw new Error('Informe um endereço de e-mail válido para receber o link de recuperação.');
    }
    supabaseAcaoEmAndamento = true;
    button.disabled = true;
    await solicitarRecuperacaoSenha(email);
    mostrarToastAuth(`Se houver uma conta para ${email}, o Supabase enviará um link de recuperação. Verifique sua caixa de entrada e a pasta de spam.`);
  } catch (error) {
    definirStatusSupabase(`Não foi possível solicitar a recuperação de senha: ${error.message}`, true);
  } finally {
    button.disabled = false;
    supabaseAcaoEmAndamento = false;
  }
}

async function salvarNovaSenhaSupabase(event) {
  event.preventDefault();
  if (supabaseAcaoEmAndamento) return;
  const password = $('#supabase-nova-senha').value;
  const confirmation = $('#supabase-confirmar-nova-senha').value;
  try {
    if (password.length < 6) throw new Error('A nova senha deve ter pelo menos 6 caracteres.');
    if (password !== confirmation) throw new Error('As senhas não conferem.');
    supabaseAcaoEmAndamento = true;
    $('#btn-supabase-salvar-senha').disabled = true;
    await atualizarSenhaConta(password);
    $('#form-supabase-nova-senha').reset();
    $('#supabase-recovery-password').classList.add('hidden');
    mostrarToastAuth('Senha atualizada com sucesso. Você já pode entrar com a nova senha.');
  } catch (error) {
    definirStatusSupabase(`Não foi possível atualizar a senha: ${error.message}`, true);
  } finally {
    $('#btn-supabase-salvar-senha').disabled = false;
    supabaseAcaoEmAndamento = false;
  }
}

async function copiarChavePix() {
  const campo = $('#pix-copia-cola');
  const status = $('#pix-status');
  try {
    await navigator.clipboard.writeText(campo.value);
    status.textContent = 'Código Pix copiado. Obrigado pelo apoio!';
    status.classList.remove('text-red-500');
  } catch (error) {
    campo.focus();
    campo.select();
    status.textContent = 'Não foi possível copiar automaticamente. Selecione e copie o código Pix manualmente.';
    status.classList.add('text-red-500');
  }
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
        emailConfirmacaoPendente = email;
        $('#supabase-resend-confirmation')?.classList.remove('hidden');
        $('#supabase-resend-confirmation')?.classList.add('flex');
        mostrarToastAuth(`Cadastro criado. O Supabase informou que é necessária a confirmação por e-mail para ${email}. Verifique sua caixa de entrada e a pasta de spam.`);
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
    const message = `Não foi possível autenticar: ${error.message}`;
    if (mode === 'signup') mostrarToastAuth(message, true);
    else definirStatusSupabase(message, true);
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
    supabaseAcaoEmAndamento = false;
  }
}

async function reenviarEmailConfirmacao() {
  const button = $('#btn-supabase-resend-confirmation');
  const status = $('#supabase-resend-status');
  if (!emailConfirmacaoPendente || supabaseAcaoEmAndamento || Date.now() < cooldownReenvioAte) return;

  supabaseAcaoEmAndamento = true;
  button.disabled = true;
  const authButtons = [...document.querySelectorAll('#btn-supabase-entrar, #btn-supabase-criar-conta')];
  authButtons.forEach((authButton) => { authButton.disabled = true; });
  status.textContent = 'Solicitando reenvio…';
  try {
    await reenviarConfirmacaoConta(emailConfirmacaoPendente);
    mostrarToastAuth(`Solicitação de reenvio aceita pelo Supabase para ${emailConfirmacaoPendente}. Verifique sua caixa de entrada e a pasta de spam.`);
    iniciarCooldownReenvio();
  } catch (error) {
    mostrarToastAuth(`Não foi possível solicitar o reenvio do e-mail de confirmação: ${error.message}`, true);
    status.textContent = 'O reenvio não foi confirmado. Você pode tentar novamente.';
  } finally {
    supabaseAcaoEmAndamento = false;
    authButtons.forEach((authButton) => { authButton.disabled = false; });
    if (Date.now() >= cooldownReenvioAte) button.disabled = false;
  }
}

function iniciarCooldownReenvio() {
  clearTimeout(timerCooldownReenvio);
  cooldownReenvioAte = Date.now() + 60_000;
  $('#btn-supabase-resend-confirmation').disabled = true;
  $('#supabase-resend-status').textContent = 'Aguarde 60 segundos antes de solicitar novamente.';
  timerCooldownReenvio = setTimeout(atualizarStatusCooldownReenvio, 60_000);
}

function atualizarStatusCooldownReenvio() {
  const restante = cooldownReenvioAte - Date.now();
  if (restante > 0) {
    timerCooldownReenvio = setTimeout(atualizarStatusCooldownReenvio, restante);
    return;
  }

  clearTimeout(timerCooldownReenvio);
  timerCooldownReenvio = null;
  cooldownReenvioAte = 0;
  $('#btn-supabase-resend-confirmation').disabled = false;
  $('#supabase-resend-status').textContent = 'Você pode solicitar outro e-mail de confirmação.';
}

function mostrarToastAuth(message, error = false) {
  const toast = $('#auth-toast');
  if (!toast) return;
  toast.classList.toggle('auth-toast--error', error);
  toast.setAttribute('role', error ? 'alert' : 'status');
  toast.setAttribute('aria-live', error ? 'assertive' : 'polite');
  $('#auth-toast-message').textContent = message;
  toast.classList.remove('hidden');
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
      renderCatalogo(),
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
function formatarQuantidade(valor) {
  return (Number(valor) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

function definirStatusEstoque(mensagem, erro = false) {
  const status = $('#estoque-status');
  if (!status) return;
  status.textContent = mensagem;
  status.classList.toggle('text-red-500', erro);
  status.classList.toggle('text-emerald-500', !erro);
}

async function atualizarVistasEstoque() {
  await Promise.all([
    renderInsumos(),
    renderCalcInsumos(),
    renderSelectInsumos(),
    renderCatalogo(),
  ]);
}

async function aoCadastrarInsumo(e) {
  e.preventDefault();
  const button = $('#ins-submit');
  button.disabled = true;
  try {
    const id = Number($('#ins-id').value) || null;
    const dados = validarDadosInsumo({
      nome: $('#ins-nome').value,
      quantidade: $('#ins-qtd').value,
      unidade: $('#ins-unidade').value,
      custo_unitario: $('#ins-custo').value,
      estoque_minimo: $('#ins-minimo').value,
      categoria: $('#ins-categoria').value,
      fornecedor: $('#ins-fornecedor').value,
      localizacao: $('#ins-localizacao').value,
    });
    if (id) {
      const atual = await db.insumos.get(id);
      if (!atual) throw new Error('Este insumo não está mais cadastrado.');
      await salvar('insumos', { ...atual, ...dados, id, quantidade: Number(atual.quantidade) || 0 });
      definirStatusEstoque('Cadastro do insumo atualizado. O saldo foi preservado; ajuste quantidades em “Registrar movimentação”.');
    } else {
      await criarInsumoComEstoque(db, dados);
      agendarSincronizacao();
      definirStatusEstoque('Insumo cadastrado e estoque inicial registrado no histórico.');
    }
    cancelarEdicaoInsumo(false);
    await atualizarVistasEstoque();
  } catch (error) {
    definirStatusEstoque(error.message || 'Não foi possível salvar o insumo.', true);
  } finally {
    button.disabled = false;
  }
}

function cancelarEdicaoInsumo(limparStatus = true) {
  $('#form-insumo').reset();
  $('#ins-id').value = '';
  $('#ins-qtd').disabled = false;
  $('#ins-qtd-help').textContent = 'Para corrigir o saldo, use o registro de movimentação.';
  $('#ins-form-titulo').textContent = 'Cadastrar insumo';
  $('#ins-submit').textContent = 'Salvar insumo';
  $('#ins-cancelar').classList.add('hidden');
  if (limparStatus) definirStatusEstoque('');
}

async function renderInsumos() {
  const lista = $('#lista-insumos');
  if (!lista) return;
  const [insumos, movimentos] = await Promise.all([
    db.insumos.toArray(),
    db.movimentacoes_estoque.toArray(),
  ]);
  insumos.sort((a, b) => String(a.nome ?? '').localeCompare(String(b.nome ?? ''), 'pt-BR'));
  const resumo = calcularResumoEstoque(insumos);
  $('#estoque-resumo').innerHTML = [
    ['Insumos cadastrados', resumo.itens, 'text-slate-800 dark:text-white'],
    ['Valor estimado em estoque', brl(resumo.valor), 'text-sky-700 dark:text-sky-300'],
    ['Abaixo do mínimo', resumo.baixos, 'text-amber-600 dark:text-amber-400'],
    ['Zerados / negativos', resumo.zerados, 'text-red-600 dark:text-red-400'],
  ].map(([label, valor, color]) => `
    <article class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <p class="text-xs font-medium uppercase tracking-wide text-slate-500">${label}</p>
      <p class="mt-2 text-2xl font-bold tabular-nums ${color}">${valor}</p>
    </article>`).join('');

  const categoriaSelect = $('#estoque-filtro-categoria');
  const categoriaAtual = categoriaSelect.value;
  const categorias = [...new Set(insumos.map((insumo) => String(insumo.categoria || 'Sem categoria')))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  categoriaSelect.innerHTML = '<option value="">Todas as categorias</option>' +
    categorias.map((categoria) => `<option value="${escaparHtml(categoria)}">${escaparHtml(categoria)}</option>`).join('');
  categoriaSelect.value = categorias.includes(categoriaAtual) ? categoriaAtual : '';

  const busca = $('#estoque-busca').value.trim().toLocaleLowerCase('pt-BR');
  const situacao = $('#estoque-filtro-situacao').value;
  const categoria = categoriaSelect.value;
  const ordenacao = $('#estoque-ordenacao').value;
  const filtrados = insumos.filter((insumo) => {
    const texto = [insumo.nome, insumo.fornecedor, insumo.localizacao, insumo.categoria]
      .join(' ').toLocaleLowerCase('pt-BR');
    return (!busca || texto.includes(busca))
      && (!categoria || String(insumo.categoria || 'Sem categoria') === categoria)
      && (!situacao || classificarEstoque(insumo) === situacao);
  });
  if (ordenacao === 'quantidade') {
    filtrados.sort((a, b) => (Number(a.quantidade) || 0) - (Number(b.quantidade) || 0));
  } else if (ordenacao === 'valor') {
    filtrados.sort((a, b) =>
      ((Number(b.quantidade) || 0) * (Number(b.custo_unitario) || 0))
      - ((Number(a.quantidade) || 0) * (Number(a.custo_unitario) || 0)));
  }
  $('#estoque-contagem').textContent = `${filtrados.length} de ${insumos.length} insumo(s)`;
  lista.innerHTML = filtrados.map((insumo) => {
    const situacaoItem = classificarEstoque(insumo);
    const status = situacaoItem === 'zerado'
      ? ['Zerado / negativo', 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300']
      : situacaoItem === 'baixo'
        ? ['Abaixo do mínimo', 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300']
        : ['Regular', 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'];
    const valor = (Number(insumo.quantidade) || 0) * (Number(insumo.custo_unitario) || 0);
    return `
      <article class="grid gap-3 p-4 md:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(7rem,0.7fr))_auto] md:items-center">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <h4 class="truncate font-semibold">${escaparHtml(insumo.nome)}</h4>
            <span class="rounded-full px-2 py-0.5 text-[11px] font-medium ${status[1]}">${status[0]}</span>
          </div>
          <p class="mt-1 text-xs text-slate-500">${escaparHtml(insumo.categoria || 'Sem categoria')}
            ${insumo.fornecedor ? ` · ${escaparHtml(insumo.fornecedor)}` : ''}
            ${insumo.localizacao ? ` · ${escaparHtml(insumo.localizacao)}` : ''}</p>
        </div>
        <div>
          <p class="text-xs text-slate-500">Saldo atual</p>
          <p class="font-semibold tabular-nums">${formatarQuantidade(insumo.quantidade)} ${escaparHtml(insumo.unidade || '')}</p>
          <p class="text-xs text-slate-500">Mínimo: ${formatarQuantidade(insumo.estoque_minimo)} ${escaparHtml(insumo.unidade || '')}</p>
        </div>
        <div>
          <p class="text-xs text-slate-500">Custo unitário médio</p>
          <p class="font-medium tabular-nums">${brl(insumo.custo_unitario || 0)}</p>
        </div>
        <div>
          <p class="text-xs text-slate-500">Valor em estoque</p>
          <p class="font-medium tabular-nums">${brl(Math.max(0, valor))}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button type="button" data-movimentar-insumo="${insumo.id}" class="rounded-lg bg-sky-700 px-3 py-2 text-xs font-medium text-white hover:bg-sky-600">Movimentar</button>
          <button type="button" data-editar-insumo="${insumo.id}" class="rounded-lg bg-slate-200 px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-300 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600">Editar</button>
        </div>
      </article>`;
  }).join('') || `<p class="p-6 text-center text-sm text-slate-500">${insumos.length ? 'Nenhum insumo corresponde aos filtros.' : 'Nenhum insumo cadastrado.'}</p>`;

  movimentos.sort((a, b) =>
    String(b.criado_em || '').localeCompare(String(a.criado_em || '')) || Number(b.id) - Number(a.id));
  $('#lista-movimentacoes-estoque').innerHTML = movimentos.slice(0, 30).map((movimento) => {
    const positivo = Number(movimento.variacao) >= 0;
    const descricao = {
      entrada: 'Entrada',
      saida: 'Saída',
      perda: 'Perda / descarte',
      ajuste: 'Ajuste de saldo',
    }[movimento.tipo] || movimento.tipo;
    const data = new Date(movimento.criado_em);
    const dataFormatada = Number.isNaN(data.getTime()) ? 'Data indisponível' : data.toLocaleString('pt-BR');
    const saldo = Number(movimento.saldo_posterior);
    return `
      <article class="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
        <div class="min-w-0">
          <p class="font-medium">${escaparHtml(movimento.insumo_nome || 'Insumo removido')} <span class="text-slate-500">· ${escaparHtml(descricao)}</span></p>
          <p class="mt-1 text-xs text-slate-500">${escaparHtml(movimento.motivo || 'Sem observação')} · ${dataFormatada}
            ${movimento.referencia ? ` · ${escaparHtml(movimento.referencia)}` : ''}</p>
        </div>
        <div class="text-right">
          <p class="font-semibold tabular-nums ${positivo ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}">${positivo ? '+' : ''}${formatarQuantidade(movimento.variacao)} ${escaparHtml(insumos.find((item) => item.id === movimento.insumo_id)?.unidade || '')}</p>
          <p class="text-xs text-slate-500">Saldo: ${formatarQuantidade(saldo)}</p>
        </div>
      </article>`;
  }).join('') || '<p class="p-6 text-center text-sm text-slate-500">Nenhuma movimentação registrada.</p>';
}

function editarInsumo(id) {
  db.insumos.get(id).then((insumo) => {
    if (!insumo) {
      definirStatusEstoque('Este insumo não está mais cadastrado.', true);
      return;
    }
    $('#ins-id').value = String(insumo.id);
    $('#ins-nome').value = insumo.nome || '';
    $('#ins-unidade').value = insumo.unidade || 'un';
    $('#ins-categoria').value = insumo.categoria || '';
    $('#ins-fornecedor').value = insumo.fornecedor || '';
    $('#ins-localizacao').value = insumo.localizacao || '';
    $('#ins-qtd').value = String(Number(insumo.quantidade) || 0);
    $('#ins-qtd').disabled = true;
    $('#ins-qtd-help').textContent = 'Saldo protegido contra edição direta. Use “Registrar movimentação” para entradas, saídas ou ajustes.';
    $('#ins-custo').value = String(Number(insumo.custo_unitario) || 0);
    $('#ins-minimo').value = String(Number(insumo.estoque_minimo) || 0);
    $('#ins-form-titulo').textContent = 'Editar cadastro do insumo';
    $('#ins-submit').textContent = 'Salvar alterações';
    $('#ins-cancelar').classList.remove('hidden');
    $('#form-insumo').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('#ins-nome').focus({ preventScroll: true });
  }).catch((error) => definirStatusEstoque(error.message || 'Não foi possível carregar o insumo.', true));
}

function aoAcionarInsumoEstoque(event) {
  const editar = event.target.closest('[data-editar-insumo]');
  if (editar) {
    editarInsumo(Number(editar.dataset.editarInsumo));
    return;
  }
  const movimentar = event.target.closest('[data-movimentar-insumo]');
  if (movimentar) abrirMovimentacaoEstoque(Number(movimentar.dataset.movimentarInsumo));
}

async function abrirMovimentacaoEstoque(insumoId = null) {
  try {
    const insumos = await db.insumos.toArray();
    insumos.sort((a, b) => String(a.nome ?? '').localeCompare(String(b.nome ?? ''), 'pt-BR'));
    const select = $('#mov-insumo-id');
    select.innerHTML = '<option value="">Selecione um insumo</option>' +
      insumos.map((insumo) => `<option value="${insumo.id}">${escaparHtml(insumo.nome)} · saldo ${formatarQuantidade(insumo.quantidade)} ${escaparHtml(insumo.unidade || '')}</option>`).join('');
    $('#form-movimentacao-estoque').reset();
    select.value = insumoId ? String(insumoId) : '';
    $('#mov-status').textContent = '';
    $('#mov-status').classList.remove('text-red-500');
    atualizarCamposMovimentacao();
    $('#dialog-movimentacao-estoque').showModal();
    select.focus();
  } catch (error) {
    definirStatusEstoque(error.message || 'Não foi possível abrir as movimentações.', true);
  }
}

function atualizarCamposMovimentacao() {
  const tipo = $('#mov-tipo').value;
  const entrada = tipo === 'entrada';
  $('#mov-custo-label').classList.toggle('hidden', !entrada);
  $('#mov-quantidade-label').firstChild.textContent = tipo === 'ajuste' ? 'Novo saldo' : 'Quantidade';
  $('#mov-quantidade').min = tipo === 'ajuste' ? '0' : '0.001';
}

async function aoRegistrarMovimentacaoEstoque(event) {
  event.preventDefault();
  const button = $('#mov-salvar');
  button.disabled = true;
  try {
    const tipo = $('#mov-tipo').value;
    const insumoId = Number($('#mov-insumo-id').value);
    if ($('#mov-quantidade').value === '') throw new Error('Informe a quantidade da movimentação.');
    const quantidade = Number($('#mov-quantidade').value);
    const motivo = $('#mov-motivo').value.trim();
    const insumo = await db.insumos.get(insumoId);
    if (!insumo) throw new Error('Selecione um insumo cadastrado.');
    if (!motivo) throw new Error('Informe o motivo da movimentação.');
    await registrarMovimentacoesEstoque(db, [{
      insumo_id: insumoId,
      tipo,
      quantidade,
      ...(tipo === 'entrada' && $('#mov-custo').value !== ''
        ? { custo_unitario: Number($('#mov-custo').value) }
        : {}),
      motivo,
      origem: 'manual',
    }]);
    agendarSincronizacao();
    $('#dialog-movimentacao-estoque').close();
    await atualizarVistasEstoque();
  } catch (error) {
    $('#mov-status').textContent = error.message || 'Não foi possível registrar a movimentação.';
    $('#mov-status').classList.add('text-red-500');
  } finally {
    button.disabled = false;
  }
}

async function renderSelectInsumos() {
  const sel = $('#os-insumos-multiplo');
  if (!sel) return;
  const insumos = await db.insumos.toArray();
  sel.innerHTML = insumos.map((i) =>
    `<label class="flex items-center gap-2 text-sm py-1 flex-wrap">
      <input type="checkbox" value="${i.id}" data-nome="${escaparHtml(i.nome)}" data-custo="${Number(i.custo_unitario) || 0}">
      <span>${escaparHtml(i.nome)} <span class="text-xs text-slate-400">(estoque: ${formatarQuantidade(i.quantidade)} ${escaparHtml(i.unidade || '')})</span></span>
      <input type="number" min="0" step="0.01" value="1" placeholder="Qtd" class="input !w-20 !py-1 ml-auto">
    </label>`).join('');
}

async function renderSelectProdutosOS() {
  const select = $('#os-produto-selecao');
  if (!select) return;
  const [produtos, fichas] = await Promise.all([
    db.produtos.toArray(),
    db.fichas_tecnicas.toArray(),
  ]);
  const comFicha = new Set(fichas.map((ficha) => Number(ficha.produto_id)));
  produtos.sort((a, b) => String(a.nome ?? '').localeCompare(String(b.nome ?? ''), 'pt-BR'));
  select.innerHTML = '<option value="">Selecione um produto cadastrado</option>' +
    produtos.filter((produto) => comFicha.has(Number(produto.id)))
      .map((produto) => `<option value="${produto.id}">${escaparHtml(produto.nome)} — ${brl(produto.preco_base || 0)}</option>`)
      .join('');
}

function alternarPainelProdutosOS() {
  const painel = $('#os-adicionar-produtos-painel');
  const abrir = painel.classList.contains('hidden');
  painel.classList.toggle('hidden', !abrir);
  $('#btn-os-adicionar-produtos').setAttribute('aria-expanded', String(abrir));
  if (abrir) $('#os-produto-selecao').focus();
}

function alternarPainelMensagemOS() {
  const painel = $('#os-personalizar-mensagem-painel');
  const abrir = painel.classList.contains('hidden');
  painel.classList.toggle('hidden', !abrir);
  $('#btn-os-personalizar-mensagem').setAttribute('aria-expanded', String(abrir));
  if (abrir) $('#os-mensagem-cliente').focus();
}

async function preencherPrecoProdutoOS() {
  const produtoId = Number($('#os-produto-selecao').value);
  if (!produtoId) {
    $('#os-produto-preco').value = '';
    return;
  }
  try {
    const ficha = await db.fichas_tecnicas.where('produto_id').equals(produtoId).first();
    if (!ficha) throw new Error('Este produto não possui ficha técnica.');
    const { calculo } = await calcularCustoFicha({
      itens: lerComposicaoFicha(ficha),
      insumos: await db.insumos.toArray(),
      tempoMinutos: Number(ficha.tempo_minutos) || 0,
      valorHora: Number(ficha.valor_hora) || 0,
      taxaPagamento: Number(ficha.taxa_pagamento) || 0,
      margemLucro: Number(ficha.margem_lucro) || 0,
    });
    $('#os-produto-preco').value = calculo.precoVenda.toFixed(2);
  } catch (error) {
    definirStatusOS(error.message || 'Não foi possível calcular o preço do produto.', true);
  }
}

async function adicionarProdutoOS() {
  const button = $('#btn-os-confirmar-produto');
  button.disabled = true;
  try {
    const produtoId = Number($('#os-produto-selecao').value);
    const quantidade = Number($('#os-produto-quantidade').value);
    const precoUnitario = Number($('#os-produto-preco').value);
    if (!produtoId) throw new Error('Selecione um produto do catálogo.');
    if (!Number.isInteger(quantidade) || quantidade < 1) throw new Error('A quantidade deve ser um inteiro maior que zero.');
    if (!Number.isFinite(precoUnitario) || precoUnitario < 0) throw new Error('Informe um preço unitário válido.');

    const [produto, ficha, insumos] = await Promise.all([
      db.produtos.get(produtoId),
      db.fichas_tecnicas.where('produto_id').equals(produtoId).first(),
      db.insumos.toArray(),
    ]);
    if (!produto || !ficha) throw new Error('O produto ou a ficha técnica não está mais disponível.');
    const { composicao } = await calcularCustoFicha({
      itens: lerComposicaoFicha(ficha),
      insumos,
      tempoMinutos: Number(ficha.tempo_minutos) || 0,
      valorHora: Number(ficha.valor_hora) || 0,
      taxaPagamento: Number(ficha.taxa_pagamento) || 0,
      margemLucro: Number(ficha.margem_lucro) || 0,
    });
    osProdutosSelecionados.push({ produtoId, titulo: produto.nome, quantidade, precoUnitario, composicao });
    const valorProdutos = osProdutosSelecionados.reduce((soma, item) =>
      soma + item.quantidade * item.precoUnitario, 0);
    $('#os-valor').value = (Math.round(valorProdutos * 100) / 100).toFixed(2);
    if (!$('#os-titulo').value.trim()) {
      $('#os-titulo').value = osProdutosSelecionados
        .map((item) => `${item.quantidade} × ${item.titulo}`).join(' + ');
    }
    renderProdutosSelecionadosOS();
    $('#os-produto-selecao').value = '';
    $('#os-produto-quantidade').value = '1';
    $('#os-produto-preco').value = '';
    definirStatusOS('');
  } catch (error) {
    definirStatusOS(error.message || 'Não foi possível adicionar o produto.', true);
  } finally {
    button.disabled = false;
  }
}

function renderProdutosSelecionadosOS() {
  const lista = $('#os-produtos-selecionados');
  if (!lista) return;
  lista.innerHTML = osProdutosSelecionados.map((item, index) => `
    <li class="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-800 px-3 py-2 text-sm">
      <span>${escaparHtml(item.titulo)} · ${item.quantidade} × ${brl(item.precoUnitario)} = ${brl(item.quantidade * item.precoUnitario)}</span>
      <button type="button" data-remover-produto-os="${index}" aria-label="Remover ${escaparHtml(item.titulo)}" class="rounded bg-red-900 px-2 py-1 text-xs text-white">Remover</button>
    </li>`).join('');
}

function removerProdutoOS(event) {
  const button = event.target.closest('[data-remover-produto-os]');
  if (!button) return;
  osProdutosSelecionados.splice(Number(button.dataset.removerProdutoOs), 1);
  const valorProdutos = osProdutosSelecionados.reduce((soma, item) =>
    soma + item.quantidade * item.precoUnitario, 0);
  $('#os-valor').value = osProdutosSelecionados.length
    ? (Math.round(valorProdutos * 100) / 100).toFixed(2)
    : '';
  renderProdutosSelecionadosOS();
}

function definirStatusOS(mensagem, erro = false) {
  const status = $('#os-status');
  if (!status) return;
  status.textContent = mensagem;
  status.classList.toggle('text-red-500', erro);
  status.classList.toggle('text-emerald-500', !erro);
}

// ============================================================
// CATÁLOGO DE PRODUTOS E FICHAS TÉCNICAS
// ============================================================
async function renderCatalogo() {
  const [produtos, fichas, insumos] = await Promise.all([
    db.produtos.toArray(),
    db.fichas_tecnicas.toArray(),
    db.insumos.toArray(),
  ]);
  const selecionados = new Map(
    [...document.querySelectorAll('#produto-insumos label')]
      .filter((label) => label.querySelector('[data-produto-insumo]')?.checked)
      .map((label) => [
        Number(label.querySelector('[data-produto-insumo]').value),
        Number(label.querySelector('[data-produto-quantidade]').value),
      ])
  );
  renderOpcoesInsumosProduto(insumos, selecionados);

  const fichasPorProduto = new Map();
  fichas.forEach((ficha) => {
    if (!fichasPorProduto.has(Number(ficha.produto_id))) fichasPorProduto.set(Number(ficha.produto_id), ficha);
  });
  const lista = $('#lista-produtos');
  if (!lista) return;

  produtos.sort((a, b) => String(a.nome ?? '').localeCompare(String(b.nome ?? ''), 'pt-BR'));
  lista.innerHTML = produtos.map((produto) => {
    const ficha = fichasPorProduto.get(Number(produto.id));
    let calculo = null;
    let composicao = [];
    let erroFicha = '';
    try {
      if (ficha) {
        composicao = lerComposicaoFicha(ficha);
        const resultado = calcularCustoFicha({
          itens: composicao,
          insumos,
          tempoMinutos: Number(ficha.tempo_minutos) || 0,
          valorHora: Number(ficha.valor_hora) || 0,
          taxaPagamento: Number(ficha.taxa_pagamento) || 0,
          margemLucro: Number(ficha.margem_lucro) || 0,
        });
        composicao = resultado.composicao;
        calculo = resultado.calculo;
      }
    } catch (error) {
      erroFicha = error.message;
    }

    const linhasComposicao = composicao.map((item) => `
      <li>${escaparHtml(item.nome)}: ${item.quantidade} ${escaparHtml(item.unidade)}</li>`).join('');
    const custo = calculo?.custoTotal ?? (Number(produto.custo_total) || 0);
    const preco = calculo?.precoVenda ?? (Number(produto.preco_base) || 0);
    const semComposicao = !ficha || !composicao.length || erroFicha;

    return `
      <li class="bg-white dark:bg-slate-800 rounded-xl shadow p-4 border border-slate-200 dark:border-slate-700">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h3 class="font-semibold">${escaparHtml(produto.nome)}</h3>
            <p class="mt-1 text-xs text-slate-500">${escaparHtml(produto.tipo || 'Produto pré-estabelecido')}</p>
          </div>
          <div class="flex gap-2">
            <button type="button" class="rounded-lg bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 text-xs" data-editar-produto="${produto.id}">Editar ficha</button>
            <button type="button" class="rounded-lg bg-red-900 hover:bg-red-800 text-white px-3 py-1.5 text-xs" data-excluir-produto="${produto.id}">Excluir</button>
          </div>
        </div>
        <div class="mt-3 grid grid-cols-2 gap-2 text-sm">
          <p>Custo por unidade: <strong>${brl(custo)}</strong></p>
          <p>Preço sugerido: <strong class="text-emerald-400">${brl(preco)}</strong></p>
        </div>
        <p class="mt-3 text-xs uppercase text-slate-500">Composição por unidade</p>
        ${erroFicha
          ? `<p class="text-sm text-amber-400">${escaparHtml(erroFicha)}</p>`
          : linhasComposicao
            ? `<ul class="mt-1 list-disc pl-5 text-sm text-slate-400">${linhasComposicao}</ul>`
            : '<p class="mt-1 text-sm text-slate-400">Sem ficha técnica cadastrada.</p>'}
        <div class="mt-4 flex flex-wrap items-end gap-2">
          <label class="text-xs">Unidades
            <input data-produto-quantidade-orcamento="${produto.id}" type="number" min="1" step="1" value="1" class="input !w-24 !py-1 mt-1">
          </label>
          <button type="button" data-orcar-produto="${produto.id}" ${semComposicao ? 'disabled title="Cadastre uma ficha técnica válida antes de gerar o orçamento"' : ''}
            class="rounded-lg ${semComposicao ? 'bg-slate-700 text-slate-400 cursor-not-allowed' : 'bg-emerald-700 hover:bg-emerald-600 text-white'} px-3 py-1.5 text-xs">Gerar orçamento</button>
        </div>
      </li>`;
  }).join('') || '<li class="text-sm text-slate-400 italic">Nenhum produto cadastrado. Crie o primeiro produto usando insumos do estoque.</li>';

  lista.querySelectorAll('[data-editar-produto]').forEach((button) => {
    button.addEventListener('click', () => editarProduto(Number(button.dataset.editarProduto)));
  });
  lista.querySelectorAll('[data-excluir-produto]').forEach((button) => {
    button.addEventListener('click', () => excluirProduto(Number(button.dataset.excluirProduto)));
  });
  await renderSelectProdutosOS();
}

function renderOpcoesInsumosProduto(insumos, selecionados = new Map()) {
  const lista = $('#produto-insumos');
  if (!lista) return;
  lista.innerHTML = insumos.map((insumo) => {
    const quantidade = selecionados.get(Number(insumo.id));
    const checked = quantidade !== undefined;
    return `
      <label class="flex items-center gap-2 text-sm py-1 flex-wrap">
        <input type="checkbox" data-produto-insumo value="${insumo.id}" ${checked ? 'checked' : ''}>
        <span>${escaparHtml(insumo.nome)} <span class="text-xs text-slate-400">(${escaparHtml(insumo.unidade || 'un')} · estoque ${Number(insumo.quantidade) || 0} · ${brl(insumo.custo_unitario || 0)})</span></span>
        <input data-produto-quantidade type="number" min="0.01" step="0.01" value="${checked ? quantidade : 1}" ${checked ? '' : 'disabled'}
          aria-label="Quantidade de ${escaparHtml(insumo.nome)} por produto" class="input !w-24 !py-1 ml-auto">
      </label>`;
  }).join('') || '<p class="text-xs text-slate-400 italic">Cadastre insumos no módulo Estoque antes de montar produtos.</p>';
}

function lerComposicaoProdutoForm() {
  return [...document.querySelectorAll('#produto-insumos label')]
    .filter((label) => label.querySelector('[data-produto-insumo]')?.checked)
    .map((label) => ({
      insumo_id: Number(label.querySelector('[data-produto-insumo]').value),
      quantidade: Number(label.querySelector('[data-produto-quantidade]').value),
    }));
}

async function calcularPreviewProduto() {
  const insumos = await db.insumos.toArray();
  return calcularCustoFicha({
    itens: lerComposicaoProdutoForm(),
    insumos,
    tempoMinutos: Number($('#produto-tempo').value),
    valorHora: Number($('#produto-valor-hora').value),
    taxaPagamento: Number($('#produto-taxa').value) / 100,
    margemLucro: Number($('#produto-margem').value) / 100,
  });
}

async function atualizarPreviewProduto() {
  const resultado = $('#produto-resultado');
  if (!resultado) return;
  document.querySelectorAll('#produto-insumos label').forEach((label) => {
    const checkbox = label.querySelector('[data-produto-insumo]');
    const quantidade = label.querySelector('[data-produto-quantidade]');
    if (checkbox && quantidade) quantidade.disabled = !checkbox.checked;
  });
  try {
    const { calculo } = await calcularPreviewProduto();
    resultado.innerHTML = `
      <dl class="grid grid-cols-2 gap-x-4 gap-y-1">
        <dt class="text-slate-500">Custo de insumos</dt><dd class="text-right">${brl(calculo.custoInsumos)}</dd>
        <dt class="text-slate-500">Mão de obra</dt><dd class="text-right">${brl(calculo.custoMaoDeObra)}</dd>
        <dt class="text-slate-500">Taxas</dt><dd class="text-right">${brl(calculo.custoTaxas)}</dd>
        <dt class="font-medium">Custo total por unidade</dt><dd class="text-right font-medium">${brl(calculo.custoTotal)}</dd>
        <dt class="mt-2 text-slate-500">Preço sugerido por unidade</dt><dd class="mt-2 text-right text-lg font-bold text-emerald-400">${brl(calculo.precoVenda)}</dd>
      </dl>`;
  } catch (error) {
    resultado.innerHTML = `<p class="text-amber-400">${escaparHtml(error.message)}</p>`;
  }
}

async function aoSalvarProduto(event) {
  event.preventDefault();
  const id = Number($('#produto-id').value) || null;
  const nome = $('#produto-nome').value.trim();
  if (!nome) {
    definirStatusProdutos('Informe o nome do produto.', true);
    return;
  }

  try {
    const produtoExistente = id ? await db.produtos.get(id) : null;
    if (id && !produtoExistente) throw new Error('Este produto não foi encontrado. Atualize o catálogo e tente novamente.');
    const fichaExistente = id
      ? await db.fichas_tecnicas.where('produto_id').equals(id).first()
      : null;
    const { composicao, calculo } = await calcularPreviewProduto();
    const agora = new Date().toISOString();
    const produto = {
      ...(produtoExistente || {}),
      ...(id ? { id } : {}),
      nome,
      tipo: produtoExistente?.tipo || 'Produto pré-estabelecido',
      custo_total: calculo.custoTotal,
      preco_base: calculo.precoVenda,
      criado_em: produtoExistente?.criado_em || agora,
    };
    const ficha = {
      ...(fichaExistente || {}),
      ...(fichaExistente?.id ? { id: fichaExistente.id } : {}),
      produto_id: id || 0,
      nome,
      itens: JSON.stringify(composicao.map(({ insumo_id, quantidade }) => ({ insumo_id, quantidade }))),
      tempo_minutos: Number($('#produto-tempo').value),
      valor_hora: Number($('#produto-valor-hora').value),
      taxa_pagamento: Number($('#produto-taxa').value) / 100,
      margem_lucro: Number($('#produto-margem').value) / 100,
      custo_total: calculo.custoTotal,
      preco_sugerido: calculo.precoVenda,
      criado_em: fichaExistente?.criado_em || agora,
    };
    await db.transaction('rw', db.produtos, db.fichas_tecnicas, async () => {
      const produtoId = await salvar('produtos', produto);
      if (!id) ficha.produto_id = produtoId;
      await salvar('fichas_tecnicas', ficha);
    });

    await cancelarEdicaoProduto();
    definirStatusProdutos(`Produto salvo. Custo por unidade ${brl(calculo.custoTotal)}; preço sugerido ${brl(calculo.precoVenda)}.`);
    await renderCatalogo();
  } catch (error) {
    definirStatusProdutos(error.message || 'Não foi possível salvar o produto.', true);
  }
}

async function editarProduto(id) {
  const produto = await db.produtos.get(id);
  if (!produto) return;
  const ficha = await db.fichas_tecnicas.where('produto_id').equals(id).first();
  $('#produto-id').value = produto.id;
  $('#produto-nome').value = produto.nome || '';
  $('#produto-tempo').value = ficha?.tempo_minutos ?? 0;
  $('#produto-valor-hora').value = ficha?.valor_hora ?? 0;
  $('#produto-taxa').value = (Number(ficha?.taxa_pagamento) || 0) * 100;
  $('#produto-margem').value = (Number(ficha?.margem_lucro) || 0) * 100;
  $('#produto-form-titulo').textContent = 'Editar produto e ficha técnica';
  $('#produto-salvar').textContent = 'Salvar alterações';
  $('#produto-cancelar').classList.remove('hidden');
  const selecionados = new Map(lerComposicaoFicha(ficha).map((item) => [Number(item.insumo_id), Number(item.quantidade)]));
  const insumos = await db.insumos.toArray();
  renderOpcoesInsumosProduto(insumos, selecionados);
  await atualizarPreviewProduto();
  $('#produto-nome').focus();
}

async function excluirProduto(id) {
  const produto = await db.produtos.get(id);
  if (!produto) return;
  if (!window.confirm(`Excluir "${produto.nome}" e sua ficha técnica? Orçamentos já criados serão mantidos.`)) return;
  try {
    await db.transaction('rw', db.produtos, db.fichas_tecnicas, async () => {
      const fichas = await db.fichas_tecnicas.where('produto_id').equals(id).toArray();
      for (const ficha of fichas) await remover('fichas_tecnicas', ficha.id);
      await remover('produtos', id);
    });
    definirStatusProdutos(`Produto "${produto.nome}" removido do catálogo. Orçamentos anteriores foram preservados.`);
    await renderCatalogo();
  } catch (error) {
    definirStatusProdutos(`Não foi possível excluir o produto: ${error.message}`, true);
  }
}

async function cancelarEdicaoProduto() {
  $('#form-produto')?.reset();
  $('#produto-id').value = '';
  $('#produto-tempo').value = 0;
  $('#produto-valor-hora').value = 0;
  $('#produto-taxa').value = 0;
  $('#produto-margem').value = 30;
  $('#produto-form-titulo').textContent = 'Cadastrar produto pré-estabelecido';
  $('#produto-salvar').textContent = 'Salvar produto';
  $('#produto-cancelar').classList.add('hidden');
  $('#produtos-status').textContent = '';
  renderOpcoesInsumosProduto(await db.insumos.toArray());
  await atualizarPreviewProduto();
}

function definirStatusProdutos(mensagem, erro = false) {
  const status = $('#produtos-status');
  if (!status) return;
  status.textContent = mensagem;
  status.classList.toggle('text-red-500', erro);
  status.classList.toggle('text-emerald-500', !erro);
}

async function aoAcionarProduto(event) {
  const button = event.target.closest('[data-orcar-produto]');
  if (!button || button.disabled) return;
  const id = Number(button.dataset.orcarProduto);
  button.disabled = true;
  try {
    const produto = await db.produtos.get(id);
    const ficha = await db.fichas_tecnicas.where('produto_id').equals(id).first();
    if (!produto || !ficha) throw new Error('Produto ou ficha técnica não encontrado.');
    const { composicao, calculo } = await calcularCustoFicha({
      itens: lerComposicaoFicha(ficha),
      insumos: await db.insumos.toArray(),
      tempoMinutos: Number(ficha.tempo_minutos) || 0,
      valorHora: Number(ficha.valor_hora) || 0,
      taxaPagamento: Number(ficha.taxa_pagamento) || 0,
      margemLucro: Number(ficha.margem_lucro) || 0,
    });
    orcamentoProdutosPendentes = [{
      produtoId: produto.id,
      titulo: produto.nome,
      quantidade: Number(document.querySelector(`[data-produto-quantidade-orcamento="${id}"]`)?.value) || 1,
      precoUnitario: calculo.precoVenda,
      composicao,
    }];
    const clienteSelecionado = $('#produto-cliente').value;
    const clienteSelect = $('#orcamento-produto-cliente');
    clienteSelect.innerHTML = $('#produto-cliente').innerHTML;
    clienteSelect.value = clienteSelecionado;
    $('#orcamento-produto-titulo').value = produto.nome;
    $('#orcamento-produto-quantidade').value =
      document.querySelector(`[data-produto-quantidade-orcamento="${id}"]`)?.value || '1';
    $('#orcamento-produto-preco').value = calculo.precoVenda.toFixed(2);
    $('#orcamento-produto-sinal').value = '0';
    $('#orcamento-produto-mensagem').value = '';
    $('#orcamento-produto-status').textContent = '';
    $('#adicionar-produtos-painel').classList.add('hidden');
    $('#personalizar-mensagem-painel').classList.add('hidden');
    $('#btn-personalizar-mensagem').setAttribute('aria-expanded', 'false');
    $('#btn-adicionar-produtos').setAttribute('aria-expanded', 'false');
    await carregarOpcoesProdutosAdicionais();
    renderItensDoOrcamento();
    await atualizarPreviewOrcamentoProduto();
    $('#dialog-orcamento-produto').showModal();
    $('#orcamento-produto-titulo').focus();
  } catch (error) {
    definirStatusProdutos(error.message || 'Não foi possível criar o orçamento.', true);
  } finally {
    button.disabled = false;
  }
}

async function carregarOpcoesProdutosAdicionais() {
  const [produtos, fichas] = await Promise.all([
    db.produtos.toArray(),
    db.fichas_tecnicas.toArray(),
  ]);
  const idsComFicha = new Set(fichas.map((ficha) => Number(ficha.produto_id)));
  const disponiveis = produtos.filter((produto) => idsComFicha.has(Number(produto.id)));
  $('#adicionar-produto-selecao').innerHTML = '<option value="">Selecione um produto</option>' +
    disponiveis.map((produto) =>
      `<option value="${produto.id}">${escaparHtml(produto.nome)}</option>`).join('');
  $('#adicionar-produto-preco').value = '';
}

function alternarPainelAdicionarProdutos() {
  const painel = $('#adicionar-produtos-painel');
  const abrir = painel.classList.contains('hidden');
  painel.classList.toggle('hidden', !abrir);
  $('#btn-adicionar-produtos').setAttribute('aria-expanded', String(abrir));
  if (abrir) $('#adicionar-produto-selecao').focus();
}

function alternarPersonalizacaoMensagem() {
  const painel = $('#personalizar-mensagem-painel');
  const abrir = painel.classList.contains('hidden');
  painel.classList.toggle('hidden', !abrir);
  $('#btn-personalizar-mensagem').setAttribute('aria-expanded', String(abrir));
  if (abrir) $('#orcamento-produto-mensagem').focus();
  atualizarPreviewOrcamentoProduto();
}

async function preencherPrecoProdutoAdicional() {
  const id = Number($('#adicionar-produto-selecao').value);
  if (!id) {
    $('#adicionar-produto-preco').value = '';
    return;
  }
  try {
    const ficha = await db.fichas_tecnicas.where('produto_id').equals(id).first();
    if (!ficha) throw new Error('Este produto não possui ficha técnica.');
    const { calculo } = await calcularCustoFicha({
      itens: lerComposicaoFicha(ficha),
      insumos: await db.insumos.toArray(),
      tempoMinutos: Number(ficha.tempo_minutos) || 0,
      valorHora: Number(ficha.valor_hora) || 0,
      taxaPagamento: Number(ficha.taxa_pagamento) || 0,
      margemLucro: Number(ficha.margem_lucro) || 0,
    });
    $('#adicionar-produto-preco').value = calculo.precoVenda.toFixed(2);
  } catch (error) {
    $('#orcamento-produto-status').textContent = error.message || 'Não foi possível calcular este produto.';
  }
}

async function adicionarProdutoAoOrcamento() {
  const button = $('#btn-confirmar-adicao-produto');
  button.disabled = true;
  try {
    const produtoId = Number($('#adicionar-produto-selecao').value);
    const quantidade = Number($('#adicionar-produto-quantidade').value);
    const precoUnitario = Number($('#adicionar-produto-preco').value);
    if (!produtoId) throw new Error('Selecione um produto do catálogo.');
    if (!Number.isInteger(quantidade) || quantidade < 1) throw new Error('A quantidade deve ser um inteiro maior que zero.');
    if (!Number.isFinite(precoUnitario) || precoUnitario < 0) throw new Error('Informe um preço unitário válido.');

    const [produto, ficha, insumos] = await Promise.all([
      db.produtos.get(produtoId),
      db.fichas_tecnicas.where('produto_id').equals(produtoId).first(),
      db.insumos.toArray(),
    ]);
    if (!produto || !ficha) throw new Error('O produto ou a ficha técnica não está mais disponível.');
    const { composicao } = await calcularCustoFicha({
      itens: lerComposicaoFicha(ficha),
      insumos,
      tempoMinutos: Number(ficha.tempo_minutos) || 0,
      valorHora: Number(ficha.valor_hora) || 0,
      taxaPagamento: Number(ficha.taxa_pagamento) || 0,
      margemLucro: Number(ficha.margem_lucro) || 0,
    });
    orcamentoProdutosPendentes.push({
      produtoId,
      titulo: produto.nome,
      quantidade,
      precoUnitario,
      composicao,
    });
    $('#adicionar-produto-selecao').value = '';
    $('#adicionar-produto-quantidade').value = '1';
    $('#adicionar-produto-preco').value = '';
    $('#orcamento-produto-status').textContent = '';
    $('#adicionar-produtos-painel').classList.add('hidden');
    $('#btn-adicionar-produtos').setAttribute('aria-expanded', 'false');
    renderItensDoOrcamento();
    await atualizarPreviewOrcamentoProduto();
  } catch (error) {
    $('#orcamento-produto-status').textContent = error.message || 'Não foi possível adicionar o produto.';
  } finally {
    button.disabled = false;
  }
}

function linhasOrcamentoAtuais() {
  if (!orcamentoProdutosPendentes.length) return [];
  const linhas = [...orcamentoProdutosPendentes];
  linhas[0] = {
    ...linhas[0],
    titulo: $('#orcamento-produto-titulo').value.trim(),
    quantidade: Number($('#orcamento-produto-quantidade').value),
    precoUnitario: Number($('#orcamento-produto-preco').value),
  };
  return linhas;
}

function renderItensDoOrcamento() {
  $('#orcamento-produto-itens').innerHTML = linhasOrcamentoAtuais().map((produto, index) => `
    <li class="flex items-center justify-between gap-2 rounded-lg bg-slate-800 px-3 py-2 text-sm">
      <span>${escaparHtml(produto.titulo)} · ${produto.quantidade} × ${brl(produto.precoUnitario)} = ${brl(produto.quantidade * produto.precoUnitario)}</span>
      ${index ? `<button type="button" data-remover-item-orcamento="${index}" aria-label="Remover ${escaparHtml(produto.titulo)}" class="rounded bg-red-900 px-2 py-1 text-xs">Remover</button>` : '<span class="text-xs text-slate-400">Produto principal</span>'}
    </li>`).join('');
}

async function removerProdutoDoOrcamento(event) {
  const button = event.target.closest('[data-remover-item-orcamento]');
  if (!button) return;
  orcamentoProdutosPendentes.splice(Number(button.dataset.removerItemOrcamento), 1);
  renderItensDoOrcamento();
  await atualizarPreviewOrcamentoProduto();
}

function fecharEditorOrcamento() {
  $('#dialog-orcamento-produto')?.close();
}

function valorNumericoOrcamento(id) {
  return Number(document.getElementById(id).value);
}

async function atualizarTotalOrcamentoProduto() {
  const linhas = linhasOrcamentoAtuais();
  const sinal = valorNumericoOrcamento('orcamento-produto-sinal');
  const valoresValidos = linhas.length > 0 && linhas.every((linha) =>
    linha.titulo && Number.isInteger(linha.quantidade) && linha.quantidade >= 1
      && Number.isFinite(linha.precoUnitario) && linha.precoUnitario >= 0);
  const total = linhas.reduce((soma, linha) => soma + linha.quantidade * linha.precoUnitario, 0);
  const saldo = total - sinal;
  const preview = $('#orcamento-produto-total');

  if (!valoresValidos || !Number.isFinite(sinal) || sinal < 0 || sinal > total) {
    preview.textContent = 'Revise os produtos, quantidades e preços. O sinal deve estar entre zero e o total.';
    preview.classList.add('text-amber-400');
    return false;
  }
  preview.classList.remove('text-amber-400');
  preview.textContent = `${linhas.length} produto(s) · Total: ${brl(total)} · Sinal: ${brl(sinal)} · Saldo: ${brl(saldo)}`;
  return true;
}

async function atualizarPreviewOrcamentoProduto() {
  renderItensDoOrcamento();
  const valido = await atualizarTotalOrcamentoProduto();
  const preview = $('#orcamento-produto-preview');
  if (!valido) {
    preview.textContent = 'A prévia será atualizada quando quantidade, preço e sinal forem válidos.';
    return;
  }
  const cliente = $('#orcamento-produto-cliente').selectedOptions[0]?.textContent;
  if (!cliente) {
    preview.textContent = 'Selecione um cliente para visualizar a mensagem completa.';
    return;
  }

  try {
    const rascunho = criarRascunhoOrcamento({
      produtos: linhasOrcamentoAtuais(),
      sinal: valorNumericoOrcamento('orcamento-produto-sinal'),
    });
    preview.textContent = montarMensagemOrcamento({
      cliente,
      titulo: rascunho.titulo,
      valorTotal: rascunho.valor_total,
      sinal: rascunho.sinal,
      detalhes: rascunho.detalhes,
      observacao: $('#orcamento-produto-mensagem').value,
    });
  } catch (error) {
    preview.textContent = error.message;
  }
}

async function salvarOrcamentoProduto(event) {
  event.preventDefault();
  const status = $('#orcamento-produto-status');
  status.textContent = '';
  const novaAba = window.open('about:blank', '_blank');
  const botao = $('#form-orcamento-produto button[type="submit"]');
  botao.disabled = true;
  try {
    if (!await atualizarTotalOrcamentoProduto()) {
      throw new Error('Revise quantidade, preço e sinal antes de continuar.');
    }

    const clienteId = Number($('#orcamento-produto-cliente').value);
    const cliente = await db.clientes.get(clienteId);
    if (!cliente) throw new Error('Selecione um cliente cadastrado para criar o orçamento.');
    const link = criarLinkWhatsapp(cliente.telefone);

    const sinal = valorNumericoOrcamento('orcamento-produto-sinal');
    const observacao = $('#orcamento-produto-mensagem').value.trim();
    const insumosEstoque = await db.insumos.toArray();
    const linhas = [];
    for (const linha of linhasOrcamentoAtuais()) {
      const [produto, ficha] = await Promise.all([
        db.produtos.get(linha.produtoId),
        db.fichas_tecnicas.where('produto_id').equals(linha.produtoId).first(),
      ]);
      if (!produto || !ficha) throw new Error(`O produto "${linha.titulo}" ou sua ficha técnica não está mais disponível.`);
      const { composicao } = await calcularCustoFicha({
        itens: lerComposicaoFicha(ficha),
        insumos: insumosEstoque,
        tempoMinutos: Number(ficha.tempo_minutos) || 0,
        valorHora: Number(ficha.valor_hora) || 0,
        taxaPagamento: Number(ficha.taxa_pagamento) || 0,
        margemLucro: Number(ficha.margem_lucro) || 0,
      });
      linhas.push({ ...linha, composicao });
    }
    const rascunho = criarRascunhoOrcamento({
      produtos: linhas,
      titulo: linhas.map((linha) => `${linha.quantidade} × ${linha.titulo}`).join(' + '),
      sinal,
    });
    const mensagem = montarMensagemOrcamento({
      cliente: cliente.nome,
      titulo: rascunho.titulo,
      valorTotal: rascunho.valor_total,
      sinal: rascunho.sinal,
      detalhes: rascunho.detalhes,
      observacao,
    });
    const osId = await novaOS({
      titulo: rascunho.titulo,
      cliente_id: clienteId,
      produto_id: linhas[0].produtoId,
      itens: rascunho.itens,
      valor_total: rascunho.valor_total,
      sinal: rascunho.sinal,
      orcamento_detalhes: rascunho.detalhes,
      mensagem_adicional: observacao,
    });
    const url = `${link}?text=${encodeURIComponent(mensagem)}`;
    if (novaAba) {
      novaAba.opener = null;
      novaAba.location.href = url;
    } else {
      definirStatusProdutos(`Orçamento criado (#${osId}), mas o navegador bloqueou a nova aba. Abra o quadro e use “Revisar no WhatsApp”.`);
    }
    fecharEditorOrcamento();
    document.querySelector('[data-tab="kanban"]')?.click();
    document.getElementById('kanban')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    if (novaAba) novaAba.close();
    status.textContent = error.message || 'Não foi possível criar o orçamento.';
  } finally {
    botao.disabled = false;
  }
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

  const personalizarMensagem = !$('#os-personalizar-mensagem-painel').classList.contains('hidden');
  let novaAba = personalizarMensagem ? window.open('about:blank', '_blank') : null;
  let popupBloqueado = false;
  try {
    const sinal = parseFloat($('#os-sinal').value) || 0;
    const itensManuais = [...document.querySelectorAll('#os-insumos-multiplo input:checked')].map((checkbox) => ({
      insumo_id: Number(checkbox.value),
      quantidade: parseFloat(checkbox.closest('label')?.querySelector('input[type=number]')?.value) || 1,
    })).filter((item) => item.insumo_id);
    const rascunhoProdutos = osProdutosSelecionados.length
      ? criarRascunhoOrcamento({ produtos: osProdutosSelecionados, sinal: 0 })
      : null;
    const valorDigitado = $('#os-valor').value.trim();
    const valorCalculado = parseFloat($('#calc-resultado').dataset.valor || '') || 0;
    const valor_total = valorDigitado
      ? Number(valorDigitado)
      : valorCalculado || rascunhoProdutos?.valor_total || 0;
    if (!Number.isFinite(valor_total) || valor_total < 0) throw new Error('Informe um valor total válido.');
    if (!Number.isFinite(sinal) || sinal < 0 || sinal > valor_total) {
      throw new Error('O sinal deve estar entre zero e o valor total da OS.');
    }

    const quantidades = new Map();
    for (const item of [...(rascunhoProdutos?.itens || []), ...itensManuais]) {
      quantidades.set(item.insumo_id, (quantidades.get(item.insumo_id) || 0) + item.quantidade);
    }
    const itens = [...quantidades].map(([insumo_id, quantidade]) => ({ insumo_id, quantidade }));
    const detalhes = rascunhoProdutos?.detalhes || [];
    if (rascunhoProdutos && valor_total !== rascunhoProdutos.valor_total) {
      const ajuste = Math.round((valor_total - rascunhoProdutos.valor_total) * 100) / 100;
      detalhes.push({
        nome: 'Ajuste no valor do orçamento',
        quantidade: 1,
        precoUnitario: ajuste,
        subtotal: ajuste,
        insumos: [],
      });
    }

    const cliente_id = $('#os-cliente').value ? Number($('#os-cliente').value) : null;
    const mensagemAdicional = personalizarMensagem ? $('#os-mensagem-cliente').value.trim() : '';
    let urlWhatsapp = '';
    if (personalizarMensagem) {
      const cliente = cliente_id ? await db.clientes.get(cliente_id) : null;
      if (!cliente) throw new Error('Selecione um cliente para personalizar e abrir a mensagem no WhatsApp.');
      const link = criarLinkWhatsapp(cliente.telefone);
      const mensagem = montarMensagemOrcamento({
        cliente: cliente.nome,
        titulo,
        valorTotal: valor_total,
        sinal,
        detalhes,
        observacao: mensagemAdicional,
      });
      urlWhatsapp = `${link}?text=${encodeURIComponent(mensagem)}`;
    }

    await novaOS({
      titulo,
      cliente_id,
      produto_id: osProdutosSelecionados[0]?.produtoId,
      itens,
      valor_total,
      sinal,
      orcamento_detalhes: detalhes.length ? detalhes : undefined,
      mensagem_adicional: mensagemAdicional || undefined,
    });
    if (urlWhatsapp && novaAba) {
      novaAba.opener = null;
      novaAba.location.href = urlWhatsapp;
    } else if (urlWhatsapp) {
      popupBloqueado = true;
      definirStatusOS('OS criada. O navegador bloqueou a nova aba; abra o cartão da OS e selecione “Revisar no WhatsApp”.', true);
    }

    e.target.reset();
    osProdutosSelecionados = [];
    renderProdutosSelecionadosOS();
    $('#os-adicionar-produtos-painel').classList.add('hidden');
    $('#os-personalizar-mensagem-painel').classList.add('hidden');
    $('#btn-os-adicionar-produtos').setAttribute('aria-expanded', 'false');
    $('#btn-os-personalizar-mensagem').setAttribute('aria-expanded', 'false');
    $('#calc-resultado').innerHTML = '';
    $('#calc-resultado').dataset.valor = '';
    if (!urlWhatsapp) alert('✅ OS criada na coluna "Orçamento". Os insumos serão descontados ao mover para "Em Produção".');
    else if (!popupBloqueado) definirStatusOS('OS criada. Revise a mensagem aberta no WhatsApp e envie manualmente.');
  } catch (error) {
    if (novaAba) novaAba.close();
    definirStatusOS(error.message || 'Não foi possível criar a OS.', true);
  }
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
  const clientes = await db.clientes.toArray();
  clientes.sort((a, b) => String(a.nome ?? '').localeCompare(String(b.nome ?? ''), 'pt-BR'));

  if (sel) {
    const selecionado = sel.value;
    sel.innerHTML = '<option value="">— Sem cliente —</option>' +
      clientes.map((cliente) => `<option value="${cliente.id}">${escaparHtml(cliente.nome)}</option>`).join('');
    sel.value = selecionado;
  }
  const produtoCliente = $('#produto-cliente');
  if (produtoCliente) {
    const selecionado = produtoCliente.value;
    produtoCliente.innerHTML = '<option value="">— Sem cliente —</option>' +
      clientes.map((cliente) => `<option value="${cliente.id}">${escaparHtml(cliente.nome)}</option>`).join('');
    produtoCliente.value = selecionado;
  }

  const lista = $('#lista-clientes');
  if (!lista) return;
  lista.innerHTML = clientes.map((cliente) => {
    let linkWhatsapp = '';
    if (cliente.telefone) {
      try {
        linkWhatsapp = `<a class="rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white px-3 py-1.5 text-xs" href="${escaparHtml(criarLinkWhatsapp(cliente.telefone))}" target="_blank" rel="noopener noreferrer">Abrir WhatsApp</a>`;
      } catch {
        linkWhatsapp = '<span class="text-xs text-amber-400" title="Corrija o número no cadastro">WhatsApp inválido</span>';
      }
    }

    return `
      <li class="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-700 rounded-lg px-3 py-3 text-sm border border-slate-200 dark:border-slate-600">
        <div class="min-w-0">
          <strong>${escaparHtml(cliente.nome)}</strong>
          <p class="text-xs text-slate-500">${escaparHtml(cliente.telefone || 'WhatsApp não cadastrado')}${cliente.email ? ` · ${escaparHtml(cliente.email)}` : ''}</p>
        </div>
        <div class="flex items-center gap-2">
          ${linkWhatsapp}
          <button type="button" class="rounded-lg bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 text-xs" data-editar-cliente="${cliente.id}">Editar</button>
        </div>
      </li>`;
  }).join('') || '<li class="text-sm text-slate-400 italic">Nenhum cliente cadastrado.</li>';

  lista.querySelectorAll('[data-editar-cliente]').forEach((button) => {
    button.addEventListener('click', () => editarCliente(Number(button.dataset.editarCliente)));
  });
}

async function aoSalvarCliente(event) {
  event.preventDefault();
  const id = Number($('#cliente-id').value) || null;
  const nome = $('#cliente-nome').value.trim();
  const telefone = $('#cliente-whatsapp').value.trim();
  const email = $('#cliente-email').value.trim().toLowerCase();
  const status = $('#clientes-status');
  status.textContent = '';
  status.classList.remove('text-red-500', 'text-emerald-500');

  try {
    if (!nome) throw new Error('Informe o nome do cliente.');
    normalizarTelefoneWhatsapp(telefone);
    const cliente = id ? await db.clientes.get(id) : null;
    if (id && !cliente) throw new Error('Este cliente não foi encontrado. Atualize a lista e tente novamente.');

    if (email) {
      const emailEmUso = (await db.clientes.toArray()).some((item) =>
        item.id !== id && String(item.email ?? '').trim().toLowerCase() === email);
      if (emailEmUso) throw new Error('Este e-mail já está cadastrado para outro cliente.');
    }

    const dados = {
      ...(cliente || {}),
      ...(id ? { id } : {}),
      nome,
      telefone,
      criado_em: cliente?.criado_em || new Date().toISOString(),
    };
    if (email) dados.email = email;
    else delete dados.email;

    await salvar('clientes', dados);
  } catch (error) {
    status.textContent = error.message || 'Não foi possível salvar o cliente.';
    status.classList.add('text-red-500');
    return;
  }

  cancelarEdicaoCliente();
  status.textContent = 'Cliente salvo neste dispositivo; a sincronização Supabase será agendada quando disponível.';
  status.classList.add('text-emerald-500');
  try {
    await Promise.all([renderClientes(), renderKanban()]);
  } catch (error) {
    status.textContent = `Cliente salvo, mas a tela não pôde ser atualizada: ${error.message}`;
    status.classList.remove('text-emerald-500');
    status.classList.add('text-red-500');
  }
}

async function editarCliente(id) {
  const cliente = await db.clientes.get(id);
  if (!cliente) return;
  $('#cliente-id').value = cliente.id;
  $('#cliente-nome').value = cliente.nome || '';
  $('#cliente-whatsapp').value = cliente.telefone || '';
  $('#cliente-email').value = cliente.email || '';
  $('#cliente-form-titulo').textContent = 'Editar cliente';
  $('#cliente-salvar').textContent = 'Salvar alterações';
  $('#cliente-cancelar').classList.remove('hidden');
  $('#clientes-status').textContent = '';
  $('#cliente-nome').focus();
}

function cancelarEdicaoCliente() {
  $('#form-cliente')?.reset();
  $('#cliente-id').value = '';
  $('#cliente-form-titulo').textContent = 'Cadastrar cliente';
  $('#cliente-salvar').textContent = 'Salvar cliente';
  $('#cliente-cancelar').classList.add('hidden');
  $('#clientes-status').textContent = '';
}
