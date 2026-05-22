import { Router } from 'express';
import { CognitoIdentityProviderClient, AdminUpdateUserAttributesCommand } from '@aws-sdk/client-cognito-identity-provider';
import { TableNames, scanItems, updateItem } from '../db.js';
import { requireRole } from '../auth.js';

const router = Router();
const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

router.get('/', async (req, res) => {
  const { teamId } = req.query;
  let users = await scanItems<any>(TableNames.Users);
  if (teamId) {
    users = users.filter((u: any) => u.teamId === teamId);
  }
  res.json(users.map((u: any) => ({
    userId: u.userId || u.id,
    email: u.email,
    role: u.role,
    teamId: u.teamId,
  })));
});

router.put('/:id/team', requireRole('manager'), async (req, res) => {
  const { teamId } = req.body;
  const userId = req.params.id;

  await updateItem(TableNames.Users, { userId }, {
    teamId: teamId || null,
    updatedAt: new Date().toISOString(),
  });

  try {
    await cognito.send(new AdminUpdateUserAttributesCommand({
      UserPoolId: process.env.COGNITO_USER_POOL_ID,
      Username: userId,
      UserAttributes: [{ Name: 'custom:teamId', Value: teamId || '' }],
    }));
  } catch (e: any) {
    console.error('Cognito update failed:', e.message);
  }

  res.json({ ok: true });
});

export default router;
