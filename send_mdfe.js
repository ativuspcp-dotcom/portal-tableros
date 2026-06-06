import fetch from 'node-fetch';

const url = 'https://api.brasilnfe.com.br/services/fiscal/EnviarManifestoTransporte';
const token = 'bGtDRU5TMVdBamMzV1JwcGdIZ2dFcmRnem5OanZrK3ZFaUpLTVY1eDdsMD06K1ZPUllpSVVBMEtaR3ZWam9xczNmUT09OjI1LzA1LzIwMzY=';

const payload = {
  tipoAmbiente: 1,
  tipoEmitente: 2,
  ufCarregamento: "PR",
  ufDescarregamento: "PR",
  modalidade: 1,
  valor: 133472.94,
  peso: 3756000.00,
  Rodoviario: {
    tipoRodado: 3,
    tipoCarroceria: 0,
    placa: "SDS1H72",
    renavan: "01315721900",
    tara: 23000,
    capKG: 0,
    capM3: 0,
    uf: "PR",
    condutores: [{ nome: "Antonio Selmo Guedes", cpf: "02135119911" }],
    reboques: [
      { placa: "BEQ5G41", renavan: "01246763416", tara: 17000, capKG: 0, capM3: 0, tipoCarroceria: 1, uf: "PR" },
      { placa: "BEQ5D03", renavan: "01246762673", tara: 17000, capKG: 0, capM3: 0, tipoCarroceria: 1, uf: "PR" }
    ]
  },
  carregamentos: [
    { codMunicipio: 4118204, municipio: "Origem" }
  ],
  descarregamentos: [
    { codMunicipio: 4118204, municipio: "Destino", chaveDfe: "41260609402999000170550010000362041941406518" },
    { codMunicipio: 4118204, municipio: "Destino", chaveDfe: "41260609402999000170550010000362051404889118" }
  ],
  produtoPredominante: {
    tpCarga: 5,
    descricao: "Madeira",
    cEan: "SEM GTIN",
    ncm: "44123900"
  }
};

async function send() {
  console.log('Sending JSON payload to BrasilNFe...');
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Token': token
    },
    body: JSON.stringify(payload)
  });
  
  const text = await res.text();
  console.log('Status:', res.status);
  console.log('Response:', text);
}

send();
