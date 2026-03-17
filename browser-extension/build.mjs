import * as esbuild from 'esbuild';
import { cpSync, mkdirSync } from 'fs';

const watch = process.argv.includes('--watch');

const entryPoints = [
  { in: 'popup/popup.ts',                       out: 'dist/popup/popup' },
  { in: 'content/content.ts',                   out: 'dist/content/content' },
  { in: 'background/service-worker.ts',         out: 'dist/background/service-worker' },
];

const buildOptions = {
  entryPoints,
  bundle: true,
  outdir: '.',          // out paths above are already prefixed with dist/
  outExtension: { '.js': '.js' },
  platform: 'browser',
  target: 'chrome120',
  format: 'iife',       // 单文件，无 import/export，Chrome popup 兼容
  sourcemap: false,
};

// Copy static assets
function copyStatics() {
  mkdirSync('dist/popup', { recursive: true });
  cpSync('popup/popup.html', 'dist/popup/popup.html');
  cpSync('popup/popup.css',  'dist/popup/popup.css');
  cpSync('manifest.json',    'dist/manifest.json');
  console.log('Static assets copied.');
}

if (watch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  copyStatics();
  console.log('Watching for changes...');
} else {
  await esbuild.build(buildOptions);
  copyStatics();
  console.log('Build complete → dist/');
}
