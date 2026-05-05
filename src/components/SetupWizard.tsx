import React, { useState } from 'react';
import { sheetsService, GoogleTokens } from '../services/sheetsService';
import { motion } from 'motion/react';
import { LayoutDashboard, Cloud, Shield, Zap, Loader2, Database, Lock } from 'lucide-react'; 

interface SetupWizardProps {
  onComplete: (data: { tokens: GoogleTokens; spreadsheetId: string }) => void;
}

export const SetupWizard: React.FC<SetupWizardProps> = ({ onComplete }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showExistingInput, setShowExistingInput] = useState(false);
  const [existingIdInput, setExistingIdInput] = useState('');

const performAuth = async (isExisting: boolean) => {
  setLoading(true);
  try {
    const popup = window.open('about:blank', 'google_auth', 'width=600,height=700');
    const url = await sheetsService.getAuthUrl();
    if (popup) popup.location.href = url;

    // Clear any stale token from a previous attempt
    window.localStorage.removeItem('GOOGLE_AUTH_TOKENS');

    let settled = false;

    const handleSuccess = async (tokens: GoogleTokens) => {
      if (settled) return;
      settled = true;
      clearInterval(pollInterval);
      window.removeEventListener('message', handleMessage);
      if (bc) bc.close();
      if (popup && !popup.closed) popup.close();

      try {
        sheetsService.setTokens(tokens);
        if (isExisting) {
          let existingSpreadsheetId = existingIdInput;
          if (existingSpreadsheetId.includes('/d/')) {
            const match = existingSpreadsheetId.match(/\/d\/([a-zA-Z0-9-_]+)/);
            if (match && match[1]) existingSpreadsheetId = match[1];
          }
          sheetsService.setSpreadsheetId(existingSpreadsheetId);
          await sheetsService.read("Masters_Items!A1:A1");
          await sheetsService.initializeSheetStructure();
          onComplete({ tokens, spreadsheetId: existingSpreadsheetId });
        } else {
          const result = await sheetsService.createSpreadsheet("Restaurant Management Sheet");
          await sheetsService.initializeSheetStructure();
          onComplete({ tokens, spreadsheetId: result.spreadsheetId });
        }
      } catch (e: any) {
        setError(e.message);
        setLoading(false);
      }
    };

    // Method 1: postMessage (works when COOP is unsafe-none)
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'GOOGLE_AUTH_SUCCESS') handleSuccess(event.data.tokens);
    };
    window.addEventListener('message', handleMessage);

    // Method 2: BroadcastChannel
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('google_auth_channel');
      bc.onmessage = (event) => {
        if (event.data?.type === 'GOOGLE_AUTH_SUCCESS') handleSuccess(event.data.tokens);
      };
    } catch (e) {}

    // Method 3: Poll localStorage (replaces storage event — works across COOP splits)
    const pollInterval = setInterval(() => {
      // Also stop polling if the popup was manually closed without auth
      if (popup?.closed && !settled) {
        clearInterval(pollInterval);
        window.removeEventListener('message', handleMessage);
        if (bc) bc.close();
        setLoading(false);
        return;
      }

      try {
        const raw = window.localStorage.getItem('GOOGLE_AUTH_TOKENS');
        if (raw) {
          window.localStorage.removeItem('GOOGLE_AUTH_TOKENS');
          const tokens = JSON.parse(raw);
          handleSuccess(tokens);
        }
      } catch (e) {}
    }, 500);

  } catch (err: any) {
    setError(err.message);
    setLoading(false);
  }
};

  const startAuth = () => performAuth(false);
  const startAuthExisting = () => performAuth(true);

  return (
    <div className="fixed inset-0 z-[100] bg-slate-50 flex items-center justify-center p-6 sm:p-12 overflow-y-auto dark:bg-slate-950">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="max-w-xl w-full flex flex-col items-center"
      >
        <div className="w-16 h-16 bg-emerald-600 rounded-2xl flex items-center justify-center text-white text-3xl font-bold shadow-xl shadow-emerald-600/20 mb-8 cursor-default transition-transform hover:scale-105 active:scale-95">
           R
        </div>

        <div className="text-center space-y-3 mb-10 max-w-sm">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 leading-tight dark:text-white">Welcome to RestoManage</h2>
          <p className="text-slate-500 text-sm dark:text-slate-400">
            Professional Cloud-sync for your restaurant. Connect your Google account to initialize your personal database on Google Sheets.
          </p>
        </div>

        {error && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full mb-6 p-4 bg-red-50 text-red-600 text-xs font-medium rounded-xl border border-red-100 flex flex-col gap-2 dark:bg-red-500/10 dark:text-red-400 dark:border-red-900/50"
          >
            <div className="flex items-center gap-3">
              <Shield size={16} />
              <span className="flex-1">{error}</span>
            </div>
            <div className="pl-7 text-[10px] text-red-500/80 dark:text-red-400/80">
              Getting 'redirect_uri_mismatch'? Make sure the URL in your Google Cloud Console matches your current domain. Check GOOGLE_OAUTH_SETUP.md for instructions.
            </div>
          </motion.div>
        )}

        <div className="w-full bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-4 dark:bg-slate-900 dark:border-slate-800">
          {!showExistingInput ? (
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={startAuth}
                disabled={loading}
                className="group relative flex-1 py-4 bg-slate-900 text-white rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-slate-800 transition-all disabled:bg-slate-300 shadow-xl overflow-hidden active:scale-[0.98] dark:bg-slate-950 dark:hover:bg-black dark:disabled:bg-slate-800"
              >
                {loading ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : (
                  <>
                    <img src="https://www.google.com/favicon.ico" className="w-5 h-5 grayscale group-hover:grayscale-0 transition-all" alt="Google" />
                    <span className="tracking-tight">Create New</span>
                  </>
                )}
              </button>

              <button
                onClick={() => setShowExistingInput(true)}
                disabled={loading}
                className="group relative flex-1 py-4 bg-emerald-600 text-white rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-emerald-700 transition-all disabled:bg-emerald-300 shadow-xl overflow-hidden active:scale-[0.98] dark:disabled:bg-emerald-900/30"
              >
                {loading ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : (
                  <>
                    <Database size={20} className="opacity-80 group-hover:opacity-100 transition-all" />
                    <span className="tracking-tight">Join Existing</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="space-y-3"
            >
              <div className="flex flex-col space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider dark:text-slate-400">Spreadsheet URL or ID</label>
                <input 
                  type="text" 
                  autoFocus
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  value={existingIdInput}
                  onChange={(e) => setExistingIdInput(e.target.value)}
                  className="w-full p-4 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:placeholder:text-slate-600"
                />
                <p className="text-[10px] text-slate-400 dark:text-slate-500">Ask your manager to share the sheet with your Google Account first.</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowExistingInput(false)}
                  disabled={loading}
                  className="px-4 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all text-sm dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  onClick={startAuthExisting}
                  disabled={loading || !existingIdInput.trim()}
                  className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all disabled:opacity-50 text-sm"
                >
                  {loading ? <Loader2 className="animate-spin" size={16} /> : 'Connect & Authorize'}
                </button>
              </div>
            </motion.div>
          )}

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-slate-100 dark:border-slate-800"></span></div>
            <div className="relative flex justify-center text-[10px] uppercase tracking-widest font-bold text-slate-300 dark:text-slate-700"><span className="bg-white px-3 dark:bg-slate-900">or</span></div>
          </div>

          <button
            onClick={() => {
              sheetsService.setDemoMode(true);
              onComplete({ tokens: {}, spreadsheetId: 'demo-mode' });
            }}
            className="w-full py-3 bg-slate-50 text-slate-600 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-100 transition-all border border-slate-100 active:scale-[0.98] dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-700"
          >
            <Zap size={16} className="text-amber-500" />
            Try Demo Mode (Local Only)
          </button>
          
          <div className="flex items-center gap-2 justify-center text-[10px] text-slate-400 font-bold uppercase tracking-widest pt-2 dark:text-slate-600">
            <Lock size={12} />
            Secure OAuth 2.0 Encryption
          </div>
        </div>

        <div className="w-full mt-12 grid grid-cols-3 gap-6">
           {[
             { label: 'Cloud Sync', icon: Cloud, color: 'text-blue-500', bg: 'bg-blue-50', darkBg: 'dark:bg-blue-500/10' },
             { label: 'Sheet Auth', icon: Database, color: 'text-emerald-500', bg: 'bg-emerald-50', darkBg: 'dark:bg-emerald-500/10' },
             { label: 'Instant API', icon: Zap, color: 'text-amber-500', bg: 'bg-amber-50', darkBg: 'dark:bg-amber-500/10' },
           ].map((badge, i) => (
             <div key={i} className="flex flex-col items-center text-center space-y-2">
               <div className={`w-10 h-10 ${badge.bg} ${badge.color} rounded-xl flex items-center justify-center shadow-sm ${badge.darkBg}`}>
                  <badge.icon size={20} />
               </div>
               <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wider whitespace-nowrap dark:text-slate-600">{badge.label}</p>
             </div>
           ))}
        </div>

        <p className="mt-12 text-[10px] text-slate-400 font-medium text-center leading-relaxed dark:text-slate-600">
          By connecting, you agree to allow RestoManage to manage files in your Google Drive folder for application data storage. You retain 100% ownership of your data.
        </p>
      </motion.div>
    </div>
  );
};
