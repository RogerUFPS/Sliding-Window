/**
 * Packet.js
 * -----------------------------------------------------------------------
 * Representa una trama que viaja por el canal: puede ser de tipo 'DATA'
 * (emisor -> receptor) o 'ACK' (receptor -> emisor).
 *
 * Como no usamos ES Modules, todo se cuelga del objeto global SRSim.
 * -----------------------------------------------------------------------
 */
window.SRSim = window.SRSim || { core: {}, ui: {}, utils: {}, comparator: {} };

(function (ns) {
  'use strict';

  let _idCounter = 0;

  /**
   * @param {string} type       'DATA' | 'ACK'
   * @param {number} seqNum     Número de secuencia de la trama (o de la trama que confirma, si es ACK)
   * @param {number} timestamp  Instante virtual (ms) en que la trama fue creada/enviada
   * @param {number} sizeBytes  Tamaño de la trama en bytes
   */
  function Packet(type, seqNum, timestamp, sizeBytes) {
    this.id = 'pkt-' + (_idCounter++);
    this.type = type; // 'DATA' o 'ACK'
    this.seqNum = seqNum;
    this.sentAt = timestamp;   // tiempo virtual de envío
    this.arriveAt = null;      // tiempo virtual de llegada (lo fija el Channel)
    this.sizeBytes = sizeBytes;
    this.lost = false;         // si el Channel decide perderla
    this.isRetransmission = false;
    this.forcedLoss = false;   // perdida forzada manualmente por el usuario (click)
  }

  ns.core.Packet = Packet;
})(window.SRSim);
