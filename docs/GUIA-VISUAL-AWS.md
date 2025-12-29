# 🌐 GUÍA VISUAL: Cómo Ver Todo en AWS Cloud

## 🔍 OPCIÓN 1: AWS Console (Web Browser) - LO MÁS FÁCIL

### Paso 1: Ir a DynamoDB

**URL DIRECTA (copia y pega):**
```
https://us-east-1.console.aws.amazon.com/dynamodbv2/home?region=us-east-1#item-explorer?table=GreenhouseState
```

**O manualmente:**
1. Ir a: https://console.aws.amazon.com
2. Buscar "DynamoDB" en la barra de búsqueda
3. Click en "Tables" (menú izquierdo)
4. Click en tabla: `GreenhouseState`
5. Click en tab: "Explore table items"
6. Click botón: **"Scan"** o **"Run"**

### 📸 Lo que verás:

```
┌─────────────────────────────────────────────────────────────┐
│ Items returned                                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ PK                           SK              timestamp      │
│ ─────────────────────────────────────────────────────────  │
│ GH#GH01#ZONE#A              CURRENT         2025-12-23...  │
│ GH#GH01#ZONE#B              CURRENT         2025-12-23...  │
│ GH#GH01#ZONE#C              CURRENT         2025-12-23...  │
│ GH#GH01#ZONE#B              ALERT#2025...   2025-12-23...  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Click en cualquier item para ver el JSON completo con:**
- Temperatura (temperature)
- Humedad (humidity)
- Suelo (soilMoisture)
- Luz (lightIntensity)

---

### Paso 2: Ver Mensajes MQTT en Tiempo Real

**URL DIRECTA:**
```
https://us-east-1.console.aws.amazon.com/iot/home?region=us-east-1#/test
```

**Pasos:**
1. En "Topic filter" escribir: `greenhouse/#`
2. Click botón: **"Subscribe"**
3. Dejar la página abierta
4. En tu laptop ejecutar: `cd fog-gateway && node src/index.js`
5. **Verás mensajes JSON aparecer cada 120 segundos**

### 📸 Lo que verás:

```
┌─────────────────────────────────────────────────────────────┐
│ greenhouse/GH01/telemetry                   17:30:45        │
├─────────────────────────────────────────────────────────────┤
│ {                                                           │
│   "eventType": "AGGREGATE",                                 │
│   "greenhouseId": "GH01",                                   │
│   "zone": "A",                                              │
│   "timestamp": "2025-12-23T17:30:45.123Z",                  │
│   "metrics": {                                              │
│     "temperature": {                                        │
│       "avg": 24.5,                                          │
│       "min": 23.1,                                          │
│       "max": 26.2                                           │
│     }                                                       │
│   }                                                         │
│ }                                                           │
└─────────────────────────────────────────────────────────────┘
```

---

### Paso 3: Ver Logs de Lambda (procesamiento)

**URL DIRECTA:**
```
https://us-east-1.console.aws.amazon.com/cloudwatch/home?region=us-east-1#logsV2:log-groups/log-group/$252Faws$252Flambda$252FProcessTelemetry
```

**Pasos:**
1. Ir a CloudWatch > Log groups
2. Buscar: `/aws/lambda/ProcessTelemetry`
3. Click en el log group
4. Click en el stream más reciente (arriba)
5. **Verás logs de cada evento procesado**

---

### Paso 4: Ver Archivos en S3

**Abrir S3:**
```
https://s3.console.aws.amazon.com/s3/buckets/greenhouse-history-b2129e2?region=us-east-1
```

**Verás estructura:**
```
greenhouse-history-b2129e2/
  └── GH01/
      ├── zoneA/
      │   └── 2025/
      │       └── 12/
      │           └── 23/
      │               └── alert-173045.json
      ├── zoneB/
      └── zoneC/
```

---

## 🔍 OPCIÓN 2: Desde tu Terminal (Comandos)

### Ver datos en DynamoDB:
```bash
aws dynamodb scan --table-name GreenhouseState --limit 10
```

### Ver último estado de Zona A:
```bash
aws dynamodb query \
  --table-name GreenhouseState \
  --key-condition-expression "PK = :pk AND SK = :sk" \
  --expression-attribute-values '{":pk":{"S":"GH#GH01#ZONE#A"},":sk":{"S":"CURRENT"}}'
```

### Ver archivos en S3:
```bash
aws s3 ls s3://greenhouse-history-b2129e2/ --recursive
```

### Ver logs de Lambda:
```bash
aws logs describe-log-streams \
  --log-group-name "/aws/lambda/ProcessTelemetry" \
  --order-by LastEventTime \
  --descending \
  --max-items 1
```

---

## 🎯 Resumen de URLs Importantes

| Servicio | URL Directa |
|----------|-------------|
| **DynamoDB** | https://us-east-1.console.aws.amazon.com/dynamodbv2/home?region=us-east-1#item-explorer?table=GreenhouseState |
| **IoT Core (MQTT Test)** | https://us-east-1.console.aws.amazon.com/iot/home?region=us-east-1#/test |
| **CloudWatch Logs** | https://us-east-1.console.aws.amazon.com/cloudwatch/home?region=us-east-1#logsV2:log-groups |
| **S3 Bucket** | https://s3.console.aws.amazon.com/s3/buckets/greenhouse-history-b2129e2?region=us-east-1 |
| **Lambda Functions** | https://us-east-1.console.aws.amazon.com/lambda/home?region=us-east-1#/functions/ProcessTelemetry |
| **CloudWatch Metrics** | https://us-east-1.console.aws.amazon.com/cloudwatch/home?region=us-east-1#metricsV2:graph=~();namespace=~'Greenhouse |

---

## ✅ Checklist Rápido

Para ver datos en tiempo real:

1. ✅ Abrir AWS Console → DynamoDB → Tabla GreenhouseState → Scan
2. ✅ Abrir AWS Console → IoT Core → Test → Subscribe a `greenhouse/#`
3. ✅ En tu laptop ejecutar: `cd fog-gateway && node src/index.js`
4. ✅ Ver mensajes aparecer en IoT Test Client cada 120 segundos
5. ✅ Verificar en DynamoDB que los datos se guardan

---

## 🆘 Si no ves datos:

1. **Verificar que Fog Gateway esté corriendo:**
   ```bash
   cd fog-gateway
   node src/index.js
   ```
   Debe decir: `[MQTT] Connected to AWS IoT Core`

2. **Esperar 2 minutos** (la primera publicación de agregados tarda 120 segundos)

3. **Verificar credenciales AWS:**
   ```bash
   aws sts get-caller-identity
   ```
   Debe mostrar tu Account ID

4. **Ver si hay errores en Lambda:**
   - Ir a CloudWatch Logs
   - Buscar `/aws/lambda/ProcessTelemetry`
   - Ver si hay errores
