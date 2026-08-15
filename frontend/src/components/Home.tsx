import type { ChannelInfo, AppState } from "../api/client";
import {
  DEFAULT_LAYOUT,
  homeSlots,
  UnknownSlot,
  useHomeState,
  type HomeComponentConfig,
  type HomeComponentPosition,
  type HomeLayout,
} from "./home";

/**
 * El Home de Cátodo: un orquestador.
 *
 * Recibe un `HomeLayout` (default = DEFAULT_LAYOUT) y compone la pantalla
 * iterando `layout.components`. Cada componente se resuelve desde `homeSlots`
 * y se monta como `<HomeSlot config={c} homeState={...} />`.
 *
 * El estado compartido (wallpapers/ratings/Spotify bg/reloj/pair/showConfig)
 * se encapsula en `useHomeState()` y se pasa como prop a cada slot.
 *
 * El layout activo y el callback para cambiarlo vienen del orquestador superior
 * (App.tsx) — Home no decide layouts ni los persiste.
 *
 * Agregar un widget nuevo es:
 *   1. agregar su id a `HomeComponentId` (types.ts)
 *   2. crear un componente `frontend/src/components/home/<MiSlot>.tsx`
 *   3. registrarlo en `homeSlots` (registry.tsx)
 *   4. incluirlo en un `HomeLayout` (e.g. DEFAULT_LAYOUT)
 * Cero cambios acá en Home ni en App.
 */
export default function Home({
  channels,
  onPick,
  state,
  layout = DEFAULT_LAYOUT,
  layoutId = "default",
  onLayoutChange,
}: {
  channels: ChannelInfo[];
  onPick: (id: string) => void;
  state: AppState;
  layout?: HomeLayout;
  layoutId?: string;
  onLayoutChange?: (id: string) => void;
}) {
  const homeState = useHomeState(state);

  const rootComponents = layout.components.filter((c) => c.position !== "overlay");
  const overlayComponents = layout.components.filter(
    (c) => c.position === ("overlay" as HomeComponentPosition),
  );

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 40,
        color: "var(--text)",
        padding: 40,
      }}
    >
      {rootComponents.map((c) => (
        <HomeSlot
          key={c.id}
          config={c}
          state={state}
          channels={channels}
          onPick={onPick}
          homeState={homeState}
          layoutId={layoutId}
          onLayoutChange={onLayoutChange}
        />
      ))}

      {/* Hint inferior (parte del contenedor root para preservar el layout actual) */}
      <div
        style={{
          fontSize: 12,
          opacity: 0.4,
          fontFamily: "var(--font-mono)",
          position: "relative",
          zIndex: 2,
        }}
      >
        PRECIONÁ 1-4 O HACÉ CLICK · ESC PARA VOLVER
      </div>

      {overlayComponents.map((c) => (
        <HomeSlot
          key={c.id}
          config={c}
          state={state}
          channels={channels}
          onPick={onPick}
          homeState={homeState}
          layoutId={layoutId}
          onLayoutChange={onLayoutChange}
        />
      ))}
    </div>
  );
}

function HomeSlot(props: {
  config: HomeComponentConfig;
  state: AppState;
  channels: ChannelInfo[];
  onPick: (id: string) => void;
  homeState: ReturnType<typeof useHomeState>;
  layoutId: string;
  onLayoutChange?: (id: string) => void;
}) {
  const { config } = props;
  const Slot = homeSlots[config.id] ?? UnknownSlot;
  if (!homeSlots[config.id]) {
    return <UnknownSlot config={{ id: config.id }} />;
  }
  return (
    <>
      {Slot({
        config,
        state: props.state,
        channels: props.channels,
        onPick: props.onPick,
        homeState: props.homeState,
        layoutId: props.layoutId,
        onLayoutChange: props.onLayoutChange,
      })}
    </>
  );
}
