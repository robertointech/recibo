'use client';

import { useState, useEffect, useCallback } from 'react';

const API = 'http://localhost:3333';

type EventType = 'HELD' | 'DELIVERED' | 'RELEASED' | 'REFUNDED';
type EscrowState = 'HELD' | 'DELIVERED' | 'RELEASED' | 'REFUNDED';

interface HCSEvent {
  type: EventType;
  topicId: string;
  sequenceNumber: string;
  consensusTimestamp: string;
  transactionId?: string;
}

interface Escrow {
  escrowId: string;
  payer: string;
  provider: string;
  amount: number;
  state: EscrowState;
  responseHash: string | null;
  events: HCSEvent[];
}

interface Status {
  escrowAccount: string;
  topicId: string;
  network: string;
  facilitator: string;
}

const STATE: Record<EscrowState, { badge: string; dot: string }> = {
  HELD:      { badge: 'bg-amber-500/10 text-amber-300 border border-amber-500/30',      dot: 'bg-amber-400' },
  DELIVERED: { badge: 'bg-sky-500/10 text-sky-300 border border-sky-500/30',            dot: 'bg-sky-400' },
  RELEASED:  { badge: 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30', dot: 'bg-emerald-400' },
  REFUNDED:  { badge: 'bg-rose-500/10 text-rose-300 border border-rose-500/30',         dot: 'bg-rose-400' },
};

const EV_COLOR: Record<EventType, string> = {
  HELD:      'text-amber-400',
  DELIVERED: 'text-sky-400',
  RELEASED:  'text-emerald-400',
  REFUNDED:  'text-rose-400',
};

function short(id: string, n = 8) {
  return id.length > n + 6 ? `${id.slice(0, n)}…${id.slice(-4)}` : id;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour12: false });
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
       className="text-amber-400 hover:text-amber-300 underline underline-offset-2 transition-colors duration-150 cursor-pointer font-mono text-xs">
      {children}
    </a>
  );
}

function Badge({ state }: { state: EscrowState }) {
  const s = STATE[state];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-xs font-mono font-medium ${s.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} />
      {state}
    </span>
  );
}

function EscrowCard({ e }: { e: Escrow }) {
  const topicId = e.events[0]?.topicId;
  const network = 'testnet';
  return (
    <div className="border border-zinc-800 bg-zinc-900/50 rounded-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-mono text-xs text-zinc-400 shrink-0">{short(e.escrowId)}</span>
          <Badge state={e.state} />
        </div>
        <span className="font-mono text-sm text-zinc-100 shrink-0 ml-4">{e.amount} HBAR</span>
      </div>

      <div className="px-4 py-1.5 border-b border-zinc-800/50 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
        <span className="text-zinc-600">payer</span>
        <span className="font-mono text-zinc-400">{e.payer}</span>
        <span className="text-zinc-700 mx-0.5">→</span>
        <span className="text-zinc-600">provider</span>
        <span className="font-mono text-zinc-400">{e.provider}</span>
      </div>

      <div className="divide-y divide-zinc-800/30">
        {e.events.map((ev, i) => (
          <div key={i} className="px-4 py-2 flex items-start gap-3 text-xs">
            <span className="text-zinc-700 font-mono w-5 text-right shrink-0 pt-px">{ev.sequenceNumber}</span>
            <span className={`font-mono font-semibold w-20 shrink-0 ${EV_COLOR[ev.type]}`}>{ev.type}</span>
            <span className="text-zinc-600 font-mono shrink-0 pt-px">{fmtTime(ev.consensusTimestamp)}</span>
            <div className="flex-1 flex flex-col gap-0.5 min-w-0">
              {e.responseHash && ev.type === 'DELIVERED' && (
                <span className="font-mono text-zinc-500 truncate">
                  sha256:{e.responseHash.slice(0, 20)}…
                </span>
              )}
              {ev.transactionId && (
                <ExternalLink href={`https://hashscan.io/${network}/transaction/${ev.transactionId}`}>
                  tx:{short(ev.transactionId, 14)} ↗
                </ExternalLink>
              )}
              {topicId && (
                <ExternalLink href={`https://hashscan.io/${network}/topic/${topicId}`}>
                  HCS seq:{ev.sequenceNumber} ↗
                </ExternalLink>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Page() {
  const [escrows, setEscrows] = useState<Escrow[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const poll = useCallback(async () => {
    try {
      const [sRes, eRes] = await Promise.all([
        fetch(`${API}/status`),
        fetch(`${API}/escrows`),
      ]);
      const [s, list]: [Status, Escrow[]] = await Promise.all([sRes.json(), eRes.json()]);
      setStatus(s);
      setEscrows([...list].sort((a, b) => {
        const ta = a.events[0]?.consensusTimestamp ?? '';
        const tb = b.events[0]?.consensusTimestamp ?? '';
        return tb.localeCompare(ta);
      }));
      setLastUpdated(new Date());
      setError(null);
    } catch {
      setError('Cannot reach server — is it running on :3333?');
    }
  }, []);

  useEffect(() => {
    poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, [poll]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-5 flex-wrap">
            <span className="text-sm font-semibold tracking-widest text-amber-400">RECIBO</span>
            {status && (
              <>
                <span className="text-xs text-zinc-500">
                  escrow <span className="font-mono text-zinc-300">{status.escrowAccount}</span>
                </span>
                <span className="text-xs text-zinc-500">
                  topic{' '}
                  <ExternalLink href={`https://hashscan.io/${status.network}/topic/${status.topicId}`}>
                    {status.topicId} ↗
                  </ExternalLink>
                </span>
                <span className="font-mono text-xs text-zinc-600">{status.network}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-zinc-600">
            {lastUpdated && <span className="font-mono">{fmtTime(lastUpdated.toISOString())}</span>}
            <span className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${error ? 'bg-rose-500' : 'bg-emerald-400 animate-pulse'}`} />
              <span className={error ? 'text-rose-400' : 'text-zinc-500'}>{error ? 'offline' : 'live'}</span>
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {error && (
          <div className="border border-rose-800 bg-rose-950/30 rounded-sm px-4 py-3 text-sm text-rose-300 font-mono mb-6">
            {error}
          </div>
        )}

        {escrows.length === 0 && !error ? (
          <div className="flex flex-col items-center justify-center py-32 text-zinc-700">
            <div className="font-mono text-sm">no escrows</div>
            <div className="text-xs mt-1.5">
              run <span className="font-mono text-zinc-500">npm run pay</span> or{' '}
              <span className="font-mono text-zinc-500">npm run pay -- /service-flaky</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-zinc-600 font-mono">{escrows.length} escrow{escrows.length !== 1 ? 's' : ''}</span>
            </div>
            {escrows.map(e => <EscrowCard key={e.escrowId} e={e} />)}
          </div>
        )}
      </main>
    </div>
  );
}
