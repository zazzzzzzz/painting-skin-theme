/* 引擎层 · 命令行入口（不开窗口也能注入/撤下/看状态）。
 *   node dist/cli.js list
 *   node dist/cli.js pets                              # 列出可用宠物
 *   node dist/cli.js status   [--skin diana]
 *   node dist/cli.js apply    [--skin diana] [--mode auto|dark|light] [--pet choten-chan|none]
 *   node dist/cli.js pet <id|none>                     # 只切换宠物（不改皮肤）
 *   node dist/cli.js remove   [--skin diana]
 *   node dist/cli.js payload  [--skin diana] [--mode auto]   # 只打印将要执行的表达到 stdout（供外部转发）
 *   node dist/cli.js pump     [--skin diana]                 # 前台常驻用量泵（面板不在时的替代）
 *   node dist/cli.js defaults [--skin diana] [--reset] [--no-save]
 *                                                            # 按默认路径解析 ZCode 的位置；--reset 丢掉手动配置
 *   node dist/cli.js setexe <绝对路径>                        # 手动配置 ZCode 可执行文件
 *   node dist/cli.js relaunch [--skin diana] [--mode auto] [--apply]
 *                                                            # 带 --remote-debugging-port 重启 ZCode；--apply 之后立刻注入
 */

import * as fs from 'fs';
import * as path from 'path';
import { applySkin, buildPayloadExpression, detectInjectedSkin, getStatus, listPets, listSkins, readPetSelection, removeSkin, selectPet, themesRoot } from './injector';
import { candidatesFor, clearTargetExe, configPath, defaultPaths, describeTargetApp, relaunchWithDebugPort, saveTargetExe, targetSpecOf } from './target-app';
import { startUsagePump, usagePumpStatus } from './usage-pump';
import type { SkinEntry } from './theme-store';
import type { SkinMode } from './types';

function flag(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

/** 面板要的那份状态（`panel` 命令与 `relaunch --panel-state` 共用同一段逻辑，
 *  这样面板点一次"重启并注入"只需要起一个子进程，而不是先取状态、再重启、再取状态三次）。 */
async function panelStateOf(skins: SkinEntry[]): Promise<Record<string, unknown>> {
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
  return {
    skins: skins.map((s) => ({ id: s.manifest.id, name: s.manifest.name, author: s.manifest.author })),
    skinIndex: Math.max(0, skins.findIndex((s) => s.manifest.id === currentId)),
    injectedId,
    portrait: portraitOf(currentId),
    pets: [{ id: 'none', name: '不显示' }, ...pets],
    petIndex: Math.max(0, ['none', ...pets.map((p) => p.id)].indexOf(petId || 'none')),
    status: current ? await getStatus(current) : null,
    pump: usagePumpStatus(current?.manifest.app.debugPort ?? 9344),
    /* 目标应用：路径从哪来、有没有在跑、调试端口通不通。面板用它显示最下面那行，
       并在注入失败时决定是否把主按钮换成"重启 ZCode 并注入"。 */
    app: current ? await describeTargetApp(targetSpecOf(current.manifest.app)) : null,
  };
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? 'list';
  const skinId = flag('skin', 'diana');
  const mode = flag('mode', 'auto') as SkinMode;
  const skins = listSkins(themesRoot());
  const skin = skins.find((entry) => entry.manifest.id === skinId);
  /** 目标应用规格取自当前主题（两个主题指向同一个应用）；没有主题时无从谈起 */
  const appEntry: SkinEntry | undefined = skin ?? skins[0];
  const appSpec = () => {
    if (!appEntry) throw new Error('没有可用主题，无法确定目标应用');
    return targetSpecOf(appEntry.manifest.app);
  };

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
  /* 默认路径解析：本机配置 > 主题清单 > 内置默认路径，命中的第一条默认写进本机配置（自动配置）。
     --reset 先丢掉手动指定的路径，回到默认路径再解析 —— 面板上"默认"按钮走的就是这条。 */
  if (command === 'defaults') {
    const spec = appSpec();
    const reset = process.argv.includes('--reset') ? clearTargetExe(spec.appId) : false;
    const candidates = candidatesFor(spec);
    const save = !process.argv.includes('--no-save') && candidates.length > 0;
    const saved = save ? saveTargetExe(spec.appId, candidates[0].path, candidates[0].source) : null;
    console.log(JSON.stringify({
      app: spec.appId,
      processName: spec.processName,
      port: spec.debugPort,
      reset,
      candidates: candidates.map((item, index) => ({ ...item, chosen: index === 0 })),
      defaults: defaultPaths(spec),
      saved,
      configPath: configPath(),
    }, null, 2));
    if (!candidates.length) process.exitCode = 1;
    return;
  }
  /* 手动配置：面板上"选择…"选完 exe 之后也走这条路（面板只负责弹文件对话框） */
  if (command === 'setexe') {
    const spec = appSpec();
    const value = process.argv[3] ?? '';
    if (!path.isAbsolute(value)) throw new Error(`需要绝对路径：${value || '(空)'}`);
    if (!fs.existsSync(value) || !/\.exe$/i.test(value)) throw new Error(`不是可用的可执行文件：${value}`);
    const saved = saveTargetExe(spec.appId, value, '手动配置');
    console.log(JSON.stringify({ app: spec.appId, saved, configPath: configPath() }, null, 2));
    return;
  }
  /* 带调试端口重启：注入失败最常见的原因就是目标应用没带这个参数启动，而它只在启动时生效。
     --progress：把每一步以 "PROGRESS <短标签>" 写进 stderr（stdout 留给最终 JSON），
                 面板实时显示在按钮上 —— 重启要等应用启动，没有进度就像卡死。
     --panel-state：顺带把 panel 命令的那份状态也返回，这样面板点一次只需起 1 个子进程。 */
  if (command === 'relaunch') {
    const spec = appSpec();
    const verbose = process.argv.includes('--progress');
    const relaunched = await relaunchWithDebugPort(spec, 45_000, verbose
      ? (_step, label) => { process.stderr.write(`PROGRESS ${label ?? _step}\n`); }
      : undefined);
    let applied = null;
    if (relaunched.ok && process.argv.includes('--apply') && appEntry) {
      if (verbose) process.stderr.write('PROGRESS 正在注入皮肤…\n');
      applied = await applySkin(appEntry, mode);
      if (verbose) process.stderr.write(`PROGRESS ${applied.ok ? '注入完成' : '注入未通过'}\n`);
    }
    const payload: Record<string, unknown> = { relaunched, applied, app: await describeTargetApp(spec) };
    if (process.argv.includes('--panel-state')) payload.panel = await panelStateOf(skins);
    console.log(JSON.stringify(payload, null, 2));
    if (!relaunched.ok) process.exitCode = 1;
    return;
  }
  /* 面板专用：一次输出面板需要的全部状态。
   * 为什么要走 CLI 而不是在 Electron 里直接调：Electron 33 = Node 20.18 **没有全局 WebSocket**，
   * CDP 连接在里面会静默失败（实测面板因此显示"未挂载"）。CLI 跑在系统 Node（24）上，一切正常。 */
  if (command === 'panel') {
    console.log(JSON.stringify(await panelStateOf(skins)));
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
