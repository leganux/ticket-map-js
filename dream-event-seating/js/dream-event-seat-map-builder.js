/** Interactive organizer wizard and visual map editor. */
(function (root) {
  'use strict';
  const U = root.DreamEventUtils,
    S = root.DreamEventSchema,
    L = root.DreamEventLayout;
  function Builder(config) {
    this.config = config || {};
    this.container =
      typeof config.container === 'string'
        ? document.querySelector(config.container)
        : config.container;
    if (!this.container) throw new Error('Container requerido');
    this.initial = L.sync(S.normalize(config.data || {}));
    this.data = L.sync(S.normalize(config.data || {}));
    this.options = Object.assign(
      { locale: 'es-MX', currency: this.data.currency, theme: 'light', historyLimit: 50 },
      config.options,
    );
    this.callbacks = config.callbacks || {};
    this.history = new root.DreamEventHistory(this.options.historyLimit);
    this.step = 0;
    this.selected = null;
    this.selectedSeatIds = new Set();
    this.multiSelect = false;
    this.destroyed = false;
    this.render();
    U.emit(this.callbacks, 'onReady', this.getData());
  }
  Builder.prototype.render = function () {
    const tabs = ['Configurar', 'Secciones', 'Asientos'];
    const nav = tabs.map((label, index) =>
      '<button class="de-panel-tab ' + (this.step === index ? 'active' : '') + '" data-step="' + index + '"><span class="de-tab-icon"><i class="' + ['fa-solid fa-gear', 'fa-solid fa-layer-group', 'fa-solid fa-chair'][index] + '"></i></span>' + label + '</button>'
    ).join('');
    this.container.innerHTML =
      '<div class="de-builder de-app"><aside class="de-app-nav"><div class="de-brand"><span class="de-brand-mark"><i class="fa-solid fa-cloud"></i></span><strong>Dream Event</strong></div><nav><a><i class="fa-solid fa-house"></i><span>Inicio</span></a><a><i class="fa-solid fa-calendar-days"></i><span>Eventos</span></a><a class="selected"><i class="fa-solid fa-ticket"></i><span>Mapa de asientos</span></a><a><i class="fa-solid fa-ticket-simple"></i><span>Boletos</span></a><a><i class="fa-solid fa-chart-line"></i><span>Ventas</span></a><a><i class="fa-solid fa-users"></i><span>Asistentes</span></a><a><i class="fa-solid fa-gear"></i><span>Configuración</span></a></nav><div class="de-nav-promo"><span><i class="fa-solid fa-ticket"></i></span><strong>Gestiona tu evento<br>de principio a fin</strong><button type="button"><i class="fa-solid fa-plus"></i> Crear evento</button></div></aside>' +
      '<main class="de-workspace"><div class="de-breadcrumb"><span>Eventos</span><b>›</b><span>' + U.escape(this.data.name || 'Concierto Dream Event') + '</span><b>›</b><strong>Mapa de asientos</strong><div class="de-user"><i class="fa-regular fa-bell"></i><b>DE</b><i class="fa-solid fa-chevron-down"></i></div></div>' +
      '<header class="de-page-head"><div><h1>Mapa de asientos</h1><p>Diseña y configura el mapa de asientos de tu evento.</p></div><div class="de-actions"><button class="btn btn-outline-primary" data-preview><i class="fa-regular fa-eye"></i> Vista previa</button><button class="btn btn-primary" data-action="complete"><i class="fa-regular fa-floppy-disk"></i> Guardar mapa</button><button class="de-overflow" data-action="export" title="Exportar JSON">⋮</button><input hidden type="file" accept="application/json" class="de-import"></div></header>' +
      '<section class="de-event-summary"><div class="de-event-cover"><i class="fa-solid fa-music"></i></div><div class="de-event-title"><strong>' + U.escape(this.data.name || 'Concierto Dream Event') + '</strong><span><i class="fa-regular fa-calendar"></i> &nbsp;' + U.escape(this.data.eventDate || '15 mar 2025 · 20:00') + '</span><span><i class="fa-solid fa-location-dot"></i> &nbsp;' + U.escape(this.data.venue || 'Auditorio Principal') + '</span></div><div class="de-summary-stat"><span class="de-stat-icon"><i class="fa-solid fa-users"></i></span><div><small>Capacidad total</small><strong>' + this.getCapacity() + '</strong></div></div><div class="de-summary-stat"><span class="de-stat-icon violet"><i class="fa-solid fa-layer-group"></i></span><div><small>Secciones</small><strong>' + this.data.sections.length + '</strong></div></div><div class="de-summary-stat"><span class="de-stat-icon blue"><i class="fa-solid fa-chair"></i></span><div><small>Asientos</small><strong>' + this.getCapacity() + '</strong></div></div></section>' +
      '<div class="de-editor-layout"><section class="de-map-card"><div class="de-map-toolbar"><div class="de-tool-group"><button class="de-tool active" title="Seleccionar" data-tool="select"><i class="fa-solid fa-arrow-pointer"></i></button><button class="de-tool" title="Mover mapa" data-tool="pan"><i class="fa-solid fa-hand"></i></button><button class="de-tool" title="Seleccionar varios asientos" data-tool="multi"><i class="fa-solid fa-border-all"></i></button><button class="de-tool" title="Escenario" data-tool="stage"><i class="fa-solid fa-vector-square"></i></button><button class="de-tool add" title="Agregar sección" data-open-sections><i class="fa-solid fa-plus"></i> <span>Agregar sección</span></button></div><div class="de-tool-group"><button class="de-tool" data-action="undo" title="Deshacer"><i class="fa-solid fa-rotate-left"></i></button><button class="de-tool" data-action="redo" title="Rehacer"><i class="fa-solid fa-rotate-right"></i></button><button class="de-tool" data-action="reset" title="Reiniciar"><i class="fa-regular fa-trash-can"></i></button></div></div><div class="de-canvas"></div><div class="de-canvas-zoom"><button data-action="zoom-out">−</button><span>100%</span><button data-action="zoom-in"><i class="fa-solid fa-plus"></i></button><button data-action="fit" title="Ajustar al plano"><i class="fa-solid fa-expand"></i></button></div></section>' +
      '<aside class="de-config-card"><nav class="de-panel-tabs">' + nav + '</nav><div class="de-panel-content"></div></aside></div></main></div>';
    this.container.querySelectorAll('[data-step]').forEach((button) => button.addEventListener('click', () => this.goToStep(Number(button.dataset.step))));
    this.container.querySelector('[data-open-sections]').addEventListener('click', () => this.goToStep(1));
    this.container.querySelectorAll('[data-tool]').forEach((button) => button.addEventListener('click', () => this.setTool(button.dataset.tool)));
    this.container.addEventListener('click', (event) => { const button = event.target.closest('[data-action]'); if (button) this.action(button.dataset.action); });
    this.container.querySelector('.de-import').onchange = (event) => this.importFile(event.target.files[0]);
    this.updatePanels();
    this.mountRenderer();
  };
  Builder.prototype.setTool = function (tool) {
    this.multiSelect = tool === 'multi';
    this.renderer?.setPanMode(tool === 'pan');
    this.container.querySelectorAll('[data-tool]').forEach((button) => button.classList.toggle('active', button.dataset.tool === tool));
    if (tool === 'stage') this.goToStep(0);
  };
  Builder.prototype.mountRenderer = function () {
    if (this.renderer) this.renderer.destroy();
    this.renderer = new root.DreamEventRenderer(this.container.querySelector('.de-canvas'), {
      editable: true,
      labels: true,
      onSelect: (x) => {
        this.selected = x;
        this.selectedSeatIds.clear();
        this.renderer && this.renderer.clearSeatSelection();
        this.updateProperties();
        U.emit(this.callbacks, 'onSelectionChange', x);
      },
      onSeat: (id, meta, status, event) => {
        if (this.multiSelect || (event && (event.shiftKey || event.ctrlKey || event.metaKey))) {
          this.selectedSeatIds.has(id)
            ? this.selectedSeatIds.delete(id)
            : this.selectedSeatIds.add(id);
        } else {
          this.selectedSeatIds.clear();
          this.selectedSeatIds.add(id);
        }
        this.selected = this.selectedSeatIds.size === 1 ? { type: 'seat', id, meta } : null;
        this.updateProperties();
        this.draw();
        U.emit(this.callbacks, 'onSelectionChange', [...this.selectedSeatIds]);
      },
      onSectionMove: (id, pos) =>
        this.mutate(() => {
          const s = this.data.sections.find((x) => x.id === id);
          Object.assign(s, pos);
        }),
      onStageMove: (pos) => this.mutate(() => Object.assign(this.data.stage, pos)),
      onSeatsMove: (items) =>
        this.mutate(() =>
          items.forEach(({ id, x, y }) => {
            const found = U.findSeat(this.data, id);
            if (found) Object.assign(found.seat, { x, y, manualPosition: true });
          }),
        ),
    });
    this.draw();
    this.renderer.fitToMap();
    const ro = new ResizeObserver(() => this.renderer.resize());
    ro.observe(this.container.querySelector('.de-canvas'));
    this.resizeObserver = ro;
  };
  Builder.prototype.draw = function () {
    if (this.renderer) {
      this.renderer.draw(this.data, null, this.selectedSeatIds);
    }
    this.updatePanels();
  };
  Builder.prototype.updatePanels = function () {
    const panel = this.container.querySelector('.de-panel-content');
    if (!panel) return;
    panel.innerHTML = this.stepContent();
    this.container.querySelectorAll('.de-panel-tab').forEach((tab) => tab.classList.toggle('active', Number(tab.dataset.step) === this.step));
    const capacity = this.getCapacity();
    this.container.querySelector('.de-event-summary .de-summary-stat strong').textContent = capacity;
    this.container.querySelectorAll('.de-event-summary .de-summary-stat strong')[1].textContent = this.data.sections.length;
    this.container.querySelectorAll('.de-event-summary .de-summary-stat strong')[2].textContent = capacity;
    this.bindPanel();
  };
  Builder.prototype.stepContent = function () {
    if (this.step === 1) {
      const sections = this.data.sections.map((section) => {
        const count = section.rows.reduce((n, row) => n + row.seats.length, 0);
        return '<article class="de-section-card"><i class="fa-solid fa-grip" style="--section-color:' + U.escape(section.color || '#7C3AED') + '"></i><div class="de-section-card-copy"><strong>' + U.escape(section.name) + '</strong><small>' + count + ' asientos · ' + section.rows.length + ' filas</small></div><button class="de-icon-btn" data-edit-section="' + U.escape(section.id) + '" title="Configurar"><i class="fa-solid fa-gear"></i></button><button class="de-icon-btn" data-duplicate="' + U.escape(section.id) + '" title="Duplicar"><i class="fa-regular fa-copy"></i></button><button class="de-icon-btn" data-remove-section="' + U.escape(section.id) + '" title="Eliminar"><i class="fa-solid fa-xmark"></i></button></article>';
      }).join('');
      return '<div class="de-panel-heading"><h3>Secciones</h3><button class="btn btn-sm btn-primary" data-add-section><i class="fa-solid fa-plus"></i> Crear sección</button></div><p class="de-hint">Organiza las zonas, filas y asientos de tu recinto.</p><div class="de-section-list">' + (sections || '<div class="de-empty">Aún no hay secciones. Crea la primera para comenzar.</div>') + '</div>';
    }
    if (this.step === 2) {
      const selected = this.selectedSeatIds.size === 1 ? U.findSeat(this.data, [...this.selectedSeatIds][0]) : null;
      const seatForm = selected ? '<label class="de-input-label">Etiqueta<input class="form-control mt-1" data-seat-label value="' + U.escape(selected.seat.label) + '"></label><label class="de-input-label mt-3">Estado<select class="form-select mt-1" data-seat-status>' + ['available','disabled','accessible','blocked'].map((status) => '<option value="'+status+'" '+(selected.seat.status===status?'selected':'')+'>'+({available:'Disponible',disabled:'Deshabilitado',accessible:'Accesible',blocked:'Bloqueado'}[status])+'</option>').join('') + '</select></label><button class="btn btn-sm btn-outline-danger mt-3" data-delete-seat>Eliminar asiento</button>' : this.selectedSeatIds.size > 1 ? '<p class="de-hint">Arrastra cualquiera de los asientos seleccionados para mover el grupo completo.</p>' : '<div class="de-empty">Selecciona uno o varios asientos en el mapa para editarlos.</div>';
      return '<div class="de-panel-heading"><h3>Asientos</h3><span class="de-selection-pill">' + this.selectedSeatIds.size + ' seleccionados</span></div><p class="de-hint">Usa Shift/Ctrl/⌘ + clic para seleccionar varios.</p>' + seatForm + (this.selectedSeatIds.size ? '<button class="btn btn-sm btn-outline-primary mt-3" data-seat-reset>Limpiar selección</button>' : '');
    }
    const stage = this.data.stage;
    return '<div class="de-panel-heading"><h3>Mapa del recinto</h3></div><h4 class="de-subheading"><i class="fa-regular fa-image"></i> &nbsp;Mapa del recinto</h4><label class="de-input-label">Cargar mapa (opcional)</label><p class="de-hint">Usa una imagen del recinto como referencia: plano, distribución, etc.</p><label class="de-upload-box"><i class="fa-solid fa-arrow-up-from-bracket"></i> Cargar mapa<input class="form-control" type="file" accept="image/png,image/jpeg,image/webp" data-background-file><small>PNG, JPG o WEBP</small></label><div class="de-map-controls"><label>Opacidad <input type="range" min="0" max="1" step=".05" data-bg-opacity value="' + this.data.background.opacity + '"></label><button class="btn btn-sm btn-outline-primary" data-action="fit"><i class="fa-solid fa-expand"></i> Ajustar al mapa</button><button class="btn btn-sm btn-outline-primary" data-remove-background><i class="fa-solid fa-xmark"></i> Quitar</button></div><hr><h4 class="de-subheading"><i class="fa-solid fa-cube"></i> &nbsp;Escenario <span>Opcional</span></h4>' + (stage ? '<div class="de-stage-fields">' + this.field('Etiqueta', 'stage.label', stage.label) + this.field('Ancho', 'stage.width', stage.width, 'number') + this.field('Alto', 'stage.height', stage.height, 'number') + '<label>Forma<select class="form-select" data-stage-field="shape">' + [['rectangle','Rectangular'],['square','Cuadrado'],['trapezoid','Trapezoidal'],['semicircle','Semicircular'],['circle','Circular']].map(([value,label]) => '<option value="' + value + '" ' + (stage.shape === value ? 'selected' : '') + '>' + label + '</option>').join('') + '</select></label><label>Rotación<input class="form-control" type="number" data-stage-field="rotation" value="' + stage.rotation + '"></label></div><button class="btn btn-sm btn-outline-primary" data-stage-center><i class="fa-solid fa-bullseye"></i> Centrar escenario</button> <button class="btn btn-sm btn-outline-danger" data-remove-stage><i class="fa-regular fa-trash-can"></i> Quitar escenario</button>' : '<p class="de-hint">Puede estar al frente, al centro (estadio) o no existir (avión).</p><button class="btn btn-sm btn-outline-primary" data-add-stage><i class="fa-solid fa-plus"></i> Agregar escenario</button>');
  };
  Builder.prototype.field = function (label, path, value, type = 'text') {
    return `<div class="col-md-6"><label>${label}<input class="form-control" data-stage-field="${path.split('.')[1]}" type="${type}" value="${U.escape(value)}"></label></div>`;
  };
  Builder.prototype.bindPanel = function () {
    const rootEl = this.container;
    rootEl.querySelector('[data-add-section]')?.addEventListener('click', () => this.promptSection());
    rootEl.querySelectorAll('[data-stage-field]').forEach((el) => {
      el.onchange = () =>
        this.mutate(() => {
          const key = el.dataset.stageField;
          if (this.data.stage)
            this.data.stage[key] = ['width', 'height', 'rotation'].includes(key)
              ? +el.value
              : el.value;
        });
    });
    rootEl.querySelector('[data-add-stage]')?.addEventListener('click', () =>
      this.setStage({
        id: U.id('stage'),
        label: 'ESCENARIO',
        shape: 'rectangle',
        x: (this.data.canvas.width - 500) / 2,
        y: (this.data.canvas.height - 100) / 2,
        width: 500,
        height: 100,
        rotation: 0,
        color: '#5B21B6',
        visible: true,
        locked: false,
      }),
    );
    rootEl
      .querySelector('[data-remove-stage]')
      ?.addEventListener('click', () => this.setStage(null));
    rootEl.querySelector('[data-background-file]')?.addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        const image = new Image();
        image.onload = () => {
          this.mutate(() => {
            this.data.canvas.width = image.naturalWidth;
            this.data.canvas.height = image.naturalHeight;
            Object.assign(this.data.background, { src: reader.result, x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight, visible: true });
          });
          this.renderer.fitToMap();
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(f);
    });
    rootEl
      .querySelector('[data-bg-opacity]')
      ?.addEventListener('change', (e) =>
        this.setBackground(Object.assign({}, this.data.background, { opacity: +e.target.value })),
      );
    rootEl
      .querySelector('[data-remove-background]')
      ?.addEventListener('click', () =>
        this.setBackground(Object.assign({}, this.data.background, { src: null })),
      );
    rootEl.querySelector('[data-stage-center]')?.addEventListener('click', () =>
      this.setStage({
        x: (this.data.canvas.width - this.data.stage.width) / 2,
        y: (this.data.canvas.height - this.data.stage.height) / 2,
      }),
    );
    rootEl
      .querySelectorAll('[data-duplicate]')
      .forEach((b) => (b.onclick = () => this.duplicateSection(b.dataset.duplicate)));
    rootEl
      .querySelectorAll('[data-remove-section]')
      .forEach((b) => (b.onclick = () => this.removeSection(b.dataset.removeSection)));
    rootEl
      .querySelectorAll('[data-edit-section]')
      .forEach((b) => (b.onclick = () => this.editSection(b.dataset.editSection)));
    rootEl
      .querySelector('[data-preview]')
      ?.addEventListener('click', () => U.emit(this.callbacks, 'onPreview', this.getJSON()));
    rootEl.querySelector('[data-seat-reset]')?.addEventListener('click', () => {
      this.selected = null;
      this.selectedSeatIds.clear();
      this.draw();
    });
    rootEl.querySelector('[data-seat-label]')?.addEventListener('change', (e) => this.updateSeat([...this.selectedSeatIds][0], { label: U.text(e.target.value) }));
    rootEl.querySelector('[data-seat-status]')?.addEventListener('change', (e) => this.updateSeat([...this.selectedSeatIds][0], { status: e.target.value, accessible: e.target.value === 'accessible' }));
    rootEl.querySelector('[data-delete-seat]')?.addEventListener('click', () => this.removeSeat([...this.selectedSeatIds][0]));
    rootEl.querySelectorAll('[data-ticket]').forEach(
      (b) =>
        (b.onclick = () => {
          this.selected = { type: 'ticket', id: b.dataset.ticket };
          this.updateProperties();
        }),
    );
    rootEl.querySelectorAll('[data-section]').forEach(
      (b) =>
        (b.onclick = () => {
          this.selected = { type: 'section', id: b.dataset.section };
          this.updateProperties();
        }),
    );
  };
  Builder.prototype.action = function (a) {
    if (a === 'fit') this.renderer.fitToMap();
    if (a === 'zoom-in') this.renderer.zoomBy(1.15);
    if (a === 'zoom-out') this.renderer.zoomBy(1 / 1.15);
    if (a === 'undo') this.undo();
    if (a === 'redo') this.redo();
    if (a === 'reset') this.reset();
    if (a === 'export') this.exportJSON();
    if (a === 'import') this.container.querySelector('.de-import').click();
    if (a === 'previous') this.goToStep(Math.max(0, this.step - 1));
    if (a === 'next') this.goToStep(Math.min(4, this.step + 1));
    if (a === 'complete') {
      const e = this.validate();
      if (e.length) {
        U.emit(this.callbacks, 'onValidationError', e);
        root.Swal.fire({
          title: 'Hay errores en el mapa',
          html:
            '<ul class="de-swal-errors">' +
            e
              .map((item) => '<li>' + U.escape(item.path) + ': ' + U.escape(item.message) + '</li>')
              .join('') +
            '</ul>',
          icon: 'error',
          confirmButtonText: 'Revisar',
          confirmButtonColor: '#6D28D9',
        });
      } else
        root.Swal.fire({
          title: 'Mapa listo',
          text: 'La configuración está validada y lista para transferirse al selector.',
          icon: 'success',
          showCancelButton: true,
          confirmButtonText: 'Confirmar mapa',
          cancelButtonText: 'Seguir editando',
          confirmButtonColor: '#6D28D9',
        }).then((result) => {
          if (result.isConfirmed) U.emit(this.callbacks, 'onComplete', this.getData());
        });
    }
  };
  Builder.prototype.mutate = function (fn) {
    this.history.push(this.data);
    fn();
    this.selectedSeatIds = new Set(
      [...this.selectedSeatIds].filter((id) => U.findSeat(this.data, id)),
    );
    this.data = L.sync(this.data);
    this.draw();
    U.emit(this.callbacks, 'onChange', this.getData());
  };
  Builder.prototype.promptSection = async function () {
    const ticket = this.data.ticketTypes.find((item) => item.mode === 'reserved_seating') || this.data.ticketTypes[0];
    const result = await root.Swal.fire({
      title: 'Configurar sección',
      html:
        '<div class="de-section-form"><div class="de-form-section-title"><i class="fa-solid fa-layer-group"></i><span>Datos de la sección</span></div>' +
        '<label class="de-form-field de-form-wide">Nombre de la sección<input id="swal-section-name" class="swal2-input" value="VIP Central" placeholder="Ej. VIP Central"></label>' +
        '<div class="de-form-grid"><label class="de-form-field">Forma de la sección<select id="swal-section-shape" class="swal2-select"><option value="rectangle">Rectangular</option><option value="square">Cuadrada</option><option value="trapezoid">Trapezoidal</option><option value="semicircle">Semicircular</option><option value="circle">Circular</option></select></label><label class="de-form-field">Color<input id="swal-section-color" type="color" value="#7C3AED"></label></div>' +
        '<div class="de-form-section-title"><i class="fa-solid fa-chair"></i><span>Distribución de asientos</span></div><div class="de-form-grid">' +
        '<label class="de-form-field">Número de filas<input id="swal-row-count" class="swal2-input" type="number" min="1" max="100" value="5"></label><label class="de-form-field">Asientos por fila<input id="swal-seat-count" class="swal2-input" type="number" min="1" max="200" value="10"></label>' +
        '<label class="de-form-field">Separación entre filas (px)<input id="swal-row-spacing" class="swal2-input" type="number" min="12" value="40"></label><label class="de-form-field">Separación entre asientos (px)<input id="swal-seat-spacing" class="swal2-input" type="number" min="12" value="32"></label>' +
        '<label class="de-form-field">Tamaño de asiento (px)<input id="swal-seat-size" class="swal2-input" type="number" min="10" value="24"></label><label class="de-form-field">Alineación<select id="swal-alignment" class="swal2-select"><option value="center">Centrada</option><option value="left">Izquierda</option><option value="right">Derecha</option></select></label></div></div>',
      showCancelButton: true,
      confirmButtonText: 'Crear sección',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#7C3AED',
      preConfirm: () => {
        const name = U.text(document.getElementById('swal-section-name').value);
        const rows = Number(document.getElementById('swal-row-count').value);
        const seats = Number(document.getElementById('swal-seat-count').value);
        if (!name || !Number.isInteger(rows) || rows < 1 || !Number.isInteger(seats) || seats < 1) {
          root.Swal.showValidationMessage('Indica un nombre, filas y asientos válidos.');
          return false;
        }
        return {
          name,
          ticketTypeId: ticket?.id,
          color: document.getElementById('swal-section-color').value,
          shape: document.getElementById('swal-section-shape').value,
          rows,
          seats,
          rowSpacing: Math.max(12, Number(document.getElementById('swal-row-spacing').value) || 40),
          seatSpacing: Math.max(
            12,
            Number(document.getElementById('swal-seat-spacing').value) || 32,
          ),
          seatSize: Math.max(10, Number(document.getElementById('swal-seat-size').value) || 24),
          alignment: document.getElementById('swal-alignment').value,
        };
      },
    });
    if (!result.isConfirmed) return;
    const { name, ticketTypeId, color, shape, rows, seats, alignment, rowSpacing, seatSpacing, seatSize } =
      result.value;
    const section = {
      id: U.id('section'),
      name,
      ticketTypeId,
      color, shape, scaleX: 1, scaleY: 1,
      x: 100 + this.data.sections.length * 30,
      y: 230 + this.data.sections.length * 20,
      rotation: 0,
      seatSize,
      seatSpacing,
      rowSpacing,
      alignment,
      curvature: 0,
      visible: true,
      locked: false,
      rows: Array.from({ length: rows }, (_, i) => ({
        id: U.id('row'),
        label: U.alphaLabel(i),
        x: 0,
        y: i * rowSpacing,
        seatCount: seats,
        numberStart: 1,
        numberDirection: 'asc',
        alignment,
        curvature: 0,
        seats: Array.from({ length: seats }, (_, j) => ({
          id: U.id('seat'),
          number: j + 1,
          label: U.alphaLabel(i) + (j + 1),
          x: 0,
          y: 0,
          rotation: 0,
          status: 'available',
          accessible: false,
          manualPosition: false,
          metadata: {},
        })),
      })),
    };
    this.addSection(section);
  };
  Builder.prototype.editSection = async function (id) {
    const section = this.getSection(id);
    if (!section) return;
    const result = await root.Swal.fire({
      title: 'Editar sección',
      html:
        '<div class="de-section-form">' +
        '<div class="de-form-section-title"><i class="fa-solid fa-sliders"></i><span>Datos de la sección</span></div>' +
        '<label class="de-form-field de-form-wide">Nombre de la sección<input id="swal-section-name" class="swal2-input" placeholder="Ej. VIP Central" value="' + U.escape(section.name) + '"></label>' +
        '<div class="de-form-grid"><label class="de-form-field">Forma de la sección<select id="swal-section-shape" class="swal2-select">' + [['rectangle','Rectangular'],['square','Cuadrada'],['trapezoid','Trapezoidal'],['semicircle','Semicircular'],['circle','Circular']].map(([v,l]) => '<option value="'+v+'" '+((section.shape||'rectangle')===v?'selected':'')+'>'+l+'</option>').join('') + '</select></label>' +
        '<label class="de-form-field">Color<input id="swal-section-color" type="color" value="' + U.escape(section.color || '#7C3AED') + '"></label></div>' +
        '<div class="de-form-section-title"><i class="fa-solid fa-chair"></i><span>Distribución de asientos</span></div>' +
        '<label class="de-form-field de-form-wide">Asientos por fila <small>Escribe una cantidad por fila, separada por comas. Ejemplo: 8, 10, 10, 8.</small><input id="swal-row-seats" class="swal2-input" value="' + section.rows.map((row) => row.seats.length).join(',') + '"></label>' +
        '<div class="de-form-grid"><label class="de-form-field">Separación entre asientos (px)<input id="swal-seat-spacing" class="swal2-input" type="number" min="12" value="' + section.seatSpacing + '"></label>' +
        '<label class="de-form-field">Separación entre filas (px)<input id="swal-row-spacing" class="swal2-input" type="number" min="12" value="' + section.rowSpacing + '"></label>' +
        '<label class="de-form-field">Tamaño de asiento (px)<input id="swal-seat-size" class="swal2-input" type="number" min="10" value="' + section.seatSize + '"></label>' +
        '<label class="de-form-field">Alineación<select id="swal-alignment" class="swal2-select"><option value="center" ' + (section.alignment === 'center' ? 'selected' : '') + '>Centrada</option><option value="left" ' + (section.alignment === 'left' ? 'selected' : '') + '>Izquierda</option><option value="right" ' + (section.alignment === 'right' ? 'selected' : '') + '>Derecha</option></select></label></div></div>',
      showCancelButton: true,
      confirmButtonText: 'Guardar sección',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#7C3AED',
      preConfirm: () => {
        const name = U.text(document.getElementById('swal-section-name').value);
        const counts = document
          .getElementById('swal-row-seats')
          .value.split(',')
          .map((value) => Number(value.trim()));
        if (
          !name ||
          !counts.length ||
          counts.some((count) => !Number.isInteger(count) || count < 0)
        ) {
          root.Swal.showValidationMessage(
            'Revisa el nombre y la cantidad de asientos de cada fila.',
          );
          return false;
        }
        return {
          name,
          color: document.getElementById('swal-section-color').value,
          shape: document.getElementById('swal-section-shape').value,
          counts,
          spacing: Math.max(12, Number(document.getElementById('swal-seat-spacing').value) || 32),
          rowSpacing: Math.max(12, Number(document.getElementById('swal-row-spacing').value) || 40),
          seatSize: Math.max(10, Number(document.getElementById('swal-seat-size').value) || 24),
          alignment: document.getElementById('swal-alignment').value,
        };
      },
    });
    if (!result.isConfirmed) return;
    const { name, color, shape, counts, spacing, rowSpacing, seatSize, alignment } = result.value;
    this.mutate(() => {
      section.name = name;
      section.color = color;
      if (section.shape !== shape) section.rows.forEach((row) => row.seats.forEach((seat) => { seat.manualPosition = false; }));
      section.shape = shape;
      section.alignment = alignment;
      section.seatSpacing = spacing;
      section.rowSpacing = rowSpacing;
      section.seatSize = seatSize;
      counts.forEach((count, i) => {
        if (!section.rows[i])
          section.rows.push({
            id: U.id('row'),
            label: U.alphaLabel(i),
            x: 0,
            y: i * section.rowSpacing,
            alignment,
            curvature: 0,
            seats: [],
          });
        const row = section.rows[i];
        row.y = i * rowSpacing;
        row.label = row.label || U.alphaLabel(i);
        row.alignment = alignment;
        while (row.seats.length < count) {
          const number = row.seats.length + 1;
          row.seats.push({
            id: U.id('seat'),
            number,
            label: row.label + number,
            x: 0,
            y: 0,
            rotation: 0,
            status: 'available',
            accessible: false,
            manualPosition: false,
            metadata: {},
          });
        }
        row.seats = row.seats.slice(0, count);
      });
      section.rows = section.rows.slice(0, counts.length);
    });
  };
  Builder.prototype.updateProperties = function () {
    const box = this.container.querySelector('.de-props');
    if (!box) return;
    if (this.selectedSeatIds.size > 1) {
      box.innerHTML =
        '<strong>' +
        this.selectedSeatIds.size +
        ' asientos seleccionados</strong><p class="small de-muted">Arrastra cualquiera de ellos para mover el grupo.</p><button class="btn btn-sm btn-outline-primary" data-clear-seat-group>Limpiar selección</button>';
      box.querySelector('[data-clear-seat-group]').onclick = () => {
        this.selectedSeatIds.clear();
        this.selected = null;
        this.draw();
      };
      return;
    }
    if (this.selected?.type === 'seat') {
      const found = U.findSeat(this.data, this.selected.id);
      if (!found) {
        box.textContent = 'Asiento no encontrado';
        return;
      }
      const { seat } = found;
      box.innerHTML = `<label class="small">Etiqueta<input class="form-control form-control-sm" data-seat-label value="${U.escape(seat.label)}"></label><label class="small mt-2">Estado<select class="form-select form-select-sm" data-seat-status>${['available', 'disabled', 'accessible', 'blocked'].map((x) => `<option ${seat.status === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label><button class="btn btn-sm btn-outline-danger mt-2" data-delete-seat>Eliminar asiento</button>`;
      box.querySelector('[data-seat-label]').onchange = (e) =>
        this.updateSeat(seat.id, { label: U.text(e.target.value) });
      box.querySelector('[data-seat-status]').onchange = (e) =>
        this.updateSeat(seat.id, {
          status: e.target.value,
          accessible: e.target.value === 'accessible',
        });
      box.querySelector('[data-delete-seat]').onclick = () => this.removeSeat(seat.id);
    } else if (this.selected?.type === 'section') {
      const s = this.getSection(this.selected.id);
      box.innerHTML = s
        ? `<strong>${U.escape(s.name)}</strong><p class="small">${s.rows.length} filas · ${s.rows.reduce((n, r) => n + r.seats.length, 0)} asientos</p><button class="btn btn-sm btn-outline-primary mb-2" data-edit-selected>Configurar sección</button><label class="small">Bloquear <input type="checkbox" data-lock ${s.locked ? 'checked' : ''}></label>`
        : 'Selecciona un elemento';
      box.querySelector('[data-edit-selected]')?.addEventListener('click', () => this.editSection(s.id));
      box
        .querySelector('[data-lock]')
        ?.addEventListener('change', (e) => this.updateSection(s.id, { locked: e.target.checked }));
    } else box.textContent = 'Selecciona una sección o un asiento.';
  };
  Builder.prototype.toast = function (msg, icon = 'info') {
    return root.Swal.fire({
      toast: true,
      position: 'top-end',
      icon,
      title: msg,
      showConfirmButton: false,
      timer: 2800,
      timerProgressBar: true,
    });
  };
  Builder.prototype.addSection = function (d) {
    if (!d.ticketTypeId) d.ticketTypeId = (this.data.ticketTypes.find((t) => t.mode === 'reserved_seating') || this.data.ticketTypes[0] || {}).id;
    this.mutate(() => this.data.sections.push(U.clone(d)));
    return this;
  };
  Builder.prototype.updateSection = function (id, d) {
    this.mutate(() => Object.assign(this.getSection(id) || {}, U.clone(d)));
    return this;
  };
  Builder.prototype.duplicateSection = function (id) {
    const s = this.getSection(id);
    if (!s) return null;
    const copy = U.clone(s);
    copy.id = U.id('section');
    copy.name = `${s.name} (copia)`;
    copy.x += 40;
    copy.y += 40;
    copy.rows.forEach((r) => {
      r.id = U.id('row');
      r.seats.forEach((seat) => (seat.id = U.id('seat')));
    });
    this.addSection(copy);
    return copy;
  };
  Builder.prototype.removeSection = async function (id) {
    const section = this.getSection(id);
    if (!section) return false;
    const result = await root.Swal.fire({
      title: '¿Eliminar esta sección?',
      text: 'Se eliminarán también sus filas y asientos del mapa.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Eliminar sección',
      cancelButtonText: 'Conservar',
      confirmButtonColor: '#6D28D9',
    });
    if (!result.isConfirmed) return false;
    this.mutate(() => (this.data.sections = this.data.sections.filter((item) => item.id !== id)));
    return true;
  };
  Builder.prototype.addRow = function (sectionId, d) {
    this.mutate(() => this.getSection(sectionId)?.rows.push(U.clone(d)));
    return this;
  };
  Builder.prototype.updateRow = function (sectionId, rowId, d) {
    this.mutate(() =>
      Object.assign(this.getSection(sectionId)?.rows.find((r) => r.id === rowId) || {}, U.clone(d)),
    );
    return this;
  };
  Builder.prototype.removeRow = function (sectionId, rowId) {
    this.mutate(() => {
      const s = this.getSection(sectionId);
      if (s) s.rows = s.rows.filter((r) => r.id !== rowId);
    });
    return this;
  };
  Builder.prototype.updateSeat = function (id, d) {
    this.mutate(() => {
      const f = U.findSeat(this.data, id);
      if (f) Object.assign(f.seat, U.clone(d));
    });
    return this;
  };
  Builder.prototype.removeSeat = function (id) {
    return root.Swal.fire({
      title: '¿Quitar este asiento?',
      text: 'El asiento se eliminará de la sección.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Quitar asiento',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#6D28D9',
    }).then((result) => {
      if (result.isConfirmed) {
        this.mutate(() =>
          this.data.sections.forEach((section) =>
            section.rows.forEach((row) => (row.seats = row.seats.filter((seat) => seat.id !== id))),
          ),
        );
      }
      return this;
    });
  };
  Builder.prototype.setStage = function (d) {
    this.mutate(() => {
      if (d === null) this.data.stage = null;
      else
        this.data.stage = Object.assign(
          {
            id: U.id('stage'),
            label: 'ESCENARIO',
            shape: 'rectangle',
            x: (this.data.canvas.width - 500) / 2,
            y: (this.data.canvas.height - 100) / 2,
            width: 500,
            height: 100,
            rotation: 0,
            color: '#5B21B6',
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
    return this.data.sections.reduce(
      (n, s) => n + s.rows.reduce((m, r) => m + r.seats.length, 0),
      0,
    );
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
      {
        label: 'Accesibles',
        value: seats.filter((x) => x.accessible || x.status === 'accessible').length,
      },
      { label: 'Bloqueados', value: seats.filter((x) => x.status === 'blocked').length },
    ];
  };
  Builder.prototype.setData = function (json) {
    this.data = L.sync(S.normalize(json));
    this.selected = null;
    this.selectedSeatIds.clear();
    this.draw();
    U.emit(this.callbacks, 'onChange', this.getData());
    return this;
  };
  Builder.prototype.undo = function () {
    const d = this.history.undo(this.data);
    if (d) {
      this.data = d;
      this.draw();
    }
    return this;
  };
  Builder.prototype.redo = function () {
    const d = this.history.redo(this.data);
    if (d) {
      this.data = d;
      this.draw();
    }
    return this;
  };
  Builder.prototype.fitToScreen = function () {
    this.renderer.fitToMap();
  };
  Builder.prototype.fitToMap = function () { this.renderer.fitToMap(); };
  Builder.prototype.resize = function () {
    this.renderer.resize();
  };
  Builder.prototype.reset = async function () {
    const result = await root.Swal.fire({
      title: '¿Reiniciar el mapa?',
      text: 'Se restaurará la configuración inicial de esta instancia.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Reiniciar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#6D28D9',
    });
    if (!result.isConfirmed) return this;
    this.selectedSeatIds.clear();
    this.setData(this.initial);
    U.emit(this.callbacks, 'onReset');
    return this;
  };
  Builder.prototype.clear = function () {
    this.setData(S.createEmpty());
    return this;
  };
  Builder.prototype.exportJSON = function () {
    const blob = new Blob([this.getJSON()], { type: 'application/json' }),
      url = URL.createObjectURL(blob),
      a = document.createElement('a');
    a.href = url;
    a.download = 'dream-event-seat-map.json';
    a.click();
    URL.revokeObjectURL(url);
  };
  Builder.prototype.importFile = function (file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        this.setData(JSON.parse(reader.result));
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
    this.resizeObserver?.disconnect();
    this.renderer?.destroy();
    this.container.innerHTML = '';
  };
  root.DreamEventSeatMapBuilder = Builder;
})(window);
