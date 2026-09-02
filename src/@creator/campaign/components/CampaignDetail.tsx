'use client';

import { Button, Link, Snippet, Tab, Tabs } from '@heroui/react';

import {
  PageHeader,
  PageShell,
  Ribbon,
  SectionCard,
  Stat,
} from '@/@shared/components/ui';
import type { CampaignRow } from '@/server/campaigns';
import { HomebrewApprovalPanel } from './HomebrewApprovalPanel';
import { MembersPanel } from './MembersPanel';
import { SessionPanel } from './session/SessionPanel';

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
        title={campaign.name}
        description={campaign.description || undefined}
        actions={
          <>
            <Ribbon
              tone={
                campaign.role === 'gm'
                  ? 'gold'
                  : campaign.role === 'co-gm'
                    ? 'arcane'
                    : 'neutral'
              }
            >
              {campaign.role === 'gm'
                ? 'DM'
                : campaign.role === 'co-gm'
                  ? 'Co-DM'
                  : 'Player'}
            </Ribbon>
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
            <SessionPanel campaignId={campaign.id} />
          </div>
        </Tab>
      </Tabs>
    </PageShell>
  );
}
