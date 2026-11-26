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
  'dream-event-templates.js',
  'dream-event-seat-selector-mobile.js',
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
test('new maps allow no stage and stages default to purple', () => {
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
test('semicircle rows are concentric arcs that do not cross', () => {
  const sec = S.normalize({
    sections: [
      {
        id: 'arc',
        shape: 'semicircle',
        seatSpacing: 34,
        rowSpacing: 34,
        rows: [10, 12, 14].map((n, i) => ({
          id: 'r' + i,
          y: i * 34,
          seats: Array.from({ length: n }, (_, j) => ({ id: `a${i}_${j}`, number: j + 1 })),
        })),
      },
    ],
  }).sections[0];
  const centers = sec.rows.map((row) => {
    const seats = L.distribute(row, sec);
    const mid = seats[Math.floor(seats.length / 2)];
    assert(seats[0].y < mid.y, 'row ends curve toward the stage');
    return mid.y + row.y;
  });
  assert(centers[0] < centers[1] && centers[1] < centers[2]);
});
test('presale price applies until its end date, then the regular price', () => {
  const ticket = { id: 'vip', price: 150, presalePrice: 120, presaleEndsAt: '2027-01-31T23:59:00Z' };
  assert.equal(U.ticketPrice(ticket, Date.parse('2027-01-15T00:00:00Z')).price, 120);
  assert.equal(U.ticketPrice(ticket, Date.parse('2027-02-01T00:00:00Z')).price, 150);
  assert.equal(U.ticketPrice({ price: 150 }, Date.now()).presale, false);
  const dayOnly = { price: 10, presalePrice: 5, presaleEndsAt: '2027-01-31' };
  assert.equal(U.ticketPrice(dayOnly, new Date(2027, 0, 31, 22, 0).getTime()).price, 5);
});
test('selector totals use presale prices and report savings', () => {
  const map = S.normalize(data);
  map.ticketTypes[0].presalePrice = 1200;
  map.ticketTypes[0].presaleEndsAt = '2030-01-01T00:00:00Z';
  const x = Object.create(Selector.prototype);
  x.data = map;
  x.options = { currency: 'MXN', now: Date.parse('2029-06-01T00:00:00Z') };
  x.selection = new Set(['s1', 's2']);
  x.generalAdmission = { ga: 1 };
  let value = x.getSelection();
  assert.equal(value.total, 2900);
  assert.equal(value.savings, 600);
  assert.equal(value.seats[0].pricing, 'presale');
  x.options.now = Date.parse('2030-02-01T00:00:00Z');
  value = x.getSelection();
  assert.equal(value.total, 3500);
  assert.equal(value.savings, 0);
});
test('validation rejects presale above the regular price or without an end date', () => {
  const map = S.normalize(data);
  map.ticketTypes[0].presalePrice = 2000;
  map.ticketTypes[1].presalePrice = 100;
  const errors = S.validate(map).map((e) => e.message);
  assert(errors.includes('La preventa no puede costar más que el precio normal'));
  assert(errors.includes('Fecha de fin de preventa inválida'));
});
test('every template builds a valid, priced map with unique seat ids', () => {
  const T = context.DreamEventTemplates;
  assert(T.list().length >= 12);
  T.list().forEach(({ id }) => {
    const map = S.normalize(T.get(id));
    assert.deepEqual(S.validate(map), [], id);
    assert(map.ticketTypes.every((t) => t.price > 0), id + ' prices');
    const seats = U.eachSeat(map);
    assert(seats.length > 0, id + ' seats');
    assert.equal(new Set(seats.map((x) => x.seat.id)).size, seats.length, id + ' ids');
    assert(T.preview(map).startsWith('<svg'), id + ' preview');
  });
});
test('ring sections place every row on a full circle around the section origin', () => {
  const map = S.normalize(context.DreamEventTemplates.get('stadium-4'));
  const ring = map.sections[0];
  ring.rows.forEach((row, r) => {
    const expected = ring.innerRadius + r * ring.rowSpacing;
    L.distribute(row, ring).forEach((seat) => {
      const d = Math.hypot(seat.x + row.x, seat.y + row.y);
      assert(Math.abs(d - expected) < 0.01);
    });
  });
});
test('purchase picker detects phones as mobile and PCs / iPads as desktop', () => {
  const detect = context.DreamEventSeatPicker.detectMode;
  const win = (ua, w, h, coarse) => ({
    navigator: { userAgent: ua },
    innerWidth: w,
    innerHeight: h,
    matchMedia: (q) => ({ matches: coarse && q.includes('coarse') }),
  });
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 Safari/604.1';
  const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/131.0 Mobile Safari/537.36';
  const ipad = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/17.0 Safari/605.1.15';
  const pc = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0 Safari/537.36';
  assert.equal(detect(win(iphone, 390, 844, true)), 'mobile');
  assert.equal(detect(win(iphone, 844, 390, true)), 'mobile');
  assert.equal(detect(win(android, 412, 915, true)), 'mobile');
  assert.equal(detect(win(ipad, 820, 1180, true)), 'desktop');
  assert.equal(detect(win(pc, 1440, 900, false)), 'desktop');
  assert.equal(detect(win(pc, 500, 900, false)), 'mobile');
});
test('mobile selector shares the desktop pricing and selection logic', () => {
  const M = context.DreamEventSeatSelectorMobile;
  assert(Object.getPrototypeOf(M.prototype) === Selector.prototype);
  const x = Object.create(M.prototype);
  x.data = S.normalize(data);
  x.options = { currency: 'MXN' };
  x.selection = new Set(['s1']);
  x.generalAdmission = {};
  assert.equal(x.getSelection().total, 1500);
});
test('large map example contains 1,000 seats', () => {
  const large = JSON.parse(fs.readFileSync(path.join(__dirname, '../examples/large-venue.json')));
  assert.equal(
    large.sections.reduce((n, s) => n + s.rows.reduce((m, r) => m + r.seats.length, 0), 0),
    1000,
  );
});
console.log(`\n${checks} pruebas pasaron.`);
