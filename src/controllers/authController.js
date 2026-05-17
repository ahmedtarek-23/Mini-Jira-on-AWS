'use strict';

const {
  CognitoIdentityProviderClient,
  SignUpCommand,
  InitiateAuthCommand,
  AdminAddUserToGroupCommand,
} = require('@aws-sdk/client-cognito-identity-provider');

const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const CLIENT_ID = process.env.COGNITO_CLIENT_ID;

async function signup(req, res) {
  const { email, password, role, teamId } = req.body;

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
        { Name: 'custom:role', Value: role },
        { Name: 'custom:teamId', Value: teamId || '' },
      ],
    })
  );

  // Add user to the matching Cognito group (Manager / Employee)
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
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
      },
    })
  );

  res.json({
    accessToken: AuthenticationResult.AccessToken,
    idToken: AuthenticationResult.IdToken,
    refreshToken: AuthenticationResult.RefreshToken,
    expiresIn: AuthenticationResult.ExpiresIn,
  });
}

module.exports = { signup, signin };
