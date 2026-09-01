'use client';

import { Card, CardBody } from '@heroui/react';

interface HomebrewApprovalPanelProps {
  campaignId: string;
  isGM: boolean;
}

/**
 * Phase 2: DM review of player-submitted homebrew (approve/deny + message).
 * `src/server/campaigns.ts#listPendingApprovals` and the `homebrew_approvals`
 * table already exist — this panel is wired once that workflow ships.
 */
export function HomebrewApprovalPanel({
  campaignId: _campaignId,
  isGM,
}: HomebrewApprovalPanelProps) {
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

  return (
    <Card className="bg-slate-800/50 backdrop-blur-sm border-purple-600/30">
      <CardBody className="text-center py-8">
        <div className="text-4xl mb-4">🚧</div>
        <h3 className="text-xl font-bold text-purple-300 mb-2">
          Coming in Phase 2
        </h3>
        <p className="text-gray-300">
          Players will be able to submit homebrew for this campaign, and
          you&apos;ll approve or deny it here with a message.
        </p>
      </CardBody>
    </Card>
  );
}
