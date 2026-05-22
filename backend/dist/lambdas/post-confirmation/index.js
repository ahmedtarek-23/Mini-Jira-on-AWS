// src/lambdas/post-confirmation.ts
import { SNSClient, SubscribeCommand } from "@aws-sdk/client-sns";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
var sns = new SNSClient({});
var db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
var TABLE_USERS = process.env.TABLE_USERS || "Users";
var SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN || "";
var handler = async (event) => {
  const user = event.request?.userAttributes || {};
  await db.send(new PutCommand({
    TableName: TABLE_USERS,
    Item: {
      userId: event.userName || user.sub,
      id: event.userName || user.sub,
      email: user.email,
      role: user["custom:role"] || "employee",
      teamId: user["custom:teamId"] || null,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    }
  }));
  if (SNS_TOPIC_ARN && user.email) {
    try {
      await sns.send(new SubscribeCommand({
        TopicArn: SNS_TOPIC_ARN,
        Protocol: "email",
        Endpoint: user.email
      }));
    } catch {
    }
  }
  return event;
};
export {
  handler
};
