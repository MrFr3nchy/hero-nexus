'use client';

import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Select,
  SelectItem,
  Spinner,
  Switch,
  Textarea,
} from '@heroui/react';
import { Input } from '@heroui/react';
import { useCallback, useEffect, useState } from 'react';

import {
  deleteHomebrewAction,
  listHomebrewAction,
  saveHomebrewAction,
} from '../actions';
import { HOMEBREW_TYPES, homebrewSchema } from '../schema';
import type { HomebrewRow, HomebrewType } from '@/server/homebrew';

const inputClassNames = {
  input: 'text-purple-100',
  inputWrapper: 'bg-slate-700/50 border-purple-600',
  label: 'text-purple-200',
};

export function HomebrewCreator() {
  const [items, setItems] = useState<HomebrewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    type: 'item' as HomebrewType,
    name: '',
    description: '',
    visibility: 'private' as 'private' | 'public',
  });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setItems(await listHomebrewAction());
    } catch {
      setError('Failed to load your homebrew.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    setError(null);
    const parsed = homebrewSchema.safeParse({ ...form, data: {} });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid input.');
      return;
    }
    setSaving(true);
    try {
      const result = await saveHomebrewAction(parsed.data);
      if (!result.ok) {
        setError(result.error ?? 'Failed to save.');
        return;
      }
      setForm({
        type: 'item',
        name: '',
        description: '',
        visibility: 'private',
      });
      await load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this homebrew item?')) return;
    await deleteHomebrewAction(id);
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const typeMeta = (type: HomebrewType) =>
    HOMEBREW_TYPES.find(t => t.id === type) ?? HOMEBREW_TYPES[2];

  return (
    <div className="space-y-8">
      <Card className="border-purple-600/30 bg-slate-800/50">
        <CardHeader>
          <h2 className="text-2xl font-bold text-purple-300">
            Create Homebrew
          </h2>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Name"
              value={form.name}
              onValueChange={v => setForm(f => ({ ...f, name: v }))}
              classNames={inputClassNames}
            />
            <Select
              label="Type"
              selectedKeys={[form.type]}
              onSelectionChange={keys => {
                const type = Array.from(keys)[0] as HomebrewType;
                setForm(f => ({ ...f, type }));
              }}
              classNames={{
                trigger: 'bg-slate-700/50 border-purple-600',
                value: 'text-purple-100',
                label: 'text-purple-200',
              }}
            >
              {HOMEBREW_TYPES.map(t => (
                <SelectItem key={t.id}>
                  {t.icon} {t.name}
                </SelectItem>
              ))}
            </Select>
          </div>
          <Textarea
            label="Description"
            value={form.description}
            onValueChange={v => setForm(f => ({ ...f, description: v }))}
            minRows={4}
            classNames={inputClassNames}
          />
          <Switch
            isSelected={form.visibility === 'public'}
            onValueChange={v =>
              setForm(f => ({ ...f, visibility: v ? 'public' : 'private' }))
            }
          >
            <span className="text-purple-200">
              Share to public marketplace (Phase 2)
            </span>
          </Switch>

          {error && (
            <div className="rounded-lg border border-red-600 bg-red-900/20 p-3 text-center text-sm text-red-300">
              {error}
            </div>
          )}

          <div className="flex justify-center">
            <Button
              size="lg"
              isLoading={saving}
              isDisabled={!form.name.trim()}
              onPress={handleCreate}
              className="bg-gradient-to-r from-purple-600 to-blue-600 px-8"
            >
              Create {typeMeta(form.type).name}
            </Button>
          </div>
        </CardBody>
      </Card>

      <div>
        <h2 className="mb-4 text-2xl font-bold text-purple-300">
          Your Homebrew ({items.length})
        </h2>
        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner color="secondary" />
          </div>
        ) : items.length === 0 ? (
          <Card className="border-purple-600/30 bg-slate-800/50">
            <CardBody className="py-8 text-center text-gray-300">
              Nothing homebrewed yet.
            </CardBody>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {items.map(item => (
              <Card
                key={item.id}
                className="border-purple-600/30 bg-slate-800/50"
              >
                <CardHeader className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{typeMeta(item.type).icon}</span>
                    <h3 className="font-bold text-purple-200">{item.name}</h3>
                  </div>
                  <Chip size="sm" variant="flat">
                    {item.visibility}
                  </Chip>
                </CardHeader>
                <CardBody>
                  <p className="mb-4 line-clamp-3 text-sm text-gray-300">
                    {item.description || 'No description.'}
                  </p>
                  <Button
                    color="danger"
                    variant="flat"
                    size="sm"
                    onPress={() => handleDelete(item.id)}
                  >
                    Delete
                  </Button>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
