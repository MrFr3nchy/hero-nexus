export const RPG_SYSTEMS = [
  {
    id: 'dnd5e2024',
    name: 'Dungeons & Dragons',
    version: '5th Edition 2024',
    description: "The latest version of the world's most popular tabletop RPG",
  },
  {
    id: 'pathfinder2e',
    name: 'Pathfinder',
    version: '2nd Edition',
    description: 'A fantasy RPG with deep character customization',
  },
  {
    id: 'callofcthulhu',
    name: 'Call of Cthulhu',
    version: '7th Edition',
    description: 'Horror investigation RPG',
  },
  {
    id: 'vampire5e',
    name: 'Vampire: The Masquerade',
    version: '5th Edition',
    description: 'Gothic punk storytelling RPG',
  },
];

export const CAMPAIGN_STATUSES = [
  {
    id: 'active',
    name: 'Active',
    description: 'Campaign is currently running',
  },
  {
    id: 'paused',
    name: 'Paused',
    description: 'Campaign is temporarily paused',
  },
  { id: 'completed', name: 'Completed', description: 'Campaign has finished' },
  { id: 'archived', name: 'Archived', description: 'Campaign is archived' },
];

export const HOMEBREW_TYPES = [
  { id: 'class', name: 'Class', icon: '⚔️', description: 'Character classes' },
  { id: 'spell', name: 'Spell', icon: '🔮', description: 'Magical spells' },
  { id: 'item', name: 'Item', icon: '🛡️', description: 'Equipment and items' },
];

export const APPROVAL_STATUSES = [
  { id: 'pending', name: 'Pending', description: 'Awaiting GM approval' },
  { id: 'approved', name: 'Approved', description: 'Approved for use' },
  { id: 'denied', name: 'Denied', description: 'Not approved for use' },
];

export const PLAYER_ROLES = [
  { id: 'player', name: 'Player', description: 'Regular campaign player' },
  { id: 'co-gm', name: 'Co-GM', description: 'Assistant Game Master' },
];
