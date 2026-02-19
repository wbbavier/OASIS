'use client';
import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

interface InvitePanelProps {
  gameId: string;
}

export function InvitePanel({ gameId }: InvitePanelProps) {
  const [copied, setCopied] = useState(false);

  const joinUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/join/${gameId}`
      : `/join/${gameId}`;

  function handleCopy() {
    navigator.clipboard.writeText(joinUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <Card>
      <h3 className="mb-3 font-semibold text-stone-200">Invite players</h3>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded bg-stone-800 px-3 py-2 text-sm text-stone-300">
          {joinUrl}
        </code>
        <Button variant="secondary" size="sm" onClick={handleCopy}>
          {copied ? 'Copied!' : 'Copy'}
        </Button>
      </div>
    </Card>
  );
}
