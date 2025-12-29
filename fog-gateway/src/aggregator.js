/**
 * Agregador - Calcula estadísticas sobre ventanas de tiempo
 */

class Aggregator {
  constructor(config) {
    this.config = config;
    this.windowDurationMs = config.aggregation.windowDurationSec * 1000;
    this.windows = new Map(); // zona -> datos de la ventana actual
    this.listeners = [];
    this.intervalId = null;
  }

  /**
   * Inicia el temporizador de agregación
   */
  start() {
    console.log(`[Aggregator] Starting with window duration ${this.config.aggregation.windowDurationSec}s`);

    this.intervalId = setInterval(() => {
      this.publishWindows();
    }, this.windowDurationMs);
  }

  /**
   * Detiene el agregador
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[Aggregator] Stopped');
    }
  }

  /**
   * Procesa las lecturas de sensores entrantes
   */
  processReadings(readings) {
    for (const reading of readings) {
      const { zone, metric, value, timestamp } = reading;

      // Obtener o crear ventana para la zona
      if (!this.windows.has(zone)) {
        this.windows.set(zone, {
          startTime: new Date(),
          metrics: new Map()
        });
      }

      const window = this.windows.get(zone);

      // Obtener o crear estadísticas de la métrica
      if (!window.metrics.has(metric)) {
        window.metrics.set(metric, {
          values: [],
          sum: 0,
          min: Infinity,
          max: -Infinity,
          count: 0
        });
      }

      const stats = window.metrics.get(metric);

      // Actualizar estadísticas
      stats.values.push(value);
      stats.sum += value;
      stats.count++;
      stats.min = Math.min(stats.min, value);
      stats.max = Math.max(stats.max, value);
    }
  }

  /**
   * Publica datos agregados para todas las zonas y reinicia las ventanas
   */
  publishWindows() {
    const aggregates = [];

    for (const [zone, window] of this.windows.entries()) {
      if (window.metrics.size === 0) continue;

      const metrics = {};

      for (const [metricName, stats] of window.metrics.entries()) {
        if (stats.count === 0) continue;

        const avg = stats.sum / stats.count;
        metrics[metricName] = {
          avg: Math.round(avg * 10) / 10,
          min: Math.round(stats.min * 10) / 10,
          max: Math.round(stats.max * 10) / 10,
          count: stats.count
        };
      }

      const aggregate = {
        eventType: 'AGGREGATE',
        greenhouseId: this.config.greenhouseId,
        zone,
        timestamp: new Date().toISOString(),
        windowDurationSec: this.config.aggregation.windowDurationSec,
        metrics,
        deviceId: this.config.mqtt.clientId
      };

      aggregates.push(aggregate);
    }

    // Reiniciar ventanas
    this.windows.clear();

    // Notificar a los listeners
    if (aggregates.length > 0) {
      this.notifyListeners(aggregates);
    }
  }

  /**
   * Añade un listener para agregados
   */
  onAggregates(callback) {
    this.listeners.push(callback);
  }

  /**
   * Notifica a todos los listeners
   */
  notifyListeners(aggregates) {
    for (const listener of this.listeners) {
      try {
        listener(aggregates);
      } catch (err) {
        console.error('[Aggregator] Error in listener:', err);
      }
    }
  }

  /**
   * Obtiene las estadísticas actuales de la ventana (para detección de anomalías)
   */
  getCurrentStats(zone, metric) {
    const window = this.windows.get(zone);
    if (!window) return null;

    const stats = window.metrics.get(metric);
    if (!stats || stats.count === 0) return null;

    return {
      avg: stats.sum / stats.count,
      min: stats.min,
      max: stats.max,
      count: stats.count,
      latest: stats.values[stats.values.length - 1]
    };
  }
}

module.exports = Aggregator;
