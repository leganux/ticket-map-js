/**
 * Ready-made venue maps for the Builder. Each template builds a fresh, valid map JSON
 * (schemaVersion 1.0.0) with ticket types and prices that can be edited afterwards.
 * Prices are in major currency units (MXN by default).
 */
(function (root) {
  'use strict';
  const alpha = (n) => {
    let out = '';
    for (n++; n > 0; n = Math.floor((n - 1) / 26)) out = String.fromCharCode(65 + ((n - 1) % 26)) + out;
    return out;
  };

  function ticket(id, name, price, color, extra) {
    return Object.assign(
      { id, name, description: '', price, currency: 'MXN', color, mode: 'reserved_seating', presalePrice: null, presaleEndsAt: null },
      extra,
    );
  }

  /**
   * Build a section.
   * @param {object} o id, name, ticket, color, x, y, counts[] and optional layout settings:
   *   rowLabel(i) -> label, seatNumber(rowIndex, seatIndex, count) -> number,
   *   seatLabel(rowLabel, number) -> label, rowStart (letter offset).
   */
  function section(o) {
    const rowSpacing = o.rowSpacing || 34;
    const rowLabel = o.rowLabel || ((i) => alpha((o.rowStart || 0) + i));
    const seatNumber = o.seatNumber || ((r, i) => i + 1);
    const seatLabel = o.seatLabel || ((label, n) => `${label}${n}`);
    return {
      id: o.id,
      name: o.name,
      description: o.description || '',
      ticketTypeId: o.ticket,
      color: o.color,
      shape: o.shape || 'rectangle',
      x: o.x,
      y: o.y,
      rotation: o.rotation || 0,
      scaleX: 1,
      scaleY: 1,
      seatSize: o.seatSize || 24,
      seatSpacing: o.seatSpacing || 34,
      rowSpacing,
      alignment: o.alignment || 'center',
      curvature: o.curvature || 0,
      ...(o.innerRadius ? { innerRadius: o.innerRadius } : {}),
      ...(o.showRowLabels === false ? { showRowLabels: false } : {}),
      visible: true,
      locked: false,
      rows: o.counts.map((count, r) => {
        const label = String(rowLabel(r));
        return {
          id: `${o.id}_r${r + 1}`,
          label,
          x: 0,
          y: r * rowSpacing,
          rotation: 0,
          seatCount: count,
          numberStart: 1,
          numberDirection: 'asc',
          alignment: o.alignment || 'center',
          curvature: o.curvature || 0,
          seats: Array.from({ length: count }, (_, i) => {
            const number = seatNumber(r, i, count);
            return {
              id: `${o.id}_${label}_${i + 1}`,
              number,
              label: seatLabel(label, number),
              x: 0,
              y: 0,
              rotation: 0,
              status: 'available',
              accessible: !!(o.accessible && o.accessible(r, i, count)),
              manualPosition: false,
              metadata: {},
            };
          }),
        };
      }),
    };
  }

  function stage(label, x, y, width, height, extra) {
    return Object.assign(
      { id: 'stage_main', label, shape: 'trapezoid', x, y, width, height, rotation: 0, color: '#2E2E3A', visible: true, locked: false },
      extra,
    );
  }

  function map(id, name, canvas, stageData, ticketTypes, sections, metadata) {
    return {
      schemaVersion: '1.0.0',
      eventId: id,
      name,
      currency: 'MXN',
      locale: 'es-MX',
      canvas: { width: canvas[0], height: canvas[1], backgroundColor: '#FFFFFF', gridSize: 20 },
      background: { src: null, x: 0, y: 0, width: canvas[0], height: canvas[1], opacity: 0.35, rotation: 0, visible: true, locked: true },
      stage: stageData,
      ticketTypes,
      sections,
      metadata: Object.assign({ template: id }, metadata),
    };
  }

  /* Seats-in-a-circle counts for a stadium ring of a given radius. */
  const ringCount = (radius, spacing) => Math.floor((2 * Math.PI * radius) / spacing);
  const edgeAccessible = (r, i, count) => r === 0 && (i === 0 || i === count - 1);

  const TEMPLATES = [
    {
      id: 'theater-2',
      name: 'Teatro · 2 secciones',
      icon: 'fa-solid fa-masks-theater',
      description: 'Platea curva al frente y balcón al fondo.',
      build: () =>
        map(
          'teatro_dos_secciones',
          'Teatro',
          [1400, 820],
          stage('ESCENARIO', 450, 50, 500, 90),
          [ticket('t_platea', 'Platea', 850, '#8B5CF6'), ticket('t_balcon', 'Balcón', 480, '#3B82F6')],
          [
            section({ id: 'platea', name: 'Platea', ticket: 't_platea', color: '#8B5CF6', x: 700, y: 230, counts: [14, 16, 16, 18, 18, 18, 20, 20], seatSpacing: 36, curvature: -12, accessible: edgeAccessible }),
            section({ id: 'balcon', name: 'Balcón', ticket: 't_balcon', color: '#3B82F6', x: 700, y: 580, counts: [22, 22, 24, 24, 26], seatSpacing: 36, curvature: -16, rowStart: 8 }),
          ],
        ),
    },
    {
      id: 'stadium-4',
      name: 'Estadio · 4 anillos',
      icon: 'fa-solid fa-futbol',
      description: 'Cancha al centro y cuatro anillos concéntricos con precio por anillo.',
      build: () => {
        const rings = [
          ['anillo1', 'Anillo 1 · Platino', 't_platino', '#7C3AED', 270],
          ['anillo2', 'Anillo 2 · Oro', 't_oro', '#D97706', 385],
          ['anillo3', 'Anillo 3 · Plata', 't_plata', '#0EA5E9', 500],
          ['anillo4', 'Anillo 4 · General', 't_general', '#10B981', 615],
        ];
        return map(
          'estadio_cuatro_anillos',
          'Estadio',
          [1500, 1500],
          stage('CANCHA', 530, 600, 440, 300, { shape: 'rectangle', color: '#15803D' }),
          [
            ticket('t_platino', 'Platino', 2500, '#7C3AED'),
            ticket('t_oro', 'Oro', 1600, '#D97706'),
            ticket('t_plata', 'Plata', 950, '#0EA5E9'),
            ticket('t_general', 'General', 450, '#10B981'),
          ],
          rings.map(([id, name, t, color, radius], k) =>
            section({
              id,
              name,
              ticket: t,
              color,
              shape: 'ring',
              innerRadius: radius,
              x: 750,
              y: 750,
              rowSpacing: 30,
              seatSize: 20,
              seatSpacing: 30,
              counts: [0, 1, 2].map((r) => ringCount(radius + r * 30, 34)),
              rowStart: k * 3,
            }),
          ),
        );
      },
    },
    {
      id: 'cinema',
      name: 'Cine · 1 bloque',
      icon: 'fa-solid fa-film',
      description: 'Una sola sala frente a la pantalla.',
      build: () =>
        map(
          'cine_sala',
          'Cine',
          [1200, 760],
          stage('PANTALLA', 250, 50, 700, 26, { shape: 'rectangle', color: '#0F172A' }),
          [ticket('t_sala', 'Sala', 95, '#E11D48')],
          [section({ id: 'sala', name: 'Sala', ticket: 't_sala', color: '#E11D48', x: 600, y: 200, counts: Array(12).fill(18), seatSpacing: 36, rowSpacing: 38, curvature: -8, accessible: edgeAccessible })],
        ),
    },
    {
      id: 'concert-aisles',
      name: 'Centro de conciertos · 2 pasillos',
      icon: 'fa-solid fa-music',
      description: 'Tres bloques separados por dos pasillos centrales.',
      build: () =>
        map(
          'centro_conciertos',
          'Centro de conciertos',
          [1600, 900],
          stage('ESCENARIO', 500, 50, 600, 100),
          [ticket('t_centro', 'Centro', 1450, '#7C3AED'), ticket('t_lateral', 'Lateral', 980, '#3B82F6')],
          [
            section({ id: 'lat_izq', name: 'Lateral izquierdo', ticket: 't_lateral', color: '#3B82F6', x: 553, y: 285, rotation: 5, counts: Array(14).fill(9), alignment: 'right' }),
            section({ id: 'centro', name: 'Centro', ticket: 't_centro', color: '#7C3AED', x: 800, y: 260, counts: Array(14).fill(12), seatNumber: (r, i) => 101 + i }),
            section({ id: 'lat_der', name: 'Lateral derecho', ticket: 't_lateral', color: '#3B82F6', x: 1047, y: 285, rotation: -5, counts: Array(14).fill(9), alignment: 'left', showRowLabels: false, seatNumber: (r, i) => 201 + i }),
          ],
        ),
    },
    {
      id: 'cafe-bar',
      name: 'Café / bar con mesas',
      icon: 'fa-solid fa-mug-hot',
      description: 'Mesas de 4 y de 6 más bancos en la barra.',
      build: () => {
        const tables = [];
        let n = 1;
        [260, 440].forEach((y, row) =>
          [260, 470, 680, 890].forEach((x) => {
            tables.push(section({ id: `mesa${n}`, name: `Mesa ${n}`, ticket: 't_mesa', color: '#B45309', shape: 'table', innerRadius: 46, x, y: y + 120, counts: [4], seatSize: 24, rowLabel: () => `M${n}`, seatLabel: (l, s) => `${l}-${s}` }));
            n++;
          }),
        );
        [360, 790].forEach((x) => {
          tables.push(section({ id: `mesa${n}`, name: `Mesa ${n}`, ticket: 't_mesa', color: '#B45309', shape: 'table', innerRadius: 58, x, y: 760, counts: [6], seatSize: 24, rowLabel: () => `M${n}`, seatLabel: (l, s) => `${l}-${s}` }));
          n++;
        });
        tables.unshift(section({ id: 'barra', name: 'Barra', ticket: 't_barra', color: '#0F766E', x: 575, y: 150, counts: [12], seatSpacing: 40, seatSize: 26, rowLabel: () => 'B' }));
        return map(
          'cafe_bar',
          'Café / bar',
          [1150, 900],
          stage('BARRA', 275, 50, 600, 56, { shape: 'rectangle', color: '#78350F' }),
          [ticket('t_mesa', 'Mesa', 350, '#B45309'), ticket('t_barra', 'Barra', 220, '#0F766E')],
          tables,
        );
      },
    },
    {
      id: 'grand-theater',
      name: 'Teatro grande · 1 + 2 + 4',
      icon: 'fa-solid fa-landmark',
      description: 'Orquesta al frente, dos plateas en medio y cuatro bloques de anfiteatro atrás.',
      build: () =>
        map(
          'teatro_grande',
          'Teatro grande',
          [1700, 1180],
          stage('ESCENARIO', 575, 50, 550, 100),
          [
            ticket('t_orquesta', 'Orquesta', 1800, '#7C3AED'),
            ticket('t_platea', 'Platea', 1200, '#3B82F6'),
            ticket('t_anfi', 'Anfiteatro', 650, '#10B981'),
          ],
          [
            section({ id: 'orquesta', name: 'Orquesta', ticket: 't_orquesta', color: '#7C3AED', x: 850, y: 240, counts: [16, 18, 18, 20, 20], curvature: -10, accessible: edgeAccessible }),
            section({ id: 'platea_izq', name: 'Platea izquierda', ticket: 't_platea', color: '#3B82F6', x: 540, y: 500, rotation: 6, counts: Array(7).fill(12), rowStart: 5 }),
            section({ id: 'platea_der', name: 'Platea derecha', ticket: 't_platea', color: '#3B82F6', x: 1160, y: 500, rotation: -6, counts: Array(7).fill(12), rowStart: 5, showRowLabels: false }),
            ...[
              [255, 10],
              [665, 0],
              [1035, 0],
              [1445, -10],
            ].map(([x, rotation], k) =>
              section({ id: `anfi_${k + 1}`, name: `Anfiteatro ${String.fromCharCode(65 + k)}`, ticket: 't_anfi', color: '#10B981', x, y: 830 + (rotation ? 20 : 0), rotation, counts: Array(6).fill(10), rowStart: 12, showRowLabels: k === 0 }),
            ),
          ],
        ),
    },
    {
      id: 'bus',
      name: 'Autobús',
      icon: 'fa-solid fa-bus',
      description: 'Distribución 2 + 2 con pasillo, 12 filas.',
      build: () => {
        const rows = (i) => String(i + 1);
        return map(
          'autobus',
          'Autobús',
          [640, 1000],
          stage('CONDUCTOR', 110, 40, 170, 64, { shape: 'rectangle', color: '#334155' }),
          [ticket('t_premium', 'Premium', 780, '#7C3AED'), ticket('t_ejecutivo', 'Ejecutivo', 650, '#3B82F6')],
          [
            section({ id: 'prem_izq', name: 'Premium izquierda', ticket: 't_premium', color: '#7C3AED', x: 210, y: 170, counts: [2, 2], seatSpacing: 44, rowSpacing: 52, seatSize: 30, rowLabel: rows, seatNumber: (r, i) => 'AB'[i], seatLabel: (l, s) => l + s }),
            section({ id: 'prem_der', name: 'Premium derecha', ticket: 't_premium', color: '#7C3AED', x: 430, y: 170, counts: [2, 2], seatSpacing: 44, rowSpacing: 52, seatSize: 30, rowLabel: rows, seatNumber: (r, i) => 'CD'[i], seatLabel: (l, s) => l + s, showRowLabels: false }),
            section({ id: 'eje_izq', name: 'Ejecutivo izquierda', ticket: 't_ejecutivo', color: '#3B82F6', x: 210, y: 320, counts: Array(10).fill(2), seatSpacing: 44, rowSpacing: 52, seatSize: 30, rowLabel: (i) => String(i + 3), seatNumber: (r, i) => 'AB'[i], seatLabel: (l, s) => l + s }),
            section({ id: 'eje_der', name: 'Ejecutivo derecha', ticket: 't_ejecutivo', color: '#3B82F6', x: 430, y: 320, counts: Array(10).fill(2), seatSpacing: 44, rowSpacing: 52, seatSize: 30, rowLabel: (i) => String(i + 3), seatNumber: (r, i) => 'CD'[i], seatLabel: (l, s) => l + s, showRowLabels: false }),
          ],
        );
      },
    },
    {
      id: 'classroom',
      name: 'Salón de clases',
      icon: 'fa-solid fa-chalkboard-user',
      description: 'Pupitres en dos columnas frente al pizarrón.',
      build: () =>
        map(
          'salon_clases',
          'Salón de clases',
          [1000, 760],
          stage('PIZARRÓN', 250, 40, 500, 44, { shape: 'rectangle', color: '#14532D' }),
          [ticket('t_lugar', 'Lugar', 450, '#0EA5E9')],
          [
            section({ id: 'col_izq', name: 'Columna izquierda', ticket: 't_lugar', color: '#0EA5E9', x: 330, y: 200, counts: Array(6).fill(3), seatSpacing: 78, rowSpacing: 80, seatSize: 40 }),
            section({ id: 'col_der', name: 'Columna derecha', ticket: 't_lugar', color: '#0EA5E9', x: 670, y: 200, counts: Array(6).fill(3), seatSpacing: 78, rowSpacing: 80, seatSize: 40, showRowLabels: false, seatNumber: (r, i) => i + 4 }),
          ],
        ),
    },
    {
      id: 'airplane',
      name: 'Avión',
      icon: 'fa-solid fa-plane',
      description: 'Business 2 + 2 al frente y clase económica 3 + 3.',
      build: () => {
        const plane = (o) =>
          section(Object.assign({ seatLabel: (l, s) => l + s }, o));
        return map(
          'avion',
          'Vuelo',
          [720, 1650],
          stage('CABINA', 210, 30, 300, 90, { shape: 'semicircle', color: '#334155', rotation: 180, x: 510, y: 120 }),
          [ticket('t_business', 'Business', 8900, '#7C3AED'), ticket('t_economy', 'Económica', 2350, '#3B82F6')],
          [
            plane({ id: 'bus_izq', name: 'Business izquierda', ticket: 't_business', color: '#7C3AED', x: 250, y: 200, counts: [2, 2, 2, 2], seatSpacing: 52, rowSpacing: 62, seatSize: 36, rowLabel: (i) => String(i + 1), seatNumber: (r, i) => 'AC'[i] }),
            plane({ id: 'bus_der', name: 'Business derecha', ticket: 't_business', color: '#7C3AED', x: 470, y: 200, counts: [2, 2, 2, 2], seatSpacing: 52, rowSpacing: 62, seatSize: 36, rowLabel: (i) => String(i + 1), seatNumber: (r, i) => 'DF'[i], showRowLabels: false }),
            plane({ id: 'eco_izq', name: 'Económica izquierda', ticket: 't_economy', color: '#3B82F6', x: 240, y: 520, counts: Array(24).fill(3), seatSpacing: 38, rowSpacing: 42, seatSize: 26, rowLabel: (i) => String(i + 5), seatNumber: (r, i) => 'ABC'[i] }),
            plane({ id: 'eco_der', name: 'Económica derecha', ticket: 't_economy', color: '#3B82F6', x: 480, y: 520, counts: Array(24).fill(3), seatSpacing: 38, rowSpacing: 42, seatSize: 26, rowLabel: (i) => String(i + 5), seatNumber: (r, i) => 'DEF'[i], showRowLabels: false }),
          ],
        );
      },
    },
    {
      id: 'fan-auditorium',
      name: 'Auditorio en abanico',
      icon: 'fa-solid fa-microphone-lines',
      description: 'Filas preferentes y gradas en semicírculo para conferencias.',
      build: () =>
        map(
          'auditorio_abanico',
          'Auditorio',
          [1400, 860],
          stage('PODIO', 500, 40, 400, 80, { shape: 'semicircle', color: '#1E293B' }),
          [ticket('t_pref', 'Preferente', 650, '#DB2777'), ticket('t_conf', 'General', 400, '#7C3AED')],
          [
            section({ id: 'preferente', name: 'Preferente', ticket: 't_pref', color: '#DB2777', x: 700, y: 200, counts: [10, 10], accessible: edgeAccessible }),
            section({ id: 'gradas', name: 'Gradas', ticket: 't_conf', color: '#7C3AED', shape: 'semicircle', x: 700, y: 400, counts: [16, 18, 20, 22, 24, 26, 28], rowStart: 2 }),
          ],
        ),
    },
    {
      id: 'arena',
      name: 'Arena · ring central',
      icon: 'fa-solid fa-hand-fist',
      description: 'Ring al centro con ringside y gradas en los cuatro lados.',
      build: () => {
        const c = 650;
        const side = (id, name, t, color, dist, rotation, counts, rowStart) => {
          const rad = (rotation * Math.PI) / 180;
          // Local "down" (0, 1) rotated points away from the ring.
          return section({ id, name, ticket: t, color, rotation, counts, rowStart, x: Math.round(c - Math.sin(rad) * dist), y: Math.round(c + Math.cos(rad) * dist) });
        };
        const sides = [
          ['sur', 'Sur', 0],
          ['norte', 'Norte', 180],
          ['este', 'Este', -90],
          ['oeste', 'Oeste', 90],
        ];
        return map(
          'arena',
          'Arena',
          [1300, 1300],
          stage('RING', c - 110, c - 110, 220, 220, { shape: 'square', color: '#B91C1C' }),
          [ticket('t_ringside', 'Ringside', 3200, '#DC2626'), ticket('t_gradas', 'Gradas', 950, '#2563EB')],
          [
            ...sides.map(([id, name, rot]) => side(`ring_${id}`, `Ringside ${name}`, 't_ringside', '#DC2626', 200, rot, [6, 6], 0)),
            ...sides.map(([id, name, rot]) => side(`grada_${id}`, `Grada ${name}`, 't_gradas', '#2563EB', 330, rot, [10, 12, 14], 2)),
          ],
        );
      },
    },
    {
      id: 'banquet',
      name: 'Salón de banquetes',
      icon: 'fa-solid fa-champagne-glasses',
      description: 'Mesa de honor y 10 mesas redondas de 8 alrededor de la pista.',
      build: () => {
        const sections = [
          section({ id: 'honor', name: 'Mesa de honor', ticket: 't_honor', color: '#B45309', x: 700, y: 170, counts: [12], seatSpacing: 44, seatSize: 28, rowLabel: () => 'H' }),
        ];
        let n = 1;
        [430, 640].forEach((y) =>
          [220, 460, 700, 940, 1180].forEach((x) => {
            const label = `M${n}`;
            sections.push(section({ id: `mesa${n}`, name: `Mesa ${n}`, ticket: 't_cubierto', color: '#7C3AED', shape: 'table', innerRadius: 62, x, y: y + 40, counts: [8], seatSize: 24, rowLabel: () => label, seatLabel: (l, s) => `${l}-${s}` }));
            n++;
          }),
        );
        return map(
          'banquete',
          'Banquete',
          [1400, 820],
          stage('PISTA DE BAILE', 450, 40, 500, 70, { shape: 'rectangle', color: '#6D28D9' }),
          [ticket('t_honor', 'Mesa de honor', 1500, '#B45309'), ticket('t_cubierto', 'Cubierto', 1200, '#7C3AED')],
          sections,
        );
      },
    },
  ];

  function list() {
    return TEMPLATES.map(({ id, name, icon, description }) => ({ id, name, icon, description }));
  }
  /** A fresh copy of the template's map JSON, or null. */
  function get(id) {
    const t = TEMPLATES.find((x) => x.id === id);
    return t ? t.build() : null;
  }

  /** Small SVG thumbnail of a map (seat dots + stage), for galleries. */
  function preview(data, size = [240, 150]) {
    const L = root.DreamEventLayout;
    const ticketColor = new Map((data.ticketTypes || []).map((t) => [t.id, t.color]));
    const points = [];
    (data.sections || []).forEach((s) => {
      const rad = ((s.rotation || 0) * Math.PI) / 180,
        cos = Math.cos(rad),
        sin = Math.sin(rad);
      const color = s.color || ticketColor.get(s.ticketTypeId) || '#7C3AED';
      (s.rows || []).forEach((row) =>
        L.distribute(row, s).forEach((seat) => {
          const lx = (seat.x + (row.x || 0)) * (s.scaleX || 1),
            ly = (seat.y + (row.y || 0)) * (s.scaleY || 1);
          points.push([s.x + lx * cos - ly * sin, s.y + lx * sin + ly * cos, color]);
        }),
      );
    });
    const st = data.stage;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    const grow = (x, y) => {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    };
    points.forEach(([x, y]) => grow(x, y));
    let stageEl = '';
    if (st) {
      const corners = [
        [0, 0],
        [st.width, 0],
        [0, st.height],
        [st.width, st.height],
      ];
      const r = ((st.rotation || 0) * Math.PI) / 180;
      corners.forEach(([x, y]) => grow(st.x + x * Math.cos(r) - y * Math.sin(r), st.y + x * Math.sin(r) + y * Math.cos(r)));
      stageEl = `<rect x="${st.x}" y="${st.y}" width="${st.width}" height="${st.height}" rx="${Math.min(14, st.height / 3)}" fill="${st.color || '#334155'}" transform="rotate(${st.rotation || 0} ${st.x} ${st.y})"/>`;
    }
    if (!Number.isFinite(minX)) return '';
    const pad = 30;
    const w = maxX - minX + pad * 2,
      h = maxY - minY + pad * 2;
    const dot = Math.max(5, Math.min(12, Math.max(w, h) / 90));
    const dots = points.map(([x, y, c]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${dot}" fill="${c}"/>`).join('');
    return `<svg viewBox="${minX - pad} ${minY - pad} ${w} ${h}" width="${size[0]}" height="${size[1]}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${stageEl}${dots}</svg>`;
  }

  root.DreamEventTemplates = { list, get, preview, TEMPLATES };
})(window);
