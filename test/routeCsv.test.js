import assert from 'node:assert/strict';
import { test } from 'node:test';
import { routeCsv } from '../src/routeCsv.js';

test('CSV mantém totais, decimais, ocorrências e campos com aspas', () => {
  const csv = routeCsv(
    { name: 'Rota Teste', date: '2026-11-21', closedAt: '2026-11-21T12:15:00Z' },
    { expected: 230, liters: 76.5 },
    [
      { stop: { expected: 80 }, event: { status: 'collected', liters: 76.5 }, producer: { name: 'Sítio "A"' } },
      { stop: { expected: 100 }, event: { status: 'incident', reason: 'Porteira; fechada', notes: '=1+1' } },
      { stop: { expected: 50 } }
    ]
  );
  assert.ok(csv.startsWith('\uFEFF"Rota";"Data da rota";'));
  assert.match(csv, /"Sítio ""A""";"";"Coletado";"80";"76,5"/);
  assert.match(csv, /"Com ocorrência";"100";"";"Porteira; fechada";"'=1\+1"/);
  assert.match(csv, /"Sem registro";"50";""/);
  assert.match(csv, /"TOTAL";"";"";"230";"76,5"/);
  assert.equal(csv.split('\r\n').length, 6);
});
