/**
 * Detector de Anomalías - Detecta anomalías basándose en reglas
 */

class AnomalyDetector {
  constructor(config, aggregator) {
    this.config = config;
    this.aggregator = aggregator;
    this.rules = config.anomalyDetection.rules;
    this.listeners = [];

    // Seguimiento de anomalías sostenidas
    this.sustained = new Map(); // zona-métrica -> contador

    // Seguimiento de sensores atascados
    this.lastValues = new Map(); // zona-métrica -> {valor, contador}

    // Seguimiento de sensores silenciosos
    this.lastSeen = new Map(); // zona-métrica -> timestamp

    // Estados de actuadores (simulados)
    this.actuators = new Map(); // zona -> {ventilador, riego, ventilación, sombra}
  }

  /**
   * Procesa las lecturas y detecta anomalías
   */
  processReadings(readings) {
    const now = Date.now();
    const alerts = [];

    for (const reading of readings) {
      const { zone, metric, value, timestamp } = reading;
      const key = `${zone}-${metric}`;

      // Actualizar último visto
      this.lastSeen.set(key, now);

      // Verificar sensor atascado
      const stuckAlert = this.checkStuck(zone, metric, value);
      if (stuckAlert) alerts.push(stuckAlert);

      // Verificar reglas de umbrales
      const thresholdAlerts = this.checkThresholds(zone, metric, value);
      alerts.push(...thresholdAlerts);
    }

    // Verificar sensores silenciosos
    const silentAlerts = this.checkSilent(now);
    alerts.push(...silentAlerts);

    // Ejecutar acciones y notificar
    if (alerts.length > 0) {
      for (const alert of alerts) {
        this.executeAction(alert);
      }
      this.notifyListeners(alerts);
    }
  }

  /**
   * Verifica si el sensor está atascado (mismo valor múltiples veces)
   */
  checkStuck(zone, metric, value) {
    const key = `${zone}-${metric}`;
    const last = this.lastValues.get(key);

    if (last && last.value === value) {
      last.count++;
      if (last.count >= this.config.anomalyDetection.stuckThreshold) {
        return {
          eventType: 'ALERT',
          greenhouseId: this.config.greenhouseId,
          zone,
          timestamp: new Date().toISOString(),
          alertType: 'SENSOR_STUCK',
          severity: 'MEDIUM',
          metric,
          value,
          message: `Sensor ${metric} stuck at ${value} in zone ${zone}`,
          deviceId: this.config.mqtt.clientId
        };
      }
    } else {
      this.lastValues.set(key, { value, count: 1 });
    }

    return null;
  }

  /**
   * Verifica reglas basadas en umbrales
   */
  checkThresholds(zone, metric, value) {
    const alerts = [];

    for (const rule of this.rules) {
      if (rule.metric !== metric) continue;

      const key = `${zone}-${metric}-${rule.type}`;

      if (rule.type === 'THRESHOLD_HIGH' && value > rule.threshold) {
        alerts.push({
          eventType: 'ALERT',
          greenhouseId: this.config.greenhouseId,
          zone,
          timestamp: new Date().toISOString(),
          alertType: 'THRESHOLD_HIGH',
          severity: rule.severity,
          metric,
          value,
          threshold: rule.threshold,
          message: `${metric} above threshold (${value} > ${rule.threshold}) in zone ${zone}`,
          action: rule.action,
          deviceId: this.config.mqtt.clientId
        });
      } else if (rule.type === 'THRESHOLD_LOW' && value < rule.threshold) {
        alerts.push({
          eventType: 'ALERT',
          greenhouseId: this.config.greenhouseId,
          zone,
          timestamp: new Date().toISOString(),
          alertType: 'THRESHOLD_LOW',
          severity: rule.severity,
          metric,
          value,
          threshold: rule.threshold,
          message: `${metric} below threshold (${value} < ${rule.threshold}) in zone ${zone}`,
          action: rule.action,
          deviceId: this.config.mqtt.clientId
        });
      } else if (rule.type === 'THRESHOLD_HIGH_SUSTAINED' && value > rule.threshold) {
        // Rastrear violaciones sostenidas
        const count = (this.sustained.get(key) || 0) + 1;
        this.sustained.set(key, count);

        if (count >= rule.duration) {
          alerts.push({
            eventType: 'ALERT',
            greenhouseId: this.config.greenhouseId,
            zone,
            timestamp: new Date().toISOString(),
            alertType: 'THRESHOLD_HIGH_SUSTAINED',
            severity: rule.severity,
            metric,
            value,
            threshold: rule.threshold,
            duration: count * (this.config.sensors.readingIntervalMs / 1000),
            message: `${metric} sustained above threshold (${value} > ${rule.threshold}) for ${count} readings in zone ${zone}`,
            action: rule.action,
            deviceId: this.config.mqtt.clientId
          });
          // Reiniciar contador después de la alerta
          this.sustained.set(key, 0);
        }
      } else {
        // Reiniciar contador sostenido si no se viola el umbral
        if (rule.type === 'THRESHOLD_HIGH_SUSTAINED') {
          this.sustained.set(key, 0);
        }
      }
    }

    return alerts;
  }

  /**
   * Verifica sensores silenciosos (sin datos recibidos)
   */
  checkSilent(now) {
    const alerts = [];
    const silentThresholdMs = this.config.anomalyDetection.silentThresholdSec * 1000;

    for (const [key, lastSeen] of this.lastSeen.entries()) {
      if (now - lastSeen > silentThresholdMs) {
        const [zone, metric] = key.split('-');
        alerts.push({
          eventType: 'ALERT',
          greenhouseId: this.config.greenhouseId,
          zone,
          timestamp: new Date().toISOString(),
          alertType: 'SENSOR_SILENT',
          severity: 'HIGH',
          metric,
          message: `Sensor ${metric} silent for ${Math.round((now - lastSeen) / 1000)}s in zone ${zone}`,
          deviceId: this.config.mqtt.clientId
        });
        // Eliminar para evitar alertas repetidas
        this.lastSeen.delete(key);
      }
    }

    return alerts;
  }

  /**
   * Ejecuta acción (actuadores simulados)
   */
  executeAction(alert) {
    if (!alert.action) return;

    const { zone, action } = alert;
    const [actuator, state] = action.split('=');

    if (!this.actuators.has(zone)) {
      this.actuators.set(zone, {});
    }

    const zoneActuators = this.actuators.get(zone);
    zoneActuators[actuator] = state;

    console.log(`[AnomalyDetector] ACTION TAKEN: Zone ${zone} -> ${action}`);
    alert.actionTaken = action;
  }

  /**
   * Obtiene los estados actuales de los actuadores
   */
  getActuatorStates() {
    return Object.fromEntries(this.actuators);
  }

  /**
   * Añade un listener para alertas
   */
  onAlerts(callback) {
    this.listeners.push(callback);
  }

  /**
   * Notifica a todos los listeners
   */
  notifyListeners(alerts) {
    for (const listener of this.listeners) {
      try {
        listener(alerts);
      } catch (err) {
        console.error('[AnomalyDetector] Error in listener:', err);
      }
    }
  }
}

module.exports = AnomalyDetector;
