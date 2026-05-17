'use strict';

require('dotenv').config();
const { DynamoDBClient, CreateTableCommand, ListTablesCommand } = require('@aws-sdk/client-dynamodb');

const client = new DynamoDBClient({
  region: 'us-east-1',
  endpoint: 'http://localhost:8000',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
});

const tables = [
  {
    TableName: 'Tasks',
    AttributeDefinitions: [
      { AttributeName: 'taskId', AttributeType: 'S' },
      { AttributeName: 'teamId', AttributeType: 'S' },
      { AttributeName: 'assigneeId', AttributeType: 'S' },
      { AttributeName: 'createdAt', AttributeType: 'S' },
    ],
    KeySchema: [{ AttributeName: 'taskId', KeyType: 'HASH' }],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'teamId-index',
        KeySchema: [
          { AttributeName: 'teamId', KeyType: 'HASH' },
          { AttributeName: 'createdAt', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
      },
      {
        IndexName: 'assigneeId-index',
        KeySchema: [
          { AttributeName: 'assigneeId', KeyType: 'HASH' },
          { AttributeName: 'createdAt', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
      },
    ],
    ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
  },
  {
    TableName: 'Projects',
    AttributeDefinitions: [{ AttributeName: 'projectId', AttributeType: 'S' }],
    KeySchema: [{ AttributeName: 'projectId', KeyType: 'HASH' }],
    ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
  },
  {
    TableName: 'Teams',
    AttributeDefinitions: [{ AttributeName: 'teamId', AttributeType: 'S' }],
    KeySchema: [{ AttributeName: 'teamId', KeyType: 'HASH' }],
    ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
  },
  {
    TableName: 'Comments',
    AttributeDefinitions: [
      { AttributeName: 'taskId', AttributeType: 'S' },
      { AttributeName: 'commentId', AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'taskId', KeyType: 'HASH' },
      { AttributeName: 'commentId', KeyType: 'RANGE' },
    ],
    ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
  },
];

async function run() {
  const { TableNames: existing } = await client.send(new ListTablesCommand({}));

  for (const table of tables) {
    if (existing.includes(table.TableName)) {
      console.log(`  SKIP  ${table.TableName} (already exists)`);
      continue;
    }
    await client.send(new CreateTableCommand(table));
    console.log(`  OK    ${table.TableName}`);
  }

  console.log('\nAll tables ready.');
}

run().catch((err) => { console.error(err); process.exit(1); });
