import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE_USERS = process.env.TABLE_USERS || 'Users';
export const handler = async (event) => {
    const user = event.request?.userAttributes || {};
    await db.send(new PutCommand({
        TableName: TABLE_USERS,
        Item: {
            id: event.userName || user.sub,
            email: user.email,
            role: user['custom:role'] || 'employee',
            teamId: user['custom:teamId'] || null,
            createdAt: new Date().toISOString(),
        },
    }));
    return event;
};
//# sourceMappingURL=post-confirmation.js.map