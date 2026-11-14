import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";

/**
 * Navegación global con mando (Xbox, DualShock, etc.).
 *
 * La UI del kiosko ya es navegable con teclado y click: cada pantalla expone
 * botones reales. En vez de duplicar la lógica de navegación por canal, este
 * hook mueve el foco entre los elementos enfocables visibles (grilla espacial)
 * y activa el enfocado con A, igual que haría un click.
 *
 * El player embebido del arcade maneja el mando por su cuenta (manda
 * `press`/`release` al core), así que se suspende esta capa mientras está
 * montado.
 */

/** Evento que despierta la barra de canales y el screensaver. */
export const GAMEPAD_ACTIVITY_EVENT = "catodo:gamepad-activity";

const AXIS_DEADZONE = 0.5;
const FIRST_REPEAT_MS = 380;
const REPEAT_MS = 110;

const BUTTON = {
  a: 0,
  b: 1,
  l2: 6,
  r2: 7,
  select: 8,
  start: 9,
  up: 12,
  down: 13,
  left: 14,
  right: 15,
} as const;

type Direction = "up" | "down" | "left" | "right";

let suspended = 0;

/** Suspende la navegación global mientras un canal maneja el mando. */
export function setGamepadNavSuspended(value: boolean) {
  suspended = Math.max(0, suspended + (value ? 1 : -1));
}

function isVisible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  const style = window.getComputedStyle(element);
  if (style.visibility === "hidden" || style.display === "none") return false;
  return Number.parseFloat(style.opacity) > 0.05;
}

function focusables(): HTMLElement[] {
  const nodes = document.querySelectorAll<HTMLElement>(
    'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), ' +
      'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  );
  return Array.from(nodes).filter(
    (node) => node.dataset.gamepadIgnore !== "true" && isVisible(node),
  );
}

function activeFocusable(items: HTMLElement[]): HTMLElement | null {
  const active = document.activeElement;
  return active instanceof HTMLElement && items.includes(active) ? active : null;
}

let ring: HTMLElement | null = null;

function focusElement(element: HTMLElement) {
  if (ring && ring !== element) ring.removeAttribute("data-gamepad-focus");
  ring = element;
  element.focus();
  // Atributo (no clase): React reescribe `className` en cada render y borraría
  // el anillo de foco; los atributos que React no declara se conservan.
  element.setAttribute("data-gamepad-focus", "true");
}

function clearRing() {
  if (ring) {
    ring.removeAttribute("data-gamepad-focus");
    ring = null;
  }
}

/** Centro del elemento más cercano al centro de la pantalla. */
function firstFocusable(items: HTMLElement[]): HTMLElement {
  // La barra de canales es un overlay fijo en el borde inferior: no debe
  // ganarle al contenido principal cuando todavía no hay foco.
  const preferred = items.filter((item) => !item.closest(".channel-bar"));
  const pool = preferred.length > 0 ? preferred : items;
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  let best = pool[0];
  let bestDistance = Infinity;
  for (const item of pool) {
    const rect = item.getBoundingClientRect();
    const distance = Math.hypot(
      rect.left + rect.width / 2 - cx,
      rect.top + rect.height / 2 - cy,
    );
    if (distance < bestDistance) {
      bestDistance = distance;
      best = item;
    }
  }
  return best;
}

function moveFocus(direction: Direction) {
  const items = focusables();
  if (items.length === 0) return;
  const active = activeFocusable(items);
  if (!active) {
    focusElement(firstFocusable(items));
    return;
  }

  const from = active.getBoundingClientRect();
  const fromX = from.left + from.width / 2;
  const fromY = from.top + from.height / 2;
  let best: HTMLElement | null = null;
  let bestScore = Infinity;

  for (const item of items) {
    if (item === active) continue;
    const rect = item.getBoundingClientRect();
    const dx = rect.left + rect.width / 2 - fromX;
    const dy = rect.top + rect.height / 2 - fromY;
    const along =
      direction === "left" ? -dx : direction === "right" ? dx : direction === "up" ? -dy : dy;
    if (along <= 4) continue;
    const cross = direction === "left" || direction === "right" ? Math.abs(dy) : Math.abs(dx);
    // Prioriza avanzar en la dirección pedida y castiga desviarse en el eje cruzado.
    const score = along + cross * 2;
    if (score < bestScore) {
      bestScore = score;
      best = item;
    }
  }

  if (best) focusElement(best);
}

function activate() {
  const items = focusables();
  if (items.length === 0) return;
  const active = activeFocusable(items);
  if (!active) {
    focusElement(firstFocusable(items));
    return;
  }
  active.click();
}

function dispatchKey(key: string) {
  // `document` propaga a window, que es donde escuchan App y los canales.
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
  );
}

function markActivity() {
  window.dispatchEvent(new Event(GAMEPAD_ACTIVITY_EVENT));
}

function axesDirections(pad: Gamepad): Direction[] {
  const directions: Direction[] = [];
  const x = pad.axes[0] ?? 0;
  const y = pad.axes[1] ?? 0;
  if (x < -AXIS_DEADZONE) directions.push("left");
  if (x > AXIS_DEADZONE) directions.push("right");
  if (y < -AXIS_DEADZONE) directions.push("up");
  if (y > AXIS_DEADZONE) directions.push("down");
  // Hat del D-pad en mandos viejos.
  const hatX = pad.axes[6] ?? 0;
  const hatY = pad.axes[7] ?? 0;
  if (hatX < -0.5 && !directions.includes("left")) directions.push("left");
  if (hatX > 0.5 && !directions.includes("right")) directions.push("right");
  if (hatY < -0.5 && !directions.includes("up")) directions.push("up");
  if (hatY > 0.5 && !directions.includes("down")) directions.push("down");
  return directions;
}

function directions(pad: Gamepad): Set<Direction> {
  const set = new Set<Direction>(axesDirections(pad));
  if (pad.buttons[BUTTON.up]?.pressed) set.add("up");
  if (pad.buttons[BUTTON.down]?.pressed) set.add("down");
  if (pad.buttons[BUTTON.left]?.pressed) set.add("left");
  if (pad.buttons[BUTTON.right]?.pressed) set.add("right");
  return set;
}

function displayName(id: string): string {
  return id.replace(/\(.*\)$/, "").trim() || "mando";
}

/** Hook que habilita la navegación con mando en toda la app. */
export function useGamepadNav(): string | null {
  const [padName, setPadName] = useState<string | null>(null);
  const padRef = useRef<string | null>(null);

  useEffect(() => {
    let frame = 0;
    const repeats = new Map<string, number>();
    const pressed = new Set<string>();
    let lastActivity = 0;

    const updateName = () => {
      const pads = Array.from(navigator.getGamepads?.() ?? []).filter(
        (pad): pad is Gamepad => Boolean(pad?.connected),
      );
      const next = pads[0] ? displayName(pads[0].id) : null;
      if (next !== padRef.current) {
        padRef.current = next;
        setPadName(next);
      }
    };

    const poll = (now: number) => {
      frame = requestAnimationFrame(poll);
      const pad = Array.from(navigator.getGamepads?.() ?? []).find(
        (candidate) => candidate?.connected,
      );
      updateName();
      if (!pad || suspended > 0) {
        repeats.clear();
        pressed.clear();
        return;
      }

      const dirs = directions(pad);
      const active = dirs.size > 0 || pad.buttons.some((button) => button.pressed);
      if (active && now - lastActivity > 1000) {
        lastActivity = now;
        markActivity();
      }

      const repeat = (name: string, action: () => void) => {
        const next = repeats.get(name);
        if (next === undefined) {
          repeats.set(name, now + FIRST_REPEAT_MS);
          action();
        } else if (now >= next) {
          repeats.set(name, now + REPEAT_MS);
          action();
        }
      };

      for (const direction of dirs) repeat(`dir:${direction}`, () => moveFocus(direction));
      for (const name of [...repeats.keys()]) {
        if (name.startsWith("dir:") && !dirs.has(name.slice(4) as Direction)) {
          repeats.delete(name);
        }
      }

      // Gatillos: volumen global, con repetición al mantener.
      if (pad.buttons[BUTTON.l2]?.pressed) repeat("vol:-", () => void api.volume("-"));
      else repeats.delete("vol:-");
      if (pad.buttons[BUTTON.r2]?.pressed) repeat("vol:+", () => void api.volume("+"));
      else repeats.delete("vol:+");

      const edge = (name: string, isPressed: boolean, action: () => void) => {
        if (isPressed && !pressed.has(name)) {
          pressed.add(name);
          action();
        } else if (!isPressed) {
          pressed.delete(name);
        }
      };

      edge("a", Boolean(pad.buttons[BUTTON.a]?.pressed), activate);
      edge("b", Boolean(pad.buttons[BUTTON.b]?.pressed), () => dispatchKey("Escape"));
      edge("start", Boolean(pad.buttons[BUTTON.start]?.pressed), () => dispatchKey("Escape"));
      edge("select", Boolean(pad.buttons[BUTTON.select]?.pressed), () => dispatchKey("Escape"));
    };

    const onFocusIn = (event: FocusEvent) => {
      if (ring && event.target !== ring) clearRing();
    };

    // Cualquier interacción real (mouse/teclado) abandona el foco del mando.
    const onUserKey = (event: KeyboardEvent) => {
      if (event.isTrusted) clearRing();
    };

    updateName();
    frame = requestAnimationFrame(poll);
    window.addEventListener("gamepadconnected", updateName);
    window.addEventListener("gamepaddisconnected", updateName);
    window.addEventListener("mousedown", clearRing);
    window.addEventListener("keydown", onUserKey, true);
    document.addEventListener("focusin", onFocusIn);

    return () => {
      cancelAnimationFrame(frame);
      repeats.clear();
      pressed.clear();
      clearRing();
      window.removeEventListener("gamepadconnected", updateName);
      window.removeEventListener("gamepaddisconnected", updateName);
      window.removeEventListener("mousedown", clearRing);
      window.removeEventListener("keydown", onUserKey, true);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, []);

  return padName;
}
