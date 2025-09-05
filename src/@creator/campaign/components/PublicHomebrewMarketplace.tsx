'use client';

import { campaignService } from '@/@creator/campaign/services';
import { HOMEBREW_TYPES, PublicHomebrewItem } from '@/@creator/campaign/types';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Input,
  Select,
  SelectItem,
} from '@heroui/react';
import { useEffect, useState } from 'react';

interface PublicHomebrewMarketplaceProps {
  onAddToCharacter?: (_item: PublicHomebrewItem) => void;
  onAddToCampaign?: (_item: PublicHomebrewItem) => void;
}

export function PublicHomebrewMarketplace({
  onAddToCharacter,
  onAddToCampaign,
}: PublicHomebrewMarketplaceProps) {
  const [homebrewItems, setHomebrewItems] = useState<PublicHomebrewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedRpgSystem, setSelectedRpgSystem] = useState<string>('all');

  useEffect(() => {
    loadHomebrewItems();
  }, []);

  const loadHomebrewItems = async () => {
    try {
      setLoading(true);
      setError(null);
      const itemsData = await campaignService.getPublicHomebrew();
      setHomebrewItems(itemsData as unknown as PublicHomebrewItem[]);
    } catch (err) {
      console.error('Error loading homebrew items:', err);
      setError('Failed to load homebrew items');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (homebrewItem: PublicHomebrewItem) => {
    try {
      await campaignService.updateHomebrewDownloadCount(homebrewItem.id);
      // You might want to show a success message here
    } catch (err) {
      console.error('Error updating download count:', err);
    }
  };

  const filteredItems = homebrewItems.filter(item => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = selectedType === 'all' || item.type === selectedType;
    const matchesRpgSystem =
      selectedRpgSystem === 'all' || item.rpgSystem === selectedRpgSystem;

    return matchesSearch && matchesType && matchesRpgSystem;
  });

  const getTypeIcon = (type: PublicHomebrewItem['type']) => {
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">⏳</div>
          <p className="text-purple-200 text-lg">
            Loading homebrew marketplace...
          </p>
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
            🛒 Public Homebrew Marketplace
          </h1>
          <p className="text-xl text-purple-200 max-w-3xl mx-auto">
            Discover and download homebrew content created by the community
          </p>
        </div>

        {/* Filters */}
        <Card className="bg-slate-800/50 backdrop-blur-sm border-purple-600/30 mb-8">
          <CardBody>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                label="Search"
                placeholder="Search homebrew items..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                classNames={{
                  input: 'text-purple-100',
                  inputWrapper: 'bg-slate-700/50 border-purple-600',
                  label: 'text-purple-200',
                }}
              />

              <Select
                label="Type"
                placeholder="All Types"
                selectedKeys={[selectedType]}
                onSelectionChange={keys => {
                  const selected = Array.from(keys)[0] as string;
                  setSelectedType(selected);
                }}
                classNames={{
                  trigger: 'bg-slate-700/50 border-purple-600',
                  value: 'text-purple-100',
                  label: 'text-purple-200',
                }}
                items={[
                  { id: 'all', name: 'All Types', icon: '🔍' },
                  ...HOMEBREW_TYPES,
                ]}
              >
                {item => (
                  <SelectItem key={item.id}>
                    <div className="flex items-center gap-2">
                      <span>{item.icon}</span>
                      <span>{item.name}</span>
                    </div>
                  </SelectItem>
                )}
              </Select>

              <Select
                label="RPG System"
                placeholder="All Systems"
                selectedKeys={[selectedRpgSystem]}
                onSelectionChange={keys => {
                  const selected = Array.from(keys)[0] as string;
                  setSelectedRpgSystem(selected);
                }}
                classNames={{
                  trigger: 'bg-slate-700/50 border-purple-600',
                  value: 'text-purple-100',
                  label: 'text-purple-200',
                }}
              >
                <SelectItem key="all">All Systems</SelectItem>
                <SelectItem key="dnd5e2024">D&D 5e 2024</SelectItem>
                <SelectItem key="pathfinder2e">Pathfinder 2e</SelectItem>
                <SelectItem key="callofcthulhu">Call of Cthulhu</SelectItem>
                <SelectItem key="vampire5e">Vampire: The Masquerade</SelectItem>
              </Select>
            </div>
          </CardBody>
        </Card>

        {/* Results */}
        {filteredItems.length === 0 ? (
          <Card className="bg-slate-800/50 backdrop-blur-sm border-amber-600/30">
            <CardBody className="text-center py-12">
              <h3 className="text-2xl font-bold text-amber-300 mb-4">
                No Items Found
              </h3>
              <p className="text-gray-300">
                Try adjusting your search filters or check back later for new
                content.
              </p>
            </CardBody>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredItems.map(item => (
              <Card
                key={item.id}
                className="bg-slate-800/50 backdrop-blur-sm border-purple-600/30 hover:border-purple-500/50 transition-all duration-300 transform hover:scale-105"
              >
                <CardHeader>
                  <div className="flex justify-between items-start w-full">
                    <div className="flex items-center gap-3">
                      <div className="text-2xl">{getTypeIcon(item.type)}</div>
                      <div>
                        <h3 className="text-lg font-bold text-purple-300">
                          {item.name}
                        </h3>
                        <p className="text-sm text-gray-400">
                          {item.rpgSystem} • {item.downloadCount} downloads
                        </p>
                      </div>
                    </div>
                    <Chip color="primary" variant="flat" size="sm">
                      {item.type}
                    </Chip>
                  </div>
                </CardHeader>
                <CardBody>
                  <p className="text-gray-300 text-sm mb-4 line-clamp-3">
                    {item.description}
                  </p>

                  <div className="space-y-2 mb-4">
                    <div className="flex flex-wrap gap-1">
                      {item.tags.map(tag => (
                        <Chip
                          key={tag}
                          size="sm"
                          variant="flat"
                          className="text-xs"
                        >
                          {tag}
                        </Chip>
                      ))}
                    </div>
                    <div className="text-xs text-gray-400">
                      Created: {formatDate(item.createdAt)}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      color="primary"
                      variant="flat"
                      size="sm"
                      className="flex-1"
                      onPress={() => handleDownload(item)}
                    >
                      📥 Download
                    </Button>
                    {onAddToCharacter && (
                      <Button
                        color="secondary"
                        variant="flat"
                        size="sm"
                        onPress={() => onAddToCharacter(item)}
                      >
                        ➕ Add to Character
                      </Button>
                    )}
                    {onAddToCampaign && (
                      <Button
                        color="warning"
                        variant="flat"
                        size="sm"
                        onPress={() => onAddToCampaign(item)}
                      >
                        🏰 Add to Campaign
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
