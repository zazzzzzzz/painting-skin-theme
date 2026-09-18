/* 引擎层 · 命令行入口（不开窗口也能注入/撤下/看状态）。
 *   node dist/cli.js list
 *   node dist/cli.js pets                              # 列出可用宠物
 *   node dist/cli.js status   [--skin diana]
 *   node dist/cli.js apply    [--skin diana] [--mode auto|dark|light] [--pet choten-chan|none]
 *   node dist/cli.js pet <id|none>                     # 只切换宠物（不改皮肤）
 *   node dist/cli.js remove   [--skin diana]
 *   node dist/cli.js payload  [--skin diana] [--mode auto]   # 只打印将要执行的表达到 stdout（供外部转发）
 *   node dist/cli.js pump     [--skin diana]                 # 前台常驻用量泵（面板不在时的替代）
 */

import * as path from 'path';
import { applySkin, buildPayloadExpression, detectInjectedSkin, getStatus, listPets, listSkins, readPetSelection, removeSkin, selectPet, themesRoot } from './injector';
import { startUsagePump, usagePumpStatus } from './usage-pump';
import type { SkinMode } from './types';

function flag(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? 'list';
  const skinId = flag('skin', 'diana');
  const mode = flag('mode', 'auto') as SkinMode;
  const skins = listSkins(themesRoot());
  const skin = skins.find((entry) => entry.manifest.id === skinId);

  if (command === 'list') {
    console.log(JSON.stringify(skins.map((entry) => ({
      id: entry.manifest.id,
      name: entry.manifest.name,
      app: entry.manifest.app.id,
      port: entry.manifest.app.debugPort,
      adapterVersion: entry.manifest.adapterVersion,
      assets: Object.keys(entry.manifest.assets).length,
    })), null, 2));
    return;
  }
  if (command === 'pets') {
    console.log(JSON.stringify(listPets(), null, 2));
    return;
  }
  /* 面板专用：一次输出面板需要的全部状态。
   * 为什么要走 CLI 而不是在 Electron 里直接调：Electron 33 = Node 20.18 **没有全局 WebSocket**，
   * CDP 连接在里面会静默失败（实测面板因此显示"未挂载"）。CLI 跑在系统 Node（24）上，一切正常。 */
  if (command === 'panel') {
    const portraitOf = (id: string) => {
      const entry = skins.find((s) => s.manifest.id === id);
      const file = entry?.manifest.assets?.characterDark;
      return entry && file ? path.join(entry.dir, file) : null;
    };
    const injectedId = await detectInjectedSkin();
    const currentId = injectedId || skins[0]?.manifest.id || '';
    const current = skins.find((s) => s.manifest.id === currentId) ?? skins[0];
    const petId = await readPetSelection();
    const pets = listPets();
    console.log(JSON.stringify({
      skins: skins.map((s) => ({ id: s.manifest.id, name: s.manifest.name, author: s.manifest.author })),
      skinIndex: Math.max(0, skins.findIndex((s) => s.manifest.id === currentId)),
      injectedId,
      portrait: portraitOf(currentId),
      pets: [{ id: 'none', name: '不显示' }, ...pets],
      petIndex: Math.max(0, ['none', ...pets.map((p) => p.id)].indexOf(petId || 'none')),
      status: current ? await getStatus(current) : null,
      pump: usagePumpStatus(current?.manifest.app.debugPort ?? 9344),
    }));
    return;
  }
  if (command === 'pet') {
    const target = process.argv[3] ?? 'none';
    console.log(JSON.stringify(await selectPet(target), null, 2));
    return;
  }
  if (!skin) throw new Error(`主题不存在：${skinId}`);

  if (command === 'payload') {
    process.stdout.write(buildPayloadExpression(skin, mode));
    return;
  }
  if (command === 'status') {
    console.log(JSON.stringify(await getStatus(skin), null, 2));
    return;
  }
  if (command === 'apply') {
    const result = await applySkin(skin, mode);
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) { process.exitCode = 1; return; }
    /* --pet 只在显式给出时切换，避免每次注入都把用户的选择改回默认 */
    const petFlag = flag('pet', '');
    if (petFlag) {
      const selected = await selectPet(petFlag);
      if (!selected.ok) console.error(JSON.stringify({ pet: petFlag, error: selected.error }));
    }
    return;
  }
  if (command === 'remove') {
    console.log(JSON.stringify(await removeSkin(skin), null, 2));
    return;
  }
  if (command === 'pump') {
    /* 前台常驻：面板不在时用它给用量条供数。页面端没有自取数据的路径，停了就没数据。 */
    const port = skin.manifest.app.debugPort;
    startUsagePump(port, skin.manifest.app.targetUrlHint);
    console.log(JSON.stringify({ pump: usagePumpStatus(port), note: '前台常驻中，Ctrl+C 停止' }, null, 2));
    await new Promise(() => undefined);   // 永不 resolve：靠 Ctrl+C 结束
    return;
  }
  throw new Error(`未知命令：${command}`);
}

main().catch((error) => {
  console.error(JSON.stringify({ error: (error as Error).message }, null, 2));
  process.exitCode = 1;
});
