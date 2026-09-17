/**
 * What the workshop's tools remember: which one is in hand and how each
 * is set. Kept apart from the surface so the panel, the rail and the
 * board read one shape.
 */
import type { BrushSize } from '@/@creator/campaign/lib/battlemap';
import type { Density, ScatterKind } from '@/@creator/campaign/lib/board-edit';
import type { StampCategory } from '@/@creator/campaign/lib/stamps';
import type { ItemState, WallKind } from '@/@shared/battlemap/types';

export type WorkshopTool =
  | 'select'
  | 'rooms'
  | 'walls'
  | 'floor'
  | 'height'
  | 'scatter'
  | 'stamps'
  | 'things'
  | 'light'
  | 'fog';

export interface ToolSpec {
  id: WorkshopTool;
  label: string;
  name: string;
  hint: string;
  /** A hairline above it on the rail. */
  gap?: boolean;
}

export const TOOLS: readonly ToolSpec[] = [
  {
    id: 'select',
    label: 'Select',
    name: 'Select',
    hint: 'drag a box to grab walls, floor and things together',
  },
  {
    id: 'rooms',
    label: 'Rooms',
    name: 'Rooms',
    hint: 'drag a box — floor, walls and a door in one go',
    gap: true,
  },
  {
    id: 'walls',
    label: 'Walls',
    name: 'Walls',
    hint: 'drag along the grid lines for a whole run of wall',
  },
  {
    id: 'floor',
    label: 'Floor',
    name: 'Floor',
    hint: 'drag to paint — or box it, or fill a room',
  },
  {
    id: 'height',
    label: 'Height',
    name: 'Height',
    hint: 'drag to raise or lower the ground',
  },
  {
    id: 'scatter',
    label: 'Scatter',
    name: 'Scatter',
    hint: 'drag through the garden and trees grow where it’s empty',
    gap: true,
  },
  {
    id: 'stamps',
    label: 'Stamps',
    name: 'Stamps',
    hint: 'pick one, tap to put it down, R to turn it',
  },
  {
    id: 'things',
    label: 'Things',
    name: 'Things',
    hint: 'a door, a chest — something the party can act on',
    gap: true,
  },
  {
    id: 'light',
    label: 'Light',
    name: 'Light',
    hint: 'tap for a torch or a brazier',
  },
  {
    id: 'fog',
    label: 'Fog',
    name: 'Fog',
    hint: 'drag to show the party what they can see',
  },
];

export type RoomSize = 'drag' | '3 × 3' | '5 × 5' | '6 × 4' | '8 × 8';
export const ROOM_SIZES: readonly RoomSize[] = [
  '3 × 3',
  '5 × 5',
  '6 × 4',
  '8 × 8',
];
export function roomDims(size: RoomSize): [number, number] | null {
  switch (size) {
    case '3 × 3':
      return [3, 3];
    case '5 × 5':
      return [5, 5];
    case '6 × 4':
      return [6, 4];
    case '8 × 8':
      return [8, 8];
    default:
      return null;
  }
}

export type WallMode = 'edge' | 'line' | 'box' | 'erase';
export type PaintMode = 'brush' | 'box' | 'fill';
export type HeightMode = 'raise' | 'lower' | 'set';

export interface Settings {
  roomSize: RoomSize;
  roomMat: number;
  roomDoor: boolean;
  roomMerge: boolean;
  roomName: boolean;
  wallMode: WallMode;
  wallKind: WallKind;
  mat: number;
  paintMode: PaintMode;
  brush: BrushSize;
  heightMode: HeightMode;
  step: number;
  scatterKind: ScatterKind;
  density: Density;
  scatterBlocks: boolean;
  scatterVary: boolean;
  scatterAvoid: boolean;
  stamp: string;
  stampCat: 'All' | StampCategory;
  stampSearch: string;
  /** Quarter turns, 0–3, and whether it is mirrored. */
  stampTurns: number;
  stampFlip: boolean;
  thingLabel: string;
  thingState: ItemState | null;
  thingLockDc: number | null;
  thingHp: number | null;
  lightReach: number;
}

export const DEFAULT_SETTINGS: Settings = {
  roomSize: '5 × 5',
  roomMat: 4,
  roomDoor: true,
  roomMerge: true,
  roomName: true,
  wallMode: 'line',
  wallKind: 'solid',
  mat: 4,
  paintMode: 'brush',
  brush: 3,
  heightMode: 'raise',
  step: 5,
  scatterKind: 'tree',
  density: 'some',
  scatterBlocks: true,
  scatterVary: true,
  scatterAvoid: true,
  stamp: 'grove',
  stampCat: 'All',
  stampSearch: '',
  stampTurns: 0,
  stampFlip: false,
  thingLabel: '',
  thingState: 'closed',
  thingLockDc: 15,
  thingHp: 18,
  lightReach: 20,
};

/** What the Select tool has hold of. */
export type Selection =
  | { kind: 'box'; a: { x: number; y: number }; b: { x: number; y: number } }
  | { kind: 'link'; id: string }
  | { kind: 'token'; id: string }
  | null;
