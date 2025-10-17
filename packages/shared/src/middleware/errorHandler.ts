import type { Request, Response, NextFunction } from 'express';
import { error } from '../utils/response';
import { ERROR_CODES } from '../constants';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  const message = err instanceof Error ? err.message : 'Unknown error';
  res.status(500).json(error(ERROR_CODES.UNKNOWN_ERROR, message));
}

