'use strict';

require('dotenv').config();
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');

const clientConfig = {
  region: process.env.AWS_REGION || 'us-east-1',
};

// When DYNAMODB_ENDPOINT is set, route traffic to DynamoDB Local
if (process.env.DYNAMODB_ENDPOINT) {
  clientConfig.endpoint = process.env.DYNAMODB_ENDPOINT;
  clientConfig.credentials = {
    accessKeyId: 'local',
    secretAccessKey: 'local',
  };
}

const baseClient = new DynamoDBClient(clientConfig);

// DocumentClient auto-marshals JS types to/from DynamoDB AttributeValues
const docClient = DynamoDBDocumentClient.from(baseClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

const TABLE_NAMES = {
  TASKS: 'Tasks',
  PROJECTS: 'Projects',
  TEAMS: 'Teams',
  COMMENTS: 'Comments',
};

const GSI_NAMES = {
  TASKS_BY_TEAM: 'teamId-index',
  TASKS_BY_ASSIGNEE: 'assigneeId-index',
};

module.exports = { docClient, TABLE_NAMES, GSI_NAMES };
