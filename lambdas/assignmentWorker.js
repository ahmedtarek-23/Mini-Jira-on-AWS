'use strict';

/**
 * Lambda — Assignment Worker
 * Trigger: SQS queue (mini-jira-assignments) — receives events from SNS fan-out
 * Action:
 *   1. Parses the SNS-wrapped SQS message body
 *   2. Writes an activity log entry to DynamoDB (optional ActivityLog table)
 *   3. Publishes a custom CloudWatch metric: TasksAssignedPerTeam
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { CloudWatchClient, PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');
const { v4: uuidv4 } = require('uuid');

const region = process.env.AWS_REGION || 'us-east-1';
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
const cw = new CloudWatchClient({ region });

const ACTIVITY_LOG_TABLE = process.env.ACTIVITY_LOG_TABLE || 'ActivityLog';

exports.handler = async (event) => {
  for (const record of event.Records) {
    let payload;
    try {
      // SQS body is an SNS notification envelope
      const outer = JSON.parse(record.body);
      payload = typeof outer.Message === 'string' ? JSON.parse(outer.Message) : outer;
    } catch {
      console.error('Failed to parse SQS record body', record.body);
      continue;
    }

    const { taskId, taskTitle, assigneeEmail, teamId, assignedAt } = payload;

    // 1. Write activity log entry
    await dynamo.send(
      new PutCommand({
        TableName: ACTIVITY_LOG_TABLE,
        Item: {
          logId: uuidv4(),
          taskId,
          taskTitle,
          assigneeEmail,
          teamId,
          eventType: 'TASK_ASSIGNED',
          occurredAt: assignedAt || new Date().toISOString(),
        },
      })
    ).catch((err) => console.error('DynamoDB write failed', err));

    // 2. Publish CloudWatch custom metric: TasksAssignedPerTeam
    await cw.send(
      new PutMetricDataCommand({
        Namespace: 'MiniJira',
        MetricData: [
          {
            MetricName: 'TasksAssigned',
            Dimensions: [{ Name: 'TeamId', Value: teamId || 'unknown' }],
            Value: 1,
            Unit: 'Count',
            Timestamp: new Date(),
          },
        ],
      })
    ).catch((err) => console.error('CloudWatch metric failed', err));

    console.log(`Processed assignment: taskId=${taskId} assignee=${assigneeEmail} team=${teamId}`);
  }
};
