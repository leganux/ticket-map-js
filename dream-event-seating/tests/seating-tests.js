(function () {
  'use strict';
  const out = document.querySelector('#results'),
    pass = (name) => {
      const li = document.createElement('li');
      li.textContent = '✓ ' + name;
      li.className = 'text-success';
      out.appendChild(li);
    },
    assert = (v, m) => {
      if (!v) throw Error(m);
      pass(m);
    };
  const sample = {
    eventId: 'test',
    ticketTypes: [
      { id: 'vip', name: 'VIP', price: 1500, mode: 'reserved_seating' },
      { id: 'general', name: 'General', price: 500, mode: 'general_admission' },
    ],
    sections: [
      {
        id: 's',
        name: 'Central',
        ticketTypeId: 'vip',
        rows: [
          {
            id: 'r',
            label: 'A',
            seats: [
              { id: 'a1', number: 1, label: 'A1' },
              { id: 'a2', number: 2, label: 'A2' },
            ],
          },
        ],
      },
    ],
  };
  try {
    const n = DreamEventSchema.normalize(sample);
    assert(n.sections[0].rows[0].seatCount === 2, 'Normaliza y conserva el recuento de asientos');
    const errors = DreamEventSchema.validate(n);
    assert(errors.length === 0, 'Valida la configuración inicial');
    const map = JSON.parse(JSON.stringify(n));
    assert(
      DreamEventSchema.normalize(map).sections[0].id === 's',
      'Importa y exporta IDs estables',
    );
    const x = Object.create(DreamEventSeatSelector.prototype);
    x.data = n;
    x.options = { currency: 'MXN' };
    x.selection = new Set(['a1', 'a2']);
    x.generalAdmission = { general: 1 };
    assert(x.getSelection().total === 3500, 'Calcula correctamente el subtotal mixto');
  } catch (e) {
    const li = document.createElement('li');
    li.textContent = '✗ ' + e.message;
    li.className = 'text-danger';
    out.appendChild(li);
    throw e;
  }
})();
