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
  /**
   * Presale end as a timestamp. Accepts ISO datetimes or "YYYY-MM-DD" (valid until the end of
   * that local day). Returns NaN when missing or invalid.
   */
  const presaleEnd = (ticket) => {
    const raw = ticket && ticket.presaleEndsAt;
    if (!raw) return NaN;
    const text = String(raw);
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      const [y, m, d] = text.split('-').map(Number);
      return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
    }
    return Date.parse(text);
  };
  const hasPresale = (ticket) =>
    !!ticket &&
    ticket.presalePrice != null &&
    ticket.presalePrice !== '' &&
    Number.isFinite(Number(ticket.presalePrice)) &&
    Number.isFinite(presaleEnd(ticket));
  /**
   * Effective price of a ticket type at `now` (ms or Date). The optional presale price applies
   * until `presaleEndsAt`; after that the regular `price` is used.
   */
  const ticketPrice = (ticket, now) => {
    const regular = Number((ticket && ticket.price) || 0);
    const at = now == null ? Date.now() : +now;
    const presale = hasPresale(ticket) && at <= presaleEnd(ticket);
    return {
      price: presale ? Number(ticket.presalePrice) : regular,
      regularPrice: regular,
      presale,
      presalePrice: hasPresale(ticket) ? Number(ticket.presalePrice) : null,
      presaleEndsAt: hasPresale(ticket) ? ticket.presaleEndsAt : null,
    };
  };
  const formatDate = (value, locale = 'es-MX', withTime = true) => {
    const time = typeof value === 'number' ? value : presaleEnd({ presaleEndsAt: value });
    if (!Number.isFinite(time)) return '';
    const opts = withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' };
    return new Intl.DateTimeFormat(locale, opts).format(time);
  };
  root.DreamEventUtils = {
    presaleEnd,
    hasPresale,
    ticketPrice,
    formatDate,
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
