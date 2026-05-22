"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/index.ts
var import_express6 = __toESM(require("express"), 1);
var import_cors = __toESM(require("cors"), 1);
var import_dotenv = __toESM(require("dotenv"), 1);
var import_path = __toESM(require("path"), 1);

// src/auth.ts
var import_jose = require("jose");
var COGNITO_ISSUER = `https://cognito-idp.${process.env.AWS_REGION}.amazonaws.com/${process.env.COGNITO_USER_POOL_ID}`;
var jwks = null;
async function loadJwks() {
  if (jwks) return jwks;
  const res = await fetch(`${COGNITO_ISSUER}/.well-known/jwks.json`);
  if (!res.ok) throw new Error("Failed to fetch JWKS");
  const data = await res.json();
  jwks = (0, import_jose.createLocalJWKSet)(data);
  return jwks;
}
loadJwks().catch((e) => console.error("JWKS load error:", e));
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
    const keySet = await loadJwks();
    const { payload } = await (0, import_jose.jwtVerify)(token, keySet, {
      issuer: COGNITO_ISSUER,
      audience: process.env.COGNITO_CLIENT_ID,
      clockTolerance: 60
    });
    const claims = payload;
    req.user = {
      userId: claims.sub,
      email: claims.email,
      role: claims["custom:role"] || "employee",
      teamId: claims["custom:teamId"]
    };
    next();
  } catch (err) {
    console.error("Auth error:", err.message);
    res.status(401).json({ error: "Invalid token" });
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
var import_express = require("express");

// src/db.ts
var import_client_dynamodb = require("@aws-sdk/client-dynamodb");
var import_lib_dynamodb = require("@aws-sdk/lib-dynamodb");
var client = new import_client_dynamodb.DynamoDBClient({ region: process.env.AWS_REGION });
var db = import_lib_dynamodb.DynamoDBDocumentClient.from(client);
var TableNames = {
  Teams: process.env.TABLE_TEAMS || "Teams",
  Projects: process.env.TABLE_PROJECTS || "Projects",
  Tasks: process.env.TABLE_TASKS || "Tasks",
  Comments: process.env.TABLE_COMMENTS || "Comments",
  ActivityLog: process.env.TABLE_ACTIVITY_LOG || "ActivityLog",
  Users: process.env.TABLE_USERS || "Users"
};
async function getItem(table, key) {
  const res = await db.send(new import_lib_dynamodb.GetCommand({ TableName: table, Key: key }));
  return res.Item || null;
}
async function putItem(table, item) {
  await db.send(new import_lib_dynamodb.PutCommand({ TableName: table, Item: item }));
}
async function deleteItem(table, key) {
  await db.send(new import_lib_dynamodb.DeleteCommand({ TableName: table, Key: key }));
}
async function queryItems(table, params) {
  const res = await db.send(new import_lib_dynamodb.QueryCommand({ TableName: table, ...params }));
  return res.Items || [];
}
async function scanItems(table, params) {
  const res = await db.send(new import_lib_dynamodb.ScanCommand({ TableName: table, ...params }));
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
  await db.send(new import_lib_dynamodb.UpdateCommand({
    TableName: table,
    Key: key,
    UpdateExpression: updateExpr,
    ExpressionAttributeNames: exprNames,
    ExpressionAttributeValues: exprValues
  }));
}

// src/routes/teams.ts
var router = (0, import_express.Router)();
router.get("/", async (_req, res) => {
  const teams = await scanItems(TableNames.Teams);
  res.json(teams);
});
router.post("/", requireRole("manager"), async (req, res) => {
  const { name } = req.body;
  const team = { id: crypto.randomUUID(), name, createdAt: (/* @__PURE__ */ new Date()).toISOString() };
  await putItem(TableNames.Teams, team);
  res.status(201).json(team);
});
var teams_default = router;

// src/routes/projects.ts
var import_express2 = require("express");
var router2 = (0, import_express2.Router)();
router2.get("/", async (_req, res) => {
  const projects = await scanItems(TableNames.Projects);
  res.json(projects);
});
router2.post("/", requireRole("manager"), async (req, res) => {
  const { name, description } = req.body;
  const project = {
    id: crypto.randomUUID(),
    name,
    description: description || "",
    createdBy: req.user.userId,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  await putItem(TableNames.Projects, project);
  res.status(201).json(project);
});
var projects_default = router2;

// src/routes/tasks.ts
var import_express3 = require("express");

// src/services/sns.ts
var import_client_sns = require("@aws-sdk/client-sns");
var sns = new import_client_sns.SNSClient({ region: process.env.AWS_REGION });
var TOPIC_ARN = process.env.SNS_TOPIC_ARN || "";
async function publishTaskAssigned(task) {
  if (!TOPIC_ARN) return;
  await sns.send(new import_client_sns.PublishCommand({
    TopicArn: TOPIC_ARN,
    Message: `You have been assigned a new task: ${task.title}
Task ID: ${task.id}
Team: ${task.teamId}`,
    Subject: `New Task Assigned: ${task.title}`
  }));
}

// src/services/cloudwatch.ts
var import_client_cloudwatch = require("@aws-sdk/client-cloudwatch");
var cw = new import_client_cloudwatch.CloudWatchClient({ region: process.env.AWS_REGION });
async function putMetric(metricName, value, dimensions) {
  try {
    await cw.send(new import_client_cloudwatch.PutMetricDataCommand({
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
var router3 = (0, import_express3.Router)();
var VALID_STATUSES = ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"];
router3.get("/", async (req, res) => {
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
router3.get("/:id", async (req, res) => {
  const user = req.user;
  const task = await getItem(TableNames.Tasks, { id: req.params.id });
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
router3.post("/", requireRole("manager"), async (req, res) => {
  const { title, description, priority, deadline, assigneeId, teamId, projectId, imageKey } = req.body;
  if (!title || !teamId || !assigneeId) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }
  const task = {
    id: crypto.randomUUID(),
    title,
    description: description || "",
    status: "TODO",
    priority: priority || "MEDIUM",
    deadline: deadline || null,
    assigneeId,
    teamId,
    projectId: projectId || null,
    imageKey: imageKey || null,
    createdBy: req.user.userId,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  await putItem(TableNames.Tasks, task);
  await publishTaskAssigned(task);
  await putMetric("TasksCreated", 1, [{ Name: "Team", Value: teamId }]);
  res.status(201).json(task);
});
router3.put("/:id", async (req, res) => {
  const user = req.user;
  const existing = await getItem(TableNames.Tasks, { id: req.params.id });
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
      taskId: existing.id,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      action: "STATUS_CHANGE",
      actorId: user.userId,
      details: { from: existing.status, to: updates.status }
    };
    await putItem(TableNames.ActivityLog, logEntry);
    if (updates.status === "DONE") {
      const created = new Date(existing.createdAt).getTime();
      const closed = Date.now();
      const hours = (closed - created) / (1e3 * 60 * 60);
      await putMetric("TasksClosed", 1, [{ Name: "Team", Value: existing.teamId }]);
      await putMetric("TimeToClose", hours, [{ Name: "Team", Value: existing.teamId }]);
    }
  }
  updates.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  await updateItem(TableNames.Tasks, { id: req.params.id }, updates);
  const updated = { ...existing, ...updates };
  res.json(updated);
});
router3.delete("/:id", requireRole("manager"), async (req, res) => {
  const task = await getItem(TableNames.Tasks, { id: req.params.id });
  if (!task) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  await deleteItem(TableNames.Tasks, { id: req.params.id });
  res.status(204).send();
});
var tasks_default = router3;

// src/routes/comments.ts
var import_express4 = require("express");
var router4 = (0, import_express4.Router)();
router4.get("/", async (req, res) => {
  const { taskId } = req.query;
  if (!taskId) {
    res.status(400).json({ error: "Missing taskId" });
    return;
  }
  const comments = await queryItems(TableNames.Comments, {
    KeyConditionExpression: "taskId = :t",
    ExpressionAttributeValues: { ":t": taskId }
  });
  res.json(comments);
});
router4.post("/", async (req, res) => {
  const { taskId, text } = req.body;
  if (!taskId || !text) {
    res.status(400).json({ error: "Missing fields" });
    return;
  }
  const comment = {
    taskId,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    id: crypto.randomUUID(),
    authorId: req.user.userId,
    text
  };
  await putItem(TableNames.Comments, comment);
  res.status(201).json(comment);
});
var comments_default = router4;

// src/routes/uploads.ts
var import_express5 = require("express");
var import_client_s3 = require("@aws-sdk/client-s3");
var import_s3_request_presigner = require("@aws-sdk/s3-request-presigner");
var router5 = (0, import_express5.Router)();
var s3 = new import_client_s3.S3Client({ region: process.env.AWS_REGION });
var BUCKET = process.env.S3_BUCKET_ORIGINALS || "";
router5.post("/presigned", async (req, res) => {
  const { key, contentType } = req.body;
  if (!key) {
    res.status(400).json({ error: "Missing key" });
    return;
  }
  const command = new import_client_s3.PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType || "application/octet-stream"
  });
  const url = await (0, import_s3_request_presigner.getSignedUrl)(s3, command, { expiresIn: 300 });
  res.json({ url, bucket: BUCKET, key });
});
var uploads_default = router5;

// src/index.ts
import_dotenv.default.config();
var app = (0, import_express6.default)();
app.use((0, import_cors.default)());
app.use(import_express6.default.json());
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
app.use("/api/projects", projects_default);
app.use("/api/tasks", tasks_default);
app.use("/api/comments", comments_default);
app.use("/api/uploads", uploads_default);
var publicPath = import_path.default.join(process.cwd(), "public");
app.use(import_express6.default.static(publicPath));
app.get("*", (_req, res) => {
  res.sendFile(import_path.default.join(publicPath, "index.html"));
});
var PORT = process.env.PORT || 3e3;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
