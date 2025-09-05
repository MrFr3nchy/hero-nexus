'use client';

import { Character } from '@/@creator/character/types';
import ProtectedRoute from '@/@shared/components/ProtectedRoute';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Divider,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
  Textarea,
  useDisclosure,
} from '@heroui/react';
import { useState } from 'react';
import { HomebrewItem } from './entities';

function CharacterCreatorContent() {
  const [characters, setCharacters] = useState<Character[]>([
    {
      id: '1',
      name: 'Aelindra Shadowstep',
      class: 'Rogue',
      level: 5,
      createdAt: new Date('2024-01-15'),
    },
    {
      id: '2',
      name: 'Thorin Ironbeard',
      class: 'Fighter',
      level: 3,
      createdAt: new Date('2024-01-20'),
    },
  ]);

  const [homebrewItems, setHomebrewItems] = useState<HomebrewItem[]>([
    {
      id: '1',
      name: 'Shadow Dancer',
      type: 'class',
      description: 'A rogue subclass focused on mobility and stealth',
      createdAt: new Date('2024-01-10'),
    },
    {
      id: '2',
      name: 'Flame Blade',
      type: 'spell',
      description: 'A 2nd-level evocation spell that creates a sword of fire',
      createdAt: new Date('2024-01-12'),
    },
    {
      id: '3',
      name: 'Dragon Scale Armor',
      type: 'item',
      description: 'Light armor made from ancient dragon scales',
      createdAt: new Date('2024-01-18'),
    },
  ]);

  const [newCharacter, setNewCharacter] = useState({
    name: '',
    class: '',
    level: 1,
  });

  const [newHomebrewItem, setNewHomebrewItem] = useState({
    name: '',
    type: 'class' as 'class' | 'item' | 'spell',
    description: '',
  });

  const {
    isOpen: isCharacterModalOpen,
    onOpen: onCharacterModalOpen,
    onClose: onCharacterModalClose,
  } = useDisclosure();
  const {
    isOpen: isHomebrewModalOpen,
    onOpen: onHomebrewModalOpen,
    onClose: onHomebrewModalClose,
  } = useDisclosure();

  const handleCreateCharacter = () => {
    if (newCharacter.name && newCharacter.class) {
      const character: Character = {
        id: Date.now().toString(),
        name: newCharacter.name,
        class: newCharacter.class,
        level: newCharacter.level,
        createdAt: new Date(),
      };
      setCharacters([...characters, character]);
      setNewCharacter({ name: '', class: '', level: 1 });
      onCharacterModalClose();
    }
  };

  const handleCreateHomebrewItem = () => {
    if (newHomebrewItem.name && newHomebrewItem.description) {
      const item: HomebrewItem = {
        id: Date.now().toString(),
        name: newHomebrewItem.name,
        type: newHomebrewItem.type,
        description: newHomebrewItem.description,
        createdAt: new Date(),
      };
      setHomebrewItems([...homebrewItems, item]);
      setNewHomebrewItem({ name: '', type: 'class', description: '' });
      onHomebrewModalClose();
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'class':
        return 'primary';
      case 'item':
        return 'secondary';
      case 'spell':
        return 'warning';
      default:
        return 'default';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'class':
        return '⚔️';
      case 'item':
        return '🛡️';
      case 'spell':
        return '✨';
      default:
        return '📝';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">
            🗡️ Character Creator
          </h1>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            Forge your legendary hero from the ground up. Choose your class,
            customize your abilities, and create a character worthy of epic
            tales.
          </p>
        </div>

        {/* Character Creation Section */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-3xl font-bold text-amber-300 flex items-center gap-3">
              🎭 Your Characters
              <Badge color="primary" size="lg">
                {characters.length}
              </Badge>
            </h2>
            <Button
              color="primary"
              size="lg"
              onPress={onCharacterModalOpen}
              className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500"
            >
              + Create New Character
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {characters.map(character => (
              <Card
                key={character.id}
                className="bg-slate-800/50 backdrop-blur-sm border-amber-600/30 hover:border-amber-500/50 transition-all duration-300 hover:scale-105"
              >
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start w-full">
                    <div>
                      <h3 className="text-xl font-bold text-amber-100">
                        {character.name}
                      </h3>
                      <p className="text-amber-300 text-sm">
                        Level {character.level} {character.class}
                      </p>
                    </div>
                    <Badge color="success" variant="flat">
                      Active
                    </Badge>
                  </div>
                </CardHeader>
                <CardBody className="pt-0">
                  <p className="text-gray-400 text-sm mb-4">
                    Created: {character.createdAt.toLocaleDateString()}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      color="primary"
                      variant="flat"
                      className="flex-1"
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      color="default"
                      variant="flat"
                      className="flex-1"
                    >
                      View
                    </Button>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        </div>

        <Divider className="my-12 bg-amber-600/30" />

        {/* Homebrew Items Section */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-3xl font-bold text-amber-300 flex items-center gap-3">
              🔧 Create Homebrew Items
              <Badge color="secondary" size="lg">
                {homebrewItems.length}
              </Badge>
            </h2>
            <Button
              color="secondary"
              size="lg"
              onPress={onHomebrewModalOpen}
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500"
            >
              + Create Homebrew Item
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {homebrewItems.map(item => (
              <Card
                key={item.id}
                className="bg-slate-800/50 backdrop-blur-sm border-purple-600/30 hover:border-purple-500/50 transition-all duration-300 hover:scale-105"
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-3 w-full">
                    <span className="text-2xl">{getTypeIcon(item.type)}</span>
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-amber-100">
                        {item.name}
                      </h3>
                      <Badge
                        color={getTypeColor(item.type)}
                        variant="flat"
                        size="sm"
                      >
                        {item.type.toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardBody className="pt-0">
                  <p className="text-gray-300 text-sm mb-4 line-clamp-3">
                    {item.description}
                  </p>
                  <p className="text-gray-400 text-xs mb-4">
                    Created: {item.createdAt.toLocaleDateString()}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      color="primary"
                      variant="flat"
                      className="flex-1"
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      color="default"
                      variant="flat"
                      className="flex-1"
                    >
                      Use
                    </Button>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        </div>

        {/* Character Creation Modal */}
        <Modal
          isOpen={isCharacterModalOpen}
          onClose={onCharacterModalClose}
          className="bg-slate-800 border-amber-600 border-2"
        >
          <ModalContent>
            <ModalHeader className="text-amber-100">
              Create New Character
            </ModalHeader>
            <ModalBody>
              <div className="space-y-4">
                <Input
                  label="Character Name"
                  placeholder="Enter character name"
                  value={newCharacter.name}
                  onChange={e =>
                    setNewCharacter({ ...newCharacter, name: e.target.value })
                  }
                  classNames={{
                    input: 'text-amber-100',
                    inputWrapper: 'bg-slate-700/50 border-amber-600',
                    label: 'text-amber-200',
                  }}
                />
                <Input
                  label="Class"
                  placeholder="Enter character class"
                  value={newCharacter.class}
                  onChange={e =>
                    setNewCharacter({ ...newCharacter, class: e.target.value })
                  }
                  classNames={{
                    input: 'text-amber-100',
                    inputWrapper: 'bg-slate-700/50 border-amber-600',
                    label: 'text-amber-200',
                  }}
                />
                <Input
                  type="number"
                  label="Level"
                  placeholder="1"
                  value={newCharacter.level.toString()}
                  onChange={e =>
                    setNewCharacter({
                      ...newCharacter,
                      level: parseInt(e.target.value) || 1,
                    })
                  }
                  classNames={{
                    input: 'text-amber-100',
                    inputWrapper: 'bg-slate-700/50 border-amber-600',
                    label: 'text-amber-200',
                  }}
                />
              </div>
            </ModalBody>
            <ModalFooter>
              <Button
                color="danger"
                variant="light"
                onPress={onCharacterModalClose}
              >
                Cancel
              </Button>
              <Button
                color="primary"
                onPress={handleCreateCharacter}
                className="bg-gradient-to-r from-amber-600 to-orange-600"
              >
                Create Character
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>

        {/* Homebrew Item Creation Modal */}
        <Modal
          isOpen={isHomebrewModalOpen}
          onClose={onHomebrewModalClose}
          className="bg-slate-800 border-purple-600 border-2"
        >
          <ModalContent>
            <ModalHeader className="text-amber-100">
              Create Homebrew Item
            </ModalHeader>
            <ModalBody>
              <div className="space-y-4">
                <Input
                  label="Item Name"
                  placeholder="Enter item name"
                  value={newHomebrewItem.name}
                  onChange={e =>
                    setNewHomebrewItem({
                      ...newHomebrewItem,
                      name: e.target.value,
                    })
                  }
                  classNames={{
                    input: 'text-amber-100',
                    inputWrapper: 'bg-slate-700/50 border-amber-600',
                    label: 'text-amber-200',
                  }}
                />
                <Select
                  label="Item Type"
                  placeholder="Select item type"
                  selectedKeys={[newHomebrewItem.type]}
                  onSelectionChange={keys => {
                    const selectedType = Array.from(keys)[0] as
                      | 'class'
                      | 'item'
                      | 'spell';
                    setNewHomebrewItem({
                      ...newHomebrewItem,
                      type: selectedType,
                    });
                  }}
                  classNames={{
                    trigger: 'bg-slate-700/50 border-amber-600',
                    value: 'text-amber-100',
                    label: 'text-amber-200',
                  }}
                >
                  <SelectItem key="class">
                    <div className="flex items-center gap-2">
                      <span>⚔️</span>
                      <span>Class</span>
                    </div>
                  </SelectItem>
                  <SelectItem key="item">
                    <div className="flex items-center gap-2">
                      <span>🛡️</span>
                      <span>Item</span>
                    </div>
                  </SelectItem>
                  <SelectItem key="spell">
                    <div className="flex items-center gap-2">
                      <span>✨</span>
                      <span>Spell</span>
                    </div>
                  </SelectItem>
                </Select>
                <Textarea
                  label="Description"
                  placeholder="Enter item description"
                  value={newHomebrewItem.description}
                  onChange={e =>
                    setNewHomebrewItem({
                      ...newHomebrewItem,
                      description: e.target.value,
                    })
                  }
                  classNames={{
                    input: 'text-amber-100',
                    inputWrapper: 'bg-slate-700/50 border-amber-600',
                    label: 'text-amber-200',
                  }}
                />
              </div>
            </ModalBody>
            <ModalFooter>
              <Button
                color="danger"
                variant="light"
                onPress={onHomebrewModalClose}
              >
                Cancel
              </Button>
              <Button
                color="secondary"
                onPress={handleCreateHomebrewItem}
                className="bg-gradient-to-r from-purple-600 to-blue-600"
              >
                Create Item
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      </div>
    </div>
  );
}

export default function CharacterCreatorPage() {
  return (
    <ProtectedRoute>
      <CharacterCreatorContent />
    </ProtectedRoute>
  );
}
