export const DEFAULT_JUMP_COMBO = "Alt+C";

export type ShortcutAction =
  | "channel"
  | "home"
  | "settings"
  | "menu"
  | "volume_up"
  | "volume_down"
  | "next"
  | "previous"
  | "fullscreen";

export interface CustomShortcut {
  combo: string;
  action: ShortcutAction;
  channel?: string;
}

export interface ParsedCombo {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  key: string;
}

const RESERVED_KEYS = new Set(["tab", "escape", "esc", "f11", "enter"]);

const ACTIONS: ShortcutAction[] = [
  "channel",
  "home",
  "settings",
  "menu",
  "volume_up",
  "volume_down",
  "next",
  "previous",
  "fullscreen",
];

export function validAction(value: unknown): value is ShortcutAction {
  return typeof value === "string" && (ACTIONS as string[]).includes(value);
}

export function keyFromEvent(event: {
  code?: string;
  key?: string;
}): string | null {
  const code = event.code || "";
  let match = /^Key([A-Z])$/.exec(code);
  if (match) return match[1].toLowerCase();
  match = /^Digit([0-9])$/.exec(code);
  if (match) return match[1];
  match = /^F([1-9]|1[0-2])$/.exec(code);
  if (match) return `f${match[1]}`;
  const key = (event.key || "").toLowerCase();
  if (/^[a-z0-9]$/.test(key)) return key;
  if (/^f([1-9]|1[0-2])$/.test(key)) return key;
  return null;
}

export function comboFromEvent(event: {
  code?: string;
  key?: string;
  altKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}): string | null {
  if (!event.altKey || event.metaKey) return null;
  const key = keyFromEvent(event);
  if (!key || RESERVED_KEYS.has(key)) return null;
  return [
    event.ctrlKey ? "Ctrl" : "",
    "Alt",
    event.shiftKey ? "Shift" : "",
    key.toUpperCase(),
  ]
    .filter(Boolean)
    .join("+");
}

export function parseCombo(combo: string): ParsedCombo | null {
  const parts = combo
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const key = parts[parts.length - 1].toLowerCase();
  if (!/^([a-z0-9]|f([1-9]|1[0-2]))$/.test(key)) return null;
  if (RESERVED_KEYS.has(key)) return null;
  const modifiers = parts.slice(0, -1).map((part) => part.toLowerCase());
  const ctrl = modifiers.includes("ctrl") || modifiers.includes("control");
  const alt = modifiers.includes("alt") || modifiers.includes("option");
  const shift = modifiers.includes("shift");
  const meta = modifiers.includes("meta") || modifiers.includes("cmd") || modifiers.includes("command");
  if (!alt) return null;
  return { ctrl, alt, shift, meta, key };
}

export function normalizeCombo(combo: string): string | null {
  const parsed = parseCombo(combo);
  if (!parsed) return null;
  return [
    parsed.ctrl ? "Ctrl" : "",
    "Alt",
    parsed.shift ? "Shift" : "",
    parsed.key.toUpperCase(),
  ]
    .filter(Boolean)
    .join("+");
}

export function matchesCombo(
  event: {
    code?: string;
    key?: string;
    altKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
    metaKey: boolean;
  },
  combo: string,
): boolean {
  const parsed = parseCombo(combo);
  if (!parsed) return false;
  if (event.altKey !== parsed.alt) return false;
  if (event.ctrlKey !== parsed.ctrl) return false;
  if (event.shiftKey !== parsed.shift) return false;
  if (event.metaKey !== parsed.meta) return false;
  return keyFromEvent(event) === parsed.key;
}

export function sanitizeShortcuts(value: unknown): CustomShortcut[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: CustomShortcut[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as { combo?: unknown; action?: unknown; channel?: unknown };
    const combo = typeof item.combo === "string" ? normalizeCombo(item.combo) : null;
    if (!combo || seen.has(combo)) continue;
    if (!validAction(item.action)) continue;
    if (item.action === "channel" && typeof item.channel !== "string") continue;
    seen.add(combo);
    result.push({
      combo,
      action: item.action,
      channel: typeof item.channel === "string" ? item.channel : undefined,
    });
  }
  return result;
}

export function jumpComboOr(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_JUMP_COMBO;
  return normalizeCombo(value) ?? DEFAULT_JUMP_COMBO;
}
