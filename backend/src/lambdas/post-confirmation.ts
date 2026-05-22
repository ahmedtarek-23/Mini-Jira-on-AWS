import { SNSClient, SubscribeCommand } from '@aws-sdk/client-sns'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb'

const sns = new SNSClient({})
const db = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const TABLE_USERS = process.env.TABLE_USERS || 'Users'
const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN || ''

export const handler = async (event: any) => {
  const user = event.request?.userAttributes || {}
  await db.send(new PutCommand({
    TableName: TABLE_USERS,
    Item: {
      userId: event.userName || user.sub,
      id: event.userName || user.sub,
      email: user.email,
      role: user['custom:role'] || 'employee',
      teamId: user['custom:teamId'] || null,
      createdAt: new Date().toISOString(),
    },
  }))
  if (SNS_TOPIC_ARN && user.email) {
    try {
      await sns.send(new SubscribeCommand({
        TopicArn: SNS_TOPIC_ARN,
        Protocol: 'email',
        Endpoint: user.email,
      }))
    } catch {}
  }
  return event
}
