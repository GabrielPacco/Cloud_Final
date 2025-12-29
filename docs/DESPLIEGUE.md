# Guía de Despliegue - Invernadero Inteligente

## Prerrequisitos

1. **Cuenta AWS** con Free Tier o créditos disponibles
2. **AWS CLI** configurado con credenciales (`aws configure`)
3. **Node.js** v20+ y npm instalados
4. **Pulumi CLI** instalado ([https://www.pulumi.com/docs/get-started/install/](https://www.pulumi.com/docs/get-started/install/))
5. **Laptop** (Windows/Mac/Linux) para ejecutar Fog Gateway

## Paso 1: Desplegar Infraestructura AWS con Pulumi

### 1.1 Inicializar Pulumi

```bash
cd pulumi-infra
npm install
pulumi login --local  # O usar Pulumi Cloud (gratis)
pulumi stack init dev
```

### 1.2 Configurar parámetros (opcional)

```bash
pulumi config set greenhouseId GH01
pulumi config set zones '["A","B","C"]'
pulumi config set enableSNS false
pulumi config set retentionDays 7
```

### 1.3 Instalar dependencias de Lambda

```bash
cd lambda
npm install
cd ..
```

### 1.4 Desplegar infraestructura

```bash
pulumi up
# Revisar recursos a crear
# Confirmar: yes
```

**Tiempo estimado:** 5-7 minutos

### 1.5 Guardar certificados IoT

```bash
# Descargar Amazon Root CA
curl -o ../fog-gateway/certs/AmazonRootCA1.pem https://www.amazontrust.com/repository/AmazonRootCA1.pem

# Extraer certificado y clave privada
pulumi stack output certificatePem --show-secrets > ../fog-gateway/certs/certificate.pem.crt
pulumi stack output privateKey --show-secrets > ../fog-gateway/certs/private.pem.key
```

### 1.6 Obtener IoT Endpoint

```bash
pulumi stack output iotEndpoint
# Copiar el endpoint (ej: xxxxx-ats.iot.us-east-1.amazonaws.com)
```

## Paso 2: Configurar Fog Gateway

### 2.1 Actualizar configuración

Editar `fog-gateway/config.json`:

```json
{
  ...
  "mqtt": {
    "endpoint": "PEGAR_IOT_ENDPOINT_AQUI",
    ...
  }
}
```

### 2.2 Instalar dependencias

```bash
cd fog-gateway
npm install
```

## Paso 3: Ejecutar Fog Gateway

### 3.1 Modo de prueba (sin AWS)

```bash
node src/index.js
```

Verás logs indicando:
- `[MQTT] Running in OFFLINE mode` (si no hay certificados aún)
- `[Sensors] Starting simulator...`
- `[Aggregator] Starting...`

### 3.2 Modo conectado (con AWS)

Una vez configurados los certificados:

```bash
node src/index.js
```

Verás:
- `[MQTT] Connected to AWS IoT Core`
- Agregados publicándose cada 120s
- Alertas generadas al detectar anomalías

### 3.3 Detener con Ctrl+C

Guardará estadísticas finales y cerrará limpiamente.

## Paso 4: Verificar Funcionamiento

### 4.1 AWS IoT Core - Test Client

1. Ir a AWS Console > IoT Core > Test > MQTT test client
2. Suscribirse al topic: `greenhouse/#`
3. Esperar 2 minutos para ver mensajes `AGGREGATE`
4. Inyectar anomalía (ver abajo) para ver `ALERT`

### 4.2 DynamoDB

1. AWS Console > DynamoDB > Tables > GreenhouseState
2. Explorar items:
   - PK: `GH#GH01#ZONE#A`, SK: `CURRENT` (último estado)
   - PK: `GH#GH01#ZONE#B`, SK: `ALERT#...` (alertas)

### 4.3 Lambda Logs

```bash
aws logs tail /aws/lambda/ProcessTelemetry --follow
```

Verás logs de validación y escritura a DynamoDB/S3.

### 4.4 S3

```bash
aws s3 ls s3://greenhouse-history-{ACCOUNT_ID}/ --recursive
```

Verás archivos organizados por zona/fecha.

### 4.5 CloudWatch Metrics

AWS Console > CloudWatch > Metrics > Greenhouse

Métricas:
- `EventsProcessed`
- `AlertsProcessed`
- `ValidationErrors`

## Paso 5: Pruebas de Anomalías

### 5.1 Inyección manual

Editar `fog-gateway/src/index.js` línea 95:

```javascript
setTimeout(() => {
  gateway.injectAnomaly('B', 'temperature', 33);  // TEMP_HIGH
}, 30000);
```

### 5.2 Inyección múltiple

Agregar más inyecciones:

```javascript
setTimeout(() => {
  gateway.injectAnomaly('A', 'soilMoisture', 25);  // SOIL_DRY
}, 45000);

setTimeout(() => {
  gateway.injectAnomaly('C', 'humidity', 88);  // HUMIDITY_HIGH
}, 60000);
```

### 5.3 Verificar acción tomada

En logs del Fog Gateway:

```
[AnomalyDetector] ACTION TAKEN: Zone B -> fan=ON
```

En DynamoDB, el item de alerta tendrá `actionTaken: "fan=ON"`.

## Paso 6: Prueba de Resiliencia (Buffer Offline)

### 6.1 Desconectar red

1. Desactivar WiFi/Ethernet en laptop
2. Fog Gateway mostrará: `[MQTT] Offline - buffering AGGREGATE event`
3. Los eventos se guardan en `fog-gateway/buffer.db`

### 6.2 Reconectar red

1. Activar WiFi/Ethernet
2. Esperar ~10 segundos
3. Verás: `[MQTT] Processing 50 buffered events...`
4. Verificar en DynamoDB que todos los eventos llegaron

## Paso 7: Limpieza de Recursos

### 7.1 Destruir infraestructura AWS

```bash
cd pulumi-infra
pulumi destroy
# Confirmar: yes
```

**ADVERTENCIA:** Esto eliminará DynamoDB, S3, Lambda, IoT Core. Exportar datos antes si es necesario.

### 7.2 Eliminar stack Pulumi (opcional)

```bash
pulumi stack rm dev
```

## Estimación de Costos

**Con 3 zonas, 120s agregación, ~10 alertas/día:**

- IoT Core: ~65K msg/mes → **$0** (Free Tier 1M)
- Lambda: ~65K invocaciones → **$0** (Free Tier 1M)
- DynamoDB: ~6K writes/mes, <1GB → **$0** (Free Tier)
- S3: ~1MB/mes → **$0** (Free Tier 5GB)
- CloudWatch Logs: ~50MB/mes → **$0** (Free Tier 5GB)

**Total: $0/mes** dentro de Free Tier.

## Troubleshooting

### Error: "Certificate files not found"

Verificar que existan:
- `fog-gateway/certs/certificate.pem.crt`
- `fog-gateway/certs/private.pem.key`
- `fog-gateway/certs/AmazonRootCA1.pem`

Repasar Paso 1.5.

### Error: "Connection refused" en MQTT

Verificar:
1. `config.json` tiene el endpoint correcto
2. Certificados tienen permisos de lectura
3. IoT Policy permite `iot:Connect` y `iot:Publish`

### Lambda no se invoca

Verificar:
1. IoT Rule está habilitada: AWS Console > IoT Core > Message routing > Rules
2. Lambda tiene permisos: ver CloudWatch Logs de Lambda
3. Topic correcto: `greenhouse/GH01/telemetry`

### DynamoDB vacío

Esperar 2-3 minutos para la primera agregación (ventana de 120s).

## Próximos Pasos

1. **API Gateway** (opcional): Implementar endpoints REST para consulta
2. **SNS**: Habilitar notificaciones por email (`enableSNS=true`)
3. **Dashboard**: Crear visualización en tiempo real con CloudWatch/Grafana
4. **Multi-Invernadero**: Desplegar múltiples Fog Gateways con diferentes `greenhouseId`
