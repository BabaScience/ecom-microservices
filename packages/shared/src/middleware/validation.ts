import type { Request, Response, NextFunction } from 'express';
import { error } from '../utils/response';

export function validateBody(schema: any) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const { error: validationError } = schema.validate(req.body);
      if (validationError) {
        return res.status(400).json(error('VALIDATION_ERROR', validationError.details[0].message));
      }
      next();
    } catch (err) {
      return res.status(400).json(error('VALIDATION_ERROR', 'Invalid request body'));
    }
  };
}

export function validateQuery(schema: any) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const { error: validationError } = schema.validate(req.query);
      if (validationError) {
        return res.status(400).json(error('VALIDATION_ERROR', validationError.details[0].message));
      }
      next();
    } catch (err) {
      return res.status(400).json(error('VALIDATION_ERROR', 'Invalid query parameters'));
    }
  };
}
