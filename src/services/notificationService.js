'use strict';

const { PublishCommand } = require('@aws-sdk/client-sns');
const { SendMessageCommand } = require('@aws-sdk/client-sqs');
const { PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch-logs');
const { snsClient, sqsClient } = require('../config/aws');
const logger = require('../config/logger');

const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN;
const SQS_QUEUE_URL = process.env.SQS_QUEUE_URL;

/**
 * Published when a manager assigns (or re-assigns) a task.
 * SNS fans out to:
 *   - Email subscription → notifies the assignee
 *   - SQS queue → drained by the assignmentWorker Lambda
 */
async function publishTaskAssigned(task, assigneeEmail) {
  if (!SNS_TOPIC_ARN) {
    logger.warn('SNS_TOPIC_ARN not set — skipping assignment notification');
    return;
  }

  const message = JSON.stringify({
    eventType: 'TASK_ASSIGNED',
    taskId: task.taskId,
    taskTitle: task.title,
    assigneeEmail,
    teamId: task.teamId,
    deadline: task.deadline,
    assignedAt: new Date().toISOString(),
  });

  await snsClient.send(
    new PublishCommand({
      TopicArn: SNS_TOPIC_ARN,
      Subject: `[Mini-Jira] You have been assigned: ${task.title}`,
      Message: message,
    })
  );

  logger.info({ msg: 'SNS notification published', taskId: task.taskId, assigneeEmail });
}

/**
 * Sends a message directly to SQS (for manual testing or non-SNS flows).
 */
async function sendToQueue(payload) {
  if (!SQS_QUEUE_URL) return;

  await sqsClient.send(
    new SendMessageCommand({
      QueueUrl: SQS_QUEUE_URL,
      MessageBody: JSON.stringify(payload),
    })
  );
}

module.exports = { publishTaskAssigned, sendToQueue };
