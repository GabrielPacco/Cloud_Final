# Guía de Recolección de Evidencias

## Objetivo

Este documento describe qué capturas de pantalla y logs recolectar para demostrar el funcionamiento completo del sistema.

## Estructura de Evidencias

Crear carpeta `evidencias/` con subcarpetas:

```
evidencias/
├── 01-deployment/
├── 02-fog-gateway/
├── 03-aws-iot/
├── 04-lambda/
├── 05-dynamodb/
├── 06-s3/
├── 07-cloudwatch/
└── 08-anomalias/
```

---

## 1. Deployment (Pulumi)

### Captura 1.1: `pulumi up` exitoso

**Comando:**
```bash
cd pulumi-infra
pulumi up
```

**Qué capturar:**
- Output mostrando recursos a crear
- Confirmación de creación exitosa (verde)
- Lista de recursos creados (IoT Thing, Lambda, DynamoDB, S3, etc.)

**Archivo:** `01-deployment/pulumi-up.png`

### Captura 1.2: Stack outputs

**Comando:**
```bash
pulumi stack output
```

**Qué capturar:**
- Lista de outputs: iotEndpoint, dynamoTableName, s3BucketName, lambdaFunctionArn

**Archivo:** `01-deployment/stack-outputs.png`

---

## 2. Fog Gateway

### Captura 2.1: Inicio del Fog Gateway

**Comando:**
```bash
cd fog-gateway
node src/index.js
```

**Qué capturar:**
- Banner "FOG GATEWAY STARTING"
- Logs de conexión MQTT exitosa
- Inicio de sensores y agregador
- Primeras lecturas generadas

**Archivo:** `02-fog-gateway/startup.png`

### Captura 2.2: Estadísticas periódicas

**Qué capturar:**
- Banner "FOG GATEWAY STATISTICS" después de 1-2 minutos
- Mostrar: uptime, lecturas generadas, agregados publicados, alertas, buffer size

**Archivo:** `02-fog-gateway/stats.png`

### Captura 2.3: Inyección de anomalía

**Qué capturar:**
- Log mostrando "INJECTING TEST ANOMALY"
- Alerta generada (ej: TEMP_HIGH_SUSTAINED)
- Acción tomada (ej: fan=ON)

**Archivo:** `02-fog-gateway/anomaly-injected.png`

### Captura 2.4: Buffer offline (opcional)

**Pasos:**
1. Desconectar red
2. Esperar 1 minuto
3. Reconectar red

**Qué capturar:**
- Logs mostrando "Offline - buffering AGGREGATE event"
- Logs mostrando "Processing 50 buffered events..."
- "Retry success" cuando se reconecta

**Archivo:** `02-fog-gateway/offline-buffer.png`

---

## 3. AWS IoT Core

### Captura 3.1: IoT Test Client - Telemetry

**Pasos:**
1. AWS Console > IoT Core > Test > MQTT test client
2. Subscribe to: `greenhouse/GH01/telemetry`
3. Esperar 2-3 minutos

**Qué capturar:**
- Mensaje JSON recibido (AGGREGATE) con métricas por zona
- Timestamp y estructura completa

**Archivo:** `03-aws-iot/telemetry-message.png`

### Captura 3.2: IoT Test Client - Alerts

**Pasos:**
1. Subscribe to: `greenhouse/GH01/alerts`
2. Inyectar anomalía en Fog Gateway

**Qué capturar:**
- Mensaje JSON de alerta (ALERT)
- Campos: alertType, severity, action, message

**Archivo:** `03-aws-iot/alert-message.png`

### Captura 3.3: IoT Thing

**Pasos:**
1. AWS Console > IoT Core > Manage > Things
2. Click en "FogGateway-Laptop01"

**Qué capturar:**
- Detalles del Thing (nombre, atributos)
- Certificados asociados (activo)

**Archivo:** `03-aws-iot/iot-thing.png`

---

## 4. Lambda

### Captura 4.1: CloudWatch Logs - Invocaciones

**Comando (CLI):**
```bash
aws logs tail /aws/lambda/ProcessTelemetry --follow
```

**O en Console:**
AWS Console > Lambda > ProcessTelemetry > Monitor > View logs in CloudWatch

**Qué capturar:**
- 5-10 líneas de logs mostrando:
  - "Received event: AGGREGATE"
  - "Updated CURRENT state for GH#GH01#ZONE#A"
  - "Saved to S3: ..."
  - "Event processed successfully"

**Archivo:** `04-lambda/logs-processing.png`

### Captura 4.2: Lambda Metrics

**Pasos:**
1. AWS Console > Lambda > ProcessTelemetry > Monitor
2. Ver gráficos de Invocations, Duration, Errors

**Qué capturar:**
- Gráfico de invocaciones (últimas 1-3 horas)
- Duración promedio (debe ser <500ms)
- Errores (debe ser 0)

**Archivo:** `04-lambda/metrics.png`

---

## 5. DynamoDB

### Captura 5.1: Tabla GreenhouseState - Items

**Pasos:**
1. AWS Console > DynamoDB > Tables > GreenhouseState
2. Tab "Explore table items"
3. Scan (sin filtros)

**Qué capturar:**
- Lista de items mostrando:
  - PK: `GH#GH01#ZONE#A`, SK: `CURRENT`
  - PK: `GH#GH01#ZONE#B`, SK: `CURRENT`
  - PK: `GH#GH01#ZONE#C`, SK: `CURRENT`
  - Varios items con SK: `ALERT#...`

**Archivo:** `05-dynamodb/items-list.png`

### Captura 5.2: Detalle de item CURRENT

**Pasos:**
1. Click en un item con SK=CURRENT
2. Ver JSON completo

**Qué capturar:**
- JSON mostrando: timestamp, metrics (temperatura, humedad, etc.), receivedAt

**Archivo:** `05-dynamodb/item-current.png`

### Captura 5.3: Detalle de item ALERT

**Pasos:**
1. Click en un item con SK=ALERT#...
2. Ver JSON completo

**Qué capturar:**
- JSON mostrando: alertType, severity, metric, value, message, actionTaken

**Archivo:** `05-dynamodb/item-alert.png`

---

## 6. S3

### Captura 6.1: Bucket - Estructura de carpetas

**Comando (CLI):**
```bash
aws s3 ls s3://greenhouse-history-{ACCOUNT_ID}/ --recursive
```

**O en Console:**
AWS Console > S3 > greenhouse-history-... > Browse

**Qué capturar:**
- Estructura de prefijos: GH01/zoneA/2025/12/23/
- Lista de archivos: snapshot-*.json, alert-*.json

**Archivo:** `06-s3/bucket-structure.png`

### Captura 6.2: Contenido de archivo snapshot

**Pasos:**
1. Descargar un archivo snapshot-*.json
2. Abrir en editor de texto

**Qué capturar:**
- JSON completo mostrando AGGREGATE con métricas

**Archivo:** `06-s3/snapshot-content.png`

### Captura 6.3: Contenido de archivo alert

**Pasos:**
1. Descargar un archivo alert-*.json
2. Abrir en editor de texto

**Qué capturar:**
- JSON completo mostrando ALERT con detalles

**Archivo:** `06-s3/alert-content.png`

---

## 7. CloudWatch

### Captura 7.1: Custom Metrics - Greenhouse namespace

**Pasos:**
1. AWS Console > CloudWatch > Metrics > All metrics
2. Buscar namespace "Greenhouse"
3. Seleccionar métricas: EventsProcessed, AlertsProcessed

**Qué capturar:**
- Gráfico mostrando métricas de últimas 1-3 horas
- Valores numéricos (ej: 50 eventos procesados)

**Archivo:** `07-cloudwatch/custom-metrics.png`

### Captura 7.2: Alarma de errores

**Pasos:**
1. AWS Console > CloudWatch > Alarms
2. Ver alarma "ProcessTelemetry-HighErrorRate"

**Qué capturar:**
- Estado de la alarma (debe estar OK, no en ALARM)
- Configuración: threshold, period

**Archivo:** `07-cloudwatch/alarm.png`

---

## 8. Escenarios de Anomalías

### Captura 8.1: TEMP_HIGH

**Código (en fog-gateway/src/index.js):**
```javascript
gateway.injectAnomaly('B', 'temperature', 33);
```

**Qué capturar:**
1. Log de Fog Gateway mostrando alerta
2. Mensaje en IoT Test Client
3. Item en DynamoDB con alertType=THRESHOLD_HIGH
4. Archivo JSON en S3

**Archivos:**
- `08-anomalias/temp-high-fog.png`
- `08-anomalias/temp-high-iot.png`
- `08-anomalias/temp-high-dynamo.png`

### Captura 8.2: SOIL_DRY

**Código:**
```javascript
gateway.injectAnomaly('A', 'soilMoisture', 25);
```

**Qué capturar:**
1. Alerta con actionTaken="irrigation=ON"
2. DynamoDB mostrando acción

**Archivos:**
- `08-anomalias/soil-dry-fog.png`
- `08-anomalias/soil-dry-dynamo.png`

### Captura 8.3: TEMP_HIGH_SUSTAINED

**Pasos:**
1. Inyectar temp=31 tres veces (esperar 5-10s entre cada una)
2. Observar alerta SUSTAINED

**Qué capturar:**
- Alerta mostrando duration > 15s
- severity=HIGH

**Archivos:**
- `08-anomalias/sustained-alert.png`

---

## 9. Test E2E

### Captura 9.1: Ejecutar suite de pruebas

**Comando:**
```bash
cd pruebas
npm install
export S3_BUCKET=greenhouse-history-{ACCOUNT_ID}
npm test
```

**Qué capturar:**
- Output completo mostrando:
  - ✓ PASS: DynamoDB Current State
  - ✓ PASS: DynamoDB Alerts
  - ✓ PASS: S3 Historical Data
  - ✓ PASS: Data Freshness
  - ✓ PASS: All Zones Verification
  - "ALL TESTS PASSED"

**Archivo:** `09-tests/e2e-suite.png`

---

## 10. Video Demo (Opcional pero Recomendado)

### Grabación de pantalla (2-3 minutos)

**Secuencia:**
1. Mostrar Fog Gateway corriendo (0:00-0:20)
2. Mostrar IoT Test Client recibiendo mensajes (0:20-0:40)
3. Inyectar anomalía y mostrar alerta (0:40-1:00)
4. Mostrar DynamoDB con datos actualizados (1:00-1:20)
5. Mostrar S3 con archivos guardados (1:20-1:40)
6. Mostrar CloudWatch Metrics (1:40-2:00)

**Herramientas:** OBS Studio, Loom, o grabador nativo de Windows/Mac

**Archivo:** `demo-completo.mp4`

---

## Checklist de Evidencias Mínimas

- [ ] Pulumi deployment exitoso
- [ ] Fog Gateway iniciado y conectado
- [ ] Mensajes MQTT recibidos en IoT Core
- [ ] Lambda procesando eventos (CloudWatch Logs)
- [ ] DynamoDB con estado actual de 3 zonas
- [ ] DynamoDB con al menos 2 alertas
- [ ] S3 con archivos organizados por fecha
- [ ] CloudWatch Metrics mostrando eventos procesados
- [ ] Anomalía inyectada y acción tomada registrada
- [ ] Test E2E pasando exitosamente

---

## Entrega Final

Comprimir carpeta `evidencias/` en ZIP y adjuntar junto con:

1. Código fuente completo
2. README.md
3. DESPLIEGUE.md
4. Este documento (EVIDENCIAS.md)

Opcionalmente incluir video demo.
