/**
 * Cliente MQTT - Publica eventos a AWS IoT Core
 */

const awsIot = require('aws-iot-device-sdk');
const fs = require('fs');

class MQTTClient {
  constructor(config, buffer) {
    this.config = config;
    this.buffer = buffer;
    this.device = null;
    this.connected = false;
    this.retryIntervalId = null;
    this.publishQueue = [];
  }

  /**
   * Conecta a AWS IoT Core
   */
  connect() {
    const mqttConfig = this.config.mqtt;

    // Validar que los archivos de certificados existen
    if (!fs.existsSync(mqttConfig.certPath) ||
        !fs.existsSync(mqttConfig.keyPath) ||
        !fs.existsSync(mqttConfig.caPath)) {
      console.error('[MQTT] Certificate files not found. Please run Pulumi to generate certificates.');
      console.log('[MQTT] Expected paths:');
      console.log(`  - Cert: ${mqttConfig.certPath}`);
      console.log(`  - Key: ${mqttConfig.keyPath}`);
      console.log(`  - CA: ${mqttConfig.caPath}`);
      console.log('[MQTT] Running in OFFLINE mode - events will be buffered locally');
      this.startOfflineMode();
      return;
    }

    console.log(`[MQTT] Connecting to ${mqttConfig.endpoint}...`);

    this.device = awsIot.device({
      keyPath: mqttConfig.keyPath,
      certPath: mqttConfig.certPath,
      caPath: mqttConfig.caPath,
      clientId: mqttConfig.clientId,
      host: mqttConfig.endpoint
    });

    this.device.on('connect', () => {
      console.log('[MQTT] Connected to AWS IoT Core');
      this.connected = true;
      this.processBufferedEvents();
      this.startRetryTimer();
    });

    this.device.on('close', () => {
      console.log('[MQTT] Connection closed');
      this.connected = false;
    });

    this.device.on('reconnect', () => {
      console.log('[MQTT] Reconnecting...');
    });

    this.device.on('offline', () => {
      console.log('[MQTT] Offline');
      this.connected = false;
    });

    this.device.on('error', (error) => {
      console.error('[MQTT] Error:', error.message);
      this.connected = false;
    });
  }

  /**
   * Inicia el modo offline (sin conexión a AWS)
   */
  startOfflineMode() {
    console.log('[MQTT] Starting in offline mode - all events buffered');
    this.connected = false;
  }

  /**
   * Publica evento a AWS IoT Core
   */
  async publish(eventType, payload) {
    const topic = this.getTopic(eventType);

    if (!this.connected) {
      // Almacenar en buffer para reintento posterior
      console.log(`[MQTT] Offline - buffering ${eventType} event`);
      this.buffer.add(eventType, payload);
      return false;
    }

    try {
      await new Promise((resolve, reject) => {
        this.device.publish(topic, JSON.stringify(payload), { qos: 1 }, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      console.log(`[MQTT] Published ${eventType} to ${topic}`);
      return true;
    } catch (err) {
      console.error(`[MQTT] Publish failed: ${err.message}`);
      // Almacenar en buffer para reintento
      this.buffer.add(eventType, payload);
      return false;
    }
  }

  /**
   * Obtiene el topic para el tipo de evento
   */
  getTopic(eventType) {
    const mqttConfig = this.config.mqtt;
    const greenhouseId = this.config.greenhouseId;

    if (eventType === 'AGGREGATE') {
      return mqttConfig.topicTelemetry.replace('{greenhouseId}', greenhouseId);
    } else if (eventType === 'ALERT') {
      return mqttConfig.topicAlerts.replace('{greenhouseId}', greenhouseId);
    }

    return `greenhouse/${greenhouseId}/unknown`;
  }

  /**
   * Procesa eventos almacenados en buffer (reintento)
   */
  async processBufferedEvents() {
    if (!this.connected) return;

    const events = this.buffer.getReadyEvents(50);
    if (events.length === 0) return;

    console.log(`[MQTT] Processing ${events.length} buffered events...`);

    for (const event of events) {
      const topic = this.getTopic(event.eventType);

      try {
        await new Promise((resolve, reject) => {
          this.device.publish(topic, JSON.stringify(event.payload), { qos: 1 }, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });

        console.log(`[MQTT] Retry success: ${event.eventType} (id=${event.id})`);
        this.buffer.markSuccess(event.id);
      } catch (err) {
        console.error(`[MQTT] Retry failed: ${err.message} (id=${event.id})`);
        this.buffer.markFailed(event.id, err.message);
      }
    }

    const stats = this.buffer.getStats();
    if (stats.total > 0) {
      console.log(`[MQTT] Buffer status: ${stats.total} events remaining`);
    }
  }

  /**
   * Inicia temporizador de reintento periódico
   */
  startRetryTimer() {
    if (this.retryIntervalId) return;

    this.retryIntervalId = setInterval(() => {
      this.processBufferedEvents();
    }, 30000); // Verificar cada 30 segundos
  }

  /**
   * Detiene el temporizador de reintento
   */
  stopRetryTimer() {
    if (this.retryIntervalId) {
      clearInterval(this.retryIntervalId);
      this.retryIntervalId = null;
    }
  }

  /**
   * Desconecta
   */
  disconnect() {
    this.stopRetryTimer();
    if (this.device) {
      this.device.end();
      this.device = null;
    }
    console.log('[MQTT] Disconnected');
  }

  /**
   * Obtiene el estado de la conexión
   */
  isConnected() {
    return this.connected;
  }
}

module.exports = MQTTClient;
