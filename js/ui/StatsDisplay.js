/**
 * StatsDisplay.js
 * -----------------------------------------------------------------------
 * Actualiza los elementos de texto del panel de estadísticas y la
 * consola de eventos (log) en el DOM.
 * -----------------------------------------------------------------------
 */
window.SRSim = window.SRSim || { core: {}, ui: {}, utils: {}, comparator: {} };

(function (ns) {
  'use strict';

  function StatsDisplay(root) {
    // root: elemento contenedor donde buscar los nodos por data-stat
    this.root = root;
    this.nodes = {};
    root.querySelectorAll('[data-stat]').forEach(function (el) {
      this.nodes[el.getAttribute('data-stat')] = el;
    }, this);
    this.logEl = root.querySelector('[data-event-log]');
    this._lastLogLength = 0;
  }

  StatsDisplay.prototype.update = function (engine) {
    const TM = ns.utils.TimerManager;
    const m = engine.getMetrics();
    this._set('time', TM.formatMs(m.elapsedMs));
    this._set('framesSent', String(m.framesSent));
    this._set('framesRetransmitted', String(m.framesRetransmitted));
    this._set('framesLost', String(m.framesLostChannel));
    this._set('acksLost', String(m.ackLost));
    this._set('throughputMbps', m.throughputMbps.toFixed(3) + ' Mbps');
    this._set('throughputKBs', m.throughputKBs.toFixed(2) + ' KB/s');
    this._set('theoreticalEfficiency', m.theoreticalEfficiency.toFixed(1) + ' %');
    this._set('realEfficiency', m.realEfficiency.toFixed(1) + ' %');
    this._set('buffered', String(m.bufferedOutOfOrder));
    this._set('progress', m.deliveredFrames + ' / ' + m.totalFrames);
    this._set('status', m.finished ? 'Finalizada' : 'En curso');

    this._flushLog(engine);
  };

  StatsDisplay.prototype._set = function (key, text) {
    const el = this.nodes[key];
    if (el) el.textContent = text;
  };

  StatsDisplay.prototype._flushLog = function (engine) {
    if (!this.logEl) return;
    const log = engine._eventLog;
    if (log.length === this._lastLogLength) return;

    const frag = document.createDocumentFragment();
    for (let i = this._lastLogLength; i < log.length; i++) {
      const entry = log[i];
      const line = document.createElement('div');
      line.className = 'log-line';
      const t = document.createElement('span');
      t.className = 'log-time';
      t.textContent = '[' + ns.utils.TimerManager.formatMs(entry.time) + ']';
      const m = document.createElement('span');
      m.textContent = ' ' + entry.msg;
      line.appendChild(t);
      line.appendChild(m);
      frag.appendChild(line);
    }
    this.logEl.appendChild(frag);
    this._lastLogLength = log.length;
    this.logEl.scrollTop = this.logEl.scrollHeight;
  };

  StatsDisplay.prototype.clearLog = function () {
    if (this.logEl) this.logEl.innerHTML = '';
    this._lastLogLength = 0;
  };

  ns.ui.StatsDisplay = StatsDisplay;
})(window.SRSim);
