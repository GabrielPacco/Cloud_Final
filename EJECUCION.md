# 🚀 Guía de Ejecución Completa - Smart Greenhouse

Esta guía te lleva paso a paso desde **cero hasta ver el dashboard funcionando**.

---

## 📋 Pre-requisitos

Antes de empezar, verifica que tienes instalado:

```bash
# Node.js 18+
node --version

# AWS CLI configurado
aws --version
aws sts get-caller-identity

# Pulumi CLI
pulumi version
```

Si falta algo:
```bash
# Instalar Node.js: https://nodejs.org/
# Instalar AWS CLI: https://aws.amazon.com/cli/
# Instalar Pulumi: https://www.pulumi.com/docs/get-started/install/

# Configurar AWS credentials
aws configure
# Ingresa: Access Key ID, Secret Access Key, Region (us-east-1)
```

---

## 🎯 FASE 1: Desplegar Infraestructura AWS (5 minutos)

### Paso 1.1: Preparar Pulumi

```bash
# Ir al directorio de infraestructura
cd pulumi-infra

# Configurar passphrase
export PULUMI_CONFIG_PASSPHRASE=greenhouse2024

# Ver configuración actual
pulumi config

# (Opcional) Modificar configuración
pulumi config set greenhouse:greenhouseId "GH01"
pulumi config set greenhouse:zones '["A","B","C"]'
pulumi config set greenhouse:enableSNS false
```

### Paso 1.2: Preview (Ver qué se va a crear)

```bash
# Ver qué recursos se crearán (NO los crea todavía)
pulumi preview
```

**Salida esperada:**
```
Previewing update (dev)

     Type                                 Name                           Plan
 +   pulumi:pulumi:Stack                  greenhouse-dev                 create
 +   ├─ aws:dynamodb:Table                greenhouse-state               create
 +   ├─ aws:s3:Bucket                     greenhouse-history             create
 +   ├─ aws:s3:Bucket                     greenhouse-dashboard           create
 +   ├─ aws:iot:Thing                     fog-gateway-thing              create
 +   ├─ aws:iot:Certificate               fog-gateway-cert               create
 +   ├─ aws:lambda:Function               process-telemetry              create
 +   ├─ aws:lambda:Function               api-query                      create
 +   ├─ aws:apigateway:RestApi            greenhouse-api                 create
 +   ├─ aws:cloudwatch:Dashboard          greenhouse-dashboard           create
 +   └─ ... (28 más)

Resources: + 38 to create
```

### Paso 1.3: Desplegar (¡AHORA SÍ!)

```bash
# Crear toda la infraestructura
pulumi up --yes
```

**Tiempo estimado: 3-5 minutos**

**Salida al final:**
```
Outputs:
    apiUrl               : "https://abc123.execute-api.us-east-1.amazonaws.com/prod"
    dashboardUrl         : "http://greenhouse-dashboard-xyz.s3-website-us-east-1.amazonaws.com"
    cloudwatchDashboardUrl: "https://console.aws.amazon.com/cloudwatch/..."
    dynamoTableName      : "GreenhouseState"
    iotEndpointAddress   : "abc123-ats.iot.us-east-1.amazonaws.com"
    s3BucketName         : "greenhouse-history-xyz"

Resources: + 38 created
```

### Paso 1.4: Guardar Outputs Importantes

```bash
# Guardar todas las URLs en variables
export DASHBOARD_URL=$(pulumi stack output dashboardUrl)
export API_URL=$(pulumi stack output apiUrl)
export IOT_ENDPOINT=$(pulumi stack output iotEndpointAddress)
export CLOUDWATCH_URL=$(pulumi stack output cloudwatchDashboardUrl)

# Mostrar URLs
echo "Dashboard: $DASHBOARD_URL"
echo "API: $API_URL"
echo "IoT Endpoint: $IOT_ENDPOINT"
```

### Paso 1.5: Guardar Certificados IoT

```bash
# Crear directorio para certificados
mkdir -p ../fog-gateway/certs

# Descargar Root CA de Amazon
curl -o ../fog-gateway/certs/AmazonRootCA1.pem https://www.amazontrust.com/repository/AmazonRootCA1.pem

# Guardar certificado generado por Pulumi
pulumi stack output certificatePem --show-secrets > ../fog-gateway/certs/certificate.pem.crt

# Guardar private key
pulumi stack output privateKey --show-secrets > ../fog-gateway/certs/private.pem.key

# Verificar que se crearon
ls -la ../fog-gateway/certs/
```

**Salida esperada:**
```
-rw-r--r-- 1 user user 1188 AmazonRootCA1.pem
-rw-r--r-- 1 user user 1224 certificate.pem.crt
-rw-r--r-- 1 user user 1679 private.pem.key
```

✅ **CHECKPOINT 1:** Infraestructura AWS desplegada

---

## 🌐 FASE 2: Ver Dashboard Web (1 minuto)

### Paso 2.1: Abrir Dashboard en Navegador

```bash
# Abrir automáticamente (Linux/Mac)
xdg-open "$DASHBOARD_URL" 2>/dev/null || open "$DASHBOARD_URL" 2>/dev/null

# O copiar URL y pegar en navegador
echo $DASHBOARD_URL
```

**Windows:**
```bash
start "$DASHBOARD_URL"
```

### Paso 2.2: Primera Vista del Dashboard

Deberías ver:

```
┌─────────────────────────────────────────────────┐
│ 🌱 Invernadero Inteligente                      │
│    Sistema de Monitoreo IoT en Tiempo Real      │
│                                    🌓  ⚙️        │
├─────────────────────────────────────────────────┤
│ 🔌 Estado: Conectando...                        │
│ 🕐 Última Actualización: -                      │
│ 📊 Zonas Activas: -                             │
│ 🚨 Alertas Activas: -                           │
├─────────────────────────────────────────────────┤
│  ESTADÍSTICAS GLOBALES                          │
│  🌡️ --°C  💧 --%  🌱 --%  ☀️ -- lux            │
├─────────────────────────────────────────────────┤
│  📊 Monitoreo por Zonas                         │
│  [Skeleton loading...]                          │
├─────────────────────────────────────────────────┤
│  🚨 Registro de Alertas                         │
│  [Cargando alertas...]                          │
└─────────────────────────────────────────────────┘
```

### Paso 2.3: Configurar API URL en el Dashboard

**Método 1: Botón de Configuración (⚙️)**

1. Click en el botón **⚙️** (arriba derecha)
2. Pega la URL de la API:
   ```
   https://abc123.execute-api.us-east-1.amazonaws.com/prod
   ```
3. Click **"Guardar Configuración"**

**Método 2: Desde la consola del navegador**

```javascript
// Abrir DevTools (F12) > Console
localStorage.setItem('greenhouse-api-url', 'https://abc123.execute-api.us-east-1.amazonaws.com/prod');
location.reload();
```

**Resultado:** Verás un toast verde: "✓ Configuración guardada correctamente"

⚠️ **NOTA:** Por ahora el dashboard dirá "Error al cargar datos" porque **AÚN NO HAY DATOS**. Esto es normal. En el siguiente paso ejecutaremos el Fog Gateway que enviará datos.

✅ **CHECKPOINT 2:** Dashboard web accesible

---

## 🖥️ FASE 3: Ejecutar Fog Gateway (Generar Datos)

### Paso 3.1: Configurar Fog Gateway

```bash
# Volver al directorio raíz
cd ..

# Ir a fog-gateway
cd fog-gateway

# Instalar dependencias
npm install
```

### Paso 3.2: Actualizar Configuración MQTT

```bash
# Editar config.json
nano config.json  # O usa tu editor favorito
```

**Busca la sección `mqtt` y actualiza el `endpoint`:**

```json
{
  "greenhouseId": "GH01",
  "zones": ["A", "B", "C"],
  "sensors": {
    "temperature": { "min": 15, "max": 35, "unit": "C" },
    "humidity": { "min": 40, "max": 80, "unit": "%" },
    "soilMoisture": { "min": 30, "max": 70, "unit": "%" },
    "lightIntensity": { "min": 0, "max": 50000, "unit": "lux" }
  },
  "mqtt": {
    "endpoint": "TU-IOT-ENDPOINT-AQUI",  ← CAMBIAR ESTO
    "clientId": "fog-gateway-laptop01",
    "certPath": "./certs/certificate.pem.crt",
    "keyPath": "./certs/private.pem.key",
    "caPath": "./certs/AmazonRootCA1.pem"
  },
  "aggregation": {
    "windowSeconds": 120,
    "publishTopic": "greenhouse/{id}/telemetry"
  }
}
```

**Reemplaza con el endpoint real:**

```bash
# Obtener endpoint desde Pulumi
cd ../pulumi-infra
pulumi stack output iotEndpointAddress

# Copiar el valor y pegarlo en config.json
```

**Ejemplo:**
```json
"endpoint": "a1b2c3d4e5f6g7-ats.iot.us-east-1.amazonaws.com"
```

### Paso 3.3: Ejecutar Fog Gateway

```bash
# Volver a fog-gateway
cd ../fog-gateway

# Ejecutar el sistema completo
node src/index.js
```

**Salida esperada:**
```
[2025-12-29 15:30:00] ========================================
[2025-12-29 15:30:00] 🌱 FOG GATEWAY STARTED
[2025-12-29 15:30:00] ========================================
[2025-12-29 15:30:00] Greenhouse ID: GH01
[2025-12-29 15:30:00] Zones: A, B, C
[2025-12-29 15:30:00] Sensors: 12 total (4 per zone)
[2025-12-29 15:30:00] ========================================
[2025-12-29 15:30:01] ✓ MQTT Connected to AWS IoT Core
[2025-12-29 15:30:01] ✓ Database initialized (SQLite)
[2025-12-29 15:30:01] ✓ Anomaly detector ready (5 rules)
[2025-12-29 15:30:01] ✓ Aggregator configured (120s windows)
[2025-12-29 15:30:01] ========================================
[2025-12-29 15:30:05] 📊 Sensor reading: zone=A, temp=24.5°C
[2025-12-29 15:30:05] 📊 Sensor reading: zone=A, humidity=65%
[2025-12-29 15:30:05] 📊 Sensor reading: zone=A, soil=45%
[2025-12-29 15:30:05] 📊 Sensor reading: zone=A, light=12500 lux
[2025-12-29 15:30:05] 📊 Sensor reading: zone=B, temp=23.1°C
...
[2025-12-29 15:32:00] ✓ Aggregation window complete (120s)
[2025-12-29 15:32:00] 📤 Publishing aggregate to AWS: zone=A
[2025-12-29 15:32:01] ✓ MQTT publish successful: greenhouse/GH01/telemetry
[2025-12-29 15:32:01] ✓ Aggregation window complete (120s)
[2025-12-29 15:32:01] 📤 Publishing aggregate to AWS: zone=B
[2025-12-29 15:32:02] ✓ MQTT publish successful: greenhouse/GH01/telemetry
```

✅ **CHECKPOINT 3:** Fog Gateway enviando datos a AWS

---

## 📊 FASE 4: Ver Datos en Tiempo Real

### Paso 4.1: Refrescar Dashboard

**Vuelve al navegador con el dashboard y espera 2 minutos**

Después del primer agregado (120 segundos), el dashboard se actualizará automáticamente cada 30 segundos.

**Deberías ver:**

```
┌─────────────────────────────────────────────────┐
│ 🌱 Invernadero Inteligente                      │
├─────────────────────────────────────────────────┤
│ 🔌 Estado: Conectado ✓                          │
│ 🕐 Última Actualización: 15:32:01               │
│ 📊 Zonas Activas: 3/3                           │
│ 🚨 Alertas Activas: 0                           │
├─────────────────────────────────────────────────┤
│  ESTADÍSTICAS GLOBALES                          │
│  🌡️ 24.2°C  💧 64.5%  🌱 45.8%  ☀️ 12800 lux   │
├─────────────────────────────────────────────────┤
│  📊 Monitoreo por Zonas                         │
│                                                  │
│  ┌─ Zona A ──────────────── Activa ┐            │
│  │ 🌡️ Temperatura: 24.5°C           │            │
│  │    Min: 23.1 | Max: 26.2         │            │
│  │ 💧 Humedad: 65.3%                │            │
│  │    Min: 62.0 | Max: 68.5         │            │
│  │ 🌱 Suelo: 45.2%                  │            │
│  │    Min: 44.0 | Max: 46.8         │            │
│  │ ☀️ Luz: 12500 lux (24 lecturas) │            │
│  │ Actualizado: 15:32:01            │            │
│  └──────────────────────────────────┘            │
│                                                  │
│  [Similar para Zona B y C]                      │
├─────────────────────────────────────────────────┤
│  🚨 Registro de Alertas                         │
│  [ Todas | Alta | Media | Baja ]                │
│                                                  │
│  No hay alertas recientes                       │
└─────────────────────────────────────────────────┘
```

### Paso 4.2: Probar Tema Oscuro

Click en el botón **🌓** (arriba derecha)

**Verás:**
- Toast azul: "ℹ Tema oscuro activado"
- Colores invertidos
- Persistencia (se guarda en localStorage)

### Paso 4.3: Ver API REST Funcionando

```bash
# Test endpoint /zones
curl "$API_URL/zones"
```

**Salida esperada:**
```json
{
  "zones": [
    {
      "zone": "A",
      "metrics": {
        "temperature": { "avg": 24.5, "min": 23.1, "max": 26.2, "count": 24 },
        "humidity": { "avg": 65.3, "min": 62.0, "max": 68.5, "count": 24 },
        "soilMoisture": { "avg": 45.2, "min": 44.0, "max": 46.8, "count": 24 },
        "lightIntensity": { "avg": 12500, "min": 12000, "max": 13200, "count": 24 }
      },
      "timestamp": "2025-12-29T15:32:00Z"
    },
    {
      "zone": "B",
      "metrics": { ... }
    },
    {
      "zone": "C",
      "metrics": { ... }
    }
  ]
}
```

```bash
# Test endpoint /alerts
curl "$API_URL/alerts"
```

```bash
# Test endpoint /health
curl "$API_URL/health"
```

✅ **CHECKPOINT 4:** Dashboard mostrando datos en tiempo real

---

## 🔥 FASE 5: Generar Alertas (Anomalías)

### Paso 5.1: Inyectar Temperatura Alta

Mientras el Fog Gateway está corriendo, abre **OTRA TERMINAL** y ejecuta:

```bash
cd fog-gateway

# Modificar temporalmente un sensor (simulación)
# Edita src/sensors.js y busca la función generateReading()
```

**Opción más fácil: Inyectar anomalía manualmente**

Crea un archivo `inject-anomaly.js`:

```javascript
// inject-anomaly.js
const AWS = require('aws-sdk');
const iot = new AWS.IotData({ endpoint: 'TU-IOT-ENDPOINT' });

const alert = {
  eventType: 'ALERT',
  greenhouseId: 'GH01',
  zone: 'A',
  timestamp: new Date().toISOString(),
  alertType: 'TEMP_HIGH_SUSTAINED',
  severity: 'HIGH',
  metric: 'temperature',
  value: 33.5,
  threshold: 30.0,
  duration: 180,
  message: 'Temperatura sostenida >30°C por 180s en zona A',
  actionTaken: 'fan=ON',
  deviceId: 'fog-gateway-laptop01'
};

const params = {
  topic: 'greenhouse/GH01/alerts',
  payload: JSON.stringify(alert),
  qos: 1
};

iot.publish(params, (err, data) => {
  if (err) console.error('Error:', err);
  else console.log('✓ Alert published:', data);
});
```

```bash
# Ejecutar inyección
node inject-anomaly.js
```

### Paso 5.2: Ver Alerta en Dashboard

**Refresca el dashboard (o espera 30s)**

```
┌─────────────────────────────────────────────────┐
│ 🔌 Estado: Conectado ✓                          │
│ 🚨 Alertas Activas: 1  ← AHORA MUESTRA 1        │
├─────────────────────────────────────────────────┤
│  🚨 Registro de Alertas                         │
│  [ Todas | Alta | Media | Baja ]                │
│                                                  │
│  ┌─ HIGH ──────────────────────────────────┐    │
│  │ Zona A - temperature                    │    │
│  │ Temperatura sostenida >30°C por 180s    │    │
│  │ 🕐 29/12/2025 15:35:00                  │    │
│  │ ⚙️ Acción: fan=ON                       │    │
│  │ 📊 Valor: 33.5                          │    │
│  └─────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

### Paso 5.3: Filtrar Alertas

Click en **"Alta"** → Solo muestra alertas HIGH

Click en **"Todas"** → Muestra todas nuevamente

✅ **CHECKPOINT 5:** Alertas funcionando

---

## 🗄️ FASE 6: Ver Datos en AWS Console

### Paso 6.1: DynamoDB - Estado Actual

```bash
# Abrir DynamoDB en AWS Console
echo "https://console.aws.amazon.com/dynamodbv2/home?region=us-east-1#table?name=GreenhouseState"
```

**O desde CLI:**

```bash
# Ver items en DynamoDB
aws dynamodb scan --table-name GreenhouseState --limit 10
```

**Busca items como:**
```json
{
  "PK": { "S": "GH#GH01#ZONE#A" },
  "SK": { "S": "CURRENT" },
  "timestamp": { "S": "2025-12-29T15:32:00Z" },
  "metrics": {
    "M": {
      "temperature": {
        "M": { "avg": { "N": "24.5" }, "min": { "N": "23.1" }, "max": { "N": "26.2" } }
      }
    }
  }
}
```

### Paso 6.2: S3 - Históricos JSON

```bash
# Listar archivos en S3
aws s3 ls s3://$(pulumi stack output s3BucketName) --recursive
```

**Salida esperada:**
```
2025-12-29 15:32:01    1245 GH01/zoneA/2025/12/29/snapshot-153200.json
2025-12-29 15:32:01    1245 GH01/zoneB/2025/12/29/snapshot-153200.json
2025-12-29 15:35:00     856 GH01/zoneA/2025/12/29/alert-153500.json
```

```bash
# Descargar un archivo
aws s3 cp s3://$(pulumi stack output s3BucketName)/GH01/zoneA/2025/12/29/snapshot-153200.json ./temp.json

# Ver contenido
cat temp.json
```

### Paso 6.3: CloudWatch Logs - Lambda Execution

```bash
# Ver logs de Lambda
aws logs tail /aws/lambda/ProcessTelemetry --follow
```

**Salida en vivo:**
```
2025-12-29T15:32:01.234Z INFO Received telemetry event from GH01 zone A
2025-12-29T15:32:01.456Z INFO Validation passed, writing to DynamoDB
2025-12-29T15:32:01.789Z INFO Successfully wrote to DynamoDB: GH#GH01#ZONE#A
2025-12-29T15:32:02.012Z INFO Successfully uploaded to S3: GH01/zoneA/2025/12/29/snapshot-153200.json
```

### Paso 6.4: CloudWatch Dashboard - Métricas Visuales

```bash
# Abrir CloudWatch Dashboard
echo $CLOUDWATCH_URL
```

**O navega manualmente:**
1. AWS Console → CloudWatch
2. Dashboards → `SmartGreenhouse-Monitoring`

**Verás 4 widgets:**
- Lambda Invocations, Errors, Duration
- DynamoDB Errors, Write Capacity
- IoT Messages Received, Rules Executed
- Lambda Error Logs (últimos 20)

### Paso 6.5: IoT Core - Test Client

```bash
echo "https://console.aws.amazon.com/iot/home?region=us-east-1#/test"
```

**En AWS Console IoT Core:**
1. Test → MQTT test client
2. Subscribe to topic: `greenhouse/#`
3. Deberías ver mensajes en tiempo real cada 120s

✅ **CHECKPOINT 6:** Datos visibles en todos los servicios AWS

---

## 🧪 FASE 7: Ejecutar Tests

### Paso 7.1: Tests Unitarios del Fog Gateway

```bash
cd fog-gateway

# Ejecutar tests con coverage
npm test -- --coverage
```

**Salida esperada:**
```
 PASS  tests/aggregator.test.js
 PASS  tests/anomaly-detector.test.js
 PASS  tests/buffer.test.js

--------------------------|---------|----------|---------|---------|-------------------
File                      | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
--------------------------|---------|----------|---------|---------|-------------------
All files                 |   85.23 |    78.56 |   89.12 |   85.45 |
 aggregator.js            |   92.31 |    88.89 |   100.0 |   92.31 | 45-47
 anomaly-detector.js      |   86.67 |    80.00 |   85.71 |   86.67 | 78-82
 buffer.js                |   81.25 |    66.67 |   83.33 |   81.25 | 98-105
--------------------------|---------|----------|---------|---------|-------------------

Test Suites: 3 passed, 3 total
Tests:       27 passed, 27 total
Time:        3.456s
```

### Paso 7.2: Test de API Gateway

```bash
# Test todos los endpoints
curl -i "$API_URL/health"
curl -i "$API_URL/zones"
curl -i "$API_URL/alerts"
```

✅ **CHECKPOINT 7:** Tests pasando

---

## 📸 FASE 8: Tomar Capturas de Pantalla (Evidencias)

### Checklist de Capturas

```bash
# 1. Dashboard principal (tema claro)
# Captura: dashboard-light.png

# 2. Dashboard tema oscuro
# Captura: dashboard-dark.png

# 3. DynamoDB Console con items
# Captura: dynamodb-items.png

# 4. S3 Bucket con archivos
# Captura: s3-files.png

# 5. CloudWatch Dashboard con métricas
# Captura: cloudwatch-metrics.png

# 6. CloudWatch Logs con ejecuciones Lambda
# Captura: cloudwatch-logs.png

# 7. IoT Core Test Client con mensajes MQTT
# Captura: iot-mqtt-messages.png

# 8. Fog Gateway terminal ejecutándose
# Captura: fog-gateway-running.png

# 9. Alerta en el dashboard
# Captura: dashboard-alert.png

# 10. API REST respuesta JSON
# Captura: api-response.png
```

---

## 🛑 FASE 9: Detener Todo

### Paso 9.1: Detener Fog Gateway

En la terminal donde corre `node src/index.js`:

```bash
# Presiona Ctrl+C
^C
[2025-12-29 15:45:00] 🛑 Shutdown signal received
[2025-12-29 15:45:00] 💾 Saving buffered events to database...
[2025-12-29 15:45:01] ✓ Buffer saved (0 pending events)
[2025-12-29 15:45:01] 🔌 Disconnecting MQTT client...
[2025-12-29 15:45:02] ✓ MQTT disconnected
[2025-12-29 15:45:02] 📁 Closing database connection...
[2025-12-29 15:45:02] ✓ Database closed
[2025-12-29 15:45:02] ✓ Fog Gateway stopped gracefully
```

### Paso 9.2: (Opcional) Destruir Infraestructura AWS

**⚠️ ADVERTENCIA: Esto eliminará TODOS los recursos y datos**

```bash
cd ../pulumi-infra

# Destruir toda la infraestructura
pulumi destroy --yes
```

**Tiempo: ~2 minutos**

```
Destroying (dev)

     Type                                 Name                           Status
 -   pulumi:pulumi:Stack                  greenhouse-dev                 deleted
 -   ├─ aws:dynamodb:Table                greenhouse-state               deleted
 -   ├─ aws:s3:Bucket                     greenhouse-history             deleted
 -   ├─ aws:s3:Bucket                     greenhouse-dashboard           deleted
 -   └─ ... (34 más)

Resources: - 38 deleted
```

---

## 🎯 Resumen de URLs Importantes

```bash
# Guardar en un archivo para referencia
cat > urls.txt << EOF
Dashboard Web:
$DASHBOARD_URL

API REST:
$API_URL
  - GET /health
  - GET /zones
  - GET /alerts

CloudWatch Dashboard:
$CLOUDWATCH_URL

AWS Console - DynamoDB:
https://console.aws.amazon.com/dynamodbv2/home?region=us-east-1#table?name=GreenhouseState

AWS Console - S3:
https://console.aws.amazon.com/s3/home?region=us-east-1

AWS Console - IoT Core:
https://console.aws.amazon.com/iot/home?region=us-east-1

AWS Console - Lambda:
https://console.aws.amazon.com/lambda/home?region=us-east-1

AWS Console - CloudWatch Logs:
https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#logsV2:log-groups/log-group//aws/lambda/ProcessTelemetry
EOF

echo "✓ URLs guardadas en urls.txt"
```

---

## ✅ Checklist Final

- [ ] Infraestructura desplegada con Pulumi
- [ ] Dashboard web accesible públicamente
- [ ] API REST funcionando (3 endpoints)
- [ ] Fog Gateway ejecutándose y enviando datos
- [ ] Datos visibles en DynamoDB
- [ ] Archivos JSON en S3
- [ ] CloudWatch Dashboard con métricas
- [ ] Lambda logs en CloudWatch
- [ ] Alertas generadas y visibles
- [ ] Tests pasando (27/27)
- [ ] Capturas de pantalla tomadas

---

## 🎥 Demo en Vivo (5 minutos)

### Guión para Presentar

1. **Mostrar código IaC** (30 seg)
   ```bash
   code pulumi-infra/index.ts
   ```
   "38 recursos AWS definidos como código TypeScript"

2. **Desplegar desde cero** (3 min)
   ```bash
   pulumi up --yes
   ```
   "En 3 minutos se crea toda la infraestructura"

3. **Abrir dashboard** (30 seg)
   - Mostrar tema claro/oscuro
   - Configurar API URL

4. **Ejecutar Fog Gateway** (1 min)
   ```bash
   node src/index.js
   ```
   - Mostrar lecturas cada 5s
   - Mostrar agregación cada 120s

5. **Ver datos en tiempo real** (30 seg)
   - Dashboard actualizándose
   - 3 zonas con métricas
   - CloudWatch Dashboard con gráficos

---

## 🆘 Troubleshooting

### Problema: Dashboard no carga

```bash
# Verificar que el bucket existe y está público
aws s3 ls | grep greenhouse-dashboard

# Verificar website configuration
aws s3api get-bucket-website --bucket $(pulumi stack output dashboardBucketName)
```

### Problema: API devuelve 403 Forbidden

```bash
# Verificar que la API está desplegada
aws apigateway get-stages --rest-api-id $(pulumi stack output apiUrl | cut -d/ -f3 | cut -d. -f1)

# Re-desplegar
cd pulumi-infra
pulumi up --yes
```

### Problema: Fog Gateway no conecta a IoT

```bash
# Verificar certificados
ls -la fog-gateway/certs/

# Verificar endpoint
cd pulumi-infra
pulumi stack output iotEndpointAddress

# Verificar que coincide con config.json
cat ../fog-gateway/config.json | grep endpoint
```

### Problema: DynamoDB vacía

```bash
# Verificar que Lambda se está ejecutando
aws logs tail /aws/lambda/ProcessTelemetry --since 5m

# Verificar métricas IoT
aws cloudwatch get-metric-statistics \
  --namespace AWS/IoT \
  --metric-name PublishIn.Success \
  --start-time $(date -u -d '10 minutes ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum
```

---

## 📞 Contacto

Si algo no funciona, revisa:
1. Los logs de Fog Gateway
2. CloudWatch Logs de Lambda
3. AWS Console - CloudWatch Metrics

---

**¡Listo! Ahora tienes el sistema completo funcionando desde cero hasta el dashboard en vivo.** 🎉
