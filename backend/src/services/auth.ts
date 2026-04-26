import jwt from 'jsonwebtoken';

export function verifyToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { username: string };
    return payload.username;
  } catch {
    return null;
  }
}

export function login(username: string, password: string): string | null {
  if (username === process.env.AUTH_USERNAME && password === process.env.AUTH_PASSWORD) {
    return jwt.sign({ username }, process.env.JWT_SECRET!, { expiresIn: '30d' });
  }
  return null;
}