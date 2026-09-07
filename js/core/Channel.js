/**
 * Channel.js
 * -----------------------------------------------------------------------
 * Simula el medio físico entre el emisor y el receptor.
 *
 * Mantiene un arreglo ("cola") con las tramas actualmente "en vuelo".
 * Cada trama tiene un tiempo de envío (sentAt) y un tiempo de llegada
 * (arriveAt) calculado a partir del retardo de propagación y el tiempo
 * de transmisión de la propia trama.
 *
 * El SimulationEngine llama a update(currentTime) en cada tick para
 * saber qué tramas ya llegaron a su destino (para poder entregarlas a
 * ReceiverBuffer o SenderWindow según corresponda).
 *
 * La decisión de pérdida se toma en el instante del envío (no en la
 * llegada), siguiendo un modelo de pérdida uniforme e independiente por
 * trama, controlado por lossProbability (0..1).
 * -----------------------------------------------------------------------
 */
window.SRSim = window.SRSim || { core: {}, ui: {}, utils: {}, comparator: {} };

(function (ns) {
  'use strict';

  function Channel(config) {
    // config: { bitRateMbps, propDelayMs, lossProbability }
    this.config = config;
    this.inFlight = [];   // arreglo de paquetes en vuelo (no resueltos aún)
    this.delivered = [];  // historial reciente de paquetes ya resueltos (para animación de "última milla")
  }

  /**
   * Calcula el tiempo de transmisión (ms) de "sizeBytes" a la tasa configurada.
   * T_tx = (tamaño_en_bits) / (bitRate en bits/ms)
   */
  Channel.prototype.transmissionTimeMs = function (sizeBytes) {
    const bits = sizeBytes * 8;
    const bitsPerMs = this.config.bitRateMbps * 1000; // 1 Mbps = 1000 bits/ms
    return bits / bitsPerMs;
  };

  /**
   * Envía un paquete por el canal. Decide si se pierde y calcula su
   * tiempo de llegada. Devuelve el propio paquete (ya con arriveAt fijado).
   *
   * @param {Packet} packet
   * @param {number} currentTime  tiempo virtual actual (ms)
   */
  Channel.prototype.transmit = function (packet, currentTime) {
    const txTime = this.transmissionTimeMs(packet.sizeBytes);
    const propDelay = this.config.propDelayMs;

    packet.sentAt = currentTime;
    packet.arriveAt = currentTime + txTime + propDelay;
    packet.txTime = txTime;

    // Decisión de pérdida (independiente por trama)
    const roll = Math.random();
    packet.lost = roll < this.config.lossProbability;

    this.inFlight.push(packet);
    return packet;
  };

  /**
   * Fuerza la pérdida de una trama que sigue en vuelo (usada por el click
   * del usuario sobre una trama en el Canvas). No tiene efecto si la
   * trama ya llegó a destino.
   */
  Channel.prototype.forceLoss = function (packetId) {
    const pkt = this.inFlight.find(function (p) { return p.id === packetId; });
    if (pkt) {
      pkt.lost = true;
      pkt.forcedLoss = true;
    }
    return pkt || null;
  };

  /**
   * Avanza el estado del canal hasta currentTime. Devuelve la lista de
   * paquetes cuyo arriveAt <= currentTime (ya sea que hayan llegado bien
   * o se hayan perdido), y los saca de "inFlight".
   */
  Channel.prototype.update = function (currentTime) {
    const arrived = [];
    const stillFlying = [];

    for (let i = 0; i < this.inFlight.length; i++) {
      const pkt = this.inFlight[i];
      if (pkt.arriveAt <= currentTime) {
        arrived.push(pkt);
      } else {
        stillFlying.push(pkt);
      }
    }
    this.inFlight = stillFlying;

    if (arrived.length) {
      this.delivered = this.delivered.concat(arrived).slice(-40); // pequeño historial acotado
    }
    return arrived;
  };

  Channel.prototype.reset = function () {
    this.inFlight = [];
    this.delivered = [];
  };

  ns.core.Channel = Channel;
})(window.SRSim);
