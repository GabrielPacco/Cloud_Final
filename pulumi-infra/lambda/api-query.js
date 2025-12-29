/**
 * Función Lambda - Manejador de Consultas API
 * Maneja peticiones REST API para datos del invernadero
 * Versión: 1.1
 */

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, QueryCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const DYNAMODB_TABLE = process.env.DYNAMODB_TABLE;
const GREENHOUSE_ID = process.env.GREENHOUSE_ID || "GH01";

/**
 * Manejador principal
 */
exports.handler = async (event) => {
  console.log("API Query Event:", JSON.stringify(event, null, 2));

  try {
    const path = event.path || event.rawPath || "/";
    const method = event.httpMethod || event.requestContext?.http?.method || "GET";
    const pathParams = event.pathParameters || {};

    // Encabezados CORS
    const headers = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Manejar OPTIONS para preflight CORS
    if (method === "OPTIONS") {
      return {
        statusCode: 200,
        headers,
        body: "",
      };
    }

    // Manejo de rutas
    if (path.includes("/zones")) {
      return await handleGetZones(headers);
    } else if (path.includes("/alerts")) {
      return await handleGetAlerts(headers, pathParams.zone);
    } else if (path.includes("/health")) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ status: "healthy", greenhouse: GREENHOUSE_ID }),
      };
    } else {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: "Not found" }),
      };
    }
  } catch (error) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        error: "Internal server error",
        message: error.message,
      }),
    };
  }
};

/**
 * Obtener estado actual de todas las zonas
 */
async function handleGetZones(headers) {
  const zones = ["A", "B", "C"];
  const results = [];

  for (const zone of zones) {
    const pk = `GH#${GREENHOUSE_ID}#ZONE#${zone}`;

    const response = await docClient.send(new QueryCommand({
      TableName: DYNAMODB_TABLE,
      KeyConditionExpression: "PK = :pk AND SK = :sk",
      ExpressionAttributeValues: {
        ":pk": pk,
        ":sk": "CURRENT",
      },
      Limit: 1,
      ScanIndexForward: false,
    }));

    if (response.Items && response.Items.length > 0) {
      const item = response.Items[0];

      // Parsear metrics si es una cadena JSON
      let metrics = item.metrics;
      if (typeof metrics === 'string') {
        try {
          metrics = JSON.parse(metrics);
        } catch (e) {
          console.error(`Error parsing metrics for zone ${zone}:`, e);
          metrics = null;
        }
      }

      results.push({
        zone,
        ...item,
        metrics, // Sobrescribir con metrics parseadas
      });
    } else {
      results.push({
        zone,
        status: "no_data",
      });
    }
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      greenhouseId: GREENHOUSE_ID,
      zones: results,
      timestamp: new Date().toISOString(),
    }),
  };
}

/**
 * Obtener alertas recientes
 */
async function handleGetAlerts(headers, zone) {
  let response;

  if (zone) {
    // Obtener alertas para una zona específica
    const pk = `GH#${GREENHOUSE_ID}#ZONE#${zone.toUpperCase()}`;

    response = await docClient.send(new QueryCommand({
      TableName: DYNAMODB_TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: {
        ":pk": pk,
        ":sk": "ALERT#",
      },
      Limit: 20,
      ScanIndexForward: false,
    }));
  } else {
    // Obtener todas las alertas recientes usando scan (no eficiente pero funciona para datasets pequeños)
    response = await docClient.send(new ScanCommand({
      TableName: DYNAMODB_TABLE,
      FilterExpression: "begins_with(SK, :sk)",
      ExpressionAttributeValues: {
        ":sk": "ALERT#",
      },
      Limit: 50,
    }));
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      greenhouseId: GREENHOUSE_ID,
      zone: zone || "all",
      alerts: response.Items || [],
      count: response.Items?.length || 0,
      timestamp: new Date().toISOString(),
    }),
  };
}
