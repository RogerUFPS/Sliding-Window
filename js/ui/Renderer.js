/**
 * Renderer.js
 * -----------------------------------------------------------------------
 * Dibuja el estado actual de la simulación sobre un <canvas>:
 *   - Línea del canal (emisor izquierda, receptor derecha).
 *   - Tramas en vuelo (DATA arriba, ACK abajo) que se desplazan según
 *     su progreso temporal (sentAt / arriveAt / currentTime).
 *   - Ventana del emisor: casillas de colores por estado.
 *   - Buffer del receptor: casillas naranjas para tramas fuera de orden.
 * -----------------------------------------------------------------------
 */
window.SRSim = window.SRSim || { core: {}, ui: {}, utils: {}, comparator: {} };

(function (ns) {
  'use strict';

  const COLORS = {
    data: '#4f8cff',
    ack: '#3ecf8e',
    lost: '#ff5c5c',
    ackConfirmed: '#3ecf8e',
    sentWaiting: '#f4c542',
    timeoutRetrans: '#ff5c5c',
    notSent: '#3a4150',
    buffered: '#ff9f43',
    line: '#5a6478',
    text: '#e6e9f0',
    textDim: '#9aa3b5'
  };

  function Renderer(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.hoverPacketId = null;
    this._lastPacketBoxes = []; // para hit-testing de clicks
  }

  Renderer.prototype.resize = function () {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(320, rect.width) * dpr;
    this.canvas.height = Math.max(260, rect.height) * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cssWidth = rect.width;
    this.cssHeight = rect.height;
  };

  /**
   * Dibuja todo el frame actual.
   * @param {SimulationEngine} engine
   */
  Renderer.prototype.render = function (engine) {
    const ctx = this.ctx;
    const w = this.cssWidth || this.canvas.width;
    const h = this.cssHeight || this.canvas.height;
    ctx.clearRect(0, 0, w, h);
    this._lastPacketBoxes = [];

    if (!engine) return;

    const senderX = 70;
    const receiverX = w - 70;
    const channelY = Math.max(120, h * 0.32);

    this._drawChannelLine(ctx, senderX, receiverX, channelY, w);
    this._drawEndpointLabels(ctx, senderX, receiverX, channelY);
    this._drawFlyingPackets(ctx, engine, senderX, receiverX, channelY);
    this._drawSenderWindow(ctx, engine, senderX, channelY);
    this._drawReceiverState(ctx, engine, receiverX, channelY);
  };

  Renderer.prototype._drawChannelLine = function (ctx, sx, rx, y, w) {
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx, y);
    ctx.lineTo(rx, y);
    ctx.stroke();
  };

  Renderer.prototype._drawEndpointLabels = function (ctx, sx, rx, y) {
    ctx.fillStyle = COLORS.text;
    ctx.font = '600 13px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('EMISOR', sx, y - 18);
    ctx.fillText('RECEPTOR', rx, y - 18);
    // "torres" verticales
    ctx.strokeStyle = COLORS.line;
    ctx.beginPath();
    ctx.moveTo(sx, y - 10); ctx.lineTo(sx, y + 10);
    ctx.moveTo(rx, y - 10); ctx.lineTo(rx, y + 10);
    ctx.stroke();
  };

  Renderer.prototype._drawFlyingPackets = function (ctx, engine, sx, rx, y) {
    const now = engine.currentTime;
    const boxW = 34, boxH = 22;

    const packets = engine.channel.inFlight;
    for (let i = 0; i < packets.length; i++) {
      const pkt = packets[i];
      const total = pkt.arriveAt - pkt.sentAt;
      const progress = total > 0 ? ns.utils.TimerManager.clamp((now - pkt.sentAt) / total, 0, 1) : 1;

      const isData = pkt.type === 'DATA';
      const laneY = isData ? y - 34 : y + 34;
      const x0 = isData ? sx : rx;
      const x1 = isData ? rx : sx;
      const x = x0 + (x1 - x0) * progress;

      // Si va a perderse, la desvanecemos cerca del punto de pérdida (a mitad de camino)
      let alpha = 1;
      let color = isData ? COLORS.data : COLORS.ack;
      if (pkt.lost && progress > 0.5) {
        alpha = Math.max(0, 1 - (progress - 0.5) * 2.2);
        color = COLORS.lost;
      }

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      const bx = x - boxW / 2, by = laneY - boxH / 2;
      this._roundRect(ctx, bx, by, boxW, boxH, 5);
      ctx.fill();
      if (pkt.isRetransmission) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        this._roundRect(ctx, bx, by, boxW, boxH, 5);
        ctx.stroke();
      }
      ctx.fillStyle = '#0b0e14';
      ctx.font = '600 11px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(pkt.seqNum), x, laneY + 1);
      ctx.restore();

      this._lastPacketBoxes.push({ id: pkt.id, x: bx, y: by, w: boxW, h: boxH });
    }
  };

  Renderer.prototype._drawSenderWindow = function (ctx, engine, sx, channelY) {
    const sender = engine.sender;
    const boxSize = 26, gap = 4;
    const startSeq = sender.base;
    const visibleCount = Math.min(sender.totalFrames - startSeq, Math.max(sender.windowSize + 4, 8));
    const baseY = channelY + 70;

    ctx.font = '600 10px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.textDim;
    ctx.fillText('Ventana del emisor (base=' + sender.base + ')', 12, baseY - 14);

    for (let k = 0; k < visibleCount; k++) {
      const seq = startSeq + k;
      if (seq >= sender.totalFrames) break;
      const f = sender.frames[seq];
      const x = 12 + k * (boxSize + gap);
      const y = baseY;

      let color = COLORS.notSent;
      if (f.status === 'acked') color = COLORS.ackConfirmed;
      else if (f.status === 'sent') color = COLORS.sentWaiting;
      else if (f.status === 'timeout') color = COLORS.timeoutRetrans;

      const inWindow = seq < sender.base + sender.windowSize;
      ctx.save();
      ctx.globalAlpha = inWindow ? 1 : 0.45;
      ctx.fillStyle = color;
      this._roundRect(ctx, x, y, boxSize, boxSize, 4);
      ctx.fill();
      ctx.fillStyle = '#0b0e14';
      ctx.font = '600 10px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(seq), x + boxSize / 2, y + boxSize / 2 + 1);
      ctx.restore();
    }
  };

  Renderer.prototype._drawReceiverState = function (ctx, engine, rx, channelY) {
    const receiver = engine.receiver;
    const baseY = channelY + 70;

    ctx.font = '600 10px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS.textDim;
    ctx.fillText('Esperando trama #' + receiver.expectedSeqNum, rx - 6, baseY - 14);

    const buffered = receiver.getBufferedList();
    const boxSize = 26, gap = 4;
    for (let k = 0; k < buffered.length; k++) {
      const seq = buffered[k];
      const x = rx - 6 - (k + 1) * (boxSize + gap) + gap;
      const y = baseY;
      ctx.fillStyle = COLORS.buffered;
      this._roundRect(ctx, x, y, boxSize, boxSize, 4);
      ctx.fill();
      ctx.fillStyle = '#0b0e14';
      ctx.font = '600 10px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(seq), x + boxSize / 2, y + boxSize / 2 + 1);
    }
    if (buffered.length === 0) {
      ctx.fillStyle = COLORS.textDim;
      ctx.font = '400 10px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('(buffer vacío)', rx - 6, baseY + 14);
    }
  };

  Renderer.prototype._roundRect = function (ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  /** Devuelve el id de paquete bajo la coordenada (x,y) del canvas, o null */
  Renderer.prototype.hitTest = function (x, y) {
    for (let i = 0; i < this._lastPacketBoxes.length; i++) {
      const b = this._lastPacketBoxes[i];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.id;
    }
    return null;
  };

  ns.ui.Renderer = Renderer;
  ns.ui.RENDER_COLORS = COLORS;
})(window.SRSim);
