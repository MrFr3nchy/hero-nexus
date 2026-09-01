'use client';

import { Button, Chip, Link, Snippet, Tab, Tabs } from '@heroui/react';

import {
  PageHeader,
  PageShell,
  SectionCard,
  Stat,
} from '@/@shared/components/ui';
import type { CampaignRow } from '@/server/campaigns';
import { HomebrewApprovalPanel } from './HomebrewApprovalPanel';
import { MembersPanel } from './MembersPanel';

export function CampaignDetail({
  campaign,
  viewerId,
}: {
  campaign: CampaignRow;
  viewerId: string;
}) {
  const isStaff = campaign.role === 'gm' || campaign.role === 'co-gm';

  return (
    <PageShell width="wide">
      <PageHeader
        eyebrow="Campaign"
        title={campaign.name}
        description={campaign.description || undefined}
        actions={
          <>
            <Chip size="sm" variant="flat" className="bg-surface-2">
              {campaign.role === 'gm'
                ? 'DM'
                : campaign.role === 'co-gm'
                  ? 'Co-DM'
                  : 'Player'}
            </Chip>
            {isStaff && (
              <Button
                as={Link}
                href={`/campaigns/${campaign.id}/manage`}
                size="sm"
                variant="flat"
              >
                Manage
              </Button>
            )}
          </>
        }
      />

      <Tabs aria-label="Campaign sections" variant="underlined">
        <Tab key="overview" title="Overview">
          <div className="space-y-5 pt-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Status" value={campaign.status} />
              <Stat label="Members" value={campaign.memberCount} />
              <Stat label="Max players" value={campaign.settings.maxPlayers} />
              <Stat label="System" value={campaign.settings.rpgSystem} />
            </div>

            {isStaff && campaign.joinCode && (
              <SectionCard
                title="Join code"
                description="Share this so players can join themselves."
              >
                <Snippet symbol="" variant="flat" className="bg-surface-2">
                  {campaign.joinCode}
                </Snippet>
              </SectionCard>
            )}

            {campaign.settings.sessionNotes && (
              <SectionCard title="Session notes">
                <p className="whitespace-pre-wrap text-sm text-ink-muted">
                  {campaign.settings.sessionNotes}
                </p>
              </SectionCard>
            )}
            {campaign.settings.customRules && (
              <SectionCard title="House rules">
                <p className="whitespace-pre-wrap text-sm text-ink-muted">
                  {campaign.settings.customRules}
                </p>
              </SectionCard>
            )}
          </div>
        </Tab>

        <Tab key="players" title="Players">
          <div className="pt-4">
            <MembersPanel
              campaignId={campaign.id}
              viewerId={viewerId}
              viewerRole={campaign.role}
            />
          </div>
        </Tab>

        <Tab key="homebrew" title="Homebrew">
          <div className="pt-4">
            <HomebrewApprovalPanel campaignId={campaign.id} isGM={isStaff} />
          </div>
        </Tab>

        <Tab key="session" title="Session">
          <div className="pt-4">
            <SectionCard title="Live session">
              <p className="text-sm text-ink-muted">
                Initiative tracker and handouts land here soon.
              </p>
            </SectionCard>
          </div>
        </Tab>
      </Tabs>
    </PageShell>
  );
}
