throw new Error('The old static UI generator has been archived. Edit src/styles and src/client for Next.js.');
/*
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
fs.mkdirSync(path.join(root,'public/brand'),{recursive:true});
const mock=fs.readFileSync('C:/Users/LEGION/.codex/visualizations/2026/11/07/01a1b48e-1766-7b51-a25d-0dfd23997939/vayora-social-studio-lengkap.html','utf8');
fs.writeFileSync(path.join(root,'public/workspace.css'),mock.match(/<style>([\s\S]*?)<\/style>/)[1]);
const logo=fs.readFileSync('E:/Work/VIDEO_EDITING/outputs/vayora-social-lengkap-2026-11-13/brand/logo-vayora.svg','utf8');
fs.writeFileSync(path.join(root,'public/brand/logo.svg'),logo);
const icon=logo.slice(logo.indexOf('<g transform="translate(0 42) scale(.58)">'),logo.indexOf('<g transform="translate(-8 0)"')).replace('transform="translate(0 42) scale(.58)"','');
fs.writeFileSync(path.join(root,'public/brand/icon.svg'),`<svg xmlns="http://www.w3.org/2000/svg" width="350" height="310" viewBox="15 0 350 310">${icon}</svg>`);
console.log('Brand and workspace styles ready.');

*/
