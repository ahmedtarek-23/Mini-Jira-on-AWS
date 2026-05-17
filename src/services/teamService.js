'use strict';

const {
  ScanCommand,
  PutCommand,
  GetCommand,
  DeleteCommand,
} = require('@aws-sdk/lib-dynamodb');
const {
  CognitoIdentityProviderClient,
  ListUsersCommand,
} = require('@aws-sdk/client-cognito-identity-provider');
const { v4: uuidv4 } = require('uuid');
const { docClient, TABLE_NAMES } = require('../config/dynamodb');
const { toFrontendTeam } = require('../utils/transform');

const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

// ─── Teams ────────────────────────────────────────────────────────────────────

async function listTeams() {
  const { Items } = await docClient.send(new ScanCommand({ TableName: TABLE_NAMES.TEAMS }));
  return (Items || []).map(toFrontendTeam);
}

async function getTeamById(teamId) {
  const { Item } = await docClient.send(
    new GetCommand({ TableName: TABLE_NAMES.TEAMS, Key: { teamId } })
  );
  return Item ? toFrontendTeam(Item) : null;
}

async function createTeam(payload) {
  const team = {
    teamId: uuidv4(),
    name: payload.name,
    color: payload.color || '#6366f1',
    managerId: payload.managerId || null,
    createdAt: new Date().toISOString(),
  };
  await docClient.send(new PutCommand({ TableName: TABLE_NAMES.TEAMS, Item: team }));
  return toFrontendTeam(team);
}

async function deleteTeam(teamId) {
  await docClient.send(new DeleteCommand({ TableName: TABLE_NAMES.TEAMS, Key: { teamId } }));
}

// ─── Users (via Cognito) ──────────────────────────────────────────────────────

/**
 * List all users in the Cognito User Pool.
 * In production the pool can be large — pagination is handled via PaginationToken.
 */
async function listAllUsers() {
  const users = [];
  let paginationToken;

  do {
    const params = {
      UserPoolId: process.env.COGNITO_USER_POOL_ID,
      Limit: 60,
    };
    if (paginationToken) params.PaginationToken = paginationToken;

    const { Users, PaginationToken } = await cognitoClient.send(new ListUsersCommand(params));

    for (const u of Users || []) {
      const attrs = Object.fromEntries(u.Attributes.map((a) => [a.Name, a.Value]));
      users.push({
        id: attrs.sub,
        name: attrs.name || attrs.email,
        email: attrs.email,
        role: (attrs['custom:role'] || 'Employee').toLowerCase(),
        teamId: attrs['custom:teamId'] || null,
        title: attrs['custom:role'] || 'Employee',
      });
    }

    paginationToken = PaginationToken;
  } while (paginationToken);

  return users;
}

/**
 * List users belonging to a specific team (filtered client-side from Cognito list).
 */
async function listUsersByTeam(teamId) {
  const all = await listAllUsers();
  return all.filter((u) => u.teamId === teamId);
}

module.exports = { listTeams, getTeamById, createTeam, deleteTeam, listAllUsers, listUsersByTeam };
