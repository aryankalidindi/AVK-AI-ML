export type OrderState =
  | 'received'
  | 'parsing'
  | 'clarifying'
  | 'suggesting'
  | 'building_cart'
  | 'awaiting_confirmation'
  | 'placing'
  | 'placed'
  | 'failed'
  | 'cancelled'
  | 'expired';

export const TERMINAL_STATES: readonly OrderState[] = ['placed', 'failed', 'cancelled', 'expired'];

export interface RequestedItem {
  name: string;
  quantity: number;
}

export interface ClarifyChoice {
  id: string;
  label: string;
  refinedUtterance: string;
}

export interface ClarifyQuestion {
  question: string;
  choices: ClarifyChoice[];
}

export interface ParsedRequest {
  mode: 'specific' | 'category';
  items: RequestedItem[];
  restaurant: string | null;
  flavorNotes: string[];
  confidence: number;
  clarify: ClarifyQuestion | null;
}

export interface Candidate {
  id: string;
  itemName: string;
  description: string;
  priceCents: number | null;
  restaurant: string;
  rating: number | null;
  etaMinutes: number | null;
}

export interface RankedSuggestion extends Candidate {
  reason: string;
}

export interface CartLine {
  name: string;
  quantity: number;
  priceCents: number;
}

export interface CartSummary {
  restaurant: string;
  items: CartLine[];
  subtotalCents: number;
  feesCents: number;
  totalCents: number;
}

export interface Order {
  id: string;
  utterance: string;
  state: OrderState;
  createdAt: string;
  updatedAt: string;
  parsed?: ParsedRequest;
  suggestions?: RankedSuggestion[];
  cart?: CartSummary;
  overCap?: boolean;
  error?: string;
  expiresAt?: string;
  dryRun?: boolean;
}
