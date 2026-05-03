import React, { useState, useEffect } from 'react';
import { ChefHat, Plus, Save, Trash2, Search, ArrowLeft, Loader2, BookOpen } from 'lucide-react';
import { sheetsService } from '../services/sheetsService';
import { cn } from '../lib/utils';
import { v4 as uuidv4 } from 'uuid';

export const RecipesView: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [rawItems, setRawItems] = useState<any[]>([]);
    const [recipes, setRecipes] = useState<any[]>([]);
    
    // UI State
    const [selectedMenuItem, setSelectedMenuItem] = useState<string | null>(null);
    const [searchMenuQuery, setSearchMenuQuery] = useState('');
    const [newMenuName, setNewMenuName] = useState('');

    const fetchData = async () => {
        setLoading(true);
        try {
            const [itemsRow, recipesRow] = await Promise.all([
                sheetsService.read('Masters_Items!A2:H'),
                sheetsService.read('Recipes!A2:C')
            ]);
            setRawItems(Array.isArray(itemsRow) ? itemsRow : []);
            setRecipes(Array.isArray(recipesRow) ? recipesRow : []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // Get unique menu item names from recipes
    const uniqueMenuItems = Array.from(new Set(recipes.map(r => r[0]))).filter(Boolean).sort();
    
    const filteredMenuItems = uniqueMenuItems.filter(name => 
        (name as string).toLowerCase().includes(searchMenuQuery.toLowerCase())
    );

    const handleCreateMenu = () => {
        if (!newMenuName.trim()) return;
        if (!uniqueMenuItems.includes(newMenuName.trim())) {
            setSelectedMenuItem(newMenuName.trim());
        }
        setNewMenuName('');
    };

    // Recipe Details for Selected Menu Item
    const currentRecipeDetails = recipes.filter(r => r[0] === selectedMenuItem);
    
    const handleDeleteIngredient = async (indexInOverallArray: number) => {
        setLoading(true);
        try {
            const newRecipes = [...recipes];
            newRecipes.splice(indexInOverallArray, 1);
            await sheetsService.update('Recipes!A2:C', newRecipes);
            await fetchData();
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const [newRawItemId, setNewRawItemId] = useState('');
    const [newQty, setNewQty] = useState('');

    const handleAddIngredient = async () => {
        if (!selectedMenuItem || !newRawItemId || !newQty) return;
        setLoading(true);
        try {
            await sheetsService.append('Recipes!A:C', [[
                selectedMenuItem,
                newRawItemId,
                newQty
            ]]);
            setNewRawItemId('');
            setNewQty('');
            await fetchData();
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6 pb-20">
            <div>
                <h2 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                    <ChefHat className="text-orange-500" />
                    Recipe Builder & BOM
                </h2>
                <p className="text-sm font-medium text-slate-500">Map your actual Menu Items to raw inventory for variance tracking.</p>
            </div>

            {!selectedMenuItem ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6">
                        <div className="flex flex-col gap-3">
                            <h3 className="font-bold text-slate-900 tracking-tight text-lg">Existing Recipes</h3>
                            <div className="relative">
                                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input 
                                    type="text" 
                                    placeholder="Search recipes..." 
                                    value={searchMenuQuery}
                                    onChange={e => setSearchMenuQuery(e.target.value)}
                                    className="w-full pl-10 p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
                                />
                            </div>
                            
                            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                {loading && recipes.length === 0 ? (
                                    <div className="py-4 text-center"><Loader2 className="animate-spin mx-auto text-slate-400" /></div>
                                ) : filteredMenuItems.length === 0 ? (
                                    <div className="py-8 text-center text-sm font-bold text-slate-400">No recipes found. Create one.</div>
                                ) : (
                                    filteredMenuItems.map((item, i) => (
                                        <div 
                                            key={i}
                                            onClick={() => setSelectedMenuItem(item as string)}
                                            className="flex items-center justify-between p-4 bg-slate-50 hover:bg-orange-50 rounded-xl cursor-pointer border border-transparent hover:border-orange-100 transition-colors group"
                                        >
                                            <div className="flex items-center gap-3">
                                                <BookOpen size={18} className="text-slate-400 group-hover:text-orange-500 transition-colors" />
                                                <span className="font-bold text-slate-700">{item as string}</span>
                                            </div>
                                            <div className="text-xs font-bold text-slate-400 flex items-center gap-1">
                                                <span>{recipes.filter(r => r[0] === item).length} Ingredients</span>
                                                <ArrowLeft size={14} className="rotate-180" />
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6">
                        <div className="flex flex-col gap-3">
                            <h3 className="font-bold text-slate-900 tracking-tight text-lg">Create New Recipe</h3>
                            <div className="space-y-3">
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Menu Item Name</label>
                                    <input 
                                        type="text" 
                                        placeholder="e.g. Chicken Karahi Half" 
                                        value={newMenuName}
                                        onChange={e => setNewMenuName(e.target.value)}
                                        className="w-full mt-1 p-4 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                                    />
                                    <p className="text-[10px] text-slate-400 mt-2">Make sure this name exactly matches the item name on your point of sale / billing system to map sales automatically.</p>
                                </div>
                                <button 
                                    onClick={handleCreateMenu}
                                    disabled={!newMenuName.trim()}
                                    className="w-full py-4 bg-orange-500 text-white rounded-xl font-bold hover:bg-orange-600 disabled:opacity-50 transition-all active:scale-[0.98]"
                                >
                                    Start Recipe
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                        <div className="flex items-center gap-4">
                            <button 
                                onClick={() => setSelectedMenuItem(null)}
                                className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm border border-slate-200 hover:bg-slate-50 transition-colors"
                            >
                                <ArrowLeft size={18} className="text-slate-600" />
                            </button>
                            <div>
                                <h3 className="font-bold text-slate-900 text-xl tracking-tight">{selectedMenuItem}</h3>
                                <p className="text-xs font-medium text-slate-500">Bill of Materials / Ingredients List</p>
                            </div>
                        </div>
                    </div>

                    <div className="p-6">
                        <div className="mb-8 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                            <h4 className="font-bold text-sm text-slate-700 tracking-tight mb-4">Add Ingredient</h4>
                            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                                <div className="md:col-span-6">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Raw Inventory Item</label>
                                    <select 
                                        value={newRawItemId}
                                        onChange={e => setNewRawItemId(e.target.value)}
                                        className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                                    >
                                        <option value="">Select Raw Item...</option>
                                        {rawItems.map((item, i) => (
                                            <option key={i} value={item[0]}>{item[1]} (Stock: {item[3]})</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="md:col-span-4">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Qty per Portion</label>
                                    <div className="relative">
                                        <input 
                                            type="number" 
                                            step="any"
                                            value={newQty}
                                            onChange={e => setNewQty(e.target.value)}
                                            className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 pr-12"
                                            placeholder="e.g. 0.25"
                                        />
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                                            {newRawItemId ? rawItems.find(i => i[0] === newRawItemId)?.[3] : 'unit'}
                                        </div>
                                    </div>
                                </div>
                                <div className="md:col-span-2">
                                    <button 
                                        onClick={handleAddIngredient}
                                        disabled={loading || !newRawItemId || !newQty}
                                        className="w-full h-[46px] bg-emerald-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-700 transition-colors disabled:opacity-50"
                                    >
                                        {loading ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />} 
                                        Add
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div>
                            <h4 className="font-bold text-sm text-slate-700 tracking-tight mb-4">Current Ingredients</h4>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b-2 border-slate-100">
                                            <th className="py-3 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Raw Item</th>
                                            <th className="py-3 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Unit</th>
                                            <th className="py-3 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Qty Per Portion</th>
                                            <th className="py-3 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {currentRecipeDetails.length === 0 ? (
                                            <tr>
                                                <td colSpan={4} className="py-8 text-center text-sm font-bold text-slate-400">
                                                    No ingredients added yet.
                                                </td>
                                            </tr>
                                        ) : (
                                            recipes.map((r, overallIndex) => {
                                                if (r[0] !== selectedMenuItem) return null;
                                                const rawItem = rawItems.find(i => i[0] === r[1]);
                                                return (
                                                    <tr key={overallIndex} className="hover:bg-slate-50 transition-colors">
                                                        <td className="py-3 px-4 font-bold text-slate-700">{rawItem ? rawItem[1] : 'Unknown'}</td>
                                                        <td className="py-3 px-4 text-sm font-medium text-slate-500">{rawItem ? rawItem[3] : '?'}</td>
                                                        <td className="py-3 px-4 text-sm font-bold text-slate-900 text-right">{r[2]}</td>
                                                        <td className="py-3 px-4 text-center">
                                                            <button 
                                                                onClick={() => handleDeleteIngredient(overallIndex)}
                                                                className="w-8 h-8 rounded-full flex items-center justify-center text-rose-400 hover:text-rose-600 hover:bg-rose-50 mx-auto transition-colors"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
