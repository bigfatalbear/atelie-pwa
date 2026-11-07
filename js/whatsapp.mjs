const moedaBRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export function normalizarTelefoneWhatsapp(telefone) {
  const digits = String(telefone ?? '').replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.length >= 12 && digits.length <= 15) return digits;
  throw new Error('Informe um número de WhatsApp válido com DDD e, se necessário, código do país.');
}

export function criarLinkWhatsapp(telefone, mensagem = '') {
  const url = `https://wa.me/${normalizarTelefoneWhatsapp(telefone)}`;
  return mensagem ? `${url}?text=${encodeURIComponent(mensagem)}` : url;
}

export function montarMensagemOrcamento({ cliente, titulo, valorTotal, sinal, detalhes = [] }) {
  const total = Math.max(0, Number(valorTotal) || 0);
  const entrada = Math.max(0, Number(sinal) || 0);
  const saldo = Math.max(0, total - entrada);
  const linhasDetalhes = Array.isArray(detalhes) ? detalhes.flatMap((item) => {
    const linhas = [
      `• ${item.nome} — ${item.quantidade} × ${moedaBRL.format(Number(item.precoUnitario) || 0)} = ${moedaBRL.format(Number(item.subtotal) || 0)}`,
    ];
    if (Array.isArray(item.insumos) && item.insumos.length) {
      linhas.push('  Composição:');
      item.insumos.forEach((insumo) => {
        linhas.push(`  - ${insumo.nome}: ${insumo.quantidade} ${insumo.unidade || ''}`.trimEnd());
      });
    }
    return linhas;
  }) : [];

  return [
    `Olá, ${cliente}! Segue o orçamento solicitado:`,
    '',
    `*${titulo}*`,
    ...(linhasDetalhes.length ? ['', 'Itens:', ...linhasDetalhes] : []),
    '',
    `Valor total: ${moedaBRL.format(total)}`,
    `Sinal: ${moedaBRL.format(entrada)}`,
    `Saldo restante: ${moedaBRL.format(saldo)}`,
    '',
    'Se estiver de acordo, me avise por aqui.',
  ].join('\n');
}
