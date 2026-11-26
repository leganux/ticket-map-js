/** Versioned JSON schema and normalization/validation for both public components. */
(function (root) {
  'use strict';
  const U = root.DreamEventUtils;
  function createEmpty() {
    return {
      schemaVersion: '1.0.0',
      eventId: 'event_001',
      name: 'Nuevo evento',
      currency: 'MXN',
      locale: 'es-MX',
      canvas: { width: 1600, height: 1200, backgroundColor: '#F8FAFC', gridSize: 20 },
      background: {
        src: null,
        x: 0,
        y: 0,
        width: 1600,
        height: 1200,
        opacity: 0.35,
        rotation: 0,
        visible: true,
        locked: true,
      },
      stage: null,
      ticketTypes: [],
      sections: [],
      metadata: {},
    };
  }
  function normalize(input) {
    const data = Object.assign(createEmpty(), U.clone(input || {}));
    data.canvas = Object.assign(createEmpty().canvas, data.canvas || {});
    data.background = Object.assign(createEmpty().background, data.background || {});
    data.stage = data.stage
      ? Object.assign(
          {
            id: U.id('stage'),
            label: 'ESCENARIO',
            shape: 'rectangle',
            x: 550,
            y: 50,
            width: 500,
            height: 100,
            rotation: 0,
            color: '#5B21B6',
            visible: true,
            locked: false,
          },
          data.stage,
        )
      : null;
    if (data.stage) data.stage.color = '#5B21B6';
    data.ticketTypes = (data.ticketTypes || []).map((t) =>
      Object.assign(
        {
          id: U.id('ticket'),
          name: 'Boleto',
          description: '',
          price: 0,
          currency: data.currency,
          color: '#7C3AED',
          mode: 'reserved_seating',
        },
        t,
        { name: U.text(t.name), description: U.text(t.description) },
      ),
    );
    data.sections = (data.sections || []).map((s) => {
      const section = Object.assign(
        {
          id: U.id('section'),
          name: 'Sección',
          description: '',
          ticketTypeId: '',
          color: '#7C3AED',
          shape: 'rectangle',
          scaleX: 1,
          scaleY: 1,
          x: 100,
          y: 200,
          rotation: 0,
          seatSize: 24,
          seatSpacing: 32,
          rowSpacing: 40,
          alignment: 'center',
          curvature: 0,
          visible: true,
          locked: false,
          rows: [],
        },
        s,
      );
      section.rows = (s.rows || []).map((r, ri) => {
        const row = Object.assign(
          {
            id: U.id('row'),
            label: U.alphaLabel(ri),
            x: 0,
            y: ri * section.rowSpacing,
            rotation: 0,
            seatCount: 0,
            numberStart: 1,
            numberDirection: 'asc',
            alignment: section.alignment,
            curvature: 0,
            seats: [],
          },
          r,
        );
        row.seats = (r.seats || []).map((seat, si) => {
          const manual = Object.prototype.hasOwnProperty.call(seat, 'manualPosition')
            ? !!seat.manualPosition
            : (Number(seat.x) || 0) !== 0 || (Number(seat.y) || 0) !== 0;
          return Object.assign(
            {
              id: U.id('seat'),
              number: si + 1,
              label: `${row.label}${si + 1}`,
              x: 0,
              y: 0,
              rotation: 0,
              status: 'available',
              accessible: false,
              metadata: {},
            },
            seat,
            { manualPosition: manual },
          );
        });
        row.seatCount = row.seats.length;
        return row;
      });
      return section;
    });
    return data;
  }
  function validate(data) {
    const errors = [];
    const ids = new Set();
    const add = (path, message) => errors.push({ path, message });
    const claim = (value, path) => {
      if (!value) add(path, 'ID requerido');
      else if (ids.has(value)) add(path, 'ID duplicado');
      else ids.add(value);
    };
    if (
      data.stage &&
      (![
        data.stage.x,
        data.stage.y,
        data.stage.width,
        data.stage.height,
        data.stage.rotation,
      ].every(Number.isFinite) ||
        data.stage.width <= 0 ||
        data.stage.height <= 0)
    ) {
      add('stage', 'Posición o tamaño del escenario inválido');
    }
    (data.ticketTypes || []).forEach((t, i) => {
      claim(t.id, `ticketTypes[${i}].id`);
      if (!U.text(t.name)) add(`ticketTypes[${i}].name`, 'Nombre requerido');
      if (!Number.isFinite(+t.price) || +t.price < 0)
        add(`ticketTypes[${i}].price`, 'Precio inválido');
      if (!['reserved_seating', 'general_admission'].includes(t.mode))
        add(`ticketTypes[${i}].mode`, 'Modalidad inválida');
    });
    (data.sections || []).forEach((s, si) => {
      claim(s.id, `sections[${si}].id`);
      const ticket = data.ticketTypes.find((t) => t.id === s.ticketTypeId);
      if (!ticket) add(`sections[${si}].ticketTypeId`, 'Tipo de boleto inexistente');
      else if (ticket.mode !== 'reserved_seating')
        add(
          `sections[${si}].ticketTypeId`,
          'Las secciones requieren un boleto con asiento reservado',
        );
      if (![s.x, s.y, s.rotation, s.scaleX, s.scaleY].every(Number.isFinite) || s.scaleX <= 0 || s.scaleY <= 0)
        add(`sections[${si}]`, 'Coordenadas inválidas');
      (s.rows || []).forEach((r, ri) => {
        claim(r.id, `sections[${si}].rows[${ri}].id`);
        if (!(r.seats || []).length)
          add(`sections[${si}].rows[${ri}].seats`, 'La fila no tiene asientos');
        const nums = new Set();
        (r.seats || []).forEach((seat, ai) => {
          claim(seat.id, `sections[${si}].rows[${ri}].seats[${ai}].id`);
          if (nums.has(String(seat.number)))
            add(`sections[${si}].rows[${ri}]`, 'Número de asiento duplicado en la fila');
          nums.add(String(seat.number));
          if (![seat.x, seat.y].every(Number.isFinite))
            add(`sections[${si}].rows[${ri}].seats[${ai}]`, 'Coordenadas inválidas');
        });
      });
    });
    data.ticketTypes.forEach((t) => {
      if (t.capacity != null) {
        const used = data.sections
          .filter((s) => s.ticketTypeId === t.id)
          .reduce((n, s) => n + s.rows.reduce((m, r) => m + r.seats.length, 0), 0);
        if (used > Number(t.capacity))
          add(`ticketTypes.${t.id}.capacity`, `Capacidad excedida (${used}/${t.capacity})`);
      }
    });
    return errors;
  }
  root.DreamEventSchema = { createEmpty, normalize, validate };
})(window);
