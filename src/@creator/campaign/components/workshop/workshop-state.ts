/**
 * What the workshop's tools remember: which one is in hand and how each
 * is set. Kept apart from the surface so the panel, the rail and the
 * board read one shape.
 */
import type { BrushSize } from '@/@creator/campaign/lib/battlemap';
import type { Density, ScatterKind } from '@/@creator/campaign/lib/board-edit';
import type { StampCategory } from '@/@creator/campaign/lib/stamps';
import type { Facing, ItemState, WallKind } from '@/@shared/battlemap/types';

export type WorkshopTool =
  | 'select'
  | 'rooms'
  | 'walls'
  | 'floor'
  | 'height'
  | 'scatter'
  | 'stamps'
  | 'pictures'
  | 'things'
  | 'light'
  | 'erase'
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
    id: 'pictures',
    label: 'Pictures',
    name: 'Pictures',
    hint: 'stand one of your own images up on a tile — a fountain, a sign',
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
    name: 'Light and sky',
    hint: 'tap for a torch or a brazier; the weather is here too',
  },
  {
    id: 'erase',
    label: 'Erase',
    name: 'Erase',
    hint: 'drag to rub out just one kind of thing — the floor stays',
    gap: true,
  },
  {
    id: 'fog',
    label: 'Fog of war',
    name: 'Fog of war',
    hint: 'drag to show the party what they can see',
  },
];

/**
 * What the Erase tool rubs out.
 *
 * One kind at a time, because "remove it" used to mean `clearRegion` — floor,
 * height, walls, props and lights all at once — and a DM who wanted the hedge
 * gone lost the lawn under it.
 */
export type EraseWhat =
  | 'props'
  | 'walls'
  | 'lights'
  | 'floor'
  | 'height'
  | 'all';

export const ERASE_WHATS: readonly {
  id: EraseWhat;
  label: string;
  sub: string;
}[] = [
  { id: 'props', label: 'Things', sub: 'trees, rubble, pictures' },
  { id: 'walls', label: 'Walls', sub: 'walls, hedges, doors' },
  { id: 'lights', label: 'Lights', sub: 'torches and braziers' },
  { id: 'floor', label: 'Floor', sub: 'back to nothing' },
  { id: 'height', label: 'Height', sub: 'flat again, floor kept' },
  { id: 'all', label: 'Everything', sub: 'the tile, bare' },
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
  eraseWhat: EraseWhat;
  /** The picture a standee stands up as: a `campaign_images` id. */
  pictureImageId: string | null;
  /** Feet tall. A tree is 20, a door 10, a mile-marker 3. */
  pictureHeight: number;
  pictureFacing: Facing;
  pictureBlocks: boolean;
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
  eraseWhat: 'props',
  pictureImageId: null,
  pictureHeight: 10,
  pictureFacing: 'camera',
  pictureBlocks: false,
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
