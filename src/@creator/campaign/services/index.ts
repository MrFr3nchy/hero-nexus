import {
  addDocument,
  deleteDocument,
  getDocument,
  getDocuments,
  subscribeToCollection,
  updateDocument,
} from '@/lib/firestore';
import {
  Campaign,
  CampaignImage,
  CampaignInvite,
  CampaignNote,
  HomebrewApproval,
  PublicHomebrewItem,
} from '../types';

export class CampaignService {
  // Campaign CRUD operations
  async createCampaign(
    campaignData: Omit<Campaign, 'id' | 'createdAt' | 'updatedAt'>
  ) {
    return addDocument('campaigns', campaignData);
  }

  async getCampaigns() {
    return getDocuments('campaigns');
  }

  async getCampaign(campaignId: string) {
    return getDocument('campaigns', campaignId);
  }

  async updateCampaign(campaignId: string, campaignData: Partial<Campaign>) {
    return updateDocument('campaigns', campaignId, campaignData);
  }

  async deleteCampaign(campaignId: string) {
    return deleteDocument('campaigns', campaignId);
  }

  // Campaign invites
  async createInvite(inviteData: Omit<CampaignInvite, 'id' | 'createdAt'>) {
    return addDocument('campaignInvites', inviteData);
  }

  async getInvitesByCampaign(_campaignId: string) {
    return getDocuments('campaignInvites');
  }

  async getInvitesByUser(_userId: string) {
    return getDocuments('campaignInvites');
  }

  async updateInviteStatus(inviteId: string, status: CampaignInvite['status']) {
    return updateDocument('campaignInvites', inviteId, { status });
  }

  // Campaign notes
  async createNote(
    noteData: Omit<CampaignNote, 'id' | 'createdAt' | 'updatedAt'>
  ) {
    return addDocument('campaignNotes', noteData);
  }

  async getCampaignNotes(_campaignId: string) {
    return getDocuments('campaignNotes');
  }

  async updateNote(noteId: string, noteData: Partial<CampaignNote>) {
    return updateDocument('campaignNotes', noteId, noteData);
  }

  async deleteNote(noteId: string) {
    return deleteDocument('campaignNotes', noteId);
  }

  // Campaign images
  async createImage(imageData: Omit<CampaignImage, 'id' | 'createdAt'>) {
    return addDocument('campaignImages', imageData);
  }

  async getCampaignImages(_campaignId: string) {
    return getDocuments('campaignImages');
  }

  async deleteImage(imageId: string) {
    return deleteDocument('campaignImages', imageId);
  }

  // Homebrew approval system
  async requestHomebrewApproval(
    approvalData: Omit<HomebrewApproval, 'id' | 'createdAt'>
  ) {
    return addDocument('homebrewApprovals', approvalData);
  }

  async getPendingApprovals(_campaignId: string) {
    return getDocuments('homebrewApprovals');
  }

  async updateApprovalStatus(
    approvalId: string,
    status: HomebrewApproval['status'],
    reviewNotes?: string
  ) {
    return updateDocument('homebrewApprovals', approvalId, {
      status,
      reviewNotes,
      reviewedAt: new Date(),
    });
  }

  // Public homebrew marketplace
  async createPublicHomebrew(
    homebrewData: Omit<PublicHomebrewItem, 'id' | 'createdAt' | 'updatedAt'>
  ) {
    return addDocument('publicHomebrew', homebrewData);
  }

  async getPublicHomebrew() {
    return getDocuments('publicHomebrew');
  }

  async getPublicHomebrewByType(_type: 'class' | 'spell' | 'item') {
    return getDocuments('publicHomebrew');
  }

  async updateHomebrewDownloadCount(homebrewId: string) {
    return updateDocument('publicHomebrew', homebrewId, {
      downloadCount: 1, // This should be incremented, not set to 1
    });
  }

  // Real-time subscriptions
  subscribeToCampaigns(
    callback: (
      _campaigns: Array<{ id: string; [key: string]: unknown }>
    ) => void
  ) {
    return subscribeToCollection('campaigns', callback);
  }

  subscribeToCampaignNotes(
    campaignId: string,
    callback: (_notes: Array<{ id: string; [key: string]: unknown }>) => void
  ) {
    return subscribeToCollection('campaignNotes', callback);
  }

  subscribeToPendingApprovals(
    campaignId: string,
    callback: (
      _approvals: Array<{ id: string; [key: string]: unknown }>
    ) => void
  ) {
    return subscribeToCollection('homebrewApprovals', callback);
  }
}

// Export a singleton instance
export const campaignService = new CampaignService();
