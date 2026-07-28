/**
 * printFichaEntregaEPI(dados)
 *
 * dados = {
 *   funcionario: { codigo, nome },
 *   data_entrega: string | Date,
 *   sap_doc_num: string | null,
 *   itens: [{ item_code, item_name, quantidade }],
 * }
 *
 * Contrato único de dados: tanto o fluxo de salvar (dados montados em memória,
 * sem round-trip ao banco) quanto o de reimpressão (dados buscados do Supabase
 * na Ficha do Funcionário) devem montar esse mesmo formato antes de chamar.
 */
export function printFichaEntregaEPI(dados) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Por favor, permita pop-ups no navegador para visualizar a ficha.');
    return;
  }

  printWindow.document.write('<html><head><title>Carregando Ficha...</title><style>body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f8f9fa; color: #555; }</style></head><body><h2>Montando ficha de entrega...</h2></body></html>');
  printWindow.document.close();

  try {
    const { funcionario, data_entrega, sap_doc_num, itens } = dados;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Ficha de Entrega de EPI - ${funcionario.nome}</title>
        <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
        <style>
          :root {
            --primary: #2b5c46;
            --text-main: #202124;
            --text-muted: #5f6368;
            --border: #dadce0;
          }
          body {
            font-family: 'Roboto', sans-serif;
            padding: 20px;
            font-size: 11px;
            color: var(--text-main);
            line-height: 1.4;
            margin: 0;
            background: #fff;
          }
          .header-container {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid var(--primary);
            padding-bottom: 12px;
            margin-bottom: 16px;
          }
          .logo { max-height: 50px; }
          .header-text { text-align: right; }
          .header-text h1 { margin: 0 0 4px 0; font-size: 18px; color: var(--primary); text-transform: uppercase; letter-spacing: 0.5px; }
          .header-text .doc-code { font-size: 14px; font-weight: bold; color: var(--text-main); }

          .info-panel {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px;
            margin-bottom: 20px;
            background: #f8f9fa;
            border: 1px solid var(--border);
            border-radius: 6px;
            padding: 12px;
          }
          .info-item { display: flex; flex-direction: column; }
          .info-label { font-size: 9px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 2px; }
          .info-val { font-size: 11px; font-weight: 500; color: var(--text-main); }

          .section-title {
            font-size: 13px;
            font-weight: 700;
            color: var(--primary);
            margin-bottom: 8px;
            text-transform: uppercase;
            border-bottom: 1px solid var(--border);
            padding-bottom: 4px;
          }

          table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
          th, td { padding: 6px 8px; border-bottom: 1px solid var(--border); text-align: left; }
          th {
            background: #f1f3f4;
            font-weight: 700;
            font-size: 10px;
            color: var(--text-muted);
            text-transform: uppercase;
          }
          tr:nth-child(even) { background-color: #fafafa; }
          td.numeric { text-align: right; }

          .signature-section {
            margin-top: 50px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 40px;
          }
          .signature-line {
            border-top: 1px solid #000;
            padding-top: 6px;
            text-align: center;
            font-size: 10px;
            color: var(--text-muted);
          }

          .declaration {
            margin-top: 16px;
            font-size: 9px;
            color: var(--text-muted);
            border: 1px solid var(--border);
            border-radius: 6px;
            padding: 10px;
            background: #fafafa;
          }

          .footer {
            margin-top: 30px;
            text-align: center;
            font-size: 9px;
            color: var(--text-muted);
            border-top: 1px solid var(--border);
            padding-top: 8px;
          }

          .print-btn-container { text-align: right; margin-bottom: 15px; }
          .btn-print {
            padding: 8px 16px; background: var(--primary); color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 500; font-family: 'Roboto'; font-size: 12px; display: inline-flex; align-items: center; gap: 6px;
            transition: opacity 0.2s;
          }
          .btn-print:hover { opacity: 0.9; }

          @media print {
            body { padding: 0; }
            .print-btn-container { display: none; }
            .info-panel { border-color: #000; background: transparent; }
            th { background: transparent; border-bottom: 1px solid #000; color: #000; }
            td { border-bottom: 1px solid #eee; }
          }
        </style>
      </head>
      <body>
        <div class="print-btn-container">
          <button class="btn-print" onclick="window.print()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
            Imprimir Ficha
          </button>
        </div>

        <div class="header-container">
          <div><img src="/assets/logo-full.png" class="logo" alt="Tableros" onerror="this.style.display='none'"></div>
          <div class="header-text">
            <h1>Ficha de Entrega de EPI</h1>
            ${sap_doc_num ? `<div class="doc-code">DOC SAP: ${sap_doc_num}</div>` : ''}
            <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">Impresso em: ${new Date().toLocaleString('pt-BR')}</div>
          </div>
        </div>

        <div class="info-panel">
          <div class="info-item">
            <span class="info-label">Código do Funcionário</span>
            <span class="info-val">${funcionario.codigo}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Nome do Funcionário</span>
            <span class="info-val">${funcionario.nome}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Data da Entrega</span>
            <span class="info-val">${new Date(data_entrega).toLocaleString('pt-BR')}</span>
          </div>
        </div>

        <div class="section-title">Itens Entregues</div>
        <table>
          <thead>
            <tr>
              <th style="width: 20%;">Código</th>
              <th style="width: 60%;">Descrição</th>
              <th style="text-align: right; width: 20%;">Quantidade</th>
            </tr>
          </thead>
          <tbody>
            ${itens.map(i => `
              <tr>
                <td style="font-family:monospace;">${i.item_code}</td>
                <td>${i.item_name}</td>
                <td class="numeric">${i.quantidade}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="declaration">
          Declaro que recebi gratuitamente o(s) EPI(s) acima relacionado(s), que fui orientado sobre seu uso correto e obrigatório,
          e que estou ciente das responsabilidades previstas na NR-6 quanto à guarda, conservação e devolução do(s) equipamento(s).
        </div>

        <div class="signature-section">
          <div class="signature-line">Assinatura do Funcionário</div>
          <div class="signature-line">Assinatura do Técnico Responsável</div>
        </div>

        <div class="footer">
          Gerado pelo Sistema PCP Tableros em ${new Date().toLocaleString('pt-BR')}
        </div>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();

  } catch (err) {
    console.error('Erro ao gerar ficha de entrega de EPI:', err);
    printWindow.close();
    alert('Erro ao gerar ficha: ' + err.message);
  }
}
