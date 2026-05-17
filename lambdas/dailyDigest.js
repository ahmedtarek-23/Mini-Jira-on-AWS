'use strict';

/**
 * Lambda — Daily Digest
 * Trigger: EventBridge scheduled rule — cron(0 9 * * ? *)  (9:00 AM UTC daily)
 * Action:
 *   1. Scans the Tasks table for tasks whose deadline is today and status != 'Done'
 *   2. Groups overdue tasks by teamId
 *   3. Publishes one SNS digest email per affected team
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');

const region = process.env.AWS_REGION || 'us-east-1';
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
const sns = new SNSClient({ region });

const TASKS_TABLE = process.env.TASKS_TABLE || 'Tasks';
const SNS_DAILY_DIGEST_ARN = process.env.SNS_DAILY_DIGEST_ARN;

exports.handler = async () => {
  const today = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'

  // Scan for tasks due today that are not yet Done
  const { Items: tasks = [] } = await dynamo.send(
    new ScanCommand({
      TableName: TASKS_TABLE,
      FilterExpression: 'begins_with(deadline, :today) AND #s <> :done',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':today': today, ':done': 'Done' },
    })
  );

  if (tasks.length === 0) {
    console.log('No tasks due today. Nothing to send.');
    return;
  }

  // Group by teamId
  const byTeam = tasks.reduce((acc, task) => {
    (acc[task.teamId] = acc[task.teamId] || []).push(task);
    return acc;
  }, {});

  if (!SNS_DAILY_DIGEST_ARN) {
    console.warn('SNS_DAILY_DIGEST_ARN not set — printing digest to stdout only');
    console.log(JSON.stringify(byTeam, null, 2));
    return;
  }

  // Publish one message per team
  for (const [teamId, teamTasks] of Object.entries(byTeam)) {
    const lines = teamTasks.map(
      (t) => `• [${t.priority}] ${t.title} — assigned to ${t.assigneeId}`
    );
    const message = `Daily Digest for Team ${teamId}\n\nTasks due today (${today}):\n${lines.join('\n')}`;

    await sns.send(
      new PublishCommand({
        TopicArn: SNS_DAILY_DIGEST_ARN,
        Subject: `[Mini-Jira] Daily Digest — ${teamId} — ${today}`,
        Message: message,
      })
    );

    console.log(`Digest sent for team ${teamId} (${teamTasks.length} tasks)`);
  }
};
