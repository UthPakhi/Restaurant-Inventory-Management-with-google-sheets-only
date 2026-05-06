import { useState, useEffect } from 'react';
import { 
  BarChart3, 
  ShoppingCart, 
  Package, 
  LogOut, 
  Settings, 
  LayoutDashboard, 
  ArrowRightLeft,
  Menu,
  Plus,
  BookOpen,
  History,
  Activity
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { format } from 'date-fns';

import { SetupWizard } from './components/SetupWizard';
import { InventoryView } from './components/InventoryView';
import { PurchasesView } from './components/PurchasesView';
import { IssuesView } from './components/IssuesView';
import { MastersView } from './components/MastersView';
import { SummaryView } from './components/SummaryView';
import { AuditLogsView } from './components/AuditLogsView';
import { StoreLedgerView } from './components/StoreLedgerView';
import { sheetsService, GoogleTokens } from './services/sheetsService';
import { useAppLookup } from './context/AppContext';

import { Toaster } from 'sonner';

import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";

// Types
type View = 'summary' | 'inventory' | 'purchases' | 'issues' | 'cashflow' | 'sales' | 'masters' | 'settings' | 'audit' | 'ledger';

export default function App() {
  const [activeView, setActiveView] = useState<View>('summary');
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 1024);
  const [user, setUser] = useState<{ email: string; name: string; picture?: string } | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('resto_theme');
    return saved === 'dark';
  });

  useEffect(() => {
    const metaLight = document.getElementById('theme-color-light');
    const metaDark = document.getElementById('theme-color-dark');
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('resto_theme', 'dark');
      if (metaLight) metaLight.setAttribute('content', '#0f172a');
      if (metaDark) metaDark.setAttribute('content', '#0f172a');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('resto_theme', 'light');
      if (metaLight) metaLight.setAttribute('content', '#ffffff');
      if (metaDark) metaDark.setAttribute('content', '#ffffff');
    }
  }, [isDarkMode]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [appData, setAppData] = useState<{ tokens: GoogleTokens; spreadsheetId: string } | null>(null);
  const [branding, setBranding] = useState<{ name: string; logoUrl: string }>({ name: 'TC Inventory Management Pro', logoUrl: '' });
  const { refreshStaticData } = useAppLookup();

  // Update document title and favicon when branding changes
  useEffect(() => {
    if (branding.name) {
      document.title = branding.name;
    }
    
    // Update favicon if logoUrl exists
    if (branding.logoUrl) {
      let link: HTMLLinkElement | null = document.querySelector("link[rel*='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.getElementsByTagName('head')[0].appendChild(link);
      }
      link.href = branding.logoUrl;
    }
  }, [branding]);

  // Initialize from LocalStorage
  const loadBrandingData = async (spreadsheetId: string) => {
    const bSaved = localStorage.getItem(`resto_branding_${spreadsheetId}`);
    if (bSaved) {
      try {
        const bParsed = JSON.parse(bSaved);
        setBranding({
          name: bParsed.restaurantName || 'RestoManage',
          logoUrl: bParsed.logoUrl || ''
        });
      } catch (e) {}
    }

    if (spreadsheetId !== 'demo-mode') {
      try {
          const rows = await sheetsService.read('AppSettings!A:B');
          if (rows && rows.length > 0) {
              let rName = branding.name;
              let lUrl = branding.logoUrl;
              rows.forEach((r: any) => {
                  if (r[0] === 'RestaurantName' && r[1]) rName = r[1];
                  if (r[0] === 'LogoUrl' && r[1]) lUrl = r[1];
              });
              setBranding({ name: rName, logoUrl: lUrl });
              localStorage.setItem(`resto_branding_${spreadsheetId}`, JSON.stringify({
                  restaurantName: rName,
                  logoUrl: lUrl
              }));
          }
      } catch (e) { 
          console.warn('Cound not load branding settings from Google Sheets. Using defaults/cached values.', e); 
      }
    }
  };

  const fetchUserProfile = async (tokens: GoogleTokens) => {
    if (!tokens.access_token) return;
    try {
      const res = await fetch("/api/auth/me", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokens }),
      });
      const data = await res.json();
      if (data.email) {
        setUser({ email: data.email, name: data.name || data.given_name || "User", picture: data.picture });
        sheetsService.setCurrentUser(data.email);
      }
    } catch (e) {
      console.error("Failed to fetch user profile", e);
    }
  };

  useEffect(() => {
    const saved = localStorage.getItem('resto_manage_data');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setAppData(parsed);

        const reloadLocalBranding = () => {
            const bSaved = localStorage.getItem(`resto_branding_${parsed.spreadsheetId}`);
            if (bSaved) {
              try {
                const bParsed = JSON.parse(bSaved);
                setBranding({
                  name: bParsed.restaurantName || 'RestoManage',
                  logoUrl: bParsed.logoUrl || ''
                });
              } catch (e) {}
            }
        };
        window.addEventListener('branding-changed', reloadLocalBranding);

        if (parsed.spreadsheetId === 'demo-mode') {
          sheetsService.setDemoMode(true);
          setUser({ email: 'demo@example.com', name: 'Demo User', picture: '' });
          sheetsService.setCurrentUser('demo@example.com');
          loadBrandingData('demo-mode');
        } else {
          sheetsService.setTokens(parsed.tokens);
          sheetsService.setSpreadsheetId(parsed.spreadsheetId);
          fetchUserProfile(parsed.tokens);
          loadBrandingData(parsed.spreadsheetId);
        }
        setIsInitialized(true);
        refreshStaticData();
      } catch (e) {
        console.error("Failed to parse saved data", e);
      }
    }
  }, []);

  const handleSetupComplete = (data: { tokens: GoogleTokens; spreadsheetId: string }) => {
    setAppData(data);
    localStorage.setItem('resto_manage_data', JSON.stringify(data));
    setIsInitialized(true);
    if (data.spreadsheetId === 'demo-mode') {
      setUser({ email: 'demo@example.com', name: 'Demo User', picture: '' });
      sheetsService.setCurrentUser('demo@example.com');
      loadBrandingData('demo-mode');
    } else {
      fetchUserProfile(data.tokens);
      loadBrandingData(data.spreadsheetId);
    }
    refreshStaticData();
  };

  const navItems = [
    { id: 'summary', label: 'Summary / Analytics', icon: BarChart3 },
    { id: 'inventory', label: 'Stock Status', icon: Package },
    { id: 'purchases', label: 'Purchases', icon: ShoppingCart },
    { id: 'issues', label: 'Issues', icon: ArrowRightLeft },
    { id: 'ledger', label: 'Store Ledger', icon: BookOpen },
    { id: 'masters', label: 'Setup Masters', icon: Settings },
    { id: 'audit', label: 'Audit Logs', icon: History }
  ];

  if (!isInitialized) {
    return <SetupWizard onComplete={handleSetupComplete} />;
  }

  return (
    <div className={cn(
      "flex h-screen w-full bg-slate-50 text-slate-900 overflow-hidden font-sans transition-colors duration-300",
      "dark:bg-slate-950 dark:text-slate-100"
    )}>
      <Analytics />
      <SpeedInsights />
      <Toaster position="top-right" richColors />
      {isSidebarOpen && (
        <div 
           className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden"
           onClick={() => setIsSidebarOpen(false)}
        />
      )}
      {/* Sidebar */}
      <aside className={cn(
        "fixed lg:relative z-50 h-full w-64 bg-slate-900 text-white flex flex-col transition-transform duration-300 shrink-0 pt-safe pb-safe",
        !isSidebarOpen && "-translate-x-full lg:translate-x-0 lg:w-20",
        isDarkMode && "bg-slate-950 border-r border-slate-800"
      )}>
        <div className="p-6 flex items-center gap-3">
          {branding.logoUrl ? (
            <img src={branding.logoUrl} alt="Logo" className="w-8 h-8 rounded-lg object-cover shrink-0 bg-white" />
          ) : (
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center font-bold text-slate-900 shrink-0">
              {branding.name.charAt(0).toUpperCase()}
            </div>
          )}
          {isSidebarOpen && (
            <motion.span 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }}
              className="text-xl font-bold tracking-tight truncate"
            >
              {branding.name}
            </motion.span>
          )}
        </div>

        <nav className="flex-1 px-4 space-y-1 overflow-y-auto font-sans">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                   setActiveView(item.id as View);
                   if (window.innerWidth < 1024) {
                     setIsSidebarOpen(false);
                   }
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-bold transition-all duration-200 group text-left",
                  isActive 
                    ? "bg-emerald-500/10 text-emerald-400" 
                    : "text-slate-400 hover:text-white hover:bg-slate-800",
                )}
              >
                <Icon size={18} className={cn(
                  "shrink-0",
                  isActive ? "text-emerald-400" : "text-slate-500 group-hover:text-white"
                )} />
                {isSidebarOpen && <span className="uppercase tracking-tight text-[11px]">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        <div className="p-4 mt-auto border-t border-slate-800">
           {isInitialized && isSidebarOpen && (
             <div className="mb-4 p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Sheet ID</p>
                <p className="text-[9px] text-emerald-500 font-mono truncate">{appData?.spreadsheetId}</p>
             </div>
           )}
          <div className="flex items-center gap-3 p-2 rounded-lg bg-slate-800/50 group">
            {user?.picture ? (
              <img src={user.picture} alt="Avatar" className="w-8 h-8 rounded shrink-0 object-cover" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-8 h-8 rounded bg-orange-400 flex items-center justify-center text-xs font-bold shrink-0">
                {user?.name.slice(0, 2) || "AD"}
              </div>
            )}
            {isSidebarOpen && (
              <>
                <div className="flex-1 overflow-hidden">
                  <p className="text-xs font-semibold truncate">{user?.name}</p>
                  <p className="text-[10px] text-slate-500 truncate lowercase">{user?.email}</p>
                </div>
                <button 
                    onClick={() => { localStorage.removeItem('resto_manage_data'); window.location.reload(); }}
                    className="text-slate-500 hover:text-red-400 transition-colors shrink-0"
                >
                  <LogOut size={14} />
                </button>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Header */}
        <header className="h-safe-header pt-safe px-6 flex items-center justify-between shrink-0 border-b border-slate-200 bg-white shadow-sm dark:bg-slate-900 dark:border-slate-800">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              <Menu size={20} className="text-slate-500 dark:text-slate-400" />
            </button>
            <div>
              <h1 className="text-lg font-bold tracking-tight capitalize leading-none mb-0.5 dark:text-white">{activeView.replace('-', ' ')}</h1>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider dark:text-slate-400">Operations Hub v1.0</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
             <button
               onClick={() => setIsDarkMode(!isDarkMode)}
               className="p-2 rounded-lg bg-slate-50 border border-slate-100 hover:bg-slate-100 dark:bg-slate-800 dark:border-slate-700 dark:hover:bg-slate-700 transition-all font-bold text-lg"
             >
               {isDarkMode ? "☀️" : "🌙"}
             </button>
          </div>
        </header>

        <section className="flex-1 overflow-y-auto p-6 pb-safe scroll-smooth">
          <div className="max-w-6xl mx-auto h-full pb-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeView}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.2 }}
                className="h-full"
              >
                {activeView === 'summary' && <SummaryView />}
                {activeView === 'inventory' && <InventoryView />}
                {activeView === 'purchases' && <PurchasesView />}
                {activeView === 'issues' && <IssuesView />}
                {activeView === 'ledger' && <StoreLedgerView />}
                {activeView === 'masters' && <MastersView />}
                {activeView === 'audit' && <AuditLogsView />}
              </motion.div>
            </AnimatePresence>
          </div>
        </section>
      </main>
    </div>
  );
}
