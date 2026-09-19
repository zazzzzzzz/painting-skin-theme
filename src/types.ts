/* 引擎层 · 共享类型 */

export interface RendererTarget {
  id?: string;
  type?: string;
  title?: string;
  url?: string;
  webSocketDebuggerUrl?: string;
}

export type SkinMode = 'auto' | 'dark' | 'light';

export interface ApplyResult {
  ok: boolean;
  port: number;
  mode: SkinMode;
  mounted: boolean;
  rootTheme: string | null;
  workspace: { left: number; top: number; width: number; height: number } | null;
  rail: { count: number; profile: string } | null;
  /** 复核项，全部 true 才算挂载成功 */
  checks: Record<string, boolean>;
  /** 失败原因是"目标应用没有带调试端口启动" —— 面板据此把主按钮换成"重启 ZCode 并注入"，
   *  而不是让用户自己去猜为什么注入不上去 */
  needsDebugPort?: boolean;
  /** 用量条与宠物：这两个是"功能"而非皮肤内容，独立注入，失败不影响皮肤本身 */
  extra?: {
    usageBar: {
      present: boolean;
      rendered: boolean;
      pickedSid: string;
      todayTotal: number;
      /** 首帧快照是否推出去了。Electron 里读库不可用（node:sqlite 缺失）时为 false，
       *  数据交给子进程泵推 —— 不是错误，是宿主 Node 版本的限制。 */
      snapshotPushed?: boolean;
    } | null;
    pet: { present: boolean; state: string; petId: string; visible: boolean } | null;
    error?: string;
  };
  error?: string;
}

export interface SkinStatus {
  app: string;
  port: number | null;
  target: string | null;
  injected: boolean;
  hostClassPresent: boolean;
  rootTheme: string | null;
  /** 页面端运行时是否在（__DIANA_ZCODE_THEME__） */
  controllerPresent: boolean;
}
