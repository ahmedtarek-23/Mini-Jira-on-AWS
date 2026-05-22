// src/lambdas/assignment-worker.ts
import crypto from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { CloudWatchClient, PutMetricDataCommand } from "@aws-sdk/client-cloudwatch";
var db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
var cw = new CloudWatchClient({});
var TABLE_ACTIVITY_LOG = process.env.TABLE_ACTIVITY_LOG || "ActivityLog";
var handler = async (event) => {
  for (const record of event.Records || []) {
    let body;
    try {
      body = JSON.parse(record.body);
    } catch {
      continue;
    }
    let task;
    try {
      task = body.Message ? JSON.parse(body.Message) : body;
    } catch {
      continue;
    }
    await db.send(new PutCommand({
      TableName: TABLE_ACTIVITY_LOG,
      Item: {
        logId: crypto.randomUUID(),
        taskId: task.id || task.taskId,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        action: "ASSIGNED",
        actorId: task.createdBy || "system",
        details: { assigneeId: task.assigneeId, teamId: task.teamId }
      }
    }));
    await cw.send(new PutMetricDataCommand({
      Namespace: "MiniJira",
      MetricData: [{
        MetricName: "TasksAssignedPerTeam",
        Value: 1,
        Unit: "Count",
        Dimensions: [{ Name: "Team", Value: task.teamId }],
        Timestamp: /* @__PURE__ */ new Date()
      }]
    }));
  }
};
export {
  handler
};
