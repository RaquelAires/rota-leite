export const demoProducers = [
  { id: 'prod-01', name: 'Sítio Boa Vista', locality: 'Estrada do Barreiro', expected: 240 },
  { id: 'prod-02', name: 'Fazenda Água Limpa', locality: 'Vicinal do Barreiro', expected: 320 },
  { id: 'prod-03', name: 'Chácara Ipê Amarelo', locality: 'Córrego do Meio', expected: 200 },
  { id: 'prod-04', name: 'Sítio Santa Luzia', locality: 'Estrada do Jatobá', expected: 180 },
  { id: 'prod-05', name: 'Fazenda São Bento', locality: 'Vicinal do Jatobá', expected: 310 }
].map(producer => ({ ...producer, demo: true, contact: '' }));

export const municipal = {
  id: 'colmeia-leite-2025',
  municipality: 'Colméia',
  state: 'Tocantins',
  year: 2025,
  liters: 18456000,
  previousLiters: 16699000,
  source: 'IBGE · Pesquisa da Pecuária Municipal',
  url: 'https://notop10.com.br/to/cidades-que-mais-produzem-leite',
  officialUrl: 'https://sidra.ibge.gov.br/tabela/74'
};

export function brazilDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Araguaina', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return [values.year, values.month, values.day].join('-');
}

export function demoRecords() {
  const date = brazilDate();
  const route = {
    id: 'rota-demo', name: 'Rota Barreiro', date,
    driver: 'Equipe de coleta', demo: true,
    stops: demoProducers.map((producer, index) => ({
      id: 'parada-' + (index + 1), producerId: producer.id, expected: producer.expected
    }))
  };
  const route2 = {
    id: 'rota-demo-2', name: 'Rota Jatobá', date,
    driver: 'Equipe de coleta', demo: true,
    stops: demoProducers.slice(3).map((producer, index) => ({
      id: 'jatoba-' + (index + 1), producerId: producer.id, expected: producer.expected
    }))
  };
  const events = [
    ['parada-1', '07:10', 'collected', 240, ''],
    ['parada-2', '07:45', 'collected', 310, ''],
    ['parada-3', '08:20', 'collected', 190, ''],
    ['parada-4', '08:55', 'incident', null, 'Acesso bloqueado']
  ].map(([stopId, time, status, liters, reason], index) => ({
    id: 'registro-demo-' + index, routeId: route.id, stopId, status,
    liters, reason, notes: '', at: date + 'T' + time + ':00-03:00', demo: true
  }));
  return [['municipal', municipal], ...demoProducers.map(item => ['producer', item]),
    ['route', route], ['route', route2], ...events.map(item => ['event', item])];
}
