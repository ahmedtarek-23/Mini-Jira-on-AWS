'use strict';

require('dotenv').config();
const { S3Client } = require('@aws-sdk/client-s3');
const { SNSClient } = require('@aws-sdk/client-sns');
const { SQSClient } = require('@aws-sdk/client-sqs');
const { EventBridgeClient } = require('@aws-sdk/client-eventbridge');
const { CloudWatchLogsClient } = require('@aws-sdk/client-cloudwatch-logs');

const region = process.env.AWS_REGION || 'us-east-1';

const s3Client = new S3Client({ region });
const snsClient = new SNSClient({ region });
const sqsClient = new SQSClient({ region });
const eventsClient = new EventBridgeClient({ region });
const cwLogsClient = new CloudWatchLogsClient({ region });

module.exports = { s3Client, snsClient, sqsClient, eventsClient, cwLogsClient };
