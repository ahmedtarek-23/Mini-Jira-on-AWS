import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

const sns = new SNSClient({ region: process.env.AWS_REGION });
const TOPIC_ARN = process.env.SNS_TOPIC_ARN || '';

export async function publishTaskAssigned(task: any) {
  if (!TOPIC_ARN) return;
  await sns.send(new PublishCommand({
    TopicArn: TOPIC_ARN,
    Message: JSON.stringify(task),
    Subject: `New Task Assigned: ${task.title}`,
    MessageAttributes: {
      eventType: { DataType: 'String', StringValue: 'task_assigned' },
    },
  }));
}
