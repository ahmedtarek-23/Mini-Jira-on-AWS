import { DynamoDBDocumentClient, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
export declare const db: DynamoDBDocumentClient;
export declare const TableNames: {
    Teams: string;
    Projects: string;
    Tasks: string;
    Comments: string;
    ActivityLog: string;
    Users: string;
};
export declare function getItem<T>(table: string, key: Record<string, any>): Promise<T | null>;
export declare function putItem(table: string, item: Record<string, any>): Promise<void>;
export declare function deleteItem(table: string, key: Record<string, any>): Promise<void>;
export declare function queryItems<T>(table: string, params: Omit<ConstructorParameters<typeof QueryCommand>[0], 'TableName'>): Promise<T[]>;
export declare function scanItems<T>(table: string, params?: Omit<ConstructorParameters<typeof ScanCommand>[0], 'TableName'>): Promise<T[]>;
export declare function updateItem(table: string, key: Record<string, any>, updates: Record<string, any>): Promise<void>;
//# sourceMappingURL=db.d.ts.map