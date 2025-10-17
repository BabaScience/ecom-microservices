import type { Request, Response, NextFunction } from 'express';
import { verifyToken, extractTokenFromHeader } from '../utils/auth';
import { error } from '../utils/response';
import { ERROR_CODES } from '../constants';

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = extractTokenFromHeader(req.headers.authorization);
  
  if (!token) {
    return res.status(401).json(error('UNAUTHORIZED', 'No token provided'));
  }

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET not configured');
    }
    
    const decoded = verifyToken(token, secret);
    (req as any).user = decoded;
    next();
  } catch (err) {
    return res.status(401).json(error('UNAUTHORIZED', 'Invalid token'));
  }
}

export function adminMiddleware(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;
  
  if (!user || user.role !== 'admin') {
    return res.status(403).json(error('FORBIDDEN', 'Admin access required'));
  }
  
  next();
}
