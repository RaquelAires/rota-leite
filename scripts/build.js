import { access, cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';

await mkdir('dist/server', { recursive: true });
await mkdir('dist/.openai', { recursive: true });
if (await access('.openai/hosting.json').then(() => true, () => false)) {
  await cp('.openai/hosting.json', 'dist/.openai/hosting.json');
}
const assets = { "app.js": await readFile(".generated/app.js", "utf8") };
for (const file of await readdir('public')) {
  assets[file] = await readFile('public/' + file, 'utf8');
}
await writeFile('dist/server/assets.js', 'export const assets = ' + JSON.stringify(assets) + ';\n');
for (const file of ['api.js', 'seed.js', 'http.js']) await cp('server/' + file, 'dist/server/' + file);
await cp('server/worker.js', 'dist/server/index.js');
