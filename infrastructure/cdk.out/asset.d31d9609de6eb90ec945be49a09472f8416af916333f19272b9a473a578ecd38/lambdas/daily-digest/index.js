// src/lambdas/daily-digest.ts
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
var sns = new SNSClient({});
var db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
var TABLE_TASKS = process.env.TABLE_TASKS || "Tasks";
var SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN || "";
var handler = async () => {
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const res = await db.send(new ScanCommand({
    TableName: TABLE_TASKS,
    FilterExpression: "deadline = :d",
    ExpressionAttributeValues: { ":d": today }
  }));
  const tasks = res.Items || [];
  const byAssignee = {};
  for (const t of tasks) {
    if (!byAssignee[t.assigneeId]) byAssignee[t.assigneeId] = [];
    byAssignee[t.assigneeId].push(t);
  }
  for (const [assigneeId, taskList] of Object.entries(byAssignee)) {
    const lines = taskList.map((t) => `- ${t.title} (Team: ${t.teamId})`).join("\n");
    const message = `Daily Digest - Tasks due today:

${lines}`;
    await sns.send(new PublishCommand({
      TopicArn: SNS_TOPIC_ARN,
      Message: message,
      Subject: "Daily Task Digest"
    }));
  }
  return { count: tasks.length };
};
export {
  handler
};
