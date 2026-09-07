/**
 * Controls.js
 * -----------------------------------------------------------------------
 * Lee los valores de los controles (sliders/inputs) del HTML y los
 * convierte en el objeto de configuración que espera SimulationEngine.
 * También sincroniza las etiquetas numéricas junto a cada slider y
 * gestiona las pestañas (Simulación / Comparador) y el botón de tema.
 * -----------------------------------------------------------------------
 */
window.SRSim = window.SRSim || { core: {}, ui: {}, utils: {}, comparator: {} };

(function (ns) {
  'use strict';

  const Controls = {};

  /** Sincroniza cada <input type=range> con el <span data-value-for="id"> que le siga */
  Controls.bindRangeDisplays = function (root) {
    root.querySelectorAll('input[type="range"]').forEach(function (input) {
      const label = root.querySelector('[data-value-for="' + input.id + '"]');
      const update = function () {
        if (label) label.textContent = Controls._formatRangeValue(input);
      };
      input.addEventListener('input', update);
      update();
    });
  };

  Controls._formatRangeValue = function (input) {
    const suffix = input.getAttribute('data-suffix') || '';
    return input.value + suffix;
  };

  /**
   * Lee un conjunto de controles con prefijo dado (por ejemplo '' para la
   * simulación principal, 'a-' o 'b-' para el comparador) y devuelve la
   * configuración normalizada para SimulationEngine.
   */
  Controls.readConfig = function (prefix) {
    const val = function (name) {
      const el = document.getElementById(prefix + name);
      return el ? parseFloat(el.value) : 0;
    };
    return {
      windowSize: Math.round(val('WindowSize')),
      bitRateMbps: val('BitRate'),
      propDelayMs: val('PropDelay'),
      fileSizeBytes: Math.round(val('FileSize') * 1024), // input en KB
      frameSizeBytes: Math.round(val('FrameSize')),
      lossProbability: val('LossProb') / 100
    };
  };

  Controls.getSpeedMultiplier = function () {
    const el = document.getElementById('speedMultiplier');
    return el ? parseFloat(el.value) : 1;
  };

  Controls.initTabs = function (tabButtons, panels) {
    tabButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        tabButtons.forEach(function (b) { b.classList.remove('active'); });
        panels.forEach(function (p) { p.classList.remove('active'); });
        btn.classList.add('active');
        const target = document.getElementById(btn.getAttribute('data-tab'));
        if (target) target.classList.add('active');
      });
    });
  };

  Controls.initThemeToggle = function (button) {
    const stored = null; // sin localStorage por restricción de artifacts/portabilidad; siempre inicia en tema oscuro
    button.addEventListener('click', function () {
      document.body.classList.toggle('theme-light');
      button.textContent = document.body.classList.contains('theme-light') ? '🌙 Oscuro' : '☀️ Claro';
    });
  };

  ns.ui.Controls = Controls;
})(window.SRSim);
