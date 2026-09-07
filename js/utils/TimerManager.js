/**
 * TimerManager.js
 * -----------------------------------------------------------------------
 * Utilidades pequeñas de formateo de tiempo/bytes usadas por la UI.
 * No maneja setTimeout reales: el SimulationEngine usa su propia cola de
 * eventos con reloj virtual, tal como pide el enunciado.
 * -----------------------------------------------------------------------
 */
window.SRSim = window.SRSim || { core: {}, ui: {}, utils: {}, comparator: {} };

(function (ns) {
  'use strict';

  const TimerManager = {
    /** Formatea milisegundos a un string legible (ms o s) */
    formatMs: function (ms) {
      if (ms < 1000) return ms.toFixed(2) + ' ms';
      return (ms / 1000).toFixed(3) + ' s';
    },

    formatBytes: function (bytes) {
      if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
      if (bytes >= 1024) return (bytes / 1024).toFixed(2) + ' KB';
      return bytes + ' B';
    },

    clamp: function (v, min, max) {
      return Math.max(min, Math.min(max, v));
    }
  };

  ns.utils.TimerManager = TimerManager;
})(window.SRSim);
