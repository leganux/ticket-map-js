/**
 * Mobile seat picker (phones) + DreamEventSeatPicker, which picks the mobile or desktop
 * component automatically and swaps between them when the screen changes.
 *
 * DreamEventSeatSelectorMobile shares every rule of DreamEventSeatSelector (selection limits,
 * availability, presale pricing, local hold, simulated purchase, callbacks); only the UI differs:
 * full-height map with pinch zoom, ticket chips, and a bottom sheet with the cart and one CTA.
 */
(function (root) {
  'use strict';
  const U = root.DreamEventUtils;
  const Selector = root.DreamEventSeatSelector;
  if (!Selector) throw new Error('Carga dream-event-seat-selector.js antes del selector móvil');

  /* ------------------------------------------------------------ mobile UI */

  function MobileSelector(config) {
    this.sheetOpen = false;
    this.lastPurchase = null;
    Selector.call(this, config);
  }
  MobileSelector.prototype = Object.create(Selector.prototype);
  MobileSelector.prototype.constructor = MobileSelector;

  MobileSelector.prototype.render = function () {
    const d = this.data,
      meta = d.metadata || {};
    const sub = [meta.date || d.eventDate, meta.venue || d.venue].filter(Boolean).map(U.escape).join(' · ');
    const usedTickets = d.ticketTypes.filter(
      (t) => t.mode === 'reserved_seating' && d.sections.some((s) => s.ticketTypeId === t.id),
    );
    const chips = usedTickets
      .map((t) => {
        const p = this.priceOf(t);
        return `<button type="button" class="dem-chip" data-filter="${U.escape(t.id)}"><i style="background:${U.escape(t.color || '#7C3AED')}"></i>${U.escape(t.name)} <b>${this.money(p.price, t.currency)}</b>${p.presale ? '<em>Preventa</em>' : ''}</button>`;
      })
      .join('');
    const height = this.options.height || 'calc(100dvh - var(--dem-offset, 0px))';
    this.container.innerHTML = `
<div class="dem" style="--dem-height:${U.escape(height)}">
  <header class="dem-head">
    <div class="dem-title"><strong>${U.escape(d.name || 'Evento')}</strong>${sub ? `<small>${sub}</small>` : ''}</div>
    <button type="button" class="dem-icon" data-action="fit" aria-label="Ver todo el mapa"><i class="fa-solid fa-expand"></i></button>
  </header>
  ${this.presaleStrip()}
  ${usedTickets.length > 1 ? `<nav class="dem-chips"><button type="button" class="dem-chip active" data-filter=""><i class="all"></i>Todos</button>${chips}</nav>` : ''}
  <div class="dem-map-wrap">
    <div class="dem-map"></div>
    <div class="dem-legend">
      <span><i class="av"></i>Libre</span><span><i class="se"></i>Tuyo</span><span><i class="ho"></i>Apartado</span><span><i class="so"></i>Vendido</span>
    </div>
    <div class="dem-zoom">
      <button type="button" data-action="zoom-in" aria-label="Acercar"><i class="fa-solid fa-plus"></i></button>
      <button type="button" data-action="zoom-out" aria-label="Alejar"><i class="fa-solid fa-minus"></i></button>
    </div>
    <div class="dem-tip">Pellizca para hacer zoom · toca un asiento para elegirlo</div>
    <div class="dem-toast" role="status" aria-live="polite"></div>
  </div>
  <section class="dem-sheet" aria-label="Tu selección">
    <button type="button" class="dem-sheet-summary" data-action="toggle-sheet" aria-expanded="false">
      <span class="dem-handle"></span>
      <span class="dem-count" data-count></span>
      <span class="dem-total"><small>Total</small><strong data-total></strong></span>
      <i class="fa-solid fa-chevron-up dem-chevron"></i>
    </button>
    <div class="dem-sheet-body"></div>
    <div class="dem-countdown de-countdown"></div>
    <div class="dem-cta"></div>
  </section>
</div>`;
    this.root = this.container.querySelector('.dem');
    this.renderer = new root.DreamEventRenderer(this.container.querySelector('.dem-map'), {
      pan: true,
      labels: true,
      now: () => this.now(),
      fitPadding: { bottom: 8 },
      onSeat: (id, meta, status) => this.onSeatTap(id, meta, status),
      onViewChange: () => this.hideTip(),
    });
    this.root.addEventListener('click', (e) => {
      const filter = e.target.closest('[data-filter]');
      if (filter) return this.setFilter(filter.dataset.filter);
      const btn = e.target.closest('[data-action]');
      if (btn && !btn.disabled) this.action(btn.dataset.action, btn);
    });
    this.draw();
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(this.container.querySelector('.dem-map'));
    this.resizeObserver = ro;
    this._tipTimer = setTimeout(() => this.hideTip(), 4500);
  };

  MobileSelector.prototype.presaleStrip = function () {
    const active = this.data.ticketTypes.filter((t) => this.priceOf(t).presale);
    if (!active.length) return '';
    const until = Math.min(...active.map((t) => U.presaleEnd(t)));
    return `<div class="dem-presale"><i class="fa-solid fa-tag"></i> Preventa activa hasta ${U.escape(U.formatDate(until, this.options.locale))}</div>`;
  };
  MobileSelector.prototype.hideTip = function () {
    const tip = this.root && this.root.querySelector('.dem-tip');
    if (tip) tip.classList.add('hide');
  };
  MobileSelector.prototype.setFilter = function (ticketId) {
    this.filterTicket = ticketId || '';
    this.root.querySelectorAll('[data-filter]').forEach((b) => b.classList.toggle('active', b.dataset.filter === this.filterTicket));
    this.draw();
    requestAnimationFrame(() => this.renderer.fitToScreen());
  };

  /** Tap on a seat: zoom in first when seats are too small to hit, then select / deselect. */
  MobileSelector.prototype.onSeatTap = function (id, meta, status) {
    if (this.renderer.seatScreenSize(id) < (this.options.minTapSize || 16)) {
      this.renderer.zoomToSeat(id, 28);
      return;
    }
    if (!this.selection.has(id) && status !== 'available') {
      this.toast(status === 'sold' ? 'Ese asiento ya se vendió' : status === 'held' ? 'Ese asiento está apartado' : 'Asiento no disponible');
      return;
    }
    const had = this.selection.has(id);
    const ok = this.toggleSeat(id);
    if (ok && navigator.vibrate) navigator.vibrate(8);
    if (ok && !had) {
      const ticket = this.data.ticketTypes.find((t) => t.id === meta.ticketTypeId) || {};
      this.toast(`${meta.sectionName} · Fila ${meta.rowLabel} · ${meta.number} — ${this.money(this.priceOf(ticket).price, ticket.currency)}`);
    }
  };

  MobileSelector.prototype.action = function (a, btn) {
    if (a === 'fit') return this.renderer.fitToScreen();
    if (a === 'zoom-in') return this.renderer.zoomBy(1.4, null, true);
    if (a === 'zoom-out') return this.renderer.zoomBy(1 / 1.4, null, true);
    if (a === 'toggle-sheet') return this.toggleSheet();
    if (a === 'remove-seat') return this.deselectSeat(btn.dataset.id);
    if (a === 'ga-plus' || a === 'ga-minus') {
      const id = btn.dataset.id;
      return this.setGeneralAdmissionQuantity(id, (this.generalAdmission[id] || 0) + (a === 'ga-plus' ? 1 : -1));
    }
    if (a === 'hold') {
      const hold = this.createHold();
      if (hold) this.toggleSheet(true);
      return hold;
    }
    if (a === 'purchase') {
      this.lastPurchase = this.simulatePurchase();
      this.toggleSheet(true);
      return this.updateSummary();
    }
    if (a === 'cancel') return this.cancelHold();
    if (a === 'clear') return this.clearSelection();
    if (a === 'again') {
      this.lastPurchase = null;
      this.toggleSheet(false);
      return this.updateSummary();
    }
    return undefined;
  };
  MobileSelector.prototype.toggleSheet = function (open) {
    this.sheetOpen = open == null ? !this.sheetOpen : !!open;
    if (!this.root) return;
    this.root.classList.toggle('sheet-open', this.sheetOpen);
    this.root.querySelector('[data-action="toggle-sheet"]').setAttribute('aria-expanded', String(this.sheetOpen));
  };

  MobileSelector.prototype.updateSummary = function () {
    if (!this.root) return;
    const sel = this.getSelection();
    const body = this.root.querySelector('.dem-sheet-body'),
      cta = this.root.querySelector('.dem-cta');
    this.root.querySelector('[data-total]').textContent = U.money(U.toMinor(sel.total), this.options.currency, this.options.locale);
    this.root.querySelector('[data-count]').innerHTML = this.lastPurchase
      ? '<b>¡Listo!</b> compra simulada'
      : sel.ticketCount
        ? `<b>${sel.ticketCount}</b> ${sel.ticketCount === 1 ? 'boleto' : 'boletos'}${sel.savings > 0 ? ` · <em>ahorras ${this.money(sel.savings)}</em>` : ''}`
        : 'Elige tus asientos';
    this.root.classList.toggle('has-selection', sel.ticketCount > 0 || !!this.lastPurchase);

    if (this.lastPurchase) {
      const p = this.lastPurchase;
      body.innerHTML = `<div class="dem-done"><i class="fa-solid fa-circle-check"></i><strong>Compra simulada</strong><small>${p.seatIds.length} asiento(s) · ${this.money(p.total)} · ${U.escape(p.reservationId)}</small></div>`;
      cta.innerHTML = '<button type="button" class="dem-btn" data-action="again">Elegir más boletos</button>';
      return;
    }
    const seats = sel.seats
      .map(
        (s) => `<li><span><span><b>${U.escape(s.sectionName)}</b> · Fila ${U.escape(s.rowLabel)} · Asiento ${U.escape(s.seatNumber)}</span>
          <small>${U.escape(s.ticketTypeName)} · ${this.money(s.unitPrice)}${s.pricing === 'presale' ? ` <s>${this.money(s.regularPrice)}</s>` : ''}</small></span>
          ${this.hold ? '' : `<button type="button" data-action="remove-seat" data-id="${U.escape(s.seatId)}" aria-label="Quitar"><i class="fa-solid fa-xmark"></i></button>`}</li>`,
      )
      .join('');
    const gaTickets = this.data.ticketTypes.filter((t) => t.mode === 'general_admission');
    const ga = gaTickets
      .map((t) => {
        const q = this.generalAdmission[t.id] || 0;
        return `<li class="dem-ga"><span><b>${U.escape(t.name)}</b><small>Admisión general · ${this.priceLabel(t)}</small></span>
          <span class="dem-stepper"><button type="button" data-action="ga-minus" data-id="${U.escape(t.id)}" ${q <= 0 || this.hold ? 'disabled' : ''} aria-label="Menos"><i class="fa-solid fa-minus"></i></button><b>${q}</b><button type="button" data-action="ga-plus" data-id="${U.escape(t.id)}" ${this.hold ? 'disabled' : ''} aria-label="Más"><i class="fa-solid fa-plus"></i></button></span></li>`;
      })
      .join('');
    body.innerHTML =
      seats || ga
        ? `<ul class="dem-list">${seats}${ga}</ul>${sel.seatCount && !this.hold ? '<button type="button" class="dem-link" data-action="clear">Quitar todo</button>' : ''}`
        : '<p class="dem-empty">Toca un asiento libre en el mapa.</p>';
    if (this.hold) {
      cta.innerHTML = `<button type="button" class="dem-btn dem-btn-success" data-action="purchase"><i class="fa-solid fa-lock"></i> Pagar ${this.money(this.hold.total)}</button>
        <button type="button" class="dem-link" data-action="cancel">Cancelar reserva</button>`;
    } else {
      const ready = sel.ticketCount >= this.options.minSeats;
      cta.innerHTML = `<button type="button" class="dem-btn" data-action="hold" ${ready ? '' : 'disabled'}>${ready ? `Reservar · ${this.money(sel.total)}` : 'Selecciona tus asientos'}</button>`;
    }
  };

  MobileSelector.prototype.tick = function () {
    Selector.prototype.tick.call(this);
    const el = this.root && this.root.querySelector('.dem-countdown');
    if (!el) return;
    if (!this.hold) {
      el.textContent = '';
      return;
    }
    const s = Math.ceil(this.getRemainingHoldTime() / 1000);
    el.innerHTML = `<i class="fa-regular fa-clock"></i> Tus asientos están apartados por <b>${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}</b>`;
  };
  MobileSelector.prototype.release = function (status, callback) {
    const result = Selector.prototype.release.call(this, status, callback);
    this.tick();
    return result;
  };
  MobileSelector.prototype.toast = function (message) {
    const el = this.root && this.root.querySelector('.dem-toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  };
  MobileSelector.prototype.error = function (message) {
    U.emit(this.callbacks, 'onError', new Error(message));
    this.toast(message);
  };
  MobileSelector.prototype.destroy = function () {
    clearTimeout(this._toastTimer);
    clearTimeout(this._tipTimer);
    this.root = null;
    Selector.prototype.destroy.call(this);
  };
  MobileSelector.prototype.setData = function (json) {
    this.lastPurchase = null;
    return Selector.prototype.setData.call(this, json);
  };

  /* ------------------------------------------------- automatic mode wrapper */

  /**
   * "mobile" for phones (and very narrow windows); "desktop" for PCs and tablets such as iPad.
   * iPadOS reports itself as a Mac, so it is detected through its screen width, not the UA.
   */
  function detectMode(win = root) {
    const nav = win.navigator || {};
    const ua = nav.userAgent || '';
    const uaPhone =
      (nav.userAgentData && nav.userAgentData.mobile) ||
      /iPhone|iPod|Windows Phone|BlackBerry|Opera Mini|Android.+Mobile|Mobile.+Firefox/i.test(ua);
    const tablet = /iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua));
    const width = win.innerWidth || 1024;
    const short = Math.min(width, win.innerHeight || width);
    const mm = (q) => (win.matchMedia ? win.matchMedia(q).matches : false);
    const coarse = mm('(pointer: coarse)');
    if (uaPhone && !tablet) return 'mobile';
    if (coarse && short < 600) return 'mobile';
    if (width < 640) return 'mobile';
    return 'desktop';
  }

  const FORWARD = [
    'getData', 'getSelection', 'getSelectionJSON', 'setSelection', 'selectSeat', 'deselectSeat',
    'toggleSeat', 'setGeneralAdmissionQuantity', 'getTotal', 'getAvailability', 'setAvailability',
    'updateSeatStatus', 'createHold', 'getHold', 'getRemainingHoldTime', 'cancelHold', 'expireHold',
    'simulatePurchase', 'checkout', 'clearSelection', 'fitToScreen', 'resize', 'reset',
  ];

  /**
   * Creates the right purchase component and keeps it right when the screen changes
   * (rotation, resizing a desktop window). The current selection survives the swap;
   * while a hold is active the component is never swapped.
   * config: same as DreamEventSeatSelector plus `mode: 'auto' | 'mobile' | 'desktop'`
   * and callback `onModeChange(mode)`.
   */
  function SeatPicker(config) {
    this.config = Object.assign({}, config);
    this.container =
      typeof config.container === 'string' ? document.querySelector(config.container) : config.container;
    if (!this.container) throw new Error('Container requerido');
    this.forced = config.mode && config.mode !== 'auto' ? config.mode : null;
    this.data = U.clone(config.data);
    this.availability = U.clone(config.availability || { seats: {}, generalAdmission: {} });
    this.mount(this.forced || detectMode());
    this._onResize = () => {
      clearTimeout(this._resizeTimer);
      this._resizeTimer = setTimeout(() => this.refreshMode(), 180);
    };
    if (!this.forced) {
      root.addEventListener('resize', this._onResize);
      root.addEventListener('orientationchange', this._onResize);
    }
  }
  SeatPicker.prototype.mount = function (mode) {
    let selection = null,
      data = this.data;
    if (this.instance) {
      selection = this.instance.getSelection();
      data = this.instance.getData();
      this.availability = this.instance.getAvailability();
      this.instance.destroy();
    }
    this.mode = mode;
    const Component = mode === 'mobile' ? MobileSelector : Selector;
    const callbacks = this.config.callbacks || {};
    this.instance = new Component({
      container: this.container,
      data,
      availability: this.availability,
      options: this.config.options,
      callbacks,
    });
    if (selection && (selection.seats.length || selection.generalAdmission.length)) this.instance.setSelection(selection);
    this.container.dataset.deMode = mode;
    if (typeof callbacks.onModeChange === 'function') callbacks.onModeChange(mode);
  };
  SeatPicker.prototype.refreshMode = function () {
    if (this.forced || !this.instance) return;
    const next = detectMode();
    if (next !== this.mode && !this.instance.getHold()) this.mount(next);
  };
  SeatPicker.prototype.getMode = function () {
    return this.mode;
  };
  /** Force 'mobile' / 'desktop', or 'auto' to follow the device again. */
  SeatPicker.prototype.setMode = function (mode) {
    this.forced = mode === 'mobile' || mode === 'desktop' ? mode : null;
    const next = this.forced || detectMode();
    if (next !== this.mode) this.mount(next);
    return this;
  };
  SeatPicker.prototype.setData = function (json) {
    this.data = U.clone(json);
    this.instance.setData(json);
    return this;
  };
  SeatPicker.prototype.destroy = function () {
    root.removeEventListener('resize', this._onResize);
    root.removeEventListener('orientationchange', this._onResize);
    clearTimeout(this._resizeTimer);
    this.instance && this.instance.destroy();
    this.instance = null;
  };
  FORWARD.forEach((name) => {
    SeatPicker.prototype[name] = function () {
      return this.instance[name].apply(this.instance, arguments);
    };
  });
  SeatPicker.create = (config) => new SeatPicker(config);
  SeatPicker.detectMode = detectMode;

  root.DreamEventSeatSelectorMobile = MobileSelector;
  root.DreamEventSeatPicker = SeatPicker;
})(window);
