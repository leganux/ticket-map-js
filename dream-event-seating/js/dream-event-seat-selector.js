/** Responsive seat picker with a deliberately local, simulated reservation timer. */
(function (root) {
  'use strict';
  const U = root.DreamEventUtils,
    S = root.DreamEventSchema;
  function Selector(config) {
    this.config = config || {};
    this.container =
      typeof config.container === 'string'
        ? document.querySelector(config.container)
        : config.container;
    if (!this.container) throw new Error('Container requerido');
    this.data = root.DreamEventLayout.sync(S.normalize(config.data));
    this.options = Object.assign(
      {
        locale: this.data.locale || 'es-MX',
        currency: this.data.currency || 'MXN',
        maxSeats: 6,
        minSeats: 1,
        holdDurationSeconds: 600,
        allowMultipleSections: true,
        allowNonConsecutiveSeats: true,
      },
      config.options,
    );
    this.callbacks = config.callbacks || {};
    this.availability = U.clone(config.availability || { seats: {}, generalAdmission: {} });
    this.selection = new Set();
    this.generalAdmission = {};
    this.hold = null;
    this.timer = null;
    this.destroyed = false;
    this.render();
    U.emit(this.callbacks, 'onReady', this.getData());
  }
  Selector.prototype.render = function () {
    this.container.innerHTML = `<div class="de-selector"><div class="de-selector-head"><div><h4>${U.escape(this.data.name)}</h4><small>Selecciona asientos y confirma una reserva simulada.</small></div><div class="d-flex gap-2"><select class="form-select form-select-sm de-filter-ticket"><option value="">Todos los boletos</option>${this.data.ticketTypes.map((t) => `<option value="${U.escape(t.id)}">${U.escape(t.name)}</option>`).join('')}</select><select class="form-select form-select-sm de-filter-section"><option value="">Todas las secciones</option>${this.data.sections.map((s) => `<option value="${U.escape(s.id)}">${U.escape(s.name)}</option>`).join('')}</select><button class="btn btn-sm btn-outline-secondary" data-action="fit">Centrar</button><button class="btn btn-sm btn-outline-secondary" data-action="zoom-in" aria-label="Acercar">+</button><button class="btn btn-sm btn-outline-secondary" data-action="zoom-out" aria-label="Alejar">−</button></div></div><div class="de-selector-map"></div><div class="de-selector-bottom"><div class="de-legend">${[
      ['available', 'Disponible'],
      ['selected', 'Seleccionado'],
      ['held', 'Reservado'],
      ['sold', 'Vendido'],
      ['blocked', 'No disponible'],
    ]
      .map(([s, l]) => `<span><i class="de-dot de-${s}"></i>${l}</span>`)
      .join('')}</div><div class="de-ga">${this.data.ticketTypes
      .filter((t) => t.mode === 'general_admission')
      .map(
        (t) =>
          `<label>${U.escape(t.name)} · ${U.money(U.toMinor(t.price), t.currency || this.data.currency)}<input type="number" min="0" value="0" class="form-control form-control-sm" data-ga="${U.escape(t.id)}"></label>`,
      )
      .join(
        '',
      )}</div><div class="de-selection-summary"><div><strong data-total>Subtotal: ${U.money(this.getTotalMinor(), this.options.currency, this.options.locale)}</strong><div class="small" data-selection-label>${this.selection.size} asientos seleccionados</div><div class="small de-countdown"></div></div><div class="d-flex gap-2"><button class="btn btn-sm btn-outline-secondary" data-action="clear">Limpiar</button><button class="btn btn-sm btn-outline-danger" data-action="cancel" disabled>Cancelar reserva</button><button class="btn btn-sm btn-primary" data-action="hold">Reservar</button><button class="btn btn-sm btn-success" data-action="purchase" disabled>Simular compra</button></div></div></div><div class="de-seat-detail small text-secondary"></div></div>`;
    this.renderer = new root.DreamEventRenderer(this.container.querySelector('.de-selector-map'), {
      pan: true,
      labels: true,
      onSeat: (id, meta, status) => {
        this.toggleSeat(id);
        this.container.querySelector('.de-seat-detail').textContent =
          `${meta.sectionName} · Fila ${meta.rowLabel} · Asiento ${meta.number} · ${meta.ticketTypeName} · ${U.money(U.toMinor(meta.price), meta.currency)}`;
      },
    });
    this.draw();
    this.container
      .querySelectorAll('[data-action]')
      .forEach((b) => (b.onclick = () => this.action(b.dataset.action)));
    this.container
      .querySelectorAll('[data-ga]')
      .forEach(
        (el) => (el.onchange = () => this.setGeneralAdmissionQuantity(el.dataset.ga, +el.value)),
      );
    this.container.querySelector('.de-filter-ticket').onchange = (e) => {
      this.filterTicket = e.target.value;
      this.draw();
    };
    this.container.querySelector('.de-filter-section').onchange = (e) => {
      this.filterSection = e.target.value;
      this.draw();
    };
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(this.container.querySelector('.de-selector-map'));
    this.resizeObserver = ro;
  };
  Selector.prototype.draw = function () {
    if (this.renderer) {
      let view = this.data;
      if (this.filterTicket || this.filterSection) {
        view = U.clone(this.data);
        view.sections = view.sections.filter(
          (s) =>
            (!this.filterTicket || s.ticketTypeId === this.filterTicket) &&
            (!this.filterSection || s.id === this.filterSection),
        );
      }
      this.renderer.draw(view, this.availability, this.selection);
    }
    this.updateSummary();
  };
  Selector.prototype.action = function (a) {
    if (a === 'fit') this.fitToScreen();
    if (a === 'zoom-in') this.renderer.zoomBy(1.15);
    if (a === 'zoom-out') this.renderer.zoomBy(1 / 1.15);
    if (a === 'clear') this.clearSelection();
    if (a === 'hold') this.createHold();
    if (a === 'cancel') this.cancelHold();
    if (a === 'purchase') this.simulatePurchase();
  };
  Selector.prototype.isSelectable = function (id) {
    const f = U.findSeat(this.data, id);
    if (!f) return false;
    const dynamic = this.availability.seats[id] || f.seat.status;
    return !['sold', 'held', 'disabled', 'blocked'].includes(dynamic) && !this.hold;
  };
  Selector.prototype.selectSeat = function (id) {
    if (this.selection.has(id)) return true;
    if (!this.isSelectable(id)) return false;
    if (this.selection.size >= this.options.maxSeats) {
      this.error('Se alcanzó el máximo de asientos.');
      return false;
    }
    const f = U.findSeat(this.data, id);
    if (!this.options.allowMultipleSections && this.selection.size) {
      const first = U.findSeat(this.data, [...this.selection][0]);
      if (first.section.id !== f.section.id) {
        this.error('La selección debe permanecer en una sección.');
        return false;
      }
    }
    const ticketLimit =
      this.options.maxPerTicket && this.options.maxPerTicket[f.section.ticketTypeId];
    if (
      ticketLimit != null &&
      [...this.selection].filter(
        (key) => U.findSeat(this.data, key)?.section.ticketTypeId === f.section.ticketTypeId,
      ).length >= ticketLimit
    ) {
      this.error('Se alcanzó el límite de este tipo de boleto.');
      return false;
    }
    if (!this.options.allowNonConsecutiveSeats && this.selection.size) {
      const adjacent = [...this.selection].some((key) => {
        const other = U.findSeat(this.data, key);
        return (
          other &&
          other.section.id === f.section.id &&
          other.row.id === f.row.id &&
          Math.abs(Number(other.seat.number) - Number(f.seat.number)) === 1
        );
      });
      if (!adjacent) {
        this.error('Selecciona asientos consecutivos de la misma fila.');
        return false;
      }
    }
    this.selection.add(id);
    const seat = U.clone(f.seat);
    U.emit(this.callbacks, 'onSeatSelected', seat);
    this.changed();
    return true;
  };
  Selector.prototype.deselectSeat = function (id) {
    if (this.hold) return false;
    const ok = this.selection.delete(id);
    if (ok) {
      const f = U.findSeat(this.data, id);
      U.emit(this.callbacks, 'onSeatDeselected', U.clone(f?.seat));
      this.changed();
    }
    return ok;
  };
  Selector.prototype.toggleSeat = function (id) {
    return this.selection.has(id) ? this.deselectSeat(id) : this.selectSeat(id);
  };
  Selector.prototype.getSelection = function () {
    const seats = [...this.selection]
      .map((id) => {
        const f = U.findSeat(this.data, id);
        if (!f) return null;
        const t = this.data.ticketTypes.find((x) => x.id === f.section.ticketTypeId) || {};
        return {
          seatId: id,
          sectionId: f.section.id,
          sectionName: f.section.name,
          rowId: f.row.id,
          rowLabel: f.row.label,
          seatNumber: f.seat.number,
          ticketTypeId: t.id,
          ticketTypeName: t.name,
          unitPrice: +t.price || 0,
        };
      })
      .filter(Boolean);
    const ga = Object.entries(this.generalAdmission)
      .filter(([, quantity]) => quantity > 0)
      .map(([ticketTypeId, quantity]) => {
        const t = this.data.ticketTypes.find((x) => x.id === ticketTypeId) || {};
        return {
          ticketTypeId,
          quantity,
          unitPrice: +t.price || 0,
          subtotal: quantity * (+t.price || 0),
        };
      });
    const minor =
        seats.reduce((n, x) => n + U.toMinor(x.unitPrice), 0) +
        ga.reduce((n, x) => n + U.toMinor(x.subtotal), 0),
      total = minor / 100;
    return {
      eventId: this.data.eventId,
      currency: this.options.currency,
      seatCount: seats.length,
      ticketCount: seats.length + ga.reduce((n, x) => n + x.quantity, 0),
      seats,
      generalAdmission: ga,
      subtotal: total,
      total,
    };
  };
  Selector.prototype.getSelectionJSON = function () {
    return JSON.stringify(this.getSelection(), null, 2);
  };
  Selector.prototype.setSelection = function (value) {
    this.clearSelection();
    (value.seats || []).forEach((s) => this.selectSeat(s.seatId));
    (value.generalAdmission || []).forEach((g) =>
      this.setGeneralAdmissionQuantity(g.ticketTypeId, g.quantity),
    );
    return this;
  };
  Selector.prototype.setGeneralAdmissionQuantity = function (id, qty) {
    const t = this.data.ticketTypes.find((x) => x.id === id && x.mode === 'general_admission');
    if (!t) return false;
    qty = Math.max(0, Math.floor(Number(qty) || 0));
    const other = Object.values(this.generalAdmission).reduce((a, b) => a + b, 0);
    qty = Math.min(
      qty,
      Math.max(
        0,
        this.options.maxSeats - this.selection.size - (other - (this.generalAdmission[id] || 0)),
      ),
    );
    if (t.capacity != null)
      qty = Math.min(
        qty,
        Math.max(
          0,
          Number(t.capacity) -
            (this.availability.generalAdmission[id]?.sold || 0) -
            (this.availability.generalAdmission[id]?.held || 0),
        ),
      );
    const ticketLimit = this.options.maxPerTicket && this.options.maxPerTicket[id];
    if (ticketLimit != null) qty = Math.min(qty, ticketLimit);
    this.generalAdmission[id] = qty;
    this.changed();
    return true;
  };
  Selector.prototype.getTotal = function () {
    return this.getSelection().total;
  };
  Selector.prototype.getTotalMinor = function () {
    return U.toMinor(this.getSelection().total);
  };
  Selector.prototype.changed = function () {
    this.draw();
    U.emit(this.callbacks, 'onSelectionChange', this.getSelection());
  };
  Selector.prototype.updateSummary = function () {
    if (!this.container.querySelector('[data-total]')) return;
    this.container.querySelector('[data-total]').textContent =
      `Subtotal: ${U.money(this.getTotalMinor(), this.options.currency, this.options.locale)}`;
    this.container.querySelector('[data-selection-label]').textContent =
      `${this.selection.size} asientos seleccionados`;
    this.container.querySelector('[data-action="purchase"]').disabled = !this.hold;
    this.container.querySelector('[data-action="cancel"]').disabled = !this.hold;
    this.container.querySelector('[data-action="hold"]').disabled =
      !!this.hold || this.getSelection().ticketCount < this.options.minSeats;
  };
  Selector.prototype.error = function (message) {
    U.emit(this.callbacks, 'onError', new Error(message));
    if (root.Swal)
      root.Swal.fire({
        toast: true,
        position: 'top',
        icon: 'warning',
        title: message,
        showConfirmButton: false,
        timer: 2600,
        timerProgressBar: true,
      });
  };
  Selector.prototype.createHold = function () {
    if (this.hold) return this.getHold();
    const selection = this.getSelection();
    if (selection.ticketCount < this.options.minSeats) {
      this.error('Selecciona más boletos antes de reservar.');
      return null;
    }
    const now = Date.now(),
      duration = Math.max(1, +this.options.holdDurationSeconds || 600);
    this.hold = {
      reservationId: U.id('hold_local'),
      eventId: this.data.eventId,
      status: 'held',
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + duration * 1000).toISOString(),
      durationSeconds: duration,
      seatIds: [...this.selection],
      generalAdmission: U.clone(selection.generalAdmission).map(({ ticketTypeId, quantity }) => ({
        ticketTypeId,
        quantity,
      })),
      total: selection.total,
      currency: selection.currency,
      simulated: true,
    };
    this.hold.seatIds.forEach((id) => (this.availability.seats[id] = 'held'));
    U.emit(this.callbacks, 'onHoldCreated', this.getHold());
    this.tick();
    this.timer = setInterval(() => this.tick(), 250);
    this.draw();
    return this.getHold();
  };
  Selector.prototype.tick = function () {
    if (!this.hold) return;
    const remaining = Math.max(0, Date.parse(this.hold.expiresAt) - Date.now());
    U.emit(this.callbacks, 'onHoldTick', { reservation: this.getHold(), remainingMs: remaining });
    const el = this.container.querySelector('.de-countdown');
    if (el) el.textContent = `Reserva temporal: ${Math.ceil(remaining / 1000)} s`;
    if (remaining <= 0) this.expireHold();
  };
  Selector.prototype.getHold = function () {
    return U.clone(this.hold);
  };
  Selector.prototype.getRemainingHoldTime = function () {
    return this.hold ? Math.max(0, Date.parse(this.hold.expiresAt) - Date.now()) : 0;
  };
  Selector.prototype.release = function (status, callback) {
    if (!this.hold) return false;
    const old = this.getHold();
    old.status = status;
    old.completedAt = new Date().toISOString();
    if (status !== 'completed')
      old.seatIds.forEach((id) => {
        if (this.availability.seats[id] === 'held') delete this.availability.seats[id];
      });
    this.hold = null;
    clearInterval(this.timer);
    this.timer = null;
    this.selection.clear();
    this.generalAdmission = {};
    U.emit(this.callbacks, callback, old);
    this.draw();
    return old;
  };
  Selector.prototype.cancelHold = function () {
    return this.release('cancelled', 'onHoldCancelled');
  };
  Selector.prototype.expireHold = function () {
    return this.release('expired', 'onHoldExpired');
  };
  Selector.prototype.simulatePurchase = function () {
    const result = this.release('completed', 'onPurchaseSimulated');
    if (result) result.seatIds.forEach((id) => (this.availability.seats[id] = 'sold'));
    this.draw();
    return result;
  };
  Selector.prototype.checkout = function () {
    const s = this.getSelection();
    U.emit(this.callbacks, 'onCheckout', s);
    return s;
  };
  Selector.prototype.clearSelection = function () {
    if (this.hold) return false;
    this.selection.clear();
    this.generalAdmission = {};
    this.changed();
    return true;
  };
  Selector.prototype.getData = function () {
    return U.clone(this.data);
  };
  Selector.prototype.setData = function (j) {
    this.data = root.DreamEventLayout.sync(S.normalize(j));
    this.selection.clear();
    this.generalAdmission = {};
    this.draw();
    return this;
  };
  Selector.prototype.getAvailability = function () {
    return U.clone(this.availability);
  };
  Selector.prototype.setAvailability = function (a) {
    this.availability = U.clone(a || { seats: {}, generalAdmission: {} });
    this.draw();
    return this;
  };
  Selector.prototype.updateSeatStatus = function (id, status) {
    this.availability.seats[id] = status;
    this.draw();
    return this;
  };
  Selector.prototype.fitToScreen = function () {
    this.renderer.fitToScreen();
  };
  Selector.prototype.resize = function () {
    this.renderer.resize();
  };
  Selector.prototype.reset = function () {
    this.cancelHold();
    this.selection.clear();
    this.generalAdmission = {};
    this.availability = { seats: {}, generalAdmission: {} };
    this.draw();
    return this;
  };
  Selector.prototype.destroy = function () {
    this.destroyed = true;
    clearInterval(this.timer);
    this.resizeObserver?.disconnect();
    this.renderer?.destroy();
    this.container.innerHTML = '';
  };
  root.DreamEventSeatSelector = Selector;
})(window);
