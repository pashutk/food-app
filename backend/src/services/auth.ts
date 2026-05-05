import jwt from 'jsonwebtoken';

/**
 * Minimal shared auth primitives.
 * Owns: credential verification, JWT issuance, JWT verification.
 * Stateless — no session store.
 */

export interface AuthCredentials {
  username: string;
  password: string;
}

export interface TokenPayload {
  username: string;
}

/**
 * Verify credentials against configured AUTH_USERNAME / AUTH_PASSWORD.
 * Returns true if valid, false otherwise.
 */
export function verifyCredentials(credentials: AuthCredentials): boolean {
  const { username, password } = credentials;
  const expectedUser = process.env.AUTH_USERNAME ?? '';
  const expectedPass = process.env.AUTH_PASSWORD ?? '';
  return username === expectedUser && password === expectedPass;
}

/**
 * Issue a JWT token for the given username.
 * Uses the same payload and expiry rules as the existing REST login.
 */
export function issueToken(username: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is required');
  }
  return jwt.sign({ username }, secret, { expiresIn: '30d' });
}

/**
 * Verify a JWT token and return the decoded payload.
 * Throws on invalid/expired tokens.
 */
export function verifyToken(token: string): TokenPayload {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is required');
  }
  const decoded = jwt.verify(token, secret) as jwt.JwtPayload;
  if (!decoded.username) {
    throw new Error('Invalid token payload');
  }
  return { username: decoded.username };
}
