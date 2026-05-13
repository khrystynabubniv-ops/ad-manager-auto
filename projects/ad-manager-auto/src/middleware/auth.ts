import OktaJwtVerifier from "@okta/jwt-verifier";
import { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";

let verifier: OktaJwtVerifier | undefined;

function getVerifier() {
  if (!env.OKTA_ISSUER || !env.OKTA_CLIENT_ID) {
    throw new Error("OKTA_ISSUER and OKTA_CLIENT_ID are required when AUTH_DISABLED=false");
  }
  verifier ??= new OktaJwtVerifier({
    issuer: env.OKTA_ISSUER,
    clientId: env.OKTA_CLIENT_ID
  });
  return verifier;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (env.AUTH_DISABLED) {
    return next();
  }

  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing bearer token" });
  }

  try {
    const token = auth.slice("Bearer ".length);
    await getVerifier().verifyAccessToken(token, "api://default");
    return next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid bearer token" });
  }
}
