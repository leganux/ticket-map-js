/**
 * Konva scene renderer shared by Builder and Selector. The model stays plain JSON:
 * the renderer only reads it and reports user gestures through option callbacks.
 *
 * Options: editable, pan, labels, onSelect, onSeat, onSectionMove, onStageMove,
 * onSeatsMove, onMarquee, onViewChange.
 */
(function (root) {
  'use strict';
  const MIN_ZOOM = 0.1,
    MAX_ZOOM = 5;
  const STATUS_STYLE = {
    selected: { fill: '#F5F3FF', stroke: '#4C1D95', strokeWidth: 2.5, text: '#4C1D95' },
    held: { fill: '#DDD6FE', stroke: '#A78BFA', strokeWidth: 1, text: '#5B21B6' },
    sold: { fill: '#CBD5E1', stroke: '#CBD5E1', strokeWidth: 1, text: '#64748B' },
    disabled: { fill: '#E2E8F0', stroke: '#E2E8F0', strokeWidth: 1, text: '#94A3B8' },
    blocked: { fill: '#94A3B8', stroke: '#94A3B8', strokeWidth: 1, text: '#F1F5F9' },
  };
  const SECTION_PALETTE = ['#7C3AED', '#3B82F6', '#0EA5E9', '#10B981', '#F59E0B', '#EC4899'];

  function hexToRgb(hex) {
    const value = String(hex || '#7C3AED').replace('#', '');
    const full =
      value.length === 3
        ? value
            .split('')
            .map((c) => c + c)
            .join('')
        : value.padEnd(6, '0').slice(0, 6);
    const n = parseInt(full, 16) || 0;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function rgba(hex, alpha) {
    const { r, g, b } = hexToRgb(hex);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  /** Mix a color toward white (amount > 0) or black (amount < 0). */
  function shade(hex, amount) {
    const { r, g, b } = hexToRgb(hex);
    const target = amount > 0 ? 255 : 0,
      t = Math.abs(amount);
    const mix = (c) => Math.round(c + (target - c) * t);
    return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
  }
  /** Chip geometry for a section's seats. */
  function seatGeometry(section) {
    const size = Number(section.seatSize) || 24,
      spacing = Number(section.seatSpacing) || 32;
    const height = Math.round(size * 0.92);
    const width = Math.max(size, Math.min(size * 1.45, spacing - 4));
    return { width, height, radius: Math.min(7, height / 3) };
  }

  function Renderer(container, options = {}) {
    if (!root.Konva) throw new Error('Konva.js no está cargado');
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    if (!this.container) throw new Error('No se encontró el contenedor del mapa');
    this.options = options;
    this.data = null;
    this.destroyed = false;
    this.tool = 'select';
    this.selection = null;
    this.selectedSeats = new Set();
    this.seatNodes = new Map();
    this.sectionNodes = new Map();
    this.stageNode = null;
    this.hasFitted = false;
    this.width = this.container.clientWidth || 800;
    this.height = this.container.clientHeight || 600;
    this.stage = new Konva.Stage({
      container: this.container,
      width: this.width,
      height: this.height,
      draggable: true,
      dragDistance: 4,
    });
    this.bgLayer = new Konva.Layer({ listening: false });
    this.layer = new Konva.Layer();
    this.uiLayer = new Konva.Layer();
    this.stage.add(this.bgLayer, this.layer, this.uiLayer);
    if (options.editable) {
      this.transformer = new Konva.Transformer({
        rotateEnabled: true,
        keepRatio: false,
        anchorSize: 10,
        anchorCornerRadius: 5,
        anchorStroke: '#7C3AED',
        anchorFill: '#FFFFFF',
        anchorStrokeWidth: 1.5,
        borderStroke: '#7C3AED',
        borderDash: [5, 4],
        rotateAnchorOffset: 34,
        ignoreStroke: true,
        boundBoxFunc: (oldBox, newBox) =>
          Math.abs(newBox.width) < 30 || Math.abs(newBox.height) < 24 ? oldBox : newBox,
      });
      this.uiLayer.add(this.transformer);
      this.marquee = new Konva.Rect({
        visible: false,
        fill: 'rgba(124,58,237,0.08)',
        stroke: '#7C3AED',
        strokeWidth: 1,
        dash: [4, 4],
        listening: false,
      });
      this.uiLayer.add(this.marquee);
    }
    this.bindStageEvents();
  }

  Renderer.prototype.bindStageEvents = function () {
    const stage = this.stage;
    stage.on('wheel', (e) => {
      e.evt.preventDefault();
      const delta = Math.max(-120, Math.min(120, e.evt.deltaY));
      this.zoomBy(Math.exp(-delta * 0.0022), stage.getPointerPosition());
    });
    stage.on('dragmove dragend', (e) => {
      if (e.target === stage) this.emitView();
    });
    // Touch: two-finger pinch zoom + pan, double tap to zoom in.
    stage.on('touchmove', (e) => {
      const touches = e.evt.touches;
      if (!touches || touches.length !== 2) return;
      e.evt.preventDefault();
      if (stage.isDragging()) stage.stopDrag();
      const rect = this.container.getBoundingClientRect();
      const a = { x: touches[0].clientX - rect.left, y: touches[0].clientY - rect.top },
        b = { x: touches[1].clientX - rect.left, y: touches[1].clientY - rect.top };
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (!this._pinch) {
        this._pinch = { center, dist };
        return;
      }
      const old = stage.scaleX(),
        next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, old * (dist / this._pinch.dist)));
      const anchor = {
        x: (this._pinch.center.x - stage.x()) / old,
        y: (this._pinch.center.y - stage.y()) / old,
      };
      stage.scale({ x: next, y: next });
      stage.position({ x: center.x - anchor.x * next, y: center.y - anchor.y * next });
      this._pinch = { center, dist };
      this.updateLOD();
      stage.batchDraw();
      this.emitView();
    });
    stage.on('touchend touchcancel', () => (this._pinch = null));
    stage.on('dbltap', () => this.zoomBy(1.8, stage.getPointerPosition(), true));
    stage.on('click tap', (e) => {
      if (this._marqueeConsumed) {
        this._marqueeConsumed = false;
        return;
      }
      const target = e.target;
      const seatId = target.getAttr('seatId');
      if (seatId) {
        if (this.options.onSeat)
          this.options.onSeat(
            seatId,
            target.getAttr('seatMeta'),
            target.getAttr('seatStatus'),
            e.evt,
          );
        return;
      }
      if (target === stage) {
        this.options.onSelect && this.options.onSelect(null, e.evt);
      }
    });
    stage.on('mousemove', (e) => {
      const target = e.target;
      let cursor = this.tool === 'pan' ? 'grab' : this.tool === 'marquee' ? 'crosshair' : '';
      if (this.tool === 'select' || !this.options.editable) {
        if (target.getAttr('seatId')) {
          const status = target.getAttr('seatStatus');
          cursor =
            this.options.editable || status === 'available' || status === 'selected'
              ? 'pointer'
              : 'not-allowed';
        } else if (target !== stage && this.options.editable) cursor = 'move';
      }
      this.container.style.cursor = cursor;
    });
    if (!this.options.editable) return;
    stage.on('mousedown touchstart', (e) => {
      if (this.tool !== 'marquee') return;
      const pos = stage.getPointerPosition();
      if (!pos) return;
      this._marqueeStart = pos;
      this.marquee.setAttrs({ width: 0, height: 0, visible: false });
    });
    stage.on('mousemove touchmove', () => {
      if (!this._marqueeStart) return;
      const pos = stage.getPointerPosition();
      if (!pos) return;
      const inv = stage.getAbsoluteTransform().copy().invert();
      const a = inv.point(this._marqueeStart),
        b = inv.point(pos);
      this.marquee.setAttrs({
        x: Math.min(a.x, b.x),
        y: Math.min(a.y, b.y),
        width: Math.abs(a.x - b.x),
        height: Math.abs(a.y - b.y),
        strokeWidth: 1 / stage.scaleX(),
        visible: true,
      });
      this.uiLayer.batchDraw();
    });
    const finishMarquee = (e) => {
      if (!this._marqueeStart) return;
      const start = this._marqueeStart,
        end = stage.getPointerPosition() || start;
      this._marqueeStart = null;
      this.marquee.visible(false);
      this.uiLayer.batchDraw();
      if (Math.abs(start.x - end.x) < 4 && Math.abs(start.y - end.y) < 4) return;
      this._marqueeConsumed = true;
      setTimeout(() => (this._marqueeConsumed = false), 0);
      const box = {
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        width: Math.abs(start.x - end.x),
        height: Math.abs(start.y - end.y),
      };
      const ids = [];
      this.seatNodes.forEach((node, id) => {
        if (Konva.Util.haveIntersection(box, node.getClientRect())) ids.push(id);
      });
      const evt = e && e.evt;
      this.options.onMarquee &&
        this.options.onMarquee(ids, !!(evt && (evt.shiftKey || evt.metaKey || evt.ctrlKey)));
    };
    stage.on('mouseup touchend', finishMarquee);
    this._windowUp = () => finishMarquee(null);
    window.addEventListener('mouseup', this._windowUp);
  };

  /** Selection tool: 'select' (move/edit), 'pan' (move the view) or 'marquee' (box select). */
  Renderer.prototype.setTool = function (tool) {
    this.tool = ['select', 'pan', 'marquee'].includes(tool) ? tool : 'select';
    this.stage.draggable(this.tool !== 'marquee');
    this.applyDraggable();
    this.container.style.cursor = this.tool === 'pan' ? 'grab' : '';
  };
  Renderer.prototype.setPanMode = function (enabled) {
    this.setTool(enabled ? 'pan' : 'select');
  };
  Renderer.prototype.applyDraggable = function () {
    if (!this.options.editable) return;
    const editing = this.tool === 'select';
    this.sectionNodes.forEach((entry) =>
      entry.group.draggable(editing && !entry.section.locked),
    );
    if (this.stageNode) this.stageNode.draggable(editing && !(this.data.stage || {}).locked);
    this.seatNodes.forEach((node, id) => node.draggable(editing && this.selectedSeats.has(id)));
    this.attachTransformer();
  };

  Renderer.prototype.draw = function (data, availability, selection) {
    this.data = data;
    this.availability = availability || null;
    this.selectedSeats = selection instanceof Set ? new Set(selection) : new Set();
    this.seatNodes = new Map();
    this.seatData = new Map();
    this.sectionNodes = new Map();
    this.stageNode = null;
    if (this.transformer) this.transformer.nodes([]);
    this.layer.destroyChildren();
    this.drawBackground();
    if (data.stage && data.stage.visible !== false) this.drawStage(data.stage);
    const tickets = new Map((data.ticketTypes || []).map((t) => [t.id, t]));
    (data.sections || []).forEach((section, index) => {
      if (section.visible === false) return;
      this.drawSection(section, index, tickets);
    });
    this.applyDraggable();
    this.updateLOD();
    // Draw synchronously so the hit graph matches the new shapes before the next pointer event.
    this.layer.draw();
    this.uiLayer.batchDraw();
  };

  Renderer.prototype.drawBackground = function () {
    const data = this.data,
      c = data.canvas || {};
    this.bgLayer.destroyChildren();
    this.bgLayer.add(
      new Konva.Rect({
        x: 0,
        y: 0,
        width: c.width || 1600,
        height: c.height || 1200,
        fill: c.backgroundColor || '#F8FAFC',
        stroke: this.options.editable ? '#ECE8F6' : undefined,
        strokeWidth: 1,
        cornerRadius: 6,
      }),
    );
    const bg = data.background;
    if (!bg || !bg.visible || !bg.src) return;
    if (!this._bgCache || this._bgCache.src !== bg.src) {
      const img = new Image();
      this._bgCache = { src: bg.src, img, ready: false };
      img.onload = () => {
        if (this.destroyed || !this._bgCache || this._bgCache.img !== img) return;
        this._bgCache.ready = true;
        this.drawBackground();
      };
      img.src = bg.src;
    }
    if (!this._bgCache.ready) return;
    this.bgLayer.add(
      new Konva.Image({
        image: this._bgCache.img,
        x: Number(bg.x) || 0,
        y: Number(bg.y) || 0,
        width: Number(bg.width) || c.width,
        height: Number(bg.height) || c.height,
        opacity: bg.opacity == null ? 0.35 : bg.opacity,
        rotation: bg.rotation || 0,
      }),
    );
    this.bgLayer.batchDraw();
  };

  Renderer.prototype.drawStage = function (stage) {
    const w = Number(stage.width) || 400,
      h = Number(stage.height) || 80,
      color = stage.color || '#334155';
    const group = new Konva.Group({
      x: stage.x,
      y: stage.y,
      rotation: stage.rotation || 0,
      name: 'stage',
    });
    group.setAttr('elementType', 'stage');
    const fill = {
      fillLinearGradientStartPoint: { x: 0, y: 0 },
      fillLinearGradientEndPoint: { x: 0, y: h },
      fillLinearGradientColorStops: [0, shade(color, 0.18), 1, shade(color, -0.35)],
      shadowColor: '#0F172A',
      shadowBlur: 14,
      shadowOpacity: 0.22,
      shadowOffsetY: 6,
    };
    let body;
    if (stage.shape === 'semicircle')
      body = new Konva.Shape(
        Object.assign(
          {
            sceneFunc: (ctx, shape) => {
              ctx.beginPath();
              ctx.moveTo(0, 0);
              ctx.lineTo(w, 0);
              ctx.ellipse(w / 2, 0, w / 2, h, 0, 0, Math.PI, false);
              ctx.closePath();
              ctx.fillStrokeShape(shape);
            },
          },
          fill,
        ),
      );
    else if (stage.shape === 'circle')
      body = new Konva.Ellipse(
        Object.assign({ x: w / 2, y: h / 2, radiusX: w / 2, radiusY: h / 2 }, fill, {
          fillLinearGradientStartPoint: { x: 0, y: -h / 2 },
          fillLinearGradientEndPoint: { x: 0, y: h / 2 },
        }),
      );
    else if (stage.shape === 'trapezoid')
      body = new Konva.Shape(
        Object.assign(
          {
            sceneFunc: (ctx, shape) => {
              const r = Math.min(14, h / 4);
              ctx.beginPath();
              ctx.moveTo(r, 0);
              ctx.lineTo(w - r, 0);
              ctx.quadraticCurveTo(w, 0, w - 2, r);
              ctx.lineTo(w * 0.94, h - r);
              ctx.quadraticCurveTo(w / 2, h + h * 0.18, w * 0.06, h - r);
              ctx.lineTo(2, r);
              ctx.quadraticCurveTo(0, 0, r, 0);
              ctx.closePath();
              ctx.fillStrokeShape(shape);
            },
          },
          fill,
        ),
      );
    else {
      const side = Math.min(w, h),
        square = stage.shape === 'square';
      body = new Konva.Rect(
        Object.assign(
          {
            x: square ? (w - side) / 2 : 0,
            y: square ? (h - side) / 2 : 0,
            width: square ? side : w,
            height: square ? side : h,
            cornerRadius: Math.min(16, h / 3),
          },
          fill,
        ),
      );
    }
    group.add(body);
    if (w > 160 && stage.shape !== 'circle') {
      [0.22, 0.78].forEach((p) => {
        group.add(
          new Konva.Line({
            points: [w * p - 4, 6, w * p + 4, 6, w * p + w * 0.09, h * 0.9, w * p - w * 0.09, h * 0.9],
            closed: true,
            fillLinearGradientStartPoint: { x: 0, y: 6 },
            fillLinearGradientEndPoint: { x: 0, y: h * 0.9 },
            fillLinearGradientColorStops: [0, 'rgba(255,255,255,0.28)', 1, 'rgba(255,255,255,0)'],
            listening: false,
          }),
          new Konva.Circle({
            x: w * p,
            y: 7,
            radius: 3.5,
            fill: '#FFFFFF',
            shadowColor: '#FFFFFF',
            shadowBlur: 10,
            shadowOpacity: 1,
            listening: false,
          }),
        );
      });
    }
    const fontSize = Math.max(12, Math.min(28, h * 0.26));
    // Keep the label readable when the stage is turned upside down (e.g. an airplane nose).
    const turn = ((((stage.rotation || 0) % 360) + 360) % 360);
    const flip = turn > 90 && turn < 270;
    const textH = stage.shape === 'semicircle' ? h * 0.6 : h;
    group.add(
      new Konva.Text({
        x: w / 2,
        y: textH / 2,
        offsetX: w / 2,
        offsetY: textH / 2,
        rotation: flip ? 180 : 0,
        width: w,
        height: textH,
        text: stage.label || 'ESCENARIO',
        align: 'center',
        verticalAlign: 'middle',
        fill: '#FFFFFF',
        fontStyle: 'bold',
        fontSize,
        letterSpacing: 2,
        listening: false,
      }),
    );
    this.layer.add(group);
    this.stageNode = group;
    if (!this.options.editable) return;
    group.on('click tap', (e) => {
      e.cancelBubble = true;
      if (this.tool !== 'select' || this._marqueeConsumed) return;
      this.options.onSelect && this.options.onSelect({ type: 'stage' }, e.evt);
    });
    group.on('dragmove transform', () => this.emitView());
    group.on('dragend', () => this.emitStage(group, w, h));
    group.on('transformend', () => this.emitStage(group, w, h));
  };
  Renderer.prototype.emitStage = function (group, w, h) {
    const scaleX = group.scaleX(),
      scaleY = group.scaleY();
    group.scale({ x: 1, y: 1 });
    this.options.onStageMove &&
      this.options.onStageMove({
        x: Math.round(group.x()),
        y: Math.round(group.y()),
        rotation: Math.round(group.rotation() * 10) / 10,
        width: Math.round(w * Math.abs(scaleX)),
        height: Math.round(h * Math.abs(scaleY)),
      });
  };

  Renderer.prototype.seatStatus = function (seat) {
    const dynamic = this.availability && this.availability.seats && this.availability.seats[seat.id];
    if (dynamic === 'held' || dynamic === 'sold') return dynamic;
    if (this.selectedSeats.has(seat.id)) return 'selected';
    const status = dynamic || seat.status || 'available';
    return status === 'accessible' ? 'available' : status;
  };
  Renderer.prototype.styleSeat = function (node) {
    const status = node.getAttr('seatStatus'),
      base = node.getAttr('baseColor'),
      accessible = node.getAttr('accessible');
    const style = STATUS_STYLE[status] || {
      fill: base,
      stroke: shade(base, -0.15),
      strokeWidth: 1,
      text: '#FFFFFF',
    };
    const rect = node.findOne('.chip'),
      label = node.findOne('.num');
    rect.setAttrs({
      fill: style.fill,
      stroke: accessible && status !== 'selected' ? '#0EA5E9' : style.stroke,
      strokeWidth: accessible && status !== 'selected' ? 2 : style.strokeWidth,
      shadowColor: status === 'selected' ? '#7C3AED' : undefined,
      shadowBlur: status === 'selected' ? 8 : 0,
      shadowOpacity: status === 'selected' ? 0.45 : 0,
    });
    rect.setAttr('seatStatus', status);
    if (label) label.fill(style.text);
  };

  Renderer.prototype.drawSection = function (section, index, tickets) {
    const editable = !!this.options.editable;
    const ticket = tickets.get(section.ticketTypeId) || {};
    const color = section.color || ticket.color || SECTION_PALETTE[index % SECTION_PALETTE.length];
    const geo = seatGeometry(section);
    const group = new Konva.Group({
      x: section.x,
      y: section.y,
      rotation: section.rotation || 0,
      scaleX: section.scaleX || 1,
      scaleY: section.scaleY || 1,
    });
    group.setAttr('sectionId', section.id);
    this.layer.add(group);

    const rows = (section.rows || []).map((row) => ({
      row,
      seats: root.DreamEventLayout.distribute(row, section),
    }));
    const circular = section.shape === 'ring' || section.shape === 'table';
    const showRowLabels =
      this.options.labels !== false && section.showRowLabels !== false && !circular;
    const labelGap = showRowLabels ? 26 : 0;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    rows.forEach(({ row, seats }) =>
      seats.forEach((seat) => {
        const x = seat.x + (row.x || 0),
          y = seat.y + (row.y || 0);
        minX = Math.min(minX, x - geo.width / 2 - labelGap);
        maxX = Math.max(maxX, x + geo.width / 2);
        minY = Math.min(minY, y - geo.height / 2);
        maxY = Math.max(maxY, y + geo.height / 2);
      }),
    );
    if (!Number.isFinite(minX)) {
      minX = -80;
      maxX = 80;
      minY = -30;
      maxY = 30;
    }
    const pad = 16;
    minX -= pad;
    maxX += pad;
    minY -= pad + 8;
    maxY += pad;
    const boxW = maxX - minX,
      boxH = maxY - minY;
    const outlineStyle = {
      fill: rgba(color, 0.08),
      stroke: rgba(color, 0.55),
      strokeWidth: 1.5,
      strokeScaleEnabled: false,
      name: 'outline',
    };
    let outline;
    const seatReach = Math.max(geo.width, geo.height) / 2 + 10;
    const inner = root.DreamEventLayout.innerRadius(section);
    const outer = inner + Math.max(0, rows.length - 1) * (Number(section.rowSpacing) || 34);
    if (section.shape === 'ring')
      // Annulus: only the band itself is clickable, so inner rings stay selectable.
      outline = new Konva.Ring(
        Object.assign(
          { x: 0, y: 0, innerRadius: Math.max(4, inner - seatReach), outerRadius: outer + seatReach },
          outlineStyle,
        ),
      );
    else if (section.shape === 'table')
      outline = new Konva.Circle(
        Object.assign({ x: 0, y: 0, radius: outer + seatReach }, outlineStyle, {
          fill: rgba(color, 0.05),
          stroke: rgba(color, 0.35),
        }),
      );
    else if (section.shape === 'circle')
      outline = new Konva.Ellipse(
        Object.assign(
          {
            x: minX + boxW / 2,
            y: minY + boxH / 2,
            radiusX: (boxW / 2) * 1.2,
            radiusY: (boxH / 2) * 1.2,
          },
          outlineStyle,
        ),
      );
    else if (section.shape === 'semicircle')
      outline = new Konva.Shape(
        Object.assign(
          {
            sceneFunc: (ctx, shape) => {
              const rx = boxW / 2 + 12,
                cx = minX + boxW / 2;
              ctx.beginPath();
              ctx.moveTo(cx - rx, minY);
              ctx.lineTo(cx + rx, minY);
              ctx.ellipse(cx, minY, rx, boxH + 12, 0, 0, Math.PI, false);
              ctx.closePath();
              ctx.fillStrokeShape(shape);
            },
          },
          outlineStyle,
        ),
      );
    else if (section.shape === 'trapezoid') {
      // Narrow top edge that still contains the first row.
      const first = rows[0];
      let inset = boxW * 0.15;
      if (first && first.seats.length) {
        const xs = first.seats.map((seat) => seat.x + (first.row.x || 0));
        const left = Math.min(...xs) - geo.width / 2 - labelGap - pad,
          right = Math.max(...xs) + geo.width / 2 + pad;
        inset = Math.min(inset, left - minX, maxX - right);
      }
      inset = Math.max(0, inset);
      outline = new Konva.Line(
        Object.assign(
          {
            points: [minX + inset, minY, maxX - inset, minY, maxX, maxY, minX, maxY],
            closed: true,
            lineJoin: 'round',
          },
          outlineStyle,
        ),
      );
    } else if (section.shape === 'square') {
      const side = Math.max(boxW, boxH);
      outline = new Konva.Rect(
        Object.assign(
          {
            x: minX + (boxW - side) / 2,
            y: minY + (boxH - side) / 2,
            width: side,
            height: side,
            cornerRadius: 12,
          },
          outlineStyle,
        ),
      );
    } else
      outline = new Konva.Rect(
        Object.assign({ x: minX, y: minY, width: boxW, height: boxH, cornerRadius: 12 }, outlineStyle),
      );
    group.add(outline);
    if (section.shape === 'table') {
      const tableRadius = Math.max(12, inner - Math.max(geo.width, geo.height) / 2 - 4);
      group.add(
        new Konva.Circle({
          x: 0,
          y: 0,
          radius: tableRadius,
          fill: rgba(color, 0.22),
          stroke: rgba(color, 0.7),
          strokeWidth: 1.5,
          strokeScaleEnabled: false,
          listening: false,
        }),
        new Konva.Text({
          x: -tableRadius,
          y: -tableRadius,
          width: tableRadius * 2,
          height: tableRadius * 2,
          text: section.name || '',
          align: 'center',
          verticalAlign: 'middle',
          fontSize: Math.max(9, Math.min(14, tableRadius * 0.42)),
          fontStyle: 'bold',
          fill: shade(color, -0.45),
          listening: false,
          wrap: 'word',
        }),
      );
    }

    const texts = [],
      rowLabels = [];
    const fontSize = Math.max(8, Math.min(12, geo.height * 0.52));
    rows.forEach(({ row, seats }) => {
      const rowGroup = new Konva.Group({ x: row.x || 0, y: row.y || 0, rotation: row.rotation || 0 });
      group.add(rowGroup);
      if (showRowLabels && seats.length) {
        const first = seats.reduce((a, b) => (b.x < a.x ? b : a), seats[0]);
        const label = new Konva.Text({
          x: first.x - geo.width / 2 - 30,
          y: first.y - 8,
          width: 22,
          height: 16,
          text: String(row.label || ''),
          align: 'right',
          verticalAlign: 'middle',
          fontSize: 13,
          fontStyle: 'bold',
          fill: '#334155',
          listening: false,
        });
        rowGroup.add(label);
        rowLabels.push(label);
      }
      seats.forEach((seat) => {
        // Only the chip rotates (rings, tables); the number stays horizontal and readable.
        const node = new Konva.Group({ x: seat.x, y: seat.y });
        const chip = new Konva.Rect({
          name: 'chip',
          x: 0,
          y: 0,
          offsetX: geo.width / 2,
          offsetY: geo.height / 2,
          rotation: seat.rotation || 0,
          width: geo.width,
          height: geo.height,
          cornerRadius: geo.radius,
          perfectDrawEnabled: false,
          shadowForStrokeEnabled: false,
        });
        node.add(chip);
        if (this.options.labels !== false) {
          const num = new Konva.Text({
            name: 'num',
            x: -geo.width / 2,
            y: -geo.height / 2,
            width: geo.width,
            height: geo.height,
            text: String(seat.number == null ? '' : seat.number),
            align: 'center',
            verticalAlign: 'middle',
            fontSize: String(seat.number).length > 3 ? fontSize * 0.8 : fontSize,
            fontStyle: '600',
            listening: false,
            perfectDrawEnabled: false,
          });
          node.add(num);
          texts.push(num);
        }
        const status = this.seatStatus(seat);
        const meta = {
          sectionId: section.id,
          rowId: row.id,
          sectionName: section.name,
          rowLabel: row.label,
          number: seat.number,
          label: seat.label,
          ticketTypeId: section.ticketTypeId,
          ticketTypeName: ticket.name || '',
          price: root.DreamEventUtils.ticketPrice(
            ticket,
            this.options.now ? this.options.now() : Date.now(),
          ).price,
          regularPrice: Number(ticket.price) || 0,
          currency: ticket.currency || this.data.currency,
        };
        node.setAttrs({
          seatId: seat.id,
          seatStatus: status,
          baseColor: color,
          accessible: !!seat.accessible || seat.status === 'accessible',
        });
        chip.setAttrs({ seatId: seat.id, seatMeta: meta });
        this.styleSeat(node);
        this.seatNodes.set(seat.id, node);
        this.seatData.set(seat.id, seat);
        if (editable) this.bindSeatDrag(node, seat.id);
        rowGroup.add(node);
      });
    });

    const badge = new Konva.Label({ listening: editable, visible: section.shape !== 'table' });
    badge.add(
      new Konva.Tag({
        fill: color,
        cornerRadius: 16,
        shadowColor: color,
        shadowBlur: 8,
        shadowOpacity: 0.3,
        shadowOffsetY: 2,
      }),
      new Konva.Text({
        text: section.name || 'Sección',
        fontSize: 16,
        fontStyle: 'bold',
        fill: '#FFFFFF',
        padding: 8,
      }),
    );
    badge.position({ x: minX + boxW / 2 - badge.width() / 2, y: minY - badge.height() / 2 });
    group.add(badge);

    this.sectionNodes.set(section.id, { group, outline, section, texts, rowLabels, geo });
    if (!editable) return;
    group.on('click tap', (e) => {
      if (e.target.getAttr('seatId')) return;
      e.cancelBubble = true;
      if (this.tool !== 'select' || this._marqueeConsumed) return;
      this.options.onSelect && this.options.onSelect({ type: 'section', id: section.id }, e.evt);
    });
    group.on('dragstart', (e) => {
      if (e.target !== group) return;
      if (!this.selection || this.selection.id !== section.id)
        this.options.onSelect && this.options.onSelect({ type: 'section', id: section.id }, e.evt);
    });
    group.on('dragmove transform', () => this.emitView());
    group.on('dragend transformend', (e) => {
      if (e.target !== group) return;
      this.options.onSectionMove &&
        this.options.onSectionMove(section.id, {
          x: Math.round(group.x()),
          y: Math.round(group.y()),
          rotation: Math.round(group.rotation() * 10) / 10,
          scaleX: Math.round(group.scaleX() * 1000) / 1000,
          scaleY: Math.round(group.scaleY() * 1000) / 1000,
        });
    });
  };

  Renderer.prototype.bindSeatDrag = function (node, seatId) {
    node.on('dragstart', (e) => {
      e.cancelBubble = true;
      const ids = this.selectedSeats.has(seatId) ? [...this.selectedSeats] : [seatId];
      this._dragGroup = ids
        .map((id) => ({ id, node: this.seatNodes.get(id) }))
        .filter((entry) => entry.node)
        .map((entry) => Object.assign(entry, { origin: entry.node.absolutePosition() }));
      this._dragAnchor = this._dragGroup.find((entry) => entry.id === seatId);
    });
    node.on('dragmove', (e) => {
      e.cancelBubble = true;
      if (!this._dragGroup || !this._dragAnchor) return;
      const current = node.absolutePosition();
      const dx = current.x - this._dragAnchor.origin.x,
        dy = current.y - this._dragAnchor.origin.y;
      this._dragGroup.forEach((entry) => {
        if (entry.id !== seatId)
          entry.node.absolutePosition({ x: entry.origin.x + dx, y: entry.origin.y + dy });
      });
    });
    node.on('dragend', (e) => {
      e.cancelBubble = true;
      if (!this._dragGroup) return;
      const moved = this._dragGroup.map((entry) => ({
        id: entry.id,
        x: Math.round(entry.node.x() * 10) / 10,
        y: Math.round(entry.node.y() * 10) / 10,
      }));
      this._dragGroup = null;
      this.options.onSeatsMove && this.options.onSeatsMove(moved);
    });
  };

  /** Highlight a section or the stage: `{ type: 'section', id }`, `{ type: 'stage' }` or null. */
  Renderer.prototype.setSelection = function (selection) {
    this.selection = selection && (selection.type === 'section' || selection.type === 'stage') ? selection : null;
    this.sectionNodes.forEach((entry, id) => {
      const active = this.selection && this.selection.type === 'section' && this.selection.id === id;
      const color = entry.section.color || '#7C3AED';
      entry.outline.setAttrs({
        stroke: active ? color : rgba(color, 0.55),
        strokeWidth: active ? 2 : 1.5,
        dash: active ? [7, 5] : null,
        fill: rgba(color, active ? 0.12 : 0.08),
      });
    });
    this.attachTransformer();
    this.layer.batchDraw();
    this.emitView();
  };
  Renderer.prototype.attachTransformer = function () {
    if (!this.transformer) return;
    let node = null;
    const sel = this.selection;
    if (this.tool === 'select' && sel) {
      if (sel.type === 'section') {
        const entry = this.sectionNodes.get(sel.id);
        if (entry && !entry.section.locked) node = entry.group;
      } else if (sel.type === 'stage' && this.stageNode && !(this.data.stage || {}).locked)
        node = this.stageNode;
    }
    this.transformer.nodes(node ? [node] : []);
    this.transformer.keepRatio(!!(sel && sel.type === 'section'));
    this.uiLayer.batchDraw();
  };
  /** Restyle seats in place without rebuilding the scene. */
  Renderer.prototype.setSelectedSeats = function (ids) {
    this.selectedSeats = new Set(ids || []);
    const data = this.data;
    if (!data) return;
    this.seatNodes.forEach((node, id) => {
      const seat = this.seatData.get(id);
      if (!seat) return;
      node.setAttr('seatStatus', this.seatStatus(seat));
      this.styleSeat(node);
    });
    this.applyDraggable();
    this.layer.batchDraw();
  };
  Renderer.prototype.clearSeatSelection = function () {
    this.setSelectedSeats([]);
  };

  /** Show seat numbers and row labels only when they are legible at the current zoom. */
  Renderer.prototype.updateLOD = function () {
    const scale = this.stage.scaleX();
    this.sectionNodes.forEach((entry) => {
      const s = scale * Math.min(Math.abs(entry.group.scaleX()), Math.abs(entry.group.scaleY()));
      const showNumbers = entry.geo.height * s >= 13;
      const showRows = s >= 0.45;
      entry.texts.forEach((t) => t.visible(showNumbers));
      entry.rowLabels.forEach((t) => t.visible(showRows));
    });
    this.layer.batchDraw();
  };
  Renderer.prototype.emitView = function () {
    if (this.options.onViewChange) this.options.onViewChange({ scale: this.stage.scaleX() });
  };
  /** Bounding box (container pixels) of the selected element, for HTML overlays. */
  Renderer.prototype.getElementRect = function (selection) {
    if (!selection) return null;
    let node = null;
    if (selection.type === 'section') {
      const entry = this.sectionNodes.get(selection.id);
      node = entry && entry.group;
    } else if (selection.type === 'stage') node = this.stageNode;
    return node ? node.getClientRect({ skipShadow: true }) : null;
  };
  Renderer.prototype.contentBounds = function () {
    const rect = this.layer.getClientRect({ skipShadow: true, relativeTo: this.stage });
    if (!rect.width || !rect.height) {
      const c = (this.data && this.data.canvas) || { width: 1600, height: 1200 };
      return { x: 0, y: 0, width: c.width, height: c.height };
    }
    return rect;
  };
  Renderer.prototype.fitRect = function (rect, margin = 40) {
    const pad = Object.assign({ top: 0, right: 0, bottom: 0, left: 0 }, this.options.fitPadding);
    const availW = Math.max(50, this.width - pad.left - pad.right - margin * 2),
      availH = Math.max(50, this.height - pad.top - pad.bottom - margin * 2);
    const scale = Math.max(
      MIN_ZOOM,
      Math.min(1.6, availW / Math.max(1, rect.width), availH / Math.max(1, rect.height)),
    );
    this.stage.scale({ x: scale, y: scale });
    this.stage.position({
      x: pad.left + margin + (availW - rect.width * scale) / 2 - rect.x * scale,
      y: pad.top + margin + (availH - rect.height * scale) / 2 - rect.y * scale,
    });
    this.hasFitted = true;
    this.updateLOD();
    this.stage.batchDraw();
    this.emitView();
  };
  /** Fit everything that is drawn (stage + sections). */
  Renderer.prototype.fitToScreen = function () {
    this.fitRect(this.contentBounds());
  };
  /** Fit the uploaded venue plan when there is one, otherwise the drawn content. */
  Renderer.prototype.fitToMap = function () {
    const bg = this.data && this.data.background;
    if (bg && bg.src && bg.visible !== false) {
      const c = this.data.canvas || {};
      this.fitRect(
        {
          x: Number(bg.x) || 0,
          y: Number(bg.y) || 0,
          width: Number(bg.width) || c.width,
          height: Number(bg.height) || c.height,
        },
        24,
      );
    } else this.fitToScreen();
  };
  Renderer.prototype.getZoom = function () {
    return this.stage.scaleX();
  };
  Renderer.prototype.zoomBy = function (factor, pointer, animate) {
    const old = this.stage.scaleX(),
      next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, old * factor)),
      point = pointer || { x: this.width / 2, y: this.height / 2 },
      origin = { x: (point.x - this.stage.x()) / old, y: (point.y - this.stage.y()) / old };
    this.setView(next, { x: point.x - origin.x * next, y: point.y - origin.y * next }, animate);
  };
  /** Apply scale + position, optionally with a short animation. */
  Renderer.prototype.setView = function (scale, position, animate) {
    const done = () => {
      this.updateLOD();
      this.stage.batchDraw();
      this.emitView();
    };
    if (!animate) {
      this.stage.scale({ x: scale, y: scale });
      this.stage.position(position);
      return done();
    }
    this.stage.to({
      scaleX: scale,
      scaleY: scale,
      x: position.x,
      y: position.y,
      duration: 0.28,
      easing: Konva.Easings.EaseInOut,
      onUpdate: () => this.emitView(),
      onFinish: done,
    });
  };
  /** On-screen height in px of a seat chip at the current zoom. */
  Renderer.prototype.seatScreenSize = function (id) {
    const node = this.seatNodes.get(id);
    if (!node) return 0;
    const chip = node.findOne('.chip');
    return chip.height() * node.getAbsoluteScale().y;
  };
  /** Center the view on a seat and zoom so seats are about `targetPx` tall. */
  Renderer.prototype.zoomToSeat = function (id, targetPx = 26) {
    const node = this.seatNodes.get(id);
    if (!node) return;
    const current = this.seatScreenSize(id) || 1;
    const scale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.stage.scaleX() * (targetPx / current)));
    const abs = node.getAbsolutePosition();
    const local = { x: (abs.x - this.stage.x()) / this.stage.scaleX(), y: (abs.y - this.stage.y()) / this.stage.scaleX() };
    this.setView(scale, { x: this.width / 2 - local.x * scale, y: this.height / 2 - local.y * scale }, true);
  };
  Renderer.prototype.resize = function () {
    const width = this.container.clientWidth,
      height = this.container.clientHeight;
    if (!width || !height) return;
    const first = !this.hasFitted || this.width < 10 || this.height < 10;
    this.width = width;
    this.height = height;
    this.stage.size({ width, height });
    if (first && this.data) this.fitToMap();
    else {
      this.stage.batchDraw();
      this.emitView();
    }
  };
  Renderer.prototype.destroy = function () {
    if (this.destroyed) return;
    this.destroyed = true;
    window.removeEventListener('mouseup', this._windowUp);
    this.stage.destroy();
    this.container.innerHTML = '';
  };
  Renderer.shade = shade;
  Renderer.rgba = rgba;
  root.DreamEventRenderer = Renderer;
})(window);
