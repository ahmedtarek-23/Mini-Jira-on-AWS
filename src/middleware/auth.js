'use strict';

const { CognitoJwtVerifier } = require('aws-jwt-verify');

// Created once at module load — the verifier caches the JWKS internally
const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.COGNITO_USER_POOL_ID,
  clientId: process.env.COGNITO_CLIENT_ID,
  tokenUse: 'id', // We validate the ID token, which carries custom attributes
});

async function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing or malformed Authorization header' });
  }

  const token = authHeader.slice(7);

  try {
    const payload = await verifier.verify(token);

    // Attach a clean user object to req — controllers/services read from here
    req.user = {
      userId: payload.sub,
      email: payload.email,
      role: payload['custom:role'],   // 'Manager' | 'Employee'
      teamId: payload['custom:teamId'],
    };

    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

module.exports = authMiddleware;
