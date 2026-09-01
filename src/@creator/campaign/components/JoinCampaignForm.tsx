'use client';

import { Button, Input } from '@heroui/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { SectionCard } from '@/@shared/components/ui';
import { joinCampaignAction } from '../actions';

export function JoinCampaignForm({ initialCode }: { initialCode?: string }) {
  const router = useRouter();
  const [code, setCode] = useState(initialCode ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const join = async (value: string) => {
    if (!value.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await joinCampaignAction(value);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/campaigns/${res.data.id}`);
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  // Auto-attempt when arriving with ?code=
  useEffect(() => {
    if (initialCode) join(initialCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  return (
    <SectionCard title="Join a campaign">
      <form
        onSubmit={e => {
          e.preventDefault();
          join(code);
        }}
        className="space-y-4"
      >
        <Input
          label="Join code"
          placeholder="e.g. kp7m2xqd"
          value={code}
          onValueChange={setCode}
          autoCapitalize="none"
          autoCorrect="off"
        />
        {error && (
          <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" color="primary" isLoading={loading}>
          Join
        </Button>
      </form>
    </SectionCard>
  );
}
