# 💣 CÓMO DESTRUIR TODA LA INFRAESTRUCTURA

## ⚠️ ADVERTENCIA

**Esto eliminará PERMANENTEMENTE:**
- ✅ Todos los recursos AWS (Lambda, DynamoDB, S3, IoT Core)
- ✅ Todos los datos guardados (no hay recuperación)
- ✅ Certificados IoT
- ✅ Logs en CloudWatch

**NO eliminará:**
- ❌ Código local en fog-gateway/ (tu laptop)
- ❌ Base de datos SQLite local (buffer.db)

---

## 🚀 OPCIÓN 1: Un Solo Comando (Recomendado)

```bash
cd pulumi-infra
export PULUMI_CONFIG_PASSPHRASE="greenhouse2024"
pulumi destroy -y
```

**Tiempo:** 2-3 minutos

**Output esperado:**
```
Destroying (dev):

-  aws:lambda:Function process-telemetry deleting
-  aws:dynamodb:Table greenhouse-state deleting
-  aws:s3:Bucket greenhouse-history deleting
-  aws:iot:Thing fog-gateway-thing deleting
...

Resources:
    - 21 deleted

Duration: 2m30s
```

---

## 🔧 OPCIÓN 2: Paso a Paso (Si hay problemas)

### Paso 1: Detener Fog Gateway
```bash
# Si está corriendo, presiona Ctrl+C
# O mata el proceso:
pkill -f "node src/index.js"
```

### Paso 2: Vaciar S3 (Necesario antes de destruir)
```bash
aws s3 rm s3://greenhouse-history-b2129e2/ --recursive
```

### Paso 3: Destruir con Pulumi
```bash
cd pulumi-infra
export PULUMI_CONFIG_PASSPHRASE="greenhouse2024"
pulumi destroy
```

Cuando pregunte:
```
Do you want to perform this destroy? yes
```

Escribe: `yes` y presiona Enter

---

## 🕒 ¿Cuánto Tarda?

| Recurso | Tiempo de Eliminación |
|---------|----------------------|
| Lambda | 10-20 segundos |
| DynamoDB | 30-60 segundos |
| S3 Bucket | 10-20 segundos |
| IoT Core | 20-30 segundos |
| CloudWatch | 5-10 segundos |
| IAM Roles | 10-20 segundos |

**Total: 2-3 minutos**

---

## ✅ Verificar que Todo se Eliminó

### Verificar Lambda:
```bash
aws lambda list-functions --query "Functions[?FunctionName=='ProcessTelemetry']" --output json
```

**Esperado:** `[]` (vacío)

### Verificar DynamoDB:
```bash
aws dynamodb list-tables --query "TableNames[?contains(@, 'Greenhouse')]" --output json
```

**Esperado:** `[]` (vacío)

### Verificar S3:
```bash
aws s3 ls | grep greenhouse-history
```

**Esperado:** Sin output

### Verificar IoT Core:
```bash
aws iot list-things --query "things[?thingName=='FogGateway-Laptop01']" --output json
```

**Esperado:** `[]` (vacío)

---

## 🛑 Problemas Comunes

### Error: "bucket is not empty"

**Causa:** S3 tiene archivos y no se puede eliminar

**Solución:**
```bash
aws s3 rm s3://greenhouse-history-b2129e2/ --recursive
pulumi destroy -y
```

### Error: "DependencyViolation"

**Causa:** Recursos tienen dependencias (ej: Lambda todavía asociada a IoT Rule)

**Solución:**
```bash
pulumi destroy --refresh -y
```

### Error: "passphrase required"

**Causa:** Falta configurar PULUMI_CONFIG_PASSPHRASE

**Solución:**
```bash
export PULUMI_CONFIG_PASSPHRASE="greenhouse2024"
pulumi destroy -y
```

### Error: "stack not found"

**Causa:** Ya fue destruido o no existe

**Solución:**
```bash
pulumi stack ls
# Si no aparece 'dev', ya fue eliminado ✓
```

---

## 🧹 Limpieza Completa (Incluye archivos locales)

Si quieres eliminar TODO (infraestructura + código):

```bash
# 1. Destruir infraestructura AWS
cd pulumi-infra
export PULUMI_CONFIG_PASSPHRASE="greenhouse2024"
pulumi destroy -y

# 2. Eliminar stack de Pulumi
pulumi stack rm dev -y

# 3. Eliminar archivos locales
cd ../..
rm -rf "Trabajo Final Cloud"
```

**⚠️ ESTO ELIMINA TODO EL PROYECTO**

---

## 💾 Backup Antes de Destruir (Opcional)

### Exportar datos de DynamoDB:
```bash
aws dynamodb scan --table-name GreenhouseState --output json > backup-dynamodb.json
```

### Descargar archivos de S3:
```bash
aws s3 sync s3://greenhouse-history-b2129e2/ ./backup-s3/
```

### Exportar configuración de Pulumi:
```bash
cd pulumi-infra
pulumi stack export > backup-pulumi-stack.json
```

---

## 📊 ¿Qué Pasa Después de Destruir?

### ✅ Lo que se elimina:

- Lambda Functions
- DynamoDB Tables
- S3 Buckets (y su contenido)
- IoT Things, Certificates, Policies
- IoT Rules
- CloudWatch Log Groups
- IAM Roles y Policies
- CloudWatch Alarms

### ❌ Lo que NO se elimina:

- Código en `fog-gateway/` (tu laptop)
- Código en `pulumi-infra/` (tu laptop)
- Documentación .md (tu laptop)
- Base de datos SQLite `buffer.db` (tu laptop)
- Configuración AWS CLI
- Tu cuenta de AWS

---

## 💰 Costos Después de Destruir

**Costo inmediato:** $0.00

**Cargos residuales:** Ninguno
- Lambda solo cobra por invocaciones (ya no habrá)
- DynamoDB On-Demand solo cobra por requests (tabla eliminada)
- S3 solo cobra por almacenamiento (bucket eliminado)

**Verificar factura AWS:**
```
https://console.aws.amazon.com/billing/home
```

---

## 🔄 ¿Cómo Volver a Desplegar?

Si destruiste todo y quieres volver a crearlo:

```bash
cd pulumi-infra
export PULUMI_CONFIG_PASSPHRASE="greenhouse2024"
pulumi up -y
cd ..
./setup.sh  # o setup.ps1 en Windows
cd fog-gateway
node src/index.js
```

**Tiempo:** 3-4 minutos

---

## 🎯 Script Completo de Destrucción

Copiar y pegar:

```bash
#!/bin/bash
echo "🛑 DESTRUYENDO INFRAESTRUCTURA GREENHOUSE"
echo ""

# Detener Fog Gateway
echo "1/5 Deteniendo Fog Gateway..."
pkill -f "node src/index.js" 2>/dev/null || true

# Limpiar S3
echo "2/5 Vaciando bucket S3..."
BUCKET=$(aws s3 ls | grep greenhouse-history | awk '{print $3}')
if [ ! -z "$BUCKET" ]; then
  aws s3 rm s3://$BUCKET/ --recursive
fi

# Destruir con Pulumi
echo "3/5 Destruyendo recursos AWS..."
cd pulumi-infra
export PULUMI_CONFIG_PASSPHRASE="greenhouse2024"
pulumi destroy -y

# Eliminar stack
echo "4/5 Eliminando stack de Pulumi..."
pulumi stack rm dev -y 2>/dev/null || true

# Limpiar archivos locales
echo "5/5 Limpiando archivos temporales..."
cd ../fog-gateway
rm -f buffer.db

echo ""
echo "✅ DESTRUCCIÓN COMPLETA"
echo ""
echo "Verificar en AWS Console:"
echo "- Lambda: https://console.aws.amazon.com/lambda"
echo "- DynamoDB: https://console.aws.amazon.com/dynamodb"
echo "- S3: https://console.aws.amazon.com/s3"
echo "- IoT Core: https://console.aws.amazon.com/iot"
```

Guarda como `destroy-all.sh` y ejecuta:
```bash
chmod +x destroy-all.sh
./destroy-all.sh
```

---

## 📋 Checklist de Destrucción

Antes de destruir, verifica:

- [ ] Exportaste datos importantes de DynamoDB (si necesitas)
- [ ] Descargaste archivos de S3 (si necesitas)
- [ ] Detuviste el Fog Gateway (Ctrl+C)
- [ ] Tienes el código local respaldado
- [ ] Entiendes que es PERMANENTE

Después de destruir, verifica:

- [ ] Lambda Functions eliminadas
- [ ] DynamoDB Tables eliminadas
- [ ] S3 Buckets eliminados
- [ ] IoT Things eliminadas
- [ ] CloudWatch Logs eliminados
- [ ] Factura AWS = $0

---

## 🆘 Soporte

Si algo falla:

1. **Revisar logs de Pulumi:**
   ```bash
   pulumi logs
   ```

2. **Destruir recursos manualmente en AWS Console:**
   - Lambda → Functions → ProcessTelemetry → Delete
   - DynamoDB → Tables → GreenhouseState → Delete
   - S3 → Buckets → greenhouse-history-* → Empty → Delete
   - IoT Core → Things → FogGateway-Laptop01 → Delete

3. **Limpiar estado de Pulumi:**
   ```bash
   pulumi refresh
   pulumi destroy --force
   ```

---

## ⏱️ Cuándo Destruir

**Destruye cuando:**
- ✅ Terminaste tu proyecto/demo
- ✅ Quieres evitar cargos (aunque es $0 en Free Tier)
- ✅ Vas a redeplegar desde cero
- ✅ Solo querías probar el sistema

**NO destruyas si:**
- ❌ Estás recolectando evidencias para documentación
- ❌ Necesitas datos históricos
- ❌ Vas a seguir usando el sistema

---

## 💡 Tip Final

**Si solo quieres "pausar" sin destruir:**

1. Detén el Fog Gateway (Ctrl+C)
2. Deja la infraestructura AWS
3. Costo: $0/mes (no hay invocaciones sin Fog Gateway)

**Para reactivar:**
```bash
cd fog-gateway
node src/index.js
```

**Todo sigue funcionando.**
