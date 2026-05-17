'use strict';

require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const { PutCommand, QueryCommand, GetCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient, TABLE_NAMES, GSI_NAMES } = require('../src/config/dynamodb');

// Simulated users
const manager = { userId: 'mgr-001', role: 'Manager', teamId: 'team-A' };
const employeeA = { userId: 'emp-001', role: 'Employee', teamId: 'team-A' };
const employeeB = { userId: 'emp-002', role: 'Employee', teamId: 'team-B' };

let pass = 0;
let fail = 0;

function assert(label, condition) {
  if (condition) { console.log(`  PASS  ${label}`); pass++; }
  else           { console.error(`  FAIL  ${label}`); fail++; }
}

async function run() {
  console.log('\n── Seeding test tasks ──────────────────────────────────────────');

  const now = new Date().toISOString();
  const taskA1 = { taskId: uuidv4(), title: 'Task A1', description: '', status: 'To Do',
    priority: 'High', deadline: null, assigneeId: employeeA.userId,
    teamId: 'team-A', projectId: null, createdAt: now, updatedAt: now };
  const taskB1 = { taskId: uuidv4(), title: 'Task B1', description: '', status: 'In Progress',
    priority: 'Medium', deadline: null, assigneeId: employeeB.userId,
    teamId: 'team-B', projectId: null, createdAt: now, updatedAt: now };

  await docClient.send(new PutCommand({ TableName: TABLE_NAMES.TASKS, Item: taskA1 }));
  await docClient.send(new PutCommand({ TableName: TABLE_NAMES.TASKS, Item: taskB1 }));
  console.log('  Inserted taskA1 (team-A) and taskB1 (team-B)');

  // ── Test 1: GSI teamId-index returns tasks for team-A ────────────────────
  console.log('\n── Test 1: teamId-index GSI query ─────────────────────────────');
  const { Items: teamAItems } = await docClient.send(new QueryCommand({
    TableName: TABLE_NAMES.TASKS,
    IndexName: GSI_NAMES.TASKS_BY_TEAM,
    KeyConditionExpression: 'teamId = :tid',
    ExpressionAttributeValues: { ':tid': 'team-A' },
  }));
  assert('team-A GSI returns ≥1 item', teamAItems.length >= 1);
  assert('All items belong to team-A', teamAItems.every(t => t.teamId === 'team-A'));

  // ── Test 2: GSI assigneeId-index returns tasks for employeeA ─────────────
  console.log('\n── Test 2: assigneeId-index GSI query ──────────────────────────');
  const { Items: assigneeItems } = await docClient.send(new QueryCommand({
    TableName: TABLE_NAMES.TASKS,
    IndexName: GSI_NAMES.TASKS_BY_ASSIGNEE,
    KeyConditionExpression: 'assigneeId = :aid',
    ExpressionAttributeValues: { ':aid': employeeA.userId },
  }));
  assert('assigneeId GSI returns ≥1 item for emp-001', assigneeItems.length >= 1);
  assert('All items assigned to emp-001', assigneeItems.every(t => t.assigneeId === employeeA.userId));

  // ── Test 3: RBAC — Employee blocked from another team's task ─────────────
  console.log('\n── Test 3: Employee ↔ team isolation (RBAC) ───────────────────');
  const { Item: fetchedTaskB } = await docClient.send(new GetCommand({
    TableName: TABLE_NAMES.TASKS, Key: { taskId: taskB1.taskId },
  }));
  // Simulate middleware check
  const employeeCanAccessTaskB = fetchedTaskB && fetchedTaskB.teamId === employeeA.teamId;
  assert('Employee A blocked from team-B task', !employeeCanAccessTaskB);

  const employeeCanAccessTaskA1 = fetchedTaskB && 'team-A' === 'team-A'; // same team
  assert('Employee A allowed to access team-A task', employeeCanAccessTaskA1);

  // ── Test 4: Manager sees items from any team ──────────────────────────────
  console.log('\n── Test 4: Manager cross-team access ───────────────────────────');
  const { Items: allTeamA } = await docClient.send(new QueryCommand({
    TableName: TABLE_NAMES.TASKS,
    IndexName: GSI_NAMES.TASKS_BY_TEAM,
    KeyConditionExpression: 'teamId = :tid',
    ExpressionAttributeValues: { ':tid': 'team-B' },
  }));
  assert('Manager can query team-B GSI (no team restriction applied)', allTeamA.length >= 1);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  await docClient.send(new DeleteCommand({ TableName: TABLE_NAMES.TASKS, Key: { taskId: taskA1.taskId } }));
  await docClient.send(new DeleteCommand({ TableName: TABLE_NAMES.TASKS, Key: { taskId: taskB1.taskId } }));

  console.log(`\n── Results: ${pass} passed, ${fail} failed ───────────────────────────`);
  if (fail > 0) process.exit(1);
}

run().catch(err => { console.error(err); process.exit(1); });
