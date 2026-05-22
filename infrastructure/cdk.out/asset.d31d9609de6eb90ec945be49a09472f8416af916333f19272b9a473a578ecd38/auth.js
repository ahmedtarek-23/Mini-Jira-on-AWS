import { jwtVerify, createLocalJWKSet } from 'jose';
const COGNITO_ISSUER = `https://cognito-idp.${process.env.AWS_REGION}.amazonaws.com/${process.env.COGNITO_USER_POOL_ID}`;
let jwks = null;
async function loadJwks() {
    if (jwks)
        return jwks;
    const res = await fetch(`${COGNITO_ISSUER}/.well-known/jwks.json`);
    if (!res.ok)
        throw new Error('Failed to fetch JWKS');
    const data = (await res.json());
    jwks = createLocalJWKSet(data);
    return jwks;
}
// Pre-load JWKS at startup
loadJwks().catch((e) => console.error('JWKS load error:', e));
export async function requireAuth(req, res, next) {
    if (req.method === 'OPTIONS') {
        return next();
    }
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Missing token' });
        return;
    }
    const token = authHeader.slice(7);
    try {
        const keySet = await loadJwks();
        const { payload } = await jwtVerify(token, keySet, {
            issuer: COGNITO_ISSUER,
            audience: process.env.COGNITO_CLIENT_ID,
            clockTolerance: 60,
        });
        const claims = payload;
        req.user = {
            userId: claims.sub,
            email: claims.email,
            role: claims['custom:role'] || 'employee',
            teamId: claims['custom:teamId'],
        };
        next();
    }
    catch (err) {
        console.error('Auth error:', err.message);
        res.status(401).json({ error: 'Invalid token' });
    }
}
export function requireRole(role) {
    return (req, res, next) => {
        if (req.user?.role !== role) {
            res.status(403).json({ error: 'Forbidden' });
            return;
        }
        next();
    };
}
//# sourceMappingURL=auth.js.map