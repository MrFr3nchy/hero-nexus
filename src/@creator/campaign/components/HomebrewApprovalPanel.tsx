'use client';

import { campaignService } from '@/@creator/campaign/services';
import { HOMEBREW_TYPES, HomebrewApproval } from '@/@creator/campaign/types';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Textarea,
} from '@heroui/react';
import { useCallback, useEffect, useState } from 'react';

interface HomebrewApprovalPanelProps {
  campaignId: string;
  isGM: boolean;
}

export function HomebrewApprovalPanel({
  campaignId,
  isGM,
}: HomebrewApprovalPanelProps) {
  const [approvals, setApprovals] = useState<HomebrewApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadApprovals = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const approvalsData =
        await campaignService.getPendingApprovals(campaignId);
      setApprovals(approvalsData as unknown as HomebrewApproval[]);
    } catch (err) {
      console.error('Error loading approvals:', err);
      setError('Failed to load homebrew approvals');
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    loadApprovals();
  }, [loadApprovals]);

  const handleApproval = async (
    approvalId: string,
    status: 'approved' | 'denied',
    reviewNotes?: string
  ) => {
    try {
      await campaignService.updateApprovalStatus(
        approvalId,
        status,
        reviewNotes
      );
      await loadApprovals(); // Refresh the list
    } catch (err) {
      console.error('Error updating approval:', err);
      setError('Failed to update approval status');
    }
  };

  const getStatusColor = (status: HomebrewApproval['status']) => {
    switch (status) {
      case 'pending':
        return 'warning';
      case 'approved':
        return 'success';
      case 'denied':
        return 'danger';
      default:
        return 'default';
    }
  };

  const getTypeIcon = (type: HomebrewApproval['homebrewType']) => {
    const typeInfo = HOMEBREW_TYPES.find(t => t.id === type);
    return typeInfo?.icon || '📝';
  };

  const formatDate = (date: unknown) => {
    if (!date) return 'Unknown';
    if (typeof date === 'object' && date !== null && 'toDate' in date) {
      return (date as { toDate: () => Date }).toDate().toLocaleDateString();
    }
    return new Date(date as string | number).toLocaleDateString();
  };

  if (!isGM) {
    return (
      <Card className="bg-slate-800/50 backdrop-blur-sm border-amber-600/30">
        <CardBody className="text-center py-8">
          <div className="text-4xl mb-4">🔒</div>
          <h3 className="text-xl font-bold text-amber-300 mb-2">
            GM Only Access
          </h3>
          <p className="text-gray-300">
            Only the Game Master can manage homebrew approvals.
          </p>
        </CardBody>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="bg-slate-800/50 backdrop-blur-sm border-purple-600/30">
        <CardBody className="text-center py-8">
          <div className="text-4xl mb-4">⏳</div>
          <p className="text-purple-200">Loading homebrew approvals...</p>
        </CardBody>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-slate-800/50 backdrop-blur-sm border-red-600/30">
        <CardBody className="text-center py-8">
          <div className="text-4xl mb-4">❌</div>
          <p className="text-red-300">Error: {error}</p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-white mb-2">
          🔍 Homebrew Approval Panel
        </h2>
        <p className="text-purple-200">
          Review and approve homebrew content for your campaign
        </p>
      </div>

      {approvals.length === 0 ? (
        <Card className="bg-slate-800/50 backdrop-blur-sm border-green-600/30">
          <CardBody className="text-center py-8">
            <div className="text-4xl mb-4">✅</div>
            <h3 className="text-xl font-bold text-green-300 mb-2">
              All Caught Up!
            </h3>
            <p className="text-gray-300">
              No pending homebrew approvals at the moment.
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-4">
          {approvals.map(approval => (
            <Card
              key={approval.id}
              className="bg-slate-800/50 backdrop-blur-sm border-purple-600/30"
            >
              <CardHeader>
                <div className="flex justify-between items-start w-full">
                  <div className="flex items-center gap-3">
                    <div className="text-2xl">
                      {getTypeIcon(approval.homebrewType)}
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-purple-300">
                        {approval.homebrewType.charAt(0).toUpperCase() +
                          approval.homebrewType.slice(1)}{' '}
                        Approval Request
                      </h3>
                      <p className="text-sm text-gray-400">
                        Requested by: {approval.requestedByUserId}
                      </p>
                    </div>
                  </div>
                  <Chip
                    color={getStatusColor(approval.status)}
                    variant="flat"
                    size="sm"
                  >
                    {approval.status}
                  </Chip>
                </div>
              </CardHeader>
              <CardBody>
                <div className="space-y-4">
                  <div className="text-sm text-gray-300">
                    <p>
                      <strong>Homebrew ID:</strong> {approval.homebrewItemId}
                    </p>
                    <p>
                      <strong>Requested:</strong>{' '}
                      {formatDate(approval.createdAt)}
                    </p>
                  </div>

                  {approval.reviewNotes && (
                    <div>
                      <h4 className="text-sm font-semibold text-purple-200 mb-2">
                        Review Notes:
                      </h4>
                      <p className="text-sm text-gray-300 bg-slate-700/50 p-3 rounded">
                        {approval.reviewNotes}
                      </p>
                    </div>
                  )}

                  {approval.status === 'pending' && (
                    <div className="space-y-3">
                      <Textarea
                        label="Review Notes (Optional)"
                        placeholder="Add notes about your decision..."
                        classNames={{
                          input: 'text-purple-100',
                          inputWrapper: 'bg-slate-700/50 border-purple-600',
                          label: 'text-purple-200',
                        }}
                      />
                      <div className="flex gap-2">
                        <Button
                          color="success"
                          size="sm"
                          onPress={() =>
                            handleApproval(approval.id, 'approved')
                          }
                          className="flex-1"
                        >
                          ✅ Approve
                        </Button>
                        <Button
                          color="danger"
                          size="sm"
                          onPress={() => handleApproval(approval.id, 'denied')}
                          className="flex-1"
                        >
                          ❌ Deny
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
