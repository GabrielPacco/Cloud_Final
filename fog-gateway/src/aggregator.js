/**
 * Aggregator - Computes statistics over time windows
 */

class Aggregator {
  constructor(config) {
    this.config = config;
    this.windowDurationMs = config.aggregation.windowDurationSec * 1000;
    this.windows = new Map(); // zone -> current window data
    this.listeners = [];
    this.intervalId = null;
  }

  /**
   * Start aggregation timer
   */
  start() {
    console.log(`[Aggregator] Starting with window duration ${this.config.aggregation.windowDurationSec}s`);

    this.intervalId = setInterval(() => {
      this.publishWindows();
    }, this.windowDurationMs);
  }

  /**
   * Stop aggregator
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[Aggregator] Stopped');
    }
  }

  /**
   * Process incoming sensor readings
   */
  processReadings(readings) {
    for (const reading of readings) {
      const { zone, metric, value, timestamp } = reading;

      // Get or create window for zone
      if (!this.windows.has(zone)) {
        this.windows.set(zone, {
          startTime: new Date(),
          metrics: new Map()
        });
      }

      const window = this.windows.get(zone);

      // Get or create metric stats
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

      // Update statistics
      stats.values.push(value);
      stats.sum += value;
      stats.count++;
      stats.min = Math.min(stats.min, value);
      stats.max = Math.max(stats.max, value);
    }
  }

  /**
   * Publish aggregated data for all zones and reset windows
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

    // Reset windows
    this.windows.clear();

    // Notify listeners
    if (aggregates.length > 0) {
      this.notifyListeners(aggregates);
    }
  }

  /**
   * Add listener for aggregates
   */
  onAggregates(callback) {
    this.listeners.push(callback);
  }

  /**
   * Notify all listeners
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
   * Get current window stats (for anomaly detection)
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
