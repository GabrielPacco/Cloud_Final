# ⚡ INICIO RÁPIDO - Smart Greenhouse

Guía de 5 minutos para ejecutar todo el proyecto.

---

## 🚀 Opción 1: Todo en Un Comando (Recomendado)

```bash
# 1. Deploy infraestructura
cd pulumi-infra
export PULUMI_CONFIG_PASSPHRASE="greenhouse2024"
pulumi up -y

# 2. Ejecutar Fog Gateway
cd ../fog-gateway
npm install
node src/index.js

# 3. Abrir Dashboard Web (en otra terminal)
cd ../web-dashboard
start index.html  # Windows
# o
open index.html  # Mac
```

**Tiempo total: 3-4 minutos**

---

## 📋 Checklist de Verificación

Después de ejecutar, verifica que todo funcione:

### ✅ Paso 1: Fog Gateway corriendo
Deberías ver:
```
[FogGateway] All systems operational
[MQTT] Connected to AWS IoT Core
[Sensors] Starting simulator...
```

### ✅ Paso 2: MQTT publicando datos
Cada 120 segundos verás:
```
[MQTT] Published AGGREGATE to greenhouse/GH01/telemetry
```

### ✅ Paso 3: Anomalías detectadas
Después de ~30 segundos:
```
[AnomalyDetector] ACTION TAKEN: Zone B -> fan=ON
[FogGateway] ALERT: THRESHOLD_HIGH - temperature above threshold
```

### ✅ Paso 4: API funcionando
```bash
curl https://[TU-API-URL]/prod/health
# Respuesta: {"status":"healthy","greenhouse":"GH01"}
```

### ✅ Paso 5: Dashboard mostrando datos
Abre web-dashboard/index.html, configura API URL, y verás:
- 3 zonas con métricas
- Alertas recientes
- Auto-refresh cada 30s

### ✅ Paso 6: Email de SNS (si configuraste)
Revisa tu email, deberías tener:
```
Subject: AWS Notification - Subscription Confirmation
```
Haz clic en "Confirm subscription"

---

## 🔍 Ver Datos en AWS Console

### DynamoDB
```
https://console.aws.amazon.com/dynamodb
→ Tables → GreenhouseState → Explore items
```

### S3
```
https://console.aws.amazon.com/s3
→ Buckets → greenhouse-history-* → Browse
```

### Lambda Logs
```
https://console.aws.amazon.com/cloudwatch
→ Logs → Log groups → /aws/lambda/ProcessTelemetry
```

### API Gateway
```
https://console.aws.amazon.com/apigateway
→ APIs → GreenhouseAPI → Stages → prod
```

---

## 🧪 Probar Features Nuevas

### 1. Probar API REST
```bash
# Obtener URL
cd pulumi-infra
pulumi stack output apiUrl

# Llamar endpoints
curl [API-URL]/health
curl [API-URL]/zones
curl [API-URL]/alerts
```

### 2. Probar Dashboard Web
```bash
cd web-dashboard
python -m http.server 8000
# Abre http://localhost:8000
```

### 3. Correr Tests
```bash
cd fog-gateway
npm test
```

Verás:
```
Test Suites: 3 passed
Tests: 25 passed
Coverage: 85%
```

### 4. Ver Email Notifications (SNS)
```bash
# 1. Configurar tu email
cd pulumi-infra
pulumi config set greenhouse-infra:alertEmail tu-email@gmail.com
pulumi up -y

# 2. Confirmar suscripción (revisa email)

# 3. Generar alerta HIGH
cd ../fog-gateway
node src/index.js
# Espera 30 segundos para anomalía automática

# 4. Revisa email, deberías recibir alerta
```

---

## 📊 Comandos Útiles

### Ver outputs de Pulumi
```bash
cd pulumi-infra
export PULUMI_CONFIG_PASSPHRASE="greenhouse2024"
pulumi stack output
```

### Ver logs de Lambda en tiempo real
```bash
aws logs tail /aws/lambda/ProcessTelemetry --follow
```

### Ver archivos en S3
```bash
aws s3 ls s3://greenhouse-history-b2129e2/ --recursive --human-readable
```

### Ver datos en DynamoDB
```bash
aws dynamodb scan --table-name GreenhouseState --max-items 5
```

### Dashboard terminal (alternativa)
```bash
cd fog-gateway
node visualizar.js
```

---

## 🗑️ Destruir Todo

```bash
cd pulumi-infra
export PULUMI_CONFIG_PASSPHRASE="greenhouse2024"
pulumi destroy -y
```

**Tiempo: 2-3 minutos**

---

## 🆘 Troubleshooting

### Problema: "MQTT Connection closed"
**Solución:** Normal. El buffer local guarda datos y reintenta automáticamente.

### Problema: "passphrase required"
**Solución:**
```bash
export PULUMI_CONFIG_PASSPHRASE="greenhouse2024"
```

### Problema: S3 vacío
**Solución:** Snapshots solo se guardan cada hora (:00). Espera hasta las XX:00.

### Problema: API no funciona
**Solución:** Obtén la URL correcta:
```bash
cd pulumi-infra
pulumi stack output apiUrl
```

### Problema: Tests fallan
**Solución:**
```bash
cd fog-gateway
rm -rf node_modules
npm install
npm test
```

---

## 📝 Estructura del Proyecto

```
Trabajo Final Cloud/
├── fog-gateway/           # Fog Computing (tu laptop)
│   ├── src/              # Código fuente
│   ├── tests/            # Tests unitarios
│   └── config.json       # Configuración
│
├── pulumi-infra/         # Infrastructure as Code
│   ├── index.ts          # Definición de recursos
│   ├── lambda/           # Código de Lambdas
│   └── Pulumi.dev.yaml   # Configuración
│
├── web-dashboard/        # Dashboard Web
│   ├── index.html        # Interfaz
│   ├── app.js            # Lógica
│   └── styles.css        # Estilos
│
└── *.md                  # Documentación
    ├── README.md         # Inicio
    ├── README-MEJORAS.md # Nuevas features
    ├── INICIO-RAPIDO.md  # Esta guía
    └── DESTRUIR-TODO.md  # Cómo eliminar
```

---

## 🎯 Flujo Completo

```
1. Sensores simulados (fog-gateway)
   ↓
2. Agregación local cada 120s
   ↓
3. Detección de anomalías < 1s
   ↓
4. Publicación MQTT a IoT Core
   ↓
5. Lambda procesa y guarda
   ├→ DynamoDB (estado actual)
   ├→ S3 (histórico)
   └→ SNS (si alerta HIGH)
   ↓
6. API Gateway consulta datos
   ↓
7. Dashboard Web visualiza
```

---

## 📚 Documentación Completa

- **README.md** - Arquitectura y diseño
- **README-MEJORAS.md** - 4 mejoras nuevas (SNS, API, Dashboard, Tests)
- **DESTRUIR-TODO.md** - Guía de destrucción
- **QUE-SE-GUARDA-EN-S3.md** - Explicación de S3
- **SERVICIOS-SERVERLESS.md** - 5 servicios serverless
- **POR-QUE-INGLES.md** - Naming conventions
- **QUE-ES-FOG.md** - Fog Computing explicado

---

**¡Listo para ejecutar!** 🎉

Si tienes dudas, revisa README-MEJORAS.md para detalles de cada feature.
