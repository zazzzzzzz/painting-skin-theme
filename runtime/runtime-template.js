/* 页面端运行时（引擎级，**全项目一份**）。
 *
 * 注入器读它、把里面唯一的那个 payload 占位符（就在下面那行 atob(...) 里）换成 payload
 * —— adapterVersion / requestedTheme / css / assets —— 再整段作为**一个表达式**经 CDP
 * Runtime.evaluate 送进目标页面执行。它负责：按宿主极性补齐 theme-zai-*、注入样式表与素材变量、
 * 几何定位工作区与前景、挂美术层的 11 个节点、适配消息导轨，并暴露
 * __DIANA_ZCODE_THEME__.disable() 供撤下时完整回退。
 *
 * 注意：**本文件里那个占位符字面量只能出现一次**（就是被替换的那处）。别在注释里原样写它 ——
 * 注入器是"替换一处"，写在注释里会把替换吃掉、真正的 atob 参数留着占位符，注入必然抛错。
 *
 * 它与主题无关（命名空间、id、类名都是与素材角色的硬约定；颜色与素材分别由主题 CSS、清单里的 assets 决定），
 * 所以放在这里，而不是每个 themes/<id>/skin/ 各存一份 —— 此前三份逐字相同的副本，改一次引擎要同步三处。
 * 主题若确实需要自己的运行时，在 theme.json 里写 `skin.runtime: "skin/xxx.js"` 覆盖本文件即可
 * （仍按主题目录做越界校验，见 src/theme-store.ts）。
 *
 * 文中几处「本项目对 Diana 原版的偏离」注释记录了踩过的坑（导轨数量门槛、工作区判据的宽度门槛与可见性、
 * 排除美术层自身），改这里之前请连同 .verify/ 下对应的复现脚本一起读。 */
(() => {
  const bytes = Uint8Array.from(atob("__DIANA_PAYLOAD_BASE64__"), (character) => character.charCodeAt(0));
  const payload = JSON.parse(new TextDecoder().decode(bytes));
  const root = document.documentElement;
  const runtimeId = "diana-zcode-runtime-style";
  const chromeId = "diana-zcode-chrome";
  const previous = globalThis.__DIANA_ZCODE_THEME__;
  if (previous && typeof previous.disable === "function") previous.disable();

  const previousTheme = {
    dark: root.classList.contains("theme-zai-dark"),
    light: root.classList.contains("theme-zai-light")
  };
  /* 本项目对 Diana 原版的一处偏离：theme.css 的全部 token（颜色、立绘、导轨）都挂在
   * theme-zai-dark/light 选择器下，而 ZCode 3.12 实测给 <html> 打的是 dark/light，
   * theme-zai-* 可能整体缺席（或被别的注入器留下陈旧值）。此时 token 全部未定义，
   * 表现为美术层与导轨的 background 解析失败即透明 —— 复核只看节点数，查不出来。
   * 因此这里在 auto 模式下按宿主实际极性补齐/纠正 theme-zai-*，撤下时按 previousTheme 还原。 */
  const hostPolarity = root.classList.contains("dark") || root.classList.contains("theme-zai-dark")
    ? "dark"
    : root.classList.contains("light") || root.classList.contains("theme-zai-light")
      ? "light"
      : (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
  if (payload.requestedTheme === "dark" || payload.requestedTheme === "light") {
    root.classList.toggle("theme-zai-dark", payload.requestedTheme === "dark");
    root.classList.toggle("theme-zai-light", payload.requestedTheme === "light");
  } else {
    root.classList.toggle("theme-zai-dark", hostPolarity === "dark");
    root.classList.toggle("theme-zai-light", hostPolarity === "light");
  }

  const style = document.createElement("style");
  style.id = runtimeId;
  style.dataset.dianaAdapter = payload.adapterVersion;
  const assetVariables = `
html.diana-zcode-host {
  --diana-zcode-image-character-dark: url("${payload.assets.characterDark}");
  --diana-zcode-image-character-light: url("${payload.assets.characterLight}");
  --diana-zcode-image-doodle: url("${payload.assets.doodle}");
  --diana-zcode-image-upper: url("${payload.assets.upper}");
  --diana-zcode-image-corner: url("${payload.assets.corner}");
  --diana-zcode-image-star: url("${payload.assets.star}");
  --diana-zcode-image-candy-wrapped: url("${payload.assets.candyWrapped}");
  --diana-zcode-image-candy-lollipop: url("${payload.assets.candyLollipop}");
  --diana-zcode-image-acao-heart: url("${payload.assets.acaoHeart}");
  --diana-zcode-image-acao-cheer: url("${payload.assets.acaoCheer}");
}`;
  style.textContent = `${payload.css}\n${assetVariables}`;
  document.head.append(style);
  root.classList.add("diana-zcode-host");

  const railProfiles = {
    sparse: {
      max: 32,
      pattern: [.26, .35, .29, .46, .31, .39, .25, .43, .33, .28, .48, .30, .37, .27, .41, .34, .29, .45, .32, .38, .25, .44, .30],
      majors: [.56, .62, .53, .59, .64, .55]
    },
    balanced: {
      max: 96,
      pattern: [.24, .33, .27, .41, .30, .36, .25, .39, .32, .28, .43, .29, .35, .26, .40, .31, .27, .42, .30, .37, .24, .38, .28, .34, .26, .41, .29],
      majors: [.49, .55, .47, .52, .57, .50, .54]
    },
    dense: {
      max: Number.POSITIVE_INFINITY,
      pattern: [.23, .31, .26, .36, .28, .33, .24, .35, .29, .27, .37, .25, .32, .28, .34, .24, .36, .30, .26, .33, .23, .35, .27, .31, .25, .34, .29, .24, .32],
      majors: [.42, .47, .40, .45, .43, .48, .41, .46, .44]
    }
  };

  const state = {
    adapterVersion: payload.adapterVersion,
    observer: null,
    resizeObserver: null,
    scheduled: false,
    workspace: null,
    foreground: null,
    rail: null,
    railStats: null,
    previousPosition: "",
    previousIsolation: "",
    previousForegroundPosition: "",
    previousForegroundZIndex: "",
    railRetries: [],
    previousTheme
  };

  function ancestors(element) {
    const list = [];
    let current = element;
    while (current && current !== document.body) {
      list.push(current);
      current = current.parentElement;
    }
    return list;
  }

  /* 本项目对 Diana 原版的第三处偏离：判据必须叠加**可见性**，只看 rect 会认下"隐藏但仍占满窗"的容器。
   *
   * 设置页这类整页路由**不卸载会话 DOM**（保活），应用是用一个 `div.h-full.opacity-0` 路由过渡层把它
   * 压到不可见的 —— rect、display、visibility 全都照旧正常，只有 opacity 为 0。
   * 于是"设置页里点开界面语言下拉框"时（Radix 开合会改 DOM，触发我们重挂）：
   *   输入框那条路径取到的仍是保活会话里的 textarea → 它的祖先（隐藏的会话容器）矩形满窗 → 判据通过
   *   → 美术层被重挂进那个不可见的容器 → 立绘与涂鸦整层消失（chrome 还在文档里、checkVisibility=false）。
   * 实测见 .verify/settings-select2.js（②可见 → ③重挂进隐藏容器 → ④关掉下拉框又挂回来）。
   * 宠物那边早就用了同一道判断（保活输入框那个坑），这里补上；三个选项一起用才算得准：
   * opacityProperty 抓的就是这个 opacity:0 的过渡层，contentVisibilityAuto 抓 content-visibility 保活。 */
  function qualifies(element) {
    if (element.closest && element.closest("#" + chromeId)) return false;
    try {
      if (typeof element.checkVisibility === "function"
        && !element.checkVisibility({ visibilityProperty: true, opacityProperty: true, contentVisibilityAuto: true })) return false;
    } catch (error) { /* 老引擎没有这个方法：退回只看 rect，与改动前一致 */ }
    const rect = element.getBoundingClientRect();
    return rect.left >= 180
      && rect.left <= Math.min(380, innerWidth * .36)
      && rect.top >= 30
      && rect.top <= 90
      && rect.width >= innerWidth * .3
      && rect.height >= innerHeight * .68;
  }

  function findWorkspace() {
    const rootElement = document.getElementById("root");
    if (!rootElement) return null;
    const textarea = rootElement.querySelector("textarea");
    if (textarea) {
      const candidate = ancestors(textarea).find(qualifies);
      if (candidate) return candidate;
    }
    const point = document.elementFromPoint(Math.max(0, innerWidth - 8), Math.max(0, innerHeight - 8));
    const pointCandidate = point ? ancestors(point).find(qualifies) : null;
    if (pointCandidate) return pointCandidate;
    const all = [...rootElement.querySelectorAll("div, main, section")].filter(qualifies);
    return all.sort((left, right) => {
      const a = left.getBoundingClientRect();
      const b = right.getBoundingClientRect();
      return (a.width * a.height) - (b.width * b.height);
    })[0] || null;
  }

  function directChildUnder(ancestor, element) {
    let current = element;
    while (current?.parentElement && current.parentElement !== ancestor) {
      current = current.parentElement;
    }
    return current?.parentElement === ancestor ? current : null;
  }

  function findForeground(workspace) {
    const preferredTarget = workspace.querySelector(
      "textarea, [contenteditable='true'], input:not([type='hidden']), button"
    );
    const preferredChild = preferredTarget ? directChildUnder(workspace, preferredTarget) : null;
    if (preferredChild && preferredChild.id !== chromeId) return preferredChild;
    const workspaceRect = workspace.getBoundingClientRect();
    return [...workspace.children]
      .filter((child) => child.id !== chromeId)
      .map((child) => ({ child, rect: child.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width >= workspaceRect.width * .72 && rect.height >= workspaceRect.height * .72)
      .sort((left, right) => (right.rect.width * right.rect.height) - (left.rect.width * left.rect.height))[0]?.child || null;
  }

  function railButtonsFor(element) {
    const direct = [...element.children].filter((child) => child.tagName === "BUTTON");
    return direct.length >= 2 ? direct : [...element.querySelectorAll("button")];
  }

  /* 本项目对 Diana 原版的一处偏离：ZCode 的导航轨是"每个用户提问一项"，真实会话常常不足
   * 4 项（Diana 原版要求 >= 4），导致导轨增强在真机恒不挂载。这里把数量门槛降到 2，
   * 同时把刻度形状一致性从">= 80% 通过"收紧为"全部通过"，以补偿放宽后增加的误命中面。 */
  function findMessageRail(workspace) {
    const workspaceRect = workspace.getBoundingClientRect();
    return [...document.querySelectorAll("nav, aside, div")]
      .map((element) => ({
        element,
        rect: element.getBoundingClientRect(),
        buttons: railButtonsFor(element)
      }))
      .filter(({ rect, buttons }) => buttons.length >= 2
        && rect.left >= workspaceRect.left
        && rect.left <= workspaceRect.left + 96
        && rect.width >= 28
        && rect.width <= 56
        && rect.height >= Math.min(180, innerHeight * .3)
        && buttons.filter((button) => {
          const buttonRect = button.getBoundingClientRect();
          const line = button.querySelector(":scope > span");
          const lineRect = line?.getBoundingClientRect();
          return buttonRect.width >= 28
            && buttonRect.width <= 56
            && buttonRect.height >= 6
            && buttonRect.height <= 18
            && lineRect
            && lineRect.width >= 4
            && lineRect.width <= 20
            && lineRect.height > 0
            && lineRect.height <= 4;
        }).length === buttons.length)
      .sort((left, right) => Math.abs(left.rect.left - (workspaceRect.left + 12))
        - Math.abs(right.rect.left - (workspaceRect.left + 12))
        || Math.abs(left.rect.width - 36) - Math.abs(right.rect.width - 36)
        || right.buttons.length - left.buttons.length)[0]?.element || null;
  }

  function railProfileFor(count) {
    return Object.entries(railProfiles).find(([, profile]) => count <= profile.max)
      || ["dense", railProfiles.dense];
  }

  function railScaleAt(index, profile) {
    const block = Math.floor(index / profile.pattern.length);
    const slot = (index + block * 7) % profile.pattern.length;
    return index % 5 === 0
      ? profile.majors[Math.floor(index / 5) % profile.majors.length]
      : profile.pattern[slot];
  }

  function detachRail() {
    if (!state.rail) return;
    state.rail.classList.remove("diana-zcode-message-rail");
    delete state.rail.dataset.dianaRailProfile;
    for (const button of railButtonsFor(state.rail)) {
      button.style.removeProperty("--diana-art-scale");
      delete button.dataset.dianaRailMajor;
      delete button.dataset.dianaViewportCurrent;
    }
    state.rail = null;
    state.railStats = null;
  }

  function updateRail() {
    if (!state.workspace?.isConnected) return null;
    const retainedRail = state.rail?.isConnected
      && railButtonsFor(state.rail).length >= 2
      && state.rail.getBoundingClientRect().width > 0
      ? state.rail
      : null;
    const rail = retainedRail || findMessageRail(state.workspace);
    if (state.rail && state.rail !== rail) detachRail();
    if (!rail) return null;

    state.rail = rail;
    rail.classList.add("diana-zcode-message-rail");
    const buttons = railButtonsFor(rail);
    const [profileName, profile] = railProfileFor(buttons.length);
    rail.dataset.dianaRailProfile = profileName;
    const current = buttons.find((button) => button.getAttribute("aria-current") === "location")
      || buttons.find((button) => button.dataset.active === "true")
      || buttons.at(-1);

    buttons.forEach((button, index) => {
      const scale = String(railScaleAt(index, profile));
      const major = String(index % 5 === 0);
      if (button.style.getPropertyValue("--diana-art-scale") !== scale) {
        button.style.setProperty("--diana-art-scale", scale);
      }
      if (button.dataset.dianaRailMajor !== major) button.dataset.dianaRailMajor = major;
      if (button === current) button.dataset.dianaViewportCurrent = "true";
      else delete button.dataset.dianaViewportCurrent;
    });

    state.railStats = {
      count: buttons.length,
      profile: profileName,
      majorCount: buttons.filter((button) => button.dataset.dianaRailMajor === "true").length,
      currentCount: buttons.filter((button) => button.dataset.dianaViewportCurrent === "true").length
    };
    return state.railStats;
  }

  function buildChrome() {
    const chrome = document.createElement("div");
    chrome.id = chromeId;
    chrome.setAttribute("aria-hidden", "true");
    chrome.dataset.dianaAdapter = payload.adapterVersion;
    for (const className of [
      "diana-zcode-corner-line",
      "diana-zcode-upper-line",
      "diana-zcode-doodle"
    ]) {
      const element = document.createElement("span");
      element.className = className;
      chrome.append(element);
    }
    const cluster = document.createElement("span");
    cluster.className = "diana-zcode-character-cluster";
    for (const className of [
      "diana-zcode-star diana-zcode-star-a",
      "diana-zcode-star diana-zcode-star-b",
      "diana-zcode-candy diana-zcode-candy-wrapped",
      "diana-zcode-candy diana-zcode-candy-lollipop",
      "diana-zcode-acao diana-zcode-acao-heart",
      "diana-zcode-acao diana-zcode-acao-cheer",
      "diana-zcode-character"
    ]) {
      const element = document.createElement("span");
      element.className = className;
      cluster.append(element);
    }
    chrome.append(cluster);
    return chrome;
  }

  function updateChromeGeometry() {
    const chrome = document.getElementById(chromeId);
    if (!chrome || !state.workspace?.isConnected) return;
    const rect = state.workspace.getBoundingClientRect();
    chrome.style.left = `${Math.round(rect.left)}px`;
    chrome.style.top = `${Math.round(rect.top)}px`;
    chrome.style.width = `${Math.round(rect.width)}px`;
    chrome.style.height = `${Math.round(rect.height)}px`;
  }

  function detachWorkspace() {
    detachRail();
    state.resizeObserver?.disconnect();
    state.resizeObserver = null;
    document.getElementById(chromeId)?.remove();
    if (state.foreground?.isConnected) {
      state.foreground.classList.remove("diana-zcode-foreground");
      state.foreground.style.position = state.previousForegroundPosition;
      state.foreground.style.zIndex = state.previousForegroundZIndex;
    }
    if (state.workspace?.isConnected) {
      state.workspace.classList.remove("diana-zcode-workspace");
      state.workspace.removeAttribute("data-diana-zcode-workspace");
      state.workspace.style.position = state.previousPosition;
      state.workspace.style.isolation = state.previousIsolation;
    }
    state.foreground = null;
    state.workspace = null;
  }

  function mount() {
    const workspace = findWorkspace();
    if (!workspace) return false;
    const foreground = findForeground(workspace);
    if (state.workspace === workspace
      && state.foreground === foreground
      && document.getElementById(chromeId)?.isConnected) {
      updateChromeGeometry();
      updateRail();
      return true;
    }
    detachWorkspace();
    state.workspace = workspace;
    state.foreground = foreground;
    state.previousPosition = workspace.style.position;
    state.previousIsolation = workspace.style.isolation;
    if (getComputedStyle(workspace).position === "static") workspace.style.position = "relative";
    workspace.style.isolation = "isolate";
    workspace.classList.add("diana-zcode-workspace");
    workspace.dataset.dianaZcodeWorkspace = "true";
    workspace.prepend(buildChrome());
    updateChromeGeometry();
    state.resizeObserver = new ResizeObserver(updateChromeGeometry);
    state.resizeObserver.observe(workspace);
    if (foreground) {
      state.previousForegroundPosition = foreground.style.position;
      state.previousForegroundZIndex = foreground.style.zIndex;
      if (getComputedStyle(foreground).position === "static") foreground.style.position = "relative";
      foreground.style.zIndex = "1";
      foreground.classList.add("diana-zcode-foreground");
    }
    updateRail();
    return true;
  }

  function scheduleMount() {
    if (state.scheduled) return;
    state.scheduled = true;
    requestAnimationFrame(() => {
      state.scheduled = false;
      mount();
    });
  }

  state.observer = new MutationObserver((mutations) => {
    const railStateChanged = state.rail?.isConnected && mutations.some((mutation) => (
      mutation.type === "attributes" && state.rail.contains(mutation.target)
    ));
    if (railStateChanged) updateRail();
    else scheduleMount();
  });
  state.observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["aria-current", "data-active"]
  });
  const mounted = mount();
  /* 本项目对 Diana 原版的一处偏离：导轨元素的渲染可能晚于首次 mount，而 mount 原本只在
   * mutation 之后重跑 —— 页面静止时导轨就一直不出现（复核会看到 rail: null）。
   * 这里做几次有界重试，disable() 里清掉。 */
  if (!state.rail) {
    for (const delay of [120, 400, 1200, 2600]) {
      state.railRetries.push(setTimeout(() => {
        if (globalThis.__DIANA_ZCODE_THEME__ === state) mount();
      }, delay));
    }
  }

  state.disable = () => {
    state.observer?.disconnect();
    for (const timer of state.railRetries) clearTimeout(timer);
    state.railRetries = [];
    detachWorkspace();
    document.getElementById(runtimeId)?.remove();
    root.classList.remove("diana-zcode-host");
    root.classList.toggle("theme-zai-dark", state.previousTheme.dark);
    root.classList.toggle("theme-zai-light", state.previousTheme.light);
    if (globalThis.__DIANA_ZCODE_THEME__ === state) delete globalThis.__DIANA_ZCODE_THEME__;
    return { disabled: true };
  };
  globalThis.__DIANA_ZCODE_THEME__ = state;

  const rect = state.workspace?.getBoundingClientRect();
  return {
    mounted,
    adapterVersion: payload.adapterVersion,
    rootTheme: root.classList.contains("theme-zai-light") ? "light" : "dark",
    rail: state.railStats,
    workspace: rect ? {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    } : null
  };
})()
