# Invernadero Inteligente: Fog Computing + Serverless AWS

## 1. Definición del Problema

Los sistemas de monitoreo agrícola tradicionales enfrentan costos elevados al transmitir datos crudos de sensores directamente a la nube (alto consumo de ancho de banda, latencia variable, dependencia total de conectividad). En un invernadero con múltiples zonas y decenas de sensores generando lecturas cada 5-10 segundos, el volumen de datos puede superar rápidamente los límites del Free Tier y dificultar la detección temprana de anomalías críticas (temperatura extrema, falta de riego). Este proyecto implementa una arquitectura híbrida Fog+Cloud donde el procesamiento local (laptop como Fog Gateway) realiza agregación, detección de anomalías y buffering offline, publicando a AWS solo telemetría agregada (cada 60-120s) y alertas bajo demanda. El backend serverless en AWS (IoT Core, Lambda, DynamoDB) procesa eventos de manera escalable y económica, permitiendo histórico centralizado, trazabilidad y respuesta automatizada sin infraestructura permanente.

## 2. Objetivos

**Objetivo General:** Diseñar e implementar una solución IoT escalable y económica para monitoreo inteligente de invernaderos utilizando Fog Computing (laptop) y arquitectura serverless en AWS con IaC (Pulumi).

**Objetivos Específicos:**
- Implementar agregación local de telemetría en Fog Gateway para reducir volumen de mensajes a AWS en 95%+
- Detectar anomalías en tiempo real (reglas de umbral, duración, sensor stuck/silent) con respuesta local inmediata
- Garantizar resiliencia mediante buffering local y reintento automático ante fallas de conectividad
- Persistir estado actual y eventos históricos en DynamoDB/S3 con estrategia de TTL para control de costos
- Diseñar infraestructura completamente parametrizable (zonas, sensores, umbrales) mediante Pulumi/TypeScript
- Proveer observabilidad y trazabilidad end-to-end con CloudWatch Logs/Metrics para auditoría

## 3. Requisitos

### Requisitos Funcionales (RF)
- **RF1:** Simulación local de N sensores por zona (temp, humedad, humedad suelo, luz, CO2) con lecturas cada 5-10s
- **RF2:** Agregación en ventanas de 60-120s: avg/min/max/count por métrica y zona
- **RF3:** Detección de 5+ tipos de anomalías: umbral simple, umbral sostenido, sensor stuck, sensor silent, cambio abrupto
- **RF4:** Respuesta local a anomalías: activación de actuadores simulados (fan, irrigation, shade) registrada como eventos
- **RF5:** Publicación MQTT a AWS IoT Core solo de agregados y alertas (no datos crudos)
- **RF6:** Buffer local FIFO con reintento exponencial ante desconexión
- **RF7:** Persistencia de estado actual (último agregado por zona) y eventos recientes en DynamoDB
- **RF8:** Histórico de snapshots/alertas en S3 con organización por fecha y zona
- **RF9 (opcional):** API REST para consulta de estado y alertas históricas

### Requisitos No Funcionales (RNF)
- **RNF1:** Escalabilidad horizontal: agregar zonas/sensores/invernaderos sin rediseño arquitectónico
- **RNF2:** Costo: mantenerse dentro de AWS Free Tier (1M mensajes IoT Core, 1M invocaciones Lambda, 25GB DynamoDB, 5GB S3)
- **RNF3:** Disponibilidad: tolerar desconexiones de hasta 4h con buffer local de 10K eventos
- **RNF4:** Latencia: detección local de anomalías <1s, publicación a cloud <5s post-agregación
- **RNF5:** Seguridad: autenticación X.509 para Fog Gateway, IAM least-privilege para Lambda
- **RNF6:** Trazabilidad: logs estructurados en CloudWatch con retención de 7 días

## 4. Arquitectura y Flujo

### Diagrama Textual
```
[Sensores Simulados (Local)]
    ↓ (5-10s lecturas)
[Fog Gateway - Laptop]
  ├─ Agregación (60-120s ventanas)
  ├─ Detección Anomalías (reglas)
  ├─ Respuesta Local (actuadores)
  └─ Buffer Offline
    ↓ (MQTT publish)
[AWS IoT Core]
  ├─ topic: greenhouse/{id}/telemetry
  └─ topic: greenhouse/{id}/alerts
    ↓ (IoT Rules)
[Lambda: ProcessTelemetry]
  ├─ Validación (schema, sanity checks)
  ├─ Enriquecimiento (timestamp, metadata)
  └─ Escritura paralela
    ↓
┌─[DynamoDB]──────────────┬─[S3]────────────┬─[CloudWatch]─┐
│ Tabla: GreenhouseState  │ Prefijo:        │ Logs         │
│ PK: GH#{id}#ZONE#{zone} │ {id}/{zone}/    │ Metrics      │
│ SK: CURRENT / ALERT#{ts}│ {yyyy}/{mm}/{dd}│ Alarmas      │
└─────────────────────────┴─────────────────┴──────────────┘
    ↓ (opcional)
[SNS Topic] → Email/SMS (alertas HIGH)
[API Gateway] → Consulta estado (GET /state/{zone})
```

### Flujo Paso a Paso
1. **Simulación Local:** Script Python/Node en laptop genera lecturas cada 5-10s por sensor (temp: 15-35°C, humidity: 40-80%, etc.)
2. **Agregación Fog:** Cada 60-120s, Fog Gateway calcula por zona: `{avg_temp, min_temp, max_temp, count, timestamp}`
3. **Detección Anomalías:** Motor de reglas evalúa:
   - Umbral: `temp > 32°C` → `TEMP_HIGH`
   - Sostenido: `temp > 30°C por 3 ventanas` → `TEMP_HIGH_SUSTAINED`
   - Stuck: `valor idéntico en 5 lecturas` → `SENSOR_STUCK`
   - Silent: `sin datos en 60s` → `SENSOR_SILENT`
4. **Respuesta Local:** Si `TEMP_HIGH_SUSTAINED` → `fan=ON`, registra `ACTION_TAKEN` local
5. **Buffering:** Cola FIFO local (SQLite/archivo JSON) con retry exponencial (10s, 30s, 60s...)
6. **Publish MQTT:**
   - `greenhouse/GH01/telemetry` → payload AGGREGATE
   - `greenhouse/GH01/alerts` → payload ALERT (solo si anomalía)
7. **IoT Core Ingestion:** Recibe mensajes autenticados vía cert X.509
8. **IoT Rules:**
   - Rule 1: `SELECT * FROM 'greenhouse/+/telemetry'` → Lambda ProcessTelemetry
   - Rule 2: `SELECT * FROM 'greenhouse/+/alerts' WHERE severity='HIGH'` → SNS (opcional)
9. **Lambda Processing:**
   - Valida schema (campos obligatorios, tipos)
   - Sanity checks (`min <= avg <= max`)
   - Enriquece con `receivedAt`, `processingId`
   - Escribe en DynamoDB (último estado + evento)
   - Escribe en S3 si es snapshot o alerta
10. **Persistencia DynamoDB:** Update item `PK=GH01#ZONE#A, SK=CURRENT`, insert `SK=ALERT#2025-12-23T10:30:00Z`
11. **Histórico S3:** PUT `s3://greenhouse-history/GH01/zoneA/2025/12/23/snapshot-103000.json`
12. **Observabilidad:** CloudWatch captura logs Lambda, métricas custom (alertas/min), alarmas (error rate >5%)

## 5. Diseño de Eventos JSON

### Evento AGGREGATE (telemetry)
```json
{
  "eventType": "AGGREGATE",
  "greenhouseId": "GH01",
  "zone": "A",
  "timestamp": "2025-12-23T10:30:00Z",
  "windowDurationSec": 120,
  "metrics": {
    "temperature": {"avg": 24.5, "min": 23.1, "max": 26.2, "count": 24},
    "humidity": {"avg": 65.3, "min": 62.0, "max": 68.5, "count": 24},
    "soilMoisture": {"avg": 45.2, "min": 44.0, "max": 46.8, "count": 24},
    "lightIntensity": {"avg": 12500, "min": 12000, "max": 13200, "count": 24}
  },
  "deviceId": "fog-gateway-laptop01"
}
```

### Evento ALERT
```json
{
  "eventType": "ALERT",
  "greenhouseId": "GH01",
  "zone": "B",
  "timestamp": "2025-12-23T10:32:15Z",
  "alertType": "TEMP_HIGH_SUSTAINED",
  "severity": "HIGH",
  "metric": "temperature",
  "value": 31.8,
  "threshold": 30.0,
  "duration": 180,
  "message": "Temperatura sostenida >30°C por 180s en zona B",
  "actionTaken": "fan=ON",
  "deviceId": "fog-gateway-laptop01"
}
```

### Reglas de Validación (Lambda)
- **Campos obligatorios:** `eventType`, `greenhouseId`, `zone`, `timestamp`, `deviceId`
- **Tipos:** `timestamp` ISO8601, `metrics.*` objetos con `{avg, min, max, count}` numéricos
- **Sanity checks:**
  - `min <= avg <= max`
  - `count > 0`
  - `windowDurationSec` entre 30-300
  - `timestamp` no futuro (max +60s tolerancia)
- **ALERT:** requiere `alertType`, `severity` (LOW/MEDIUM/HIGH), `metric`, `value`
- **Rechazos:** retornar error a CloudWatch, no escribir en DynamoDB

## 6. Modelo de Datos

### DynamoDB: Tabla `GreenhouseState`
**Propósito:** Estado actual por zona + eventos recientes (últimas 24h)

**Claves:**
- **PK (Partition Key):** `GH#{greenhouseId}#ZONE#{zone}` → ej: `GH#GH01#ZONE#A`
- **SK (Sort Key):** `CURRENT` (último agregado) o `ALERT#{timestamp}` (alertas)

**Atributos adicionales:** `timestamp`, `metrics` (map), `alertType`, `severity`, `actionTaken`, `ttl`

**Consultas típicas:**
- Último estado zona A: `Query(PK=GH#GH01#ZONE#A, SK=CURRENT)`
- Últimas alertas zona B: `Query(PK=GH#GH01#ZONE#B, SK begins_with ALERT#, limit=10)`

**TTL:** Campo `ttl` = timestamp + 7 días (elimina automáticamente eventos >7d)

### S3: Bucket `greenhouse-history`
**Propósito:** Histórico de largo plazo (snapshots horarios + todas las alertas)

**Estructura de prefijos:**
```
greenhouse-history/
  GH01/
    zoneA/
      2025/12/23/
        snapshot-100000.json  (agregado cada hora)
        snapshot-110000.json
        alert-103215.json     (cada alerta)
    zoneB/
      2025/12/23/
        ...
```

**Lifecycle Policy:** Transición a S3 Glacier después de 90 días, eliminación después de 365 días

**Indexación:** Tags `{GreenhouseId, Zone, EventType, Date}` para filtrado posterior con Athena (opcional)

## 7. Respuesta a Anomalías

### Nivel A: Fog Gateway (Respuesta Inmediata)
**Motor de Reglas Local:**
```
IF temp > 30°C SUSTAINED (3 ventanas) → fan=ON
IF soilMoisture < 30% → irrigation=ON
IF light > 50000 lux → shade=CLOSED
IF humidity > 85% SUSTAINED → vent=OPEN
```

**Proceso:**
1. Detecta anomalía en ventana actual
2. Ejecuta acción simulada (actualiza estado de actuador en memoria)
3. Registra evento `ACTION_TAKEN` en log local y base de datos SQLite
4. Publica ALERT con campo `actionTaken: "fan=ON"`

**Ejemplo Log Local:**
```
[2025-12-23 10:32:15] ALERT: TEMP_HIGH_SUSTAINED zone=B value=31.8 → ACTION: fan=ON (duration=300s)
```

### Nivel B: Cloud (Registro y Notificación)
**Lambda ProcessTelemetry:**
1. Recibe ALERT con `severity=HIGH`
2. Escribe en DynamoDB `PK=GH#GH01#ZONE#B, SK=ALERT#2025-12-23T10:32:15Z`
3. Escribe en S3 `GH01/zoneB/2025/12/23/alert-103215.json`
4. Si `severity=HIGH` → publica a SNS Topic `GreenhouseAlertsHigh`
5. CloudWatch Metric `AlertCount` +1 (trigger alarma si >10 alertas/hora)

**Notificación SNS (opcional):**
```
Subject: [HIGH] TEMP_HIGH_SUSTAINED - GH01 Zone B
Body: Temperatura sostenida >30°C por 180s. Acción tomada: fan=ON. Revisar dashboard.
```

**Comando Cloud→Fog (avanzado - opcional):**
- Topic: `greenhouse/GH01/commands`
- Payload: `{"command": "override_fan", "zone": "B", "value": "OFF"}`
- Fog suscribe, ejecuta, publica ACK en `greenhouse/GH01/acks`

## 8. Recursos AWS con Pulumi (sin código)

### IoT Core
- **Thing:** `FogGateway-Laptop01`
- **Certificate:** X.509 cert + private key (almacenar localmente)
- **Policy:** `FogGatewayPolicy` (permisos: `iot:Connect`, `iot:Publish` en `greenhouse/*`, `iot:Subscribe` en `greenhouse/+/commands`)
- **IoT Rule 1:** `ProcessTelemetryRule` → trigger Lambda ProcessTelemetry
- **IoT Rule 2:** `HighAlertsSNSRule` → filtro `severity='HIGH'` → SNS

### Lambda
- **Función:** `ProcessTelemetry` (runtime Node.js 20.x, timeout 10s, memory 256MB)
- **Variables de entorno:** `DYNAMODB_TABLE`, `S3_BUCKET`, `SNS_TOPIC_ARN`
- **IAM Role:** permisos `dynamodb:PutItem`, `dynamodb:UpdateItem`, `s3:PutObject`, `sns:Publish`, `logs:CreateLogGroup`

### DynamoDB
- **Tabla:** `GreenhouseState`
- **Billing:** On-Demand (Free Tier: 25GB storage)
- **Keys:** PK (String), SK (String)
- **GSI (opcional):** `GSI-ByTimestamp` para queries por rango de fechas
- **TTL:** habilitado en atributo `ttl`

### S3
- **Bucket:** `greenhouse-history-{accountId}` (nombre único global)
- **Encryption:** SSE-S3 (default)
- **Lifecycle:** Glacier tras 90d, delete tras 365d
- **Versioning:** deshabilitado (control de costos)

### CloudWatch
- **Log Groups:** `/aws/lambda/ProcessTelemetry` (retención 7 días)
- **Metrics Custom:** namespace `Greenhouse` → `AlertCount`, `TelemetryReceived`, `ProcessingErrors`
- **Alarm:** `HighErrorRate` → trigger si `ProcessingErrors > 5` en 5min

### SNS (opcional)
- **Topic:** `GreenhouseAlertsHigh`
- **Subscription:** email (configurar manualmente post-deploy)

### API Gateway (opcional)
- **API REST:** `GreenhouseAPI`
- **Endpoints:**
  - `GET /state/{zone}` → Lambda query DynamoDB
  - `GET /alerts?since={timestamp}` → Lambda query DynamoDB GSI
- **Auth:** API Key (control de acceso básico)

### Parámetros Configurables en Pulumi
- `greenhouseId` (string)
- `zones` (array: ["A", "B", "C"])
- `aggregationWindowSec` (number: 60-300)
- `retentionDays` (number: 7)
- `enableSNS` (boolean)
- `enableAPIGateway` (boolean)

## 9. Estrategia de Costos (Free Tier)

### Parámetros Recomendados
- **Lecturas locales:** 5-10s (0 costo AWS)
- **Publish agregados:** 120s por zona (30 msg/hora/zona)
- **Publish alertas:** solo al ocurrir (estimar 5-10 alertas/día/zona)
- **Zonas iniciales:** 3 zonas
- **Sensores por zona:** 4-5 métricas

### Cálculo Mensual (3 zonas)
- **IoT Core:** 3 zonas × 30 msg/hora × 730h = 65.7K mensajes/mes (<<1M Free Tier)
- **Lambda:** 65.7K invocaciones (<<1M Free Tier), ~10ms ejecución
- **DynamoDB:** ~200 writes/día = 6K/mes (Free Tier 25 WCU), storage <1GB
- **S3:** ~100 alertas + 72 snapshots/mes = ~1MB/mes (<<5GB Free Tier)
- **CloudWatch Logs:** ~50MB/mes (<<5GB Free Tier con retención 7d)

### Medidas de Control
1. **Moderar Logs:** Lambda solo loguea errores + eventos críticos (no cada write)
2. **TTL DynamoDB:** eliminar items >7 días automáticamente
3. **S3 Lifecycle:** mover a Glacier tras 90d
4. **Desactivar SNS:** si no es necesario (evitar costos SMS)
5. **Monitoreo:** CloudWatch Alarm si IoT messages >800K/mes (80% Free Tier)
6. **Buffer Local:** evitar reintentos excesivos (max 3 reintentos/evento)

### Escalabilidad
- **+3 zonas → 131K msg/mes** (aún dentro Free Tier)
- **+1 invernadero → duplica todo** (considerar créditos AWS Educate: $100)

## 10. Plan de Pruebas y Evidencias

### Fase 1: Pruebas Locales (Fog Gateway)
1. **Simulador de Sensores**
   - Ejecutar script local generando 3 zonas × 4 métricas × 10s
   - Verificar lecturas en logs: 12 sensores activos
   - Evidencia: captura logs con timestamps

2. **Agregación**
   - Ejecutar por 5 min (2-3 ventanas de 120s)
   - Verificar cálculos: avg/min/max correctos
   - Evidencia: comparar lecturas crudas vs agregados en SQLite local

3. **Detección de Anomalías**
   - Inyectar temp=33°C sostenida por 3 ventanas
   - Verificar alerta `TEMP_HIGH_SUSTAINED` generada
   - Evidencia: log de alerta + acción `fan=ON`

4. **Buffer Offline**
   - Desconectar red, generar 50 eventos
   - Reconectar, verificar reintento
   - Evidencia: log de "buffered 50 events, retrying..."

### Fase 2: Integración AWS
5. **Publish MQTT a IoT Core**
   - Conectar con cert X.509
   - Publicar 10 agregados + 2 alertas
   - Evidencia: AWS IoT Core Test Client mostrando mensajes recibidos

6. **IoT Rule → Lambda**
   - Verificar invocaciones en CloudWatch Logs
   - Revisar logs de validación (rechazos por schema inválido)
   - Evidencia: captura CloudWatch Logs `/aws/lambda/ProcessTelemetry`

7. **Escritura DynamoDB**
   - Query `PK=GH#GH01#ZONE#A, SK=CURRENT`
   - Verificar última telemetría con timestamp reciente
   - Query alertas últimas 24h
   - Evidencia: captura DynamoDB Console con 3 items

8. **Histórico S3**
   - Listar objetos en `s3://greenhouse-history/GH01/zoneA/2025/12/23/`
   - Descargar y verificar JSON de alerta
   - Evidencia: captura S3 Console + contenido archivo

9. **CloudWatch Metrics**
   - Graficar métrica `AlertCount` por 1 hora
   - Verificar picos correlacionan con inyección de anomalías
   - Evidencia: captura gráfico CloudWatch

### Fase 3: Escenarios End-to-End
10. **Escenario Nominal**
    - 3 zonas operando normalmente por 30 min
    - Sin alertas, solo telemetría agregada
    - Evidencia: dashboard con 15 agregados escritos en DynamoDB

11. **Escenario Anomalía Crítica**
    - Inyectar `soilMoisture=20%` en zona B por 5 min
    - Verificar alerta `SOIL_DRY` + acción `irrigation=ON`
    - Verificar notificación SNS recibida (si habilitado)
    - Evidencia: email SNS + registro DynamoDB + S3

12. **Escenario Resiliencia**
    - Desconectar red por 10 min
    - Generar 100 eventos locales
    - Reconectar y verificar sincronización completa
    - Evidencia: diff count local vs DynamoDB (100% match)

### Fase 4: API y Consultas (si habilitado)
13. **GET /state/A**
    - Invocar API Gateway con API Key
    - Verificar respuesta JSON con últimos agregados
    - Evidencia: Postman/curl request + response

14. **GET /alerts?since=2025-12-23T00:00:00Z**
    - Consultar alertas últimas 24h
    - Verificar lista ordenada por timestamp
    - Evidencia: captura respuesta JSON

### Lista de Evidencias a Recolectar
- [ ] Logs locales Fog Gateway (agregación + anomalías)
- [ ] Captura AWS IoT Core Test Client (mensajes recibidos)
- [ ] CloudWatch Logs Lambda (10+ invocaciones con trace completo)
- [ ] DynamoDB Console (tabla con 9+ items: 3 CURRENT + 6 ALERT)
- [ ] S3 Console (10+ archivos JSON en estructura correcta)
- [ ] CloudWatch Metrics (gráfico AlertCount 1h)
- [ ] Email SNS (alerta HIGH recibida) - opcional
- [ ] Postman/curl API Gateway (request + response) - opcional
- [ ] Video/GIF demostrando flujo end-to-end (2-3 min)

---

**Nota:** Este documento es la base de diseño. La implementación con Pulumi seguirá esta arquitectura creando recursos mediante código IaC TypeScript.
