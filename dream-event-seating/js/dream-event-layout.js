/** Deterministic row/seat geometry. Seats are relative to rows, rows to sections. */
(function (root) {
  'use strict';
  function distribute(row, section) {
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
        const rowIndex = Math.max(0, section.rows.indexOf(row));
        const radius = Math.max(90, (count * spacing) / Math.PI) + rowIndex * (Number(section.rowSpacing) || 40);
        const angleSpan = Math.min(Math.PI * 0.82, span / radius);
        const angle = -angleSpan / 2 + (i * angleSpan) / (count - 1);
        x = radius * Math.sin(angle);
        y = radius * (1 - Math.cos(angle));
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
  root.DreamEventLayout = { distribute, sync };
})(window);
