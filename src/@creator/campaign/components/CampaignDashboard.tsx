'use client';

import { campaignService } from '@/@creator/campaign/services';
import { Campaign } from '@/@creator/campaign/types';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Spinner,
} from '@heroui/react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

interface CampaignDashboardProps {
  _userId: string;
  isGM?: boolean;
}

export function CampaignDashboard({
  _userId,
  isGM = false,
}: CampaignDashboardProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCampaigns();
  }, []);

  const loadCampaigns = async () => {
    try {
      setLoading(true);
      setError(null);
      const campaignsData = await campaignService.getCampaigns();
      setCampaigns(campaignsData as unknown as Campaign[]);
    } catch (err) {
      console.error('Error loading campaigns:', err);
      setError('Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: Campaign['status']) => {
    switch (status) {
      case 'active':
        return 'success';
      case 'paused':
        return 'warning';
      case 'completed':
        return 'default';
      case 'archived':
        return 'secondary';
      default:
        return 'default';
    }
  };

  const formatDate = (date: unknown) => {
    if (!date) return 'Unknown';
    if (typeof date === 'object' && date !== null && 'toDate' in date) {
      return (date as { toDate: () => Date }).toDate().toLocaleDateString();
    }
    return new Date(date as string | number).toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Spinner size="lg" color="warning" className="mb-4" />
          <p className="text-amber-300 text-lg">Loading your campaigns...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-center text-red-500 text-lg">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-4">
            🏰 Campaign Dashboard
          </h1>
          <p className="text-xl text-purple-200 max-w-3xl mx-auto">
            {isGM
              ? 'Manage your campaigns and invite players'
              : 'View your campaigns and join new adventures'}
          </p>
        </div>

        {/* Create Campaign Button for GMs */}
        {isGM && (
          <div className="flex justify-center mb-8">
            <Link href="/campaigns/create">
              <Button
                color="primary"
                size="lg"
                className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-semibold py-4 px-8 text-lg transition-all duration-300 transform hover:scale-105"
              >
                ✨ Create New Campaign
              </Button>
            </Link>
          </div>
        )}

        {/* Campaigns Grid */}
        {campaigns.length === 0 ? (
          <Card className="bg-slate-800/50 backdrop-blur-sm border-amber-600/30">
            <CardBody className="text-center py-12">
              <h3 className="text-2xl font-bold text-amber-300 mb-4">
                No Campaigns Yet
              </h3>
              <p className="text-gray-300 mb-6">
                {isGM
                  ? 'Create your first campaign to start your adventure!'
                  : 'Join a campaign or wait for an invitation!'}
              </p>
              {isGM && (
                <Link href="/campaigns/create">
                  <Button
                    color="primary"
                    size="lg"
                    className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500"
                  >
                    Create Campaign
                  </Button>
                </Link>
              )}
            </CardBody>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {campaigns.map(campaign => (
              <Card
                key={campaign.id}
                className="bg-slate-800/50 backdrop-blur-sm border-purple-600/30 hover:border-purple-500/50 transition-all duration-300 transform hover:scale-105"
              >
                <CardHeader>
                  <div className="flex justify-between items-start w-full">
                    <div>
                      <h3 className="text-xl font-bold text-purple-300">
                        {campaign.name}
                      </h3>
                      <p className="text-gray-400 text-sm">
                        {campaign.settings.rpgSystem} •{' '}
                        {campaign.players.length} players
                      </p>
                    </div>
                    <Chip
                      color={getStatusColor(campaign.status)}
                      variant="flat"
                      size="sm"
                    >
                      {campaign.status}
                    </Chip>
                  </div>
                </CardHeader>
                <CardBody>
                  <p className="text-gray-300 text-sm mb-4 line-clamp-3">
                    {campaign.description}
                  </p>
                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>Created:</span>
                      <span>{formatDate(campaign.createdAt)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>Updated:</span>
                      <span>{formatDate(campaign.updatedAt)}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      color="primary"
                      variant="flat"
                      size="sm"
                      className="flex-1"
                      as={Link}
                      href={`/campaigns/${campaign.id}`}
                    >
                      View
                    </Button>
                    {isGM && (
                      <Button
                        color="secondary"
                        variant="flat"
                        size="sm"
                        className="flex-1"
                        as={Link}
                        href={`/campaigns/${campaign.id}/manage`}
                      >
                        Manage
                      </Button>
                    )}
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
