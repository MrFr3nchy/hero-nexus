'use client';

import { useAuth } from '@/@auth/context';
import { campaignService } from '@/@creator/campaign/services';
import { CampaignSettings, RPG_SYSTEMS } from '@/@creator/campaign/types';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  Select,
  SelectItem,
  Textarea,
} from '@heroui/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function CampaignCreationForm() {
  const { currentUser } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [campaignData, setCampaignData] = useState({
    name: '',
    description: '',
    settings: {
      rpgSystem: 'dnd5e2024',
      allowHomebrew: true,
      requireHomebrewApproval: true,
      allowPublicHomebrew: true,
      maxPlayers: 6,
      sessionNotes: '',
      customRules: '',
    } as CampaignSettings,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    setLoading(true);
    setError(null);

    try {
      const result = await campaignService.createCampaign({
        name: campaignData.name,
        description: campaignData.description,
        settings: campaignData.settings,
      });

      if (!result.ok) {
        setError(
          result.error ?? 'Failed to create campaign. Please try again.'
        );
        return;
      }

      router.push('/campaigns');
      router.refresh();
    } catch (err) {
      console.error('Error creating campaign:', err);
      setError('Failed to create campaign. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field: string, value: unknown) => {
    setCampaignData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const updateSettings = (field: keyof CampaignSettings, value: unknown) => {
    setCampaignData(prev => ({
      ...prev,
      settings: {
        ...prev.settings,
        [field]: value,
      },
    }));
  };

  return (
    <div className="min-h-screen bg-bg py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl text-ink mb-4">
            ✨ Create New Campaign
          </h1>
          <p className="text-xl text-ink-muted max-w-3xl mx-auto">
            Set up your campaign and invite players to join your adventure
          </p>
        </div>

        <Card className=" border-line">
          <CardHeader>
            <h2 className="text-2xl font-bold text-ink">Campaign Details</h2>
          </CardHeader>
          <CardBody>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Basic Information */}
              <div className="space-y-4">
                <Input
                  label="Campaign Name"
                  placeholder="Enter your campaign name"
                  value={campaignData.name}
                  onChange={e => updateField('name', e.target.value)}
                  required
                  classNames={{
                    input: 'text-ink',
                    inputWrapper: 'bg-surface-2 border-line',
                    label: 'text-ink-muted',
                  }}
                />

                <Textarea
                  label="Description"
                  placeholder="Describe your campaign world, story, and what players can expect..."
                  value={campaignData.description}
                  onChange={e => updateField('description', e.target.value)}
                  required
                  minRows={4}
                  classNames={{
                    input: 'text-ink',
                    inputWrapper: 'bg-surface-2 border-line',
                    label: 'text-ink-muted',
                  }}
                />
              </div>

              {/* RPG System */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-ink">RPG System</h3>
                <Select
                  label="Select RPG System"
                  placeholder="Choose your RPG system"
                  selectedKeys={[campaignData.settings.rpgSystem]}
                  onSelectionChange={keys => {
                    const selected = Array.from(keys)[0] as string;
                    updateSettings('rpgSystem', selected);
                  }}
                  classNames={{
                    trigger: 'bg-surface-2 border-line',
                    value: 'text-ink',
                    label: 'text-ink-muted',
                  }}
                >
                  {RPG_SYSTEMS.map(system => (
                    <SelectItem key={system.id}>
                      <div>
                        <div className="font-semibold">{system.name}</div>
                        <div className="text-sm text-ink-subtle">
                          {system.version}
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </Select>
              </div>

              {/* Campaign Settings */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-ink">
                  Campaign Settings
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    type="number"
                    label="Maximum Players"
                    placeholder="6"
                    value={campaignData.settings.maxPlayers.toString()}
                    onChange={e =>
                      updateSettings(
                        'maxPlayers',
                        parseInt(e.target.value) || 6
                      )
                    }
                    min={1}
                    max={20}
                    classNames={{
                      input: 'text-ink',
                      inputWrapper: 'bg-surface-2 border-line',
                      label: 'text-ink-muted',
                    }}
                  />
                </div>

                <Textarea
                  label="Session Notes"
                  placeholder="Add any notes about your campaign sessions..."
                  value={campaignData.settings.sessionNotes}
                  onChange={e => updateSettings('sessionNotes', e.target.value)}
                  minRows={3}
                  classNames={{
                    input: 'text-ink',
                    inputWrapper: 'bg-surface-2 border-line',
                    label: 'text-ink-muted',
                  }}
                />

                <Textarea
                  label="Custom Rules"
                  placeholder="Any house rules or custom modifications for your campaign..."
                  value={campaignData.settings.customRules}
                  onChange={e => updateSettings('customRules', e.target.value)}
                  minRows={3}
                  classNames={{
                    input: 'text-ink',
                    inputWrapper: 'bg-surface-2 border-line',
                    label: 'text-ink-muted',
                  }}
                />
              </div>

              {/* Error Display */}
              {error && (
                <div className="text-danger text-sm text-center bg-danger/10 p-3 rounded-lg border border-danger/40">
                  {error}
                </div>
              )}

              {/* Submit Button */}
              <div className="flex justify-center">
                <Button
                  type="submit"
                  color="primary"
                  size="lg"
                  className=""
                  isLoading={loading}
                  disabled={loading}
                >
                  {loading ? 'Creating Campaign...' : '✨ Create Campaign'}
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
