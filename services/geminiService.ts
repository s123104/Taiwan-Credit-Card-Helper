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
  // Remove spaces, special chars, normalize width
  const raw = `${bank}${name}`.toLowerCase()
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)) // Fullwidth to halfwidth
    .replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
  return `live_${raw}`;
};

export const fetchTrendingCards = async (
  category: CardCategory, 
  language: Language,
  queryOverride?: string
): Promise<CreditCard[]> => {
  if (!apiKey) return [];

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const todayStr = `${year}年${month}月`;

  // Dynamic Keyword Generation for standard categories
  const categoryKeywords: Record<string, string> = {
    [CardCategory.ALL]: `台灣 ${year} ${month}月 信用卡 必辦 熱門 排行榜 Top 10`,
    [CardCategory.CONVENIENCE]: `台灣 ${year} ${month}月 超商信用卡 7-11 全家 萊爾富 回饋`,
    [CardCategory.ONLINE]: `台灣 ${year} ${month}月 網購神卡 蝦皮 momo PChome 淘寶`,
    [CardCategory.TRAVEL_JP_KR]: `台灣 ${year} ${month}月 日本 韓國 旅遊信用卡 海外實體消費`,
    [CardCategory.GAS]: `台灣 ${year} ${month}月 加油信用卡 停車優惠`,
    [CardCategory.GENERAL]: `台灣 ${year} ${month}月 現金回饋信用卡 無腦刷 不限通路`,
    [CardCategory.MOBILE_PAY]: `台灣 ${year} ${month}月 行動支付信用卡 Apple Pay LINE Pay 街口`
  };

  const searchContext = queryOverride || categoryKeywords[category] || categoryKeywords[CardCategory.ALL];
  
  const langPrompt = language === 'zh-TW' 
    ? "STRICTLY OUTPUT in Traditional Chinese (Taiwan). 使用繁體中文。" 
    : "Ensure text is in English.";

  // Enhanced prompt for Deep Data, Search Verification, and UI stability
  const prompt = `
    Role: Senior Financial Analyst AI.
    Task: Use Google Search to find 3-5 high-quality, distinct Taiwan Credit Cards matching: "${searchContext}".
    Current Date: ${todayStr}.
    
    CRITICAL INSTRUCTIONS:
    1. TARGET: Find the exact cards mentioned in recent blogs/news (e.g., PTT, Dcard, Money101) for ${year}.
    2. ACCURACY: Verify the 'value' (reward %) and 'cap' (limit) are current.
    3. DIVERSITY: If the query is generic, find a mix of banks. If specific (e.g. "Gaming"), find niche cards.
    4. EXCLUSIONS: Do not invent cards. Do not use cards discontinued before ${year}.
    
    ${langPrompt}

    DATA FORMATTING RULES:
    1. 'value': THE LARGEST HIGHLIGHT NUMBER (e.g. "3%", "10%", "$500").
    2. 'cap': Concise limit (e.g. "NT$500/月", "無上限", "季回饋").
    3. 'condition': Key requirement (e.g. "需登錄", "限新戶", "指定通路").
    4. 'description': Catchy 3-5 word summary (e.g. "網購神卡", "旅日首選").
    
    Return a STRICT JSON array (no markdown):
    [
      {
        "bank": "Bank Name (Short, e.g. 國泰世華)",
        "name": "Card Name (Exact, e.g. CUBE卡)",
        "imageUrl": "Leave empty",
        "rewards": {
          "${category === CardCategory.ALL ? 'GENERAL' : category}": {
            "value": "3%",
            "cap": "無上限",
            "condition": "Condition text",
            "description": "Short summary"
          }
        },
        "annualFee": { "fee": "NT$xxx", "waiveCondition": "Text" },
        "tags": ["Tag1", "Tag2"],
        "pros": ["Pro 1", "Pro 2"],
        "cons": ["Con 1"],
        "link": "https://www.google.com/search?q=Bank+Card+Apply",
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
          // If the AI put the reward in a random key or missing, default to GENERAL
          if (Object.keys(rewards).length === 0) {
             rewards = { [CardCategory.GENERAL]: { value: "Unknown", description: "See details" } };
          }

          // Ensure basic fields
          return {
            ...c,
            bank: c.bank || "Unknown Bank",
            name: c.name || "Unknown Card",
            id: generateDeterministicId(c.bank || "bank", c.name || "name"),
            isLive: true,
            verified: true,
            rewards: rewards,
            lastUpdated: todayStr
          };
        });
      }
    } catch (parseError) {
      console.error("JSON Parse Error", parseError);
    }
    return [];
  } catch (e: any) {
    // Check for 429 Resource Exhausted
    if (e.message?.includes("429") || e.status === 429 || e.code === 429) {
      console.warn("Gemini API Rate Limit Hit (429). Backing off.");
      throw new Error("RATE_LIMIT");
    }
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

  const ownedCardContext = ownedCards.map(c => `ID: ${c.id} | ${c.bank} ${c.name}`).join(", ");
  
  const prompt = `
    As a financial advisor, analyze: "${scenario}"
    User's Wallet: [${ownedCardContext}]
    
    Task:
    1. Pick the BEST card from the wallet.
    2. Suggest a Competitor Card if wallet cards are weak (<2%).
    3. Use Google Search to find current merchant MCC codes or promos.
    
    Return JSON:
    {
      "bestCardId": "ID from wallet OR 'Competitor: [Name]'",
      "reasoning": "Why it wins.",
      "savingsEstimate": "e.g. 5%",
      "alternativeCards": [
        { "cardName": "Name", "savings": "Rate", "reason": "Reason", "link": "URL" }
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

  } catch (error: any) {
    if (error.message?.includes("429") || error.status === 429) {
        return {
            bestCardId: "Error",
            reasoning: language === 'zh-TW' ? "系統忙碌中，請稍後再試 (Rate Limit)。" : "System busy (Rate Limit). Please try again later.",
            savingsEstimate: "N/A"
        };
    }
    return {
      bestCardId: "Error",
      reasoning: "Analysis failed. Please try again.",
    };
  }
};