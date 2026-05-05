import { describe, it, expect } from 'vitest';
import { verifyCredentials, issueToken, verifyToken } from '../auth';

describe('auth service', () => {
  describe('verifyCredentials', () => {
    it('accepts valid configured credentials', () => {
      expect(verifyCredentials({ username: 'testuser', password: 'testpass' })).toBe(true);
    });

    it('rejects invalid username', () => {
      expect(verifyCredentials({ username: 'wronguser', password: 'testpass' })).toBe(false);
    });

    it('rejects invalid password', () => {
      expect(verifyCredentials({ username: 'testuser', password: 'wrongpass' })).toBe(false);
    });
  });

  describe('issueToken', () => {
    it('returns a non-empty token string', () => {
      const token = issueToken('testuser');
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
    });

    it('token verifies successfully with verifyToken', () => {
      const token = issueToken('testuser');
      const payload = verifyToken(token);
      expect(payload.username).toBe('testuser');
    });
  });

  describe('verifyToken', () => {
    it('rejects malformed token', () => {
      expect(() => verifyToken('not-a-token')).toThrow();
    });

    it('rejects empty string', () => {
      expect(() => verifyToken('')).toThrow();
    });
  });
});
