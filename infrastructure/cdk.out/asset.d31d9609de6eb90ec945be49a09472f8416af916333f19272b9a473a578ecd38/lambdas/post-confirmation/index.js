// src/lambdas/post-confirmation.ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
var db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
var TABLE_USERS = process.env.TABLE_USERS || "Users";
var handler = async (event) => {
  const user = event.request?.userAttributes || {};
  await db.send(new PutCommand({
    TableName: TABLE_USERS,
    Item: {
      id: event.userName || user.sub,
      email: user.email,
      role: user["custom:role"] || "employee",
      teamId: user["custom:teamId"] || null,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    }
  }));
  return event;
};
export {
  handler
};
