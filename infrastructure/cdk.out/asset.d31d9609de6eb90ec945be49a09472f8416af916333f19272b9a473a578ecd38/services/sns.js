import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
const sns = new SNSClient({ region: process.env.AWS_REGION });
const TOPIC_ARN = process.env.SNS_TOPIC_ARN || '';
export async function publishTaskAssigned(task) {
    if (!TOPIC_ARN)
        return;
    await sns.send(new PublishCommand({
        TopicArn: TOPIC_ARN,
        Message: `You have been assigned a new task: ${task.title}\nTask ID: ${task.id}\nTeam: ${task.teamId}`,
        Subject: `New Task Assigned: ${task.title}`,
    }));
}
//# sourceMappingURL=sns.js.map