import type { Request, Response, NextFunction } from "express";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { getItem, TableNames } from "./db.js";

const idVerifier = CognitoJwtVerifier.create({
  userPoolId: process.env.COGNITO_USER_POOL_ID || "",
  clientId: process.env.COGNITO_CLIENT_ID || "",
  tokenUse: "id",
});

const accessVerifier = CognitoJwtVerifier.create({
  userPoolId: process.env.COGNITO_USER_POOL_ID || "",
  clientId: process.env.COGNITO_CLIENT_ID || "",
  tokenUse: "access",
});

export interface AuthUser {
  userId: string;
  email: string;
  role: "manager" | "employee";
  teamId?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (req.method === "OPTIONS") {
    return next();
  }
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing token" });
    return;
  }
  const token = authHeader.slice(7);
  try {
    let payload: any;
    try {
      payload = await idVerifier.verify(token);
    } catch {
      payload = await accessVerifier.verify(token);
    }

    const userId = String(payload.sub || "");
    const userRecord = userId
      ? await getItem<{
          email?: string;
          role?: "manager" | "employee";
          teamId?: string | null;
        }>(TableNames.Users, { userId })
      : null;

    const roleClaim = String(
      payload["custom:role"] || userRecord?.role || "employee",
    ).toLowerCase();
    const teamId = payload["custom:teamId"]
      ? String(payload["custom:teamId"])
      : userRecord?.teamId || undefined;
    const email = String(payload.email || userRecord?.email || "");

    req.user = {
      userId,
      email,
      role: roleClaim === "manager" ? "manager" : "employee",
      teamId,
    };
    next();
  } catch (err: any) {
    console.error("Auth error:", err.message);
    res.status(401).json({ error: `Invalid token: ${token}` });
  }
}

export function requireRole(role: "manager") {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.role !== role) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}
