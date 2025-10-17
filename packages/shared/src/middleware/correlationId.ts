import type { Request, Response, NextFunction } from 'express';

const HEADER_NAME = 'x-correlation-id';

export function correlationId(req: Request, _res: Response, next: NextFunction) {
  const existing = req.headers[HEADER_NAME] as string | undefined;
  const id = existing ?? cryptoRandomId();
  (req as any).correlationId = id;
  next();
}

function cryptoRandomId(): string {
  // Use Web Crypto if available via Bun/Node, fallback to Math.random
  try {
    // @ts-ignore
    const arr = new Uint8Array(16);
    // @ts-ignore
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
  }
}

