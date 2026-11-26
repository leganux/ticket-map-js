/* Lightweight Node test runner for the browser globals and JSON-only logic. */
const fs = require('fs'),
  vm = require('vm'),
  path = require('path'),
  assert = require('assert');
const context = {
  console,
  Date,
  Math,
  JSON,
  Intl,
  Set,
  Map,
  Array,
  Object,
  String,
  Number,
  Error,
  Blob: function () {},
  URL: {},
  window: null,
};
context.window = context;
vm.createContext(context);
for (const file of [
  'dream-event-utils.js',
  'dream-event-schema.js',
  'dream-event-layout.js',
  'dream-event-seat-selector.js',
])
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', file), 'utf8'), context, {
    filename: file,
  });
const U = context.DreamEventUtils,
  S = context.DreamEventSchema,
  L = context.DreamEventLayout,
  Selector = context.DreamEventSeatSelector;
let checks = 0;
function test(name, fn) {
  fn();
  checks++;
  console.log('✓ ' + name);
}
const data = {
  eventId: 'test',
  currency: 'MXN',
  ticketTypes: [
    {
      id: 'vip',
      name: 'VIP',
      price: 1500,
      currency: 'MXN',
      color: '#8B5CF6',
      mode: 'reserved_seating',
      capacity: 5,
    },
    {
      id: 'ga',
      name: 'General',
      price: 500,
      currency: 'MXN',
      color: '#3B82F6',
      mode: 'general_admission',
    },
  ],
  sections: [
    {
      id: 'sec',
      name: 'Central',
      ticketTypeId: 'vip',
      x: 100,
      y: 200,
      seatSize: 24,
      seatSpacing: 30,
      rowSpacing: 40,
      alignment: 'center',
      rows: [
        {
          id: 'rowA',
          label: 'A',
          x: 0,
          y: 0,
          seats: [
            { id: 's1', number: 1, label: 'A1', x: 0, y: 0, status: 'available' },
            { id: 's2', number: 2, label: 'A2', x: 0, y: 0, status: 'available' },
          ],
        },
        {
          id: 'rowB',
          label: 'B',
          x: 0,
          y: 40,
          seats: [{ id: 's3', number: 1, label: 'B1', x: 0, y: 0, status: 'available' }],
        },
      ],
    },
  ],
};
test('JSON normalization preserves ids and provides default schema fields', () => {
  const n = S.normalize(data);
  assert.equal(n.sections[0].id, 'sec');
  assert.equal(n.sections[0].rows[0].seats[0].id, 's1');
  assert.equal(n.schemaVersion, '1.0.0');
});
test('new maps allow no stage and normalize stage colors to purple', () => {
  assert.equal(S.createEmpty().stage, null);
  const map = S.normalize({
    stage: { id: 'center-stage', x: 300, y: 300, width: 400, height: 80 },
  });
  assert.equal(map.stage.id, 'center-stage');
  assert.equal(map.stage.color, '#5B21B6');
});
test('layout centers variable length rows and keeps manual coordinates', () => {
  const s = S.normalize(data).sections[0];
  const a = L.distribute(s.rows[0], s);
  assert.equal(a.length, 2);
  assert.equal(a[0].x, -15);
  assert.equal(a[1].x, 15);
  s.rows[0].seats[0].manualPosition = true;
  s.rows[0].seats[0].x = 77;
  assert.equal(L.distribute(s.rows[0], s)[0].x, 77);
});
test('validation reports duplicate ids, missing ticket references and duplicate row numbers', () => {
  const bad = S.normalize(data);
  bad.sections[0].ticketTypeId = 'missing';
  bad.sections[0].rows[0].seats[1].number = 1;
  bad.sections[0].rows[1].seats[0].id = 's1';
  const errors = S.validate(bad);
  assert(errors.some((x) => x.message === 'ID duplicado'));
  assert(errors.some((x) => x.message === 'Tipo de boleto inexistente'));
  assert(errors.some((x) => x.message.includes('Número de asiento duplicado')));
});
test('JSON round trip preserves ids, coordinates and section properties', () => {
  const map = S.normalize(data);
  map.sections[0].x = 321;
  map.sections[0].rows[0].seats[0].x = -20;
  const again = S.normalize(JSON.parse(JSON.stringify(map)));
  assert.equal(again.sections[0].id, 'sec');
  assert.equal(again.sections[0].x, 321);
  assert.equal(again.sections[0].rows[0].seats[0].x, -20);
});
test('selector emits expected ticket counts and accurate minor-unit totals', () => {
  const x = Object.create(Selector.prototype);
  x.data = S.normalize(data);
  x.options = { currency: 'MXN' };
  x.selection = new Set(['s1', 's2']);
  x.generalAdmission = { ga: 1 };
  const value = x.getSelection();
  assert.equal(value.seatCount, 2);
  assert.equal(value.ticketCount, 3);
  assert.equal(value.total, 3500);
  assert.equal(U.toMinor(value.total), 350000);
});
test('large map example contains 1,000 seats', () => {
  const large = JSON.parse(fs.readFileSync(path.join(__dirname, '../examples/large-venue.json')));
  assert.equal(
    large.sections.reduce((n, s) => n + s.rows.reduce((m, r) => m + r.seats.length, 0), 0),
    1000,
  );
});
console.log(`\n${checks} pruebas pasaron.`);
