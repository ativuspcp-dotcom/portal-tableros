import { supabase } from '../config/supabase.js';

export async function printRomaneioReport(ocId) {
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

    // Build Report HTML
    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Romaneio - ${oc.codigo_oc || 'Sem Código'}</title>
        <style>
          body { font-family: 'Arial', sans-serif; padding: 20px; font-size: 12px; color: #333; }
          .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #ccc; padding-bottom: 10px; }
          .header h1 { margin: 0 0 5px 0; font-size: 20px; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
          .info-item { background: #f9f9f9; padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
          .info-item strong { display: block; font-size: 10px; color: #666; text-transform: uppercase; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th, td { padding: 8px; border: 1px solid #ccc; text-align: left; }
          th { background: #f0f0f0; font-weight: bold; font-size: 11px; }
          .item-row { background: #e8f4f8; font-weight: bold; }
          .footer { margin-top: 40px; text-align: center; font-size: 10px; color: #777; border-top: 1px solid #ccc; padding-top: 10px; }
          @media print {
            body { padding: 0; }
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <div style="text-align: right; margin-bottom: 10px;">
          <button onclick="window.print()" style="padding: 8px 16px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Imprimir Relatório</button>
        </div>

        <div class="header">
          <h1>Relatório de Romaneio</h1>
          <div>Ordem de Carregamento: <strong>${oc.codigo_oc || oc.id.substring(0,8)}</strong></div>
          <div>Status: ${oc.status || 'Ativa'}</div>
        </div>

        <div class="info-grid">
          <div class="info-item"><strong>Transportadora</strong>${oc.transportadora || '-'}</div>
          <div class="info-item"><strong>Placa do Veículo</strong>${oc.placa || '-'}</div>
          <div class="info-item"><strong>Tipo</strong>${oc.tipo === 'transferencia_interna' ? 'Transferência Interna' : 'Remessa para Armazém'}</div>
          <div class="info-item"><strong>Previsão de Carga</strong>${oc.previsao_carga ? new Date(oc.previsao_carga).toLocaleString('pt-BR') : '-'}</div>
          ${oc.tipo === 'transferencia_interna' ? `
            <div class="info-item"><strong>Local Partida</strong>${oc.local_partida || '-'}</div>
            <div class="info-item"><strong>Local Destino</strong>${oc.local_destino || '-'}</div>
          ` : `
            <div class="info-item"><strong>Motorista</strong>${oc.motorista || '-'}</div>
          `}
        </div>

        <h3>Pacotes Bipados por Item</h3>
    `;

    if (!scannedPkgs || scannedPkgs.length === 0) {
      html += `<div style="text-align: center; padding: 20px; background: #fff3e0; color: #e65100; border: 1px solid #ffe0b2; border-radius: 4px;">Nenhum pacote foi bipado nesta ordem ainda.</div>`;
    } else {
      html += `
        <table>
          <thead>
            <tr>
              <th>QR Code / Lote</th>
              <th style="text-align: right;">Qtd / Volume</th>
              <th style="text-align: right;">Peso (kg)</th>
              <th style="text-align: center;">Data Bipe</th>
            </tr>
          </thead>
          <tbody>
      `;

      let totalVolumeGeral = 0;
      let totalPesoGeral = 0;

      // Group packages by item
      for (const item of ocItems) {
        const pkgsForThisItem = scannedPkgs.filter(p => p.ordem_item_id === item.id);
        
        if (pkgsForThisItem.length > 0) {
          const expectedVol = Number(item.quantidade_programada) || 0;
          const actualVol = pkgsForThisItem.reduce((sum, p) => sum + (Number(p.quantidade) || 0), 0);
          const actualPeso = pkgsForThisItem.reduce((sum, p) => sum + (Number(p.peso) || 0), 0);

          totalVolumeGeral += actualVol;
          totalPesoGeral += actualPeso;

          html += `
            <tr class="item-row">
              <td colspan="4">
                <div style="font-size: 13px;">${item.item_code} - ${item.item_name}</div>
                <div style="font-size: 10px; color: #555; font-weight: normal; margin-top: 2px;">
                  Previsto: ${expectedVol.toFixed(4)} | Bipado: ${actualVol.toFixed(4)} | Total Pacotes: ${pkgsForThisItem.length}
                </div>
              </td>
            </tr>
          `;

          pkgsForThisItem.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).forEach(pkg => {
            html += `
              <tr>
                <td style="font-family: monospace;">${pkg.qrcode}</td>
                <td style="text-align: right;">${Number(pkg.quantidade).toFixed(4)}</td>
                <td style="text-align: right;">${Number(pkg.peso).toFixed(2)}</td>
                <td style="text-align: center; font-size: 10px;">${new Date(pkg.created_at).toLocaleString('pt-BR')}</td>
              </tr>
            `;
          });
        }
      }

      html += `
          </tbody>
          <tfoot>
            <tr style="background: #f0f0f0; font-weight: bold;">
              <td style="text-align: right;">TOTAL GERAL:</td>
              <td style="text-align: right;">${totalVolumeGeral.toFixed(4)}</td>
              <td style="text-align: right;">${totalPesoGeral.toFixed(2)} kg</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      `;
    }

    html += `
        <div class="footer">
          Gerado pelo Portal Tableros em ${new Date().toLocaleString('pt-BR')}
        </div>
      </body>
      </html>
    `;

    // Open in a new popup window and print
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (printWindow) {
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      
      // Auto trigger print when loaded
      printWindow.onload = () => {
        // give it a tiny bit of time to render styles
        setTimeout(() => {
          printWindow.print();
        }, 300);
      };
    } else {
      alert('Por favor, permita pop-ups para abrir o relatório.');
    }

  } catch (err) {
    console.error('Erro ao gerar relatório de romaneio:', err);
    alert('Erro ao gerar relatório: ' + err.message);
  }
}
