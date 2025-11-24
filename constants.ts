
import { CreditCard, CardCategory } from "./types";

export const TRANSLATIONS = {
  'en-US': {
    appName: "SmartCard",
    explore: "Market",
    discover: "Trending",
    discoverSubtitle: "AI Real-time Analysis",
    wallet: "Wallet",
    walletSubtitle: "Digital Portfolio",
    advisor: "Advisor",
    advisorSubtitle: "Smart Recommendations",
    refreshData: "Live Sync",
    refreshing: "Searching...",
    myCards: "My Cards",
    addCard: "Add",
    removeCard: "Remove",
    annualFee: "Fee",
    bestMatch: "Top Pick",
    scenarioPlaceholder: "Where are you spending?",
    analyze: "Analyze",
    sources: "Sources",
    language: "Language",
    liveData: "LIVE",
    demoData: "DEMO",
    noCards: "No cards found.",
    cap: "Limit",
    condition: "Cond.",
    details: "Details",
    pros: "Why it wins",
    cons: "Limitations",
    verified: "Verified",
    apply: "Apply Now"
  },
  'zh-TW': {
    appName: "SmartCard",
    explore: "探索",
    discover: "最新神卡",
    discoverSubtitle: "AI 聯網即時驗證分析",
    wallet: "票夾",
    walletSubtitle: "數位化管理",
    advisor: "顧問",
    advisorSubtitle: "消費場景試算",
    refreshData: "同步最新資訊",
    refreshing: "AI 檢索中...",
    myCards: "已持有",
    addCard: "追蹤",
    removeCard: "移除",
    annualFee: "年費",
    bestMatch: "最佳推薦",
    scenarioPlaceholder: "輸入消費場景 (如: 全家、Agoda)",
    analyze: "分析回饋",
    sources: "資料來源",
    language: "語言",
    liveData: "即時資訊",
    demoData: "範例",
    noCards: "尚無資料，請點擊同步。",
    cap: "上限",
    condition: "條件",
    details: "完整詳情",
    pros: "優點分析",
    cons: "注意缺點",
    verified: "AI 驗證",
    apply: "前往官網"
  }
};

export const CATEGORY_LABELS: Record<CardCategory, { 'en-US': string, 'zh-TW': string }> = {
  [CardCategory.ALL]: { 'en-US': "All", 'zh-TW': "綜合排名" },
  [CardCategory.CONVENIENCE]: { 'en-US': "Stores", 'zh-TW': "超商量販" },
  [CardCategory.ONLINE]: { 'en-US': "Online", 'zh-TW': "網購電商" },
  [CardCategory.TRAVEL_JP_KR]: { 'en-US': "Travel", 'zh-TW': "日韓旅遊" },
  [CardCategory.GAS]: { 'en-US': "Transit", 'zh-TW': "交通加油" },
  [CardCategory.GENERAL]: { 'en-US': "General", 'zh-TW': "無腦刷" },
  [CardCategory.MOBILE_PAY]: { 'en-US': "Mobile", 'zh-TW': "行動支付" }
};

export const MOCK_CARDS: CreditCard[] = [
  {
    id: "c1",
    bank: "富邦銀行",
    name: "J卡",
    rewards: {
      [CardCategory.TRAVEL_JP_KR]: { 
        type: "Points", 
        value: "6%", 
        cap: "無上限",
        condition: "日韓旅遊最高6% (需登錄/含加碼)",
        description: "日韓神卡首選" 
      },
      [CardCategory.GENERAL]: { type: "Points", value: "1%", cap: "無上限", description: "一般消費" }
    },
    annualFee: { fee: "NT$1800", waiveCondition: "電子帳單免年費" },
    tags: ["日韓神卡", "LINE Points"],
    pros: ["日韓當地實體消費回饋高", "LINE Points 生態系通用性佳"],
    cons: ["加碼回饋需登錄且有名額限制", "國內回饋僅 1%"],
    lastUpdated: "2025-01",
    isLive: false
  },
  {
    id: "c2",
    bank: "國泰世華",
    name: "CUBE卡",
    rewards: {
      [CardCategory.ALL]: {
        type: "Points",
        value: "3%",
        cap: "無上限",
        condition: "每日可切換四大權益方案",
        description: "權益自由選"
      },
      [CardCategory.ONLINE]: { type: "Points", value: "3%", cap: "無上限", description: "玩數位方案" }
    },
    annualFee: { fee: "NT$1800", waiveCondition: "首年免年費" },
    tags: ["權益自由選", "小樹點"],
    pros: ["主要權益回饋無上限", "適用場景極廣 (網購/旅遊/餐飲)", "CUBE App 切換方便"],
    cons: ["忘記切換權益回饋極低 (0.3%)", "小樹點折抵帳單需手動操作"],
    lastUpdated: "2025-01",
    isLive: false
  },
  {
    id: "c3",
    bank: "台新銀行",
    name: "玫瑰Giving卡",
    rewards: {
        [CardCategory.GENERAL]: {
            type: "Cash",
            value: "3%",
            cap: "NT$3000/月",
            condition: "限節假日消費，平日1%，上限3000元",
            description: "節假日最高3%"
        }
    },
    annualFee: { fee: "NT$4500", waiveCondition: "電子帳單免年費" },
    tags: ["假日神卡", "現金回饋"],
    pros: ["節假日國內外不限通路皆 3%", "現金回饋直接折抵帳單"],
    cons: ["平日回饋僅 1% 較低", "需綁定台新帳戶扣繳"],
    lastUpdated: "2025-01",
    isLive: false
  }
];
