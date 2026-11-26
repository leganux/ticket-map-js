/** Shared, dependency-free helpers for Dream Event seating components. */
(function (root) {
  'use strict';
  const clone = (value) => (value == null ? value : JSON.parse(JSON.stringify(value)));
  const id = (prefix) =>
    `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36)}`;
  const text = (value) =>
    String(value == null ? '' : value)
      .replace(/[<>\u0000-\u001f]/g, '')
      .trim();
  const money = (amount, currency = 'MXN', locale = 'es-MX') =>
    new Intl.NumberFormat(locale, { style: 'currency', currency }).format(
      (Number(amount) || 0) / 100,
    );
  const toMinor = (amount) => Math.round((Number(amount) || 0) * 100);
  const escape = (value) =>
    String(value == null ? '' : value).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  const emit = (callbacks, name, payload) => {
    if (callbacks && typeof callbacks[name] === 'function') callbacks[name](clone(payload));
  };
  const eachSeat = (data) =>
    (data.sections || []).flatMap((section) =>
      (section.rows || []).flatMap((row) =>
        (row.seats || []).map((seat) => ({ section, row, seat })),
      ),
    );
  const findSeat = (data, seatId) => eachSeat(data).find((x) => x.seat.id === seatId);
  const alphaLabel = (n) => {
    let out = '';
    for (n++; n > 0; n = Math.floor((n - 1) / 26))
      out = String.fromCharCode(65 + ((n - 1) % 26)) + out;
    return out;
  };
  root.DreamEventUtils = {
    clone,
    id,
    text,
    money,
    toMinor,
    escape,
    emit,
    eachSeat,
    findSeat,
    alphaLabel,
  };
})(window);
