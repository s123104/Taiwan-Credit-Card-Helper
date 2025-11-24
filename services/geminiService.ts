import { GoogleGenAI } from "@google/genai";
import { CreditCard, CardCategory, AIAnalysisResult, Language } from "../types";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

const cleanJson = (text: string) => {
  let cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
  const firstOpenBrace = cleaned.indexOf('{');
  const firstOpenBracket = cleaned.indexOf('[');
  
  let startIndex = -1;
  let endIndex = -1;

  if (firstOpenBracket !== -1 && (firstOpenBracket < firstOpenBrace || firstOpenBrace === -1)) {
      startIndex = firstOpenBracket;
      endIndex = cleaned.lastIndexOf(']') + 1;
  } else if (firstOpenBrace !== -1) {
      startIndex = firstOpenBrace;
      endIndex = cleaned.lastIndexOf('}') + 1;
  }

  if (startIndex !== -1 && endIndex !== -1) {
      cleaned = cleaned.substring(startIndex, endIndex);
  }
  return cleaned;
};

// Helper to create consistent IDs for deduplication
const generateDeterministicId = (bank: string, name: string): string => {
  const raw = `${bank}${name}`.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
  return `live_${raw}`;
};

export const fetchTrendingCards = async (
  category: CardCategory, 
  language: Language,
  queryOverride?: string // Allow custom queries for the background loader
): Promise<CreditCard[]> => {
  if (!apiKey) return [];

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const todayStr = `${year}年${month}月`;

  // Dynamic Keyword Generation
  const categoryKeywords: Record<string, string> = {
    [CardCategory.ALL]: `台灣 ${year} ${month}月 信用卡 必辦 熱門 排行榜`,
    [CardCategory.CONVENIENCE]: `台灣 ${year} 超商信用卡 7-11 全家 回饋`,
    [CardCategory.ONLINE]: `台灣 ${year} 網購神卡 蝦皮 momo PChome`,
    [CardCategory.TRAVEL_JP_KR]: `台灣 ${year} 日本 韓國 旅遊信用卡 海外回饋`,
    [CardCategory.GAS]: `台灣 ${year} 加油信用卡 交通回饋`,
    [CardCategory.GENERAL]: `台灣 ${year} 現金回饋信用卡 無腦刷`,
    [CardCategory.MOBILE_PAY]: `台灣 ${year} 行動支付信用卡 Apple Pay LINE Pay`
  };

  const searchContext = queryOverride || categoryKeywords[category] || categoryKeywords[CardCategory.ALL];
  
  const langPrompt = language === 'zh-TW' 
    ? "STRICTLY OUTPUT in Traditional Chinese (Taiwan). 使用繁體中文。" 
    : "Ensure text is in English.";

  // Enhanced prompt for Deep Data, Search Verification, and UI stability
  const prompt = `
    Task: Use Google Search to find 3-5 distinct Taiwan Credit Cards matching this query: "${searchContext}".
    Current Date: ${todayStr}.
    
    CRITICAL INSTRUCTIONS:
    1. PRIORITIZE "Hot" (熱門), "Must-Have" (必辦), and High Rewards (>3%) cards.
    2. USE THE googleSearch TOOL. Do not guess.
    3. Verify current reward rates and caps on official bank websites.
    4. Exclude cards discontinued before ${year}.
    5. DEDUPLICATE: Ensure each card is unique in this batch.
    
    ${langPrompt}

    UI RULES:
    1. 'value': Highest percentage number (e.g. "3%", "10%").
    2. 'cap': MAX 10 chars (e.g. "NT$500/月", "無上限").
    3. 'condition': Full details.
    
    Return a STRICT JSON array:
    [
      {
        "bank": "Bank Name (e.g. 國泰世華)",
        "name": "Card Name (e.g. CUBE卡)",
        "rewards": {
          "${category === CardCategory.ALL ? 'GENERAL' : category}": {
            "value": "3%",
            "cap": "無上限",
            "condition": "Details...",
            "description": "Summary"
          }
        },
        "annualFee": { "fee": "NT$1800", "waiveCondition": "電子帳單免年費" },
        "tags": ["tag1", "tag2"],
        "pros": ["Benefit 1", "Benefit 2"],
        "cons": ["Limitation 1"],
        "link": "Official URL",
        "lastUpdated": "${todayStr}"
      }
    ]
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }]
      }
    });

    const jsonString = cleanJson(response.text || "[]");
    try {
      const json = JSON.parse(jsonString);
      if (Array.isArray(json)) {
        return json.map((c: any) => {
          // Robust reward mapping: Ensure at least one reward exists
          let rewards = c.rewards || {};
          // If the AI put the reward in a random key, try to fix it or default to GENERAL
          if (Object.keys(rewards).length === 0) {
             rewards = { [CardCategory.GENERAL]: { value: "N/A", description: "General" } };
          }

          return {
            ...c,
            id: generateDeterministicId(c.bank, c.name),
            isLive: true,
            verified: true,
            rewards: rewards
          };
        });
      }
    } catch (parseError) {
      console.error("JSON Parse Error", parseError);
    }
    return [];
  } catch (e) {
    console.error("Failed to fetch trending cards", e);
    return [];
  }
};

export const analyzeSpendingScenario = async (
  scenario: string,
  ownedCards: CreditCard[],
  language: Language
): Promise<AIAnalysisResult> => {
  if (!apiKey) {
    return {
      bestCardId: ownedCards[0]?.id || "mock",
      reasoning: language === 'zh-TW' ? "演示模式：API Key 未設定。" : "Demo Mode: API Key missing.",
      savingsEstimate: "~3%",
      alternativeCards: []
    };
  }

  // Include IDs in context so AI can reference them
  const ownedCardContext = ownedCards.map(c => `ID: ${c.id} | ${c.bank} ${c.name}`).join(", ");
  
  const prompt = `
    As a financial advisor, analyze this scenario: "${scenario}"
    User's Wallet: [${ownedCardContext}]
    
    Task:
    1. Identify the BEST card from the wallet for this specific merchant/category.
    2. If all wallet cards are poor (<1.5% reward), suggest a top 'Competitor Card' available in Taiwan.
    3. Search for specific merchant MCC codes, current promos, or exclusions (e.g. 7-11 exclusions).
    
    Return JSON:
    {
      "bestCardId": "The 'ID' from the wallet list, or 'Competitor: [Card Name]' if suggesting external",
      "reasoning": "Concise advice explaining WHY this card wins for this specific scenario.",
      "savingsEstimate": "e.g. 3% (approx NT$30)",
      "alternativeCards": [
        { "cardName": "Card Name 1", "savings": "3%", "reason": "Good for weekends", "link": "https://..." },
        { "cardName": "Card Name 2", "savings": "1%", "reason": "General rate only" }
      ]
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: { tools: [{ googleSearch: {} }] }
    });

    const text = cleanJson(response.text || "{}");
    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map(c => ({
        title: c.web?.title || "Web Source",
        uri: c.web?.uri || "#"
    })).filter(s => s.uri !== "#") || [];

    const result = JSON.parse(text);
    return { ...result, sources };

  } catch (error) {
    return {
      bestCardId: "Error",
      reasoning: "AI is currently busy. Please try again.",
    };
  }
};