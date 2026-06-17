import { supabase } from '../config/supabase.js';

export async function printRomaneioReport(ocId) {
  // Open window synchronously to avoid popup blockers and ensure consistent tab/window behavior
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Por favor, permita pop-ups no navegador para visualizar o relatório.');
    return;
  }
  
  // Show a loading state while fetching data
  printWindow.document.write('<html><head><title>Carregando Relatório...</title><style>body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f8f9fa; color: #555; }</style></head><body><h2>Buscando dados no servidor...</h2></body></html>');
  printWindow.document.close();

  try {
    // 1. Fetch OC details
    const { data: oc, error: ocError } = await supabase
      .from('expedicao_ordens_carregamento')
      .select('*')
      .eq('id', ocId)
      .single();

    if (ocError) throw ocError;

    // 2. Fetch OC Items
    const { data: ocItems, error: itemsError } = await supabase
      .from('expedicao_ordens_carregamento_itens')
      .select('*')
      .eq('ordem_id', ocId);

    if (itemsError) throw itemsError;

    if (!ocItems || ocItems.length === 0) {
      alert('Nenhum item encontrado nesta ordem.');
      return;
    }

    const itemIds = ocItems.map(i => i.id);

    // 3. Fetch Scanned Packages (Romaneio Itens)
    const { data: scannedPkgs, error: pkgsError } = await supabase
      .from('expedicao_romaneio_itens')
      .select('*')
      .in('ordem_item_id', itemIds);

    if (pkgsError) throw pkgsError;

    const isTransfer = oc.tipo === 'transferencia_interna';
    const reportTitle = isTransfer ? 'Relatório de Transferência Interna' : 'Romaneio de Expedição';
    
    let destinoRemessa = '-';
    if (!isTransfer && ocItems && ocItems.length > 0) {
      const destinosUnicos = [...new Set(ocItems.filter(i => i.armazem).map(i => `${i.armazem} - ${i.cod_pn || ''}`))];
      if (destinosUnicos.length > 0) {
        destinoRemessa = destinosUnicos.join(' / ');
      }
    }

    const formatVol = (val) => Number(val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
    const formatPeso = (val) => Number(val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    let precalcVolume = 0;
    let precalcPeso = 0;
    let precalcPecas = 0;
    if (scannedPkgs && scannedPkgs.length > 0) {
      precalcVolume = scannedPkgs.reduce((sum, p) => sum + (Number(p.quantidade) || 0), 0);
      precalcPeso = scannedPkgs.reduce((sum, p) => sum + (Number(p.peso) || 0), 0);
      precalcPecas = scannedPkgs.reduce((sum, p) => sum + (Number(p.pecas) || 0), 0);
    }

    // Build Report HTML
    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Romaneio - ${oc.codigo_oc || 'Sem Código'}</title>
        <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
        <style>
          :root {
            --primary: #2b5c46; /* Tableros brand color */
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
          .header-text .oc-code { font-size: 14px; font-weight: bold; color: var(--text-main); }
          
          .info-panel {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
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
          th, td { padding: 4px 8px; border-bottom: 1px solid var(--border); text-align: left; }
          th { 
            background: #f1f3f4; 
            font-weight: 700; 
            font-size: 10px; 
            color: var(--text-muted);
            text-transform: uppercase;
          }
          tr:nth-child(even) { background-color: #fafafa; }
          
          .item-group-header {
            background: #e8f0fe !important;
            border-top: 2px solid #aecbfa;
          }
          .item-group-header td { padding: 6px 8px; }
          .item-name { font-size: 12px; font-weight: 700; color: #1967d2; }
          .item-meta { font-size: 9px; color: #5f6368; font-weight: 500; margin-top: 2px; }
          
          .pkg-row td { font-size: 10px; font-family: monospace; }
          .pkg-row td.numeric { text-align: right; font-family: 'Roboto', sans-serif; font-size: 10px; }
          .pkg-row td.center { text-align: center; font-family: 'Roboto', sans-serif; }

          .total-row td {
            font-size: 11px;
            font-weight: 700;
            background: #f1f3f4 !important;
            border-top: 2px solid var(--primary);
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
            .item-group-header { background: transparent !important; border-top: 1px solid #000; border-bottom: 1px dashed #ccc; }
            .total-row td { background: transparent !important; border-top: 1px solid #000; }
          }
        </style>
      </head>
      <body>
        <div class="print-btn-container">
          <button class="btn-print" onclick="window.print()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
            Imprimir Documento
          </button>
        </div>

        <div class="header-container">
          <div><img src="/assets/logo-full.png" class="logo" alt="Tableros" onerror="this.style.display='none'"></div>
          <div class="header-text">
            <h1>${reportTitle}</h1>
            <div class="oc-code">CÓD: ${oc.codigo_oc || oc.id.substring(0,8).toUpperCase()}</div>
            <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">Impresso em: ${new Date().toLocaleString('pt-BR')}</div>
          </div>
        </div>

        <div class="info-panel">
          <div class="info-item">
            <span class="info-label">Transportadora</span>
            <span class="info-val">${oc.transportadora || '-'}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Placa do Veículo</span>
            <span class="info-val">${oc.placa || '-'}</span>
          </div>
          ${isTransfer ? `
            <div class="info-item">
              <span class="info-label">Local de Partida</span>
              <span class="info-val">${oc.local_partida || '-'}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Local de Destino</span>
              <span class="info-val">${oc.local_destino || '-'}</span>
            </div>
          ` : `
            <div class="info-item">
              <span class="info-label">Destino Principal</span>
              <span class="info-val">${destinoRemessa}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Motorista</span>
              <span class="info-val">${oc.motorista || '-'}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Status da Ordem</span>
              <span class="info-val">${oc.status || '-'}</span>
            </div>
          `}
          
          ${oc.status === 'Finalizada' && scannedPkgs && scannedPkgs.length > 0 ? `
            <div class="info-item">
              <span class="info-label">Finalizado Em</span>
              <span class="info-val">${new Date(Math.max(...scannedPkgs.map(p => new Date(p.created_at)))).toLocaleString('pt-BR')}</span>
            </div>
          ` : `
            <div class="info-item">
              <span class="info-label">Previsão de Carga</span>
              <span class="info-val">${oc.previsao_carga ? new Date(oc.previsao_carga).toLocaleString('pt-BR') : '-'}</span>
            </div>
          `}
          <div class="info-item">
            <span class="info-label">Quantidade Total</span>
            <span class="info-val">${formatVol(precalcVolume)}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Peças Total</span>
            <span class="info-val">${precalcPecas}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Peso Total (kg)</span>
            <span class="info-val">${formatPeso(precalcPeso)}</span>
          </div>
        </div>

        <div class="section-title">Listagem de Pacotes Bipados</div>
    `;

    if (!scannedPkgs || scannedPkgs.length === 0) {
      html += `<div style="text-align: center; padding: 30px; background: #fff3e0; color: #e65100; border: 1px solid #ffe0b2; border-radius: 6px; font-weight: 500;">Nenhum pacote foi registrado no romaneio desta ordem.</div>`;
    } else {
      html += `
        <table>
          <thead>
            <tr>
              <th style="width: 35%;">Etiqueta / QR Code</th>
              <th style="text-align: right; width: 15%;">Volume / Qtd</th>
              <th style="text-align: right; width: 15%;">Peças</th>
              <th style="text-align: right; width: 15%;">Peso (kg)</th>
              <th style="text-align: center; width: 20%;">Registro (Bipe)</th>
            </tr>
          </thead>
          <tbody>
      `;

      let totalVolumeGeral = 0;
      let totalPesoGeral = 0;
      let totalPecasGeral = 0;
      let totalPacotesGeral = 0;

      // Group packages by item
      for (const item of ocItems) {
        const pkgsForThisItem = scannedPkgs.filter(p => p.ordem_item_id === item.id);
        
        if (pkgsForThisItem.length > 0) {
          const expectedVol = Number(item.quantidade_programada) || 0;
          const actualVol = pkgsForThisItem.reduce((sum, p) => sum + (Number(p.quantidade) || 0), 0);
          const actualPeso = pkgsForThisItem.reduce((sum, p) => sum + (Number(p.peso) || 0), 0);
          const actualPecas = pkgsForThisItem.reduce((sum, p) => sum + (Number(p.pecas) || 0), 0);

          totalVolumeGeral += actualVol;
          totalPesoGeral += actualPeso;
          totalPecasGeral += actualPecas;
          totalPacotesGeral += pkgsForThisItem.length;

          html += `
            <tr class="item-group-header">
              <td colspan="4">
                <div class="item-name">${item.item_code} &mdash; ${item.item_name || 'Sem Descrição'}</div>
                <div class="item-meta">
                  PROGRAMADO: ${formatVol(expectedVol)} &nbsp;|&nbsp; 
                  CARREGADO: ${formatVol(actualVol)} &nbsp;|&nbsp; 
                  TOTAL DE PEÇAS: ${actualPecas} &nbsp;|&nbsp;
                  TOTAL DE PACOTES: ${pkgsForThisItem.length} &nbsp;|&nbsp;
                  DESTINO: ${item.armazem ? item.armazem + ' - ' + (item.cod_pn || '') : '-'}
                </div>
              </td>
            </tr>
          `;

          pkgsForThisItem.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).forEach(pkg => {
            html += `
              <tr class="pkg-row">
                <td>${pkg.qrcode}</td>
                <td class="numeric">${formatVol(pkg.quantidade)}</td>
                <td class="numeric">${pkg.pecas || '-'}</td>
                <td class="numeric">${formatPeso(pkg.peso)}</td>
                <td class="center">${new Date(pkg.created_at).toLocaleString('pt-BR')}</td>
              </tr>
            `;
          });
        }
      }

      html += `
            <tr class="total-row">
              <td style="text-align: right; padding-right: 16px;">TOTAL GERAL (${totalPacotesGeral} PACOTES):</td>
              <td class="numeric">${formatVol(totalVolumeGeral)}</td>
              <td class="numeric">${totalPecasGeral}</td>
              <td class="numeric">${formatPeso(totalPesoGeral)}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      `;
    }

    html += `
        <div class="footer">
          Gerado pelo Sistema PCP Tableros em ${new Date().toLocaleString('pt-BR')} &mdash; ${oc.id}
        </div>
      </body>
      </html>
    `;

    // Overwrite the loading screen with the actual report
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();

  } catch (err) {
    console.error('Erro ao gerar relatório de romaneio:', err);
    printWindow.close();
    alert('Erro ao gerar relatório: ' + err.message);
  }
}
