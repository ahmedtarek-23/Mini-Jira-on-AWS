'use strict';

const {
  CognitoIdentityProviderClient,
  SignUpCommand,
  InitiateAuthCommand,
  AdminAddUserToGroupCommand,
  GetUserCommand,
} = require('@aws-sdk/client-cognito-identity-provider');

const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const CLIENT_ID = process.env.COGNITO_CLIENT_ID;

async function signup(req, res) {
  const { email, password, role, teamId, name } = req.body;

  if (!email || !password || !role) {
    return res.status(400).json({ message: 'email, password, and role are required' });
  }

  if (!['Manager', 'Employee'].includes(role)) {
    return res.status(400).json({ message: 'role must be Manager or Employee' });
  }

  await cognitoClient.send(
    new SignUpCommand({
      ClientId: CLIENT_ID,
      Username: email,
      Password: password,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'name', Value: name || email },
        { Name: 'custom:role', Value: role },
        { Name: 'custom:teamId', Value: teamId || '' },
      ],
    })
  );

  await cognitoClient.send(
    new AdminAddUserToGroupCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
      GroupName: role,
    })
  );

  res.status(201).json({ message: 'User registered successfully. Check your email to confirm.' });
}

async function signin(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'email and password are required' });
  }

  const { AuthenticationResult } = await cognitoClient.send(
    new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: CLIENT_ID,
      AuthParameters: { USERNAME: email, PASSWORD: password },
    })
  );

  res.json({
    idToken: AuthenticationResult.IdToken,
    accessToken: AuthenticationResult.AccessToken,
    refreshToken: AuthenticationResult.RefreshToken,
    expiresIn: AuthenticationResult.ExpiresIn,
  });
}

/**
 * GET /auth/me — protected; returns the caller's profile derived from their token.
 * req.user is already populated by authMiddleware.
 */
async function me(req, res) {
  // Fetch full profile from Cognito for the canonical name attribute
  const { UserAttributes } = await cognitoClient.send(
    new GetUserCommand({ AccessToken: req.headers['x-access-token'] || '' })
  ).catch(() => ({ UserAttributes: [] }));

  const attrs = Object.fromEntries((UserAttributes || []).map((a) => [a.Name, a.Value]));

  res.json({
    id: req.user.userId,
    email: req.user.email,
    name: attrs.name || req.user.email,
    role: req.user.role.toLowerCase(),
    teamId: req.user.teamId || null,
    title: req.user.role,
  });
}

module.exports = { signup, signin, me };
