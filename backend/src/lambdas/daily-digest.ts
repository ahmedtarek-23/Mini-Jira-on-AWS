import { SNSClient, PublishCommand } from '@aws-sdk/client-sns'
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb'

const sns = new SNSClient({})
const cw = new CloudWatchClient({})
const db = DynamoDBDocumentClient.from(new DynamoDBClient({}))

const TABLE_TASKS = process.env.TABLE_TASKS || 'Tasks'
const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN || ''

export const handler = async () => {
  const today = new Date().toISOString().slice(0, 10)

  const dueRes = await db.send(new ScanCommand({
    TableName: TABLE_TASKS,
    FilterExpression: 'deadline = :d',
    ExpressionAttributeValues: { ':d': today },
  }))

  const dueTasks = dueRes.Items || []
  const byAssignee: Record<string, any[]> = {}
  for (const t of dueTasks) {
    if (!byAssignee[t.assigneeId]) byAssignee[t.assigneeId] = []
    byAssignee[t.assigneeId].push(t)
  }

  for (const [assigneeId, taskList] of Object.entries(byAssignee)) {
    const lines = taskList.map((t: any) => `- ${t.title} (Team: ${t.teamId})`).join('\n')
    const message = `Daily Digest - Tasks due today:\n\n${lines}`
    await sns.send(new PublishCommand({
      TopicArn: SNS_TOPIC_ARN,
      Message: message,
      Subject: 'Daily Task Digest',
    }))
  }

  const overdueRes = await db.send(new ScanCommand({
    TableName: TABLE_TASKS,
    FilterExpression: 'deadline < :d AND #s <> :done',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: { ':d': today, ':done': 'DONE' },
  }))

  const overdueCount = (overdueRes.Items || []).length
  await cw.send(new PutMetricDataCommand({
    Namespace: 'MiniJira',
    MetricData: [{
      MetricName: 'OverdueTasks',
      Value: overdueCount,
      Unit: 'Count',
      Timestamp: new Date(),
    }],
  }))

  return { count: dueTasks.length, overdueCount }
}
