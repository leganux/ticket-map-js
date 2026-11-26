/** Interactive seat map editor: canvas + side panel (Configurar / Secciones / Asientos). */
(function (root) {
  'use strict';
  const U = root.DreamEventUtils,
    S = root.DreamEventSchema,
    L = root.DreamEventLayout;
  const NEW = '__new__';
  const SHAPES = [
    ['rectangle', 'Rectangular'],
    ['square', 'Cuadrada'],
    ['trapezoid', 'Trapezoidal'],
    ['semicircle', 'Semicircular'],
    ['circle', 'Circular'],
    ['ring', 'Anillo (estadio)'],
    ['table', 'Mesa redonda'],
  ];
  const STATUSES = [
    ['available', 'Disponible'],
    ['disabled', 'No disponible'],
    ['blocked', 'Bloqueado'],
    ['accessible', 'Accesible'],
  ];
  const TABS = [
    ['Configurar', 'fa-solid fa-gear'],
    ['Secciones', 'fa-solid fa-layer-group'],
    ['Asientos', 'fa-solid fa-couch'],
  ];
  const TOOLS = [
    ['select', 'fa-solid fa-arrow-pointer', 'Seleccionar y mover (V)'],
    ['pan', 'fa-regular fa-hand', 'Mover vista (H)'],
    ['marquee', 'fa-solid fa-table-cells', 'Seleccionar asientos con un recuadro (M)'],
    ['stage', 'fa-solid fa-masks-theater', 'Escenario'],
  ];
  const HINTS = {
    select: 'Arrastra secciones o el escenario. Clic en un asiento para editarlo; Shift+clic suma asientos.',
    pan: 'Arrastra para desplazar la vista. Usa la rueda del ratón para acercar o alejar.',
    marquee: 'Dibuja un recuadro para seleccionar varios asientos. Shift suma a la selección.',
  };
  /** ISO / date-only value -> "YYYY-MM-DDTHH:mm" for <input type="datetime-local">. */
  const toLocalInput = (value) => {
    const t = U.presaleEnd({ presaleEndsAt: value });
    if (!Number.isFinite(t)) return '';
    const d = new Date(t),
      pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const presaleOf = (ticket) => ({
    presaleEnabled: U.hasPresale(ticket),
    presalePrice: U.hasPresale(ticket) ? Number(ticket.presalePrice) : '',
    presaleEndsAt: U.hasPresale(ticket) ? toLocalInput(ticket.presaleEndsAt) : '',
  });
  const seatsOf = (section) => section.rows.reduce((n, r) => n + r.seats.length, 0);
  const isTyping = (el) =>
    el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

  function Builder(config) {
    this.config = config || {};
    this.container =
      typeof this.config.container === 'string'
        ? document.querySelector(this.config.container)
        : this.config.container;
    if (!this.container) throw new Error('Container requerido');
    this.initial = L.sync(S.normalize(this.config.data || {}));
    this.data = U.clone(this.initial);
    this.options = Object.assign(
      {
        locale: this.data.locale || 'es-MX',
        currency: this.data.currency || 'MXN',
        historyLimit: 50,
        keyboard: true,
      },
      this.config.options,
    );
    this.callbacks = this.config.callbacks || {};
    this.history = new root.DreamEventHistory(this.options.historyLimit);
    this.step = 0;
    this.tool = 'select';
    this.selected = null;
    this.selectedSeatIds = new Set();
    this.formSectionId = this.data.sections[0] ? this.data.sections[0].id : NEW;
    this.destroyed = false;
    this.render();
    U.emit(this.callbacks, 'onReady', this.getData());
  }

  /* ------------------------------------------------------------------ layout */

  Builder.prototype.render = function () {
    const tabs = TABS.map(
      ([label, icon], i) =>
        `<button type="button" class="deb-tab" data-step="${i}"><i class="${icon}"></i><span>${label}</span></button>`,
    ).join('');
    const tools = TOOLS.map(
      ([tool, icon, title]) =>
        `<button type="button" class="deb-tool" data-tool="${tool}" title="${title}" aria-label="${title}"><i class="${icon}"></i></button>`,
    ).join('');
    const shapes = SHAPES.map(
      ([value, label]) =>
        `<button type="button" data-action="quick-section" data-shape="${value}"><span class="deb-shape deb-shape-${value}"></span>${label}</button>`,
    ).join('');
    this.container.innerHTML = `
<div class="deb">
  <header class="deb-head">
    <div><h1>Mapa de asientos</h1><p>Diseña y configura el mapa de asientos de tu evento.</p></div>
    <div class="deb-head-actions">
      <button type="button" class="deb-btn deb-btn-outline" data-action="preview"><i class="fa-regular fa-eye"></i> Vista previa</button>
      ${this.templateList().length ? '<button type="button" class="deb-btn deb-btn-outline" data-action="templates"><i class="fa-solid fa-table-cells-large"></i> Templates</button>' : ''}
      <button type="button" class="deb-btn deb-btn-primary" data-action="complete"><i class="fa-regular fa-floppy-disk"></i> Guardar mapa</button>
      <div class="deb-menu">
        <button type="button" class="deb-icon" data-action="toggle-menu" aria-label="Más opciones"><i class="fa-solid fa-ellipsis-vertical"></i></button>
        <div class="deb-menu-list" hidden>
          <button type="button" data-action="export"><i class="fa-solid fa-file-arrow-down"></i> Exportar JSON</button>
          <button type="button" data-action="import"><i class="fa-solid fa-file-arrow-up"></i> Importar JSON</button>
          <button type="button" data-action="fit"><i class="fa-solid fa-expand"></i> Ajustar vista</button>
          <hr>
          <button type="button" data-action="reset"><i class="fa-solid fa-clock-rotate-left"></i> Restaurar mapa inicial</button>
          <button type="button" data-action="clear" class="danger"><i class="fa-regular fa-trash-can"></i> Vaciar mapa</button>
        </div>
      </div>
      <input hidden type="file" accept="application/json,.json" class="deb-import">
    </div>
  </header>
  <section class="deb-summary"></section>
  <div class="deb-layout">
    <section class="deb-map-card">
      <div class="deb-toolbar">
        <div class="deb-tool-group">${tools}
          <div class="deb-menu">
            <button type="button" class="deb-tool deb-add" data-action="toggle-add"><i class="fa-solid fa-plus"></i> <span>Agregar sección</span> <i class="fa-solid fa-chevron-down deb-caret"></i></button>
            <div class="deb-menu-list deb-add-list" hidden>
              <button type="button" data-action="new-section"><i class="fa-solid fa-sliders"></i>Personalizada…</button><hr>${shapes}
            </div>
          </div>
        </div>
        <div class="deb-tool-group">
          <button type="button" class="deb-tool" data-action="undo" title="Deshacer (Ctrl+Z)" aria-label="Deshacer"><i class="fa-solid fa-rotate-left"></i></button>
          <button type="button" class="deb-tool" data-action="redo" title="Rehacer (Ctrl+Shift+Z)" aria-label="Rehacer"><i class="fa-solid fa-rotate-right"></i></button>
          <span class="deb-sep"></span>
          <button type="button" class="deb-tool" data-action="delete-selection" title="Eliminar selección (Supr)" aria-label="Eliminar selección"><i class="fa-regular fa-trash-can"></i></button>
        </div>
      </div>
      <div class="deb-canvas-wrap">
        <div class="deb-canvas"></div>
        <div class="deb-legend"></div>
        <div class="deb-float" hidden>
          <button type="button" data-action="float-duplicate" title="Duplicar"><i class="fa-regular fa-copy"></i></button>
          <button type="button" data-action="float-config" title="Configurar"><i class="fa-solid fa-gear"></i></button>
          <button type="button" data-action="delete-selection" title="Eliminar"><i class="fa-regular fa-trash-can"></i></button>
        </div>
        <div class="deb-zoom">
          <button type="button" data-action="zoom-out" aria-label="Alejar"><i class="fa-solid fa-minus"></i></button>
          <span data-zoom>100%</span>
          <button type="button" data-action="zoom-in" aria-label="Acercar"><i class="fa-solid fa-plus"></i></button>
        </div>
        <button type="button" class="deb-fit" data-action="fit" title="Ajustar vista" aria-label="Ajustar vista"><i class="fa-solid fa-expand"></i></button>
        <div class="deb-hint"></div>
      </div>
    </section>
    <aside class="deb-panel">
      <nav class="deb-tabs">${tabs}</nav>
      <div class="deb-panel-body"></div>
    </aside>
  </div>
</div>`;
    this.el = {
      root: this.container.querySelector('.deb'),
      summary: this.container.querySelector('.deb-summary'),
      panel: this.container.querySelector('.deb-panel-body'),
      legend: this.container.querySelector('.deb-legend'),
      float: this.container.querySelector('.deb-float'),
      zoom: this.container.querySelector('[data-zoom]'),
      hint: this.container.querySelector('.deb-hint'),
      canvas: this.container.querySelector('.deb-canvas'),
      importInput: this.container.querySelector('.deb-import'),
    };
    this.bindEvents();
    this.mountRenderer();
    this.setTool('select');
    this.refreshChrome();
    this.updatePanels();
  };

  Builder.prototype.bindEvents = function () {
    const rootEl = this.el.root;
    this._onClick = (event) => {
      const tab = event.target.closest('[data-step]');
      if (tab) return this.goToStep(Number(tab.dataset.step));
      const tool = event.target.closest('[data-tool]');
      if (tool) return this.setTool(tool.dataset.tool);
      const button = event.target.closest('[data-action]');
      if (!button || button.disabled) {
        if (!event.target.closest('.deb-menu')) this.closeMenus();
        return;
      }
      this.action(button.dataset.action, button);
    };
    rootEl.addEventListener('click', this._onClick);
    rootEl.addEventListener('input', (event) => this.onPanelInput(event));
    rootEl.addEventListener('change', (event) => this.onPanelChange(event));
    this.el.importInput.addEventListener('change', (event) => {
      this.importFile(event.target.files[0]);
      event.target.value = '';
    });
    this._onDocClick = (event) => {
      if (!this.el.root.contains(event.target)) this.closeMenus();
    };
    document.addEventListener('click', this._onDocClick);
    this._onKey = (event) => this.onKey(event);
    if (this.options.keyboard) document.addEventListener('keydown', this._onKey);
  };

  Builder.prototype.mountRenderer = function () {
    if (this.renderer) this.renderer.destroy();
    this.renderer = new root.DreamEventRenderer(this.el.canvas, {
      editable: true,
      labels: true,
      fitPadding: { left: this.el.canvas.clientWidth > 760 ? 150 : 0, bottom: 30 },
      onSelect: (selection, evt) => this.handleCanvasSelect(selection, evt),
      onSeat: (id, meta, status, evt) => this.handleSeatClick(id, evt),
      onMarquee: (ids, additive) => {
        const next = additive ? new Set([...this.selectedSeatIds, ...ids]) : new Set(ids);
        this.selectSeats([...next]);
      },
      onSectionMove: (id, pos) => this.updateSection(id, pos),
      onStageMove: (pos) => this.setStage(pos),
      onSeatsMove: (items) =>
        this.mutate(() =>
          items.forEach(({ id, x, y }) => {
            const found = U.findSeat(this.data, id);
            if (found) Object.assign(found.seat, { x, y, manualPosition: true });
          }),
        ),
      onViewChange: () => this.updateOverlay(),
    });
    this.drawCanvas();
    requestAnimationFrame(() => !this.destroyed && this.renderer.fitToMap());
    this.resizeObserver = new ResizeObserver(() => this.renderer && this.renderer.resize());
    this.resizeObserver.observe(this.el.canvas);
  };

  /** Rebuild the Konva scene from the model and re-apply the current selection. */
  Builder.prototype.drawCanvas = function () {
    if (!this.renderer) return;
    this.renderer.draw(this.data, null, this.selectedSeatIds);
    this.renderer.setSelection(this.selected);
    this.updateOverlay();
  };
  /** Kept for backwards compatibility: redraws canvas and panels. */
  Builder.prototype.draw = function () {
    this.drawCanvas();
    this.refreshChrome();
    this.updatePanels();
  };

  /* ------------------------------------------------------------ chrome bits */

  Builder.prototype.money = function (amount, currency) {
    try {
      return U.money(U.toMinor(amount), currency || this.options.currency, this.options.locale);
    } catch (_) {
      return '$' + Number(amount || 0).toFixed(2);
    }
  };
  Builder.prototype.ticketColor = function (ticket) {
    return (ticket && ticket.color) || '#7C3AED';
  };
  Builder.prototype.reservedTickets = function () {
    return this.data.ticketTypes.filter((t) => t.mode === 'reserved_seating');
  };

  Builder.prototype.refreshChrome = function () {
    this.renderSummary();
    this.renderLegend();
    const undo = this.container.querySelector('[data-action="undo"]'),
      redo = this.container.querySelector('[data-action="redo"]'),
      del = this.container.querySelector('.deb-toolbar [data-action="delete-selection"]');
    if (undo) undo.disabled = !this.history.undoStack.length;
    if (redo) redo.disabled = !this.history.redoStack.length;
    if (del) del.disabled = !this.selected && !this.selectedSeatIds.size;
  };

  Builder.prototype.renderSummary = function () {
    const d = this.data,
      meta = d.metadata || {};
    const date = meta.date || d.eventDate,
      venue = meta.venue || d.venue;
    const cover = d.background && d.background.src
      ? `<img src="${U.escape(d.background.src)}" alt="">`
      : '<i class="fa-solid fa-music"></i>';
    const icons = ['fa-solid fa-crown', 'fa-solid fa-ticket', 'fa-solid fa-star'];
    const tickets = d.ticketTypes
      .map((ticket) => {
        const seats = d.sections
          .filter((s) => s.ticketTypeId === ticket.id)
          .reduce((n, s) => n + seatsOf(s), 0);
        const value = ticket.mode === 'general_admission' ? Number(ticket.capacity) || 0 : seats;
        return { ticket, value, used: seats > 0 || ticket.mode === 'general_admission' };
      })
      .filter((x) => x.used)
      .slice(0, 3);
    this.el.summary.innerHTML = `
      <div class="deb-cover">${cover}</div>
      <div class="deb-event">
        <strong>${U.escape(d.name || 'Evento')}</strong>
        ${date ? `<span><i class="fa-regular fa-calendar"></i>${U.escape(date)}</span>` : ''}
        ${venue ? `<span><i class="fa-solid fa-location-dot"></i>${U.escape(venue)}</span>` : ''}
      </div>
      <div class="deb-stats">
        <div class="deb-stat"><span class="deb-stat-icon"><i class="fa-solid fa-users"></i></span><div><small>Capacidad total</small><strong>${this.getCapacity()}</strong></div></div>
        ${tickets
          .map(
            ({ ticket, value }, i) =>
              `<div class="deb-stat"><span class="deb-stat-icon" style="--c:${U.escape(this.ticketColor(ticket))}"><i class="${icons[i]}"></i></span><div><small>${U.escape(ticket.name)}${ticket.mode === 'general_admission' ? ' · admisión' : ''}</small><strong>${value}</strong></div></div>`,
          )
          .join('')}
      </div>`;
  };

  Builder.prototype.renderLegend = function () {
    const used = new Map();
    this.data.sections.forEach((s) => {
      const ticket = this.data.ticketTypes.find((t) => t.id === s.ticketTypeId);
      if (ticket && !used.has(ticket.id)) used.set(ticket.id, { ticket, color: s.color || ticket.color });
    });
    const seats = U.eachSeat(this.data).map((x) => x.seat);
    const rows = [...used.values()].map(
      ({ ticket, color }) =>
        `<li><i style="background:${U.escape(color || this.ticketColor(ticket))}"></i><span>${U.escape(ticket.name)}${this.legendPrice(ticket)}</span></li>`,
    );
    rows.push('<li><i class="is-disabled"></i><span>No disponible</span></li>');
    if (seats.some((s) => s.status === 'blocked'))
      rows.push('<li><i class="is-blocked"></i><span>Bloqueado</span></li>');
    if (seats.some((s) => s.accessible || s.status === 'accessible'))
      rows.push('<li><i class="is-accessible"></i><span>Accesible</span></li>');
    rows.push('<li><i class="is-selected"></i><span>Seleccionado</span></li>');
    this.el.legend.innerHTML = `<strong>Leyenda</strong><ul>${rows.join('')}</ul>`;
    this.el.legend.hidden = !this.data.sections.length;
  };

  Builder.prototype.legendPrice = function (ticket) {
    const p = U.ticketPrice(ticket);
    const regular = `<small>${this.money(p.regularPrice, ticket.currency)}</small>`;
    if (p.presalePrice == null) return regular;
    const until = U.formatDate(ticket.presaleEndsAt, this.options.locale, false);
    return `${regular}<small class="deb-legend-presale ${p.presale ? '' : 'ended'}">Preventa ${this.money(p.presalePrice, ticket.currency)}${p.presale ? ` · hasta ${U.escape(until)}` : ' · terminó'}</small>`;
  };
  /** Zoom label + floating action bar above the selected element. */
  Builder.prototype.updateOverlay = function () {
    if (!this.renderer || !this.el) return;
    this.el.zoom.textContent = Math.round(this.renderer.getZoom() * 100) + '%';
    const float = this.el.float;
    const rect = this.tool === 'select' ? this.renderer.getElementRect(this.selected) : null;
    if (!rect) {
      float.hidden = true;
      return;
    }
    float.hidden = false;
    float.querySelector('[data-action="float-duplicate"]').hidden = this.selected.type !== 'section';
    const wrap = this.el.canvas.getBoundingClientRect();
    const w = float.offsetWidth || 110,
      h = float.offsetHeight || 36;
    const left = Math.max(8, Math.min(wrap.width - w - 8, rect.x + rect.width - w));
    let top = rect.y - h - 14;
    if (top < 8) top = Math.min(wrap.height - h - 8, rect.y + rect.height + 14);
    float.style.transform = `translate(${Math.round(left)}px, ${Math.round(Math.max(8, top))}px)`;
  };

  /* ----------------------------------------------------------- interaction */

  Builder.prototype.setTool = function (tool) {
    if (tool === 'stage') {
      if (!this.data.stage) this.setStage({});
      this.setTool('select');
      this.select({ type: 'stage' });
      this.goToStep(0);
      const details = this.container.querySelector('.deb-stage-details');
      if (details) {
        details.open = true;
        this.scrollPanelTo(details);
      }
      return this;
    }
    this.tool = ['select', 'pan', 'marquee'].includes(tool) ? tool : 'select';
    this.renderer && this.renderer.setTool(this.tool);
    this.container
      .querySelectorAll('[data-tool]')
      .forEach((b) => b.classList.toggle('active', b.dataset.tool === this.tool));
    this.showHint(HINTS[this.tool]);
    this.updateOverlay();
    return this;
  };

  Builder.prototype.showHint = function (text) {
    const hint = this.el.hint;
    hint.textContent = text;
    hint.classList.add('show');
    clearTimeout(this._hintTimer);
    this._hintTimer = setTimeout(() => hint.classList.remove('show'), 3500);
  };
  Builder.prototype.handleCanvasSelect = function (selection, evt) {
    const additive = evt && (evt.shiftKey || evt.metaKey || evt.ctrlKey);
    if (!selection) {
      if (additive) return;
      this.select(null);
      this.selectSeats([]);
      return;
    }
    this.select(selection);
  };
  Builder.prototype.handleSeatClick = function (id, evt) {
    if (this.tool === 'pan') return;
    const additive = evt && (evt.shiftKey || evt.metaKey || evt.ctrlKey);
    const next = new Set(additive ? this.selectedSeatIds : []);
    if (additive && next.has(id)) next.delete(id);
    else next.add(id);
    this.selectSeats([...next]);
  };

  /** Select a section (`{type:'section', id}`), the stage (`{type:'stage'}`) or nothing. */
  Builder.prototype.select = function (selection) {
    if (selection && selection.type === 'section' && !this.getSection(selection.id)) selection = null;
    if (selection && selection.type === 'stage' && !this.data.stage) selection = null;
    this.selected = selection ? { type: selection.type, id: selection.id } : null;
    if (this.selected) {
      this.selectedSeatIds.clear();
      this.renderer && this.renderer.setSelectedSeats(this.selectedSeatIds);
    }
    if (this.selected && this.selected.type === 'section') {
      if (this.formSectionId !== this.selected.id) this.draftDirty = false;
      this.formSectionId = this.selected.id;
      if (this.step === 2) this.step = 0;
    }
    if (this.selected && this.selected.type === 'stage') this.step = 0;
    this.renderer && this.renderer.setSelection(this.selected);
    this.refreshChrome();
    this.updatePanels();
    U.emit(this.callbacks, 'onSelectionChange', this.selected);
    return this;
  };
  Builder.prototype.selectSection = function (id) {
    return this.select(id ? { type: 'section', id } : null);
  };
  Builder.prototype.selectSeats = function (ids) {
    this.selectedSeatIds = new Set((ids || []).filter((id) => U.findSeat(this.data, id)));
    if (this.selectedSeatIds.size) {
      this.selected = null;
      this.renderer && this.renderer.setSelection(null);
      this.step = 2;
    }
    this.renderer && this.renderer.setSelectedSeats(this.selectedSeatIds);
    this.refreshChrome();
    this.updatePanels();
    this.updateOverlay();
    U.emit(this.callbacks, 'onSelectionChange', [...this.selectedSeatIds]);
    return this;
  };

  Builder.prototype.closeMenus = function (except) {
    this.container.querySelectorAll('.deb-menu-list').forEach((m) => {
      if (m !== except) m.hidden = true;
    });
  };
  Builder.prototype.toggleMenu = function (button) {
    const list = button.parentElement.querySelector('.deb-menu-list');
    this.closeMenus(list);
    list.hidden = !list.hidden;
  };

  Builder.prototype.action = function (a, button) {
    if (a !== 'toggle-menu' && a !== 'toggle-add') this.closeMenus();
    switch (a) {
      case 'toggle-menu':
      case 'toggle-add':
        return this.toggleMenu(button);
      case 'fit':
        return this.renderer.fitToMap();
      case 'zoom-in':
        return this.renderer.zoomBy(1.2);
      case 'zoom-out':
        return this.renderer.zoomBy(1 / 1.2);
      case 'undo':
        return this.undo();
      case 'redo':
        return this.redo();
      case 'reset':
        return this.reset();
      case 'clear':
        return this.confirm('¿Vaciar el mapa?', 'Se quitarán todas las secciones y el escenario.', 'Vaciar').then(
          (ok) => ok && this.mutate(() => {
            this.data.sections = [];
            this.data.stage = null;
            this.selected = null;
            this.formSectionId = NEW;
          }),
        );
      case 'export':
        return this.exportJSON();
      case 'import':
        return this.el.importInput.click();
      case 'preview':
        return this.preview();
      case 'templates':
        return this.openTemplates();
      case 'complete':
        return this.complete();
      case 'new-section':
        this.draftDirty = false;
        this.select(null);
        this.selectSeats([]);
        this.formSectionId = NEW;
        this.goToStep(0);
        return this.focusForm();
      case 'quick-section':
        return this.quickSection(button.dataset.shape);
      case 'delete-selection':
        return this.deleteSelection();
      case 'float-duplicate':
        return this.selected && this.duplicateSection(this.selected.id);
      case 'float-config':
        this.goToStep(0);
        if (this.selected && this.selected.type === 'stage') {
          const details = this.container.querySelector('.deb-stage-details');
          if (details) details.open = true;
        }
        return this.focusForm();
      case 'apply-section':
        return this.applySectionForm();
      case 'select-section':
        return this.select({ type: 'section', id: button.dataset.id });
      case 'edit-section':
        return this.editSection(button.dataset.id);
      case 'toggle-visible': {
        const s = this.getSection(button.dataset.id);
        return s && this.updateSection(s.id, { visible: s.visible === false });
      }
      case 'toggle-lock': {
        const s = this.getSection(button.dataset.id);
        return s && this.updateSection(s.id, { locked: !s.locked });
      }
      case 'duplicate':
        return this.duplicateSection(button.dataset.id);
      case 'remove-section':
        return this.removeSection(button.dataset.id);
      case 'add-stage':
        return this.setTool('stage');
      case 'remove-stage':
        if (this.selected && this.selected.type === 'stage') this.selected = null;
        return this.setStage(null);
      case 'center-stage':
        return this.setStage({ x: Math.round((this.data.canvas.width - this.data.stage.width) / 2) });
      case 'remove-background':
        return this.setBackground({ src: null });
      case 'clear-seats':
        return this.selectSeats([]);
      case 'select-row': {
        const found = U.findSeat(this.data, [...this.selectedSeatIds][0]);
        return found && this.selectSeats(found.row.seats.map((s) => s.id));
      }
      case 'reset-seat-position':
        return this.mutate(() =>
          this.selectedSeatIds.forEach((id) => {
            const found = U.findSeat(this.data, id);
            if (found) found.seat.manualPosition = false;
          }),
        );
      case 'delete-seats':
        return this.removeSeats([...this.selectedSeatIds]);
      default:
        return undefined;
    }
  };

  Builder.prototype.onKey = function (event) {
    if (this.destroyed || !this.el.root.isConnected || !this.el.root.offsetParent) return;
    if (isTyping(document.activeElement) || document.querySelector('.swal2-container')) return;
    const mod = event.metaKey || event.ctrlKey,
      key = event.key.toLowerCase();
    if (mod && key === 'z') {
      event.preventDefault();
      return event.shiftKey ? this.redo() : this.undo();
    }
    if (mod && key === 'y') {
      event.preventDefault();
      return this.redo();
    }
    if (mod && key === 'd' && this.selected && this.selected.type === 'section') {
      event.preventDefault();
      return this.duplicateSection(this.selected.id);
    }
    if (mod) return;
    if (key === 'delete' || key === 'backspace') {
      if (this.selected || this.selectedSeatIds.size) {
        event.preventDefault();
        this.deleteSelection();
      }
      return;
    }
    if (key === 'escape') {
      this.closeMenus();
      this.select(null);
      return this.selectSeats([]);
    }
    if (key === 'v') return this.setTool('select');
    if (key === 'h') return this.setTool('pan');
    if (key === 'm') return this.setTool('marquee');
    const arrows = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] };
    if (arrows[key] && this.selected) {
      event.preventDefault();
      const [dx, dy] = arrows[key].map((v) => v * (event.shiftKey ? 10 : 1));
      const target = this.selected.type === 'stage' ? this.data.stage : this.getSection(this.selected.id);
      if (!target || target.locked) return;
      if (this.selected.type === 'stage') this.setStage({ x: target.x + dx, y: target.y + dy });
      else this.updateSection(target.id, { x: target.x + dx, y: target.y + dy });
    }
  };

  /* ------------------------------------------------------------------ panels */

  Builder.prototype.updatePanels = function () {
    if (!this.el) return;
    this.container
      .querySelectorAll('.deb-tab')
      .forEach((tab) => tab.classList.toggle('active', Number(tab.dataset.step) === this.step));
    const html =
      this.step === 1 ? this.sectionsTab() : this.step === 2 ? this.seatsTab() : this.configTab();
    this.captureDraft();
    const scroll = this.el.panel.scrollTop;
    const openStage = this.container.querySelector('.deb-stage-details');
    const stageOpen =
      (openStage && openStage.open) || (this.selected && this.selected.type === 'stage');
    const openAdvanced = this.container.querySelector('.deb-advanced');
    const advancedOpen = openAdvanced && openAdvanced.open;
    this.el.panel.innerHTML = html;
    const stageDetails = this.el.panel.querySelector('.deb-stage-details');
    if (stageDetails && stageOpen) stageDetails.open = true;
    const advanced = this.el.panel.querySelector('.deb-advanced');
    if (advanced && advancedOpen) advanced.open = true;
    this.el.panel.scrollTop = scroll;
  };

  /** Remember unsaved form values so canvas edits do not wipe what the user typed. */
  Builder.prototype.captureDraft = function () {
    if (!this.draftDirty || !this.el.panel.querySelector('[data-form]')) return;
    const raw = {};
    this.el.panel
      .querySelectorAll('[data-draft]')
      .forEach((el) => (raw[el.dataset.draft] = el.type === 'checkbox' ? el.checked : el.value));
    this.savedDraft = { id: this.formSectionId, raw };
  };
  /** Scroll only the side panel (never the host page) so `el` is visible. */
  Builder.prototype.scrollPanelTo = function (el) {
    const panel = this.el.panel,
      box = panel.getBoundingClientRect(),
      r = el.getBoundingClientRect();
    if (r.top < box.top || r.bottom > box.bottom)
      panel.scrollTo({ top: panel.scrollTop + r.top - box.top - 60, behavior: 'smooth' });
  };
  Builder.prototype.focusForm = function () {
    requestAnimationFrame(() => {
      const input =
        this.selected && this.selected.type === 'stage'
          ? this.el.panel.querySelector('[data-stage="label"]')
          : this.el.panel.querySelector('[data-draft="name"]');
      if (input) {
        this.scrollPanelTo(input);
        input.focus({ preventScroll: true });
      }
    });
  };

  /** Form values for the section being edited, or defaults for a new one. */
  Builder.prototype.draftFor = function (id) {
    const section = id === NEW ? null : this.getSection(id);
    const reserved = this.reservedTickets();
    if (section) {
      const ticket = this.data.ticketTypes.find((t) => t.id === section.ticketTypeId) || reserved[0] || {};
      return {
        name: section.name,
        counts: section.rows.map((r) => r.seats.length),
        ticketTypeId: ticket.id || '',
        price: ticket.price || 0,
        ...presaleOf(ticket),
        color: section.color || this.ticketColor(ticket),
        shape: section.shape || 'rectangle',
        seatSize: section.seatSize,
        seatSpacing: section.seatSpacing,
        rowSpacing: section.rowSpacing,
        alignment: section.alignment || 'center',
        curvature: (section.rows[0] && section.rows[0].curvature) || section.curvature || 0,
        innerRadius: L.innerRadius(section),
      };
    }
    const ticket = reserved[this.data.sections.length % Math.max(1, reserved.length)] || {};
    return {
      name: `Sección ${this.data.sections.length + 1}`,
      counts: [10, 10, 10, 10, 10],
      ticketTypeId: ticket.id || '',
      price: ticket.price || 0,
      ...presaleOf(ticket),
      color: this.ticketColor(ticket),
      shape: 'rectangle',
      seatSize: 24,
      seatSpacing: 34,
      rowSpacing: 34,
      alignment: 'center',
      curvature: 0,
      innerRadius: 150,
    };
  };

  Builder.prototype.configTab = function () {
    const d = this.data,
      bg = d.background || {};
    const formId = this.formSectionId === NEW || this.getSection(this.formSectionId) ? this.formSectionId : NEW;
    this.formSectionId = formId;
    const draft = this.draftFor(formId);
    if (this.draftDirty && this.savedDraft && this.savedDraft.id === formId) {
      const raw = this.savedDraft.raw;
      const counts = this.parseCounts(raw.counts).filter((n) => Number.isInteger(n) && n > 0);
      Object.assign(draft, {
        name: raw.name,
        counts: counts.length ? counts : draft.counts,
        ticketTypeId: raw.ticketTypeId || draft.ticketTypeId,
        price: Number(raw.price) || 0,
        presaleEnabled: !!raw.presaleEnabled,
        presalePrice: raw.presalePrice,
        presaleEndsAt: raw.presaleEndsAt,
        color: raw.color || draft.color,
        shape: raw.shape || draft.shape,
        alignment: raw.alignment || draft.alignment,
        seatSize: raw.seatSize || draft.seatSize,
        seatSpacing: raw.seatSpacing || draft.seatSpacing,
        rowSpacing: raw.rowSpacing || draft.rowSpacing,
        curvature: raw.curvature || draft.curvature,
        innerRadius: raw.innerRadius || draft.innerRadius,
      });
    } else this.draftDirty = false;
    const reserved = this.reservedTickets();
    const capacity = draft.counts.reduce((n, c) => n + c, 0);
    const sectionOptions =
      d.sections
        .map(
          (s) =>
            `<option value="${U.escape(s.id)}" ${s.id === formId ? 'selected' : ''}>${U.escape(s.name)}</option>`,
        )
        .join('') + `<option value="${NEW}" ${formId === NEW ? 'selected' : ''}>＋ Nueva sección</option>`;
    const ticketOptions = reserved
      .map(
        (t) =>
          `<option value="${U.escape(t.id)}" ${t.id === draft.ticketTypeId ? 'selected' : ''}>${U.escape(t.name)}</option>`,
      )
      .join('');
    const opt = (list, value) =>
      list.map(([v, l]) => `<option value="${v}" ${v === value ? 'selected' : ''}>${l}</option>`).join('');
    const stage = d.stage;
    const upload = bg.src
      ? `<div class="deb-bg-preview"><img src="${U.escape(bg.src)}" alt=""><div>
           <label class="deb-label">Opacidad <output>${Math.round((bg.opacity ?? 0.35) * 100)}%</output>
             <input type="range" min="0.05" max="1" step="0.05" data-bg="opacity" value="${bg.opacity ?? 0.35}"></label>
           <div class="deb-row-btns">
             <button type="button" class="deb-btn deb-btn-sm" data-action="fit"><i class="fa-solid fa-expand"></i> Ajustar al plano</button>
             <label class="deb-btn deb-btn-sm">Cambiar<input type="file" hidden accept="image/png,image/jpeg,image/webp" data-bg-file></label>
             <button type="button" class="deb-btn deb-btn-sm deb-btn-danger" data-action="remove-background"><i class="fa-solid fa-xmark"></i> Quitar</button>
           </div></div></div>`
      : `<label class="deb-upload"><i class="fa-solid fa-arrow-up-from-bracket"></i><b>Cargar mapa</b><small>PNG, JPG o WEBP (máx. 10 MB)</small>
           <input type="file" hidden accept="image/png,image/jpeg,image/webp" data-bg-file></label>`;
    const stageForm = stage
      ? `<div class="deb-grid">
           <label class="deb-label deb-wide">Etiqueta<input class="deb-input" data-stage="label" value="${U.escape(stage.label)}"></label>
           <label class="deb-label">Forma<select class="deb-input" data-stage="shape">${opt(
             [['rectangle', 'Rectangular'], ['trapezoid', 'Trapezoidal'], ['semicircle', 'Semicircular'], ['square', 'Cuadrado'], ['circle', 'Circular']],
             stage.shape,
           )}</select></label>
           <label class="deb-label">Color<input class="deb-input deb-color" type="color" data-stage="color" value="${U.escape(stage.color || '#334155')}"></label>
           <label class="deb-label">Ancho<input class="deb-input" type="number" min="40" data-stage="width" value="${stage.width}"></label>
           <label class="deb-label">Alto<input class="deb-input" type="number" min="20" data-stage="height" value="${stage.height}"></label>
           <label class="deb-label">Rotación (°)<input class="deb-input" type="number" step="1" data-stage="rotation" value="${stage.rotation || 0}"></label>
           <label class="deb-check"><input type="checkbox" data-stage="locked" ${stage.locked ? 'checked' : ''}> Bloquear posición</label>
         </div>
         <div class="deb-row-btns">
           <button type="button" class="deb-btn deb-btn-sm" data-action="center-stage"><i class="fa-solid fa-arrows-left-right-to-line"></i> Centrar</button>
           <button type="button" class="deb-btn deb-btn-sm deb-btn-danger" data-action="remove-stage"><i class="fa-regular fa-trash-can"></i> Quitar escenario</button>
         </div>`
      : `<p class="deb-hint">Opcional: frente al público, al centro (estadio) o sin escenario (avión).</p>
         <button type="button" class="deb-btn deb-btn-sm" data-action="add-stage"><i class="fa-solid fa-plus"></i> Agregar escenario</button>`;
    return `
      <h3 class="deb-h"><i class="fa-regular fa-image"></i> Mapa del recinto</h3>
      <p class="deb-label-title">Cargar mapa (opcional)</p>
      <p class="deb-hint">Usa una imagen del recinto como referencia (planta, distribución, etc.).</p>
      ${upload}
      <hr>
      <h3 class="deb-h"><i class="fa-solid fa-couch"></i> ${formId === NEW ? 'Crear sección' : 'Crear / Editar sección'}</h3>
      <div class="deb-form" data-form>
        <label class="deb-label">Sección seleccionada<select class="deb-input" data-form-section>${sectionOptions}</select></label>
        <label class="deb-label">Nombre<input class="deb-input" data-draft="name" maxlength="60" value="${U.escape(draft.name)}"></label>
        <div class="deb-grid deb-grid-rows">
          <label class="deb-label">Filas<input class="deb-input" type="number" min="1" max="100" data-draft="rows" value="${draft.counts.length}"></label>
          <label class="deb-label"><span>Asientos por fila <i class="fa-solid fa-circle-info" title="Cantidad de asientos de cada fila, de la primera a la última."></i></span>
            <input class="deb-input" data-draft="counts" value="${draft.counts.join(', ')}" inputmode="numeric"></label>
        </div>
        <p class="deb-hint deb-hint-sm">Separa con comas la cantidad de asientos de cada fila (ej. 8, 9, 8, 7).</p>
        <div class="deb-grid">
          <label class="deb-label">Tipo de boleto${
            reserved.length
              ? `<select class="deb-input" data-draft="ticketTypeId">${ticketOptions}</select>`
              : '<span class="deb-warning">No hay boletos con asiento reservado en el JSON.</span>'
          }</label>
          <label class="deb-label">Capacidad (asientos)<input class="deb-input" data-capacity readonly value="${capacity}"></label>
          <label class="deb-label">Precio<span class="deb-prefix"><b>$</b><input class="deb-input" type="number" min="0" step="0.01" data-draft="price" value="${Number(draft.price).toFixed(2)}"></span></label>
          <label class="deb-label">Color<input class="deb-input deb-color" type="color" data-draft="color" value="${U.escape(draft.color)}"></label>
        </div>
        <label class="deb-check deb-presale-toggle"><input type="checkbox" data-draft="presaleEnabled" ${draft.presaleEnabled ? 'checked' : ''}> Precio de preventa <small>(opcional)</small></label>
        <div class="deb-grid deb-presale" data-presale-fields ${draft.presaleEnabled ? '' : 'hidden'}>
          <label class="deb-label">Precio preventa<span class="deb-prefix"><b>$</b><input class="deb-input" type="number" min="0" step="0.01" data-draft="presalePrice" value="${draft.presalePrice === '' ? '' : Number(draft.presalePrice).toFixed(2)}" placeholder="0.00"></span></label>
          <label class="deb-label">Válido hasta<input class="deb-input" type="datetime-local" data-draft="presaleEndsAt" value="${U.escape(draft.presaleEndsAt)}"></label>
          <p class="deb-hint deb-hint-sm deb-wide" data-presale-status>${this.presaleStatus(draft)}</p>
        </div>
        <p class="deb-hint deb-hint-sm">Los precios pertenecen al tipo de boleto: se aplican a todas sus secciones.</p>
        <details class="deb-advanced">
          <summary>Forma y espaciado</summary>
          <div class="deb-grid">
            <label class="deb-label">Forma<select class="deb-input" data-draft="shape">${opt(SHAPES, draft.shape)}</select></label>
            <label class="deb-label">Alineación<select class="deb-input" data-draft="alignment">${opt(
              [['center', 'Centrada'], ['left', 'Izquierda'], ['right', 'Derecha']],
              draft.alignment,
            )}</select></label>
            <label class="deb-label">Tamaño de asiento<input class="deb-input" type="number" min="12" max="60" data-draft="seatSize" value="${draft.seatSize}"></label>
            <label class="deb-label">Separación asientos<input class="deb-input" type="number" min="14" max="120" data-draft="seatSpacing" value="${draft.seatSpacing}"></label>
            <label class="deb-label">Separación filas<input class="deb-input" type="number" min="14" max="160" data-draft="rowSpacing" value="${draft.rowSpacing}"></label>
            <label class="deb-label">Curvatura<input class="deb-input" type="number" min="-80" max="80" data-draft="curvature" value="${draft.curvature}"></label>
            <label class="deb-label">Radio interior <small>(anillo / mesa)</small><input class="deb-input" type="number" min="20" max="1500" data-draft="innerRadius" value="${draft.innerRadius}"></label>
          </div>
        </details>
        <button type="button" class="deb-apply" data-action="apply-section" ${reserved.length ? '' : 'disabled'}>
          <i class="fa-solid fa-couch"></i> ${formId === NEW ? 'Crear sección' : 'Aplicar cambios a la sección'}</button>
      </div>
      <hr>
      <details class="deb-stage-details">
        <summary><h3 class="deb-h"><i class="fa-solid fa-masks-theater"></i> Escenario <small>Opcional</small></h3></summary>
        ${stageForm}
      </details>`;
  };

  Builder.prototype.sectionsTab = function () {
    const list = this.data.sections
      .map((s) => {
        const ticket = this.data.ticketTypes.find((t) => t.id === s.ticketTypeId);
        const active = this.selected && this.selected.type === 'section' && this.selected.id === s.id;
        return `<article class="deb-card ${active ? 'active' : ''} ${s.visible === false ? 'muted' : ''}">
          <button type="button" class="deb-card-main" data-action="select-section" data-id="${U.escape(s.id)}">
            <i style="--c:${U.escape(s.color || this.ticketColor(ticket))}"></i>
            <span><strong>${U.escape(s.name)}</strong><small>${ticket ? U.escape(ticket.name) + ' · ' : ''}${s.rows.length} filas · ${seatsOf(s)} asientos</small></span>
          </button>
          <div class="deb-card-actions">
            <button type="button" data-action="toggle-visible" data-id="${U.escape(s.id)}" title="${s.visible === false ? 'Mostrar' : 'Ocultar'}"><i class="fa-regular ${s.visible === false ? 'fa-eye-slash' : 'fa-eye'}"></i></button>
            <button type="button" data-action="toggle-lock" data-id="${U.escape(s.id)}" title="${s.locked ? 'Desbloquear' : 'Bloquear'}"><i class="fa-solid ${s.locked ? 'fa-lock' : 'fa-lock-open'}"></i></button>
            <button type="button" data-action="edit-section" data-id="${U.escape(s.id)}" title="Configurar"><i class="fa-solid fa-gear"></i></button>
            <button type="button" data-action="duplicate" data-id="${U.escape(s.id)}" title="Duplicar"><i class="fa-regular fa-copy"></i></button>
            <button type="button" data-action="remove-section" data-id="${U.escape(s.id)}" title="Eliminar"><i class="fa-regular fa-trash-can"></i></button>
          </div>
        </article>`;
      })
      .join('');
    return `<div class="deb-panel-head"><h3 class="deb-h">Secciones</h3>
        <button type="button" class="deb-btn deb-btn-sm deb-btn-primary" data-action="new-section"><i class="fa-solid fa-plus"></i> Nueva</button></div>
      <p class="deb-hint">Haz clic en una sección para seleccionarla en el mapa.</p>
      <div class="deb-list">${list || '<div class="deb-empty">Aún no hay secciones. Crea la primera para comenzar.</div>'}</div>`;
  };

  Builder.prototype.seatsTab = function () {
    const ids = [...this.selectedSeatIds];
    const head = `<div class="deb-panel-head"><h3 class="deb-h">Asientos</h3><span class="deb-pill">${ids.length} seleccionados</span></div>`;
    if (!ids.length)
      return `${head}<div class="deb-empty"><i class="fa-solid fa-hand-pointer"></i><br>Selecciona asientos en el mapa para editarlos.</div>
        <ul class="deb-tips"><li><b>Clic</b> selecciona un asiento.</li><li><b>Shift + clic</b> suma o quita asientos.</li>
        <li>La herramienta <i class="fa-solid fa-table-cells"></i> selecciona con un recuadro.</li><li>Arrastra un asiento seleccionado para mover el grupo.</li></ul>`;
    const found = ids.map((id) => U.findSeat(this.data, id)).filter(Boolean);
    const statuses = new Set(found.map((f) => (f.seat.accessible ? 'accessible' : f.seat.status || 'available')));
    const status = statuses.size === 1 ? [...statuses][0] : '';
    const single = found.length === 1 ? found[0] : null;
    const manual = found.some((f) => f.seat.manualPosition);
    const sections = new Set(found.map((f) => f.section.name));
    return `${head}
      <p class="deb-hint">${[...sections].map(U.escape).join(', ')}${single ? ` · Fila ${U.escape(single.row.label)}` : ''}</p>
      ${
        single
          ? `<div class="deb-grid">
          <label class="deb-label">Etiqueta<input class="deb-input" data-seat="label" value="${U.escape(single.seat.label)}"></label>
          <label class="deb-label">Número<input class="deb-input" data-seat="number" value="${U.escape(single.seat.number)}"></label></div>`
          : ''
      }
      <label class="deb-label">Estado<select class="deb-input" data-seat="status">
        ${status ? '' : '<option value="" selected>Varios estados</option>'}
        ${STATUSES.map(([v, l]) => `<option value="${v}" ${v === status ? 'selected' : ''}>${l}</option>`).join('')}
      </select></label>
      <div class="deb-row-btns">
        ${single ? '<button type="button" class="deb-btn deb-btn-sm" data-action="select-row"><i class="fa-solid fa-grip-lines"></i> Seleccionar fila</button>' : ''}
        ${manual ? '<button type="button" class="deb-btn deb-btn-sm" data-action="reset-seat-position"><i class="fa-solid fa-arrows-rotate"></i> Restablecer posición</button>' : ''}
        <button type="button" class="deb-btn deb-btn-sm" data-action="clear-seats">Limpiar selección</button>
        <button type="button" class="deb-btn deb-btn-sm deb-btn-danger" data-action="delete-seats"><i class="fa-regular fa-trash-can"></i> Eliminar</button>
      </div>
      <p class="deb-hint deb-hint-sm">Arrastra cualquiera de los asientos seleccionados para mover el grupo.</p>`;
  };

  /** Live form updates that do not touch the model until "Aplicar". */
  Builder.prototype.onPanelInput = function (event) {
    const el = event.target;
    const field = el.dataset.draft;
    if (field) this.draftDirty = true;
    if (!field) {
      if (el.dataset.bg === 'opacity') {
        const out = el.parentElement.querySelector('output');
        if (out) out.textContent = Math.round(el.value * 100) + '%';
      }
      return;
    }
    const form = this.el.panel;
    const countsInput = form.querySelector('[data-draft="counts"]'),
      rowsInput = form.querySelector('[data-draft="rows"]');
    if (field === 'rows') {
      const rows = Math.max(1, Math.min(100, parseInt(el.value, 10) || 0));
      if (!parseInt(el.value, 10)) return;
      const counts = this.parseCounts(countsInput.value).filter((n) => n > 0);
      const last = counts[counts.length - 1] || 10;
      while (counts.length < rows) counts.push(last);
      countsInput.value = counts.slice(0, rows).join(', ');
    }
    if (field === 'counts') {
      const counts = this.parseCounts(el.value).filter((n) => Number.isFinite(n));
      if (counts.length) rowsInput.value = counts.length;
    }
    if (field === 'rows' || field === 'counts') {
      const total = this.parseCounts(countsInput.value)
        .filter((n) => Number.isInteger(n) && n > 0)
        .reduce((a, b) => a + b, 0);
      form.querySelector('[data-capacity]').value = total;
    }
  };
  Builder.prototype.parseCounts = function (value) {
    return String(value || '')
      .split(/[,;\s]+/)
      .filter(Boolean)
      .map((v) => Number(v));
  };

  Builder.prototype.onPanelChange = function (event) {
    const el = event.target;
    if (el.matches('[data-form-section]')) {
      this.draftDirty = false;
      this.formSectionId = el.value;
      if (el.value === NEW) {
        this.select(null);
        this.focusForm();
      } else this.select({ type: 'section', id: el.value });
      return;
    }
    if (el.dataset.draft) this.draftDirty = true;
    if (el.dataset.draft === 'presaleEnabled') {
      const fields = this.el.panel.querySelector('[data-presale-fields]');
      fields.hidden = !el.checked;
      if (el.checked) {
        const end = fields.querySelector('[data-draft="presaleEndsAt"]');
        if (!end.value) {
          const d = new Date();
          d.setDate(d.getDate() + 14);
          d.setHours(23, 59, 0, 0);
          end.value = toLocalInput(d.toISOString());
        }
        fields.querySelector('[data-draft="presalePrice"]').focus();
      }
      this.refreshPresaleStatus();
      return;
    }
    if (el.dataset.draft === 'presaleEndsAt' || el.dataset.draft === 'presalePrice') {
      this.refreshPresaleStatus();
      return;
    }
    if (el.dataset.draft === 'ticketTypeId') {
      const ticket = this.data.ticketTypes.find((t) => t.id === el.value);
      if (ticket) {
        const p = this.el.panel;
        p.querySelector('[data-draft="price"]').value = Number(ticket.price || 0).toFixed(2);
        p.querySelector('[data-draft="color"]').value = this.ticketColor(ticket);
        const pre = presaleOf(ticket);
        p.querySelector('[data-draft="presaleEnabled"]').checked = pre.presaleEnabled;
        p.querySelector('[data-presale-fields]').hidden = !pre.presaleEnabled;
        p.querySelector('[data-draft="presalePrice"]').value =
          pre.presalePrice === '' ? '' : Number(pre.presalePrice).toFixed(2);
        p.querySelector('[data-draft="presaleEndsAt"]').value = pre.presaleEndsAt;
        this.refreshPresaleStatus();
      }
      return;
    }
    if (el.matches('[data-bg-file]')) return this.loadBackground(el.files[0]);
    if (el.dataset.bg === 'opacity') return this.setBackground({ opacity: +el.value });
    if (el.dataset.stage) {
      const key = el.dataset.stage;
      let value = el.type === 'checkbox' ? el.checked : el.value;
      if (['width', 'height', 'rotation'].includes(key)) {
        value = Number(value);
        if (!Number.isFinite(value)) return;
        if (key === 'width') value = Math.max(40, value);
        if (key === 'height') value = Math.max(20, value);
      }
      if (key === 'label') value = U.text(value) || 'ESCENARIO';
      return this.setStage({ [key]: value });
    }
    if (el.dataset.seat) {
      const ids = [...this.selectedSeatIds];
      const key = el.dataset.seat;
      if (key === 'status') {
        if (!el.value) return;
        return this.updateSeats(ids, { status: el.value, accessible: el.value === 'accessible' });
      }
      const value = U.text(el.value);
      if (!value) return;
      if (key === 'number') {
        const found = U.findSeat(this.data, ids[0]);
        const clash = found && found.row.seats.some((s) => s.id !== ids[0] && String(s.number) === value);
        if (clash) {
          this.toast('Ya existe ese número en la fila.', 'warning');
          el.value = found.seat.number;
          return;
        }
        return this.updateSeat(ids[0], { number: /^\d+$/.test(value) ? Number(value) : value });
      }
      return this.updateSeat(ids[0], { label: value });
    }
  };

  /* --------------------------------------------------------------- sections */

  Builder.prototype.readDraft = function () {
    const p = this.el.panel;
    const val = (k) => {
      const el = p.querySelector(`[data-draft="${k}"]`);
      return el ? el.value : '';
    };
    const counts = this.parseCounts(val('counts'));
    const errors = [];
    const name = U.text(val('name'));
    if (!name) errors.push('Escribe un nombre para la sección.');
    if (!counts.length || counts.some((n) => !Number.isInteger(n) || n < 1 || n > 200))
      errors.push('Cada fila debe tener entre 1 y 200 asientos (números enteros).');
    if (counts.length > 100) errors.push('Máximo 100 filas por sección.');
    const price = Number(val('price'));
    if (!Number.isFinite(price) || price < 0) errors.push('El precio debe ser un número mayor o igual a 0.');
    const presaleBox = p.querySelector('[data-draft="presaleEnabled"]');
    const presaleEnabled = !!(presaleBox && presaleBox.checked);
    let presalePrice = null,
      presaleEndsAt = null;
    if (presaleEnabled) {
      presalePrice = val('presalePrice') === '' ? NaN : Number(val('presalePrice'));
      const end = Date.parse(val('presaleEndsAt'));
      if (!Number.isFinite(presalePrice) || presalePrice < 0)
        errors.push('Indica el precio de preventa (número mayor o igual a 0).');
      else if (Number.isFinite(price) && presalePrice > price)
        errors.push('La preventa no puede costar más que el precio normal.');
      if (!Number.isFinite(end)) errors.push('Indica hasta qué fecha es válida la preventa.');
      else presaleEndsAt = new Date(end).toISOString();
    }
    const ticketTypeId = val('ticketTypeId');
    if (!this.reservedTickets().some((t) => t.id === ticketTypeId))
      errors.push('Elige un tipo de boleto con asiento reservado.');
    const num = (k, min, max, fallback) => {
      const n = Number(val(k));
      return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
    };
    return {
      errors,
      value: {
        name,
        counts,
        price,
        presaleEnabled,
        presalePrice,
        presaleEndsAt,
        ticketTypeId,
        color: val('color') || '#7C3AED',
        shape: val('shape') || 'rectangle',
        alignment: val('alignment') || 'center',
        seatSize: num('seatSize', 12, 60, 24),
        seatSpacing: num('seatSpacing', 14, 120, 34),
        rowSpacing: num('rowSpacing', 14, 160, 34),
        curvature: num('curvature', -80, 80, 0),
        innerRadius: num('innerRadius', 20, 1500, 150),
      },
    };
  };

  Builder.prototype.applySectionForm = function () {
    const { errors, value } = this.readDraft();
    if (errors.length) {
      this.toast(errors[0], 'warning');
      return false;
    }
    if (value.seatSpacing < value.seatSize + 2) value.seatSpacing = value.seatSize + 4;
    this.draftDirty = false;
    const id = this.formSectionId;
    if (id === NEW || !this.getSection(id)) {
      const section = this.buildSection(value);
      this.mutate(() => {
        this.applyPrice(value);
        this.data.sections.push(section);
      });
      this.select({ type: 'section', id: section.id });
      this.toast('Sección creada', 'success');
      return section;
    }
    this.mutate(() => {
      this.applyPrice(value);
      this.reshapeSection(this.getSection(id), value);
    });
    this.toast('Cambios aplicados', 'success');
    return this.getSection(id);
  };
  Builder.prototype.applyPrice = function (value) {
    const ticket = this.data.ticketTypes.find((t) => t.id === value.ticketTypeId);
    if (!ticket) return;
    ticket.price = value.price;
    // Only touch presale when the form carried it (quick sections keep the ticket as is).
    if (!('presaleEnabled' in value)) return;
    ticket.presalePrice = value.presaleEnabled ? value.presalePrice : null;
    ticket.presaleEndsAt = value.presaleEnabled ? value.presaleEndsAt : null;
  };
  /** Text under the presale inputs: active until…, or already ended. */
  Builder.prototype.presaleStatus = function (draft) {
    if (!draft.presaleEnabled) return '';
    const end = Date.parse(draft.presaleEndsAt);
    if (!Number.isFinite(end)) return 'Elige la fecha en que termina la preventa.';
    const date = U.formatDate(end, this.options.locale);
    return end >= Date.now()
      ? `<i class="fa-solid fa-circle-check"></i> Activa: los compradores pagan el precio de preventa hasta el ${U.escape(date)}; después, el precio normal.`
      : `<i class="fa-solid fa-clock"></i> Terminó el ${U.escape(date)}: se cobra el precio normal.`;
  };
  Builder.prototype.refreshPresaleStatus = function () {
    const p = this.el.panel,
      status = p.querySelector('[data-presale-status]');
    if (!status) return;
    status.innerHTML = this.presaleStatus({
      presaleEnabled: p.querySelector('[data-draft="presaleEnabled"]').checked,
      presaleEndsAt: p.querySelector('[data-draft="presaleEndsAt"]').value,
    });
  };

  /** Next free row letter across the whole map, so rows read A, B, C… top to bottom. */
  Builder.prototype.nextRowIndex = function () {
    return this.data.sections.reduce((n, s) => n + s.rows.length, 0);
  };
  Builder.prototype.makeSeat = function (rowLabel, number) {
    return {
      id: U.id('seat'),
      number,
      label: `${rowLabel}${number}`,
      x: 0,
      y: 0,
      rotation: 0,
      status: 'available',
      accessible: false,
      manualPosition: false,
      metadata: {},
    };
  };
  Builder.prototype.makeRow = function (label, index, value, count) {
    return {
      id: U.id('row'),
      label,
      x: 0,
      y: index * value.rowSpacing,
      rotation: 0,
      seatCount: count,
      numberStart: 1,
      numberDirection: 'asc',
      alignment: value.alignment,
      curvature: value.curvature,
      seats: Array.from({ length: count }, (_, j) => this.makeSeat(label, j + 1)),
    };
  };
  /** Place a new section under everything already drawn, centered on the canvas. */
  Builder.prototype.freeSpot = function (section) {
    const c = this.data.canvas;
    let bottom = 80;
    if (this.renderer && (this.data.sections.length || this.data.stage)) {
      const b = this.renderer.contentBounds();
      bottom = b.y + b.height;
    }
    // Measure the new section's own seat extents (semicircles rise above their origin).
    let minY = 0,
      maxY = 0;
    section.rows.forEach((row) =>
      L.distribute(row, section).forEach((seat) => {
        minY = Math.min(minY, seat.y + row.y);
        maxY = Math.max(maxY, seat.y + row.y);
      }),
    );
    const y = Math.round(bottom + 70 - minY);
    if (y + maxY + 80 > c.height) c.height = Math.ceil((y + maxY + 100) / 100) * 100;
    return { x: Math.round(c.width / 2), y };
  };
  Builder.prototype.buildSection = function (value) {
    const start = this.nextRowIndex();
    const section = {
      id: U.id('section'),
      name: value.name,
      description: '',
      ticketTypeId: value.ticketTypeId,
      color: value.color,
      shape: value.shape,
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      seatSize: value.seatSize,
      seatSpacing: value.seatSpacing,
      rowSpacing: value.rowSpacing,
      alignment: value.alignment,
      curvature: value.curvature,
      ...(L.CIRCULAR.includes(value.shape) ? { innerRadius: value.innerRadius } : {}),
      visible: true,
      locked: false,
      rows: value.counts.map((count, i) => this.makeRow(U.alphaLabel(start + i), i, value, count)),
    };
    Object.assign(section, this.freeSpot(section));
    return section;
  };
  /** Apply form values to an existing section, keeping ids of seats that remain. */
  Builder.prototype.reshapeSection = function (section, value) {
    const layoutChanged =
      section.shape !== value.shape ||
      section.alignment !== value.alignment ||
      Number(section.seatSpacing) !== value.seatSpacing ||
      Number(section.innerRadius) !== value.innerRadius;
    Object.assign(section, {
      name: value.name,
      color: value.color,
      ticketTypeId: value.ticketTypeId,
      shape: value.shape,
      alignment: value.alignment,
      seatSize: value.seatSize,
      seatSpacing: value.seatSpacing,
      rowSpacing: value.rowSpacing,
      curvature: value.curvature,
    });
    if (L.CIRCULAR.includes(value.shape)) section.innerRadius = value.innerRadius;
    // New rows continue after the section's last letter, skipping labels used elsewhere in the map.
    const usedLabels = new Set();
    this.data.sections.forEach((s) => s.rows.forEach((r) => usedLabels.add(String(r.label))));
    const nextLabel = () => {
      const last = section.rows[section.rows.length - 1];
      let n = 0;
      if (last && /^[A-Z]+$/.test(last.label))
        for (const ch of last.label) n = n * 26 + (ch.charCodeAt(0) - 64);
      let label = U.alphaLabel(n);
      while (usedLabels.has(label)) label = U.alphaLabel(++n);
      usedLabels.add(label);
      return label;
    };
    value.counts.forEach((count, i) => {
      if (!section.rows[i]) section.rows.push(this.makeRow(nextLabel(), i, value, 0));
      const row = section.rows[i];
      row.y = i * value.rowSpacing;
      row.alignment = value.alignment;
      row.curvature = value.curvature;
      const used = new Set(row.seats.map((s) => String(s.number)));
      let number = row.seats.reduce((m, s) => Math.max(m, Number(s.number) || 0), 0);
      while (row.seats.length < count) {
        do number++;
        while (used.has(String(number)));
        row.seats.push(this.makeSeat(row.label, number));
      }
      row.seats = row.seats.slice(0, count);
      if (layoutChanged) row.seats.forEach((s) => (s.manualPosition = false));
    });
    section.rows = section.rows.slice(0, value.counts.length);
  };

  Builder.prototype.quickSection = function (shape) {
    const ticket = this.reservedTickets()[this.data.sections.length % Math.max(1, this.reservedTickets().length)];
    if (!ticket) return this.toast('No hay boletos con asiento reservado en el JSON.', 'warning');
    const presets = {
      rectangle: [10, 10, 10, 10, 10],
      square: [8, 8, 8, 8, 8, 8, 8, 8],
      trapezoid: [8, 10, 12, 14, 16],
      semicircle: [10, 12, 14, 16],
      circle: [6, 10, 12, 12, 10, 6],
      ring: [30, 36],
      table: [6],
    };
    const value = Object.assign(this.draftFor(NEW), {
      name: `${SHAPES.find((s) => s[0] === shape)[1]} ${this.data.sections.length + 1}`,
      shape,
      counts: presets[shape] || presets.rectangle,
      ticketTypeId: ticket.id,
      price: ticket.price,
      color: this.ticketColor(ticket),
      innerRadius: shape === 'table' ? 44 : 170,
      rowSpacing: shape === 'ring' ? 32 : 34,
    });
    const section = this.buildSection(value);
    this.addSection(section);
    this.select({ type: 'section', id: section.id });
    this.goToStep(0);
    return section;
  };

  /* ----------------------------------------------------------- mutations */

  Builder.prototype.mutate = function (fn) {
    this.history.push(this.data);
    fn();
    this.afterChange();
  };
  Builder.prototype.afterChange = function () {
    this.data = L.sync(this.data);
    this.selectedSeatIds = new Set([...this.selectedSeatIds].filter((id) => U.findSeat(this.data, id)));
    if (this.selected && this.selected.type === 'section' && !this.getSection(this.selected.id)) this.selected = null;
    if (this.selected && this.selected.type === 'stage' && !this.data.stage) this.selected = null;
    this.drawCanvas();
    this.refreshChrome();
    this.updatePanels();
    U.emit(this.callbacks, 'onChange', this.getData());
  };

  Builder.prototype.addSection = function (d) {
    const section = U.clone(d);
    if (!section.id) section.id = U.id('section');
    if (!section.ticketTypeId) section.ticketTypeId = (this.reservedTickets()[0] || {}).id;
    this.mutate(() => this.data.sections.push(S.normalize({ sections: [section] }).sections[0]));
    return this;
  };
  Builder.prototype.updateSection = function (id, d) {
    const section = this.getSection(id);
    if (section) this.mutate(() => Object.assign(section, U.clone(d)));
    return this;
  };
  Builder.prototype.editSection = function (id) {
    if (!this.getSection(id)) return this;
    this.select({ type: 'section', id });
    this.goToStep(0);
    this.focusForm();
    return this;
  };
  Builder.prototype.duplicateSection = function (id) {
    const s = this.getSection(id);
    if (!s) return null;
    const copy = U.clone(s);
    copy.id = U.id('section');
    copy.name = `${s.name} (copia)`;
    copy.x += 60;
    copy.y += 60;
    copy.locked = false;
    copy.rows.forEach((r) => {
      r.id = U.id('row');
      r.seats.forEach((seat) => (seat.id = U.id('seat')));
    });
    this.mutate(() => this.data.sections.push(copy));
    this.select({ type: 'section', id: copy.id });
    return copy;
  };
  Builder.prototype.removeSection = async function (id, opts = {}) {
    const section = this.getSection(id);
    if (!section) return false;
    if (opts.confirm !== false) {
      const ok = await this.confirm(
        `¿Eliminar «${section.name}»?`,
        `Se eliminarán sus ${section.rows.length} filas y ${seatsOf(section)} asientos.`,
        'Eliminar sección',
      );
      if (!ok) return false;
    }
    this.mutate(() => (this.data.sections = this.data.sections.filter((item) => item.id !== id)));
    if (this.formSectionId === id) this.formSectionId = this.data.sections[0] ? this.data.sections[0].id : NEW;
    this.updatePanels();
    return true;
  };
  Builder.prototype.addRow = function (sectionId, d) {
    const section = this.getSection(sectionId);
    if (section) this.mutate(() => section.rows.push(U.clone(d)));
    return this;
  };
  Builder.prototype.updateRow = function (sectionId, rowId, d) {
    const row = this.getSection(sectionId)?.rows.find((r) => r.id === rowId);
    if (row) this.mutate(() => Object.assign(row, U.clone(d)));
    return this;
  };
  Builder.prototype.removeRow = function (sectionId, rowId) {
    const section = this.getSection(sectionId);
    if (section) this.mutate(() => (section.rows = section.rows.filter((r) => r.id !== rowId)));
    return this;
  };
  Builder.prototype.updateSeat = function (id, d) {
    return this.updateSeats([id], d);
  };
  Builder.prototype.updateSeats = function (ids, d) {
    const found = ids.map((id) => U.findSeat(this.data, id)).filter(Boolean);
    if (found.length) this.mutate(() => found.forEach((f) => Object.assign(f.seat, U.clone(d))));
    return this;
  };
  Builder.prototype.removeSeat = function (id) {
    return this.removeSeats([id]);
  };
  /** Delete seats (with confirmation); rows left empty are removed too. */
  Builder.prototype.removeSeats = async function (ids, opts = {}) {
    const set = new Set(ids);
    if (!set.size) return this;
    if (opts.confirm !== false) {
      const ok = await this.confirm(
        set.size === 1 ? '¿Quitar este asiento?' : `¿Quitar ${set.size} asientos?`,
        'Los asientos se eliminarán del mapa.',
        'Quitar',
      );
      if (!ok) return this;
    }
    this.mutate(() =>
      this.data.sections.forEach((section) => {
        section.rows.forEach((row) => (row.seats = row.seats.filter((seat) => !set.has(seat.id))));
        section.rows = section.rows.filter((row) => row.seats.length);
      }),
    );
    return this;
  };
  Builder.prototype.deleteSelection = function () {
    if (this.selectedSeatIds.size) return this.removeSeats([...this.selectedSeatIds]);
    if (!this.selected) return null;
    if (this.selected.type === 'stage') {
      return this.confirm('¿Quitar el escenario?', 'Podrás agregarlo de nuevo cuando quieras.', 'Quitar').then(
        (ok) => ok && this.setStage(null),
      );
    }
    return this.removeSection(this.selected.id);
  };
  Builder.prototype.setStage = function (d) {
    this.mutate(() => {
      if (d === null) {
        this.data.stage = null;
        return;
      }
      const c = this.data.canvas;
      this.data.stage = Object.assign(
        {
          id: U.id('stage'),
          label: 'ESCENARIO',
          shape: 'trapezoid',
          x: Math.round((c.width - 500) / 2),
          y: 40,
          width: 500,
          height: 90,
          rotation: 0,
          color: '#2E2E3A',
          visible: true,
          locked: false,
        },
        this.data.stage || {},
        U.clone(d),
      );
    });
    return this;
  };
  Builder.prototype.setBackground = function (d) {
    this.mutate(() => Object.assign(this.data.background, U.clone(d)));
    return this;
  };
  Builder.prototype.loadBackground = function (file) {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) return this.toast('Usa una imagen PNG, JPG o WEBP.', 'warning');
    if (file.size > 10 * 1024 * 1024) return this.toast('La imagen supera 10 MB.', 'warning');
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const c = this.data.canvas;
        // Keep the current canvas and scale the plan to cover it, preserving aspect ratio.
        const scale = Math.max(c.width / image.naturalWidth, c.height / image.naturalHeight);
        const width = Math.round(image.naturalWidth * scale),
          height = Math.round(image.naturalHeight * scale);
        this.setBackground({
          src: reader.result,
          x: Math.round((c.width - width) / 2),
          y: Math.round((c.height - height) / 2),
          width,
          height,
          visible: true,
        });
        this.renderer.fitToMap();
      };
      image.onerror = () => this.toast('No se pudo leer la imagen.', 'error');
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  /* --------------------------------------------------------------- dialogs */

  Builder.prototype.confirm = function (title, text, confirmButtonText) {
    if (!root.Swal) return Promise.resolve(root.confirm(`${title}\n${text}`));
    return root.Swal.fire({
      title,
      text,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText,
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#6D28D9',
      reverseButtons: true,
    }).then((r) => r.isConfirmed);
  };
  Builder.prototype.toast = function (msg, icon = 'info') {
    if (!root.Swal) return Promise.resolve();
    return root.Swal.fire({
      toast: true,
      position: 'bottom-end',
      icon,
      title: msg,
      showConfirmButton: false,
      timer: 2400,
      timerProgressBar: true,
    });
  };
  Builder.prototype.preview = function () {
    const json = this.getJSON();
    if (typeof this.callbacks.onPreview === 'function') return U.emit(this.callbacks, 'onPreview', json);
    if (!root.Swal || !root.DreamEventSeatSelector)
      return this.toast('Agrega el callback onPreview o carga el Selector para la vista previa.');
    let selector;
    root.Swal.fire({
      title: 'Vista previa del comprador',
      html: '<div class="deb-preview"></div>',
      width: 'min(1100px, 96vw)',
      showConfirmButton: false,
      showCloseButton: true,
      didOpen: (popup) => {
        selector = new root.DreamEventSeatSelector({
          container: popup.querySelector('.deb-preview'),
          data: this.getData(),
        });
      },
      willClose: () => selector && selector.destroy(),
    });
  };
  /* -------------------------------------------------------------- templates */

  /** Built-in templates plus `options.templates` ({ id, name, icon, description, build() | data }). */
  Builder.prototype.templateList = function () {
    if (this.options.templates === false) return [];
    const builtIn = (root.DreamEventTemplates && root.DreamEventTemplates.TEMPLATES) || [];
    const extra = Array.isArray(this.options.templates) ? this.options.templates : [];
    const byId = new Map();
    [...builtIn, ...extra].forEach((t) => t && t.id && byId.set(t.id, t));
    return [...byId.values()];
  };
  Builder.prototype.templateData = function (id) {
    const t = this.templateList().find((x) => x.id === id);
    if (!t) return null;
    return typeof t.build === 'function' ? t.build() : U.clone(t.data);
  };
  /** Replace the map with a template, keeping this event's id, name, currency and metadata. */
  Builder.prototype.loadTemplate = function (id) {
    const data = this.templateData(id);
    if (!data) return false;
    const keep = {
      eventId: this.data.eventId,
      name: this.data.name,
      currency: this.data.currency,
      locale: this.data.locale,
      metadata: Object.assign({}, this.data.metadata, { template: id }),
    };
    Object.assign(data, keep);
    data.ticketTypes = (data.ticketTypes || []).map((t) => Object.assign(t, { currency: keep.currency }));
    this.setData(data);
    this.step = 0;
    this.updatePanels();
    U.emit(this.callbacks, 'onTemplateLoaded', { id, data: this.getData() });
    return true;
  };
  Builder.prototype.openTemplates = async function () {
    const templates = this.templateList();
    if (!root.Swal) return false;
    const cards = templates
      .map((t) => {
        const data = this.templateData(t.id);
        const seats = (data.sections || []).reduce(
          (n, sec) => n + sec.rows.reduce((m, r) => m + r.seats.length, 0),
          0,
        );
        const prices = (data.ticketTypes || []).map((tk) => Number(tk.price) || 0);
        const range = prices.length
          ? Math.min(...prices) === Math.max(...prices)
            ? this.money(prices[0])
            : `${this.money(Math.min(...prices))} – ${this.money(Math.max(...prices))}`
          : '';
        const thumb = root.DreamEventTemplates ? root.DreamEventTemplates.preview(data) : '';
        return `<button type="button" class="deb-template" data-template="${U.escape(t.id)}">
          <span class="deb-template-thumb">${thumb}</span>
          <span class="deb-template-body">
            <strong><i class="${U.escape(t.icon || 'fa-solid fa-map')}"></i> ${U.escape(t.name)}</strong>
            <small>${U.escape(t.description || '')}</small>
            <em>${seats} asientos · ${(data.sections || []).length} secciones${range ? ' · ' + range : ''}</em>
          </span></button>`;
      })
      .join('');
    let chosen = null;
    await root.Swal.fire({
      title: 'Templates',
      html: `<p class="deb-template-intro">Elige un recinto prediseñado. Podrás mover secciones, cambiar filas y editar precios después.</p><div class="deb-template-grid">${cards}</div>`,
      width: 'min(1120px, 96vw)',
      showConfirmButton: false,
      showCloseButton: true,
      customClass: { popup: 'deb-template-popup' },
      didOpen: (popup) =>
        popup.querySelectorAll('[data-template]').forEach((b) =>
          b.addEventListener('click', () => {
            chosen = b.dataset.template;
            root.Swal.close();
          }),
        ),
    });
    if (!chosen) return false;
    if (this.data.sections.length || this.data.stage) {
      const t = templates.find((x) => x.id === chosen);
      const ok = await this.confirm(
        `¿Cargar «${t.name}»?`,
        'Se reemplazarán las secciones, el escenario y los tipos de boleto actuales. Puedes deshacerlo con Ctrl/⌘+Z.',
        'Cargar template',
      );
      if (!ok) return false;
    }
    this.loadTemplate(chosen);
    this.toast('Template cargado: ajusta secciones y precios a tu evento.', 'success');
    return true;
  };

  Builder.prototype.complete = function () {
    const errors = this.validate();
    if (errors.length) {
      U.emit(this.callbacks, 'onValidationError', errors);
      if (!root.Swal) return false;
      root.Swal.fire({
        title: 'Hay errores en el mapa',
        html:
          '<ul class="de-swal-errors">' +
          errors.map((item) => `<li><b>${U.escape(item.path)}</b>: ${U.escape(item.message)}</li>`).join('') +
          '</ul>',
        icon: 'error',
        confirmButtonText: 'Revisar',
        confirmButtonColor: '#6D28D9',
      });
      return false;
    }
    if (!root.Swal) {
      U.emit(this.callbacks, 'onComplete', this.getData());
      return true;
    }
    root.Swal.fire({
      title: 'Mapa listo',
      text: `${this.data.sections.length} secciones · ${this.getCapacity()} asientos. La configuración está validada.`,
      icon: 'success',
      showCancelButton: true,
      confirmButtonText: 'Guardar mapa',
      cancelButtonText: 'Seguir editando',
      confirmButtonColor: '#6D28D9',
      reverseButtons: true,
    }).then((result) => {
      if (result.isConfirmed) U.emit(this.callbacks, 'onComplete', this.getData());
    });
    return true;
  };

  /* ------------------------------------------------------------- public API */

  Builder.prototype.goToStep = function (n) {
    this.step = Math.max(0, Math.min(2, +n || 0));
    this.updatePanels();
    U.emit(this.callbacks, 'onStepChange', this.step);
    return this;
  };
  Builder.prototype.getData = function () {
    return U.clone(this.data);
  };
  Builder.prototype.getJSON = function () {
    return JSON.stringify(this.data, null, 2);
  };
  Builder.prototype.getCapacity = function () {
    return this.data.sections.reduce((n, s) => n + seatsOf(s), 0);
  };
  Builder.prototype.getTicketTypes = function () {
    return U.clone(this.data.ticketTypes);
  };
  Builder.prototype.getSections = function () {
    return U.clone(this.data.sections);
  };
  Builder.prototype.getSection = function (id) {
    return this.data.sections.find((s) => s.id === id) || null;
  };
  Builder.prototype.getSeats = function () {
    return U.eachSeat(this.data).map((x) => U.clone(x.seat));
  };
  Builder.prototype.getSelectedElement = function () {
    if (this.selectedSeatIds.size) return { type: 'seats', ids: [...this.selectedSeatIds] };
    return U.clone(this.selected);
  };
  Builder.prototype.validate = function () {
    return S.validate(this.data);
  };
  Builder.prototype.summary = function () {
    const seats = U.eachSeat(this.data).map((x) => x.seat);
    return [
      { label: 'Tipos de boleto', value: this.data.ticketTypes.length },
      { label: 'Secciones', value: this.data.sections.length },
      { label: 'Filas', value: this.data.sections.reduce((n, s) => n + s.rows.length, 0) },
      { label: 'Asientos', value: seats.length },
      { label: 'Disponibles', value: seats.filter((x) => x.status === 'available').length },
      { label: 'Deshabilitados', value: seats.filter((x) => x.status === 'disabled').length },
      { label: 'Accesibles', value: seats.filter((x) => x.accessible || x.status === 'accessible').length },
      { label: 'Bloqueados', value: seats.filter((x) => x.status === 'blocked').length },
    ];
  };
  Builder.prototype.setData = function (json) {
    this.history.push(this.data);
    this.data = L.sync(S.normalize(json));
    this.selected = null;
    this.selectedSeatIds.clear();
    this.formSectionId = this.data.sections[0] ? this.data.sections[0].id : NEW;
    this.afterChange();
    this.renderer && this.renderer.fitToMap();
    return this;
  };
  Builder.prototype.restore = function (snapshot) {
    if (!snapshot) return this;
    this.data = snapshot;
    this.afterChange();
    return this;
  };
  Builder.prototype.undo = function () {
    return this.restore(this.history.undo(this.data));
  };
  Builder.prototype.redo = function () {
    return this.restore(this.history.redo(this.data));
  };
  Builder.prototype.fitToScreen = function () {
    this.renderer.fitToScreen();
    return this;
  };
  Builder.prototype.fitToMap = function () {
    this.renderer.fitToMap();
    return this;
  };
  Builder.prototype.resize = function () {
    this.renderer.resize();
    return this;
  };
  Builder.prototype.reset = async function (opts = {}) {
    if (opts.confirm !== false) {
      const ok = await this.confirm(
        '¿Restaurar el mapa inicial?',
        'Se perderán los cambios hechos desde que se abrió el editor (puedes deshacerlo).',
        'Restaurar',
      );
      if (!ok) return this;
    }
    this.setData(this.initial);
    U.emit(this.callbacks, 'onReset');
    return this;
  };
  Builder.prototype.clear = function () {
    const empty = S.createEmpty();
    empty.ticketTypes = U.clone(this.data.ticketTypes);
    Object.assign(empty, {
      eventId: this.data.eventId,
      name: this.data.name,
      currency: this.data.currency,
      locale: this.data.locale,
      metadata: U.clone(this.data.metadata),
    });
    return this.setData(empty);
  };
  Builder.prototype.exportJSON = function () {
    const blob = new Blob([this.getJSON()], { type: 'application/json' }),
      url = URL.createObjectURL(blob),
      a = document.createElement('a');
    a.href = url;
    a.download = `${(this.data.eventId || 'dream-event').replace(/[^\w-]+/g, '-')}-seat-map.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  Builder.prototype.importFile = function (file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        this.setData(JSON.parse(reader.result));
        this.toast('Mapa importado', 'success');
      } catch (e) {
        U.emit(this.callbacks, 'onError', e);
        this.toast('El archivo no contiene un JSON válido.', 'error');
      }
    };
    reader.readAsText(file);
  };
  Builder.prototype.destroy = function () {
    if (this.destroyed) return;
    this.destroyed = true;
    clearTimeout(this._hintTimer);
    document.removeEventListener('keydown', this._onKey);
    document.removeEventListener('click', this._onDocClick);
    this.resizeObserver && this.resizeObserver.disconnect();
    this.renderer && this.renderer.destroy();
    this.renderer = null;
    this.container.innerHTML = '';
  };
  root.DreamEventSeatMapBuilder = Builder;
})(window);
