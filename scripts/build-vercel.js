import { cp, readFile, writeFile } from 'node:fs/promises';

if (process.env.VERCEL === '1' && process.env.VERCEL_ENV === 'production' &&
    process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
  await import('./migrate-vercel.js');
}

await cp('public', 'vercel-dist', { recursive: true });
await cp('.generated/app.js', 'vercel-dist/app.js');
const path = 'vercel-dist/index.html';
const html = await readFile(path, 'utf8');
await writeFile(path, html.replace('</head>', '  <meta name="rota-login" content="google">\n</head>'));
