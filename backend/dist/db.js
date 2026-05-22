import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand, QueryCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
const client = new DynamoDBClient({ region: process.env.AWS_REGION });
export const db = DynamoDBDocumentClient.from(client);
export const TableNames = {
    Teams: process.env.TABLE_TEAMS || 'Teams',
    Projects: process.env.TABLE_PROJECTS || 'Projects',
    Tasks: process.env.TABLE_TASKS || 'Tasks',
    Comments: process.env.TABLE_COMMENTS || 'Comments',
    ActivityLog: process.env.TABLE_ACTIVITY_LOG || 'ActivityLog',
    Users: process.env.TABLE_USERS || 'Users',
};
export async function getItem(table, key) {
    const res = await db.send(new GetCommand({ TableName: table, Key: key }));
    return res.Item || null;
}
export async function putItem(table, item) {
    await db.send(new PutCommand({ TableName: table, Item: item }));
}
export async function deleteItem(table, key) {
    await db.send(new DeleteCommand({ TableName: table, Key: key }));
}
export async function queryItems(table, params) {
    const res = await db.send(new QueryCommand({ TableName: table, ...params }));
    return res.Items || [];
}
export async function scanItems(table, params) {
    const res = await db.send(new ScanCommand({ TableName: table, ...params }));
    return res.Items || [];
}
export async function updateItem(table, key, updates) {
    const keys = Object.keys(updates);
    if (keys.length === 0)
        return;
    const updateExpr = 'set ' + keys.map((k, i) => `#f${i} = :v${i}`).join(', ');
    const exprNames = {};
    const exprValues = {};
    keys.forEach((k, i) => {
        exprNames[`#f${i}`] = k;
        exprValues[`:v${i}`] = updates[k];
    });
    await db.send(new UpdateCommand({
        TableName: table,
        Key: key,
        UpdateExpression: updateExpr,
        ExpressionAttributeNames: exprNames,
        ExpressionAttributeValues: exprValues,
    }));
}
//# sourceMappingURL=db.js.map