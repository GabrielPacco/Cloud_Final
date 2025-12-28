/**
 * End-to-End Test Script
 * Tests complete flow: Fog Gateway -> AWS IoT -> Lambda -> DynamoDB/S3
 */

const { DynamoDBClient, QueryCommand } = require("@aws-sdk/client-dynamodb");
const { S3Client, ListObjectsV2Command } = require("@aws-sdk/client-s3");
const { unmarshall } = require("@aws-sdk/util-dynamodb");

// Configuration
const GREENHOUSE_ID = process.env.GREENHOUSE_ID || "GH01";
const ZONE = process.env.ZONE || "A";
const DYNAMODB_TABLE = process.env.DYNAMODB_TABLE || "GreenhouseState";
const S3_BUCKET = process.env.S3_BUCKET; // Required
const AWS_REGION = process.env.AWS_REGION || "us-east-1";

const dynamoClient = new DynamoDBClient({ region: AWS_REGION });
const s3Client = new S3Client({ region: AWS_REGION });

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Test 1: Query latest state from DynamoDB
 */
async function testDynamoDBCurrentState() {
  log('\n=== TEST 1: DynamoDB Current State ===', 'blue');

  try {
    const pk = `GH#${GREENHOUSE_ID}#ZONE#${ZONE}`;
    const result = await dynamoClient.send(new QueryCommand({
      TableName: DYNAMODB_TABLE,
      KeyConditionExpression: 'PK = :pk AND SK = :sk',
      ExpressionAttributeValues: {
        ':pk': { S: pk },
        ':sk': { S: 'CURRENT' },
      },
    }));

    if (result.Items.length === 0) {
      log(`❌ FAIL: No current state found for ${pk}`, 'red');
      log('   Wait 2-3 minutes for first aggregate or check Fog Gateway is running', 'yellow');
      return false;
    }

    const item = unmarshall(result.Items[0]);
    log(`✓ PASS: Found current state for ${pk}`, 'green');
    log(`   Timestamp: ${item.timestamp}`);
    log(`   Metrics: ${JSON.stringify(JSON.parse(item.metrics), null, 2)}`);
    return true;

  } catch (error) {
    log(`❌ ERROR: ${error.message}`, 'red');
    return false;
  }
}

/**
 * Test 2: Query recent alerts from DynamoDB
 */
async function testDynamoDBAlerts() {
  log('\n=== TEST 2: DynamoDB Recent Alerts ===', 'blue');

  try {
    const pk = `GH#${GREENHOUSE_ID}#ZONE#${ZONE}`;
    const result = await dynamoClient.send(new QueryCommand({
      TableName: DYNAMODB_TABLE,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': { S: pk },
        ':sk': { S: 'ALERT#' },
      },
      ScanIndexForward: false, // Descending order
      Limit: 10,
    }));

    log(`Found ${result.Items.length} alerts for ${pk}`);

    if (result.Items.length === 0) {
      log('   No alerts yet (this is OK if no anomalies detected)', 'yellow');
      return true;
    }

    for (const item of result.Items) {
      const alert = unmarshall(item);
      log(`   - [${alert.severity}] ${alert.alertType} at ${alert.timestamp}`, 'green');
      log(`     Message: ${alert.message}`);
      if (alert.actionTaken) {
        log(`     Action: ${alert.actionTaken}`);
      }
    }

    log('✓ PASS: Alerts retrieved successfully', 'green');
    return true;

  } catch (error) {
    log(`❌ ERROR: ${error.message}`, 'red');
    return false;
  }
}

/**
 * Test 3: List S3 objects
 */
async function testS3History() {
  log('\n=== TEST 3: S3 Historical Data ===', 'blue');

  if (!S3_BUCKET) {
    log('❌ SKIP: S3_BUCKET environment variable not set', 'yellow');
    return false;
  }

  try {
    const prefix = `${GREENHOUSE_ID}/${ZONE}/`;
    const result = await s3Client.send(new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: prefix,
      MaxKeys: 20,
    }));

    if (!result.Contents || result.Contents.length === 0) {
      log(`No objects found in S3 with prefix ${prefix}`, 'yellow');
      log('   Wait for snapshots (hourly) or alerts to be generated', 'yellow');
      return true;
    }

    log(`Found ${result.Contents.length} objects in S3:`, 'green');
    for (const obj of result.Contents) {
      const sizeKB = (obj.Size / 1024).toFixed(2);
      log(`   - ${obj.Key} (${sizeKB} KB)`);
    }

    log('✓ PASS: S3 objects listed successfully', 'green');
    return true;

  } catch (error) {
    log(`❌ ERROR: ${error.message}`, 'red');
    return false;
  }
}

/**
 * Test 4: Verify data freshness
 */
async function testDataFreshness() {
  log('\n=== TEST 4: Data Freshness ===', 'blue');

  try {
    const pk = `GH#${GREENHOUSE_ID}#ZONE#${ZONE}`;
    const result = await dynamoClient.send(new QueryCommand({
      TableName: DYNAMODB_TABLE,
      KeyConditionExpression: 'PK = :pk AND SK = :sk',
      ExpressionAttributeValues: {
        ':pk': { S: pk },
        ':sk': { S: 'CURRENT' },
      },
    }));

    if (result.Items.length === 0) {
      log('❌ FAIL: No data found', 'red');
      return false;
    }

    const item = unmarshall(result.Items[0]);
    const dataTime = new Date(item.timestamp);
    const now = new Date();
    const ageMinutes = (now - dataTime) / 1000 / 60;

    log(`Data timestamp: ${item.timestamp}`);
    log(`Age: ${ageMinutes.toFixed(1)} minutes`);

    if (ageMinutes > 5) {
      log('⚠ WARNING: Data is older than 5 minutes', 'yellow');
      log('   Check if Fog Gateway is running and connected to AWS', 'yellow');
      return false;
    }

    log('✓ PASS: Data is fresh (< 5 minutes old)', 'green');
    return true;

  } catch (error) {
    log(`❌ ERROR: ${error.message}`, 'red');
    return false;
  }
}

/**
 * Test 5: Cross-zone verification
 */
async function testAllZones() {
  log('\n=== TEST 5: All Zones Verification ===', 'blue');

  const zones = ['A', 'B', 'C'];
  let passedCount = 0;

  for (const zone of zones) {
    try {
      const pk = `GH#${GREENHOUSE_ID}#ZONE#${zone}`;
      const result = await dynamoClient.send(new QueryCommand({
        TableName: DYNAMODB_TABLE,
        KeyConditionExpression: 'PK = :pk AND SK = :sk',
        ExpressionAttributeValues: {
          ':pk': { S: pk },
          ':sk': { S: 'CURRENT' },
        },
      }));

      if (result.Items.length > 0) {
        const item = unmarshall(result.Items[0]);
        log(`✓ Zone ${zone}: OK (timestamp: ${item.timestamp})`, 'green');
        passedCount++;
      } else {
        log(`✗ Zone ${zone}: No data`, 'yellow');
      }

    } catch (error) {
      log(`✗ Zone ${zone}: Error - ${error.message}`, 'red');
    }
  }

  log(`\nResult: ${passedCount}/${zones.length} zones have data`);

  if (passedCount === zones.length) {
    log('✓ PASS: All zones reporting', 'green');
    return true;
  } else {
    log('⚠ PARTIAL: Not all zones reporting', 'yellow');
    return false;
  }
}

/**
 * Main test runner
 */
async function runTests() {
  log('\n╔════════════════════════════════════════╗', 'blue');
  log('║   E2E Test Suite - Smart Greenhouse   ║', 'blue');
  log('╚════════════════════════════════════════╝', 'blue');
  log(`\nConfiguration:`);
  log(`  Greenhouse ID: ${GREENHOUSE_ID}`);
  log(`  Zone: ${ZONE}`);
  log(`  DynamoDB Table: ${DYNAMODB_TABLE}`);
  log(`  S3 Bucket: ${S3_BUCKET || 'Not set'}`);
  log(`  AWS Region: ${AWS_REGION}`);

  const results = [];

  results.push(await testDynamoDBCurrentState());
  results.push(await testDynamoDBAlerts());
  results.push(await testS3History());
  results.push(await testDataFreshness());
  results.push(await testAllZones());

  // Summary
  const passed = results.filter(r => r === true).length;
  const total = results.length;

  log('\n╔════════════════════════════════════════╗', 'blue');
  log('║            TEST SUMMARY                ║', 'blue');
  log('╚════════════════════════════════════════╝', 'blue');
  log(`\nPassed: ${passed}/${total}`);

  if (passed === total) {
    log('\n🎉 ALL TESTS PASSED', 'green');
    process.exit(0);
  } else {
    log(`\n⚠ ${total - passed} TEST(S) FAILED OR SKIPPED`, 'yellow');
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  log(`\n❌ FATAL ERROR: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
