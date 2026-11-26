/** Konva scene renderer shared by Builder and Selector; model remains plain JSON. */
(function (root) {
  'use strict';
  function Renderer(container, options = {}) {
    if (!root.Konva) throw new Error('Konva.js no está cargado');
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    if (!this.container) throw new Error('No se encontró el contenedor del mapa');
    this.options = options;
    this.stage = null;
    this.layer = null;
    this.transformer = null;
    this.data = null;
    this.destroyed = false;
    this.width = this.container.clientWidth || 800;
    this.height = this.container.clientHeight || 600;
    this.stage = new Konva.Stage({
      container: this.container,
      width: this.width,
      height: this.height,
      draggable: !!options.pan,
    });
    this.layer = new Konva.Layer();
    this.stage.add(this.layer);
    this.stage.on('wheel', (e) => {
      e.evt.preventDefault();
      const direction = e.evt.deltaY > 0 ? -1 : 1;
      this.zoomBy(direction > 0 ? 1.12 : 1 / 1.12, this.stage.getPointerPosition());
    });
    if (options.editable) {
      this.transformer = null;
    }
    this.stage.on('click tap', (e) => {
      if (e.target === this.stage) {
        this.transformer && this.transformer.nodes([]);
        options.onSelect && options.onSelect(null);
      }
    });
  }
  Renderer.prototype.draw = function (data, availability, selection) {
    this.data = data;
    this.seatNodes = new Map();
    this.layer.destroyChildren();
    if (this.options.editable) {
      this.transformer = new Konva.Transformer({
        rotateEnabled: true,
        enabledAnchors: ['top-left', 'top-center', 'top-right', 'middle-right', 'bottom-right', 'bottom-center', 'bottom-left', 'middle-left'],
        keepRatio: false,
        boundBoxFunc: (oldBox, newBox) =>
          newBox.width < 20 || newBox.height < 20 ? oldBox : newBox,
      });
    }
    const c = data.canvas || {},
      bg = new Konva.Rect({
        x: 0,
        y: 0,
        width: c.width || 1600,
        height: c.height || 1200,
        fill: c.backgroundColor || '#F8FAFC',
        listening: false,
      });
    this.layer.add(bg);
    if (data.background && data.background.visible && data.background.src) {
      try {
        const img = new Image();
        img.onload = () => {
          if (this.destroyed) return;
          const node = new Konva.Image({
            image: img,
            x: data.background.x,
            y: data.background.y,
            width: data.background.width,
            height: data.background.height,
            opacity: data.background.opacity,
            rotation: data.background.rotation,
            listening: false,
          });
          this.layer.add(node);
          node.zIndex(this.options.editable ? 2 : 1);
          this.layer.batchDraw();
        };
        img.src = data.background.src;
      } catch (_) {}
    }
    const stage = data.stage;
    if (stage && stage.visible !== false) {
      let sh;
      if (stage.shape === 'semicircle')
        sh = new Konva.Shape({
          sceneFunc: (ctx, shape) => { ctx.beginPath(); ctx.moveTo(0, stage.height); ctx.ellipse(stage.width / 2, stage.height, stage.width / 2, stage.height, 0, Math.PI, Math.PI * 2, false); ctx.closePath(); ctx.fillStrokeShape(shape); },
          fill: stage.color, stroke: stage.color, strokeWidth: 1,
        });
      else if (stage.shape === 'circle')
        sh = new Konva.Circle({ x: stage.width / 2, y: stage.height / 2, radius: Math.min(stage.width, stage.height) / 2, fill: stage.color });
      else if (stage.shape === 'trapezoid')
        sh = new Konva.Line({
          points: [
            0,
            stage.height,
            stage.width * 0.15,
            0,
            stage.width * 0.85,
            0,
            stage.width,
            stage.height,
          ],
          closed: true,
          fill: stage.color,
        });
      else
        sh = new Konva.Rect({
          x: stage.shape === 'square' ? (stage.width - Math.min(stage.width, stage.height)) / 2 : 0,
          y: stage.shape === 'square' ? (stage.height - Math.min(stage.width, stage.height)) / 2 : 0,
          width: stage.shape === 'square' ? Math.min(stage.width, stage.height) : stage.width,
          height: stage.shape === 'square' ? Math.min(stage.width, stage.height) : stage.height,
          fill: stage.color,
          cornerRadius: 12,
        });
      const stageGroup = new Konva.Group({
        x: stage.x,
        y: stage.y,
        rotation: stage.rotation || 0,
        draggable: !!this.options.editable && !stage.locked,
      });
      stageGroup.setAttr('name', 'stage');
      stageGroup.add(sh);
      stageGroup.add(
        new Konva.Text({
          x: 0,
          y: stage.height / 2 - 10,
          width: stage.width,
          text: stage.label || 'ESCENARIO',
          align: 'center',
          fill: '#fff',
          fontStyle: 'bold',
          fontSize: 16,
          listening: false,
        }),
      );
      this.layer.add(stageGroup);
      if (this.options.editable)
        stageGroup.on(
          'dragend transformend',
          () =>
            this.options.onStageMove &&
            this.options.onStageMove({
              x: stageGroup.x(),
              y: stageGroup.y(),
              rotation: stageGroup.rotation(),
            }),
        );
    }
    const tickets = new Map((data.ticketTypes || []).map((ticket) => [ticket.id, ticket]));
    (data.sections || []).forEach((section) => {
      if (section.visible === false) return;
      const ticketIndex = (data.ticketTypes || []).findIndex(
        (ticket) => ticket.id === section.ticketTypeId,
      );
      const ticketColor = section.color || ['#7C3AED', '#8B5CF6', '#6D28D9', '#A78BFA', '#5B21B6'][
        Math.max(0, ticketIndex) % 5
      ];
      const group = new Konva.Group({
        x: section.x,
        y: section.y,
        rotation: section.rotation || 0,
        scaleX: section.scaleX || 1,
        scaleY: section.scaleY || 1,
        draggable: !!this.options.editable && !section.locked,
      });
      group.setAttr('sectionId', section.id);
      this.layer.add(group);
      const allSeatPositions = (section.rows || []).flatMap((row) =>
        root.DreamEventLayout.distribute(row, section).map((seat) => ({ x: seat.x + (row.x || 0), y: seat.y + (row.y || 0) })),
      );
      const radius = (Number(section.seatSize) || 24) / 2;
      const minX = Math.min(0, ...allSeatPositions.map((p) => p.x - radius)) - 20;
      const minY = Math.min(0, ...allSeatPositions.map((p) => p.y - radius)) - 20;
      const maxX = Math.max(...allSeatPositions.map((p) => p.x + radius), 1) + 20;
      const maxY = Math.max(...allSeatPositions.map((p) => p.y + radius), 1) + 20;
      const boxW = maxX - minX, boxH = maxY - minY, sectionColor = section.color || ticketColor;
      let outline;
      if (section.shape === 'circle') outline = new Konva.Circle({ x: minX + boxW / 2, y: minY + boxH / 2, radius: Math.sqrt(boxW * boxW + boxH * boxH) / 2, fill: sectionColor, opacity: 0.10, stroke: sectionColor, strokeWidth: 2 });
      else if (section.shape === 'semicircle') outline = new Konva.Shape({ sceneFunc: (ctx, shape) => { ctx.beginPath(); ctx.moveTo(minX, maxY); ctx.ellipse(minX + boxW / 2, maxY, boxW / 2, boxH, 0, Math.PI, Math.PI * 2, false); ctx.closePath(); ctx.fillStrokeShape(shape); }, fill: sectionColor, opacity: 0.10, stroke: sectionColor, strokeWidth: 2 });
      else if (section.shape === 'trapezoid') outline = new Konva.Line({ points: [minX, maxY, minX + boxW * .15, minY, maxX - boxW * .15, minY, maxX, maxY], closed: true, fill: sectionColor, opacity: 0.10, stroke: sectionColor, strokeWidth: 2 });
      else if (section.shape === 'square') { const side = Math.max(boxW, boxH); outline = new Konva.Rect({ x: minX, y: minY, width: side, height: side, fill: sectionColor, opacity: 0.10, stroke: sectionColor, strokeWidth: 2, cornerRadius: 3 }); }
      else outline = new Konva.Rect({ x: minX, y: minY, width: boxW, height: boxH, fill: sectionColor, opacity: 0.10, stroke: sectionColor, strokeWidth: 2, cornerRadius: 10 });
      outline.listening(true);
      group.add(outline);
      (section.rows || []).forEach((row) => {
        const rowGroup = new Konva.Group({
          x: row.x || 0,
          y: row.y || 0,
          rotation: row.rotation || 0,
        });
        group.add(rowGroup);
        const seats = root.DreamEventLayout.distribute(row, section);
        seats.forEach((seat) => {
          const dynamic = availability && availability.seats && availability.seats[seat.id];
          const selected = selection && selection.has(seat.id);
          const status =
            dynamic === 'held'
              ? 'held'
              : dynamic === 'sold'
                ? 'sold'
                : selected
                  ? 'selected'
                  : dynamic || seat.status || 'available';
          const fill =
            status === 'selected'
              ? '#7C3AED'
              : status === 'sold'
                ? '#C4B5FD'
                : status === 'held'
                  ? '#A78BFA'
                  : status === 'disabled'
                    ? '#EDE9FE'
                    : status === 'blocked'
                      ? '#4C1D95'
                      : ticketColor;
          const r = Number(section.seatSize) || 24;
          const node = new Konva.Circle({
            x: seat.x,
            y: seat.y,
            radius: r / 2,
            fill,
            stroke: selected ? '#5B21B6' : seat.accessible ? '#5B21B6' : '#fff',
            strokeWidth: selected ? 4 : seat.accessible ? 3 : 1.5,
            shadowColor: selected ? '#7C3AED' : undefined,
            shadowBlur: selected ? 8 : 0,
            listening: true,
            draggable: !!this.options.editable,
          });
          node.setAttr('seatId', seat.id);
          node.setAttr('seatStatus', status);
          node.setAttr('baseFill', status === 'selected' ? ticketColor : fill);
          node.setAttr('baseStroke', seat.accessible ? '#5B21B6' : '#fff');
          node.setAttr('baseStrokeWidth', seat.accessible ? 3 : 1.5);
          node.setAttr('seatMeta', {
            sectionId: section.id,
            rowId: row.id,
            sectionName: section.name,
            rowLabel: row.label,
            number: seat.number,
            label: seat.label,
            ticketTypeId: section.ticketTypeId,
            price: (tickets.get(section.ticketTypeId) || {}).price || 0,
            currency: (tickets.get(section.ticketTypeId) || {}).currency || data.currency,
          });
          this.seatNodes.set(seat.id, node);
          node.on('dragstart', () => {
            const selectedIds =
              selection instanceof Set && selection.has(seat.id) ? [...selection] : [seat.id];
            this._dragGroup = selectedIds
              .map((id) => ({ id, node: this.seatNodes.get(id) }))
              .filter((entry) => entry.node)
              .map((entry) => ({ ...entry, origin: entry.node.absolutePosition() }));
            this._dragAnchorId = seat.id;
          });
          node.on('dragmove', () => {
            if (!this._dragGroup) return;
            const anchor = this._dragGroup.find((entry) => entry.id === this._dragAnchorId);
            if (!anchor) return;
            const current = node.absolutePosition();
            const dx = current.x - anchor.origin.x;
            const dy = current.y - anchor.origin.y;
            this._dragGroup.forEach((entry) => {
              if (entry.id !== this._dragAnchorId) {
                entry.node.absolutePosition({ x: entry.origin.x + dx, y: entry.origin.y + dy });
              }
            });
            this.layer.batchDraw();
          });
          node.on('dragend', () => {
            if (!this._dragGroup) return;
            const moved = this._dragGroup.map(({ id, node: movedNode }) => ({
              id,
              x: movedNode.x(),
              y: movedNode.y(),
            }));
            this._dragGroup = null;
            this.options.onSeatsMove && this.options.onSeatsMove(moved);
          });
          rowGroup.add(node);
          if (this.options.labels && this.stage.scaleX() > 0.65)
            rowGroup.add(
              new Konva.Text({
                x: seat.x - r / 2,
                y: seat.y - r / 3,
                width: r,
                text: String(seat.number),
                align: 'center',
                fontSize: 9,
                fill: '#fff',
                listening: false,
              }),
            );
        });
      });
      group.add(
        new Konva.Text({
          x: 0,
          y: -24,
          text: section.name,
          fill: '#334155',
          fontSize: 14,
          fontStyle: 'bold',
          listening: false,
        }),
      );
      group.on('click tap', (e) => {
        if (e.target.getAttr('seatId')) return;
        this.options.onSelect && this.options.onSelect({ type: 'section', id: section.id });
        if (this.transformer) this.transformer.nodes([group]);
      });
      group.on(
        'dragend transformend',
        () =>
          this.options.onSectionMove &&
          this.options.onSectionMove(section.id, {
            x: group.x(),
            y: group.y(),
            rotation: group.rotation(),
            scaleX: group.scaleX(),
            scaleY: group.scaleY(),
          }),
      );
    });
    if (this.transformer) this.layer.add(this.transformer);
    this.layer.off('click tap');
    this.layer.on('click tap', (e) => {
      const node = e.target,
        id = node.getAttr('seatId');
      if (id && this.options.onSeat)
        this.options.onSeat(id, node.getAttr('seatMeta'), node.getAttr('seatStatus'), e.evt);
    });
    this.layer.draw();
  };
  Renderer.prototype.fitToScreen = function () {
    const c = (this.data && this.data.canvas) || { width: 1600, height: 1200 };
    const scale = Math.min(this.width / c.width, this.height / c.height);
    this.stage.scale({ x: scale, y: scale });
    this.stage.position({
      x: (this.width - c.width * scale) / 2,
      y: (this.height - c.height * scale) / 2,
    });
    this.stage.batchDraw();
  };
  Renderer.prototype.fitToMap = function () {
    const c = (this.data && this.data.canvas) || { width: 1600, height: 1200 };
    const bg = this.data && this.data.background;
    const x = bg && bg.src ? (Number(bg.x) || 0) : 0;
    const y = bg && bg.src ? (Number(bg.y) || 0) : 0;
    const width = bg && bg.src ? (Number(bg.width) || c.width) : c.width;
    const height = bg && bg.src ? (Number(bg.height) || c.height) : c.height;
    const margin = 24;
    const scale = Math.min((this.width - margin * 2) / width, (this.height - margin * 2) / height);
    this.stage.scale({ x: scale, y: scale });
    this.stage.position({ x: (this.width - width * scale) / 2 - x * scale, y: (this.height - height * scale) / 2 - y * scale });
    this.stage.batchDraw();
  };
  Renderer.prototype.clearSeatSelection = function () {
    this.seatNodes.forEach((node) => {
      if (node.getAttr('seatStatus') === 'selected') node.fill(node.getAttr('baseFill'));
      node.stroke(node.getAttr('baseStroke'));
      node.strokeWidth(node.getAttr('baseStrokeWidth'));
      node.shadowBlur(0);
    });
    this.layer.batchDraw();
  };
  Renderer.prototype.zoomBy = function (factor, pointer) {
    const old = this.stage.scaleX(),
      next = Math.max(0.15, Math.min(4, old * factor)),
      point = pointer || { x: this.width / 2, y: this.height / 2 },
      origin = { x: (point.x - this.stage.x()) / old, y: (point.y - this.stage.y()) / old };
    this.stage.scale({ x: next, y: next });
    this.stage.position({ x: point.x - origin.x * next, y: point.y - origin.y * next });
    this.stage.batchDraw();
  };
  Renderer.prototype.setPanMode = function (enabled) { this.stage.draggable(!!enabled); };
  Renderer.prototype.resize = function () {
    this.width = this.container.clientWidth || this.width;
    this.height = this.container.clientHeight || this.height;
    this.stage.size({ width: this.width, height: this.height });
    this.stage.batchDraw();
  };
  Renderer.prototype.destroy = function () {
    this.destroyed = true;
    this.stage.destroy();
    this.container.innerHTML = '';
  };
  root.DreamEventRenderer = Renderer;
})(window);
