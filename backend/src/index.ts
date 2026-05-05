import { createApp } from './app';

if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required');
if (!process.env.AUTH_USERNAME) throw new Error('AUTH_USERNAME is required');
if (!process.env.AUTH_PASSWORD) throw new Error('AUTH_PASSWORD is required');

const app = createApp();
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Listening on :${port}`));
