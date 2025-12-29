/**
 * Pulumi Infrastructure - Smart Greenhouse
 * Creates: IoT Core, Lambda, DynamoDB, S3, CloudWatch, SNS (optional)
 */

import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

// Configuration
const config = new pulumi.Config();
const greenhouseId = config.get("greenhouseId") || "GH01";
const zones = config.getObject<string[]>("zones") || ["A", "B", "C"];
const enableSNS = config.getBoolean("enableSNS") || false;
const alertEmail = config.get("alertEmail") || "your-email@example.com";
const retentionDays = config.getNumber("retentionDays") || 7;

console.log(`Deploying infrastructure for greenhouse: ${greenhouseId}`);
console.log(`Zones: ${zones.join(", ")}`);

// Get current AWS account info
const current = aws.getCallerIdentity({});
const currentRegion = aws.getRegion({});

// ============================================
// 1. DynamoDB Table - Greenhouse State
// ============================================

const dynamoTable = new aws.dynamodb.Table("greenhouse-state", {
  name: "GreenhouseState",
  billingMode: "PAY_PER_REQUEST",
  hashKey: "PK",
  rangeKey: "SK",
  attributes: [
    { name: "PK", type: "S" },
    { name: "SK", type: "S" },
    { name: "timestamp", type: "S" },
  ],
  globalSecondaryIndexes: [{
    name: "GSI-ByTimestamp",
    hashKey: "PK",
    rangeKey: "timestamp",
    projectionType: "ALL",
  }],
  ttl: {
    attributeName: "ttl",
    enabled: true,
  },
  tags: {
    Project: "SmartGreenhouse",
    Environment: "dev",
  },
});

// ============================================
// 2. S3 Bucket - Historical Data
// ============================================

const s3Bucket = new aws.s3.Bucket("greenhouse-history", {
  forceDestroy: true, // Allow destroy even with objects
  serverSideEncryptionConfiguration: {
    rule: {
      applyServerSideEncryptionByDefault: {
        sseAlgorithm: "AES256",
      },
    },
  },
  lifecycleRules: [{
    enabled: true,
    transitions: [{
      days: 90,
      storageClass: "GLACIER",
    }],
    expiration: {
      days: 365,
    },
  }],
  tags: {
    Project: "SmartGreenhouse",
    Environment: "dev",
  },
});

// Block public access
new aws.s3.BucketPublicAccessBlock("greenhouse-history-public-block", {
  bucket: s3Bucket.id,
  blockPublicAcls: true,
  blockPublicPolicy: true,
  ignorePublicAcls: true,
  restrictPublicBuckets: true,
});

// ============================================
// 3. SNS Topic (Optional) - High Severity Alerts
// ============================================

let snsTopic: aws.sns.Topic | undefined;
let snsSubscription: aws.sns.TopicSubscription | undefined;

if (enableSNS) {
  snsTopic = new aws.sns.Topic("greenhouse-alerts-high", {
    name: "GreenhouseAlertsHigh",
    tags: {
      Project: "SmartGreenhouse",
      Environment: "dev",
    },
  });

  // Create email subscription
  snsSubscription = new aws.sns.TopicSubscription("greenhouse-alerts-email", {
    topic: snsTopic.arn,
    protocol: "email",
    endpoint: alertEmail,
  });

  console.log(`SNS Topic created. Subscription email sent to: ${alertEmail}`);
}

// ============================================
// 4. Lambda IAM Role
// ============================================

const lambdaRole = new aws.iam.Role("lambda-execution-role", {
  assumeRolePolicy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [{
      Action: "sts:AssumeRole",
      Principal: {
        Service: "lambda.amazonaws.com",
      },
      Effect: "Allow",
    }],
  }),
});

// Attach policies
new aws.iam.RolePolicyAttachment("lambda-basic-execution", {
  role: lambdaRole.name,
  policyArn: "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
});

const lambdaPolicy = new aws.iam.RolePolicy("lambda-custom-policy", {
  role: lambdaRole.id,
  policy: pulumi.all([dynamoTable.arn, s3Bucket.arn, snsTopic?.arn]).apply(([dynamoArn, s3Arn, snsArn]) =>
    JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: [
            "dynamodb:PutItem",
            "dynamodb:UpdateItem",
            "dynamodb:GetItem",
            "dynamodb:Query",
            "dynamodb:Scan",
          ],
          Resource: [dynamoArn, `${dynamoArn}/index/*`],
        },
        {
          Effect: "Allow",
          Action: ["s3:PutObject", "s3:PutObjectTagging"],
          Resource: `${s3Arn}/*`,
        },
        ...(snsArn ? [{
          Effect: "Allow",
          Action: ["sns:Publish"],
          Resource: snsArn,
        }] : []),
        {
          Effect: "Allow",
          Action: ["cloudwatch:PutMetricData"],
          Resource: "*",
        },
      ],
    })
  ),
});

// ============================================
// 5. Lambda Function - Process Telemetry
// ============================================

const lambdaFunction = new aws.lambda.Function("process-telemetry", {
  name: "ProcessTelemetry",
  runtime: "nodejs20.x",
  handler: "process-telemetry.handler",
  role: lambdaRole.arn,
  code: new pulumi.asset.AssetArchive({
    ".": new pulumi.asset.FileArchive("./lambda"),
  }),
  timeout: 10,
  memorySize: 256,
  environment: {
    variables: {
      DYNAMODB_TABLE: dynamoTable.name,
      S3_BUCKET: s3Bucket.bucket,
      SNS_TOPIC_ARN: snsTopic?.arn || "",
      GREENHOUSE_ID: greenhouseId,
    },
  },
  tags: {
    Project: "SmartGreenhouse",
    Environment: "dev",
  },
});

// CloudWatch Log Group with retention
new aws.cloudwatch.LogGroup("lambda-log-group", {
  name: pulumi.interpolate`/aws/lambda/${lambdaFunction.name}`,
  retentionInDays: retentionDays,
  tags: {
    Project: "SmartGreenhouse",
  },
});

// ============================================
// 6. IoT Core - Thing, Certificate, Policy
// ============================================

// IoT Policy
const iotPolicy = new aws.iot.Policy("fog-gateway-policy", {
  name: "FogGatewayPolicy",
  policy: pulumi.all([currentRegion, current]).apply(([region, caller]) =>
    JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: ["iot:Connect"],
          Resource: "*",
        },
        {
          Effect: "Allow",
          Action: ["iot:Publish"],
          Resource: [
            `arn:aws:iot:${region.name}:${caller.accountId}:topic/greenhouse/*`,
          ],
        },
        {
          Effect: "Allow",
          Action: ["iot:Subscribe", "iot:Receive"],
          Resource: [
            `arn:aws:iot:${region.name}:${caller.accountId}:topicfilter/greenhouse/*/commands`,
          ],
        },
      ],
    })
  ),
});

// IoT Thing
const iotThing = new aws.iot.Thing("fog-gateway-thing", {
  name: "FogGateway-Laptop01",
  attributes: {
    greenhouseId: greenhouseId,
    deviceType: "fog-gateway",
  },
});

// IoT Certificate
const iotCertificate = new aws.iot.Certificate("fog-gateway-cert", {
  active: true,
});

// Attach certificate to thing
new aws.iot.ThingPrincipalAttachment("thing-cert-attachment", {
  thing: iotThing.name,
  principal: iotCertificate.arn,
});

// Attach policy to certificate
new aws.iot.PolicyAttachment("policy-cert-attachment", {
  policy: iotPolicy.name,
  target: iotCertificate.arn,
});

// ============================================
// 7. IoT Rules - Route to Lambda
// ============================================

// IAM Role for IoT Rule
const iotRuleRole = new aws.iam.Role("iot-rule-role", {
  assumeRolePolicy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [{
      Action: "sts:AssumeRole",
      Principal: {
        Service: "iot.amazonaws.com",
      },
      Effect: "Allow",
    }],
  }),
});

new aws.iam.RolePolicy("iot-rule-policy", {
  role: iotRuleRole.id,
  policy: lambdaFunction.arn.apply(arn =>
    JSON.stringify({
      Version: "2012-10-17",
      Statement: [{
        Effect: "Allow",
        Action: ["lambda:InvokeFunction"],
        Resource: arn,
      }],
    })
  ),
});

// Rule 1: Process Telemetry
const telemetryRule = new aws.iot.TopicRule("process-telemetry-rule", {
  name: "ProcessTelemetryRule",
  enabled: true,
  sql: "SELECT * FROM 'greenhouse/+/telemetry'",
  sqlVersion: "2016-03-23",
  lambdas: [{
    functionArn: lambdaFunction.arn,
  }],
});

// Grant IoT permission to invoke Lambda
new aws.lambda.Permission("iot-invoke-telemetry-lambda", {
  action: "lambda:InvokeFunction",
  function: lambdaFunction.name,
  principal: "iot.amazonaws.com",
  sourceArn: telemetryRule.arn,
});

// Rule 2: Process Alerts
const alertsRule = new aws.iot.TopicRule("process-alerts-rule", {
  name: "ProcessAlertsRule",
  enabled: true,
  sql: "SELECT * FROM 'greenhouse/+/alerts'",
  sqlVersion: "2016-03-23",
  lambdas: [{
    functionArn: lambdaFunction.arn,
  }],
});

new aws.lambda.Permission("iot-invoke-alerts-lambda", {
  action: "lambda:InvokeFunction",
  function: lambdaFunction.name,
  principal: "iot.amazonaws.com",
  sourceArn: alertsRule.arn,
});

// Rule 3: High Severity Alerts to SNS (optional)
if (enableSNS && snsTopic) {
  new aws.iot.TopicRule("high-alerts-sns-rule", {
    name: "HighAlertsSNSRule",
    enabled: true,
    sql: "SELECT * FROM 'greenhouse/+/alerts' WHERE severity = 'HIGH'",
    sqlVersion: "2016-03-23",
    sns: [{
      targetArn: snsTopic.arn,
      roleArn: iotRuleRole.arn,
    }],
  });

  new aws.iam.RolePolicy("iot-sns-policy", {
    role: iotRuleRole.id,
    policy: snsTopic.arn.apply(arn =>
      JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
          Effect: "Allow",
          Action: ["sns:Publish"],
          Resource: arn,
        }],
      })
    ),
  });
}

// ============================================
// 8. CloudWatch Metrics & Alarms
// ============================================

// Custom metric alarm for Lambda errors
new aws.cloudwatch.MetricAlarm("lambda-error-alarm", {
  name: "ProcessTelemetry-HighErrorRate",
  comparisonOperator: "GreaterThanThreshold",
  evaluationPeriods: 1,
  metricName: "Errors",
  namespace: "AWS/Lambda",
  period: 300,
  statistic: "Sum",
  threshold: 5,
  alarmDescription: "Alert when Lambda errors exceed 5 in 5 minutes",
  dimensions: {
    FunctionName: lambdaFunction.name,
  },
  tags: {
    Project: "SmartGreenhouse",
  },
});

// ============================================
// 9. API Gateway - REST API
// ============================================

// Lambda function for API queries
const apiLambda = new aws.lambda.Function("api-query", {
  name: "GreenhouseAPI",
  runtime: "nodejs20.x",
  handler: "api-query.handler",
  role: lambdaRole.arn,
  code: new pulumi.asset.AssetArchive({
    ".": new pulumi.asset.FileArchive("./lambda"),
  }),
  environment: {
    variables: {
      DYNAMODB_TABLE: dynamoTable.name,
      GREENHOUSE_ID: greenhouseId,
    },
  },
  timeout: 15,
  memorySize: 256,
  tags: {
    Project: "SmartGreenhouse",
  },
});

// API Gateway REST API
const api = new aws.apigateway.RestApi("greenhouse-api", {
  name: "GreenhouseAPI",
  description: "REST API for Smart Greenhouse",
  tags: {
    Project: "SmartGreenhouse",
  },
});

// /health resource
const healthResource = new aws.apigateway.Resource("health-resource", {
  restApi: api.id,
  parentId: api.rootResourceId,
  pathPart: "health",
});

const healthMethod = new aws.apigateway.Method("health-method", {
  restApi: api.id,
  resourceId: healthResource.id,
  httpMethod: "GET",
  authorization: "NONE",
});

const healthIntegration = new aws.apigateway.Integration("health-integration", {
  restApi: api.id,
  resourceId: healthResource.id,
  httpMethod: healthMethod.httpMethod,
  integrationHttpMethod: "POST",
  type: "AWS_PROXY",
  uri: apiLambda.invokeArn,
});

// /zones resource
const zonesResource = new aws.apigateway.Resource("zones-resource", {
  restApi: api.id,
  parentId: api.rootResourceId,
  pathPart: "zones",
});

const zonesMethod = new aws.apigateway.Method("zones-method", {
  restApi: api.id,
  resourceId: zonesResource.id,
  httpMethod: "GET",
  authorization: "NONE",
});

const zonesIntegration = new aws.apigateway.Integration("zones-integration", {
  restApi: api.id,
  resourceId: zonesResource.id,
  httpMethod: zonesMethod.httpMethod,
  integrationHttpMethod: "POST",
  type: "AWS_PROXY",
  uri: apiLambda.invokeArn,
});

// /alerts resource
const alertsResource = new aws.apigateway.Resource("alerts-resource", {
  restApi: api.id,
  parentId: api.rootResourceId,
  pathPart: "alerts",
});

const alertsMethod = new aws.apigateway.Method("alerts-method", {
  restApi: api.id,
  resourceId: alertsResource.id,
  httpMethod: "GET",
  authorization: "NONE",
});

const alertsIntegration = new aws.apigateway.Integration("alerts-integration", {
  restApi: api.id,
  resourceId: alertsResource.id,
  httpMethod: alertsMethod.httpMethod,
  integrationHttpMethod: "POST",
  type: "AWS_PROXY",
  uri: apiLambda.invokeArn,
});

// Lambda permission for API Gateway
const apiLambdaPermission = new aws.lambda.Permission("api-lambda-permission", {
  action: "lambda:InvokeFunction",
  function: apiLambda.name,
  principal: "apigateway.amazonaws.com",
  sourceArn: pulumi.interpolate`${api.executionArn}/*/*`,
});

// API Deployment
const deployment = new aws.apigateway.Deployment("api-deployment", {
  restApi: api.id,
  stageName: "prod",
}, {
  dependsOn: [
    healthIntegration,
    zonesIntegration,
    alertsIntegration,
  ],
});

// ============================================
// 10. S3 Website Hosting - Dashboard
// ============================================

// S3 Bucket for static website hosting
const dashboardBucket = new aws.s3.Bucket("greenhouse-dashboard", {
  website: {
    indexDocument: "index.html",
    errorDocument: "index.html",
  },
  forceDestroy: true,
  tags: {
    Project: "SmartGreenhouse",
    Environment: "dev",
  },
});

// Block public access configuration (allow public read for website)
const dashboardPublicAccess = new aws.s3.BucketPublicAccessBlock("dashboard-public-access", {
  bucket: dashboardBucket.id,
  blockPublicAcls: true,  // Block ACLs but allow bucket policies
  blockPublicPolicy: false,  // Allow public bucket policies
  ignorePublicAcls: true,
  restrictPublicBuckets: false,
});

// Bucket policy to allow public read access
const dashboardBucketPolicy = new aws.s3.BucketPolicy("dashboard-bucket-policy", {
  bucket: dashboardBucket.bucket,
  policy: dashboardBucket.arn.apply(arn =>
    JSON.stringify({
      Version: "2012-10-17",
      Statement: [{
        Effect: "Allow",
        Principal: "*",
        Action: ["s3:GetObject"],
        Resource: `${arn}/*`,
      }],
    })
  ),
}, { dependsOn: [dashboardPublicAccess] });

// Upload dashboard files to S3 (without ACLs - use bucket policy instead)
const indexHtml = new aws.s3.BucketObject("index.html", {
  bucket: dashboardBucket.bucket,
  source: new pulumi.asset.FileAsset("../web-dashboard/index.html"),
  contentType: "text/html",
}, { dependsOn: [dashboardBucketPolicy] });

const appJs = new aws.s3.BucketObject("app.js", {
  bucket: dashboardBucket.bucket,
  source: new pulumi.asset.FileAsset("../web-dashboard/app.js"),
  contentType: "application/javascript",
}, { dependsOn: [dashboardBucketPolicy] });

const stylesCss = new aws.s3.BucketObject("styles.css", {
  bucket: dashboardBucket.bucket,
  source: new pulumi.asset.FileAsset("../web-dashboard/styles.css"),
  contentType: "text/css",
}, { dependsOn: [dashboardBucketPolicy] });

// ============================================
// 11. CloudWatch Dashboard (Optional)
// ============================================

const cloudwatchDashboard = new aws.cloudwatch.Dashboard("greenhouse-dashboard", {
  dashboardName: "SmartGreenhouse-Monitoring",
  dashboardBody: pulumi.all([lambdaFunction.name, dynamoTable.name]).apply(([fnName, tableName]) =>
    JSON.stringify({
      widgets: [
        {
          type: "metric",
          properties: {
            metrics: [
              ["AWS/Lambda", "Invocations", { stat: "Sum", label: "Lambda Invocations" }],
              [".", "Errors", { stat: "Sum", label: "Lambda Errors" }],
              [".", "Duration", { stat: "Average", label: "Avg Duration (ms)" }],
            ],
            period: 300,
            stat: "Average",
            region: "us-east-1",
            title: "Lambda Metrics - ProcessTelemetry",
            yAxis: {
              left: { min: 0 },
            },
          },
        },
        {
          type: "metric",
          properties: {
            metrics: [
              ["AWS/DynamoDB", "UserErrors", { stat: "Sum" }],
              [".", "SystemErrors", { stat: "Sum" }],
              [".", "ConsumedWriteCapacityUnits", { stat: "Sum" }],
            ],
            period: 300,
            stat: "Sum",
            region: "us-east-1",
            title: "DynamoDB Metrics",
            yAxis: {
              left: { min: 0 },
            },
          },
        },
        {
          type: "metric",
          properties: {
            metrics: [
              ["AWS/IoT", "PublishIn.Success", { stat: "Sum", label: "Messages Received" }],
              [".", "RulesExecuted", { stat: "Sum", label: "Rules Executed" }],
            ],
            period: 300,
            stat: "Sum",
            region: "us-east-1",
            title: "IoT Core Metrics",
            yAxis: {
              left: { min: 0 },
            },
          },
        },
        {
          type: "log",
          properties: {
            query: pulumi.interpolate`SOURCE '/aws/lambda/${fnName}'\n| fields @timestamp, @message\n| filter @message like /ERROR/\n| sort @timestamp desc\n| limit 20`,
            region: "us-east-1",
            title: "Recent Lambda Errors",
          },
        },
      ],
    })
  ),
});

// ============================================
// 12. Outputs
// ============================================

// Get IoT endpoint
const iotEndpoint = aws.iot.getEndpoint({
  endpointType: "iot:Data-ATS",
});

// Export outputs
export const iotEndpointAddress = iotEndpoint.then(e => e.endpointAddress);
export const certificatePem = iotCertificate.certificatePem;
export const privateKey = iotCertificate.privateKey;
export const publicKey = iotCertificate.publicKey;
export const dynamoTableName = dynamoTable.name;
export const s3BucketName = s3Bucket.bucket;
export const lambdaFunctionArn = lambdaFunction.arn;
export const lambdaFunctionName = lambdaFunction.name;
export const snsTopicArn = snsTopic?.arn || "Not enabled";
export const iotThingName = iotThing.name;
export const apiUrl = pulumi.interpolate`https://${api.id}.execute-api.${currentRegion.then(r => r.name)}.amazonaws.com/prod`;
export const apiLambdaArn = apiLambda.arn;
export const dashboardUrl = pulumi.interpolate`http://${dashboardBucket.websiteEndpoint}`;
export const dashboardBucketName = dashboardBucket.bucket;
export const cloudwatchDashboardUrl = pulumi.interpolate`https://console.aws.amazon.com/cloudwatch/home?region=${currentRegion.then(r => r.name)}#dashboards:name=SmartGreenhouse-Monitoring`;

// Instructions
export const setupInstructions = pulumi.interpolate`
========================================
DEPLOYMENT COMPLETE
========================================

Next Steps:

1. Save IoT certificates to fog-gateway/certs/:

   Run these commands from the project root:

   mkdir -p fog-gateway/certs
   curl -o fog-gateway/certs/AmazonRootCA1.pem https://www.amazontrust.com/repository/AmazonRootCA1.pem
   pulumi stack output certificatePem --show-secrets > fog-gateway/certs/certificate.pem.crt
   pulumi stack output privateKey --show-secrets > fog-gateway/certs/private.pem.key

2. Update fog-gateway/config.json:

   Set mqtt.endpoint to: ${iotEndpointAddress}

3. Install dependencies and run Fog Gateway:

   cd fog-gateway
   npm install
   node src/index.js

4. Access Web Dashboard:

   ${dashboardUrl}

   Note: Configure the API URL in the dashboard settings to: ${apiUrl}

5. Monitor in AWS Console:
   - Web Dashboard (S3): ${dashboardUrl}
   - CloudWatch Dashboard: ${cloudwatchDashboardUrl}
   - IoT Core Test Client: Subscribe to greenhouse/#
   - DynamoDB: Check GreenhouseState table
   - CloudWatch Logs: /aws/lambda/${lambdaFunction.name}
   - S3 Historical Data: ${s3Bucket.bucket}

Resources created:
- DynamoDB Table: ${dynamoTable.name}
- S3 Bucket (Historical): ${s3Bucket.bucket}
- S3 Bucket (Dashboard): ${dashboardBucket.bucket}
- Lambda Functions: ${lambdaFunction.name}, GreenhouseAPI
- API Gateway: ${apiUrl}
- Web Dashboard: ${dashboardUrl}
- CloudWatch Dashboard: SmartGreenhouse-Monitoring
- IoT Thing: ${iotThing.name}
- SNS Topic: ${snsTopic?.name || "Not enabled"}

PASSPHRASE: Remember to set PULUMI_CONFIG_PASSPHRASE=greenhouse2024 for future operations
`;
