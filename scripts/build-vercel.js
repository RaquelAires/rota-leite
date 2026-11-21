import { cp, readFile, writeFile } from 'node:fs/promises';

await cp('public', 'vercel-dist', { recursive: true });
await cp('.generated/app.js', 'vercel-dist/app.js');
const path = 'vercel-dist/index.html';
const html = await readFile(path, 'utf8');
await writeFile(path, html.replace('</head>', '  <meta name="rota-login" content="google">\n</head>'));
