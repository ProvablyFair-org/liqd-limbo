// Types mirror the exact capture schema in data/limbo-master-<N>bets.json (liqd-limbo-capture-v1).
// Field names match the dataset verbatim. Some fields are marked "populated at capture" — they
// are filled by the capture rig and re-derived independently in verify (never trusted as given).

export interface LimboParams {
  target: number;      // chosen target (cashout) multiplier, a 2-dp value in [1.01, 1_000_000]
}

export interface Seed {
  epoch: number;
  phase: string;                    // A | B | C | D
  at: string;
  clientSeed: string;
  hashedServerSeed: string;         // SHA-256(utf8(serverSeed hex string)) commitment
  nextHashedServerSeed: string;     // pre-commitment for next epoch (chain link)
  serverSeed: string | null;        // revealed on rotation
  nonceStart: number;               // operator-sourced: rotate response's post-rotation nonce (leading bound)
  nonceEnd: number | null;          // auditor-recorded: the capture's OWN last recorded nonce
  operatorBetCount?: number | null; // operator-sourced trailing bound if captured ("Total bets made with pair")
  commitVerified: boolean | null;   // capture-side flag (re-derived independently in verify)
  chainLinkOk: boolean | null;
}

export interface Bet {
  at: string;
  epoch: number;
  phase: string;                    // A | B | C | D
  id: string;
  params: LimboParams;
  nonce: number;
  clientSeed: string;
  serverSeedId: string;
  hashedServerSeed: string;
  result: number;                   // served RESULT (crash) multiplier, 2dp
  win: boolean;                     // served win flag
  multiplier: number;               // CAPTURE-COMPUTED: the capture script's fill (target on a win, 0 on a loss) — no kept casino response has a wager-level multiplier (Step 8)
  resultLabel: string;              // won | lost
  betAmount: number | string;       // stake in the account currency
  winningAmount: number | string;   // credited amount (0 on loss)
  stakeWallet?: number;             // wallet-denominated debit
  winningAmountWallet?: number;     // wallet-denominated credit
  // capture-side self-verification (informational; verify re-derives independently)
  localDraw?: number | null;        // k the rig computed
  localResult?: number | null;      // R the rig computed
  localWin?: boolean | null;
  verified?: boolean | null;
  creditedOk?: boolean | null;
  walletOk?: boolean | null;
}

export interface Dataset {
  meta: {
    audit: string; platform: string; gameId: string; schema: string;
    houseEdge: number; currency: string; epochSize: number; plannedTotal: number;
    limits?: { minMultiplier: number; maxMultiplier: number; minBetUsdc: number; maxBetUsdc: number };
    limboModel?: { range: number; cursor: number; resultNumerator: number; params: string[] };
    phases: Record<string, { bets: number; amount?: number; target?: string; customSeeds?: boolean }>;
    startedAt: string | null; finishedAt: string | null;
    progress?: Record<string, unknown>;
    preCapture?: Record<string, unknown> | null;
    edgeSummary?: Record<string, unknown>;
  };
  seeds: Seed[];
  bets: Bet[];
}

export type Severity = 'HARD_FAIL' | 'FLAG' | 'INFO' | 'PASS';
export interface StepResult { step: number; name: string; status: 'PASS' | 'FLAG' | 'FAIL'; detail: string; }
export interface InfoItem { label: string; detail: string; }
