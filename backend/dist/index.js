// src/index.ts
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

// src/auth.ts
import { CognitoJwtVerifier } from "aws-jwt-verify";

// src/db.ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand, QueryCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
var client = new DynamoDBClient({ region: process.env.AWS_REGION });
var db = DynamoDBDocumentClient.from(client);
var TableNames = {
  Teams: process.env.TABLE_TEAMS || "Teams",
  Projects: process.env.TABLE_PROJECTS || "Projects",
  Tasks: process.env.TABLE_TASKS || "Tasks",
  Comments: process.env.TABLE_COMMENTS || "Comments",
  ActivityLog: process.env.TABLE_ACTIVITY_LOG || "ActivityLog",
  Users: process.env.TABLE_USERS || "Users"
};
async function getItem(table, key) {
  const res = await db.send(new GetCommand({ TableName: table, Key: key }));
  return res.Item || null;
}
async function putItem(table, item) {
  await db.send(new PutCommand({ TableName: table, Item: item }));
}
async function deleteItem(table, key) {
  await db.send(new DeleteCommand({ TableName: table, Key: key }));
}
async function queryItems(table, params) {
  const res = await db.send(new QueryCommand({ TableName: table, ...params }));
  return res.Items || [];
}
async function scanItems(table, params) {
  const res = await db.send(new ScanCommand({ TableName: table, ...params }));
  return res.Items || [];
}
async function updateItem(table, key, updates) {
  const keys = Object.keys(updates);
  if (keys.length === 0) return;
  const updateExpr = "set " + keys.map((k, i) => `#f${i} = :v${i}`).join(", ");
  const exprNames = {};
  const exprValues = {};
  keys.forEach((k, i) => {
    exprNames[`#f${i}`] = k;
    exprValues[`:v${i}`] = updates[k];
  });
  await db.send(new UpdateCommand({
    TableName: table,
    Key: key,
    UpdateExpression: updateExpr,
    ExpressionAttributeNames: exprNames,
    ExpressionAttributeValues: exprValues
  }));
}

// src/auth.ts
var idVerifier = CognitoJwtVerifier.create({
  userPoolId: process.env.COGNITO_USER_POOL_ID || "",
  clientId: process.env.COGNITO_CLIENT_ID || "",
  tokenUse: "id"
});
var accessVerifier = CognitoJwtVerifier.create({
  userPoolId: process.env.COGNITO_USER_POOL_ID || "",
  clientId: process.env.COGNITO_CLIENT_ID || "",
  tokenUse: "access"
});
async function requireAuth(req, res, next) {
  if (req.method === "OPTIONS") {
    return next();
  }
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing token" });
    return;
  }
  const token = authHeader.slice(7);
  try {
    let payload;
    try {
      payload = await idVerifier.verify(token);
    } catch {
      payload = await accessVerifier.verify(token);
    }
    const userId = String(payload.sub || "");
    const userRecord = userId ? await getItem(TableNames.Users, { userId }) : null;
    const roleClaim = String(
      payload["custom:role"] || userRecord?.role || "employee"
    ).toLowerCase();
    const teamId = payload["custom:teamId"] ? String(payload["custom:teamId"]) : userRecord?.teamId || void 0;
    const email = String(payload.email || userRecord?.email || "");
    req.user = {
      userId,
      email,
      role: roleClaim === "manager" ? "manager" : "employee",
      teamId
    };
    next();
  } catch (err) {
    console.error("Auth error:", err.message);
    res.status(401).json({ error: `Invalid token: ${token}` });
  }
}
function requireRole(role) {
  return (req, res, next) => {
    if (req.user?.role !== role) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}

// src/routes/teams.ts
import { Router } from "express";
import crypto from "node:crypto";
var router = Router();
router.get("/", async (_req, res) => {
  const teams = await scanItems(TableNames.Teams);
  res.json(teams);
});
router.post("/", requireRole("manager"), async (req, res) => {
  const { name } = req.body;
  const teamId = crypto.randomUUID();
  const team = { teamId, id: teamId, name, createdAt: (/* @__PURE__ */ new Date()).toISOString() };
  await putItem(TableNames.Teams, team);
  res.status(201).json(team);
});
router.put("/:id", requireRole("manager"), async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) {
    res.status(400).json({ error: "Name is required" });
    return;
  }
  await updateItem(TableNames.Teams, { teamId: req.params.id }, {
    name: name.trim(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  res.json({ ok: true, id: req.params.id, name: name.trim() });
});
router.delete("/:id", requireRole("manager"), async (req, res) => {
  await deleteItem(TableNames.Teams, { teamId: req.params.id });
  res.json({ ok: true });
});
var teams_default = router;

// src/routes/users.ts
import { Router as Router2 } from "express";
import { CognitoIdentityProviderClient, AdminUpdateUserAttributesCommand } from "@aws-sdk/client-cognito-identity-provider";
var router2 = Router2();
var cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });
router2.get("/", async (req, res) => {
  const { teamId } = req.query;
  let users = await scanItems(TableNames.Users);
  if (teamId) {
    users = users.filter((u) => u.teamId === teamId);
  }
  res.json(users.map((u) => ({
    userId: u.userId || u.id,
    email: u.email,
    role: u.role,
    teamId: u.teamId
  })));
});
router2.put("/:id/team", requireRole("manager"), async (req, res) => {
  const { teamId } = req.body;
  const userId = req.params.id;
  await updateItem(TableNames.Users, { userId }, {
    teamId: teamId || null,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  try {
    await cognito.send(new AdminUpdateUserAttributesCommand({
      UserPoolId: process.env.COGNITO_USER_POOL_ID,
      Username: userId,
      UserAttributes: [{ Name: "custom:teamId", Value: teamId || "" }]
    }));
  } catch (e) {
    console.error("Cognito update failed:", e.message);
  }
  res.json({ ok: true });
});
var users_default = router2;

// src/routes/projects.ts
import { Router as Router3 } from "express";
import crypto2 from "node:crypto";
var router3 = Router3();
router3.get("/", async (_req, res) => {
  const projects = await scanItems(TableNames.Projects);
  res.json(projects);
});
router3.post("/", requireRole("manager"), async (req, res) => {
  const { name, description } = req.body;
  const projectId = crypto2.randomUUID();
  const project = {
    projectId,
    id: projectId,
    name,
    description: description || "",
    createdBy: req.user.userId,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  await putItem(TableNames.Projects, project);
  res.status(201).json(project);
});
router3.put("/:id", requireRole("manager"), async (req, res) => {
  const { name, description } = req.body;
  if (!name?.trim()) {
    res.status(400).json({ error: "Name is required" });
    return;
  }
  const updates = {
    name: name.trim(),
    description: description?.trim() || "",
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  await updateItem(TableNames.Projects, { projectId: req.params.id }, updates);
  res.json({ ...updates, projectId: req.params.id });
});
router3.delete("/:id", requireRole("manager"), async (req, res) => {
  await deleteItem(TableNames.Projects, { projectId: req.params.id });
  res.json({ ok: true });
});
var projects_default = router3;

// src/routes/tasks.ts
import { Router as Router4 } from "express";
import crypto3 from "node:crypto";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

// src/services/sns.ts
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
var sns = new SNSClient({ region: process.env.AWS_REGION });
var TOPIC_ARN = process.env.SNS_TOPIC_ARN || "";
async function publishTaskAssigned(task) {
  if (!TOPIC_ARN) return;
  await sns.send(new PublishCommand({
    TopicArn: TOPIC_ARN,
    Message: JSON.stringify(task),
    Subject: `New Task Assigned: ${task.title}`,
    MessageAttributes: {
      eventType: { DataType: "String", StringValue: "task_assigned" }
    }
  }));
}

// src/services/cloudwatch.ts
import { CloudWatchClient, PutMetricDataCommand } from "@aws-sdk/client-cloudwatch";
var cw = new CloudWatchClient({ region: process.env.AWS_REGION });
async function putMetric(metricName, value, dimensions) {
  try {
    await cw.send(new PutMetricDataCommand({
      Namespace: "MiniJira",
      MetricData: [{
        MetricName: metricName,
        Value: value,
        Unit: "Count",
        Dimensions: dimensions,
        Timestamp: /* @__PURE__ */ new Date()
      }]
    }));
  } catch (e) {
    console.error("CloudWatch metric error:", e);
  }
}

// src/routes/tasks.ts
var s3 = new S3Client({ region: process.env.AWS_REGION });
var ORIGINALS_BUCKET = process.env.S3_BUCKET_ORIGINALS || "";
var RESIZED_BUCKET = process.env.S3_BUCKET_RESIZED || "";
async function deleteTaskImages(imageKey) {
  if (!imageKey) return;
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: ORIGINALS_BUCKET, Key: imageKey }));
  } catch (e) {
    console.error("Failed to delete original image:", e.message);
  }
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: RESIZED_BUCKET, Key: imageKey }));
  } catch (e) {
    console.error("Failed to delete resized image:", e.message);
  }
}
var router4 = Router4();
var VALID_STATUSES = ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"];
router4.get("/", async (req, res) => {
  const user = req.user;
  let tasks = [];
  if (user.role === "manager") {
    tasks = await scanItems(TableNames.Tasks);
  } else {
    tasks = await queryItems(TableNames.Tasks, {
      IndexName: "TeamIdIndex",
      KeyConditionExpression: "teamId = :t",
      ExpressionAttributeValues: { ":t": user.teamId }
    });
  }
  res.json(tasks);
});
router4.get("/:id", async (req, res) => {
  const user = req.user;
  const items = await queryItems(TableNames.Tasks, {
    KeyConditionExpression: "taskId = :id",
    ExpressionAttributeValues: { ":id": req.params.id }
  });
  const task = items[0];
  if (!task) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (user.role !== "manager" && task.teamId !== user.teamId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  res.json(task);
});
router4.post("/", requireRole("manager"), async (req, res) => {
  try {
    const { title, description, priority, deadline, assigneeId, teamId, projectId, imageKey } = req.body;
    if (!title || !teamId || !assigneeId) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }
    const taskId = crypto3.randomUUID();
    const task = {
      taskId,
      id: taskId,
      title,
      description: description || "",
      status: "TODO",
      priority: priority || "MEDIUM",
      deadline: deadline || null,
      assignee: assigneeId,
      assigneeId,
      teamId,
      projectId: projectId || null,
      imageKey: imageKey || null,
      createdBy: req.user.userId,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    await putItem(TableNames.Tasks, task);
    try {
      await publishTaskAssigned(task);
    } catch (e) {
      console.error("SNS publish error:", e.message);
    }
    try {
      await putMetric("TasksCreated", 1, [{ Name: "Team", Value: teamId }]);
    } catch (e) {
      console.error("Metric error:", e.message);
    }
    try {
      await putItem(TableNames.ActivityLog, {
        logId: crypto3.randomUUID(),
        taskId,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        action: "CREATED",
        actorId: req.user.userId,
        details: { title, assigneeId, teamId }
      });
    } catch (e) {
      console.error("Activity log error:", e.message);
    }
    res.status(201).json(task);
  } catch (err) {
    console.error("POST /tasks error:", err);
    res.status(500).json({ error: "Failed to create task", detail: err.message });
  }
});
router4.put("/:id", async (req, res) => {
  try {
    const user = req.user;
    const items = await queryItems(TableNames.Tasks, {
      KeyConditionExpression: "taskId = :id",
      ExpressionAttributeValues: { ":id": req.params.id }
    });
    const existing = items[0];
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (user.role !== "manager" && existing.teamId !== user.teamId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const allowedFields = {};
    if (user.role === "manager") {
      allowedFields.title = true;
      allowedFields.description = true;
      allowedFields.priority = true;
      allowedFields.deadline = true;
      allowedFields.assigneeId = true;
      allowedFields.teamId = true;
      allowedFields.projectId = true;
      allowedFields.imageKey = true;
      allowedFields.status = true;
    } else {
      if (existing.assigneeId !== user.userId) {
        res.status(403).json({ error: "Not assigned to you" });
        return;
      }
      allowedFields.status = true;
    }
    const updates = {};
    for (const key of Object.keys(req.body)) {
      if (allowedFields[key]) updates[key] = req.body[key];
    }
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No valid fields to update" });
      return;
    }
    if (updates.status && !VALID_STATUSES.includes(updates.status)) {
      res.status(400).json({ error: "Invalid status" });
      return;
    }
    if (updates.status && updates.status !== existing.status) {
      const logEntry = {
        logId: crypto3.randomUUID(),
        taskId: existing.taskId || existing.id,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        action: "STATUS_CHANGE",
        actorId: user.userId,
        details: { from: existing.status, to: updates.status }
      };
      try {
        await putItem(TableNames.ActivityLog, logEntry);
      } catch (e) {
        console.error("Activity log error:", e.message);
      }
      if (updates.status === "DONE") {
        const created = new Date(existing.createdAt).getTime();
        const closed = Date.now();
        const hours = (closed - created) / (1e3 * 60 * 60);
        try {
          await putMetric("TasksClosed", 1, [{ Name: "Team", Value: existing.teamId }]);
        } catch (e) {
          console.error("Metric error:", e.message);
        }
        try {
          await putMetric("TimeToClose", hours, [{ Name: "Team", Value: existing.teamId }]);
        } catch (e) {
          console.error("Metric error:", e.message);
        }
      }
    }
    if (updates.assigneeId !== void 0 && updates.assigneeId !== existing.assigneeId) {
      const reassigned = { ...existing, ...updates };
      try {
        await publishTaskAssigned(reassigned);
      } catch (e) {
        console.error("SNS publish error:", e.message);
      }
    }
    if (updates.imageKey !== void 0 && updates.imageKey !== existing.imageKey) {
      await deleteTaskImages(existing.imageKey);
    }
    updates.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    const taskKey = { taskId: existing.taskId || existing.id, createdAt: existing.createdAt || (/* @__PURE__ */ new Date()).toISOString() };
    if (!taskKey.taskId) {
      res.status(500).json({ error: "Task missing primary key" });
      return;
    }
    await updateItem(TableNames.Tasks, taskKey, updates);
    const updated = { ...existing, ...updates };
    updated.id = updated.taskId || updated.id;
    res.json(updated);
  } catch (err) {
    console.error("PUT /tasks/:id error:", err);
    res.status(500).json({ error: "Failed to update task", detail: err.message });
  }
});
router4.delete("/:id", requireRole("manager"), async (req, res) => {
  const items = await queryItems(TableNames.Tasks, {
    KeyConditionExpression: "taskId = :id",
    ExpressionAttributeValues: { ":id": req.params.id }
  });
  const task = items[0];
  if (!task) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  await deleteTaskImages(task.imageKey);
  try {
    await putItem(TableNames.ActivityLog, {
      logId: crypto3.randomUUID(),
      taskId: task.taskId || task.id,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      action: "DELETED",
      actorId: req.user.userId,
      details: { title: task.title, teamId: task.teamId }
    });
  } catch (e) {
    console.error("Activity log error:", e.message);
  }
  await deleteItem(TableNames.Tasks, { taskId: task.taskId, createdAt: task.createdAt });
  res.status(204).send();
});
var tasks_default = router4;

// src/routes/comments.ts
import { Router as Router5 } from "express";
import crypto4 from "node:crypto";
var router5 = Router5();
async function getTask(taskId) {
  const items = await queryItems(TableNames.Tasks, {
    KeyConditionExpression: "taskId = :id",
    ExpressionAttributeValues: { ":id": taskId }
  });
  return items[0] || null;
}
router5.get("/", async (req, res) => {
  const { taskId } = req.query;
  if (!taskId) {
    res.status(400).json({ error: "Missing taskId" });
    return;
  }
  const task = await getTask(taskId);
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  if (req.user.role !== "manager" && task.teamId !== req.user.teamId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const comments = await queryItems(TableNames.Comments, {
    IndexName: "TaskIdIndex",
    KeyConditionExpression: "taskId = :t",
    ExpressionAttributeValues: { ":t": taskId }
  });
  res.json(comments);
});
router5.post("/", async (req, res) => {
  const { taskId, text } = req.body;
  if (!taskId || !text) {
    res.status(400).json({ error: "Missing fields" });
    return;
  }
  const task = await getTask(taskId);
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  if (req.user.role !== "manager" && task.teamId !== req.user.teamId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const comment = {
    commentId: crypto4.randomUUID(),
    taskId,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    id: crypto4.randomUUID(),
    authorId: req.user.userId,
    text
  };
  await putItem(TableNames.Comments, comment);
  res.status(201).json(comment);
});
var comments_default = router5;

// src/routes/uploads.ts
import { Router as Router6 } from "express";
import { S3Client as S3Client2, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
var router6 = Router6();
var s32 = new S3Client2({ region: process.env.AWS_REGION });
var BUCKET = process.env.S3_BUCKET_ORIGINALS || "";
var ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif"
];
var MAX_FILE_SIZE = 10 * 1024 * 1024;
router6.post("/presigned", async (req, res) => {
  try {
    const { key, contentType } = req.body;
    if (!key) {
      res.status(400).json({ error: "Missing key" });
      return;
    }
    if (!key.startsWith("tasks/")) {
      res.status(400).json({ error: "Key must start with tasks/" });
      return;
    }
    if (!contentType || !ALLOWED_CONTENT_TYPES.includes(contentType)) {
      res.status(400).json({ error: "Invalid content type. Allowed: image/jpeg, image/png, image/gif, image/webp, image/avif" });
      return;
    }
    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: contentType
    });
    const url = await getSignedUrl(s32, command, { expiresIn: 300 });
    res.json({ url, bucket: BUCKET, key });
  } catch (err) {
    console.error("Presigned URL error:", err);
    res.status(500).json({ error: "Failed to generate upload URL", detail: err.message });
  }
});
router6.get("/buckets", async (_req, res) => {
  res.json({
    originals: `https://${BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com`,
    resized: `https://${process.env.S3_BUCKET_RESIZED}.s3.${process.env.AWS_REGION}.amazonaws.com`
  });
});
var uploads_default = router6;

// src/index.ts
dotenv.config();
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});
var app = express();
app.use(cors());
app.use(express.json());
app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/api/me", requireAuth, (req, res) => {
  res.json({
    userId: req.user.userId,
    email: req.user.email,
    role: req.user.role,
    teamId: req.user.teamId
  });
});
app.use("/api", requireAuth);
app.use("/api/teams", teams_default);
app.use("/api/users", users_default);
app.use("/api/projects", projects_default);
app.use("/api/tasks", tasks_default);
app.use("/api/comments", comments_default);
app.use("/api/uploads", uploads_default);
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error", detail: err?.message });
});
var PORT = process.env.PORT || 3e3;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
