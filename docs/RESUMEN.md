# Resumen Ejecutivo - Invernadero Inteligente

## ¿Qué es este proyecto?

Sistema IoT de monitoreo de invernaderos que combina:
- **Fog Computing (laptop):** Procesa datos localmente, detecta anomalías, tolera desconexiones
- **Serverless AWS:** Backend escalable sin servidores permanentes
- **IaC con Pulumi:** Infraestructura replicable y versionada

## Problema que resuelve

1. **Costos altos:** Enviar datos crudos a la nube es caro (millones de mensajes/mes)
2. **Latencia:** Detección de anomalías debe ser inmediata (temperatura crítica)
3. **Conectividad:** Invernaderos rurales tienen internet inestable
4. **Escalabilidad:** Agregar zonas/sensores debe ser simple

## Solución implementada

### Fog Gateway (laptop)
- Simula 12 sensores (3 zonas × 4 métricas)
- Genera lecturas cada 5s **solo localmente**
- Agrega datos cada 120s → reduce mensajes 95%
- Detecta 5 tipos de anomalías con reglas
- Actúa localmente (fan=ON, irrigation=ON)
- Buffer offline (SQLite) con reintentos

### Cloud (AWS)
- **IoT Core:** Recibe telemetría vía MQTT
- **Lambda:** Valida y procesa eventos
- **DynamoDB:** Estado actual + alertas (TTL 7 días)
- **S3:** Histórico (Glacier tras 90 días)
- **CloudWatch:** Métricas y observabilidad

## Arquitectura en 3 líneas

```
Sensores (local) → Agregación (120s) → Buffer (SQLite) →
MQTT → IoT Core → Lambda → DynamoDB + S3 + CloudWatch
```

## Números clave

- **65.7K mensajes/mes** (vs 2.6M sin agregación)
- **Reducción 97.5%** de tráfico a cloud
- **<1s latencia** en detección de anomalías
- **$0/mes** dentro de Free Tier AWS
- **4h buffer** offline (10K eventos)

## Tecnologías

- **Fog:** Node.js, SQLite, aws-iot-device-sdk
- **Cloud:** AWS (IoT Core, Lambda, DynamoDB, S3, CloudWatch)
- **IaC:** Pulumi (TypeScript)
- **Seguridad:** X.509 certs, IAM least-privilege

## Casos de uso demostrados

1. **Monitoreo continuo:** 3 zonas reportando cada 2 min
2. **Alerta temperatura:** >30°C sostenido → fan=ON
3. **Alerta suelo seco:** <30% → irrigation=ON
4. **Resiliencia:** Desconexión 10 min → buffer → recovery 100%
5. **Histórico:** Snapshots horarios en S3, consultas DynamoDB

## Despliegue (5 minutos)

```bash
cd pulumi-infra && pulumi up -y
cd .. && ./setup.sh
cd fog-gateway && node src/index.js
```

## Escalabilidad

- **+3 zonas:** Cambiar config, redeploy (131K msg/mes, aún Free Tier)
- **+1 invernadero:** Clonar fog gateway, nuevo greenhouseId
- **+N invernaderos:** Mismo backend AWS, N laptops

## Evidencias recolectables

1. Fog Gateway conectado y publicando
2. IoT Test Client recibiendo mensajes
3. Lambda procesando (CloudWatch Logs)
4. DynamoDB con datos de 3 zonas
5. S3 con archivos organizados por fecha
6. CloudWatch Metrics (EventsProcessed)
7. Anomalía inyectada + acción registrada
8. Tests E2E pasando (5/5)

## Documentación completa

- **[INDEX.md](INDEX.md):** Navegación completa del proyecto
- **[QUICKSTART.md](QUICKSTART.md):** Despliegue en 5 minutos
- **[README.md](README.md):** Arquitectura detallada (10 secciones)
- **[DESPLIEGUE.md](DESPLIEGUE.md):** Guía paso a paso
- **[EVIDENCIAS.md](EVIDENCIAS.md):** Checklist de capturas

## Resultado final

Sistema funcional que demuestra:
✓ Fog Computing reduciendo costos y latencia
✓ Serverless escalable y económico
✓ IaC replicable con Pulumi
✓ Detección y respuesta automática a anomalías
✓ Resiliencia ante desconexiones
✓ Observabilidad end-to-end

**Todo dentro de AWS Free Tier ($0/mes).**
