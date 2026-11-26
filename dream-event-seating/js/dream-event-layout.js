/** Deterministic row/seat geometry. Seats are relative to rows, rows to sections. */
(function (root) {
  'use strict';
  const CIRCULAR = ['ring', 'table'];
  /** Default radius of the first circle of seats for ring/table sections. */
  function innerRadius(section) {
    const r = Number(section.innerRadius);
    if (Number.isFinite(r) && r > 0) return r;
    return section.shape === 'table' ? 44 : 150;
  }
  /**
   * Ring (stadium tier) and round table: every row is a full circle around the section origin,
   * starting at the top and going clockwise; seats are rotated to follow the circle.
   */
  function distributeCircle(row, section) {
    const seats = row.seats || [];
    const rows = section.rows || [];
    const rowIndex = Math.max(0, rows.indexOf(row));
    const radius = innerRadius(section) + rowIndex * (Number(section.rowSpacing) || 34);
    const count = Math.max(1, seats.length);
    return seats.map((seat, i) => {
      if (seat.manualPosition) return seat;
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / count;
      return Object.assign({}, seat, {
        x: radius * Math.cos(angle) - (Number(row.x) || 0),
        y: radius * Math.sin(angle) - (Number(row.y) || 0),
        rotation: Math.round(((angle * 180) / Math.PI + 90) * 10) / 10,
      });
    });
  }
  function distribute(row, section) {
    if (CIRCULAR.includes(section.shape)) return distributeCircle(row, section);
    const seats = row.seats || [],
      spacing = Number(section.seatSpacing) || 32;
    const count = seats.length,
      span = Math.max(0, (count - 1) * spacing),
      alignment = row.alignment || section.alignment || 'center';
    return seats.map((seat, i) => {
      if (seat.manualPosition) return seat;
      let x = i * spacing - span / 2;
      let y = 0;
      if (alignment === 'left') x = i * spacing;
      if (alignment === 'right') x = i * spacing - span;
      if (section.shape === 'semicircle' && count > 1) {
        // Concentric arcs around a point above the section, so rows wrap toward the stage.
        const rows = section.rows || [];
        const rowIndex = Math.max(0, rows.indexOf(row));
        const rowSpacing = Number(section.rowSpacing) || 40;
        const firstCount = Math.max(2, ((rows[0] && rows[0].seats) || seats).length);
        const baseRadius = Math.max(120, ((firstCount - 1) * spacing) / 1.7);
        const radius = baseRadius + rowIndex * rowSpacing;
        const step = Math.min(spacing / radius, (Math.PI * 0.9) / (count - 1));
        const angle = (i - (count - 1) / 2) * step;
        x = radius * Math.sin(angle);
        y = -radius * (1 - Math.cos(angle));
      } else {
        const curve = Number(row.curvature) || 0;
        y = curve * Math.pow((i - (count - 1) / 2) / Math.max(1, count / 2), 2);
      }
      return Object.assign({}, seat, { x, y });
    });
  }
  function sync(data) {
    (data.sections || []).forEach((s) =>
      (s.rows || []).forEach((r) => {
        r.seats = distribute(r, s);
        r.seatCount = r.seats.length;
      }),
    );
    return data;
  }
  root.DreamEventLayout = { distribute, sync, innerRadius, CIRCULAR };
})(window);
