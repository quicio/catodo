/**
 * Registro semántico de iconos — los componentes piden iconos por nombre
 * semántico (<Icon name="play"/>) y el registro los resuelve al pack activo
 * (theme o override `iconPack`). Nunca importar lucide/react-icons/morphicons
 * directo desde componentes.
 *
 * Packs "morph" (stroke 24×24: lucide, feather, tabler) renderizan con
 * MorphIcon y conservan la animación spring al cambiar de estado (`morphTo`).
 * El resto renderiza el componente react-icons y el cambio es instantáneo.
 */
import { MorphIcon } from "morphicons/react";
import {
  Music, MonitorPlay, Clapperboard, Tv, Play, Gamepad2,
  ThumbsUp, ThumbsDown, Check, X, Settings, Smartphone,
} from "lucide";
import {
  GiMusicalNotes, GiTv, GiClapperboard, GiTvTower, GiPlayButton,
  GiRetroController, GiThumbUp, GiThumbDown, GiCheckMark, GiCancel,
  GiBigGear, GiSmartphone,
} from "react-icons/gi";
import {
  PiMusicNote, PiMonitorPlay, PiFilmSlate, PiTelevision, PiPlay,
  PiGameController, PiThumbsUp, PiThumbsDown, PiCheck, PiX,
  PiGear, PiDeviceMobile,
} from "react-icons/pi";
import {
  MdMusicNote, MdOndemandVideo, MdMovie, MdTv, MdPlayArrow,
  MdVideogameAsset, MdThumbUp, MdThumbDown, MdCheck, MdClose,
  MdSettings, MdSmartphone,
} from "react-icons/md";
import {
  IoMusicalNotes, IoPlayCircle, IoFilm, IoTv, IoPlay,
  IoGameController, IoThumbsUp, IoThumbsDown, IoCheckmark, IoClose,
  IoSettings, IoPhonePortrait,
} from "react-icons/io5";
import {
  BsMusicNoteBeamed, BsPlayBtn, BsFilm, BsTv, BsPlayFill,
  BsController, BsHandThumbsUp, BsHandThumbsDown, BsCheck, BsX,
  BsGear, BsPhone,
} from "react-icons/bs";
import {
  VscMusic, VscPlayCircle, VscRecord, VscScreenFull, VscPlay,
  VscGame, VscThumbsup, VscThumbsdown, VscCheck, VscClose,
  VscGear, VscDeviceMobile,
} from "react-icons/vsc";
import {
  RxDisc, RxDesktop, RxVideo, RxFrame, RxPlay, RxDashboard,
  RxThickArrowUp, RxThickArrowDown, RxCheck, RxCross2,
  RxGear, RxMobile,
} from "react-icons/rx";
import type { CSSProperties } from "react";
import type { IconType } from "react-icons";
import { useTheme, type IconPackId } from "./theme";
import { FI_NODES, TB_NODES } from "./icons.vendor";

/** [tag, attrs][] — formato IconNode de lucide (estructural). */
export type IconNode = [string, Record<string, string | number | undefined>][];

export type IconName =
  | "music"
  | "monitor-play"
  | "clapperboard"
  | "tv"
  | "play"
  | "gamepad"
  | "thumbs-up"
  | "thumbs-down"
  | "check"
  | "x"
  | "settings"
  | "smartphone";

type MorphMap = Record<IconName, IconNode>;
type StaticMap = Record<IconName, IconType>;

const LU_NODES: MorphMap = {
  music: Music,
  "monitor-play": MonitorPlay,
  clapperboard: Clapperboard,
  tv: Tv,
  play: Play,
  gamepad: Gamepad2,
  "thumbs-up": ThumbsUp,
  "thumbs-down": ThumbsDown,
  check: Check,
  x: X,
  settings: Settings,
  smartphone: Smartphone,
};

const FI_MAP = FI_NODES as unknown as MorphMap;
const TB_MAP = TB_NODES as unknown as MorphMap;

const GI_MAP: StaticMap = {
  music: GiMusicalNotes,
  "monitor-play": GiTv,
  clapperboard: GiClapperboard,
  tv: GiTvTower,
  play: GiPlayButton,
  gamepad: GiRetroController,
  "thumbs-up": GiThumbUp,
  "thumbs-down": GiThumbDown,
  check: GiCheckMark,
  x: GiCancel,
  settings: GiBigGear,
  smartphone: GiSmartphone,
};

const PI_MAP: StaticMap = {
  music: PiMusicNote,
  "monitor-play": PiMonitorPlay,
  clapperboard: PiFilmSlate,
  tv: PiTelevision,
  play: PiPlay,
  gamepad: PiGameController,
  "thumbs-up": PiThumbsUp,
  "thumbs-down": PiThumbsDown,
  check: PiCheck,
  x: PiX,
  settings: PiGear,
  smartphone: PiDeviceMobile,
};

const MD_MAP: StaticMap = {
  music: MdMusicNote,
  "monitor-play": MdOndemandVideo,
  clapperboard: MdMovie,
  tv: MdTv,
  play: MdPlayArrow,
  gamepad: MdVideogameAsset,
  "thumbs-up": MdThumbUp,
  "thumbs-down": MdThumbDown,
  check: MdCheck,
  x: MdClose,
  settings: MdSettings,
  smartphone: MdSmartphone,
};

const IO5_MAP: StaticMap = {
  music: IoMusicalNotes,
  "monitor-play": IoPlayCircle,
  clapperboard: IoFilm,
  tv: IoTv,
  play: IoPlay,
  gamepad: IoGameController,
  "thumbs-up": IoThumbsUp,
  "thumbs-down": IoThumbsDown,
  check: IoCheckmark,
  x: IoClose,
  settings: IoSettings,
  smartphone: IoPhonePortrait,
};

const BS_MAP: StaticMap = {
  music: BsMusicNoteBeamed,
  "monitor-play": BsPlayBtn,
  clapperboard: BsFilm,
  tv: BsTv,
  play: BsPlayFill,
  gamepad: BsController,
  "thumbs-up": BsHandThumbsUp,
  "thumbs-down": BsHandThumbsDown,
  check: BsCheck,
  x: BsX,
  settings: BsGear,
  smartphone: BsPhone,
};

const VSC_MAP: StaticMap = {
  music: VscMusic,
  "monitor-play": VscPlayCircle,
  clapperboard: VscRecord,
  tv: VscScreenFull,
  play: VscPlay,
  gamepad: VscGame,
  "thumbs-up": VscThumbsup,
  "thumbs-down": VscThumbsdown,
  check: VscCheck,
  x: VscClose,
  settings: VscGear,
  smartphone: VscDeviceMobile,
};

const RX_MAP: StaticMap = {
  music: RxDisc,
  "monitor-play": RxDesktop,
  clapperboard: RxVideo,
  tv: RxFrame,
  play: RxPlay,
  gamepad: RxDashboard,
  "thumbs-up": RxThickArrowUp,
  "thumbs-down": RxThickArrowDown,
  check: RxCheck,
  x: RxCross2,
  settings: RxGear,
  smartphone: RxMobile,
};

interface PackDef {
  label: string;
  renderer: "morph" | "static";
  icons: MorphMap | StaticMap;
}

export const PACKS: Record<IconPackId, PackDef> = {
  lucide: { label: "Lucide", renderer: "morph", icons: LU_NODES },
  feather: { label: "Feather", renderer: "morph", icons: FI_MAP },
  tabler: { label: "Tabler", renderer: "morph", icons: TB_MAP },
  "game-icons": { label: "Game Icons", renderer: "static", icons: GI_MAP },
  phosphor: { label: "Phosphor", renderer: "static", icons: PI_MAP },
  material: { label: "Material", renderer: "static", icons: MD_MAP },
  ionicons: { label: "Ionicons", renderer: "static", icons: IO5_MAP },
  bootstrap: { label: "Bootstrap", renderer: "static", icons: BS_MAP },
  codicons: { label: "Codicons", renderer: "static", icons: VSC_MAP },
  radix: { label: "Radix", renderer: "static", icons: RX_MAP },
};

export interface IconProps {
  name: IconName;
  /** Estado alternativo para transiciones (morph en packs stroke). */
  morphTo?: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
}

export function Icon({ name, morphTo, size = 24, color, strokeWidth = 2, className, style }: IconProps) {
  const { iconPack } = useTheme();
  const pack = PACKS[iconPack] ?? PACKS.lucide;
  const effective = morphTo ?? name;
  if (pack.renderer === "morph") {
    return (
      <MorphIcon
        icon={(pack.icons as MorphMap)[effective]}
        size={size}
        strokeWidth={strokeWidth}
        color={color}
        spring="smooth"
        className={className}
        style={style}
      />
    );
  }
  const Cmp = (pack.icons as StaticMap)[effective];
  return <Cmp size={size} color={color} className={className} style={style} />;
}
