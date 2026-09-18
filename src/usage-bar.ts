/* 用量层 · 页面端用量条脚本。
 *
 * 移植自 Dream-Work-Theme 的 electron/manager/usage-bar.ts，改动了四处：
 *   1. id / 全局名 / 事件名统一到本项目前缀（diana-usage-*、__dianaUsage*、diana-usage 事件）
 *   2. 配色改吃本主题 token（--diana-zcode-* / --color-*），带 fallback，随主题换色
 *   3. "主题在否"的判据改为本项目的样式表 id（#diana-zcode-runtime-style），皮肤撤下时条自动隐藏
 *   4. 上下文窗口：原生 UI 读到的"总量 N"优先；DB 兜底值若小于实测 ctx，按"窗口未知"处理，
 *      只显示 token 数不显示百分比 —— 兜底常量难免偏小，硬算会出现 500% 这种荒唐数字
 *
 * 页面端**没有任何自取数据的路径**：数据只由 usage-pump 推入 __dianaUsageUpdate(snapshot)。
 * 泵不停就没数据，这条是刻意的（页面不该有读本地库的能力）。 */

export function buildUsageBarScript(): string {
  return String.raw`(() => {
  if (window.top && window.top !== window) return;                 // 只装在主框架
  if (window.__dianaUsageBar && document.getElementById('diana-usage-bar')) return;
  window.__dianaUsageBar = true;
  var MY_GEN = (window.__dianaUsageGen = (window.__dianaUsageGen || 0) + 1);
  function stale() { return MY_GEN !== window.__dianaUsageGen; }

  var STYLE_ID = 'diana-zcode-runtime-style';
  var SHOW_KEY = 'dianaskin.usage.show';
  var ITEMS = ['ctx', 'turn', 'win', 'tools', 'today', 'sub'];

  /* ---------- 样式（配色吃主题 token，带 fallback） ---------- */
  var CSS =
    '#diana-usage-bar{position:fixed;display:none;font:13px/1 Consolas,"Cascadia Mono",Menlo,"Microsoft YaHei UI","Microsoft YaHei",monospace;' +
    'font-variant-numeric:tabular-nums;color:var(--diana-zcode-ink,#e8eef5);background:none;border:none;box-shadow:none;padding:0;' +
    'user-select:none;white-space:nowrap;z-index:50;align-items:center;gap:2px}' +
    '#diana-usage-bar .du-main{overflow:hidden;min-width:0;flex:1 1 auto;display:flex;align-items:center;justify-content:center;gap:1px}' +
    '.dit{display:flex;align-items:center;gap:4px;padding:2px 6px;border-radius:8px;flex:0 0 auto;transition:background-color .12s}' +
    '.dit:hover{background:color-mix(in srgb,var(--diana-zcode-accent,#76bde2) 14%,transparent)}' +
    '.dsep{width:1px;height:15px;background:color-mix(in srgb,var(--diana-zcode-ink,#e8eef5) 16%,transparent);flex:0 0 auto;margin:0 1px}' +
    '.dk{color:color-mix(in srgb,var(--diana-zcode-muted,#9aacbd) 86%,transparent)}' +
    '.dv{color:color-mix(in srgb,var(--diana-zcode-line-a,var(--diana-zcode-ink)) 92%,white);font-weight:600}' +
    '.dpct{font-weight:700}' +
    '.dok{color:var(--diana-zcode-line-coral,#63b1b6)}' +
    '.dwarm{color:#d9a24a}.dhot{color:#ff6b57}' +
    '@keyframes duexc{0%,100%{opacity:1}50%{opacity:.35}}' +
    '.dexc{color:#ff6b57;text-shadow:0 0 8px rgba(255,107,87,.45);animation:duexc 1.1s infinite}' +
    '.dbtn{cursor:pointer;padding:2px 6px;border-radius:8px;color:var(--diana-zcode-muted,#9aacbd);opacity:.8}' +
    '.dbtn:hover{opacity:1;background:color-mix(in srgb,var(--diana-zcode-accent,#76bde2) 14%,transparent)}' +
    '.dico{width:12px;height:12px;flex:0 0 auto;opacity:.75}' +
    '.deb{background:color-mix(in srgb,#ff6b57 16%,transparent);color:#ff8a73;border-radius:999px;padding:0 6px;line-height:16px;font-weight:600}' +
    '.dcbar{display:inline-block;width:46px;height:5px;border-radius:999px;background:color-mix(in srgb,var(--diana-zcode-ink,#e8eef5) 14%,transparent);overflow:hidden}' +
    '.dcbar>i{display:block;height:100%;border-radius:999px;background:currentColor}' +
    '@keyframes dupulse{0%,100%{opacity:1}50%{opacity:.2}}' +
    '.ddot{animation:dupulse 1.6s infinite;color:var(--diana-zcode-accent,#76bde2)}' +
    '.dpanel{position:absolute;bottom:calc(100% + 10px);left:0;display:none;flex-direction:column;gap:3px;' +
    'background:color-mix(in srgb,var(--diana-zcode-panel,#1f2a33) 94%,transparent);backdrop-filter:blur(18px) saturate(108%);' +
    'border:1px solid color-mix(in srgb,var(--diana-zcode-accent,#76bde2) 30%,transparent);border-radius:12px;padding:10px 12px;' +
    'min-width:250px;max-height:72vh;overflow:auto;color:var(--diana-zcode-ink,#e8eef5);font:13px/1.6 Consolas,Menlo,monospace;' +
    'box-shadow:0 12px 32px rgb(0 0 0 / 42%);z-index:2147483647}' +
    '.dpanel.open{display:flex}' +
    '.dpanel label{display:flex;align-items:center;gap:8px;cursor:pointer;padding:2px 0}' +
    '.dpanel label:hover{color:color-mix(in srgb,var(--diana-zcode-accent,#76bde2) 80%,var(--diana-zcode-ink,#e8eef5))}' +
    '#diana-usage-tip{position:fixed;display:none;background:color-mix(in srgb,var(--diana-zcode-panel,#1f2a33) 96%,transparent);' +
    'backdrop-filter:blur(16px);border:1px solid color-mix(in srgb,var(--diana-zcode-accent,#76bde2) 30%,transparent);border-radius:10px;' +
    'padding:8px 12px;font:13px/1.6 Consolas,Menlo,monospace;white-space:pre-line;z-index:2147483646;max-width:560px;' +
    'color:var(--diana-zcode-ink,#e8eef5);box-shadow:0 10px 28px rgb(0 0 0 / 40%)}' +
    '#diana-usage-exc{position:fixed;display:none;max-width:470px;z-index:2147483647;' +
    'background:color-mix(in srgb,#ff2d55 12%,var(--diana-zcode-panel,#1f2a33));border:1px solid color-mix(in srgb,#ff2d55 40%,transparent);' +
    'border-radius:12px;padding:12px 15px;font:13px/1.7 Consolas,Menlo,monospace;color:var(--diana-zcode-ink,#e8eef5)}' +
    '@media (prefers-reduced-motion:reduce){.dexc,.ddot{animation:none}.dit,.dbtn{transition:none}}';

  /* ---------- DOM ---------- */
  var bar = document.createElement('div');
  bar.id = 'diana-usage-bar';
  var style = document.createElement('style');
  style.textContent = CSS;
  bar.appendChild(style);
  var main = document.createElement('span');
  main.className = 'du-main';
  bar.appendChild(main);
  var gear = document.createElement('span');
  gear.className = 'dbtn';
  gear.textContent = '⚙';
  gear.title = '状态条显示项';
  bar.appendChild(gear);
  var panel = document.createElement('div');
  panel.className = 'dpanel';
  bar.appendChild(panel);
  document.body.appendChild(bar);

  var tip = document.createElement('div');
  tip.id = 'diana-usage-tip';
  document.body.appendChild(tip);

  var exc = document.createElement('div');
  exc.id = 'diana-usage-exc';
  exc.innerHTML = '<div style="font-weight:700;margin-bottom:6px">⚠ 上下文超限</div>' +
    '<div class="du-xb-step">上下文已被压缩或截断，本轮的早期内容可能丢失。</div>' +
    '<div class="du-xb-step">建议：新开一个会话继续，或先让它总结要点再往下做。</div>' +
    '<div style="opacity:.7;margin-top:6px">会话 <span class="du-exc-sid"></span></div>';
  document.body.appendChild(exc);

  /* ---------- 显示项开关 ---------- */
  function readShow() {
    var out = {};
    ITEMS.forEach(function (k) { out[k] = true; });
    try {
      var raw = localStorage.getItem(SHOW_KEY);
      if (raw) { var parsed = JSON.parse(raw); ITEMS.forEach(function (k) { if (parsed && k in parsed) out[k] = !!parsed[k]; }); }
    } catch (e) { }
    return out;
  }
  var show = readShow();
  ITEMS.forEach(function (k) {
    var label = document.createElement('label');
    var box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = show[k];
    box.dataset.k = k;
    box.addEventListener('change', function () {
      if (stale()) return;
      show[k] = box.checked;
      try { localStorage.setItem(SHOW_KEY, JSON.stringify(show)); } catch (e) { }
      render(state.data);
    });
    var names = { ctx: '上下文占用', turn: '本回合', win: '本会话', tools: '工具', today: '今日', sub: '子代理' };
    label.appendChild(box);
    label.appendChild(document.createTextNode(names[k] || k));
    panel.appendChild(label);
  });
  gear.addEventListener('click', function () { if (!stale()) panel.classList.toggle('open'); });
  document.addEventListener('click', function (e) {
    if (stale()) return;
    if (!bar.contains(e.target)) panel.classList.remove('open');
  }, true);

  /* ---------- 格式化 ---------- */
  function fmt(n) {
    n = Number(n) || 0;
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return String(Math.round(n));
  }
  function sec(ms) { return ms > 0 ? (ms / 1000).toFixed(1) + 's' : '–'; }
  function pct(part, whole) { return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0; }
  function excActive(s) { return !!s && s.ctxExc > 0 && s.ctxExc >= (s.lastAt || 0); }
  function cachePct(s) { return s && s.input > 0 ? Math.round((s.cacheRead / (s.input + s.cacheRead)) * 100) : null; }

  /* ---------- 会话挑选：侧栏选中优先 ---------- */
  function activeSidFromSidebar() {
    var el = document.querySelector('li[data-testid^=task-item-].bg-selected');
    if (!el) return '';
    var m = (el.getAttribute('data-testid') || '').match(/^task-item-(sess_[A-Za-z0-9_-]+)$/);
    return m ? m[1] : '';
  }
  function pickCurrent(d) {
    var sid = activeSidFromSidebar();
    if (sid) {
      var hit = (d.recent || []).filter(function (s) { return s.sid === sid; })[0];
      if (hit) return { sess: hit, want: sid };
      return { sess: null, want: sid };
    }
    // 侧栏拿不到（非会话页）：退化为"池内最近活跃"
    var pool = d.recent || [];
    if (!pool.length) return { sess: d.session || null, want: '' };
    var best = pool[0];
    pool.forEach(function (s) { if ((s.lastAt || 0) > (best.lastAt || 0)) best = s; });
    return { sess: best, want: '' };
  }

  /* ---------- 原生上下文窗口：读输入框卡片上的"总量 N" ---------- */
  var nativeCtx = 0, nativeCtxAt = 0;
  function readNativeCtx(card) {
    if (!card) return 0;
    if (nativeCtx && Date.now() - nativeCtxAt < 5000) return nativeCtx;
    var nodes = card.querySelectorAll('button,[aria-label],[title]');
    for (var i = 0; i < nodes.length; i++) {
      var text = (nodes[i].getAttribute('aria-label') || '') + ' ' + (nodes[i].getAttribute('title') || '') + ' ' + (nodes[i].textContent || '');
      var m = text.match(/总量\s*([\d,，]+)/);
      if (m) {
        var v = parseInt(m[1].replace(/[,，]/g, ''), 10);
        if (v > 0) { nativeCtx = v; nativeCtxAt = Date.now(); return v; }
      }
    }
    return nativeCtx;
  }

  /* ---------- 渲染 ---------- */
  var state = { data: null, pickedSid: '', excGone: false };
  var lastHtml = '';
  var ICON = {
    bolt: '<svg class="dico" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4.5 13H11l-1 9L19 10h-6.5z"/></svg>',
    clock: '<svg class="dico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    stack: '<svg class="dico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/></svg>',
    tool: '<svg class="dico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a4 4 0 105.4 5.4L21 12l-9 9-3-3 9-9z"/></svg>',
    sun: '<svg class="dico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/></svg>',
    branch: '<svg class="dico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="12" r="2"/><path d="M6 8v8M8 6h6a4 4 0 014 4v0"/></svg>'
  };
  function item(icon, body, tipText) {
    var el = document.createElement('span');
    el.className = 'dit';
    el.innerHTML = icon + body;
    if (tipText) el.__tip = tipText;
    return el;
  }
  function html(p) {
    var s = p.session || {};
    var today = p.today || {};
    var parts = [];
    var last = s.last || {};
    var lt = s.lastTurn || {};
    var subs = s.sub || {};
    var tls = s.tools || {};

    // tps：始终显示
    var tps = Number(last.tps) || 0;
    var cls = tps >= 70 ? 'dok' : tps >= 40 ? 'dwarm' : tps > 0 ? 'dhot' : 'dk';
    parts.push(item(ICON.bolt, '<span class="dv ' + cls + '">' + (tps > 0 ? tps.toFixed(1) : '–') + '</span><span class="dk">t/s</span>',
      '生成速度 ' + (tps > 0 ? tps.toFixed(1) : '–') + ' t/s\n= output ÷ (duration − 首字延迟)\n模型 ' + (last.model || '–') +
      (last.ttftMs ? '\n首字 ' + sec(last.ttftMs) : '') + '\n阈值 绿≥70 黄≥40 红<40'));

    if (show.ctx) {
      var win = readNativeCtx(cardRef) || s.contextWindow || 0;
      var ctx = Number(s.ctx) || 0;
      if (!s.sid) parts.push(item(ICON.stack, '<span class="dk">ctx</span><span class="dv">…</span>', '等待数据…'));
      else if (win > 0 && ctx > 0 && ctx <= win) {
        var used = pct(ctx, win);
        var lvl = win >= 1e6 ? (used >= 60 ? 'dhot' : used >= 40 ? 'dwarm' : 'dok') : (used >= 85 ? 'dhot' : used >= 70 ? 'dwarm' : 'dok');
        parts.push(item(ICON.stack,
          '<span class="dcbar"><i style="width:' + Math.min(100, used) + '%"></i></span><span class="dpct ' + lvl + '">' + used.toFixed(1) + '%</span>',
          '上下文占用 ' + fmt(ctx) + ' / ' + fmt(win) + '（' + used.toFixed(1) + '%）\n' +
          '= 最后一次完成请求的 input_tokens\n窗口来源：' + (readNativeCtx(cardRef) ? '原生 UI' : (s.contextAuto ? '模型目录' : '兜底常量')) +
          (excActive(s) ? '\n⚠ 曾出现上下文超限' : '')));
      } else {
        // 窗口未知（或兜底值比实测占用还小）：只报占用，不编造百分比
        parts.push(item(ICON.stack, '<span class="dv ' + (excActive(s) ? 'dexc' : '') + '">' + fmt(ctx) + '</span><span class="dk">ctx</span>',
          '上下文占用 ' + fmt(ctx) + ' tokens\n（窗口大小未知：原生 UI 未读到"总量"，模型目录里也没有这个 id）' +
          (excActive(s) ? '\n⚠ 曾出现上下文超限' : '')));
      }
    }

    if (show.turn && lt.requests) {
      var cp = cachePct(lt);
      parts.push(item(ICON.clock,
        '<span class="dv">' + fmt(lt.total) + '</span>' + (cp !== null ? '<span class="dk">' + cp + '%</span>' : '') +
        '<span class="dk">' + lt.requests + '次</span>' + (lt.durationMs ? '<span class="dk">' + sec(lt.durationMs) + '</span>' : ''),
        '本回合\n请求 ' + lt.requests + ' 次' + (lt.retries ? '（重试 ' + lt.retries + '）' : '') +
        '\ninput ' + fmt(lt.input) + ' · output ' + fmt(lt.output) +
        '\ncache 读 ' + fmt(lt.cacheRead) + ' · 写 ' + fmt(lt.cacheWrite) +
        (lt.reasoning ? '\n推理 ' + fmt(lt.reasoning) : '') +
        '\n合计 ' + fmt(lt.total) + ' · 用时 ' + sec(lt.durationMs) + (lt.ttftMs ? ' · 首字 ' + sec(lt.ttftMs) : '') +
        (lt.toolCalls ? '\n工具 ' + lt.toolCalls + ' 次' + (lt.toolErrors ? '（错误 ' + lt.toolErrors + '）' : '') : '')));
    }

    if (show.win && s.requests) {
      var cp2 = cachePct(s);
      parts.push(item(ICON.stack,
        '<span class="dv">' + fmt(s.total) + '</span>' + (cp2 !== null ? '<span class="dk">' + cp2 + '%</span>' : '') +
        '<span class="dk">' + s.turns + '轮</span><span class="dk">' + s.requests + '次</span>',
        '本会话 ' + (s.title || s.sid) + '\n轮次 ' + s.turns + ' · 请求 ' + s.requests + ' 次' +
        '\ninput ' + fmt(s.input) + ' · output ' + fmt(s.output) +
        '\ncache 读 ' + fmt(s.cacheRead) + ' · 写 ' + fmt(s.cacheWrite) +
        (s.reasoning ? '\n推理 ' + fmt(s.reasoning) : '') +
        '\n合计 ' + fmt(s.total) + (s.code && s.code.add !== null ? '\n代码 +' + s.code.add + ' −' + s.code.del + '（' + s.code.files + ' 文件）' : '') +
        '\n最后活动 ' + (s.updated || '–')));
    }

    if (show.tools && tls.total) {
      parts.push(item(ICON.tool, '<span class="dv">' + tls.total + '</span><span class="dk">次</span>' +
        (tls.errors ? '<span class="deb">' + tls.errors + '</span>' : ''),
        '工具调用 ' + tls.total + ' 次' + (tls.errors ? '，错误 ' + tls.errors + ' 次' : '') + '\n' +
        (tls.list || []).slice(0, 12).map(function (t) {
          return '  ' + t.name + ' ' + t.count + '次 · ' + sec(t.durationMs) + (t.errors ? ' · ' + t.errors + '错误' : '');
        }).join('\n')));
    }

    if (show.today && today.requests) {
      parts.push(item(ICON.sun, '<span class="dv">' + fmt(today.total) + '</span><span class="dk">今日</span>' +
        '<span class="dk">' + today.requests + '次</span>',
        '今日（本地零点起）\n请求 ' + today.requests + ' 次' +
        '\ninput ' + fmt(today.input) + ' · output ' + fmt(today.output) +
        '\ncache 读 ' + fmt(today.cacheRead) + ' · 写 ' + fmt(today.cacheWrite) +
        (today.reasoning ? '\n推理 ' + fmt(today.reasoning) : '') +
        '\n合计 ' + fmt(today.total) + (today.retries ? '\n重试 ' + today.retries : '')));
    }

    if (show.sub && subs.requests) {
      parts.push(item(ICON.branch, '<span class="dv">' + fmt(subs.total) + '</span><span class="dk">子</span>' +
        (subs.active ? '<span class="ddot">●</span>' : ''),
        '子代理 ' + (subs.list || []).length + ' 个 · 请求 ' + subs.requests + ' 次' +
        '\n合计 ' + fmt(subs.total) + '（in ' + fmt(subs.input) + ' / out ' + fmt(subs.output) + '）\n' +
        (subs.list || []).slice(0, 10).map(function (x) {
          return '  ' + String(x.title || x.sid).slice(0, 28) + ' · ' + fmt(x.total) + (x.active ? ' ●' : '');
        }).join('\n')));
    }

    if (!parts.length) parts.push(item('', '<span class="dk">等待数据…</span>', '用量泵还没推数据过来'));
    return parts;
  }

  function render(d) {
    if (!d) return;
    state.data = d;
    var pc = pickCurrent(d);
    var s = pc.sess;
    state.pickedSid = s ? s.sid : '';
    window.__dianaUsageWant = (pc && pc.want) || state.pickedSid || '';
    try {
      document.dispatchEvent(new CustomEvent('diana-usage', { detail: { sid: state.pickedSid, live: (s && s.live) || null } }));
    } catch (e) { }
    var parts = html({ session: s, today: d.today || {} });
    var sig = parts.map(function (p) { return p.innerHTML; }).join('|') + '#' + state.pickedSid;
    if (sig !== lastHtml) {
      lastHtml = sig;
      main.innerHTML = '';
      parts.forEach(function (p, i) {
        if (i) { var sep = document.createElement('span'); sep.className = 'dsep'; main.appendChild(sep); }
        main.appendChild(p);
      });
    }
    state.excActive = excActive(s);
  }
  window.__dianaUsageUpdate = function (d) { if (stale()) return; try { render(d); } catch (e) { } };

  /* ---------- 定位：贴着输入框卡片 ---------- */
  var cardRef = null;
  function reallyVisible(el) {
    if (!el) return false;
    try { if (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true, opacityProperty: true, contentVisibilityAuto: true })) return false; } catch (e) { }
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  function themeOn() {
    var el = document.getElementById(STYLE_ID);
    return !!(el && el.textContent && el.textContent.length > 100);
  }
  function findComposer() {
    var nodes = document.querySelectorAll('textarea,[contenteditable=true]');
    var best = null;
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!reallyVisible(el)) continue;
      var r = el.getBoundingClientRect();
      if (r.top < innerHeight * 0.55) continue;                 // 输入框在视口下半
      if (!best || r.bottom > best.getBoundingClientRect().bottom) best = el;
    }
    return best;
  }
  function findCard(composer) {
    if (!composer) return null;
    var region = composer.closest('.chat-composer-region');
    if (region && reallyVisible(region)) return region;
    var el = composer, depth = 0;
    while (el && depth++ < 6) {
      var st = getComputedStyle(el);
      if (st.borderTopWidth !== '0px' || st.backgroundColor !== 'rgba(0, 0, 0, 0)') return el;
      el = el.parentElement;
    }
    return composer.parentElement;
  }

  var lastRect = null, hiddenSince = 0;
  function track() {
    if (stale()) return;
    requestAnimationFrame(track);
    try {
      if (!themeOn()) { bar.style.display = 'none'; tip.style.display = 'none'; exc.style.display = 'none'; return; }
      var composer = findComposer();
      cardRef = findCard(composer);
      if (!cardRef) { bar.style.display = 'none'; tip.style.display = 'none'; exc.style.display = 'none'; return; }
      var r = cardRef.getBoundingClientRect();
      /* 命中测试取**卡片中心**：若该点被卡片之外的元素占据，说明卡片被隐藏层盖住（ZCode 的
       * 工作区保活机制会在设置页留下不可见的同构 DOM）。取卡片"上方几像素"是错的 ——
       * 那里本来就是消息列表，会把它误判成被盖住而永久隐藏。 */
      var hit = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
      var covered = Boolean(hit && !cardRef.contains(hit) && !bar.contains(hit));
      if (covered) {
        if (!hiddenSince) hiddenSince = Date.now();
        if (Date.now() - hiddenSince > 400) { bar.style.display = 'none'; tip.style.display = 'none'; exc.style.display = 'none'; return; }
      } else hiddenSince = 0;

      bar.style.display = 'flex';
      bar.style.left = Math.round(r.left) + 'px';
      bar.style.width = Math.max(60, Math.round(r.width)) + 'px';
      /* 贴在**输入框卡片下方、窗口最底部**（与来源项目一致，也是用户看惯的位置）。
       * 放卡片上方会压住输入框底部那行（模型选择器）。 */
      bar.style.top = Math.round(Math.min(innerHeight - 22, r.bottom + 1)) + 'px';
      var m = bar.querySelector('.du-main');
      if (m) m.style.justifyContent = m.scrollWidth > m.clientWidth + 1 ? 'flex-start' : 'center';
      lastRect = r;

      if (state.excActive && !state.excGone) {
        exc.style.display = 'block';
        exc.style.left = Math.round(r.left) + 'px';
        exc.style.top = Math.round(Math.max(8, r.top - 150)) + 'px';
        var sidEl = exc.querySelector('.du-exc-sid');
        if (sidEl) sidEl.textContent = state.pickedSid || '–';
      } else exc.style.display = 'none';
    } catch (e) { }
  }
  requestAnimationFrame(track);

  /* 悬浮提示 */
  var tipEl = null;
  document.addEventListener('mousemove', function (e) {
    if (stale()) return;
    var el = e.target && e.target.closest ? e.target.closest('#diana-usage-bar .dit') : null;
    if (!el || !el.__tip) { tip.style.display = 'none'; tipEl = null; return; }
    if (tipEl !== el) {
      tipEl = el;
      tip.textContent = el.__tip;
      tip.style.display = 'block';
    }
    var tr = tip.getBoundingClientRect();
    tip.style.left = Math.round(Math.min(innerWidth - tr.width - 8, Math.max(8, e.clientX))) + 'px';
    tip.style.top = Math.round(Math.max(8, e.clientY - tr.height - 12)) + 'px';
  }, true);

  /* 600ms 轻量维护：重挂被移除的节点、按需重渲染 */
  setInterval(function () {
    if (stale()) return;
    try {
      if (!document.body.contains(bar)) document.body.appendChild(bar);
      if (!document.body.contains(tip)) document.body.appendChild(tip);
      if (!document.body.contains(exc)) document.body.appendChild(exc);
      if (state.data) render(state.data);
      else window.__dianaUsageWant = activeSidFromSidebar();
    } catch (e) { }
  }, 600);
})()`;
}
