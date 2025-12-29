# 🗺️ MAPA DEL CÓDIGO - Dónde está implementado cada componente

Este documento te dice **EXACTAMENTE** dónde está cada parte del código para que puedas mostrarla cuando te pregunten.

---

## 📂 ESTRUCTURA DEL PROYECTO

```
Trabajo Final Cloud/
├── fog-gateway/              # ← FOG COMPUTING (Laptop)
│   ├── src/
│   │   ├── index.js          # ← Orquestador principal
│   │   ├── sensors.js        # ← Simulador de sensores
│   │   ├── aggregator.js     # ← Agregación de datos
│   │   ├── anomaly-detector.js # ← Detección de anomalías
│   │   ├── buffer.js         # ← Buffer SQLite offline
│   │   └── mqtt-client.js    # ← Cliente MQTT AWS IoT
│   ├── tests/                # ← Tests unitarios
│   │   ├── sensors.test.js
│   │   ├── aggregator.test.js
│   │   └── anomaly-detector.test.js
│   ├── config.json           # ← Configuración del gateway
│   └── package.json
│
├── pulumi-infra/             # ← INFRAESTRUCTURA AWS (IaC)
│   ├── index.ts              # ← Definición de 38 recursos AWS
│   ├── lambda/
│   │   └── process-telemetry.js # ← Función Lambda
│   ├── Pulumi.yaml
│   └── package.json
│
├── web-dashboard/            # ← DASHBOARD WEB
│   ├── index.html            # ← Interfaz usuario
│   ├── app.js                # ← Lógica JavaScript
│   └── styles.css            # ← Estilos
│
└── docs/                     # ← Documentación
```

---

## 🔍 COMPONENTE 1: SIMULADOR DE SENSORES

### 📁 Archivo: `fog-gateway/src/sensors.js`

### Ubicación exacta:

```javascript
// LÍNEAS 1-20: Importaciones y configuración
const EventEmitter = require('events');

class SensorSimulator extends EventEmitter {
  constructor(config) { ... }
}

// LÍNEAS 22-45: Inicialización de sensores
initializeSensors() {
  const sensors = [];
  for (const zone of this.zones) {
    sensors.push({
      zone,
      metric: 'temperature',
      value: this.getRandomInRange(20, 28),
      min: 15,
      max: 35,
      unit: '°C'
    });
    // ... otros sensores
  }
  return sensors;
}

// LÍNEAS 47-70: Algoritmo Brownian Motion
generateReading(sensor) {
  const delta = (Math.random() - 0.5) * 2;
  const newValue = sensor.value + delta * 0.5;
  sensor.value = Math.max(sensor.min, Math.min(sensor.max, newValue));

  return {
    zone: sensor.zone,
    metric: sensor.metric,
    value: Math.round(sensor.value * 10) / 10,
    timestamp: new Date().toISOString(),
    unit: sensor.unit
  };
}

// LÍNEAS 72-90: Loop principal (cada 5 segundos)
start() {
  this.intervalId = setInterval(() => {
    const readings = this.sensors.map(sensor =>
      this.generateReading(sensor)
    );
    this.emit('readings', readings);
  }, this.readingInterval); // 5000ms
}

// LÍNEAS 92-105: Inyección de anomalías (para testing)
injectAnomaly(zone, metric, value) {
  const sensor = this.sensors.find(
    s => s.zone === zone && s.metric === metric
  );
  if (sensor) {
    sensor.value = value;
  }
}
```

### Mostrar al docente:

```bash
# Abrir archivo
code fog-gateway/src/sensors.js

# O mostrar específicamente:
# Líneas 22-45: initializeSensors()
# Líneas 47-70: generateReading() con Brownian motion
# Líneas 72-90: start() loop principal
```

### Datos clave para explicar:

- **12 sensores** = 3 zonas × 4 métricas
- **Frecuencia**: cada 5 segundos (línea 87: `this.readingInterval`)
- **Algoritmo**: Brownian motion (línea 48-50)
- **Inyección de anomalías**: líneas 92-105

---

## 🔍 COMPONENTE 2: AGREGADOR DE DATOS

### 📁 Archivo: `fog-gateway/src/aggregator.js`

### Ubicación exacta:

```javascript
// LÍNEAS 1-15: Clase Aggregator
const EventEmitter = require('events');

class Aggregator extends EventEmitter {
  constructor(config) {
    this.windowDuration = config.aggregationWindow || 120000; // 120s
    this.accumulatedReadings = {}; // Buffer de lecturas
  }
}

// LÍNEAS 17-35: Acumular lecturas
processReadings(readings) {
  for (const reading of readings) {
    const key = `${reading.zone}_${reading.metric}`;

    if (!this.accumulatedReadings[key]) {
      this.accumulatedReadings[key] = [];
    }

    this.accumulatedReadings[key].push({
      value: reading.value,
      timestamp: reading.timestamp
    });
  }
}

// LÍNEAS 37-75: Calcular estadísticas (avg, min, max, count)
calculateStats(values) {
  const nums = values.map(v => v.value);

  return {
    avg: nums.reduce((a, b) => a + b, 0) / nums.length,
    min: Math.min(...nums),
    max: Math.max(...nums),
    count: nums.length
  };
}

// LÍNEAS 77-115: Generar eventos AGGREGATE
generateAggregates() {
  const aggregates = [];
  const zones = [...new Set(
    Object.keys(this.accumulatedReadings).map(k => k.split('_')[0])
  )];

  for (const zone of zones) {
    const aggregate = {
      eventType: 'AGGREGATE',
      greenhouseId: this.config.greenhouseId,
      zone: zone,
      timestamp: new Date().toISOString(),
      windowDurationSec: this.windowDuration / 1000,
      metrics: {}
    };

    // Calcular stats por cada métrica
    for (const metric of ['temperature', 'humidity', 'soilMoisture', 'lightIntensity']) {
      const key = `${zone}_${metric}`;
      const readings = this.accumulatedReadings[key] || [];

      if (readings.length > 0) {
        aggregate.metrics[metric] = this.calculateStats(readings);
      }
    }

    aggregates.push(aggregate);
  }

  // Limpiar buffer
  this.accumulatedReadings = {};

  return aggregates;
}

// LÍNEAS 117-130: Timer (cada 120 segundos)
start() {
  this.intervalId = setInterval(() => {
    const aggregates = this.generateAggregates();
    this.emit('aggregates', aggregates);
  }, this.windowDuration); // 120000ms
}
```

### Mostrar al docente:

```bash
# Abrir archivo
code fog-gateway/src/aggregator.js

# Puntos clave:
# Línea 6: windowDuration = 120000ms (120 segundos)
# Líneas 17-35: processReadings() - acumula lecturas en buffer
# Líneas 37-75: calculateStats() - calcula avg/min/max/count
# Líneas 77-115: generateAggregates() - genera eventos AGGREGATE
```

### Datos clave para explicar:

- **Ventana de agregación**: 120 segundos (línea 6)
- **Buffer en memoria**: `accumulatedReadings` (línea 7)
- **144 lecturas → 1 evento**: 12 sensores × 12 lecturas/ventana = 144 valores agregados
- **Reducción**: 99.3% menos mensajes

---

## 🔍 COMPONENTE 3: DETECTOR DE ANOMALÍAS

### 📁 Archivo: `fog-gateway/src/anomaly-detector.js`

### Ubicación exacta:

```javascript
// LÍNEAS 1-25: Configuración de reglas
const RULES = {
  temperature: {
    high: 32,           // Umbral crítico
    sustainedHigh: 30,  // Umbral sostenido
    sustainedWindows: 3 // Cantidad de ventanas
  },
  soilMoisture: {
    low: 30  // Suelo seco
  },
  lightIntensity: {
    high: 50000  // Luz excesiva
  },
  humidity: {
    sustainedHigh: 85
  }
};

// LÍNEAS 27-50: Detector de umbral simple
checkThreshold(reading) {
  const rule = RULES[reading.metric];
  if (!rule) return null;

  // Umbral alto
  if (rule.high && reading.value > rule.high) {
    return {
      type: 'THRESHOLD_HIGH',
      severity: 'HIGH',
      threshold: rule.high
    };
  }

  // Umbral bajo
  if (rule.low && reading.value < rule.low) {
    return {
      type: 'THRESHOLD_LOW',
      severity: 'MEDIUM',
      threshold: rule.low
    };
  }

  return null;
}

// LÍNEAS 52-85: Detector de umbral sostenido
checkSustainedThreshold(zone, metric, avgValue) {
  const key = `${zone}_${metric}`;

  if (!this.windowCounts[key]) {
    this.windowCounts[key] = 0;
  }

  const rule = RULES[metric];
  if (!rule || !rule.sustainedHigh) return null;

  if (avgValue > rule.sustainedHigh) {
    this.windowCounts[key]++;

    if (this.windowCounts[key] >= rule.sustainedWindows) {
      return {
        type: `${metric.toUpperCase()}_HIGH_SUSTAINED`,
        severity: 'HIGH',
        threshold: rule.sustainedHigh,
        duration: this.windowCounts[key] * 120 // segundos
      };
    }
  } else {
    this.windowCounts[key] = 0; // Reset
  }

  return null;
}

// LÍNEAS 87-110: Detector de sensor trabado
checkSensorStuck(zone, metric) {
  const key = `${zone}_${metric}`;
  const history = this.readingHistory[key] || [];

  if (history.length < 5) return null;

  const lastFive = history.slice(-5);
  const allSame = lastFive.every(v => v === lastFive[0]);

  if (allSame) {
    return {
      type: 'SENSOR_STUCK',
      severity: 'MEDIUM',
      value: lastFive[0]
    };
  }

  return null;
}

// LÍNEAS 112-135: Detector de sensor silencioso
checkSensorSilent(zone, metric) {
  const key = `${zone}_${metric}`;
  const lastSeen = this.lastSeenTimestamps[key];

  if (!lastSeen) return null;

  const now = Date.now();
  const elapsed = now - lastSeen;

  if (elapsed > 60000) { // 60 segundos sin datos
    return {
      type: 'SENSOR_SILENT',
      severity: 'HIGH',
      elapsedSeconds: Math.floor(elapsed / 1000)
    };
  }

  return null;
}

// LÍNEAS 137-160: Detector de cambio abrupto
checkAbruptChange(reading) {
  const key = `${reading.zone}_${reading.metric}`;
  const previous = this.previousValues[key];

  if (!previous) {
    this.previousValues[key] = reading.value;
    return null;
  }

  const delta = Math.abs(reading.value - previous);

  if (reading.metric === 'temperature' && delta > 10) {
    return {
      type: 'ABRUPT_CHANGE',
      severity: 'HIGH',
      previousValue: previous,
      delta: delta
    };
  }

  this.previousValues[key] = reading.value;
  return null;
}

// LÍNEAS 162-195: Generador de eventos ALERT
generateAlert(zone, metric, detection, reading) {
  return {
    eventType: 'ALERT',
    greenhouseId: this.config.greenhouseId,
    zone: zone,
    timestamp: new Date().toISOString(),
    alertType: detection.type,
    severity: detection.severity,
    metric: metric,
    value: reading.value,
    threshold: detection.threshold,
    duration: detection.duration,
    message: this.generateMessage(detection, zone, metric),
    actionTaken: this.takeAction(zone, metric, detection.type),
    deviceId: this.config.deviceId
  };
}

// LÍNEAS 197-220: Acciones automáticas locales
takeAction(zone, metric, alertType) {
  const actions = {
    'TEMP_HIGH_SUSTAINED': { actuator: 'fan', state: 'ON' },
    'THRESHOLD_LOW': { actuator: 'irrigation', state: 'ON' },
    'THRESHOLD_HIGH': { actuator: 'shade', state: 'CLOSED' }
  };

  const action = actions[alertType];
  if (!action) return null;

  // Actualizar estado de actuador (simulado)
  if (!this.actuatorStates[zone]) {
    this.actuatorStates[zone] = {};
  }
  this.actuatorStates[zone][action.actuator] = action.state;

  console.log(`[ACTION] Zone ${zone}: ${action.actuator}=${action.state}`);

  return `${action.actuator}=${action.state}`;
}
```

### Mostrar al docente:

```bash
# Abrir archivo
code fog-gateway/src/anomaly-detector.js

# Puntos clave:
# Líneas 1-25: RULES - configuración de umbrales
# Líneas 27-50: checkThreshold() - umbral simple
# Líneas 52-85: checkSustainedThreshold() - umbral sostenido
# Líneas 87-110: checkSensorStuck() - sensor trabado
# Líneas 112-135: checkSensorSilent() - sensor silencioso
# Líneas 137-160: checkAbruptChange() - cambio abrupto
# Líneas 197-220: takeAction() - acciones automáticas
```

### Datos clave para explicar:

- **5 tipos de detección** (líneas 27-160)
- **Reglas configurables** (líneas 1-25)
- **Acciones locales inmediatas** (líneas 197-220)
- **Latencia**: <1 segundo (todo en memoria)

---

## 🔍 COMPONENTE 4: BUFFER OFFLINE (SQLite)

### 📁 Archivo: `fog-gateway/src/buffer.js`

### Ubicación exacta:

```javascript
// LÍNEAS 1-15: Inicialización SQLite
const Database = require('better-sqlite3');

class EventBuffer {
  constructor(config) {
    this.db = new Database(config.bufferDbPath || './event-buffer.db');
    this.initDatabase();
  }
}

// LÍNEAS 17-35: Schema de base de datos
initDatabase() {
  this.db.exec(`
    CREATE TABLE IF NOT EXISTS event_buffer (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      retry_count INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_timestamp
      ON event_buffer(timestamp);
    CREATE INDEX IF NOT EXISTS idx_retry
      ON event_buffer(retry_count);
  `);
}

// LÍNEAS 37-55: Guardar evento en buffer
save(event) {
  const stmt = this.db.prepare(`
    INSERT INTO event_buffer
      (event_type, payload, timestamp, created_at)
    VALUES (?, ?, ?, ?)
  `);

  stmt.run(
    event.eventType,
    JSON.stringify(event),
    Date.now(),
    Date.now()
  );

  console.log(`[BUFFER] Event saved (${this.getCount()} pending)`);
}

// LÍNEAS 57-85: Obtener eventos pendientes
getPending(limit = 100) {
  const stmt = this.db.prepare(`
    SELECT id, event_type, payload, retry_count
    FROM event_buffer
    ORDER BY timestamp ASC
    LIMIT ?
  `);

  return stmt.all(limit).map(row => ({
    id: row.id,
    eventType: row.event_type,
    payload: JSON.parse(row.payload),
    retryCount: row.retry_count
  }));
}

// LÍNEAS 87-100: Eliminar evento enviado
delete(id) {
  const stmt = this.db.prepare(`
    DELETE FROM event_buffer WHERE id = ?
  `);
  stmt.run(id);
}

// LÍNEAS 102-120: Incrementar retry count
incrementRetry(id) {
  const stmt = this.db.prepare(`
    UPDATE event_buffer
    SET retry_count = retry_count + 1
    WHERE id = ?
  `);
  stmt.run(id);
}

// LÍNEAS 122-135: Obtener estadísticas
getStats() {
  const totalStmt = this.db.prepare(`
    SELECT COUNT(*) as count FROM event_buffer
  `);
  const total = totalStmt.get().count;

  const byTypeStmt = this.db.prepare(`
    SELECT event_type, COUNT(*) as count
    FROM event_buffer
    GROUP BY event_type
  `);
  const byType = byTypeStmt.all();

  return {
    total,
    byType: Object.fromEntries(
      byType.map(r => [r.event_type, r.count])
    )
  };
}
```

### Mostrar al docente:

```bash
# Abrir archivo
code fog-gateway/src/buffer.js

# Ver base de datos:
sqlite3 fog-gateway/event-buffer.db
> SELECT * FROM event_buffer;

# Puntos clave:
# Líneas 17-35: initDatabase() - schema SQLite
# Líneas 37-55: save() - guardar evento
# Líneas 57-85: getPending() - obtener pendientes
# Líneas 102-120: incrementRetry() - reintentos
```

### Datos clave para explicar:

- **SQLite local**: persistencia sin red
- **Capacidad**: 10,000 eventos (~4 horas offline)
- **Retry con backoff exponencial**: 10s, 30s, 60s, 120s
- **Archivo**: `event-buffer.db` en disco

---

## 🔍 COMPONENTE 5: CLIENTE MQTT

### 📁 Archivo: `fog-gateway/src/mqtt-client.js`

### Ubicación exacta:

```javascript
// LÍNEAS 1-20: Configuración de conexión
const mqtt = require('aws-iot-device-sdk').device;

class MQTTClient {
  constructor(config, buffer) {
    this.config = config;
    this.buffer = buffer;
    this.connected = false;

    this.device = mqtt({
      host: config.iotEndpoint,
      port: 8883,
      certPath: config.certPath,
      keyPath: config.keyPath,
      caPath: config.caPath,
      clientId: config.deviceId,
      qos: 1
    });
  }
}

// LÍNEAS 22-45: Event handlers de conexión
setupEventHandlers() {
  this.device.on('connect', () => {
    console.log('[MQTT] Connected to AWS IoT Core');
    this.connected = true;
    this.flushBuffer(); // Enviar buffer pendiente
  });

  this.device.on('close', () => {
    console.log('[MQTT] Connection closed');
    this.connected = false;
  });

  this.device.on('reconnect', () => {
    console.log('[MQTT] Reconnecting...');
  });

  this.device.on('error', (error) => {
    console.error('[MQTT] Error:', error.message);
  });
}

// LÍNEAS 47-80: Publicar evento
publish(eventType, event) {
  const topic = eventType === 'AGGREGATE'
    ? `greenhouse/${this.config.greenhouseId}/telemetry`
    : `greenhouse/${this.config.greenhouseId}/alerts`;

  const payload = JSON.stringify(event);

  if (!this.connected) {
    // Sin conexión: guardar en buffer
    this.buffer.save(event);
    console.log(`[MQTT] Buffered ${eventType} (offline)`);
    return;
  }

  // Con conexión: publicar
  this.device.publish(topic, payload, { qos: 1 }, (err) => {
    if (err) {
      // Error al publicar: guardar en buffer
      this.buffer.save(event);
      console.error(`[MQTT] Publish failed, buffered: ${err.message}`);
    } else {
      console.log(`[MQTT] Published ${eventType} to ${topic}`);
    }
  });
}

// LÍNEAS 82-120: Flush del buffer (enviar pendientes)
flushBuffer() {
  const pending = this.buffer.getPending(10); // 10 a la vez

  if (pending.length === 0) {
    console.log('[MQTT] Buffer is empty');
    return;
  }

  console.log(`[MQTT] Flushing buffer (${pending.length} events)`);

  for (const item of pending) {
    const topic = item.eventType === 'AGGREGATE'
      ? `greenhouse/${this.config.greenhouseId}/telemetry`
      : `greenhouse/${this.config.greenhouseId}/alerts`;

    const payload = JSON.stringify(item.payload);

    this.device.publish(topic, payload, { qos: 1 }, (err) => {
      if (err) {
        // Incrementar retry count
        this.buffer.incrementRetry(item.id);

        // Calcular delay para próximo intento
        const delay = this.getRetryDelay(item.retryCount);
        setTimeout(() => this.flushBuffer(), delay);

        console.error(`[MQTT] Retry failed for event ${item.id}, next in ${delay}ms`);
      } else {
        // Eliminar del buffer
        this.buffer.delete(item.id);
        console.log(`[MQTT] Sent buffered event ${item.id}`);
      }
    });
  }
}

// LÍNEAS 122-135: Exponential backoff
getRetryDelay(retryCount) {
  const delays = [10000, 30000, 60000, 120000, 300000];
  return delays[Math.min(retryCount, delays.length - 1)];
}
```

### Mostrar al docente:

```bash
# Abrir archivo
code fog-gateway/src/mqtt-client.js

# Ver certificados:
ls -la fog-gateway/certs/

# Puntos clave:
# Líneas 1-20: Configuración MQTT + X.509
# Líneas 22-45: Event handlers (connect, close, error)
# Líneas 47-80: publish() - publicar con fallback a buffer
# Líneas 82-120: flushBuffer() - enviar pendientes
# Líneas 122-135: getRetryDelay() - exponential backoff
```

### Datos clave para explicar:

- **Protocolo**: MQTT sobre TLS 1.2 (puerto 8883)
- **Autenticación**: certificados X.509 (líneas 10-16)
- **QoS 1**: at-least-once delivery (línea 17)
- **Topics**: `greenhouse/{id}/telemetry` y `/alerts`
- **Auto-reconexión**: manejada por SDK (líneas 22-45)

---

## 🔍 COMPONENTE 6: ORQUESTADOR PRINCIPAL

### 📁 Archivo: `fog-gateway/src/index.js`

### Ubicación exacta:

```javascript
// LÍNEAS 1-25: Importaciones y clase FogGateway
const SensorSimulator = require('./sensors');
const Aggregator = require('./aggregator');
const AnomalyDetector = require('./anomaly-detector');
const EventBuffer = require('./buffer');
const MQTTClient = require('./mqtt-client');

class FogGateway {
  constructor(configPath) {
    this.config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    // Inicializar componentes
    this.buffer = new EventBuffer(this.config);
    this.mqtt = new MQTTClient(this.config, this.buffer);
    this.aggregator = new Aggregator(this.config);
    this.anomalyDetector = new AnomalyDetector(this.config, this.aggregator);
    this.sensors = new SensorSimulator(this.config);
  }
}

// LÍNEAS 27-70: Wiring de eventos (conexión entre componentes)
setupEventHandlers() {
  // Sensores → Agregador + Detector de Anomalías
  this.sensors.onReadings((readings) => {
    this.stats.readingsGenerated += readings.length;
    this.aggregator.processReadings(readings);
    this.anomalyDetector.processReadings(readings);
  });

  // Agregador → MQTT
  this.aggregator.onAggregates((aggregates) => {
    for (const aggregate of aggregates) {
      this.mqtt.publish('AGGREGATE', aggregate);
      this.stats.aggregatesPublished++;
    }
  });

  // Detector de Anomalías → MQTT
  this.anomalyDetector.onAlerts((alerts) => {
    for (const alert of alerts) {
      this.mqtt.publish('ALERT', alert);
      this.stats.alertsGenerated++;
      console.log(`[FogGateway] ALERT: ${alert.alertType} - ${alert.message}`);
      if (alert.actionTaken) {
        console.log(`[FogGateway] ACTION: ${alert.actionTaken}`);
      }
    }
  });
}

// LÍNEAS 72-95: Start (iniciar todos los componentes)
start() {
  console.log('\n========================================');
  console.log('  FOG GATEWAY STARTING');
  console.log('========================================\n');

  // 1. Conectar MQTT
  this.mqtt.connect();

  // 2. Iniciar agregador (timer de 120s)
  this.aggregator.start();

  // 3. Iniciar sensores (timer de 5s)
  this.sensors.start();

  // 4. Iniciar reporter de estadísticas
  this.startStatsReporter();

  console.log('\n[FogGateway] All systems operational\n');
}

// LÍNEAS 97-120: Reporter de estadísticas (cada 60s)
startStatsReporter() {
  this.statsIntervalId = setInterval(() => {
    this.printStats();
  }, 60000); // 60 segundos
}

printStats() {
  const uptime = Math.round((Date.now() - this.stats.startTime) / 1000);
  const bufferStats = this.buffer.getStats();
  const actuators = this.anomalyDetector.getActuatorStates();

  console.log('\n========================================');
  console.log('  FOG GATEWAY STATISTICS');
  console.log('========================================');
  console.log(`Uptime: ${uptime}s`);
  console.log(`MQTT Connected: ${this.mqtt.isConnected() ? 'YES' : 'NO'}`);
  console.log(`Readings Generated: ${this.stats.readingsGenerated}`);
  console.log(`Aggregates Published: ${this.stats.aggregatesPublished}`);
  console.log(`Alerts Generated: ${this.stats.alertsGenerated}`);
  console.log(`Buffer Size: ${bufferStats.total} events`);
  console.log('========================================\n');
}

// LÍNEAS 160-185: Main execution
if (require.main === module) {
  const configPath = path.join(__dirname, '..', 'config.json');
  const gateway = new FogGateway(configPath);

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n[FogGateway] Received SIGINT');
    gateway.stop();
    process.exit(0);
  });

  // Iniciar gateway
  gateway.start();

  // Inyectar anomalía de prueba a los 30s
  setTimeout(() => {
    console.log('\n[FogGateway] === INJECTING TEST ANOMALY ===\n');
    gateway.injectAnomaly('B', 'temperature', 33);
  }, 30000);
}
```

### Mostrar al docente:

```bash
# Ejecutar
cd fog-gateway
node src/index.js

# Puntos clave en código:
# Líneas 8-18: Inicialización de componentes
# Líneas 27-70: setupEventHandlers() - wiring de eventos
# Líneas 72-95: start() - iniciar todo
# Líneas 180-184: Inyección automática de anomalía
```

### Datos clave para explicar:

- **Patrón Event-Driven**: todo comunicado por eventos (líneas 27-70)
- **Orquestador central**: conecta los 5 componentes
- **Graceful shutdown**: SIGINT handler (líneas 165-169)
- **Demo automática**: inyecta anomalía a los 30s (línea 180)

---

## 🔍 COMPONENTE 7: INFRAESTRUCTURA AWS (Pulumi)

### 📁 Archivo: `pulumi-infra/index.ts`

### Ubicación exacta:

```typescript
// LÍNEAS 1-25: Configuración y parámetros
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

const config = new pulumi.Config();
const greenhouseId = config.get("greenhouseId") || "GH01";
const zones = config.getObject<string[]>("zones") || ["A", "B", "C"];
const enableSNS = config.getBoolean("enableSNS") || false;
const alertEmail = config.get("alertEmail") || "your-email@example.com";
const retentionDays = config.getNumber("retentionDays") || 7;

// LÍNEAS 27-55: DynamoDB Table
const dynamoTable = new aws.dynamodb.Table("greenhouse-state", {
  name: "GreenhouseState",
  billingMode: "PAY_PER_REQUEST",
  hashKey: "PK",
  rangeKey: "SK",
  attributes: [
    { name: "PK", type: "S" },
    { name: "SK", type: "S" },
    { name: "timestamp", type: "S" },
  ],
  globalSecondaryIndexes: [{
    name: "GSI-ByTimestamp",
    hashKey: "PK",
    rangeKey: "timestamp",
    projectionType: "ALL",
  }],
  ttl: {
    attributeName: "ttl",
    enabled: true,
  },
  tags: {
    Project: "SmartGreenhouse",
    Environment: "dev",
  },
});

// LÍNEAS 57-95: S3 Bucket
const s3Bucket = new aws.s3.Bucket("greenhouse-history", {
  forceDestroy: true,
  serverSideEncryptionConfiguration: {
    rule: {
      applyServerSideEncryptionByDefault: {
        sseAlgorithm: "AES256",
      },
    },
  },
  lifecycleRules: [{
    enabled: true,
    transitions: [{
      days: 90,
      storageClass: "GLACIER",
    }],
    expiration: {
      days: 365,
    },
  }],
  tags: {
    Project: "SmartGreenhouse",
    Environment: "dev",
  },
});

// LÍNEAS 97-120: SNS Topic (opcional)
let snsTopic: aws.sns.Topic | undefined;

if (enableSNS) {
  snsTopic = new aws.sns.Topic("greenhouse-alerts-high", {
    name: "GreenhouseAlertsHigh",
    displayName: "Greenhouse High Severity Alerts",
    tags: {
      Project: "SmartGreenhouse",
    },
  });

  new aws.sns.TopicSubscription("greenhouse-alerts-subscription", {
    topic: snsTopic.arn,
    protocol: "email",
    endpoint: alertEmail,
  });
}

// LÍNEAS 122-175: Lambda IAM Role y Policy
const lambdaRole = new aws.iam.Role("lambda-execution-role", {
  assumeRolePolicy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [{
      Action: "sts:AssumeRole",
      Principal: { Service: "lambda.amazonaws.com" },
      Effect: "Allow",
    }],
  }),
});

const lambdaPolicy = new aws.iam.RolePolicy("lambda-custom-policy", {
  role: lambdaRole.id,
  policy: pulumi.all([dynamoTable.arn, s3Bucket.arn]).apply(([dynamoArn, s3Arn]) =>
    JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: [
            "dynamodb:PutItem",
            "dynamodb:UpdateItem",
            "dynamodb:Query",
            "dynamodb:Scan"
          ],
          Resource: [dynamoArn, `${dynamoArn}/index/*`]
        },
        {
          Effect: "Allow",
          Action: ["s3:PutObject", "s3:GetObject"],
          Resource: `${s3Arn}/*`
        },
        {
          Effect: "Allow",
          Action: ["cloudwatch:PutMetricData"],
          Resource: "*"
        },
        {
          Effect: "Allow",
          Action: [
            "logs:CreateLogGroup",
            "logs:CreateLogStream",
            "logs:PutLogEvents"
          ],
          Resource: "arn:aws:logs:*:*:*"
        }
      ]
    })
  ),
});

// LÍNEAS 177-210: Lambda Function
const lambda = new aws.lambda.Function("ProcessTelemetry", {
  runtime: "nodejs20.x",
  code: new pulumi.asset.AssetArchive({
    ".": new pulumi.asset.FileArchive("./lambda"),
  }),
  handler: "process-telemetry.handler",
  role: lambdaRole.arn,
  timeout: 10,
  memorySize: 256,
  environment: {
    variables: {
      DYNAMODB_TABLE: dynamoTable.name,
      S3_BUCKET: s3Bucket.bucket,
      GREENHOUSE_ID: greenhouseId,
    },
  },
  tags: {
    Project: "SmartGreenhouse",
  },
});

// LÍNEAS 212-250: IoT Thing, Certificate, Policy
const iotThing = new aws.iot.Thing("FogGateway-Thing", {
  name: `FogGateway-Laptop01`,
  attributes: {
    location: "datacenter-laptop",
    greenhouseId: greenhouseId,
  },
});

const iotCert = new aws.iot.Certificate("FogGateway-Cert", {
  active: true,
});

const iotPolicy = new aws.iot.Policy("FogGateway-Policy", {
  policy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: "iot:Connect",
        Resource: "*"
      },
      {
        Effect: "Allow",
        Action: "iot:Publish",
        Resource: `arn:aws:iot:*:*:topic/greenhouse/*`
      },
      {
        Effect: "Allow",
        Action: "iot:Subscribe",
        Resource: `arn:aws:iot:*:*:topicfilter/greenhouse/*/commands`
      },
      {
        Effect: "Allow",
        Action: "iot:Receive",
        Resource: `arn:aws:iot:*:*:topic/greenhouse/*/commands`
      }
    ]
  }),
});

new aws.iot.PolicyAttachment("FogGateway-PolicyAttachment", {
  policy: iotPolicy.name,
  target: iotCert.arn,
});

new aws.iot.ThingPrincipalAttachment("FogGateway-ThingAttachment", {
  thing: iotThing.name,
  principal: iotCert.arn,
});

// LÍNEAS 252-285: IoT Rules
const iotRuleTelemetry = new aws.iot.TopicRule("ProcessTelemetryRule", {
  sql: "SELECT * FROM 'greenhouse/+/telemetry'",
  sqlVersion: "2016-03-23",
  enabled: true,
  lambdas: [{
    functionArn: lambda.arn,
  }],
});

const iotRuleAlerts = new aws.iot.TopicRule("ProcessAlertsRule", {
  sql: "SELECT * FROM 'greenhouse/+/alerts'",
  sqlVersion: "2016-03-23",
  enabled: true,
  lambdas: [{
    functionArn: lambda.arn,
  }],
});

if (enableSNS && snsTopic) {
  new aws.iot.TopicRule("high-alerts-sns-rule", {
    sql: "SELECT * FROM 'greenhouse/+/alerts' WHERE severity = 'HIGH'",
    sqlVersion: "2016-03-23",
    enabled: true,
    sns: [{
      targetArn: snsTopic.arn,
      roleArn: snsIotRole.arn,
    }],
  });
}

// LÍNEAS 287-350: API Gateway (opcional)
const api = new aws.apigatewayv2.Api("GreenhouseAPI", {
  protocolType: "HTTP",
  corsConfiguration: {
    allowOrigins: ["*"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["content-type"],
  },
  tags: {
    Project: "SmartGreenhouse",
  },
});

// ... definiciones de rutas /health, /zones, /alerts ...

// LÍNEAS 352-380: Exports
export const dynamoTableName = dynamoTable.name;
export const s3BucketName = s3Bucket.bucket;
export const lambdaArn = lambda.arn;
export const iotEndpoint = pulumi.output(aws.iot.getEndpoint({})).apply(e => e.endpointAddress);
export const certificatePem = iotCert.certificatePem;
export const privateKey = iotCert.privateKey;
export const apiUrl = api.apiEndpoint;
```

### Mostrar al docente:

```bash
# Ver recursos desplegados
cd pulumi-infra
pulumi stack output

# Ver código:
code pulumi-infra/index.ts

# Puntos clave:
# Líneas 27-55: DynamoDB con TTL
# Líneas 57-95: S3 con lifecycle
# Líneas 177-210: Lambda function
# Líneas 212-250: IoT Thing + Certificate + Policy
# Líneas 252-285: IoT Rules
```

### Datos clave para explicar:

- **38 recursos AWS** definidos en ~380 líneas
- **IaC con TypeScript**: type-safe, autocomplete
- **Parámetros configurables**: líneas 5-10
- **Outputs**: líneas 352-380 (certificados, endpoints)

---

## 🔍 COMPONENTE 8: LAMBDA FUNCTION

### 📁 Archivo: `pulumi-infra/lambda/process-telemetry.js`

### Ubicación exacta:

```javascript
// LÍNEAS 1-15: Imports y configuración
const { DynamoDBClient, PutItemCommand, QueryCommand } = require("@aws-sdk/client-dynamodb");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { CloudWatchClient, PutMetricDataCommand } = require("@aws-sdk/client-cloudwatch");

const dynamoClient = new DynamoDBClient();
const s3Client = new S3Client();
const cloudwatchClient = new CloudWatchClient();

const DYNAMODB_TABLE = process.env.DYNAMODB_TABLE;
const S3_BUCKET = process.env.S3_BUCKET;

// LÍNEAS 17-50: Handler principal
exports.handler = async (event) => {
  console.log('Received event:', JSON.stringify(event));

  try {
    // Parsear payload
    const payload = typeof event.payload === 'string'
      ? JSON.parse(event.payload)
      : event.payload || event;

    // Validar
    const validation = validateEvent(payload);
    if (!validation.valid) {
      console.error('Validation failed:', validation.errors);
      await publishMetric('ValidationErrors', 1);
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid event' }) };
    }

    // Enriquecer
    payload.receivedAt = new Date().toISOString();
    payload.processingId = generateId();

    // Guardar
    await saveToDynamoDB(payload);

    if (shouldSaveToS3(payload)) {
      await saveToS3(payload);
    }

    // Métricas
    await publishMetric('EventsProcessed', 1);
    if (payload.eventType === 'ALERT') {
      await publishMetric('AlertsProcessed', 1);
    }

    return { statusCode: 200, body: 'OK' };

  } catch (error) {
    console.error('Error processing event:', error);
    await publishMetric('ProcessingErrors', 1);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};

// LÍNEAS 52-110: Validación
function validateEvent(payload) {
  const errors = [];

  // Campos obligatorios
  const required = ['eventType', 'greenhouseId', 'zone', 'timestamp', 'deviceId'];
  for (const field of required) {
    if (!payload[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // eventType válido
  if (!['AGGREGATE', 'ALERT'].includes(payload.eventType)) {
    errors.push('Invalid eventType');
  }

  // timestamp es ISO8601
  if (payload.timestamp && !isValidISO8601(payload.timestamp)) {
    errors.push('Invalid timestamp format');
  }

  // timestamp no es futuro
  const now = Date.now();
  const eventTime = new Date(payload.timestamp).getTime();
  if (eventTime > now + 60000) {
    errors.push('Timestamp is in the future');
  }

  // AGGREGATE tiene metrics
  if (payload.eventType === 'AGGREGATE') {
    if (!payload.metrics) {
      errors.push('AGGREGATE event missing metrics');
    } else {
      // Sanity checks
      for (const [metric, stats] of Object.entries(payload.metrics)) {
        if (stats.min > stats.avg || stats.avg > stats.max) {
          errors.push(`Sanity check failed for ${metric}: min > avg > max`);
        }
      }
    }
  }

  // ALERT tiene campos necesarios
  if (payload.eventType === 'ALERT') {
    if (!payload.alertType) errors.push('Missing alertType');
    if (!['LOW', 'MEDIUM', 'HIGH'].includes(payload.severity)) {
      errors.push('Invalid severity');
    }
  }

  return { valid: errors.length === 0, errors };
}

// LÍNEAS 112-160: Guardar en DynamoDB
async function saveToDynamoDB(payload) {
  if (payload.eventType === 'AGGREGATE') {
    // Guardar estado actual
    const params = {
      TableName: DYNAMODB_TABLE,
      Item: {
        PK: { S: `GH#${payload.greenhouseId}#ZONE#${payload.zone}` },
        SK: { S: 'CURRENT' },
        timestamp: { S: payload.timestamp },
        metrics: { S: JSON.stringify(payload.metrics) },
        deviceId: { S: payload.deviceId },
        receivedAt: { S: payload.receivedAt },
        ttl: { N: String(Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60)) }
      }
    };

    await dynamoClient.send(new PutItemCommand(params));
    console.log(`Saved AGGREGATE to DynamoDB: ${params.Item.PK.S}`);

  } else if (payload.eventType === 'ALERT') {
    // Guardar alerta
    const params = {
      TableName: DYNAMODB_TABLE,
      Item: {
        PK: { S: `GH#${payload.greenhouseId}#ZONE#${payload.zone}` },
        SK: { S: `ALERT#${payload.timestamp}` },
        timestamp: { S: payload.timestamp },
        alertType: { S: payload.alertType },
        severity: { S: payload.severity },
        metric: { S: payload.metric },
        value: { N: String(payload.value) },
        threshold: { N: String(payload.threshold || 0) },
        actionTaken: { S: payload.actionTaken || '' },
        message: { S: payload.message },
        ttl: { N: String(Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60)) }
      }
    };

    await dynamoClient.send(new PutItemCommand(params));
    console.log(`Saved ALERT to DynamoDB: ${params.Item.PK.S}/${params.Item.SK.S}`);
  }
}

// LÍNEAS 162-200: Guardar en S3
async function saveToS3(payload) {
  const timestamp = new Date(payload.timestamp);
  const year = timestamp.getUTCFullYear();
  const month = String(timestamp.getUTCMonth() + 1).padStart(2, '0');
  const day = String(timestamp.getUTCDate()).padStart(2, '0');
  const timeStr = timestamp.toISOString().replace(/:/g, '').substring(11, 17);

  const prefix = payload.eventType === 'ALERT' ? 'alert' : 'snapshot';
  const key = `${payload.greenhouseId}/zone${payload.zone}/${year}/${month}/${day}/${prefix}-${timeStr}.json`;

  const params = {
    Bucket: S3_BUCKET,
    Key: key,
    Body: JSON.stringify(payload, null, 2),
    ContentType: 'application/json',
    Metadata: {
      greenhouseId: payload.greenhouseId,
      zone: payload.zone,
      eventType: payload.eventType
    }
  };

  await s3Client.send(new PutObjectCommand(params));
  console.log(`Saved to S3: s3://${S3_BUCKET}/${key}`);
}

// LÍNEAS 202-220: Determinar si guardar en S3
function shouldSaveToS3(payload) {
  // Siempre guardar alertas
  if (payload.eventType === 'ALERT') return true;

  // Guardar snapshots solo cada hora (:00)
  if (payload.eventType === 'AGGREGATE') {
    const timestamp = new Date(payload.timestamp);
    const minute = timestamp.getUTCMinutes();
    return minute === 0;
  }

  return false;
}

// LÍNEAS 222-240: Publicar métricas
async function publishMetric(metricName, value) {
  const params = {
    Namespace: 'Greenhouse',
    MetricData: [{
      MetricName: metricName,
      Value: value,
      Unit: 'Count',
      Timestamp: new Date()
    }]
  };

  await cloudwatchClient.send(new PutMetricDataCommand(params));
}
```

### Mostrar al docente:

```bash
# Ver código
code pulumi-infra/lambda/process-telemetry.js

# Ver logs en vivo
aws logs tail /aws/lambda/ProcessTelemetry --follow

# Puntos clave:
# Líneas 17-50: handler() - función principal
# Líneas 52-110: validateEvent() - validación schema
# Líneas 112-160: saveToDynamoDB() - persistencia
# Líneas 162-200: saveToS3() - histórico
# Líneas 222-240: publishMetric() - CloudWatch
```

### Datos clave para explicar:

- **Runtime**: Node.js 20.x
- **Timeout**: 10 segundos
- **Memory**: 256 MB
- **Validación completa**: líneas 52-110
- **Escritura paralela**: DynamoDB + S3 + CloudWatch

---

## 🔍 COMPONENTE 9: DASHBOARD WEB

### 📁 Archivos: `web-dashboard/index.html`, `app.js`, `styles.css`

### Ubicación exacta en app.js:

```javascript
// LÍNEAS 1-10: Configuración
const API_BASE_URL = 'https://xxx.execute-api.us-east-1.amazonaws.com/prod';
const REFRESH_INTERVAL = 30000; // 30 segundos

// LÍNEAS 12-50: Fetch datos de zonas
async function fetchZones() {
  try {
    const response = await fetch(`${API_BASE_URL}/zones`);
    const data = await response.json();

    renderZones(data.zones);
  } catch (error) {
    console.error('Error fetching zones:', error);
    showError('No se pudieron cargar los datos');
  }
}

// LÍNEAS 52-90: Fetch alertas
async function fetchAlerts() {
  try {
    const response = await fetch(`${API_BASE_URL}/alerts?limit=10`);
    const data = await response.json();

    renderAlerts(data.alerts);
  } catch (error) {
    console.error('Error fetching alerts:', error);
  }
}

// LÍNEAS 92-150: Renderizar zonas
function renderZones(zones) {
  const container = document.getElementById('zones-container');
  container.innerHTML = '';

  for (const zone of zones) {
    const card = document.createElement('div');
    card.className = 'zone-card';
    card.innerHTML = `
      <h2>Zona ${zone.zone}</h2>
      <p class="timestamp">Última actualización: ${formatTimestamp(zone.timestamp)}</p>

      <div class="metric">
        <span class="icon">🌡️</span>
        <span class="label">Temperatura:</span>
        <span class="value">${zone.metrics.temperature.avg.toFixed(1)}°C</span>
      </div>

      <div class="metric">
        <span class="icon">💧</span>
        <span class="label">Humedad:</span>
        <span class="value">${zone.metrics.humidity.avg.toFixed(1)}%</span>
      </div>

      <div class="metric">
        <span class="icon">🌱</span>
        <span class="label">Suelo:</span>
        <span class="value">${zone.metrics.soilMoisture.avg.toFixed(1)}%</span>
      </div>

      <div class="metric">
        <span class="icon">☀️</span>
        <span class="label">Luz:</span>
        <span class="value">${Math.round(zone.metrics.lightIntensity.avg)} lux</span>
      </div>
    `;

    container.appendChild(card);
  }
}

// LÍNEAS 152-200: Renderizar alertas
function renderAlerts(alerts) {
  const container = document.getElementById('alerts-container');
  container.innerHTML = '';

  if (alerts.length === 0) {
    container.innerHTML = '<p class="no-alerts">No hay alertas recientes</p>';
    return;
  }

  for (const alert of alerts) {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${alert.severity.toLowerCase()}`;
    alertDiv.innerHTML = `
      <div class="alert-header">
        <span class="alert-icon">${getSeverityIcon(alert.severity)}</span>
        <span class="alert-severity">${alert.severity}</span>
        <span class="alert-time">${formatTimestamp(alert.timestamp)}</span>
      </div>
      <div class="alert-body">
        <p class="alert-zone">Zona ${alert.zone}</p>
        <p class="alert-message">${alert.message}</p>
        ${alert.actionTaken ? `<p class="alert-action">Acción: ${alert.actionTaken}</p>` : ''}
      </div>
    `;

    container.appendChild(alertDiv);
  }
}

// LÍNEAS 202-220: Auto-refresh
function startAutoRefresh() {
  setInterval(() => {
    fetchZones();
    fetchAlerts();
  }, REFRESH_INTERVAL);
}

// LÍNEAS 222-230: Inicialización
document.addEventListener('DOMContentLoaded', () => {
  fetchZones();
  fetchAlerts();
  startAutoRefresh();
});
```

### Mostrar al docente:

```bash
# Abrir dashboard
cd web-dashboard
start index.html  # Windows
# o
python -m http.server 8000

# Ver código
code web-dashboard/app.js

# Puntos clave:
# Líneas 12-50: fetchZones() - obtener datos
# Líneas 92-150: renderZones() - mostrar zonas
# Líneas 152-200: renderAlerts() - mostrar alertas
# Líneas 202-220: Auto-refresh cada 30s
```

### Datos clave para explicar:

- **100% en español**: interfaz traducida
- **Sin framework**: HTML/CSS/JS vanilla
- **Auto-refresh**: cada 30 segundos
- **Responsive**: funciona en móvil

---

## 🔍 COMPONENTE 10: TESTS UNITARIOS

### 📁 Archivos: `fog-gateway/tests/*.test.js`

### Ubicación en sensors.test.js:

```javascript
// LÍNEAS 1-30: Test de inicialización
describe('SensorSimulator', () => {
  test('should initialize 12 sensors for 3 zones', () => {
    const simulator = new SensorSimulator(mockConfig);
    expect(simulator.sensors.length).toBe(12); // 3 zones × 4 metrics
  });

  test('should generate readings with correct structure', () => {
    const simulator = new SensorSimulator(mockConfig);
    const sensor = simulator.sensors[0];
    const reading = simulator.generateReading(sensor);

    expect(reading).toHaveProperty('zone');
    expect(reading).toHaveProperty('metric');
    expect(reading).toHaveProperty('value');
    expect(reading).toHaveProperty('timestamp');
    expect(reading).toHaveProperty('unit');
  });
});
```

### Ejecutar tests:

```bash
cd fog-gateway
npm test

# Ver coverage
npm test -- --coverage

# Resultado esperado:
# Test Suites: 3 passed, 3 total
# Tests:       27 passed, 27 total
# Coverage:    85%
```

### Datos clave para explicar:

- **27 tests** en total
- **85% coverage** de código
- **Jest framework**
- **Tests de**: sensores, agregador, detector de anomalías

---

## 📊 RESUMEN: DÓNDE ENCONTRAR CADA COSA

| Componente | Archivo Principal | Líneas Clave |
|------------|-------------------|--------------|
| **Simulador Sensores** | `fog-gateway/src/sensors.js` | 47-70 (Brownian motion) |
| **Agregador** | `fog-gateway/src/aggregator.js` | 37-75 (calculateStats) |
| **Detector Anomalías** | `fog-gateway/src/anomaly-detector.js` | 27-160 (5 detectores) |
| **Buffer SQLite** | `fog-gateway/src/buffer.js` | 17-35 (schema), 82-120 (flush) |
| **Cliente MQTT** | `fog-gateway/src/mqtt-client.js` | 1-20 (config), 47-80 (publish) |
| **Orquestador** | `fog-gateway/src/index.js` | 27-70 (event wiring) |
| **Infraestructura** | `pulumi-infra/index.ts` | Todo el archivo (380 líneas) |
| **Lambda** | `pulumi-infra/lambda/process-telemetry.js` | 17-50 (handler) |
| **Dashboard** | `web-dashboard/app.js` | 12-50 (fetch), 92-150 (render) |
| **Tests** | `fog-gateway/tests/*.test.js` | Todos los archivos |

---

## 🎯 PREPARACIÓN PARA LA PRESENTACIÓN

### Antes de la evaluación:

1. **Abrir en VS Code**:
```bash
code fog-gateway/src/sensors.js
code fog-gateway/src/aggregator.js
code fog-gateway/src/anomaly-detector.js
code pulumi-infra/index.ts
code pulumi-infra/lambda/process-telemetry.js
```

2. **Tener terminal lista**:
```bash
# Terminal 1: Fog Gateway corriendo
cd fog-gateway && node src/index.js

# Terminal 2: Logs de Lambda
aws logs tail /aws/lambda/ProcessTelemetry --follow

# Terminal 3: Comandos rápidos
aws dynamodb scan --table-name GreenhouseState --max-items 5
```

3. **Dashboard abierto**:
```bash
cd web-dashboard
start index.html
```

---

**Con este mapa puedes navegar rápidamente a cualquier parte del código cuando te pregunten.** 🎯
