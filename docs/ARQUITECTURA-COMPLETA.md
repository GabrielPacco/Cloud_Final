# 🏗️ ARQUITECTURA COMPLETA - Flujo de Datos Extremo a Extremo

Este documento explica **TODO el recorrido de los datos** desde que se generan en los sensores simulados hasta que se almacenan y visualizan en AWS.

---

## 📍 VISIÓN GENERAL

```
┌─────────────────────────────────────────────────────────────────────┐
│                     TU LAPTOP (FOG LAYER)                           │
│                                                                     │
│  ┌──────────┐    ┌───────────┐    ┌──────────┐    ┌──────────┐   │
│  │ Sensores │───▶│ Agregador │───▶│ Detector │───▶│  Buffer  │   │
│  │  (12)    │    │ (120s)    │    │ Anomalías│    │  SQLite  │   │
│  └──────────┘    └───────────┘    └──────────┘    └─────┬────┘   │
│                                           │               │         │
│                                           ↓               │         │
│                                    ┌─────────────┐        │         │
│                                    │   MQTT      │←───────┘         │
│                                    │  Cliente    │                  │
│                                    └──────┬──────┘                  │
└───────────────────────────────────────────┼─────────────────────────┘
                                            │
                                    Internet (TLS + X.509)
                                            │
┌───────────────────────────────────────────┼─────────────────────────┐
│                         AWS CLOUD                                   │
│                                           ↓                         │
│                                    ┌─────────────┐                  │
│                                    │  IoT Core   │                  │
│                                    │   (MQTT)    │                  │
│                                    └──────┬──────┘                  │
│                                           │                         │
│                                    ┌──────┴──────┐                  │
│                                    │  IoT Rules  │                  │
│                                    └──────┬──────┘                  │
│                                           │                         │
│                                           ↓                         │
│                                    ┌─────────────┐                  │
│                                    │   Lambda    │                  │
│                                    │ ProcessTel. │                  │
│                                    └──────┬──────┘                  │
│                                           │                         │
│                    ┌──────────────────────┼──────────────────┐     │
│                    ↓                      ↓                  ↓     │
│             ┌──────────┐          ┌──────────┐       ┌──────────┐ │
│             │ DynamoDB │          │    S3    │       │CloudWatch│ │
│             │  Estado  │          │Histórico │       │   Logs   │ │
│             └──────────┘          └──────────┘       └──────────┘ │
│                    │                                                │
│                    ↓                                                │
│          ┌──────────────────┐                                      │
│          │   API Gateway    │                                      │
│          │   (REST API)     │                                      │
│          └──────────────────┘                                      │
│                    │                                                │
└────────────────────┼────────────────────────────────────────────────┘
                     │
                     ↓
              ┌─────────────┐
              │  Dashboard  │
              │     Web     │
              └─────────────┘
```

---

## 🔢 FASE 1: GENERACIÓN DE DATOS (Sensores Simulados)

### 📁 Archivo: `fog-gateway/src/sensors.js`

### ¿Qué hace?

Simula 12 sensores IoT distribuidos en 3 zonas de invernadero.

### Datos generados:

```javascript
// ZONA A
sensor_A_temperature    → 15-35°C (varía con Brownian motion)
sensor_A_humidity       → 40-80%
sensor_A_soilMoisture   → 20-70%
sensor_A_lightIntensity → 8000-15000 lux

// ZONA B
sensor_B_temperature    → 15-35°C
sensor_B_humidity       → 40-80%
sensor_B_soilMoisture   → 20-70%
sensor_B_lightIntensity → 8000-15000 lux

// ZONA C
sensor_C_temperature    → 15-35°C
sensor_C_humidity       → 40-80%
sensor_C_soilMoisture   → 20-70%
sensor_C_lightIntensity → 8000-15000 lux
```

### Frecuencia:
⏰ **Cada 5 segundos**

### Algoritmo:
```javascript
// Brownian motion (movimiento aleatorio suave)
newValue = previousValue + random(-1, +1) * 0.5
// Limita a rangos realistas
clamp(newValue, min, max)
```

### Ejemplo de salida:

```javascript
[
  {
    zone: 'A',
    metric: 'temperature',
    value: 24.5,
    timestamp: '2025-12-28T10:15:00.000Z',
    unit: '°C'
  },
  {
    zone: 'A',
    metric: 'humidity',
    value: 65.3,
    timestamp: '2025-12-28T10:15:00.000Z',
    unit: '%'
  },
  // ... 10 más (4 métricas × 3 zonas = 12 sensores)
]
```

### Volumen de datos:
```
12 sensores × 12 lecturas/minuto = 144 lecturas/minuto
144 × 60 min × 24 h = 207,360 lecturas/día

Si enviáramos TODO esto a AWS:
207,360 mensajes/día × 30 días = 6,220,800 mensajes/mes
Costo estimado: ~$5/mes (excede Free Tier)
```

---

## 📊 FASE 2: AGREGACIÓN LOCAL (Reducción de Datos)

### 📁 Archivo: `fog-gateway/src/aggregator.js`

### ¿Qué hace?

Acumula lecturas durante **120 segundos** y calcula estadísticas.

### Proceso:

```
Segundos 0-5:
  Recibe 12 lecturas → las guarda en memoria

Segundos 5-10:
  Recibe 12 lecturas → las agrega a la lista

Segundos 10-15:
  Recibe 12 lecturas → las agrega a la lista

... (continúa acumulando)

Segundo 120:
  - Tiene 144 lecturas acumuladas (12 × 24)
  - Calcula por zona y métrica:
    • avg (promedio)
    • min (mínimo)
    • max (máximo)
    • count (cantidad de lecturas)
  - Genera 3 eventos AGGREGATE (uno por zona)
  - Limpia el buffer de acumulación
  - Reinicia el ciclo
```

### Ejemplo de cálculo:

```javascript
// Lecturas de temperatura en Zona A durante 120s
[24.1, 24.3, 24.5, 24.2, 24.6, 24.4, ..., 24.7] // 24 valores

// Agregación:
{
  zone: 'A',
  metric: 'temperature',
  avg: 24.5,    // promedio de los 24 valores
  min: 23.8,    // valor mínimo
  max: 25.1,    // valor máximo
  count: 24     // cantidad de lecturas
}
```

### Evento AGGREGATE generado:

```json
{
  "eventType": "AGGREGATE",
  "greenhouseId": "GH01",
  "zone": "A",
  "timestamp": "2025-12-28T10:17:00.000Z",
  "windowDurationSec": 120,
  "metrics": {
    "temperature": {
      "avg": 24.5,
      "min": 23.8,
      "max": 25.1,
      "count": 24
    },
    "humidity": {
      "avg": 65.3,
      "min": 62.1,
      "max": 68.4,
      "count": 24
    },
    "soilMoisture": {
      "avg": 45.2,
      "min": 44.0,
      "max": 46.5,
      "count": 24
    },
    "lightIntensity": {
      "avg": 12500,
      "min": 12100,
      "max": 12900,
      "count": 24
    }
  },
  "deviceId": "fog-gateway-laptop01"
}
```

### Reducción de datos:

```
ANTES de agregación:
  144 lecturas individuales → 144 mensajes a AWS

DESPUÉS de agregación:
  144 lecturas → 1 evento AGGREGATE

Reducción: 144 / 1 = 99.3% menos mensajes

Con 3 zonas:
  432 lecturas/2min → 3 eventos AGGREGATE/2min
  Reducción: 432 / 3 = 99.3%
```

---

## 🚨 FASE 3: DETECCIÓN DE ANOMALÍAS (Procesamiento Inteligente)

### 📁 Archivo: `fog-gateway/src/anomaly-detector.js`

### ¿Qué hace?

Evalúa **cada lectura individual** (antes de agregarlas) contra reglas predefinidas.

### 5 Tipos de Detección:

#### 1️⃣ Umbral Simple (THRESHOLD_HIGH / THRESHOLD_LOW)

```javascript
// Regla: temperatura > 32°C
if (reading.metric === 'temperature' && reading.value > 32) {
  generateAlert({
    type: 'THRESHOLD_HIGH',
    severity: 'HIGH',
    message: 'Temperatura crítica detectada'
  });
}

// Regla: humedad suelo < 30%
if (reading.metric === 'soilMoisture' && reading.value < 30) {
  generateAlert({
    type: 'THRESHOLD_LOW',
    severity: 'MEDIUM',
    message: 'Suelo seco, requiere riego'
  });
  takeAction('irrigation', 'ON'); // Acción local
}
```

#### 2️⃣ Umbral Sostenido (SUSTAINED_HIGH / SUSTAINED_LOW)

```javascript
// Regla: temperatura > 30°C por 3 ventanas consecutivas (360s)
windowCount = 0;

onEachWindow(() => {
  if (avgTemperature > 30) {
    windowCount++;
    if (windowCount >= 3) {
      generateAlert({
        type: 'TEMP_HIGH_SUSTAINED',
        severity: 'HIGH',
        message: 'Temperatura alta sostenida por 6 minutos'
      });
      takeAction('fan', 'ON'); // Activar ventilador
    }
  } else {
    windowCount = 0; // Resetear si baja
  }
});
```

#### 3️⃣ Sensor Trabado (SENSOR_STUCK)

```javascript
// Regla: mismo valor exacto en 5 lecturas consecutivas
lastValues = [24.5, 24.5, 24.5, 24.5, 24.5];

if (allValuesEqual(lastValues)) {
  generateAlert({
    type: 'SENSOR_STUCK',
    severity: 'MEDIUM',
    message: 'Sensor posiblemente defectuoso'
  });
}
```

#### 4️⃣ Sensor Silencioso (SENSOR_SILENT)

```javascript
// Regla: no se reciben datos en 60 segundos
lastSeenTimestamp = Date.now();

setInterval(() => {
  if (Date.now() - lastSeenTimestamp > 60000) {
    generateAlert({
      type: 'SENSOR_SILENT',
      severity: 'HIGH',
      message: 'Sensor no responde'
    });
  }
}, 10000); // Verifica cada 10 segundos
```

#### 5️⃣ Cambio Abrupto (ABRUPT_CHANGE)

```javascript
// Regla: cambio > 10°C entre lecturas (5 segundos)
previousValue = 24.5;
currentValue = 35.2;

if (Math.abs(currentValue - previousValue) > 10) {
  generateAlert({
    type: 'ABRUPT_CHANGE',
    severity: 'HIGH',
    message: 'Cambio repentino detectado - posible error de sensor'
  });
}
```

### Acciones Automáticas Locales:

```javascript
const ACTIONS = {
  'TEMP_HIGH_SUSTAINED': { actuator: 'fan', state: 'ON' },
  'THRESHOLD_LOW_soilMoisture': { actuator: 'irrigation', state: 'ON' },
  'THRESHOLD_HIGH_lightIntensity': { actuator: 'shade', state: 'CLOSED' },
  'SUSTAINED_HIGH_humidity': { actuator: 'vent', state: 'OPEN' }
};

function takeAction(alertType, zone) {
  const action = ACTIONS[alertType];
  if (action) {
    // Actualiza estado local (simulado)
    actuatorStates[zone][action.actuator] = action.state;

    // Registra en log local
    console.log(`[ACTION] Zone ${zone}: ${action.actuator}=${action.state}`);

    // Retorna para incluir en evento ALERT
    return `${action.actuator}=${action.state}`;
  }
}
```

### Evento ALERT generado:

```json
{
  "eventType": "ALERT",
  "greenhouseId": "GH01",
  "zone": "B",
  "timestamp": "2025-12-28T10:18:35.123Z",
  "alertType": "TEMP_HIGH_SUSTAINED",
  "severity": "HIGH",
  "metric": "temperature",
  "value": 31.8,
  "threshold": 30.0,
  "duration": 360,
  "message": "Temperatura sostenida >30°C por 360s en zona B",
  "actionTaken": "fan=ON",
  "deviceId": "fog-gateway-laptop01"
}
```

### Latencia de detección:

```
Lectura del sensor → Evaluación de reglas → Acción local
     5ms                    10ms                  5ms

Total: ~20ms (<1 segundo)

Comparado con:
Lectura → AWS → Procesamiento → Respuesta
  5ms     500ms      100ms         500ms
Total: ~1.1 segundos (55x más lento)
```

---

## 💾 FASE 4: BUFFER LOCAL (Resiliencia Offline)

### 📁 Archivo: `fog-gateway/src/buffer.js`

### ¿Qué hace?

Guarda eventos en SQLite local si no hay conexión a AWS.

### Esquema de base de datos:

```sql
CREATE TABLE event_buffer (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,        -- 'AGGREGATE' o 'ALERT'
  payload TEXT NOT NULL,            -- JSON del evento
  timestamp INTEGER NOT NULL,       -- Unix timestamp
  retry_count INTEGER DEFAULT 0,    -- Intentos de envío
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_timestamp ON event_buffer(timestamp);
CREATE INDEX idx_retry ON event_buffer(retry_count);
```

### Flujo con conexión normal:

```
1. MQTT intenta publicar evento
   ↓
2. Conexión OK
   ↓
3. Evento enviado directamente a AWS
   ↓
4. No se guarda en buffer
```

### Flujo sin conexión (offline):

```
1. MQTT intenta publicar evento
   ↓
2. Error: Connection refused / Timeout
   ↓
3. Buffer.save(event) → INSERT INTO event_buffer
   ↓
4. Log: "[BUFFER] Event saved locally (1 pending)"
   ↓
5. Continúa generando y guardando eventos
   ↓
6. Sensores siguen funcionando
   Anomalías siguen detectándose
   Acciones siguen tomándose localmente
```

### Flujo al reconectar:

```
1. MQTT reconecta a AWS IoT Core
   ↓
2. Buffer detecta conexión restaurada
   ↓
3. Buffer.flush()
   ↓
4. SELECT * FROM event_buffer ORDER BY timestamp
   ↓
5. Por cada evento:
   a. Intenta publicar
   b. Si OK:
      - DELETE FROM event_buffer WHERE id = ?
      - Log: "[BUFFER] Event sent (X pending)"
   c. Si falla:
      - UPDATE event_buffer SET retry_count = retry_count + 1
      - Espera con backoff exponencial
```

### Estrategia de Reintento (Exponential Backoff):

```javascript
const RETRY_DELAYS = [
  10000,   // 1er intento: 10 segundos
  30000,   // 2do intento: 30 segundos
  60000,   // 3er intento: 60 segundos
  120000,  // 4to intento: 120 segundos
  300000   // 5to intento: 300 segundos (5 min)
];

function getRetryDelay(retryCount) {
  return RETRY_DELAYS[Math.min(retryCount, RETRY_DELAYS.length - 1)];
}
```

### Capacidad:

```
10,000 eventos máximo en buffer

Asumiendo:
- 3 eventos AGGREGATE cada 120s = 90 eventos/hora
- 10 eventos ALERT/hora (promedio)
- Total: 100 eventos/hora

10,000 / 100 = 100 horas = 4 días offline

Tamaño en disco:
~5KB por evento × 10,000 = 50MB máximo
```

---

## 📡 FASE 5: PUBLICACIÓN MQTT (Comunicación con AWS)

### 📁 Archivo: `fog-gateway/src/mqtt-client.js`

### ¿Qué hace?

Conecta con AWS IoT Core usando protocolo MQTT sobre TLS.

### Configuración de conexión:

```javascript
const mqtt = require('aws-iot-device-sdk').device;

const connection = mqtt({
  // Endpoint de AWS IoT Core (único por cuenta)
  host: 'a3q8j2kl5m6n7o-ats.iot.us-east-1.amazonaws.com',

  // Puerto MQTT sobre TLS
  port: 8883,

  // Certificados X.509 (autenticación mutua)
  certPath: './certs/certificate.pem.crt',    // Cert del dispositivo
  keyPath: './certs/private.pem.key',         // Clave privada
  caPath: './certs/AmazonRootCA1.pem',        // CA de Amazon

  // ID del cliente (único)
  clientId: 'fog-gateway-laptop01',

  // QoS (Quality of Service)
  qos: 1  // At least once delivery
});
```

### Topics MQTT:

```
AGGREGATE (telemetría):
  greenhouse/GH01/telemetry
  └─ Payload: evento AGGREGATE (JSON)

ALERT (anomalías):
  greenhouse/GH01/alerts
  └─ Payload: evento ALERT (JSON)

COMMANDS (opcional, futuro):
  greenhouse/GH01/commands
  └─ Suscripción: recibir comandos de AWS

ACKS (opcional, futuro):
  greenhouse/GH01/acks
  └─ Publicación: confirmar ejecución de comandos
```

### Proceso de publicación:

```javascript
// 1. Serializar evento a JSON
const payload = JSON.stringify(event);

// 2. Determinar topic
const topic = event.eventType === 'AGGREGATE'
  ? `greenhouse/${greenhouseId}/telemetry`
  : `greenhouse/${greenhouseId}/alerts`;

// 3. Publicar
connection.publish(topic, payload, { qos: 1 }, (err) => {
  if (err) {
    // Error: guardar en buffer
    buffer.save(event);
    console.log('[MQTT] Publish failed, buffered locally');
  } else {
    // Éxito
    console.log(`[MQTT] Published ${event.eventType} to ${topic}`);
  }
});
```

### Seguridad TLS + X.509:

```
┌─────────────────────────────────────────────────┐
│  Fog Gateway                                    │
│                                                 │
│  1. Carga certificado del dispositivo          │
│     (certificate.pem.crt)                      │
│                                                 │
│  2. Carga clave privada                        │
│     (private.pem.key)                          │
│                                                 │
│  3. Carga CA de Amazon                         │
│     (AmazonRootCA1.pem)                        │
│                                                 │
│  4. Inicia handshake TLS 1.2                   │
└──────────────────┬──────────────────────────────┘
                   │
            Internet (encriptado)
                   │
┌──────────────────┴──────────────────────────────┐
│  AWS IoT Core                                   │
│                                                 │
│  1. Valida certificado del dispositivo         │
│     - Firmado por AWS IoT CA?                  │
│     - No revocado?                             │
│     - Dentro de validez temporal?              │
│                                                 │
│  2. Verifica permisos (IoT Policy)             │
│     - iot:Connect permitido?                   │
│     - iot:Publish en topic permitido?          │
│                                                 │
│  3. Acepta conexión                            │
│     ✅ Conexión establecida                     │
└─────────────────────────────────────────────────┘
```

### Auto-reconexión:

```javascript
// Eventos de conexión
connection.on('connect', () => {
  console.log('[MQTT] Connected to AWS IoT Core');

  // Intentar enviar buffer pendiente
  buffer.flush();
});

connection.on('close', () => {
  console.log('[MQTT] Connection closed');
});

connection.on('reconnect', () => {
  console.log('[MQTT] Reconnecting...');
});

connection.on('error', (error) => {
  console.log(`[MQTT] Error: ${error.message}`);
});

// El SDK maneja reconexión automática
// con exponential backoff
```

---

## ☁️ FASE 6: RECEPCIÓN EN AWS IOT CORE

### Servicio: AWS IoT Core

### ¿Qué hace?

Recibe mensajes MQTT, autentica dispositivos y enruta mensajes según reglas.

### Componentes:

#### 1. IoT Thing (Dispositivo)

```
Nombre: FogGateway-Laptop01
Tipo: Generic device
Atributos:
  - location: "datacenter-laptop"
  - greenhouseId: "GH01"
  - version: "1.0.0"
```

#### 2. Certificado X.509

```
ARN: arn:aws:iot:us-east-1:123456789012:cert/a1b2c3d4...
Estado: ACTIVE
Fecha creación: 2025-12-23
Fecha expiración: 2035-12-23 (10 años)
Asociado a: FogGateway-Laptop01
```

#### 3. IoT Policy (Permisos)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "iot:Connect",
      "Resource": "arn:aws:iot:us-east-1:*:client/fog-gateway-*"
    },
    {
      "Effect": "Allow",
      "Action": "iot:Publish",
      "Resource": [
        "arn:aws:iot:us-east-1:*:topic/greenhouse/*/telemetry",
        "arn:aws:iot:us-east-1:*:topic/greenhouse/*/alerts"
      ]
    },
    {
      "Effect": "Allow",
      "Action": "iot:Subscribe",
      "Resource": "arn:aws:iot:us-east-1:*:topicfilter/greenhouse/*/commands"
    },
    {
      "Effect": "Allow",
      "Action": "iot:Receive",
      "Resource": "arn:aws:iot:us-east-1:*:topic/greenhouse/*/commands"
    }
  ]
}
```

#### 4. IoT Rules (Enrutamiento)

**Rule 1: ProcessTelemetryRule**
```sql
-- SQL de filtrado
SELECT * FROM 'greenhouse/+/telemetry'

-- Acción
Lambda: ProcessTelemetry
```

**Rule 2: ProcessAlertsRule**
```sql
-- SQL de filtrado
SELECT * FROM 'greenhouse/+/alerts'

-- Acción
Lambda: ProcessTelemetry
```

**Rule 3: HighAlertsSNSRule**
```sql
-- SQL de filtrado
SELECT * FROM 'greenhouse/+/alerts'
WHERE severity = 'HIGH'

-- Acción
SNS: GreenhouseAlertsHigh
```

### Flujo de ingesta:

```
1. Mensaje MQTT llega a IoT Core
   Topic: greenhouse/GH01/telemetry
   Payload: { "eventType": "AGGREGATE", ... }
   ↓

2. Autenticación TLS + X.509
   ✅ Certificado válido
   ✅ Asociado a Thing: FogGateway-Laptop01
   ✅ Policy permite iot:Publish en este topic
   ↓

3. Mensaje aceptado
   Timestamp de ingesta: 2025-12-28T10:20:15.456Z
   ↓

4. Evaluación de IoT Rules
   ProcessTelemetryRule: ✅ MATCH
   → Dispara Lambda ProcessTelemetry
   ↓

5. IoT Core invoca Lambda
   Evento pasado a Lambda:
   {
     "topic": "greenhouse/GH01/telemetry",
     "timestamp": 1735382415456,
     "payload": { ... }
   }
```

### Registro en CloudWatch:

```
Log group: AWSIotLogsV2
Log stream: thingName/FogGateway-Laptop01

[2025-12-28T10:20:15.456Z] Message received on greenhouse/GH01/telemetry
[2025-12-28T10:20:15.458Z] Rule ProcessTelemetryRule matched
[2025-12-28T10:20:15.460Z] Action: Lambda ProcessTelemetry invoked
```

---

## ⚡ FASE 7: PROCESAMIENTO EN LAMBDA

### 📁 Archivo: `pulumi-infra/lambda/process-telemetry.js`

### ¿Qué hace?

Valida, enriquece y persiste eventos en DynamoDB y S3.

### Flujo completo:

```javascript
exports.handler = async (event) => {
  console.log('Received event:', JSON.stringify(event));

  // PASO 1: Parsear payload
  const payload = JSON.parse(event.payload || event.body);

  // PASO 2: Validar schema
  const validation = validateEvent(payload);
  if (!validation.valid) {
    console.error('Validation failed:', validation.errors);
    await publishMetric('ValidationErrors', 1);
    return { statusCode: 400, body: 'Invalid event' };
  }

  // PASO 3: Sanity checks
  if (payload.eventType === 'AGGREGATE') {
    for (const [metric, stats] of Object.entries(payload.metrics)) {
      if (stats.min > stats.avg || stats.avg > stats.max) {
        console.error(`Sanity check failed: min > avg > max for ${metric}`);
        return { statusCode: 400, body: 'Sanity check failed' };
      }
    }
  }

  // PASO 4: Enriquecer evento
  payload.receivedAt = new Date().toISOString();
  payload.processingId = generateId();

  // PASO 5: Guardar en DynamoDB
  await saveToDynamoDB(payload);

  // PASO 6: Guardar en S3 (si aplica)
  if (shouldSaveToS3(payload)) {
    await saveToS3(payload);
  }

  // PASO 7: Publicar métricas
  await publishMetric('EventsProcessed', 1);
  if (payload.eventType === 'ALERT') {
    await publishMetric('AlertsProcessed', 1);
  }

  console.log('Event processed successfully');
  return { statusCode: 200, body: 'OK' };
};
```

### Validación de schema:

```javascript
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
  if (!isValidISO8601(payload.timestamp)) {
    errors.push('Invalid timestamp format');
  }

  // timestamp no es futuro
  const now = Date.now();
  const eventTime = new Date(payload.timestamp).getTime();
  if (eventTime > now + 60000) { // +60s tolerancia
    errors.push('Timestamp is in the future');
  }

  // AGGREGATE tiene metrics
  if (payload.eventType === 'AGGREGATE' && !payload.metrics) {
    errors.push('AGGREGATE event missing metrics');
  }

  // ALERT tiene alertType y severity
  if (payload.eventType === 'ALERT') {
    if (!payload.alertType) errors.push('Missing alertType');
    if (!['LOW', 'MEDIUM', 'HIGH'].includes(payload.severity)) {
      errors.push('Invalid severity');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
```

### Guardar en DynamoDB:

```javascript
async function saveToDynamoDB(payload) {
  const dynamodb = new DynamoDBClient();

  if (payload.eventType === 'AGGREGATE') {
    // Guardar como estado actual
    const params = {
      TableName: 'GreenhouseState',
      Item: {
        PK: `GH#${payload.greenhouseId}#ZONE#${payload.zone}`,
        SK: 'CURRENT',
        timestamp: payload.timestamp,
        metrics: payload.metrics,
        deviceId: payload.deviceId,
        receivedAt: payload.receivedAt,
        ttl: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // 7 días
      }
    };

    await dynamodb.send(new PutItemCommand(params));
    console.log(`Saved AGGREGATE to DynamoDB: ${params.Item.PK}`);

  } else if (payload.eventType === 'ALERT') {
    // Guardar como evento de alerta
    const params = {
      TableName: 'GreenhouseState',
      Item: {
        PK: `GH#${payload.greenhouseId}#ZONE#${payload.zone}`,
        SK: `ALERT#${payload.timestamp}`,
        timestamp: payload.timestamp,
        alertType: payload.alertType,
        severity: payload.severity,
        metric: payload.metric,
        value: payload.value,
        threshold: payload.threshold,
        actionTaken: payload.actionTaken,
        message: payload.message,
        ttl: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60)
      }
    };

    await dynamodb.send(new PutItemCommand(params));
    console.log(`Saved ALERT to DynamoDB: ${params.Item.PK}/${params.Item.SK}`);
  }
}
```

### Guardar en S3:

```javascript
async function saveToS3(payload) {
  const s3 = new S3Client();

  // Solo guardar:
  // - Snapshots cada hora (:00)
  // - Todas las alertas

  const timestamp = new Date(payload.timestamp);
  const hour = timestamp.getUTCHours();
  const minute = timestamp.getUTCMinutes();

  const shouldSave =
    payload.eventType === 'ALERT' ||
    (payload.eventType === 'AGGREGATE' && minute === 0);

  if (!shouldSave) return;

  // Generar key
  const year = timestamp.getUTCFullYear();
  const month = String(timestamp.getUTCMonth() + 1).padStart(2, '0');
  const day = String(timestamp.getUTCDate()).padStart(2, '0');
  const timeStr = timestamp.toISOString().replace(/:/g, '').substring(11, 17);

  const prefix = payload.eventType === 'ALERT' ? 'alert' : 'snapshot';
  const key = `${payload.greenhouseId}/zone${payload.zone}/${year}/${month}/${day}/${prefix}-${timeStr}.json`;

  // Guardar
  const params = {
    Bucket: process.env.S3_BUCKET,
    Key: key,
    Body: JSON.stringify(payload, null, 2),
    ContentType: 'application/json',
    Metadata: {
      greenhouseId: payload.greenhouseId,
      zone: payload.zone,
      eventType: payload.eventType
    }
  };

  await s3.send(new PutObjectCommand(params));
  console.log(`Saved to S3: s3://${params.Bucket}/${key}`);
}
```

### Publicar métricas:

```javascript
async function publishMetric(metricName, value) {
  const cloudwatch = new CloudWatchClient();

  const params = {
    Namespace: 'Greenhouse',
    MetricData: [{
      MetricName: metricName,
      Value: value,
      Unit: 'Count',
      Timestamp: new Date()
    }]
  };

  await cloudwatch.send(new PutMetricDataCommand(params));
}
```

### Logs en CloudWatch:

```
Log group: /aws/lambda/ProcessTelemetry
Log stream: 2025/12/28/[$LATEST]abc123...

START RequestId: abc-123-def-456
Received event: {"topic":"greenhouse/GH01/telemetry",...}
Saved AGGREGATE to DynamoDB: GH#GH01#ZONE#A
Published metric: EventsProcessed = 1
Event processed successfully
END RequestId: abc-123-def-456
REPORT RequestId: abc-123-def-456
  Duration: 125.43 ms
  Billed Duration: 126 ms
  Memory Size: 256 MB
  Max Memory Used: 78 MB
```

---

## 💿 FASE 8: ALMACENAMIENTO EN DYNAMODB

### Tabla: GreenhouseState

### Modelo de datos:

```
Partition Key (PK): GH#{greenhouseId}#ZONE#{zone}
Sort Key (SK): CURRENT | ALERT#{timestamp}

GSI: GSI-ByTimestamp
  PK: mismo
  SK: timestamp (permite queries por rango de fechas)
```

### Ejemplos de items:

#### Estado actual de Zona A:

```json
{
  "PK": "GH#GH01#ZONE#A",
  "SK": "CURRENT",
  "timestamp": "2025-12-28T10:30:00.000Z",
  "metrics": {
    "temperature": {
      "avg": 24.5,
      "min": 23.8,
      "max": 25.1,
      "count": 24
    },
    "humidity": {
      "avg": 65.3,
      "min": 62.1,
      "max": 68.4,
      "count": 24
    },
    "soilMoisture": {
      "avg": 45.2,
      "min": 44.0,
      "max": 46.5,
      "count": 24
    },
    "lightIntensity": {
      "avg": 12500,
      "min": 12100,
      "max": 12900,
      "count": 24
    }
  },
  "deviceId": "fog-gateway-laptop01",
  "receivedAt": "2025-12-28T10:30:02.456Z",
  "ttl": 1735987802
}
```

#### Alerta en Zona B:

```json
{
  "PK": "GH#GH01#ZONE#B",
  "SK": "ALERT#2025-12-28T10:32:15.123Z",
  "timestamp": "2025-12-28T10:32:15.123Z",
  "alertType": "TEMP_HIGH_SUSTAINED",
  "severity": "HIGH",
  "metric": "temperature",
  "value": 31.8,
  "threshold": 30.0,
  "duration": 360,
  "message": "Temperatura sostenida >30°C por 360s en zona B",
  "actionTaken": "fan=ON",
  "deviceId": "fog-gateway-laptop01",
  "receivedAt": "2025-12-28T10:32:17.890Z",
  "ttl": 1735987937
}
```

### Queries típicas:

#### Obtener último estado de zona A:

```javascript
const params = {
  TableName: 'GreenhouseState',
  KeyConditionExpression: 'PK = :pk AND SK = :sk',
  ExpressionAttributeValues: {
    ':pk': 'GH#GH01#ZONE#A',
    ':sk': 'CURRENT'
  }
};

const result = await dynamodb.query(params);
// Retorna 1 item con las métricas más recientes
```

#### Obtener últimas 10 alertas de zona B:

```javascript
const params = {
  TableName: 'GreenhouseState',
  KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
  ExpressionAttributeValues: {
    ':pk': 'GH#GH01#ZONE#B',
    ':sk': 'ALERT#'
  },
  ScanIndexForward: false, // Orden descendente (más recientes primero)
  Limit: 10
};

const result = await dynamodb.query(params);
// Retorna hasta 10 alertas más recientes
```

#### Obtener todas las alertas HIGH de hoy:

```javascript
const today = new Date().toISOString().split('T')[0];

const params = {
  TableName: 'GreenhouseState',
  FilterExpression: 'severity = :sev AND begins_with(SK, :prefix)',
  ExpressionAttributeValues: {
    ':sev': 'HIGH',
    ':prefix': `ALERT#${today}`
  }
};

const result = await dynamodb.scan(params);
// Retorna todas las alertas HIGH de hoy (todas las zonas)
```

### TTL (Time To Live):

```
Todos los items tienen campo ttl:
  ttl = current_timestamp + 7 días (en segundos Unix)

DynamoDB automáticamente elimina items cuando:
  current_time > ttl

Esto mantiene la tabla limpia y el costo bajo.

Items eliminados por TTL NO consumen Write Capacity Units.
```

---

## 📦 FASE 9: ALMACENAMIENTO EN S3

### Bucket: greenhouse-history-{account-id}

### Estructura de prefijos:

```
greenhouse-history-123456789012/
├── GH01/
│   ├── zoneA/
│   │   ├── 2025/
│   │   │   ├── 12/
│   │   │   │   ├── 27/
│   │   │   │   │   ├── snapshot-100000.json
│   │   │   │   │   ├── snapshot-110000.json
│   │   │   │   │   ├── snapshot-120000.json
│   │   │   │   │   ├── alert-103245.json
│   │   │   │   │   └── alert-143012.json
│   │   │   │   └── 28/
│   │   │   │       ├── snapshot-000000.json
│   │   │   │       └── ...
│   │   └── 2026/
│   ├── zoneB/
│   │   └── ...
│   └── zoneC/
│       └── ...
└── GH02/ (si existiera otro invernadero)
    └── ...
```

### Tipos de archivos:

#### Snapshot (cada hora):

```json
// s3://greenhouse-history-XXX/GH01/zoneA/2025/12/28/snapshot-100000.json
{
  "eventType": "AGGREGATE",
  "greenhouseId": "GH01",
  "zone": "A",
  "timestamp": "2025-12-28T10:00:00.000Z",
  "windowDurationSec": 120,
  "metrics": {
    "temperature": { "avg": 24.5, "min": 23.8, "max": 25.1, "count": 24 },
    "humidity": { "avg": 65.3, "min": 62.1, "max": 68.4, "count": 24 },
    "soilMoisture": { "avg": 45.2, "min": 44.0, "max": 46.5, "count": 24 },
    "lightIntensity": { "avg": 12500, "min": 12100, "max": 12900, "count": 24 }
  },
  "deviceId": "fog-gateway-laptop01",
  "receivedAt": "2025-12-28T10:00:02.456Z"
}
```

#### Alert (cada vez que ocurre):

```json
// s3://greenhouse-history-XXX/GH01/zoneB/2025/12/28/alert-103215.json
{
  "eventType": "ALERT",
  "greenhouseId": "GH01",
  "zone": "B",
  "timestamp": "2025-12-28T10:32:15.123Z",
  "alertType": "TEMP_HIGH_SUSTAINED",
  "severity": "HIGH",
  "metric": "temperature",
  "value": 31.8,
  "threshold": 30.0,
  "duration": 360,
  "message": "Temperatura sostenida >30°C por 360s en zona B",
  "actionTaken": "fan=ON",
  "deviceId": "fog-gateway-laptop01",
  "receivedAt": "2025-12-28T10:32:17.890Z"
}
```

### Lifecycle Policy:

```yaml
Rules:
  - Id: TransitionToGlacier
    Status: Enabled
    Transitions:
      - Days: 90
        StorageClass: GLACIER
    # Después de 90 días, mover a Glacier (más barato)

  - Id: DeleteOldData
    Status: Enabled
    Expiration:
      Days: 365
    # Después de 365 días, eliminar permanentemente
```

### Costos estimados:

```
Uso mensual (3 zonas):
  - Snapshots: 72/mes (24/día × 3 zonas)
  - Alerts: ~100/mes (estimado)
  - Total archivos: 172/mes
  - Tamaño promedio: 5KB/archivo
  - Total: 172 × 5KB = 860KB/mes

Año 1:
  - 860KB × 12 = ~10MB (S3 Standard)
  - Costo: $0 (Free Tier: 5GB)

Año 2:
  - Primeros 12 meses: 10MB → Glacier
  - Últimos 12 meses: 10MB → S3 Standard
  - Total: 20MB
  - Costo S3: ~$0.0005/mes
  - Costo Glacier: ~$0.0001/mes
  - Total: ~$0.0006/mes

Año 5:
  - Primeros 48 meses: 40MB → Glacier
  - Últimos 12 meses: 10MB → S3 Standard
  - Total: 50MB
  - Costo: ~$0.002/mes
```

---

## 📊 FASE 10: OBSERVABILIDAD (CloudWatch)

### Logs:

#### /aws/lambda/ProcessTelemetry

```
2025-12-28 10:30:02.456 START RequestId: abc-123
2025-12-28 10:30:02.458 Received event: {"topic":"greenhouse/GH01/telemetry",...}
2025-12-28 10:30:02.520 Saved AGGREGATE to DynamoDB: GH#GH01#ZONE#A
2025-12-28 10:30:02.580 Published metric: EventsProcessed = 1
2025-12-28 10:30:02.581 Event processed successfully
2025-12-28 10:30:02.581 END RequestId: abc-123
2025-12-28 10:30:02.581 REPORT RequestId: abc-123
  Duration: 125.43 ms
  Billed Duration: 126 ms
  Memory Size: 256 MB
  Max Memory Used: 78 MB
```

### Métricas Custom:

```
Namespace: Greenhouse

Métricas:
  - EventsProcessed (Count)
    Dimensiones: None
    Periodo: 5 min

  - AlertsProcessed (Count)
    Dimensiones: None
    Periodo: 5 min

  - ValidationErrors (Count)
    Dimensiones: None
    Periodo: 5 min
```

### Alarmas:

```yaml
Alarm: ProcessTelemetry-HighErrorRate
  Metric: AWS/Lambda/Errors
  Statistic: Sum
  Period: 300 (5 min)
  Threshold: 5
  ComparisonOperator: GreaterThanThreshold
  EvaluationPeriods: 1
  TreatMissingData: notBreaching

  Acciones:
    - Estado ALARM: Enviar notificación SNS (opcional)
    - Estado OK: No hacer nada
```

---

## 📧 FASE 11: NOTIFICACIONES (SNS - Opcional)

### Topic: GreenhouseAlertsHigh

### Flujo:

```
1. Lambda procesa ALERT con severity=HIGH
   ↓
2. IoT Rule "HighAlertsSNSRule" coincide
   ↓
3. SNS publica mensaje al topic
   ↓
4. SNS envía email a suscriptores
   ↓
5. Usuario recibe email
```

### Formato del email:

```
From: AWS Notifications <no-reply@sns.amazonaws.com>
To: tu-email@gmail.com
Subject: [HIGH] Greenhouse Alert - GH01 Zone B

Message:
{
  "eventType": "ALERT",
  "greenhouseId": "GH01",
  "zone": "B",
  "timestamp": "2025-12-28T10:32:15.123Z",
  "alertType": "TEMP_HIGH_SUSTAINED",
  "severity": "HIGH",
  "metric": "temperature",
  "value": 31.8,
  "threshold": 30.0,
  "message": "Temperatura sostenida >30°C por 360s en zona B",
  "actionTaken": "fan=ON"
}

--
If you wish to stop receiving notifications, click here to unsubscribe.
```

---

## 🌐 FASE 12: API REST (API Gateway - Opcional)

### API: GreenhouseAPI

### Endpoints:

#### GET /health

```bash
curl https://xxx.execute-api.us-east-1.amazonaws.com/prod/health

Response:
{
  "status": "healthy",
  "greenhouseId": "GH01",
  "timestamp": "2025-12-28T10:35:00.000Z"
}
```

#### GET /zones

```bash
curl https://xxx.execute-api.us-east-1.amazonaws.com/prod/zones

Response:
{
  "zones": [
    {
      "zone": "A",
      "timestamp": "2025-12-28T10:30:00.000Z",
      "metrics": {
        "temperature": { "avg": 24.5, "min": 23.8, "max": 25.1 },
        "humidity": { "avg": 65.3, "min": 62.1, "max": 68.4 },
        "soilMoisture": { "avg": 45.2, "min": 44.0, "max": 46.5 },
        "lightIntensity": { "avg": 12500, "min": 12100, "max": 12900 }
      }
    },
    {
      "zone": "B",
      "timestamp": "2025-12-28T10:32:00.000Z",
      "metrics": { ... }
    },
    {
      "zone": "C",
      "timestamp": "2025-12-28T10:30:00.000Z",
      "metrics": { ... }
    }
  ]
}
```

#### GET /alerts

```bash
curl https://xxx.execute-api.us-east-1.amazonaws.com/prod/alerts?limit=10

Response:
{
  "alerts": [
    {
      "zone": "B",
      "timestamp": "2025-12-28T10:32:15.123Z",
      "alertType": "TEMP_HIGH_SUSTAINED",
      "severity": "HIGH",
      "metric": "temperature",
      "value": 31.8,
      "actionTaken": "fan=ON",
      "message": "Temperatura sostenida >30°C por 360s en zona B"
    },
    // ... hasta 9 más
  ]
}
```

---

## 📱 FASE 13: DASHBOARD WEB (Visualización)

### Archivo: `web-dashboard/index.html`

### Flujo:

```
1. Usuario abre index.html en navegador
   ↓
2. JavaScript carga (app.js)
   ↓
3. Hace fetch a API Gateway:
   - GET /zones (estado actual)
   - GET /alerts (alertas recientes)
   ↓
4. Renderiza datos en HTML:
   ┌─── ZONA A ────────────────────┐
   │  Última actualización: 10:30  │
   │  🌡️  Temperatura: 24.5°C       │
   │  💧 Humedad:     65.3%        │
   │  🌱 Suelo:        45.2%        │
   │  ☀️  Luz:          12500 lux   │
   └───────────────────────────────┘
   ↓
5. Auto-refresh cada 30 segundos
```

---

## 🔄 RESUMEN DEL FLUJO COMPLETO

```
LAPTOP (Fog Gateway)                          AWS CLOUD
═════════════════════                         ══════════

[Sensores]
    │ 5s
    ↓
[Agregador] ────┐
    │ 120s      │
    ↓           │
[Buffer]        │
    │           │
    ↓           ↓
[MQTT Client] ──────── TLS/X.509 ──────→ [IoT Core]
                                                │
    ↑                                          ↓
    │                                      [IoT Rules]
    │                                          │
[Anomaly                                       ↓
Detector] ──────── ALERT ──────────→      [Lambda]
    │                                      ┌───┴───┐
    ↓                                      │       │
[Local Actions]                            ↓       ↓
fan=ON                                [DynamoDB] [S3]
                                           │       │
                                           ↓       ↓
                                      [CloudWatch]
                                           │
                                           ↓
                                      [SNS Email]
                                           │
                                           ↓
                                      [API Gateway]
                                           │
                                           ↓
                                      [Dashboard Web]
```

---

## 📈 MÉTRICAS CLAVE

| Métrica | Valor | Beneficio |
|---------|-------|-----------|
| Reducción de mensajes | 95% | Ahorro de ancho de banda y costos |
| Latencia de detección | <1s | Respuesta inmediata a anomalías |
| Tolerancia offline | 4 horas | Resiliencia ante desconexiones |
| Costo mensual | $0 | Dentro de Free Tier |
| Recursos AWS | 38 | Infraestructura completa serverless |
| Escalabilidad | Horizontal | Agregar zonas/invernaderos sin límite |

---

**Esta es la arquitectura completa de extremo a extremo.** 🎉

Cada dato generado por los sensores simulados pasa por 13 fases antes de llegar al usuario final, optimizándose y enriqueciéndose en cada paso.
