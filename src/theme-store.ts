/* 引擎层 · 皮肤清单的加载与校验。
 * 校验口径沿用 Dream-Work-Theme：清单里的路径只接受 basename、解析后必须仍落在主题目录内。 */

import * as fs from 'fs';
import * as path from 'path';

export interface SkinManifest {
  schemaVersion: number;
  id: string;
  name: string;
  author: string;
  adapterVersion: string;
  app: {
    id: string;
    debugPort: number;
    targetUrlHint: string;
    rendererHostClass: string;
  };
  skin: {
    css: string;
    runtime: string;
    tokens?: string;
    artworkContract?: string;
  };
  assets: Record<string, string>;
  hero?: { dark?: string; light?: string };
  modes: string[];
}

export interface SkinEntry {
  manifest: SkinManifest;
  dir: string;
}

const ID_PATTERN = /^[a-z0-9-]+$/;
const ROLE_PATTERN = /^[a-zA-Z][a-zA-Z0-9]*$/;
const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

function requireBasename(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value || path.basename(value) !== value) {
    throw new Error(`${field} 必须是文件名（不接受目录分隔符）`);
  }
  return value;
}

/** 子路径允许 a/b.png 这种相对写法，但必须逐段安全且不越界 */
function requireRelative(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`${field} 缺失`);
  const parts = value.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..' || part.includes('\\') || part.includes(':'))) {
    throw new Error(`${field} 不是安全的相对路径：${value}`);
  }
  return value;
}

function validate(manifest: SkinManifest): void {
  if (manifest.schemaVersion !== 1) throw new Error(`不支持的 schemaVersion: ${manifest.schemaVersion}`);
  if (!ID_PATTERN.test(manifest.id)) throw new Error('id 只能用小写字母、数字与连字符');
  if (!manifest.name || !manifest.author) throw new Error('name / author 不能为空');
  if (!manifest.adapterVersion) throw new Error('adapterVersion 不能为空');
  if (!manifest.app?.targetUrlHint) throw new Error('app.targetUrlHint 不能为空');
  if (!Number.isInteger(manifest.app?.debugPort) || manifest.app.debugPort <= 0) {
    throw new Error('app.debugPort 必须是正整数');
  }
  requireRelative(manifest.skin?.css, 'skin.css');
  requireRelative(manifest.skin?.runtime, 'skin.runtime');
  if (!manifest.assets || Object.keys(manifest.assets).length === 0) throw new Error('assets 不能为空');
  for (const [role, file] of Object.entries(manifest.assets)) {
    if (!ROLE_PATTERN.test(role)) throw new Error(`素材角色名不合法：${role}`);
    requireRelative(file, `assets.${role}`);
  }
}

export function loadSkin(dir: string): SkinEntry {
  const manifestPath = path.join(dir, 'theme.json');
  const raw = fs.readFileSync(manifestPath, 'utf-8');
  const manifest = JSON.parse(raw) as SkinManifest;
  validate(manifest);
  return { manifest, dir };
}

export function listSkins(themesRoot: string): SkinEntry[] {
  if (!fs.existsSync(themesRoot)) return [];
  const entries: SkinEntry[] = [];
  for (const name of fs.readdirSync(themesRoot)) {
    const dir = path.join(themesRoot, name);
    try {
      if (!fs.statSync(dir).isDirectory()) continue;
      if (!fs.existsSync(path.join(dir, 'theme.json'))) continue;
      entries.push(loadSkin(dir));
    } catch (error) {
      console.warn(`[skin] 跳过 ${name}:`, (error as Error).message);
    }
  }
  return entries.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
}

export function resolveInside(dir: string, relative: string): string {
  const root = path.resolve(dir);
  const target = path.resolve(root, relative);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error(`路径越界：${relative}`);
  }
  return target;
}

export function readAssetDataUrl(dir: string, relative: string): string {
  const file = resolveInside(dir, relative);
  const mime = MIME[path.extname(file).toLowerCase()];
  if (!mime) throw new Error(`不支持的素材格式：${relative}`);
  return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
}

export function readText(dir: string, relative: string): string {
  return fs.readFileSync(resolveInside(dir, relative), 'utf-8');
}
