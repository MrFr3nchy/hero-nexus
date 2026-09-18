/**
 * The one system the app is built for. There used to be four here, three
 * of which nothing on the shelves or in the builder supported; a campaign
 * form offered them anyway.
 */
export const RPG_SYSTEMS = [
  {
    id: 'dnd5e2024',
    name: 'Dungeons & Dragons',
    version: '5th Edition 2024',
    description: "The latest version of the world's most popular tabletop RPG",
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

export const APPROVAL_STATUSES = [
  { id: 'pending', name: 'Pending', description: 'Awaiting GM approval' },
  { id: 'approved', name: 'Approved', description: 'Approved for use' },
  { id: 'denied', name: 'Denied', description: 'Not approved for use' },
];

export const PLAYER_ROLES = [
  { id: 'player', name: 'Player', description: 'Regular campaign player' },
  { id: 'co-gm', name: 'Co-GM', description: 'Assistant Game Master' },
];
