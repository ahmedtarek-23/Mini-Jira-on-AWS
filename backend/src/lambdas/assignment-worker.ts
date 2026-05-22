import crypto from 'node:crypto'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb'
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch'

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const cw = new CloudWatchClient({})

const TABLE_ACTIVITY_LOG = process.env.TABLE_ACTIVITY_LOG || 'ActivityLog'

export const handler = async (event: any) => {
  for (const record of event.Records || []) {
    let body: any
    try { body = JSON.parse(record.body) } catch { continue }
    let task: any
    try { task = body.Message ? JSON.parse(body.Message) : body } catch { continue }

    await db.send(new PutCommand({
      TableName: TABLE_ACTIVITY_LOG,
      Item: {
        logId: crypto.randomUUID(),
        taskId: task.id || task.taskId,
        timestamp: new Date().toISOString(),
        action: 'ASSIGNED',
        actorId: task.createdBy || 'system',
        details: { assigneeId: task.assigneeId, teamId: task.teamId },
      },
    }))

    await cw.send(new PutMetricDataCommand({
      Namespace: 'MiniJira',
      MetricData: [{
        MetricName: 'TasksAssignedPerTeam',
        Value: 1,
        Unit: 'Count',
        Dimensions: [{ Name: 'Team', Value: task.teamId }],
        Timestamp: new Date(),
      }],
    }))
  }
}
