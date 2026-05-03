import React, { useState, useEffect } from 'react';
import { Save, Store, Image as ImageIcon, Camera } from 'lucide-react';

export const SettingsView: React.FC = () => {
  const [restaurantName, setRestaurantName] = useState('RestoManage');
  const [logoUrl, setLogoUrl] = useState('');
  const [spreadsheetId, setSpreadsheetId] = useState<string | null>(null);

  useEffect(() => {
    const savedData = localStorage.getItem('resto_manage_data');
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        setSpreadsheetId(parsed.spreadsheetId);
        
        const savedBranding = localStorage.getItem(`resto_branding_${parsed.spreadsheetId}`);
        if (savedBranding) {
          const parsedBranding = JSON.parse(savedBranding);
          if (parsedBranding.restaurantName) setRestaurantName(parsedBranding.restaurantName);
          if (parsedBranding.logoUrl) setLogoUrl(parsedBranding.logoUrl);
        }
      } catch (e) {
        console.error("Failed to load branding info");
      }
    }
  }, []);

  const handleSave = () => {
    if (!spreadsheetId) return;
    localStorage.setItem(`resto_branding_${spreadsheetId}`, JSON.stringify({
      restaurantName,
      logoUrl
    }));
    window.dispatchEvent(new Event('branding-changed'));
    // Show a quick success feedback or just rely on the immediate update
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">App Settings</h2>
        <p className="text-sm font-medium text-slate-500">Configure your restaurant's branding and application preferences.</p>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 md:p-8 space-y-8">
          
          <div className="space-y-5">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Store size={20} className="text-emerald-500" />
              Restaurant Branding
            </h3>
            
            <div className="flex flex-col md:flex-row gap-8 items-start">
              {/* Logo Upload */}
              <div className="flex flex-col gap-3">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Restaurant Logo</label>
                <div className="relative group w-32 h-32 rounded-2xl border-2 border-dashed border-slate-300 flex items-center justify-center bg-slate-50 overflow-hidden hover:border-emerald-500 transition-colors cursor-pointer">
                  {logoUrl ? (
                    <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center text-slate-400">
                      <ImageIcon size={32} className="mb-2 opacity-50" />
                      <span className="text-[10px] font-bold uppercase">Upload Logo</span>
                    </div>
                  )}
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={handleImageUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
                  />
                  <div className="absolute inset-0 bg-black/50 hidden group-hover:flex items-center justify-center pointer-events-none transition-all">
                      <Camera size={24} className="text-white" />
                  </div>
                </div>
                {logoUrl && (
                  <button 
                    onClick={() => setLogoUrl('')}
                    className="text-[10px] font-bold text-rose-500 hover:text-rose-600 uppercase tracking-wider text-center"
                  >
                    Remove Logo
                  </button>
                )}
              </div>

              {/* General Settings */}
              <div className="flex-1 w-full space-y-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Restaurant Name</label>
                  <input 
                    type="text" 
                    value={restaurantName}
                    onChange={(e) => setRestaurantName(e.target.value)}
                    placeholder="E.g., The Grand Palace"
                    className="w-full p-4 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent font-medium"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-100 flex justify-end">
            <button 
              onClick={handleSave}
              className="px-8 py-4 bg-emerald-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-500/20 active:scale-[0.98]"
            >
              <Save size={18} />
              Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
