import { S3Client } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
const s3 = new S3Client({});
const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const cw = new CloudWatchClient({});
const TABLE_ACTIVITY_LOG = process.env.TABLE_ACTIVITY_LOG || 'ActivityLog';
export const handler = async (event) => {
    for (const record of event.Records || []) {
        const body = JSON.parse(record.body);
        const task = body.Message ? JSON.parse(body.Message) : body;
        await db.send(new PutCommand({
            TableName: TABLE_ACTIVITY_LOG,
            Item: {
                taskId: task.id,
                timestamp: new Date().toISOString(),
                action: 'ASSIGNED',
                actorId: task.createdBy || 'system',
                details: { assigneeId: task.assigneeId, teamId: task.teamId },
            },
        }));
        await cw.send(new PutMetricDataCommand({
            Namespace: 'MiniJira',
            MetricData: [{
                    MetricName: 'TasksAssignedPerTeam',
                    Value: 1,
                    Unit: 'Count',
                    Dimensions: [{ Name: 'Team', Value: task.teamId }],
                    Timestamp: new Date(),
                }],
        }));
    }
};
//# sourceMappingURL=assignment-worker.js.map