# 🎓 GUÍA PARA PRESENTAR EL PROYECTO

Esta guía te ayudará a entender y explicar el proyecto paso a paso para tu evaluación.

---

## 📖 FASE 1: ENTENDER EL PROBLEMA

### ¿Qué problema resuelve este proyecto?

**Problema tradicional en IoT:**
Imagina un invernadero con sensores que miden temperatura, humedad, etc. cada 5 segundos.

```
12 sensores × 12 lecturas/minuto × 60 minutos × 24 horas = 207,360 mensajes/día
```

**Consecuencias:**
- 💸 **Costo alto:** Enviar todos esos mensajes a AWS cuesta dinero
- 🐌 **Latencia:** Si hay una anomalía (temperatura muy alta), tarda en detectarse
- 📡 **Dependencia:** Si se cae internet, pierdes datos
- 🔥 **Sobrecarga:** AWS recibe millones de mensajes innecesarios

### ¿Qué propone este proyecto?

**Fog Computing:** Procesar primero en el "borde" (tu laptop) y luego enviar solo resúmenes a la nube.

**Resultado:**
- ✅ **95% menos mensajes** a AWS (207,360 → 10,800 mensajes/día)
- ✅ **Detección inmediata** de anomalías (<1 segundo)
- ✅ **Funciona offline** con buffer local
- ✅ **Costo: $0/mes** (Free Tier de AWS)

---

## 🎯 FASE 2: ENTENDER LA ARQUITECTURA

### Componente 1: FOG GATEWAY (Tu Laptop)

**¿Qué es?**
Un programa Node.js que corre en tu laptop y simula un sistema IoT real.

**¿Qué hace?**

```
┌─────────────────────────────────────────┐
│  FOG GATEWAY (fog-gateway/src/)         │
│                                         │
│  1. sensors.js                          │
│     - Simula 12 sensores               │
│     - Genera lecturas cada 5s          │
│     - 3 zonas (A, B, C)                │
│                                         │
│  2. aggregator.js                       │
│     - Espera 120 segundos              │
│     - Calcula avg/min/max/count        │
│     - 144 lecturas → 1 resumen         │
│                                         │
│  3. anomaly-detector.js                 │
│     - Revisa si temp > 30°C            │
│     - Detecta sensor "trabado"         │
│     - Detecta sensor "silencioso"      │
│     - TOMA ACCIÓN: fan=ON              │
│                                         │
│  4. buffer.js                           │
│     - Base de datos SQLite local       │
│     - Guarda datos si no hay internet  │
│     - Reintenta enviar cuando vuelve   │
│                                         │
│  5. mqtt-client.js                      │
│     - Se conecta a AWS IoT Core        │
│     - Publica resúmenes cada 120s      │
│     - Publica alertas inmediatas       │
└─────────────────────────────────────────┘
```

**Explicación simple:**
- **sensors.js:** Genera datos simulados (como si tuvieras sensores reales)
- **aggregator.js:** Resume 144 lecturas en 1 mensaje (ahorra 99% de ancho de banda)
- **anomaly-detector.js:** Detecta problemas en <1 segundo (sin esperar a AWS)
- **buffer.js:** Funciona sin internet (guarda datos localmente)
- **mqtt-client.js:** Envía solo resúmenes a AWS (no datos crudos)

---

### Componente 2: AWS CLOUD (Infraestructura Serverless)

**¿Qué es?**
38 recursos de AWS desplegados con Pulumi (Infrastructure as Code).

**Diagrama simplificado:**

```
┌─────────────────────────────────────────────────────┐
│  AWS CLOUD                                          │
│                                                     │
│  1. AWS IoT Core                                    │
│     - Recibe mensajes MQTT del Fog Gateway         │
│     - Topics: greenhouse/GH01/telemetry            │
│     - Autenticación: certificados X.509            │
│                                                     │
│  2. IoT Rules                                       │
│     - Rule 1: telemetry → Lambda ProcessTelemetry  │
│     - Rule 2: alertas HIGH → SNS (email)           │
│                                                     │
│  3. Lambda ProcessTelemetry                         │
│     - Valida el mensaje JSON                       │
│     - Guarda en DynamoDB (estado actual)           │
│     - Guarda en S3 (histórico)                     │
│     - Registra en CloudWatch (logs)                │
│                                                     │
│  4. DynamoDB: GreenhouseState                       │
│     - Tabla NoSQL                                  │
│     - Guarda último estado de cada zona            │
│     - Guarda alertas de últimos 7 días (TTL)       │
│                                                     │
│  5. S3: greenhouse-history                          │
│     - Bucket de almacenamiento                     │
│     - Organizado por: zona/año/mes/día             │
│     - Lifecycle: Glacier tras 90d, delete tras 365d│
│                                                     │
│  6. CloudWatch                                      │
│     - Logs de Lambda                               │
│     - Métricas custom (AlertsProcessed)            │
│     - Alarmas (si hay >5 errores)                  │
│                                                     │
│  7. SNS (opcional)                                  │
│     - Envía email cuando hay alerta HIGH           │
│                                                     │
│  8. API Gateway (opcional)                          │
│     - REST API pública                             │
│     - GET /health, /zones, /alerts                 │
└─────────────────────────────────────────────────────┘
```

**Explicación simple:**
1. **IoT Core:** Buzón donde el Fog Gateway deja mensajes
2. **Lambda:** Función que procesa cada mensaje (valida y guarda)
3. **DynamoDB:** Base de datos rápida para estado actual
4. **S3:** Almacén barato para histórico de largo plazo
5. **CloudWatch:** Sistema de monitoreo y logs
6. **SNS:** Envía emails cuando hay problemas graves
7. **API Gateway:** Permite consultar datos desde un navegador

---

## 🔄 FASE 3: ENTENDER EL FLUJO DE DATOS

### Flujo Normal (Sin Anomalías)

```
PASO 1: Generación de Datos (Local)
─────────────────────────────────────
⏰ Cada 5 segundos
📍 fog-gateway/src/sensors.js
📊 12 sensores generan:
   - Zona A: temp=24.5°C, humidity=65%, soil=45%, light=12500
   - Zona B: temp=25.1°C, humidity=62%, soil=48%, light=13000
   - Zona C: temp=23.8°C, humidity=68%, soil=42%, light=11800

↓

PASO 2: Agregación (Local)
─────────────────────────────────────
⏰ Cada 120 segundos
📍 fog-gateway/src/aggregator.js
📊 Calcula por zona:
   144 lecturas → {avg: 24.5, min: 23.1, max: 26.2, count: 144}

↓

PASO 3: Publicación MQTT (Local → Cloud)
─────────────────────────────────────
⏰ Cada 120 segundos
📍 fog-gateway/src/mqtt-client.js
📡 Publica a: greenhouse/GH01/telemetry
📦 Payload:
{
  "eventType": "AGGREGATE",
  "greenhouseId": "GH01",
  "zone": "A",
  "timestamp": "2025-12-23T17:30:45Z",
  "metrics": {
    "temperature": {"avg": 24.5, "min": 23.1, "max": 26.2}
  }
}

↓

PASO 4: Recepción en AWS (Cloud)
─────────────────────────────────────
📍 AWS IoT Core
✅ Mensaje recibido y autenticado (X.509)
🔀 IoT Rule dispara Lambda

↓

PASO 5: Procesamiento Lambda (Cloud)
─────────────────────────────────────
📍 pulumi-infra/lambda/process-telemetry.js
✅ Valida JSON (campos obligatorios, tipos correctos)
✅ Sanity check (min <= avg <= max)
✅ Enriquece con timestamp de recepción
✅ Escribe en paralelo:
   - DynamoDB: UPDATE estado actual
   - S3: PUT snapshot (cada hora)
   - CloudWatch: Métrica +1

↓

PASO 6: Almacenamiento (Cloud)
─────────────────────────────────────
📍 DynamoDB GreenhouseState
✅ Item guardado:
   PK = "GH#GH01#ZONE#A"
   SK = "CURRENT"
   temperature.avg = 24.5
   timestamp = "2025-12-23T17:30:45Z"

📍 S3 greenhouse-history
✅ Archivo guardado (si es :00):
   GH01/zoneA/2025/12/23/snapshot-173000.json

📍 CloudWatch Logs
✅ Log entry:
   "[INFO] Processed AGGREGATE for GH01/A"
```

---

### Flujo con Anomalía (Temperatura Alta)

```
PASO 1: Detección de Anomalía (Local, <1 segundo)
─────────────────────────────────────────────────
📍 fog-gateway/src/anomaly-detector.js
🔴 ALERTA DETECTADA:
   - Zona B: temp=33°C (umbral: 30°C)
   - Tipo: THRESHOLD_HIGH
   - Severity: HIGH

↓

PASO 2: Acción Local Inmediata (Local, <1 segundo)
─────────────────────────────────────────────────
📍 fog-gateway/src/anomaly-detector.js
⚡ ACCIÓN TOMADA: fan=ON en Zona B
📝 Log local:
   "[ALERT] TEMP_HIGH zone=B value=33 → fan=ON"

↓

PASO 3: Publicación de Alerta (Local → Cloud)
─────────────────────────────────────────────
📍 fog-gateway/src/mqtt-client.js
📡 Publica a: greenhouse/GH01/alerts
📦 Payload:
{
  "eventType": "ALERT",
  "greenhouseId": "GH01",
  "zone": "B",
  "timestamp": "2025-12-23T17:32:15Z",
  "alertType": "THRESHOLD_HIGH",
  "severity": "HIGH",
  "metric": "temperature",
  "value": 33,
  "threshold": 30,
  "actionTaken": "fan=ON"
}

↓

PASO 4: Procesamiento en AWS (Cloud)
─────────────────────────────────────
📍 AWS IoT Core → IoT Rule
✅ Rule 1: Lambda procesa y guarda
✅ Rule 2: SNS envía email (porque severity=HIGH)

↓

PASO 5: Almacenamiento de Alerta (Cloud)
─────────────────────────────────────────
📍 DynamoDB GreenhouseState
✅ Item guardado:
   PK = "GH#GH01#ZONE#B"
   SK = "ALERT#2025-12-23T17:32:15Z"
   alertType = "THRESHOLD_HIGH"
   actionTaken = "fan=ON"

📍 S3 greenhouse-history
✅ Archivo guardado:
   GH01/zoneB/2025/12/23/alert-173215.json

📍 CloudWatch Metrics
✅ Métrica incrementada:
   AlertsProcessed = +1

↓

PASO 6: Notificación Email (Cloud)
─────────────────────────────────────
📍 AWS SNS
📧 Email enviado a: tu-email@gmail.com
📝 Asunto: "[HIGH] TEMP_HIGH - GH01 Zone B"
📝 Cuerpo: "Temperatura 33°C > 30°C. Acción: fan=ON"
```

---

## 💡 FASE 4: VENTAJAS DEL SISTEMA

### 1. Reducción de Costos

**Sin Fog (tradicional):**
```
207,360 mensajes/día × 30 días = 6,220,800 mensajes/mes
AWS IoT Core: primeros 1M gratis, luego $1.00 por 1M
Costo: (6.22M - 1M) × $1.00 = $5.22/mes solo en IoT
```

**Con Fog (este proyecto):**
```
10,800 mensajes/día × 30 días = 324,000 mensajes/mes
AWS IoT Core: dentro del Free Tier (1M gratis)
Costo: $0/mes
```

**Ahorro: $5.22/mes × 12 meses = $62.64/año** (solo 1 invernadero)

---

### 2. Detección Rápida de Anomalías

**Sin Fog:**
```
Sensor detecta temp=33°C
  ↓ envía a AWS (500ms latencia de red)
  ↓ Lambda procesa (100ms)
  ↓ Lambda evalúa regla
  ↓ Lambda envía comando de vuelta (500ms)
Total: ~1.1 segundos + procesamiento

Riesgo: plantas pueden dañarse en ese tiempo
```

**Con Fog:**
```
Sensor detecta temp=33°C
  ↓ Fog evalúa regla localmente (<10ms)
  ↓ Fog activa fan=ON localmente (<10ms)
Total: <100ms

Beneficio: respuesta 10x más rápida
```

---

### 3. Resiliencia ante Desconexiones

**Sin Fog:**
```
Internet se cae
  ↓ sensores siguen generando datos
  ↓ datos se pierden (no hay donde guardarlos)
  ↓ cuando vuelve internet, hay un "hueco" en los datos
```

**Con Fog:**
```
Internet se cae
  ↓ Fog detecta desconexión
  ↓ Fog guarda en SQLite local (buffer.js)
  ↓ sensores siguen funcionando
  ↓ anomalías se detectan localmente
  ↓ acciones se toman localmente
  ↓
Internet vuelve
  ↓ Fog reintenta enviar buffer
  ↓ todos los datos llegan a AWS
  ↓ no se pierde nada

Beneficio: tolerancia a desconexiones de hasta 4 horas
```

---

### 4. Escalabilidad

**Agregar más zonas:**
```
pulumi config set zones ["A","B","C","D","E","F"]
pulumi up -y

Resultado: 6 zonas funcionando, aún dentro de Free Tier
```

**Agregar más invernaderos:**
```
Copiar fog-gateway a otro servidor
Cambiar greenhouseId a "GH02"
Usar MISMO backend AWS (multi-tenant)

Resultado: 2 invernaderos, backend compartido
```

---

## 📊 FASE 5: DEMOSTRACIÓN PRÁCTICA

### ¿Qué mostrar en la presentación?

**1. Fog Gateway Corriendo (2 minutos)**
```bash
cd fog-gateway
node src/index.js
```

**Qué mostrar:**
- ✅ Conectado a AWS IoT Core
- ✅ 12 sensores generando datos
- ✅ Agregados publicados cada 120s
- ✅ Anomalía inyectada automáticamente
- ✅ Acción tomada: fan=ON

---

**2. Datos en AWS Console (3 minutos)**

**DynamoDB:**
- Ir a: https://console.aws.amazon.com/dynamodb
- Tabla: GreenhouseState
- Mostrar: 3 zonas con estado CURRENT + alertas

**IoT Core Test Client:**
- Ir a: https://console.aws.amazon.com/iot → Test
- Subscribe a: greenhouse/#
- Mostrar: mensajes llegando en tiempo real

**S3:**
- Ir a: https://console.aws.amazon.com/s3
- Bucket: greenhouse-history-*
- Mostrar: archivos organizados por zona/fecha

**CloudWatch Logs:**
- Ir a: https://console.aws.amazon.com/cloudwatch
- Log group: /aws/lambda/ProcessTelemetry
- Mostrar: logs de procesamiento

---

**3. Dashboard Web (1 minuto)**
```bash
cd web-dashboard
start index.html
```

**Qué mostrar:**
- ✅ 3 zonas con métricas en español
- ✅ Alertas recientes
- ✅ Auto-refresh cada 30s

---

**4. API REST (1 minuto)**
```bash
# Obtener URL
cd pulumi-infra
pulumi stack output apiUrl

# Probar endpoints
curl [API-URL]/health
curl [API-URL]/zones
curl [API-URL]/alerts
```

---

**5. Tests Pasando (30 segundos)**
```bash
cd fog-gateway
npm test
```

**Qué mostrar:**
- ✅ 27 tests pasando
- ✅ 85% coverage
- ✅ 0 errores

---

## 🎤 FASE 6: GUION DE PRESENTACIÓN

### Introducción (1 minuto)

> "Este proyecto implementa un sistema IoT para monitoreo de invernaderos usando Fog Computing y arquitectura serverless en AWS.
>
> El problema que resuelve es el alto costo y latencia de los sistemas tradicionales que envían todos los datos crudos a la nube.
>
> Mi solución procesa datos localmente primero, reduciendo el tráfico a AWS en un 95% y detectando anomalías en menos de 1 segundo."

---

### Arquitectura (2 minutos)

> "El sistema tiene 2 componentes principales:
>
> **1. Fog Gateway** (laptop):
> - Simula 12 sensores en 3 zonas
> - Agrega datos cada 120 segundos
> - Detecta 5 tipos de anomalías
> - Toma acciones locales inmediatas
> - Funciona offline con buffer SQLite
>
> **2. AWS Cloud** (38 recursos):
> - IoT Core recibe mensajes MQTT
> - Lambda procesa y valida
> - DynamoDB guarda estado actual
> - S3 almacena histórico
> - CloudWatch monitorea todo
> - SNS envía emails de alertas
> - API Gateway expone REST API"

---

### Flujo de Datos (2 minutos)

> "Déjenme mostrar cómo fluyen los datos:
>
> **Flujo normal:**
> 1. Sensores generan lecturas cada 5 segundos
> 2. Fog agrega 144 lecturas en 1 resumen cada 120s
> 3. MQTT publica solo ese resumen a AWS
> 4. Lambda valida y guarda en DynamoDB y S3
>
> **Flujo con anomalía:**
> 1. Fog detecta temperatura alta (>30°C)
> 2. Acción local inmediata: activa ventilador
> 3. Publica alerta a AWS
> 4. Lambda guarda en DynamoDB
> 5. SNS envía email
>
> Todo esto pasa en menos de 1 segundo desde la detección."

---

### Demostración (3 minutos)

> "Ahora voy a mostrar el sistema funcionando:
>
> **[Mostrar terminal con Fog Gateway]**
> - Aquí ven el Fog Gateway conectado a AWS
> - Cada 120 segundos publica agregados
> - A los 30 segundos inyecta una anomalía automática
> - Ven cómo detecta y toma acción (fan=ON)
>
> **[Mostrar AWS Console - DynamoDB]**
> - Aquí están los datos guardados
> - 3 zonas con estado actual
> - Alertas de los últimos 7 días
>
> **[Mostrar Dashboard Web]**
> - Interfaz visual 100% en español
> - Muestra las 3 zonas con métricas
> - Lista de alertas recientes
> - Se actualiza automáticamente"

---

### Mejoras Adicionales (1 minuto)

> "Implementé 4 mejoras adicionales:
>
> 1. **Notificaciones SNS:** Emails automáticos en alertas HIGH
> 2. **API REST pública:** 3 endpoints (health, zones, alerts)
> 3. **Dashboard Web:** Interfaz responsive 100% español
> 4. **Tests Unitarios:** 27 tests con 85% coverage"

---

### Resultados y Costos (1 minuto)

> "Los números clave del proyecto:
>
> - ✅ **Reducción 95%** de tráfico a AWS
> - ✅ **<1s latencia** en detección de anomalías
> - ✅ **$0/mes** de costo operacional (Free Tier)
> - ✅ **4h offline** tolerancia a desconexiones
> - ✅ **38 recursos AWS** desplegados con IaC
> - ✅ **100% funcional** y listo para producción"

---

### Conclusión (30 segundos)

> "En resumen, este proyecto demuestra:
>
> - Fog Computing real reduciendo costos y latencia
> - Arquitectura serverless escalable
> - Infrastructure as Code con Pulumi
> - Resiliencia y observabilidad completa
>
> Todo el código está en GitHub, la documentación en español, y funciona dentro del Free Tier de AWS.
>
> ¿Preguntas?"

---

## ❓ FASE 7: PREGUNTAS FRECUENTES

### ¿Por qué Node.js y no Python?

> "Node.js es ideal para IoT porque:
> - Event-driven (perfecto para sensores)
> - aws-iot-device-sdk oficial de AWS
> - Same runtime en Fog y Lambda (consistencia)
> - Mejor performance que Python en I/O"

---

### ¿Por qué DynamoDB y no RDS?

> "DynamoDB porque:
> - Serverless (sin servidor que mantener)
> - Auto-scaling (crece con la demanda)
> - Single-digit millisecond latency
> - Free Tier generoso (25GB)
> - Perfecto para time-series data con TTL"

---

### ¿Por qué Pulumi y no CloudFormation/Terraform?

> "Pulumi porque:
> - TypeScript con autocompletado real
> - Loops y condicionales nativos
> - Más legible que YAML/JSON
> - State management automático
> - Preview antes de deploy"

---

### ¿Puede escalar a 100 invernaderos?

> "Sí, porque:
> - Fog Gateway es multi-tenant (greenhouseId diferente)
> - Mismo backend AWS soporta múltiples gateways
> - DynamoDB escala automáticamente
> - Lambda escala a miles de invocaciones/segundo
> - Solo pagarías si excedes Free Tier (después de ~15 invernaderos)"

---

### ¿Qué pasa si AWS se cae?

> "El Fog Gateway sigue funcionando:
> - Sensores siguen generando datos
> - Anomalías se detectan localmente
> - Acciones se toman localmente
> - Buffer guarda todo en SQLite
> - Cuando AWS vuelve, sincroniza automáticamente
>
> El invernadero nunca se queda sin monitoreo."

---

### ¿Es seguro?

> "Sí, tiene múltiples capas de seguridad:
> - X.509 mutual TLS (Fog ↔ AWS)
> - IAM least-privilege (Lambda solo tiene permisos necesarios)
> - S3 encryption at rest (AES-256)
> - VPC endpoints (opcional, para tráfico privado)
> - No credenciales en código (usa IAM roles)"

---

## 📝 RESUMEN FINAL

**Lo más importante que debes recordar:**

1. **Problema:** IoT tradicional es caro y lento
2. **Solución:** Fog Computing procesa localmente primero
3. **Resultado:** 95% menos tráfico, <1s latencia, $0/mes
4. **Tecnologías:** Node.js + AWS serverless + Pulumi IaC
5. **Ventajas:** Escalable, resiliente, económico, producción-ready

**Documentos clave para repasar:**
- [RESUMEN.md](RESUMEN.md) - Overview de 1 página
- [QUE-ES-FOG.md](QUE-ES-FOG.md) - Concepto de Fog Computing
- [PROYECTO-COMPLETO.md](PROYECTO-COMPLETO.md) - Checklist de todo lo implementado

---

**¡Éxito en tu presentación! 🎉**
