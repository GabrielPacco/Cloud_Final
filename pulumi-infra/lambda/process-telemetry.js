/**
 * Función Lambda - Procesar Telemetría y Alertas
 * Valida, normaliza y persiste eventos en DynamoDB y S3
 */

const { DynamoDBClient, PutItemCommand, UpdateItemCommand } = require("@aws-sdk/client-dynamodb");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { SNSClient, PublishCommand } = require("@aws-sdk/client-sns");
const { CloudWatchClient, PutMetricDataCommand } = require("@aws-sdk/client-cloudwatch");

const dynamoClient = new DynamoDBClient({});
const s3Client = new S3Client({});
const snsClient = new SNSClient({});
const cloudwatchClient = new CloudWatchClient({});

const DYNAMODB_TABLE = process.env.DYNAMODB_TABLE;
const S3_BUCKET = process.env.S3_BUCKET;
const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN;
const GREENHOUSE_ID = process.env.GREENHOUSE_ID || "GH01";

// TTL: 7 días desde ahora
const getTTL = () => Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60);

/**
 * Manejador principal
 */
exports.handler = async (event) => {
  console.log('Received event:', JSON.stringify(event, null, 2));

  try {
    const payload = event;
    const eventType = payload.eventType;

    // Validar evento
    const validationError = validateEvent(payload);
    if (validationError) {
      console.error('Validation failed:', validationError);
      await putMetric('ValidationErrors', 1);
      return { statusCode: 400, body: validationError };
    }

    // Enriquecer evento
    const enrichedPayload = {
      ...payload,
      receivedAt: new Date().toISOString(),
      processingId: generateId(),
    };

    // Procesar según el tipo de evento
    if (eventType === 'AGGREGATE') {
      await processAggregate(enrichedPayload);
    } else if (eventType === 'ALERT') {
      await processAlert(enrichedPayload);
    } else {
      console.error('Unknown event type:', eventType);
      await putMetric('UnknownEventType', 1);
      return { statusCode: 400, body: 'Unknown event type' };
    }

    await putMetric('EventsProcessed', 1);
    console.log('Event processed successfully');
    return { statusCode: 200, body: 'Success' };

  } catch (error) {
    console.error('Error processing event:', error);
    await putMetric('ProcessingErrors', 1);
    throw error;
  }
};

/**
 * Validar esquema del evento
 */
function validateEvent(payload) {
  // Campos requeridos
  if (!payload.eventType) return 'Missing eventType';
  if (!payload.greenhouseId) return 'Missing greenhouseId';
  if (!payload.zone) return 'Missing zone';
  if (!payload.timestamp) return 'Missing timestamp';
  if (!payload.deviceId) return 'Missing deviceId';

  // Validación de timestamp
  const eventTime = new Date(payload.timestamp).getTime();
  const now = Date.now();
  if (isNaN(eventTime)) return 'Invalid timestamp format';
  if (eventTime > now + 60000) return 'Timestamp is in the future';

  // Validación específica por tipo
  if (payload.eventType === 'AGGREGATE') {
    if (!payload.metrics) return 'Missing metrics';
    if (!payload.windowDurationSec) return 'Missing windowDurationSec';

    // Verificaciones de cordura para cada métrica
    for (const [metricName, stats] of Object.entries(payload.metrics)) {
      if (stats.min > stats.avg || stats.avg > stats.max) {
        return `Invalid stats for ${metricName}: min=${stats.min}, avg=${stats.avg}, max=${stats.max}`;
      }
      if (stats.count <= 0) {
        return `Invalid count for ${metricName}: ${stats.count}`;
      }
    }

    if (payload.windowDurationSec < 30 || payload.windowDurationSec > 300) {
      return `Invalid windowDurationSec: ${payload.windowDurationSec}`;
    }
  } else if (payload.eventType === 'ALERT') {
    if (!payload.alertType) return 'Missing alertType';
    if (!payload.severity) return 'Missing severity';
    if (!payload.metric) return 'Missing metric';
    if (!['LOW', 'MEDIUM', 'HIGH'].includes(payload.severity)) {
      return `Invalid severity: ${payload.severity}`;
    }
  }

  return null;
}

/**
 * Procesar evento AGGREGATE
 */
async function processAggregate(payload) {
  const { greenhouseId, zone, timestamp, metrics } = payload;

  // Actualizar estado CURRENT en DynamoDB
  const pk = `GH#${greenhouseId}#ZONE#${zone}`;
  const sk = 'CURRENT';

  await dynamoClient.send(new PutItemCommand({
    TableName: DYNAMODB_TABLE,
    Item: {
      PK: { S: pk },
      SK: { S: sk },
      timestamp: { S: timestamp },
      greenhouseId: { S: greenhouseId },
      zone: { S: zone },
      metrics: { S: JSON.stringify(metrics) },
      receivedAt: { S: payload.receivedAt },
      ttl: { N: getTTL().toString() },
    },
  }));

  console.log(`Updated CURRENT state for ${pk}`);

  // Guardar snapshot en S3 cada hora (verificar timestamp)
  const date = new Date(timestamp);
  if (date.getMinutes() === 0) {
    await saveToS3(payload, 'snapshot');
  }

  await putMetric('AggregatesProcessed', 1);
}

/**
 * Procesar evento ALERT
 */
async function processAlert(payload) {
  const { greenhouseId, zone, timestamp, alertType, severity } = payload;

  // Insertar alerta en DynamoDB
  const pk = `GH#${greenhouseId}#ZONE#${zone}`;
  const sk = `ALERT#${timestamp}`;

  await dynamoClient.send(new PutItemCommand({
    TableName: DYNAMODB_TABLE,
    Item: {
      PK: { S: pk },
      SK: { S: sk },
      timestamp: { S: timestamp },
      greenhouseId: { S: greenhouseId },
      zone: { S: zone },
      alertType: { S: alertType },
      severity: { S: severity },
      metric: { S: payload.metric },
      value: { N: (payload.value || 0).toString() },
      message: { S: payload.message || '' },
      actionTaken: { S: payload.actionTaken || '' },
      receivedAt: { S: payload.receivedAt },
      ttl: { N: getTTL().toString() },
    },
  }));

  console.log(`Inserted alert ${sk} for ${pk}`);

  // Guardar todas las alertas en S3
  await saveToS3(payload, 'alert');

  // Publicar en SNS si es de severidad HIGH
  if (severity === 'HIGH' && SNS_TOPIC_ARN) {
    await snsClient.send(new PublishCommand({
      TopicArn: SNS_TOPIC_ARN,
      Subject: `[HIGH] ${alertType} - ${greenhouseId} Zone ${zone}`,
      Message: `Alert: ${payload.message}\n\nAction Taken: ${payload.actionTaken || 'None'}\n\nTimestamp: ${timestamp}\n\nReview dashboard for details.`,
    }));
    console.log('Published to SNS');
  }

  await putMetric('AlertsProcessed', 1);
  await putMetric(`Alerts_${severity}`, 1);
}

/**
 * Guardar evento en S3
 */
async function saveToS3(payload, type) {
  const { greenhouseId, zone, timestamp } = payload;
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');
  const minute = String(date.getUTCMinutes()).padStart(2, '0');
  const second = String(date.getUTCSeconds()).padStart(2, '0');

  const key = `${greenhouseId}/${zone}/${year}/${month}/${day}/${type}-${hour}${minute}${second}.json`;

  await s3Client.send(new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: JSON.stringify(payload, null, 2),
    ContentType: 'application/json',
    Tagging: `GreenhouseId=${greenhouseId}&Zone=${zone}&EventType=${payload.eventType}`,
  }));

  console.log(`Saved to S3: ${key}`);
}

/**
 * Publicar métrica personalizada en CloudWatch
 */
async function putMetric(metricName, value) {
  try {
    await cloudwatchClient.send(new PutMetricDataCommand({
      Namespace: 'Greenhouse',
      MetricData: [{
        MetricName: metricName,
        Value: value,
        Unit: 'Count',
        Timestamp: new Date(),
        Dimensions: [{
          Name: 'GreenhouseId',
          Value: GREENHOUSE_ID,
        }],
      }],
    }));
  } catch (error) {
    console.error('Error putting metric:', error);
  }
}

/**
 * Generar ID único
 */
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
