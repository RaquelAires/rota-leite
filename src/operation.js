const zone = 'America/Araguaina';
export const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const time = new Intl.DateTimeFormat('pt-BR', { timeZone: zone, hour: '2-digit', minute: '2-digit' });
const dateLabel = new Intl.DateTimeFormat('pt-BR', { timeZone: zone, day: 'numeric', month: 'long', year: 'numeric' });
export const liters = value => number.format(value) + ' L';
export const showDate = date => dateLabel.format(new Date(date + 'T12:00:00-03:00'));
export const showTime = value => time.format(new Date(value));
const dateTimeLabel = new Intl.DateTimeFormat('pt-BR', { timeZone: zone, dateStyle: 'short', timeStyle: 'short' });
export const showDateTime = value => dateTimeLabel.format(new Date(value));
export const statusText = { planned: 'Aguardando', collected: 'Coletado', incident: 'Com ocorrência' };

export function dateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const fields = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return [fields.year, fields.month, fields.day].join('-');
}

export function id() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function stopHistory(data, route, stop) {
  const events = data.events.filter(event => event.routeId === route.id && event.stopId === stop.id);
  return events.sort((a, b) => {
    const aNew = Boolean(a.savedAt || a.draft);
    const bNew = Boolean(b.savedAt || b.draft);
    if (aNew !== bNew) return aNew ? 1 : -1;
    if (aNew) return 0; // The API and the offline queue both provide insertion order.
    const aSeed = a.id.startsWith('registro-demo-');
    const bSeed = b.id.startsWith('registro-demo-');
    if (aSeed !== bSeed) return aSeed ? -1 : 1;
    return new Date(a.at) - new Date(b.at);
  });
}

export function stopEvent(data, route, stop) {
  return stopHistory(data, route, stop).at(-1) ?? null;
}

export function eventResult(event) {
  if (!event) return 'Sem registro';
  return event.status === 'collected' ? liters(event.liters) : 'Ocorrência: ' + event.reason;
}

export function routeStats(data, route) {
  return route.stops.reduce((stats, stop) => {
    const event = stopEvent(data, route, stop);
    stats.expected += stop.expected;
    if (event?.status === 'collected') {
      stats.collected++;
      stats.liters += event.liters;
    } else if (event?.status === 'incident') stats.incidents++;
    return stats;
  }, { expected: 0, liters: 0, collected: 0, incidents: 0 });
}

export function statusFor(stats, total, closedAt) {
  if (closedAt) return ['collected', 'Encerrada'];
  if (stats.incidents) return ['incident', stats.collected + stats.incidents === total ? 'Com ocorrências' : 'Em andamento'];
  if (stats.collected === total) return ['collected', 'Concluída'];
  if (stats.collected) return ['collected', 'Em andamento'];
  return ['planned', 'Planejada'];
}
