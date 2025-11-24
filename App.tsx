import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Wallet, Search, Sparkles, ChevronRight, Check, Plus, 
  RefreshCcw, Zap, Info, CreditCard as CreditCardIcon, 
  ArrowUpRight, X, AlertCircle, ThumbsUp, ThumbsDown, Globe,
  Calendar, Clock, Radio
} from 'lucide-react';
import { MOCK_CARDS, CATEGORY_LABELS, TRANSLATIONS } from './constants';
import { CardCategory, CreditCard, ViewState, AIAnalysisResult, Language, CategoryMetaData } from './types';
import { analyzeSpendingScenario, fetchTrendingCards } from './services/geminiService';

// --- Utils ---

// Smart Deduplication: Prioritizes 'isLive' (Verified) cards over static mock data
const deduplicateCards = (cards: CreditCard[]): CreditCard[] => {
  const map = new Map<string, CreditCard>();

  cards.forEach(card => {
    // Normalize key: Remove spaces, special chars, lowercase
    const key = (card.bank + card.name).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
    
    if (map.has(key)) {
      const existing = map.get(key)!;
      // If the new card is Live and the existing one isn't, replace it
      if (card.isLive && !existing.isLive) {
        map.set(key, card);
      }
      // If both are live, keep the one with more recent data/update
      else if (card.isLive && existing.isLive) {
         // Keep the one that might have more detailed rewards or simply overwrite
         map.set(key, card);
      }
    } else {
      map.set(key, card);
    }
  });

  return Array.from(map.values());
};

const getTimeAgo = (timestamp: number | null, language: Language) => {
  if (!timestamp) return language === 'zh-TW' ? '尚未同步' : 'Not synced';
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  
  if (seconds < 60) return language === 'zh-TW' ? '剛剛' : 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return language === 'zh-TW' ? `${minutes} 分鐘前` : `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return language === 'zh-TW' ? `${hours} 小時前` : `${hours}h ago`;
  return language === 'zh-TW' ? '超過一天' : '>1d ago';
};

const CATEGORY_COLORS: Record<CardCategory, string> = {
  [CardCategory.ALL]: 'bg-slate-700 text-slate-300',
  [CardCategory.CONVENIENCE]: 'bg-orange-500 text-white',
  [CardCategory.ONLINE]: 'bg-purple-600 text-white',
  [CardCategory.TRAVEL_JP_KR]: 'bg-sky-500 text-white',
  [CardCategory.GAS]: 'bg-rose-600 text-white',
  [CardCategory.GENERAL]: 'bg-emerald-600 text-white',
  [CardCategory.MOBILE_PAY]: 'bg-blue-600 text-white'
};

// Generative Card Style based on text analysis
const getCardStyle = (id: string, bank: string, name: string) => {
  const text = (bank + name).toLowerCase();
  
  // Specific Card Identities
  if (text.includes("cube")) return 'bg-gradient-to-br from-gray-200 via-gray-300 to-slate-400 text-slate-800 border border-white/40'; // Modern Silver
  if (text.includes("rose") || text.includes("玫瑰")) return 'bg-gradient-to-bl from-rose-200 via-rose-300 to-pink-500 text-rose-950 border border-rose-200/30'; // Rose Gold
  if (text.includes("line") || text.includes("j")) return 'bg-gradient-to-tr from-lime-400 via-emerald-500 to-green-600 text-white border border-emerald-400/20'; // Vibrant Green
  if (text.includes("fly") || text.includes("旅遊") || text.includes("miles")) return 'bg-gradient-to-b from-sky-400 via-blue-600 to-indigo-900 text-white border border-blue-400/20'; // Aviation Blue
  if (text.includes("dawho") || text.includes("大戶")) return 'bg-gradient-to-br from-neutral-800 via-neutral-900 to-black text-[#F0E68C] border border-[#F0E68C]/40'; // Premium Black/Gold
  if (text.includes("u bear") || text.includes("bear")) return 'bg-gradient-to-tr from-teal-400 via-teal-600 to-cyan-700 text-white border border-teal-400/20'; // Tech Teal
  if (text.includes("gogo")) return 'bg-gradient-to-r from-red-500 via-red-600 to-black text-white border border-red-500/20'; // Dynamic Red
  if (text.includes("pi") || text.includes("拍錢包")) return 'bg-gradient-to-br from-blue-600 via-blue-800 to-black text-yellow-300 border border-yellow-300/30'; // Pi Style
  if (text.includes("eco")) return 'bg-gradient-to-bl from-green-200 via-emerald-400 to-teal-600 text-emerald-950 border border-emerald-200/30'; // Nature/Eco
  if (text.includes("world") || text.includes("無限") || text.includes("infinity")) return 'bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 text-slate-200 border border-slate-400/30'; // High Tier

  // Fallback Generation based on hash
  const gradients = [
    'bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 text-white border border-white/20', // Unicorn
    'bg-gradient-to-tr from-blue-700 via-blue-800 to-gray-900 text-white border border-blue-500/20', // Deep Ocean
    'bg-gradient-to-bl from-orange-400 to-rose-400 text-white border border-white/20', // Sunset
    'bg-gradient-to-r from-emerald-500 to-emerald-900 text-white border border-emerald-500/20', // Forest
    'bg-gradient-to-br from-slate-500 to-slate-800 text-white border border-slate-400/20', // Metal
    'bg-gradient-to-tr from-amber-200 via-yellow-400 to-orange-500 text-amber-950 border border-amber-200/30', // Gold
  ];
  
  const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return gradients[hash % gradients.length];
};

// Smart Reward Selection: Finds the highest value reward to display in "ALL" mode
const getHeadlineReward = (card: CreditCard, activeCategory: CardCategory) => {
  if (activeCategory !== CardCategory.ALL && card.rewards[activeCategory]) {
    return { 
      category: activeCategory, 
      reward: card.rewards[activeCategory] 
    };
  }

  // Find the highest numeric value reward, defaulting if none
  let bestCat = Object.keys(card.rewards)[0] as CardCategory || CardCategory.GENERAL;
  let maxVal = 0;

  Object.entries(card.rewards).forEach(([cat, reward]) => {
    if (reward?.value) {
      // Extract number from string like "3%" or "3.5%"
      const num = parseFloat(reward.value.replace(/[^0-9.]/g, ''));
      if (!isNaN(num) && num > maxVal) {
        maxVal = num;
        bestCat = cat as CardCategory;
      }
    }
  });

  return { 
    category: bestCat, 
    reward: card.rewards[bestCat] || { value: "?", description: "Details in card" }
  };
};

// Helper to safely get label
const getCategoryLabel = (category: string, language: Language) => {
  const labelObj = CATEGORY_LABELS[category as CardCategory];
  if (labelObj) {
    return labelObj[language];
  }
  // Fallback for custom/unmapped categories from AI
  return category;
};

// --- Components ---

const PhysicalCard: React.FC<{ bank: string; name: string; id: string; small?: boolean }> = ({ bank, name, id, small }) => {
  const style = getCardStyle(id, bank, name);
  return (
    <div className={`relative ${small ? 'w-12 h-8 rounded-md' : 'w-20 h-12 rounded-lg'} ${style} shadow-lg flex flex-col justify-between p-2 overflow-hidden shrink-0 transition-transform duration-300 select-none`}>
      {/* Texture */}
      <div className="absolute inset-0 opacity-30 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] mix-blend-overlay"></div>
      {/* Hologram Effect */}
      <div className="absolute -top-10 -right-10 w-20 h-20 bg-white/20 blur-xl rounded-full pointer-events-none" />
      
      {/* Chip */}
      {!small && <div className="w-3 h-2.5 bg-yellow-200/80 rounded-[2px] shadow-sm mb-1 mix-blend-hard-light" />}

      {/* Content */}
      <div className="relative z-10 flex flex-col justify-end h-full">
        <div className={`font-bold tracking-tight leading-none ${small ? 'text-[5px]' : 'text-[6px]'} opacity-90 truncate`}>{bank}</div>
        <div className={`font-bold leading-none mt-0.5 truncate ${small ? 'text-[4px]' : 'text-[5px]'}`}>{name}</div>
      </div>
    </div>
  );
};

const Dock: React.FC<{ view: ViewState; setView: (v: ViewState) => void; t: any }> = ({ view, setView, t }) => (
  <div className="fixed bottom-6 left-0 right-0 z-50 flex justify-center px-6 pointer-events-none">
    <nav className="glass-dock pointer-events-auto flex items-center gap-2 p-2 rounded-full shadow-2xl transition-all duration-300 hover:scale-105">
      <DockBtn active={view === 'HOME'} onClick={() => setView('HOME')} icon={<Search size={22} strokeWidth={2.5} />} label={t.explore} />
      <DockBtn active={view === 'SCANNER'} onClick={() => setView('SCANNER')} icon={<Sparkles size={22} strokeWidth={2.5} />} highlight label={t.advisor} />
      <DockBtn active={view === 'WALLET'} onClick={() => setView('WALLET')} icon={<Wallet size={22} strokeWidth={2.5} />} label={t.wallet} />
    </nav>
  </div>
);

const DockBtn: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; highlight?: boolean; label: string }> = ({ active, onClick, icon, highlight, label }) => (
  <button 
    onClick={onClick} 
    className={`relative w-14 h-12 rounded-full flex flex-col items-center justify-center transition-all duration-300 group ${active ? 'bg-white text-black shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
    title={label}
  >
    <div className="flex flex-col items-center gap-0.5">
        {icon}
    </div>
    {highlight && !active && (
      <div className="absolute top-2.5 right-3.5 w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
    )}
  </button>
);

const CardDetailModal: React.FC<{ card: CreditCard | null; onClose: () => void; t: any; language: Language }> = ({ card, onClose, t, language }) => {
  if (!card) return null;
  
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        exit={{ opacity: 0 }} 
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-md" 
      />
      
      <motion.div 
        initial={{ scale: 0.95, opacity: 0, y: 20 }} 
        animate={{ scale: 1, opacity: 1, y: 0 }} 
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        className="relative z-10 w-full max-w-md bg-[#121212] rounded-3xl overflow-hidden shadow-2xl ring-1 ring-white/10 flex flex-col max-h-[85vh]"
      >
        {/* Header */}
        <div className={`relative px-6 py-5 ${getCardStyle(card.id, card.bank, card.name)}`}>
           <button onClick={onClose} className="absolute top-4 right-4 p-1.5 bg-black/20 hover:bg-black/30 rounded-full text-white/90 transition-colors">
             <X size={18} />
           </button>
           
           <div className="flex justify-between items-end">
              <div>
                <div className="text-xs font-bold opacity-80 uppercase tracking-wider mb-1">{card.bank}</div>
                <h2 className="text-2xl font-black leading-none">{card.name}</h2>
              </div>
              {card.isLive && (
                <div className="flex items-center gap-1 bg-black/20 text-white px-2 py-1 rounded-md text-[10px] font-bold backdrop-blur-sm">
                  <Zap size={10} fill="currentColor" /> {t.verified}
                </div>
              )}
           </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-6">
          
            {/* Annual Fee Section */}
            <div className="flex items-start gap-3 bg-[#1c1c1e] p-4 rounded-xl border border-white/5">
                <div className="p-2 bg-white/5 rounded-full text-slate-400">
                    <Calendar size={18} />
                </div>
                <div>
                    <div className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-0.5">{t.annualFee}</div>
                    <div className="text-sm text-white font-bold">{card.annualFee?.fee || "N/A"}</div>
                    <div className="text-xs text-slate-400 mt-1">{card.annualFee?.waiveCondition}</div>
                </div>
            </div>

            {/* Rewards Grouped */}
            <div>
                <div className="flex items-center gap-2 text-sm font-bold text-white mb-3">
                   <Sparkles size={16} className="text-emerald-400" /> 
                   Reward Breakdown
                </div>
                <div className="space-y-3">
                    {Object.entries(card.rewards).map(([cat, r], i) => {
                       const category = cat as CardCategory;
                       const colorClass = CATEGORY_COLORS[category] || CATEGORY_COLORS[CardCategory.ALL];
                       if (!r) return null;
                       
                       return (
                         <div key={i} className="relative bg-[#1c1c1e] rounded-xl p-4 border border-white/5 overflow-hidden">
                            <div className={`absolute left-0 top-0 bottom-0 w-1 ${colorClass}`} />
                            <div className="flex justify-between items-start mb-2 pl-2">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${colorClass}`}>
                                    {getCategoryLabel(category, language)}
                                </span>
                                <span className="text-2xl font-black text-white">{r.value}</span>
                            </div>
                            <div className="pl-2">
                                <p className="text-sm font-bold text-slate-200 mb-1">{r.description}</p>
                                <div className="text-xs text-slate-500 space-y-0.5">
                                    {r.condition && <p>• {r.condition}</p>}
                                    {r.cap && <p className="text-indigo-400 font-medium">• Limit: {r.cap}</p>}
                                </div>
                            </div>
                         </div>
                       );
                    })}
                </div>
            </div>

            {/* Pros/Cons */}
            {(card.pros || card.cons) && (
              <div className="grid grid-cols-2 gap-4 pt-2">
                 {card.pros && (
                    <div className="space-y-2">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                            <ThumbsUp size={12} /> {t.pros}
                        </div>
                        <ul className="space-y-1">
                            {card.pros.slice(0,3).map((p,i) => (
                                <li key={i} className="text-[10px] text-slate-400 leading-snug">• {p}</li>
                            ))}
                        </ul>
                    </div>
                 )}
                 {card.cons && (
                    <div className="space-y-2">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-rose-400">
                            <ThumbsDown size={12} /> {t.cons}
                        </div>
                        <ul className="space-y-1">
                            {card.cons.slice(0,3).map((c,i) => (
                                <li key={i} className="text-[10px] text-slate-400 leading-snug">• {c}</li>
                            ))}
                        </ul>
                    </div>
                 )}
              </div>
            )}

            {/* Link */}
            <a 
               href={card.link || `https://www.google.com/search?q=${card.bank}+${card.name}+apply`} 
               target="_blank" 
               rel="noreferrer"
               className="flex items-center justify-center gap-2 w-full py-4 bg-white text-black font-bold rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-transform"
            >
              {t.apply} <Globe size={16} />
            </a>
            
            <div className="text-center text-[10px] text-slate-600">
              Last updated: {card.lastUpdated}
            </div>
        </div>
      </motion.div>
    </div>
  );
}

const CardRow: React.FC<{ card: CreditCard; category: CardCategory; owned: boolean; onToggle: () => void; onClick: () => void; t: any; language: Language }> = ({ card, category, owned, onToggle, onClick, t, language }) => {
  const { category: displayCategory, reward: activeReward } = getHeadlineReward(card, category);
  const categoryColor = CATEGORY_COLORS[displayCategory as CardCategory] || CATEGORY_COLORS[CardCategory.ALL];

  return (
    <motion.div 
      layout
      onClick={onClick}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -5, boxShadow: "0 20px 30px -10px rgba(0, 0, 0, 0.5)" }}
      whileTap={{ scale: 0.98, y: 0 }}
      className="group relative bg-[#1c1c1e] active:bg-[#262626] border border-white/5 rounded-2xl overflow-hidden cursor-pointer hover:border-white/20 transition-colors shadow-lg"
    >
      <div className="p-4 flex gap-4 items-center">
         {/* Left: Card Art */}
         <div className="shrink-0 pt-0.5 self-start">
            <PhysicalCard bank={card.bank} name={card.name} id={card.id} />
         </div>

         {/* Middle: Identity */}
         <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
             <div className="flex items-center gap-1.5">
                 <h3 className="text-[10px] text-slate-400 font-bold uppercase tracking-wider truncate">{card.bank}</h3>
                 {card.isLive && <Zap size={10} className="text-emerald-400" fill="currentColor" />}
             </div>
             <h2 className="text-base font-bold text-white truncate leading-snug">{card.name}</h2>
         </div>

         {/* Right: Big Rate & Category */}
         <div className="flex flex-col items-end shrink-0 pl-2 gap-1">
              {activeReward ? (
                <>
                    <span className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-300 tracking-tighter leading-none">
                      {activeReward.value}
                    </span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wide ${categoryColor}`}>
                      {getCategoryLabel(displayCategory, language)}
                    </span>
                </>
              ) : (
                 <span className="text-xs text-slate-500 font-bold">N/A</span>
              )}
         </div>
         
         <button 
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            className={`ml-1 w-8 h-8 rounded-full flex items-center justify-center transition-all border ${owned ? 'bg-emerald-500 border-emerald-500 text-black' : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:text-white'}`}
          >
            {owned ? <Check size={14} strokeWidth={3} /> : <Plus size={16} />}
         </button>
      </div>
    </motion.div>
  );
};

// --- Main App ---

export default function App() {
  const [view, setView] = useState<ViewState>('HOME');
  const [language, setLanguage] = useState<Language>('zh-TW');
  const [activeCategory, setActiveCategory] = useState<CardCategory>(CardCategory.ALL);
  
  // Data State with Persistence
  const [cards, setCards] = useState<CreditCard[]>(() => {
    try {
      const saved = localStorage.getItem('smartcard_cards');
      return saved ? JSON.parse(saved) : MOCK_CARDS;
    } catch (e) {
      console.error("Failed to load cards", e);
      return MOCK_CARDS;
    }
  });

  const [ownedIds, setOwnedIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('smartcard_owned_ids');
      return saved ? new Set(JSON.parse(saved)) : new Set(['c1']);
    } catch (e) {
      console.error("Failed to load owned ids", e);
      return new Set(['c1']);
    }
  });

  const [selectedCard, setSelectedCard] = useState<CreditCard | null>(null);

  // Background Auto-Discovery State
  const [discoveryStatus, setDiscoveryStatus] = useState<string>('');
  const [discoveredCount, setDiscoveredCount] = useState(0);
  
  // Persistence Effects
  useEffect(() => {
    try {
      localStorage.setItem('smartcard_cards', JSON.stringify(cards));
    } catch (e) {
      console.error("Failed to save cards", e);
    }
  }, [cards]);

  useEffect(() => {
    try {
      localStorage.setItem('smartcard_owned_ids', JSON.stringify(Array.from(ownedIds)));
    } catch (e) {
      console.error("Failed to save owned ids", e);
    }
  }, [ownedIds]);

  // Data Sync State
  const [categoryMeta, setCategoryMeta] = useState<Record<CardCategory, CategoryMetaData>>(() => {
    const initial = {} as Record<CardCategory, CategoryMetaData>;
    Object.values(CardCategory).forEach(c => {
      initial[c] = { lastFetch: null, loading: false };
    });
    return initial;
  });

  // AI State
  const [aiScenario, setAiScenario] = useState("");
  const [aiResult, setAiResult] = useState<AIAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => { document.documentElement.lang = language; }, [language]);
  const t = TRANSLATIONS[language];

  // Logic to show unique cards, prioritizing live data
  const displayedCards = useMemo(() => {
    let filtered = cards;
    if (activeCategory !== CardCategory.ALL) {
      filtered = cards.filter(c => Object.keys(c.rewards).includes(activeCategory));
    }
    return deduplicateCards(filtered);
  }, [cards, activeCategory]);

  // Auto-Discovery Effect (Runs once on mount)
  const discoveryStarted = useRef(false);

  useEffect(() => {
    if (discoveryStarted.current || cards.length > 100) return;
    discoveryStarted.current = true;

    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    // Ordered list of queries to populate the database "one by one" (in batches)
    const DISCOVERY_QUERIES = [
      `${currentYear}年${currentMonth}月 必辦神卡 Top 10`,
      `${currentYear}年${currentMonth}月 日本旅遊信用卡 推薦`,
      `${currentYear}年${currentMonth}月 網購信用卡 蝦皮 momo`,
      `${currentYear}年${currentMonth}月 海外消費信用卡 高回饋`,
      `${currentYear}年${currentMonth}月 行動支付信用卡 LINE Pay`,
      `${currentYear}年${currentMonth}月 加油信用卡 推薦`,
      `${currentYear}年${currentMonth}月 電影餐廳優惠信用卡`,
      `${currentYear}年${currentMonth}月 繳費信用卡 水電瓦斯`,
      `${currentYear}年${currentMonth}月 哩程信用卡 航空卡`,
      `${currentYear}年${currentMonth}月 頂級金屬卡 無限卡`
    ];

    const runDiscovery = async () => {
      for (const query of DISCOVERY_QUERIES) {
        if (cards.length >= 100) break; // Hard stop

        setDiscoveryStatus(query); // Update UI
        try {
          // Fetch a batch (Gemini returns ~3-5 cards per call)
          const newCards = await fetchTrendingCards(CardCategory.ALL, 'zh-TW', query);
          
          if (newCards.length > 0) {
            setCards(prev => {
              // Merge and deduplicate immediately
              const merged = [...newCards, ...prev];
              // Simple dedupe by ID logic before setting state
              const seen = new Set();
              return merged.filter(c => {
                const duplicate = seen.has(c.id);
                seen.add(c.id);
                return !duplicate;
              });
            });
            setDiscoveredCount(prev => prev + newCards.length);
          }
        } catch (e) {
          console.error("Discovery error", e);
        }
        
        // Small delay to be polite to the API and let UI breathe
        await new Promise(r => setTimeout(r, 1000));
      }
      setDiscoveryStatus(''); // Done
    };

    runDiscovery();
  }, []); // Empty dependency array = runs on mount

  // Suggestions for AI input
  const suggestions = useMemo(() => {
     if (language === 'zh-TW') return ["網購", "全家/7-11", "日本旅遊", "加油", "保費", "餐廳", "高鐵"];
     return ["Online Shopping", "Convenience Store", "Japan Travel", "Gas", "Insurance", "Dining", "Train"];
  }, [language]);

  const refreshCategory = async (targetCat: CardCategory) => {
    setCategoryMeta(prev => ({
      ...prev,
      [targetCat]: { ...prev[targetCat], loading: true }
    }));

    const liveCards = await fetchTrendingCards(targetCat, language);
    
    if (liveCards.length > 0) {
      setCards(prev => [...prev, ...liveCards]);
    }
    
    setCategoryMeta(prev => ({
      ...prev,
      [targetCat]: { lastFetch: Date.now(), loading: false }
    }));
  };

  const handleAISubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiScenario.trim()) return;
    setIsAnalyzing(true);
    setAiResult(null);
    const result = await analyzeSpendingScenario(aiScenario, cards.filter(c => ownedIds.has(c.id)), language);
    setAiResult(result);
    setIsAnalyzing(false);
  };

  const activeMeta = categoryMeta[activeCategory];

  return (
    <div className="min-h-screen bg-[#000000] text-slate-100 font-sans selection:bg-emerald-500/30">
      
      {/* Background Ambience */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-emerald-900/10 rounded-full blur-[120px] animate-pulse-slow" />
        <div className="absolute bottom-[-10%] left-[-20%] w-[500px] h-[500px] bg-indigo-900/10 rounded-full blur-[100px]" />
      </div>

      {/* Header */}
      <header className="fixed top-0 inset-x-0 z-40 px-6 py-4 flex justify-between items-center bg-black/80 backdrop-blur-md border-b border-white/5">
         <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-400 to-cyan-500 flex items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.3)]">
               <Zap size={16} className="text-white fill-white" />
            </div>
            <h1 className="text-lg font-bold tracking-tight text-white">{t.appName}</h1>
         </div>
         <button onClick={() => setLanguage(l => l === 'zh-TW' ? 'en-US' : 'zh-TW')} className="text-[10px] font-bold text-slate-400 hover:text-white transition-colors uppercase tracking-widest bg-white/5 px-3 py-1.5 rounded-full backdrop-blur border border-white/5">
           {language === 'zh-TW' ? 'English' : '繁體中文'}
         </button>
      </header>

      {/* Main Content */}
      <main className="relative z-10 pt-24 pb-32 px-4 max-w-lg mx-auto">
        <AnimatePresence mode="wait">
          
          {/* === EXPLORE === */}
          {view === 'HOME' && (
            <motion.div key="home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
              
              {/* Category Nav */}
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 mask-fade-sides -mx-4 px-4">
                {Object.keys(CATEGORY_LABELS).map((cat) => (
                   <button key={cat} onClick={() => setActiveCategory(cat as CardCategory)}
                      className={`whitespace-nowrap px-4 py-2.5 rounded-full text-[11px] font-bold transition-all shadow-lg ${activeCategory === cat ? 'bg-white text-black scale-105' : 'bg-[#1c1c1e] text-slate-400 border border-white/5'}`}>
                      {CATEGORY_LABELS[cat as CardCategory][language]}
                   </button>
                ))}
              </div>

              {/* Discovery Status Bar (Background Loader) */}
              <AnimatePresence>
                {discoveryStatus && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }} 
                    animate={{ height: 'auto', opacity: 1 }} 
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mx-1 mb-2 bg-gradient-to-r from-indigo-900/40 to-emerald-900/40 border border-emerald-500/20 rounded-lg p-2 flex items-center justify-between">
                       <div className="flex items-center gap-2">
                          <RefreshCcw size={12} className="text-emerald-400 animate-spin" />
                          <span className="text-[10px] font-bold text-emerald-100 truncate max-w-[200px]">
                            {language === 'zh-TW' ? `正在搜尋: ${discoveryStatus}...` : `Searching: ${discoveryStatus}...`}
                          </span>
                       </div>
                       <span className="text-[10px] font-mono text-emerald-400">{displayedCards.length} Cards</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Sync Header - Enhanced */}
              <div className="flex justify-between items-center px-1 bg-[#1c1c1e]/50 p-2 rounded-xl border border-white/5">
                 <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{t.bestMatch}</span>
                    <div className="h-3 w-[1px] bg-white/10" />
                    <span className="flex items-center gap-1 text-[10px] text-slate-400 font-medium">
                      <Clock size={10} /> {getTimeAgo(activeMeta.lastFetch, language)}
                    </span>
                 </div>
                 
                 <button 
                    onClick={() => refreshCategory(activeCategory)} 
                    disabled={activeMeta.loading} 
                    className={`flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded-full transition-all ${
                      activeMeta.loading 
                        ? 'bg-emerald-500/20 text-emerald-400 cursor-not-allowed' 
                        : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20'
                    }`}
                 >
                   <RefreshCcw size={10} className={activeMeta.loading ? "animate-spin" : ""} /> 
                   {activeMeta.loading ? t.refreshing : (language === 'zh-TW' ? "更新分類" : "Refresh")}
                 </button>
              </div>

              {/* List */}
              <div className="space-y-4 min-h-[50vh]">
                {activeMeta.loading && displayedCards.length === 0 ? (
                  [1, 2, 3].map(i => (
                    <div key={i} className="h-32 rounded-2xl bg-[#1c1c1e] animate-pulse border border-white/5" />
                  ))
                ) : displayedCards.length > 0 ? (
                  displayedCards.map(c => (
                    <CardRow 
                      key={`${c.id}-${activeCategory}`} 
                      card={c} 
                      category={activeCategory} 
                      owned={ownedIds.has(c.id)} 
                      onClick={() => setSelectedCard(c)}
                      onToggle={() => setOwnedIds(prev => { const s = new Set(prev); s.has(c.id) ? s.delete(c.id) : s.add(c.id); return s; })} 
                      t={t} 
                      language={language}
                    />
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-slate-600">
                    <Info className="mb-3 opacity-50" size={32} />
                    <p className="text-xs font-medium">{t.noCards}</p>
                    <button 
                      onClick={() => refreshCategory(activeCategory)}
                      className="mt-4 text-xs font-bold text-emerald-400 underline"
                    >
                      {language === 'zh-TW' ? "立即同步" : "Sync Now"}
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* === WALLET === */}
          {view === 'WALLET' && (
            <motion.div key="wallet" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <div className="px-1 flex justify-between items-end">
                 <div>
                   <h2 className="text-3xl font-bold text-white mb-1">{t.wallet}</h2>
                   <p className="text-sm text-slate-400">{t.walletSubtitle}</p>
                 </div>
                 <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 rounded-full border border-white/5 mb-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                      {language === 'zh-TW' ? '已備份' : 'Synced'}
                    </span>
                 </div>
              </div>
              
              <div className="grid gap-3">
                {ownedIds.size === 0 ? (
                  <div className="border border-dashed border-white/10 rounded-2xl p-10 text-center bg-white/5">
                    <CreditCardIcon className="mx-auto mb-4 text-slate-600" size={40} />
                    <p className="text-slate-500 text-sm">{t.noCards}</p>
                    <button onClick={() => setView('HOME')} className="mt-4 text-xs font-bold text-emerald-400 underline">{t.explore}</button>
                  </div>
                ) : (
                  cards.filter(c => ownedIds.has(c.id)).map(c => (
                    <CardRow key={c.id} card={c} category={CardCategory.ALL} owned={true} onClick={() => setSelectedCard(c)} onToggle={() => { const s = new Set(ownedIds); s.delete(c.id); setOwnedIds(s); }} t={t} language={language} />
                  ))
                )}
              </div>
            </motion.div>
          )}

          {/* === ADVISOR === */}
          {view === 'SCANNER' && (
            <motion.div key="advisor" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="flex flex-col h-[70vh]">
              <div className="text-center mb-8">
                <div className="w-16 h-16 mx-auto bg-gradient-to-tr from-indigo-500 to-violet-600 rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(99,102,241,0.4)] mb-4 animate-float">
                  <Sparkles size={28} className="text-white" />
                </div>
                <h2 className="text-2xl font-bold">{t.advisor}</h2>
                <p className="text-xs text-slate-400 mt-2">{t.advisorSubtitle}</p>
              </div>

              <div className="flex-1 overflow-y-auto no-scrollbar space-y-4 mb-4 relative">
                 {aiResult ? (
                   <div className="bg-[#1c1c1e] border border-indigo-500/30 rounded-2xl p-6 relative overflow-hidden shadow-2xl">
                      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-purple-500" />
                      
                      {/* Best Match Header */}
                      <div className="flex justify-between items-start mb-4">
                        <span className="text-[10px] uppercase text-indigo-400 font-bold tracking-wider border border-indigo-500/20 px-2 py-1 rounded">{t.bestMatch}</span>
                        {aiResult.savingsEstimate && <span className="bg-emerald-500/20 text-emerald-400 text-sm font-bold px-3 py-1 rounded-lg">{aiResult.savingsEstimate}</span>}
                      </div>
                      
                      {/* Main Recommendation */}
                      <div className="mb-4">
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                           {cards.find(c => c.id === aiResult.bestCardId)?.bank || "Recommendation"}
                        </div>
                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                           <CreditCardIcon size={18} />
                           {cards.find(c => c.id === aiResult.bestCardId)?.name || aiResult.bestCardId}
                        </h3>
                      </div>
                      
                      <p className="text-sm text-slate-300 leading-relaxed mb-5">{aiResult.reasoning}</p>
                      
                      {/* Comparison Breakdown - NEW Structured Data UI */}
                      {aiResult.alternativeCards && aiResult.alternativeCards.length > 0 && (
                        <div className="mb-5 space-y-3">
                          <div className="flex items-center gap-2 text-[10px] uppercase text-slate-500 font-bold tracking-widest border-b border-white/5 pb-1">
                            <Zap size={12} /> Comparison
                          </div>
                          <div className="space-y-2">
                            {aiResult.alternativeCards.map((card, i) => (
                              <div 
                                key={i} 
                                onClick={() => card.link ? window.open(card.link, '_blank') : null}
                                className={`flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5 transition-colors ${card.link ? 'cursor-pointer hover:bg-white/10 hover:border-indigo-500/30' : ''}`}
                              >
                                <div className="flex flex-col gap-0.5">
                                   <span className="text-xs font-bold text-white flex items-center gap-1">
                                      {card.cardName} 
                                      {card.link && <ArrowUpRight size={10} className="text-slate-500" />}
                                   </span>
                                   <span className="text-[10px] text-slate-400">{card.reason}</span>
                                </div>
                                <div className="px-2 py-1 bg-emerald-500/10 text-emerald-400 rounded-lg text-xs font-bold border border-emerald-500/20 shrink-0">
                                   {card.savings}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Sources - Enhanced UI */}
                      {aiResult.sources && aiResult.sources.length > 0 && (
                        <div className="pt-4 border-t border-white/5">
                           <div className="text-[10px] text-slate-500 mb-2 font-bold tracking-wider">{t.sources}</div>
                           <div className="flex flex-col gap-1.5">
                             {aiResult.sources.slice(0, 3).map((s,i) => (
                               <a key={i} href={s.uri} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs text-indigo-300 hover:text-white transition-colors truncate group">
                                 <ArrowUpRight size={12} className="shrink-0 text-indigo-500 group-hover:text-white transition-colors" /> 
                                 <span className="truncate underline decoration-indigo-500/30 underline-offset-2 group-hover:decoration-white/50">{s.title}</span>
                               </a>
                             ))}
                           </div>
                        </div>
                      )}
                   </div>
                 ) : (
                   <div className="border border-dashed border-white/10 rounded-2xl p-6 text-center">
                      <p className="text-sm text-slate-500">{t.language === 'zh-TW' ? "💡 試試：「我要去日本玩」、「全家刷哪張」、「繳保費」" : "Try: 'Travel to Japan', 'Convenience Store', 'Insurance'"}</p>
                   </div>
                 )}
              </div>

              <div className="mt-auto">
                {/* Suggestions */}
                {!aiResult && (
                  <div className="flex gap-2 overflow-x-auto no-scrollbar mb-3 px-1 mask-fade-sides">
                    {suggestions.map(s => (
                      <button 
                        key={s} 
                        type="button"
                        onClick={() => setAiScenario(s)} 
                        className="whitespace-nowrap px-3 py-1.5 bg-[#1c1c1e] border border-white/10 rounded-full text-xs text-slate-300 hover:bg-white/10 hover:border-white/30 transition-colors shadow-sm"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}

                <form onSubmit={handleAISubmit} className="relative">
                  <input 
                    type="text" 
                    value={aiScenario} 
                    onChange={e => setAiScenario(e.target.value)} 
                    placeholder={t.scenarioPlaceholder} 
                    className="w-full bg-[#1c1c1e] border border-white/10 rounded-2xl py-4 pl-5 pr-24 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all text-sm shadow-lg" 
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                     {/* Clear Button */}
                     {(aiScenario || aiResult) && (
                         <button 
                            type="button" 
                            onClick={() => { setAiScenario(''); setAiResult(null); }}
                            className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-white transition-colors rounded-full hover:bg-white/10"
                         >
                            <X size={16} />
                         </button>
                     )}
                     <button type="submit" disabled={isAnalyzing || !aiScenario} className="w-10 h-10 bg-white text-black rounded-xl flex items-center justify-center hover:scale-105 transition-all disabled:opacity-50 disabled:hover:scale-100">
                      {isAnalyzing ? <RefreshCcw size={16} className="animate-spin" /> : <ChevronRight size={20} />}
                     </button>
                  </div>
                </form>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      <Dock view={view} setView={setView} t={t} />
      
      {/* Details Modal */}
      <AnimatePresence>
        {selectedCard && <CardDetailModal card={selectedCard} onClose={() => setSelectedCard(null)} t={t} language={language} />}
      </AnimatePresence>
    </div>
  );
}