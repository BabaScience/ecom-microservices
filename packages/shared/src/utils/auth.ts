import jwt from 'jsonwebtoken';
import { JWTPayload } from '../types/domain';

export function generateToken(payload: Omit<JWTPayload, 'iat' | 'exp'>, secret: string, expiresIn: string = '24h'): string {
  return jwt.sign(payload, secret, { expiresIn });
}

export function verifyToken(token: string, secret: string): JWTPayload {
  return jwt.verify(token, secret) as JWTPayload;
}

export function extractTokenFromHeader(authHeader: string | undefined): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
}
