import { showDateTime, statusText } from './operation.js';

const decimal = new Intl.NumberFormat('pt-BR', { useGrouping: false, maximumFractionDigits: 2 });

function cell(value) {
  let text = typeof value === 'number' ? decimal.format(value) : String(value ?? '');
  if (typeof value === 'string' && /^[\s\uFEFF]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

export function routeCsv(route, stats, stops) {
  const meta = [route.name, route.date, showDateTime(route.closedAt), route.driver || 'Equipe de coleta'];
  const rows = [
    ['Rota', 'Data da rota', 'Encerrada em (horário do Tocantins)', 'Responsável', 'Parada',
      'Propriedade', 'Localidade', 'Situação', 'Litros previstos', 'Litros coletados', 'Motivo', 'Observações'],
    ...stops.map(({ stop, event, producer }, index) => [
      ...meta, index + 1, producer?.name || 'Propriedade', producer?.locality || '',
      event ? statusText[event.status] : 'Sem registro', stop.expected, event?.liters ?? '',
      event?.reason || '', event?.notes || ''
    ]),
    [...meta, '', 'TOTAL', '', '', stats.expected, stats.liters, '', '']
  ];
  return '\uFEFF' + rows.map(row => row.map(cell).join(';')).join('\r\n') + '\r\n';
}
