export interface Campaign {
  id: string;
  name: string;
  description: string;
  gmId: string; // User ID of the Game Master
  players: CampaignPlayer[];
  settings: CampaignSettings;
  status: 'active' | 'paused' | 'completed' | 'archived';
  createdAt: Date;
  updatedAt: Date;
}

export interface CampaignPlayer {
  id: string;
  userId: string;
  characterId?: string; // Optional character in this campaign
  role: 'player' | 'co-gm';
  joinedAt: Date;
  status: 'active' | 'inactive';
}

export interface CampaignSettings {
  rpgSystem: string;
  allowHomebrew: boolean;
  requireHomebrewApproval: boolean;
  allowPublicHomebrew: boolean;
  maxPlayers: number;
  sessionNotes: string;
  customRules: string;
}

export interface CampaignInvite {
  id: string;
  campaignId: string;
  invitedUserId: string;
  invitedByUserId: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  expiresAt: Date;
  createdAt: Date;
}

export interface HomebrewApproval {
  id: string;
  campaignId: string;
  homebrewItemId: string;
  homebrewType: 'class' | 'spell' | 'item';
  requestedByUserId: string;
  status: 'pending' | 'approved' | 'denied';
  reviewedByUserId?: string;
  reviewNotes?: string;
  createdAt: Date;
  reviewedAt?: Date;
}

export interface CampaignNote {
  id: string;
  campaignId: string;
  title: string;
  content: string;
  isPublic: boolean; // Visible to all players
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CampaignImage {
  id: string;
  campaignId: string;
  title: string;
  description?: string;
  imageUrl: string;
  isPublic: boolean;
  uploadedByUserId: string;
  createdAt: Date;
}

export interface PublicHomebrewItem {
  id: string;
  name: string;
  type: 'class' | 'spell' | 'item';
  description: string;
  rpgSystem: string;
  createdByUserId: string;
  isPublic: boolean;
  downloadCount: number;
  rating: number;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}
