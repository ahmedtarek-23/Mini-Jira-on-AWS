import type { Request, Response, NextFunction } from 'express';
export interface AuthUser {
    userId: string;
    email: string;
    role: 'manager' | 'employee';
    teamId?: string;
}
declare global {
    namespace Express {
        interface Request {
            user?: AuthUser;
        }
    }
}
export declare function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function requireRole(role: 'manager'): (req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=auth.d.ts.map