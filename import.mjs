import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mqtyjzdwwgeycvmbiqsg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xdHlqemR3d2dleWN2bWJpcXNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MDkwODYsImV4cCI6MjA5NTM4NTA4Nn0.rNPwuckpVrQ26J_CFaH6pUPnD2iIUjyxjJZjE6zL6t0';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  const fileContent = fs.readFileSync('comp acabado.txt', 'utf-8');
  const lines = fileContent.split(/\r?\n/).filter(line => line.trim() !== '');
  
  // Skip header
  const dataLines = lines.slice(1);
  
  const records = dataLines.map(line => {
    const cols = line.split('\t');
    if (cols.length < 11) return null;
    
    // CÓDIGO	LARGURA	COMPRIMENTO	BITOLA	CLASSE	ESPECIFICAÇÃO	QUALIDADE	ITEM	PEÇA (M3)	PEÇA (PLT)	SITUAÇÃO
    // ACB0704	0,618	2,400	15	TABLEROS PLY	T&G2	 - BG	TABLEROS PLY 15MM T&G2 0,618 X 2,400 - BG	0,02224800	68,0000	ATIVO

    const parseNumber = (str) => {
      if (!str) return null;
      return parseFloat(str.replace(/\./g, '').replace(',', '.'));
    };
    
    const parseInteger = (str) => {
      if (!str) return null;
      return parseInt(str.split(',')[0], 10);
    };

    return {
      cod_sap: cols[0].trim(),
      largura: parseNumber(cols[1]),
      comprimento: parseNumber(cols[2]),
      espessura: parseNumber(cols[3]),
      classe: cols[4].trim(),
      especificacao: cols[5].trim(),
      qualidade: cols[6].trim(),
      nome_item: cols[7].trim(),
      volume_m3: parseNumber(cols[8]),
      pecas_por_fardo: parseInteger(cols[9]),
      situacao: cols[10].trim().toUpperCase() === 'ATIVO' ? 'ATIVO' : 'INATIVO'
    };
  }).filter(Boolean);

  console.log(`Parsed ${records.length} records. Uploading...`);
  
  // Insert in batches of 100
  const batchSize = 100;
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const { error } = await supabase.from('compensados_acabados').insert(batch);
    if (error) {
      console.error('Error inserting batch:', error);
      return;
    }
    console.log(`Inserted batch ${i / batchSize + 1}`);
  }
  
  console.log('Done!');
}

run();
