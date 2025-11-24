

export type Language = 'zh-TW' | 'en-US';

export enum CardCategory {
  ALL = 'ALL',
  CONVENIENCE = 'CONVENIENCE', // 超商
  ONLINE = 'ONLINE', // 網購
  TRAVEL_JP_KR = 'TRAVEL_JP_KR', // 日韓旅遊
  GAS = 'GAS', // 加油
  GENERAL = 'GENERAL', // 一般/現金回饋
  MOBILE_PAY = 'MOBILE_PAY' // 行動支付
}

export interface CardReward {
  type: string;
  value: string;       // The Big Number (e.g., "3%")
  cap?: string;        // Limit (e.g., "NT$500/mo")
  condition?: string;  // Condition (e.g., "Requires Auto-pay")
  description: string; // Summary
}

export interface AnnualFee {
  fee: string;
  waiveCondition: string;
}

export interface CreditCard {
  id: string;
  name: string;
  bank: string;
  imageUrl?: string; // URL if AI finds one
  link?: string;     // Official application link
  rewards: Partial<Record<CardCategory, CardReward>>;
  annualFee: AnnualFee;
  tags: string[];
  pros?: string[];   // Good points
  cons?: string[];   // Bad points / pitfalls
  lastUpdated: string; // YYYY-MM-DD
  isLive?: boolean;
  verified?: boolean; // If checked against official source
}

export interface RecommendationDetail {
  cardName: string;
  savings: string; // e.g. "3%" or "NT$300"
  reason: string; // Short reason e.g. "Capped at $100"
  link?: string; // Specific promo link or card link
}

export interface AIAnalysisResult {
  bestCardId: string;
  reasoning: string;
  savingsEstimate?: string;
  alternativeCards?: RecommendationDetail[];
  sources?: { title: string; uri: string }[];
}

export interface CategoryMetaData {
  lastFetch: number | null; // Timestamp
  loading: boolean;
}

export type ViewState = 'HOME' | 'WALLET' | 'SCANNER';