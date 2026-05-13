import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Search, X, Loader2, Package, Hash, User, ShieldCheck, Save, Store, Image as ImageIcon, Camera, Check, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { sheetsService } from '../services/sheetsService';
import { mapRowToItem, mapRowToDepartment, mapRowToSupplier, mapItemToRow } from '../services/dataMappers';
import { Item, Department, Supplier } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { useAppLookup } from '../context/AppContext';

import { toast } from 'sonner';
export const MastersView: React.FC = () => {
    const { refreshStaticData, departments: allDepts } = useAppLookup();
    const [tab, setTab] = useState<'items' | 'depts' | 'suppliers' | 'settings'>('items');
    const [items, setItems] = useState<Item[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [loading, setLoading] = useState(false);
    const [isAdding, setIsAdding] = useState(false);
    const [isBulkImport, setIsBulkImport] = useState(false);
    const [bulkText, setBulkText] = useState('');
    const [openingStockDate, setOpeningStockDate] = useState('2026-05-01');
    const [searchQuery, setSearchQuery] = useState('');

    const [newItem, setNewItem] = useState({ name: '', deptIds: '', unit: 'kg', buyPrice: '0', sellPrice: '0', category: 'Raw', openingStock: '0', minParLevel: '0', reorderQty: '0' });
    const [newDept, setNewDept] = useState({ name: '' });
    const [newSupplier, setNewSupplier] = useState({ name: '', contact: '' });

    const [editingItem, setEditingItem] = useState<Item | null>(null);
    const [editingDept, setEditingDept] = useState<Department | null>(null);
    const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

    const [showInactive, setShowInactive] = useState(false);
    const [restaurantName, setRestaurantName] = useState('RestoManage');
    const [logoUrl, setLogoUrl] = useState('');
    
    // Reset Modal State
    const [showResetModal, setShowResetModal] = useState(false);
    const [resetConfirmText, setResetConfirmText] = useState('');

    // Additional Confirmation States
    const [showSeedModal, setShowSeedModal] = useState(false);

    const fetchData = async () => {
        setLoading(true);
        try {
            if (tab === 'items') {
                const rows = await sheetsService.read('Masters_Items!A2:K');
                setItems((rows || []).filter(r => r[0]).map((row, i) => ({...mapRowToItem(row), rowIndex: i + 2})));
            } else if (tab === 'depts') {
                const rows = await sheetsService.read('Masters_Depts!A2:C');
                setDepartments((rows || []).filter(r => r[0]).map((row, i) => ({...mapRowToDepartment(row), rowIndex: i + 2})));
            } else if (tab === 'suppliers') {
                const rows = await sheetsService.read('Masters_Suppliers!A2:D');
                setSuppliers((rows || []).filter(r => r[0]).map((row, i) => ({...mapRowToSupplier(row), rowIndex: i + 2})));
            } else if (tab === 'settings') {
                try {
                    const rows = await sheetsService.read('AppSettings!A:B');
                    if (rows) {
                        rows.forEach((r: any) => {
                            if (r[0] === 'RestaurantName') setRestaurantName(r[1] || 'RestoManage');
                            if (r[0] === 'LogoUrl') setLogoUrl(r[1] || '');
                        });
                    }
                } catch (e) {
                    console.warn('AppSettings sheet may not exist yet:', e);
                }
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [tab]);

    const handleBulkImport = async () => {
        if (!bulkText.trim()) return;
        setLoading(true);
        try {
            const lines = bulkText.trim().split('\n');
            const items: any[][] = [];
            const batches: any[][] = [];
            const dateStr = openingStockDate;
            
            const validationErrors: string[] = [];
            
            lines.forEach((line, index) => {
                const parts = line.split('\t');
                if (parts.length >= 1) {
                    const name = parts[0]?.trim();
                    // Skip header if present or empty name
                    if (!name || name.toLowerCase() === 'item name') return;
                    
                    if (parts.length < 4) {
                       validationErrors.push(`Row ${index + 1} (${name}) missing enough columns. Expected at least Name, Sections, Unit, Category.`);
                    }

                    const deptIds = parts[1]?.trim() || '';
                    const unit = parts[2]?.trim() || 'pcs';
                    const category = parts[3]?.trim() || 'Raw';
                    const buyPrice = Number((parts[4] || '0').toString().replace(/,/g, '')) || 0;
                    const sellPrice = Number((parts[5] || '0').toString().replace(/,/g, '')) || 0;
                    const qty = Number((parts[6] || '0').toString().replace(/,/g, '')) || 0;
                    const minPar = Number((parts[7] || '0').toString().replace(/,/g, '')) || 0;
                    const reorder = Number((parts[8] || '0').toString().replace(/,/g, '')) || 0;

                    const id = `ITM_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                    
                    // Schema: [id, name, deptIds, unit, buyPrice, sellPrice, category, openingStock, minParLevel, reorderQty, Status]
                    items.push([id, name, deptIds, unit, buyPrice, sellPrice, category, qty, minPar, reorder, 'Yes']);
                    
                    if (qty > 0) {
                        // Schema: [Batch_ID, Item_ID, Date, Qty_Original, Qty_Remaining, Unit_Cost, Source]
                        batches.push([`B_OPEN_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`, id, dateStr, qty, qty, buyPrice, 'Opening']);
                    }
                }
            });

            if (validationErrors.length > 0) {
                 toast.error(`Validation warnings:\n${validationErrors.slice(0, 3).join('\n')}${validationErrors.length > 3 ? `\n...and ${validationErrors.length - 3} more` : ''}`);
            }

            if (items.length > 0) {
                // Sequential chunking for large imports
                const chunkSize = 100;
                for (let i = 0; i < items.length; i += chunkSize) {
                    await sheetsService.append('Masters_Items', items.slice(i, i + chunkSize));
                }
                
                for (let i = 0; i < batches.length; i += chunkSize) {
                    await sheetsService.append('Batches', batches.slice(i, i + chunkSize));
                }
                
                toast.success(`Successfully imported ${items.length} items and created ${batches.length} stock batches.`);
                setIsBulkImport(false);
                setBulkText('');
                await fetchData();
                await refreshStaticData();
            } else {
                toast.error("No valid items found to import.");
                setIsBulkImport(false);
                setBulkText('');
            }
        } catch (e: any) {
            console.error(e);
            toast.error("Bulk import failed: " + e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleRepairSheets = async () => {
        setLoading(true);
        try {
            await sheetsService.initializeSheetStructure();
            toast.success("Spreadsheet structure updated and missing sheets created!");
        } catch (e: any) {
            console.error(e);
            toast.error("Repair failed: " + e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSeedDemo = async () => {
        setLoading(true);
        setShowSeedModal(false);
        try {
            // Seed Depts
            const depts = [
                ['D01', 'Handi'], 
                ['D02', 'Karahi'], 
                ['D03', 'Pizza'], 
                ['D04', 'BBQ'], 
                ['D05', 'Tea'],
                ['D06', 'Bar'],
                ['D07', 'Drinks'],
                ['D08', 'Pantree'],
                ['D09', 'Tandoor']
            ];
            await sheetsService.append('Masters_Depts', depts);

            // Item Mappings based on provided sections
            const itemMap: { [key: string]: string[] } = {
                'Handi': ['D01'], 'Karahi': ['D02'], 'Pizza': ['D03'], 'BBQ': ['D04'], 
                'Tea': ['D05'], 'Bar': ['D06'], 'Drinks': ['D07', 'D06'], 'Pantree': ['D08'], 'Tandoor': ['D09']
            };

            // Raw items from user request with pre-assigned mapping logic
            const rawData = [
                ["ITM_1", "Achar National", "D01,D02,D03,D04", "pcs", "645", "0", "Opening", "2"],
                ["ITM_2", "Achari Masala 1kg Shaan", "D01,D02,D03,D04", "pcs", "1545", "0", "Opening", "1"],
                ["ITM_3", "Adrak Powder 50g", "D01,D02,D03,D04,D09", "pcs", "155", "0", "Opening", "1"],
                ["ITM_4", "Ajnoo Moto", "D01,D02,D03,D04", "pcs", "1300", "0", "Opening", "3"],
                ["ITM_5", "Alfredo Pasta 500g", "D03", "pcs", "560", "0", "Opening", "13"],
                ["ITM_6", "Aloo Bukhara", "D01", "pcs", "1100", "0", "Opening", "10.4"],
                ["ITM_7", "Aquafina 1.5L", "D07,D06", "pcs", "410", "0", "Opening", "257"],
                ["ITM_8", "Aquafina 500ml", "D07,D06", "pcs", "440", "0", "Opening", "18"],
                ["ITM_9", "Badam", "D01,D05,D06", "pcs", "2800", "0", "Opening", "17"],
                ["ITM_10", "Baking Powder", "D03", "pcs", "130", "0", "Opening", "4"],
                ["ITM_11", "Baking Powder 1kg", "D03,D09", "pcs", "1000", "0", "Opening", "9"],
                ["ITM_12", "BBQ Sauce 800ml", "D01,D03,D04", "pcs", "580", "0", "Opening", "6"],
                ["ITM_13", "Biryani Masala 1kg Shaan", "D01,D02", "pcs", "1545", "0", "Opening", "5"],
                ["ITM_14", "Black olives Can", "D03", "pcs", "1900", "0", "Opening", "17"],
                ["ITM_15", "Blue Band Makhan 500g", "D05,D06", "pcs", "939", "0", "Opening", "5"],
                ["ITM_16", "Blueberry Syrup Voglya", "D06", "pcs", "2425", "0", "Opening", "9"],
                ["ITM_17", "Blueberry Topping", "D06", "pcs", "600", "0", "Opening", "5"],
                ["ITM_18", "Bombay Biryani Masala 75g", "D01,D02", "pcs", "150", "0", "Opening", "7"],
                ["ITM_19", "Bread Gram", "D01,D03,D04", "pcs", "350", "0", "Opening", "1"],
                ["ITM_20", "Bread Gram kato 10kg", "D01,D03,D04", "pcs", "1800", "0", "Opening", "8"],
                ["ITM_21", "Brown Basar", "D01,D02", "pcs", "160", "0", "Opening", "2"],
                ["ITM_22", "Bunti Jar", "D06", "pcs", "600", "0", "Opening", "1"],
                ["ITM_23", "Burger Bun 4*5", "D03", "pcs", "120", "0", "Opening", "14"],
                ["ITM_24", "Cadbury Cocoa Powder 125g", "D06", "pcs", "480", "0", "Opening", "1"],
                ["ITM_25", "Candey Biscuit", "D06", "pcs", "300", "0", "Opening", "1"],
                ["ITM_26", "Candey Biscuit 20", "D06", "pcs", "275", "0", "Opening", "6"],
                ["ITM_27", "Caramel Syrup Voglya", "D06", "pcs", "2425", "0", "Opening", "3"],
                ["ITM_28", "Caremel Topping", "D06", "pcs", "600", "0", "Opening", "10"],
                ["ITM_29", "Chadar Cheese", "D03", "pcs", "2600", "0", "Opening", "7"],
                ["ITM_30", "Chana sabit (Staff)", "D01,D02", "pcs", "300", "0", "Opening", "1"],
                ["ITM_31", "Chanwar Tarazoo Sela", "D01", "pcs", "332", "0", "Opening", "2.5"],
                ["ITM_32", "Cheese Slice", "D03", "pcs", "1450", "0", "Opening", "1"],
                ["ITM_33", "Cheese White 2kg", "D03", "pcs", "2450", "0", "Opening", "8"],
                ["ITM_34", "Chicken Broast Masala 130g", "D03,D04", "pcs", "140", "0", "Opening", "13"],
                ["ITM_35", "Chicken Masala 1kg Shaan", "D01,D02,D04", "pcs", "1545", "0", "Opening", "1"],
                ["ITM_36", "Chicken Stock 10g", "D01,D03,D04", "pcs", "50", "0", "Opening", "11"],
                ["ITM_37", "Chicken White Masala 1kg Shaan", "D01,D02,D04", "pcs", "1545", "0", "Opening", "4"],
                ["ITM_38", "Chilli Sauce 5kg", "D01,D03,D04", "pcs", "1350", "0", "Opening", "3"],
                ["ITM_39", "Chilli Sauce 800ml", "D01,D03,D04", "pcs", "240", "0", "Opening", "90"],
                ["ITM_40", "Choclate Chip 1kg", "D06", "pcs", "850", "0", "Opening", "5"],
                ["ITM_41", "Choclate Topping", "D06", "pcs", "650", "0", "Opening", "7"],
                ["ITM_42", "Chomian", "D01", "pcs", "210", "0", "Opening", "35"],
                ["ITM_43", "Chowanra (lobia)", "D01", "pcs", "300", "0", "Opening", "2.5"],
                ["ITM_44", "Coffee Beans Voglya", "D06", "pcs", "7100", "0", "Opening", "1"],
                ["ITM_45", "Custard Mango 120g", "D01,D06", "pcs", "120", "0", "Opening", "13"],
                ["ITM_46", "Daal Chana (Staff)", "D01,D02", "pcs", "180", "0", "Opening", "3.5"],
                ["ITM_47", "Dal Dhootal", "D01", "pcs", "315", "0", "Opening", "9"],
                ["ITM_48", "Dal Masoor Lal", "D01", "pcs", "250", "0", "Opening", "3.5"],
                ["ITM_49", "Dal Masoor Sabit", "D01", "pcs", "250", "0", "Opening", "4"],
                ["ITM_50", "Dalchani kg", "D01,D02", "pcs", "900", "0", "Opening", "6.5"],
                ["ITM_51", "Dark Choclate 2kg Pkt", "D06", "pcs", "1200", "0", "Opening", "5"],
                ["ITM_52", "Dasani 1.5L", "D07,D06", "pcs", "430", "0", "Opening", "350"],
                ["ITM_53", "Dasani 500ml", "D07,D06", "pcs", "490", "0", "Opening", "29"],
                ["ITM_54", "Desi Ghee", "D01,D02,D09", "pcs", "2650", "0", "Opening", "13"],
                ["ITM_55", "East Powder", "D03,D09", "pcs", "830", "0", "Opening", "14"],
                ["ITM_56", "Egg", "D01,D03,D04,D06", "pcs", "28", "0", "Opening", "47"],
                ["ITM_57", "Eka Powder", "D03", "pcs", "420", "0", "Opening", "11"],
                ["ITM_58", "Elaichan Bottle", "D06", "pcs", "480", "0", "Opening", "1"],
                ["ITM_59", "Elaichi kg", "D01,D02,D05,D09", "pcs", "11000", "0", "Opening", "2.5"],
                ["ITM_60", "Family Mixture", "D05", "pcs", "1675", "0", "Opening", "8"],
                ["ITM_61", "Fine Atto 40kg", "D09", "pcs", "4550", "0", "Opening", "8"],
                ["ITM_62", "Fish cartoon", "D01,D02", "pcs", "14700", "0", "Opening", "1"],
                ["ITM_63", "Fish Fry Masala 50g", "D01,D02", "pcs", "140", "0", "Opening", "7"],
                ["ITM_64", "Fish Masala", "D01,D02", "pcs", "150", "0", "Opening", "24"],
                ["ITM_65", "Ghee Dalda", "D01,D03,D09", "pcs", "5550", "0", "Opening", "1"],
                ["ITM_66", "Gidamri", "D01", "pcs", "325", "0", "Opening", "19"],
                ["ITM_67", "Glucose D 400g", "D03,D06", "pcs", "280", "0", "Opening", "1"],
                ["ITM_68", "Green Chilli 300ml", "D01,D02,D03,D04", "pcs", "400", "0", "Opening", "8"],
                ["ITM_69", "Green Tea (Sabit)", "D05", "pcs", "2500", "0", "Opening", "0.85"],
                ["ITM_70", "Gur", "D01,D02,D05", "pcs", "160", "0", "Opening", "1.5"],
                ["ITM_71", "Hiss Chocolate", "D06", "pcs", "1650", "0", "Opening", "2"],
                ["ITM_72", "Hot Sauce", "D03", "pcs", "650", "0", "Opening", "1"],
                ["ITM_73", "Hyde", "D01,D02,D03,D04,D09", "pcs", "600", "0", "Opening", "31"],
                ["ITM_74", "Icecream 10L", "D06", "pcs", "3800", "0", "Opening", "18"],
                ["ITM_75", "Icecream Cartoon", "D06", "pcs", "4500", "0", "Opening", "8"],
                ["ITM_76", "Iodine Salt 800g", "D01,D02,D03,D04,D06,D08,D09", "pcs", "60", "0", "Opening", "333"],
                ["ITM_77", "Jaan (ajmo)", "D01,D02,D03,D04", "pcs", "800", "0", "Opening", "1"],
                ["ITM_78", "Jalpeeno Slices Can", "D03", "pcs", "1250", "0", "Opening", "1"],
                ["ITM_79", "Jawantri", "D01,D02", "pcs", "5500", "0", "Opening", "0.3"],
                ["ITM_80", "Jeeli", "D01,D06", "pcs", "170", "0", "Opening", "13"],
                ["ITM_81", "Jeero", "D01,D02,D03,D04,D09", "pcs", "1210", "0", "Opening", "24.2"],
                ["ITM_82", "Kajhoor", "D06", "pcs", "100", "0", "Opening", "1"],
                ["ITM_83", "Kamal Pat", "D01,D02,D03,D04", "pcs", "400", "0", "Opening", "3.3"],
                ["ITM_84", "Kara Mirch", "D01,D02,D03,D04,D05", "pcs", "2330", "0", "Opening", "3.2"],
                ["ITM_85", "Karahi Masala 1kg Shaan", "D01,D02", "pcs", "1550", "0", "Opening", "11"],
                ["ITM_86", "Katar Mirch", "D01,D02,D03,D04", "pcs", "530", "0", "Opening", "14.5"],
                ["ITM_87", "Ketchup pouch 5L", "D01,D03,D04,D08", "pcs", "1200", "0", "Opening", "9"],
                ["ITM_88", "Kishmish", "D01,D06", "pcs", "800", "0", "Opening", "0.75"],
                ["ITM_89", "Kopro Powder", "D01,D02,D06", "pcs", "1000", "0", "Opening", "17"],
                ["ITM_90", "Kraft Cheese", "D03,D04,D06", "pcs", "1050", "0", "Opening", "33"],
                ["ITM_91", "Lasan Powder 50g", "D01,D03,D04,D09", "pcs", "145", "0", "Opening", "6"],
                ["ITM_92", "Lazania Pasta", "D03", "pcs", "330", "0", "Opening", "15"],
                ["ITM_93", "Leemon Juice", "D01,D02,D03,D04,D06", "pcs", "480", "0", "Opening", "8"],
                ["ITM_94", "Leemon Pani 375ml", "D06", "pcs", "330", "0", "Opening", "2"],
                ["ITM_95", "Leemon Syrup Voglya", "D06", "pcs", "2425", "0", "Opening", "1"],
                ["ITM_96", "Long", "D01,D02,D03,D04", "pcs", "1600", "0", "Opening", "1"],
                ["ITM_97", "Lotus Biscuit", "D06", "pcs", "980", "0", "Opening", "6"],
                ["ITM_98", "Lotus Jar", "D06", "pcs", "1650", "0", "Opening", "2"],
                ["ITM_99", "Macaroni 400g Bake Parlor", "D01,D03,D04", "pcs", "240", "0", "Opening", "28"],
                ["ITM_100", "Macaroni Elbo", "D03", "pcs", "210", "0", "Opening", "6"],
                ["ITM_101", "Mama seeta Siuce 350ml", "D01", "pcs", "1380", "0", "Opening", "11"],
                ["ITM_102", "Mashroom can", "D03", "pcs", "1940", "0", "Opening", "13"],
                ["ITM_103", "Mayonnaise", "D03,D04,D06", "pcs", "570", "0", "Opening", "17"],
                ["ITM_104", "Mayonnaise (Delish)", "D03,D04,D06", "pcs", "1920", "0", "Opening", "24"],
                ["ITM_105", "Medo 50kg", "D03,D09", "pcs", "5700", "0", "Opening", "1"],
                ["ITM_106", "Methi Masalo", "D01,D02,D03,D04", "pcs", "80", "0", "Opening", "60"],
                ["ITM_107", "Mint Syrup Voglya", "D06", "pcs", "2425", "0", "Opening", "1"],
                ["ITM_108", "Mithi Sodha", "D09", "pcs", "160", "0", "Opening", "1"],
                ["ITM_109", "Mix Fruit", "D06", "pcs", "2050", "0", "Opening", "11"],
                ["ITM_110", "Mix Garam Masalo", "D01,D02,D09", "pcs", "3000", "0", "Opening", "5"],
                ["ITM_111", "Mustard Pest", "D01,D03,D04", "pcs", "1550", "0", "Opening", "1"],
                ["ITM_112", "Mustard Powder 1kg", "D03,D09", "pcs", "1200", "0", "Opening", "1"],
                ["ITM_113", "Nar Jafar", "D01,D02", "pcs", "1400", "0", "Opening", "1.4"],
                ["ITM_114", "Nar Phota", "D01,D02", "pcs", "1800", "0", "Opening", "0.5"],
                ["ITM_115", "Nescafe Coffee", "D06", "pcs", "2100", "0", "Opening", "3"],
                ["ITM_116", "Nuterla Jar", "D06", "pcs", "1500", "0", "Opening", "1"],
                ["ITM_117", "Oil Talo", "D01,D02,D03,D04,D09", "pcs", "8800", "0", "Opening", "9"],
                ["ITM_118", "Olper cream", "D01,D02,D03,D04,D06", "pcs", "230", "0", "Opening", "25"],
                ["ITM_119", "Olper cream cartoon", "D01,D02,D03,D04,D06", "pcs", "5500", "0", "Opening", "7"],
                ["ITM_120", "Olper Milk 1.5 L", "D05,D06", "pcs", "545", "0", "Opening", "4"],
                ["ITM_121", "Oregeno Jar", "D03", "pcs", "260", "0", "Opening", "1"],
                ["ITM_122", "Oreo Biscuit", "D06", "pcs", "320", "0", "Opening", "1"],
                ["ITM_123", "Oreo Biscuit  40", "D06", "pcs", "300", "0", "Opening", "6"],
                ["ITM_124", "Paneer", "D01,D02,D03,D04", "pcs", "1600", "0", "Opening", "6.2"],
                ["ITM_125", "Paprika Powder", "D03", "pcs", "180", "0", "Opening", "7"],
                ["ITM_126", "Peach Syrup Voglya", "D06", "pcs", "2425", "0", "Opening", "3"],
                ["ITM_127", "Peethal Mirch", "D01,D02,D03,D04", "pcs", "530", "0", "Opening", "60"],
                ["ITM_128", "Pepsi Brand Can", "D07,D06", "pcs", "1056", "0", "Opening", "63.5"],
                ["ITM_129", "Peri Sauce", "D03", "pcs", "1030", "0", "Opening", "4"],
                ["ITM_130", "Pheni Pasta", "D03,D06", "pcs", "230", "0", "Opening", "3"],
                ["ITM_131", "Phool Badyan", "D01,D02", "pcs", "900", "0", "Opening", "7"],
                ["ITM_132", "Pilau Biryani 1kg Shaan", "D01,D02", "pcs", "1545", "0", "Opening", "10"],
                ["ITM_133", "Pineapple Juice", "D06", "pcs", "461", "0", "Opening", "22"],
                ["ITM_134", "Pineapple Sabit", "D06", "pcs", "2000", "0", "Opening", "4"],
                ["ITM_135", "Pineapple Slice", "D06", "pcs", "2000", "0", "Opening", "5"],
                ["ITM_136", "Pista", "D01,D02", "pcs", "5450", "0", "Opening", "4"],
                ["ITM_137", "Pizza Sauce (Salman)", "D03", "pcs", "2150", "0", "Opening", "4"],
                ["ITM_138", "Pizza Spice", "D03", "pcs", "180", "0", "Opening", "17"],
                ["ITM_139", "Popcorn Syrup Voglya", "D06", "pcs", "2425", "0", "Opening", "1"],
                ["ITM_140", "Pulajri Black", "D01,D02", "pcs", "1000", "0", "Opening", "2.7"],
                ["ITM_141", "Pulajri White", "D01,D02", "pcs", "1200", "0", "Opening", "2"],
                ["ITM_142", "Quorma Masala 100g", "D01,D02,D03,D04,D09", "pcs", "290", "0", "Opening", "2"],
                ["ITM_143", "Quorma Masala 1kg Shaan", "D01,D02,D03,D04", "pcs", "1545", "0", "Opening", "2"],
                ["ITM_144", "Quorma Masala 50g", "D01,D02,D03,D04,D09", "pcs", "150", "0", "Opening", "1"],
                ["ITM_145", "Rainbow Jar", "D06", "pcs", "600", "0", "Opening", "2"],
                ["ITM_146", "Rooh Afza", "D05,D06", "pcs", "480", "0", "Opening", "3"],
                ["ITM_147", "Sabit Dhana", "D01,D02,D03,D04,D09", "pcs", "400", "0", "Opening", "45"],
                ["ITM_148", "Sabit Gol Mirch", "D01,D02,D03,D04", "pcs", "800", "0", "Opening", "5.5"],
                ["ITM_149", "Sambal Obelack", "D03,D04", "pcs", "680", "0", "Opening", "10"],
                ["ITM_150", "Sandwich Bread", "D01,D02", "pcs", "340", "0", "Opening", "2"],
                ["ITM_151", "Saracha Sauce", "D01,D03", "pcs", "850", "0", "Opening", "8"],
                ["ITM_152", "Saracha Sauce N/R", "D01,D03", "pcs", "540", "0", "Opening", "25"],
                ["ITM_153", "Sewa Rangeen", "D01", "pcs", "110", "0", "Opening", "1"],
                ["ITM_154", "Soda 100g", "D01,D02,D03,D04,D09", "pcs", "160", "0", "Opening", "4"],
                ["ITM_155", "Soya Sauce 5kg", "D01,D03", "pcs", "1350", "0", "Opening", "2"],
                ["ITM_156", "Soya Sauce 800ml", "D01,D03", "pcs", "210", "0", "Opening", "36"],
                ["ITM_157", "Strawberry Syrup Voglya", "D06", "pcs", "2425", "0", "Opening", "2"],
                ["ITM_158", "Strawberry Topping", "D06", "pcs", "600", "0", "Opening", "7"],
                ["ITM_159", "Sugar n", "D01,D02,D04,D05,D06,D09", "pcs", "140", "0", "Opening", "12"],
                ["ITM_160", "Sugar Stick", "D05,D06,D08", "pcs", "200", "0", "Opening", "57"],
                ["ITM_161", "Surko 5L", "D01,D03,D04", "pcs", "840", "0", "Opening", "1"],
                ["ITM_162", "Surko 800ML", "D01,D03,D04", "pcs", "180", "0", "Opening", "7"],
                ["ITM_163", "Sweet corn", "D01,D03", "pcs", "1360", "0", "Opening", "11"],
                ["ITM_164", "Tabasco Sauce 60ml", "D01,D03", "pcs", "640", "0", "Opening", "4"],
                ["ITM_165", "Tandoori Masala", "D01,D03,D04,D09", "pcs", "150", "0", "Opening", "1"],
                ["ITM_166", "Tandoori Masala 1kg Shaan", "D01,D03,D04,D09", "pcs", "1545", "0", "Opening", "1"],
                ["ITM_167", "Tatri", "D01,D02", "pcs", "600", "0", "Opening", "2.4"],
                ["ITM_168", "Thoom", "D01,D03,D04,D09", "pcs", "400", "0", "Opening", "44.5"],
                ["ITM_169", "Tikka Masala 1kg Shaan", "D01,D03,D04,D09", "pcs", "1545", "0", "Opening", "0"],
                ["ITM_170", "Tomato Ketchup", "D01,D03,D04,D08", "pcs", "1100", "0", "Opening", "1"],
                ["ITM_171", "Tomato Ketchup (Chilli Garlic)", "D01,D03,D04,D08", "pcs", "1100", "0", "Opening", "1"],
                ["ITM_172", "Tomato Ketchup (Shashi)", "D03", "pcs", "220", "0", "Opening", "19"],
                ["ITM_173", "Tomato Ketchup 3L", "D01,D03,D04,D08", "pcs", "1100", "0", "Opening", "9"],
                ["ITM_174", "Tomato Pest 800g", "D03,D06", "pcs", "380", "0", "Opening", "3"],
                ["ITM_175", "Top Cow Cheese", "D03", "pcs", "3100", "0", "Opening", "3"],
                ["ITM_176", "Vanila Chip 1kg", "D06", "pcs", "850", "0", "Opening", "4"],
                ["ITM_177", "Vanilla Asens 500ml", "D06", "pcs", "980", "0", "Opening", "9"],
                ["ITM_178", "Vanilla Asens 50ml", "D06", "pcs", "100", "0", "Opening", "25"],
                ["ITM_179", "Vanilla beans", "D06", "pcs", "850", "0", "Opening", "4"],
                ["ITM_180", "Vanilla Frape Powder", "D06", "pcs", "3700", "0", "Opening", "0"],
                ["ITM_181", "Vanilla Syrup Voglya", "D06", "pcs", "2425", "0", "Opening", "3"],
                ["ITM_182", "Waffer Stick", "D06", "pcs", "750", "0", "Opening", "4"],
                ["ITM_183", "Wapping cream 1kg", "D06", "pcs", "700", "0", "Opening", "1"],
                ["ITM_184", "Wapping Cream 200g", "D06", "pcs", "230", "0", "Opening", "3"],
                ["ITM_185", "White Mint Syrup Voglya", "D06", "pcs", "2425", "0", "Opening", "0"],
                ["ITM_186", "White Mirch", "D01,D02,D03,D04", "pcs", "3000", "0", "Opening", "29"],
                ["ITM_187", "White Tir", "D01,D09", "pcs", "650", "0", "Opening", "19"],
                ["ITM_188", "Yogurt", "D01,D02,D04,D06", "pcs", "180", "0", "Opening", "55"],
                ["ITM_189", "Zafranai Masala 1kg Shaan", "D01,D02,D03,D04", "pcs", "1545", "0", "Opening", "2"],
                ["ITM_190", "Zardo kg", "D01,D02", "pcs", "450", "0", "Opening", "5"]
            ];

            await sheetsService.append('Masters_Items', rawData);

            // Seed Initial Batches for stock-carrying items
            const dateStr = openingStockDate;
            const demoBatches = rawData
                .filter(itm => Number(itm[7]) > 0)
                .map(itm => ([`B_OPEN_${itm[0]}_${Date.now()}`, itm[0], dateStr, itm[7], itm[7], itm[4] || '0', 'Opening']));
            
            if (demoBatches.length > 0) {
                await sheetsService.append('Batches', demoBatches);
            }

            await fetchData();
            await refreshStaticData();
            toast.success(`Demo data seeded successfully! Created ${rawData.length} items with section mappings and ${demoBatches.length} stock batches.`);
        } catch (e: any) {
            console.error(e);
            toast.error("Error seeding data: " + (e.message || "Unknown error."));
        } finally {
            setLoading(false);
        }
    };

    const handleAddEntity = async () => {
        setLoading(true);
        try {
            if (tab === 'items') {
                if (!newItem.name) return;
                const id = `ITM_${Date.now()}`;
                const values = [[id, newItem.name, newItem.deptIds, newItem.unit, newItem.buyPrice, newItem.sellPrice, newItem.category, newItem.openingStock, newItem.minParLevel, newItem.reorderQty, 'Yes']];
                await sheetsService.append('Masters_Items', values);
                
                const qty = parseFloat(newItem.openingStock);
                if (qty > 0) {
                    const dateStr = openingStockDate;
                    await sheetsService.append('Batches', [[`B_OPEN_${Date.now()}`, id, dateStr, qty, qty, newItem.buyPrice, 'Opening']]);
                }
                
                setNewItem({ name: '', deptIds: '', unit: 'kg', buyPrice: '0', sellPrice: '0', category: 'Raw', openingStock: '0', minParLevel: '0', reorderQty: '0' });
            } else if (tab === 'depts') {
                if (!newDept.name) return;
                const id = `DPT_${Date.now()}`;
                const values = [[id, newDept.name, 'Yes']];
                await sheetsService.append('Masters_Depts', values);
                setNewDept({ name: '' });
            } else if (tab === 'suppliers') {
                if (!newSupplier.name) return;
                const id = `SUP_${Date.now()}`;
                const values = [[id, newSupplier.name, newSupplier.contact, 'Yes']];
                await sheetsService.append('Masters_Suppliers', values);
                setNewSupplier({ name: '', contact: '' });
            }

            setIsAdding(false);
            await fetchData();
            await refreshStaticData();
        } catch (e: any) {
            console.error(e);
            toast.error("Failed to add entity: " + e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveSettings = async () => {
        setLoading(true);
        try {
            try {
                await sheetsService.update('AppSettings!A2:B3', [
                    ['RestaurantName', restaurantName],
                    ['LogoUrl', logoUrl]
                ]);
            } catch (innerE: any) {
                if (innerE.message.includes('Unable to parse range') || innerE.message.includes('not found')) {
                    // Try to initialize sheet structure and retry
                    await sheetsService.initializeSheetStructure();
                    await sheetsService.update('AppSettings!A2:B3', [
                        ['RestaurantName', restaurantName],
                        ['LogoUrl', logoUrl]
                    ]);
                } else {
                    throw innerE;
                }
            }
            
            const spreadsheetId = localStorage.getItem('resto_manage_data') ? JSON.parse(localStorage.getItem('resto_manage_data')!).spreadsheetId : null;
            if (spreadsheetId) {
                localStorage.setItem(`resto_branding_${spreadsheetId}`, JSON.stringify({
                  restaurantName,
                  logoUrl
                }));
            }
            window.dispatchEvent(new Event('branding-changed'));
            toast.success('App Settings updated.');
        } catch(e: any) {
            toast.error('Failed to update app settings: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    const executeFactoryReset = async () => {
        if (resetConfirmText !== 'RESET') {
            toast.error("You must type exactly 'RESET' to confirm.");
            return;
        }

        setLoading(true);
        setShowResetModal(false);
        try {
            await sheetsService.performFactoryReset();
            // Refetch App Settings just to re-apply any state
            await fetchData();
            toast.success("System has been factory reset successfully.");
            
            // Re-initialize sheet structure to ensure headers are correctly placed on the now-empty sheets
            await sheetsService.initializeSheetStructure();
            
        } catch(e: any) {
            toast.error("Failed to reset: " + e.message);
        } finally {
            setLoading(false);
            setResetConfirmText('');
        }
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            // Check file size first (bonus)
            if (file.size > 2 * 1024 * 1024) {
                toast.error("File is too large. Please pick an image under 2MB.");
                return;
            }

            const reader = new FileReader();
            reader.onloadend = () => {
                const img = new Image();
                img.onload = () => {
                    // Create a canvas to resize the image
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    // Aim for small dimensions for the logo to keep Base64 string < 50k chars
                    const MAX_SIZE = 200; 
                    if (width > height) {
                        if (width > MAX_SIZE) {
                            height *= MAX_SIZE / width;
                            width = MAX_SIZE;
                        }
                    } else {
                        if (height > MAX_SIZE) {
                            width *= MAX_SIZE / height;
                            height = MAX_SIZE;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        ctx.drawImage(img, 0, 0, width, height);
                        // Using quality 0.7 to further reduce size
                        const compressedBase64 = canvas.toDataURL('image/png');
                        
                        if (compressedBase64.length > 48000) {
                            // If still too large, try jpeg with lower quality
                            const fallbackBase64 = canvas.toDataURL('image/jpeg', 0.6);
                            setLogoUrl(fallbackBase64);
                        } else {
                            setLogoUrl(compressedBase64);
                        }
                    }
                };
                img.src = reader.result as string;
            };
            reader.readAsDataURL(file);
        }
    };
    
    const handleUpdateEntity = async () => {
        setLoading(true);
        try {
            if (tab === 'items' && editingItem) {
                if (!editingItem.name) return;
                const cellRange = `Masters_Items!A${editingItem.rowIndex}:K${editingItem.rowIndex}`;
                await sheetsService.update(cellRange, [mapItemToRow({ ...editingItem, isActive: editingItem.isActive ?? true })]);
                setEditingItem(null);
            } else if (tab === 'depts' && editingDept) {
                if (!editingDept.name) return;
                const cellRange = `Masters_Depts!A${editingDept.rowIndex}:C${editingDept.rowIndex}`;
                await sheetsService.update(cellRange, [[editingDept.id, editingDept.name, (editingDept.isActive ?? true) ? 'Yes' : 'No']]);
                setEditingDept(null);
            } else if (tab === 'suppliers' && editingSupplier) {
                if (!editingSupplier.name) return;
                const cellRange = `Masters_Suppliers!A${editingSupplier.rowIndex}:D${editingSupplier.rowIndex}`;
                await sheetsService.update(cellRange, [[editingSupplier.id, editingSupplier.name, editingSupplier.contact || '', (editingSupplier.isActive ?? true) ? 'Yes' : 'No']]);
                setEditingSupplier(null);
            }
            await fetchData();
            await refreshStaticData();
            toast.success('Successfully updated.');
        } catch (e: any) {
             console.error(e);
             toast.error("Failed to update: " + e.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6 text-slate-900 dark:text-slate-100">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight dark:text-white">Master Foundation</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Configure core entities for your restaurant operations.</p>
                </div>
                <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-sm dark:bg-slate-800 dark:border-slate-700">
                    {[
                        { id: 'items', label: 'Items' },
                        { id: 'depts', label: 'Sections' },
                        { id: 'suppliers', label: 'Suppliers' },
                        { id: 'settings', label: 'App Settings' }
                    ].map((t) => (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id as any)}
                            className={cn(
                                "px-4 py-1.5 text-xs font-bold rounded-lg transition-all",
                                tab === t.id ? "bg-white text-emerald-600 shadow-sm dark:bg-slate-900 dark:text-emerald-400" : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                            )}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
            </div>
            
            {tab === 'settings' && (
                <div className="p-6 md:p-8 space-y-8 bg-white border border-slate-200 shadow-sm rounded-xl dark:bg-slate-900 dark:border-slate-800">
                  <div className="space-y-5">
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 dark:text-white">
                      <Store size={20} className="text-emerald-500" />
                      Restaurant Branding
                    </h3>
                    
                    <div className="flex flex-col md:flex-row gap-8 items-start">
                      {/* Logo Upload */}
                      <div className="flex flex-col gap-3">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-widest dark:text-slate-400">Restaurant Logo</label>
                        <div className="relative group w-32 h-32 rounded-2xl border-2 border-dashed border-slate-300 flex items-center justify-center bg-slate-50 overflow-hidden hover:border-emerald-500 transition-colors cursor-pointer dark:bg-slate-800/50 dark:border-slate-700 dark:hover:border-emerald-500">
                          {logoUrl ? (
                            <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" />
                          ) : (
                            <div className="flex flex-col items-center text-slate-400 dark:text-slate-500">
                              <ImageIcon size={32} className="mb-2 opacity-50" />
                              <span className="text-[10px] font-bold uppercase">Upload Logo</span>
                            </div>
                          )
}
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
                            className="text-[10px] font-bold text-rose-500 hover:text-rose-600 uppercase tracking-wider text-center dark:text-rose-400 dark:hover:text-rose-300"
                          >
                            Remove Logo
                          </button>
                        )}
                      </div>

                      {/* General Settings */}
                      <div className="flex-1 w-full space-y-4">
                        <div className="flex flex-col gap-2">
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-widest dark:text-slate-400">Restaurant Name</label>
                          <input 
                            type="text" 
                            value={restaurantName}
                            onChange={(e) => setRestaurantName(e.target.value)}
                            placeholder="E.g., The Grand Palace"
                            className="w-full p-4 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent font-medium dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:placeholder:text-slate-600"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-slate-100 flex justify-end dark:border-slate-800">
                    <button 
                      onClick={handleSaveSettings}
                      disabled={loading}
                      className="px-8 py-4 bg-emerald-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-500/20 active:scale-[0.98]"
                    >
                      {loading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                      {loading ? 'Saving...' : 'Save Settings'}
                    </button>
                  </div>

                  {/* Danger Zone */}
                  <div className="pt-8 mt-8 border-t border-slate-100 dark:border-slate-800">
                    <h3 className="text-lg font-bold text-rose-600 flex items-center gap-2 mb-4">
                      <AlertTriangle size={20} />
                      Danger Zone
                    </h3>
                    <div className="p-5 border border-rose-100 bg-rose-50 rounded-xl flex items-center justify-between dark:border-rose-900/50 dark:bg-rose-950/20">
                        <div>
                          <h4 className="font-bold text-rose-900 dark:text-rose-400">Factory Reset</h4>
                          <p className="text-sm text-rose-700 mt-1 dark:text-rose-500">Permanently delete all inventory data, items, suppliers, issues, and ledgers in the selected Google Sheet. This keeps your logo and restaurant name intact. Cannot be undone.</p>
                        </div>
                        <button 
                          disabled={loading}
                          onClick={() => setShowResetModal(true)}
                          className="shrink-0 px-6 py-3 bg-white text-rose-600 rounded-lg font-bold text-sm shadow-sm border border-rose-200 hover:bg-rose-50 transition-all dark:bg-slate-900 dark:border-rose-900 dark:text-rose-500 dark:hover:bg-rose-950"
                        >
                          Reset System Data
                        </button>
                    </div>
                  </div>
                </div>
            )}

            {tab !== 'settings' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col dark:bg-slate-900 dark:border-slate-800">
                <div className="p-4 border-b border-slate-100 flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4 bg-slate-50/50 dark:bg-slate-950/20 dark:border-slate-800">
                    <div className="relative w-full xl:max-w-sm flex-shrink-0">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input 
                            type="text" 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={`Search ${tab}...`} 
                            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:placeholder:text-slate-600" 
                        />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto overflow-x-auto pb-1 xl:pb-0 hide-scrollbar">
                        <button 
                            onClick={() => setShowInactive(!showInactive)}
                            className={cn("whitespace-nowrap px-4 py-2 border rounded-lg text-sm font-medium transition-all flex items-center gap-2", 
                                showInactive ? "bg-slate-800 text-white border-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-100" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-700 dark:hover:bg-slate-800")}
                        >
                            {showInactive ? "Hide Inactive" : "Show Inactive"}
                        </button>
                        {tab === 'items' && (
                            <>
                                <button 
                                    onClick={handleRepairSheets}
                                    title="If seed data or inventory fails, use this to create missing sheets/columns"
                                    className="whitespace-nowrap px-4 py-2 border border-slate-200 bg-white text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 transition-all flex items-center gap-2 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                                >
                                    <ShieldCheck size={14} className="text-blue-500" />
                                    Repair Structure
                                </button>
                                <button 
                                    onClick={() => setShowSeedModal(true)}
                                    className="whitespace-nowrap px-4 py-2 border border-slate-200 bg-white text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 transition-all dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                                >
                                    Seed Demo Data
                                </button>
                                <button 
                                    onClick={() => setIsBulkImport(true)}
                                    className="whitespace-nowrap px-4 py-2 border border-slate-200 bg-white text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 transition-all dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                                >
                                    Bulk Import
                                </button>
                            </>
                        )}
                        <button 
                            onClick={() => setIsAdding(true)}
                            className="whitespace-nowrap flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium shadow-md hover:bg-emerald-700 transition-all font-bold"
                        >
                            <Plus size={16} /> Add New {tab === 'items' ? 'Item' : tab === 'depts' ? 'Section' : 'Supplier'}
                        </button>
                    </div>
                </div>

                <div className="overflow-x-auto min-h-[400px]">
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="animate-spin text-emerald-500" size={32} />
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-200 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400">
                                <tr>
                                    {tab === 'items' && <>
                                        <th className="px-6 py-3">Item Detail</th>
                                        <th className="px-6 py-3">Unit</th>
                                        <th className="px-6 py-3">Category</th>
                                        <th className="px-6 py-3">Section(s)</th>
                                        <th className="px-6 py-3 text-right">Default Rate</th>
                                        <th className="px-6 py-3 text-right">Stock</th>
                                    </>}
                                    {tab === 'depts' && <>
                                        <th className="px-6 py-3">System ID</th>
                                        <th className="px-6 py-3">Section Name</th>
                                    </>}
                                    {tab === 'suppliers' && <>
                                        <th className="px-6 py-3">Supplier Name</th>
                                        <th className="px-6 py-3">Contact info</th>
                                    </>}
                                    <th className="px-6 py-3 text-right text-slate-400">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="text-xs divide-y divide-slate-100 dark:divide-slate-800">
                                {tab === 'items' && items.filter(r => (showInactive || r.isActive !== false) && (!searchQuery || r.name.toLowerCase().includes(searchQuery.toLowerCase()) || r.id.toLowerCase().includes(searchQuery.toLowerCase()))).map((row) => (
                                    <tr key={row.id} className={cn("hover:bg-slate-50/50 transition-colors group dark:hover:bg-slate-800/40", row.isActive === false && "opacity-60 grayscale-[0.5]")}>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <p className="font-bold text-slate-900 leading-tight dark:text-white">{row.name}</p>
                                                {row.isActive === false && <span className="bg-slate-200 text-slate-500 text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter dark:bg-slate-800 dark:text-slate-400">Inactive</span>}
                                            </div>
                                            <p className="text-[10px] text-slate-400 font-mono tracking-tighter uppercase dark:text-slate-500">{row.id}</p>
                                        </td>
                                        <td className="px-6 py-4 text-slate-500 font-medium dark:text-slate-400">{row.unit}</td>
                                        <td className="px-6 py-4">
                                            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-bold uppercase tracking-tight dark:bg-slate-800 dark:text-slate-300">{row.category}</span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-wrap gap-1">
                                                {row.deptIds ? row.deptIds.split(',').map(dId => {
                                                    const d = allDepts.find(ad => ad.id === dId.trim());
                                                    return d ? (
                                                        <span key={dId} className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded-[4px] text-[10px] font-bold border border-blue-100 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-900/50">
                                                            {d.name}
                                                        </span>
                                                    ) : null;
                                                }) : <span className="text-[10px] text-slate-300 italic dark:text-slate-600">None</span>}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right font-mono font-bold text-slate-600 dark:text-slate-400">Rs. {row.buyPrice}</td>
                                        <td className="px-6 py-4 text-right font-mono font-bold text-slate-900 dark:text-white">{row.openingStock}</td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => setEditingItem(row)} className="p-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-emerald-600 transition-colors dark:hover:bg-slate-800 dark:hover:text-emerald-400"><Edit2 size={14} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {tab === 'depts' && departments.filter(r => (showInactive || r.isActive !== false) && (!searchQuery || r.name.toLowerCase().includes(searchQuery.toLowerCase()) || r.id.toLowerCase().includes(searchQuery.toLowerCase()))).map((row) => (
                                    <tr key={row.id} className={cn("hover:bg-slate-50/50 transition-colors group dark:hover:bg-slate-800/40", row.isActive === false && "opacity-60 grayscale-[0.5]")}>
                                        <td className="px-6 py-4 text-[10px] font-mono text-slate-400 uppercase tracking-wider dark:text-slate-500">{row.id}</td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <p className="font-bold text-slate-900 dark:text-white uppercase tracking-tight">{row.name}</p>
                                                {row.isActive === false && <span className="bg-slate-200 text-slate-500 text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter dark:bg-slate-800 dark:text-slate-400">Inactive</span>}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => setEditingDept(row)} className="p-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-emerald-600 transition-colors dark:hover:bg-slate-800 dark:hover:text-emerald-400"><Edit2 size={14} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {tab === 'suppliers' && suppliers.filter(r => (showInactive || r.isActive !== false) && (!searchQuery || r.name.toLowerCase().includes(searchQuery.toLowerCase()) || r.id.toLowerCase().includes(searchQuery.toLowerCase()))).map((row) => (
                                    <tr key={row.id} className={cn("hover:bg-slate-50/50 transition-colors group dark:hover:bg-slate-800/40", row.isActive === false && "opacity-60 grayscale-[0.5]")}>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <p className="font-bold text-slate-900 dark:text-white">{row.name}</p>
                                                {row.isActive === false && <span className="bg-slate-200 text-slate-500 text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter dark:bg-slate-800 dark:text-slate-400">Inactive</span>}
                                            </div>
                                            <p className="text-[10px] text-slate-400 font-mono tracking-tighter uppercase dark:text-slate-500">{row.id}</p>
                                        </td>
                                        <td className="px-6 py-4 text-slate-500 dark:text-slate-400">{row.contact}</td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => setEditingSupplier(row)} className="p-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-emerald-600 transition-colors dark:hover:bg-slate-800 dark:hover:text-emerald-400"><Edit2 size={14} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {((tab === 'items' && items.length === 0) || (tab === 'depts' && departments.length === 0) || (tab === 'suppliers' && suppliers.length === 0)) && !loading && (
                                    <tr>
                                        <td colSpan={10} className="px-6 py-12 text-center text-slate-400 italic dark:text-slate-600">
                                            No {tab} found. Connect your Google Sheet or add entries.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
            )}

            <AnimatePresence>
                {isBulkImport && (
                    <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-6">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl border border-slate-200 dark:bg-slate-900 dark:border-slate-800"
                        >
                            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 dark:bg-slate-950/20 dark:border-slate-800">
                                <div>
                                    <h3 className="font-bold text-slate-900 dark:text-white">Bulk Import Items</h3>
                                    <div className="flex items-center gap-2 mt-1">
                                        <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider dark:text-slate-400">Opening Stock Date:</label>
                                        <input type="date" className="px-2 py-1 border border-slate-200 rounded text-[10px] bg-white font-mono dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 text-slate-900" value={openingStockDate} onChange={(e) => setOpeningStockDate(e.target.value)} />
                                    </div>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1 dark:text-slate-500">Paste from Excel or Sheets (Tab Separated)</p>
                                </div>
                                <button onClick={() => setIsBulkImport(false)} className="text-slate-400 hover:text-slate-600 p-1 dark:hover:text-slate-300"><X size={20} /></button>
                            </div>
                            <div className="p-6 space-y-4">
                                <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-[10px] text-blue-700 font-medium whitespace-pre-wrap dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-900/50">
                                    Expected format (Tab Separated):<br />
                                    Item Name [TAB] Sections (IDs comma separated) [TAB] Unit [TAB] Category [TAB] Buy Price [TAB] Sell Price [TAB] Opening Stock [TAB] Min Par Level [TAB] Reorder Qty<br />
                                    <span className="text-blue-500 font-normal dark:text-blue-500">Example: Tomato [TAB] D01,D02 [TAB] kg [TAB] Raw [TAB] 50 [TAB] 0 [TAB] 10 [TAB] 5 [TAB] 20</span>
                                </div>
                                <textarea 
                                    className="w-full h-80 p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all resize-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
                                    placeholder="Paste your list here..."
                                    value={bulkText}
                                    onChange={(e) => setBulkText(e.target.value)}
                                />
                            </div>
                            <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-4 dark:bg-slate-950/20 dark:border-slate-800">
                                <button onClick={() => setIsBulkImport(false)} className="flex-1 py-2.5 text-sm font-bold text-slate-500 dark:text-slate-400 dark:hover:text-slate-300 transition-colors">Cancel</button>
                                <button 
                                    onClick={handleBulkImport}
                                    disabled={loading || !bulkText}
                                    className="flex-[2] py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-bold shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 dark:disabled:text-slate-500 flex items-center justify-center gap-2"
                                >
                                    {loading ? <Loader2 size={16} className="animate-spin" /> : "Process & Import"}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {isAdding && (
                    <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-6">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-200 dark:bg-slate-900 dark:border-slate-800"
                        >
                            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 dark:bg-slate-950/20 dark:border-slate-800">
                                <h3 className="font-bold text-slate-900 tracking-tight dark:text-white">Configure {tab === 'items' ? 'Item' : tab === 'depts' ? 'Section' : 'Supplier'}</h3>
                                <button onClick={() => setIsAdding(false)} className="text-slate-400 hover:text-slate-600 p-1 dark:hover:text-slate-300"><X size={20} /></button>
                            </div>
                            <div className="p-6 space-y-4">
                                {tab === 'items' && (
                                    <>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Identification</label>
                                            <div className="relative">
                                              <Package size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                              <input 
                                                  type="text" 
                                                  placeholder="e.g. Basmati Rice (Premium)" 
                                                  className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 dark:placeholder:text-slate-600"
                                                  value={newItem.name}
                                                  onChange={(e) => setNewItem({...newItem, name: e.target.value})}
                                              />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Unit of measure</label>
                                                <select className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all appearance-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
                                                    value={newItem.unit}
                                                    onChange={(e) => setNewItem({...newItem, unit: e.target.value})}
                                                >
                                                    <option>kg</option><option>Gram</option><option>Liter</option><option>Pieces</option><option>Bundle</option>
                                                </select>
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Cost Center</label>
                                                <select className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all appearance-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
                                                  value={newItem.category}
                                                  onChange={(e) => setNewItem({...newItem, category: e.target.value})}
                                                >
                                                    <option>Raw</option><option>Kitchen</option><option>Bar</option><option>Non-Issue</option>
                                                </select>
                                            </div>
                                        </div>

                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Applicable Sections (Departments)</label>
                                            <div className="flex flex-wrap gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg min-h-[42px] dark:bg-slate-800 dark:border-slate-700">
                                                {allDepts.length === 0 ? (
                                                    <p className="text-[10px] text-slate-400 italic dark:text-slate-600">No sections defined. Go to "Sections" tab first.</p>
                                                ) : (
                                                    allDepts.map(dept => {
                                                        const isSelected = newItem.deptIds.split(',').includes(dept.id);
                                                        return (
                                                            <button
                                                                key={dept.id}
                                                                type="button"
                                                                onClick={() => {
                                                                    const current = newItem.deptIds.split(',').filter(x => x.trim());
                                                                    const next = isSelected 
                                                                        ? current.filter(x => x !== dept.id)
                                                                        : [...current, dept.id];
                                                                    setNewItem({...newItem, deptIds: next.join(',')});
                                                                }}
                                                                className={cn(
                                                                    "px-3 py-1 rounded-full text-[10px] font-bold transition-all flex items-center gap-1",
                                                                    isSelected 
                                                                        ? "bg-emerald-600 text-white shadow-sm" 
                                                                        : "bg-white text-slate-500 border border-slate-200 hover:border-emerald-300 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-700 dark:hover:border-emerald-500"
                                                                )}
                                                            >
                                                                {isSelected && <Check size={10} />}
                                                                {dept.name}
                                                            </button>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Base Unit Rate</label>
                                                <div className="relative">
                                                  <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                                  <input type="number" className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200" placeholder="Rs. 0" 
                                                    value={newItem.buyPrice} onChange={(e) => setNewItem({...newItem, buyPrice: e.target.value})}
                                                  />
                                                </div>
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Initial Stock</label>
                                                <input type="number" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200" placeholder="0.00" 
                                                   value={newItem.openingStock} onChange={(e) => setNewItem({...newItem, openingStock: e.target.value})}
                                                />
                                            </div>
                                        </div>
                                        {Number(newItem.openingStock) > 0 && (
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-1.5 col-span-2">
                                                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Opening Stock Date</label>
                                                    <input type="date" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 text-slate-900" 
                                                       value={openingStockDate} onChange={(e) => setOpeningStockDate(e.target.value)}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Min Par Level</label>
                                                <input type="number" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200" placeholder="0.00" 
                                                   value={newItem.minParLevel} onChange={(e) => setNewItem({...newItem, minParLevel: e.target.value})}
                                                />
                                                <p className="text-[9px] text-slate-400 leading-none mt-1 dark:text-slate-500">Alert when stock falls below this</p>
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Reorder Qty</label>
                                                <input type="number" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200" placeholder="0.00" 
                                                   value={newItem.reorderQty} onChange={(e) => setNewItem({...newItem, reorderQty: e.target.value})}
                                                />
                                                <p className="text-[9px] text-slate-400 leading-none mt-1 dark:text-slate-500">Default quantity to purchase</p>
                                            </div>
                                        </div>
                                    </>
                                )}
                                {tab === 'depts' && (
                                    <div className="space-y-4">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Section Name</label>
                                            <input type="text" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all placeholder:font-normal placeholder:text-slate-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:placeholder:text-slate-600" placeholder="e.g. Kitchen, Bar..." 
                                              value={newDept.name} onChange={(e) => setNewDept({...newDept, name: e.target.value})}
                                              autoFocus
                                            />
                                        </div>
                                    </div>
                                )}
                                {tab === 'suppliers' && (
                                    <div className="space-y-4">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Supplier Name</label>
                                            <input type="text" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all placeholder:font-normal placeholder:text-slate-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:placeholder:text-slate-600" placeholder="Alpha Distributors" 
                                              value={newSupplier.name} onChange={(e) => setNewSupplier({...newSupplier, name: e.target.value})}
                                              autoFocus
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Contact Info</label>
                                            <input type="text" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 dark:placeholder:text-slate-600" placeholder="Phone, Email, or Address" 
                                              value={newSupplier.contact} onChange={(e) => setNewSupplier({...newSupplier, contact: e.target.value})}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-4 dark:bg-slate-950/20 dark:border-slate-800">
                                <button
                                    onClick={() => setIsAdding(false)}
                                    className="flex-1 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-900 transition-colors dark:text-slate-400 dark:hover:text-slate-200"
                                >
                                    Discard
                                </button>
                                <button
                                    onClick={handleAddEntity}
                                    disabled={loading}
                                    className="flex-1 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-bold shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
                                >
                                    {loading ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16}/>}
                                    Save Entity
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {(editingItem || editingDept || editingSupplier) && (
                    <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-6">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-200 dark:bg-slate-900 dark:border-slate-800"
                        >
                            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 dark:bg-slate-950/20 dark:border-slate-800">
                                <h3 className="font-bold text-slate-900 tracking-tight dark:text-white">Edit {tab === 'items' ? 'Item' : tab === 'depts' ? 'Section' : 'Supplier'}</h3>
                                <button onClick={() => { setEditingItem(null); setEditingDept(null); setEditingSupplier(null); }} className="text-slate-400 hover:text-slate-600 p-1 dark:hover:text-slate-300"><X size={20} /></button>
                            </div>
                            <div className="p-6 space-y-4">
                                {tab === 'items' && editingItem && (
                                    <>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Identification</label>
                                            <div className="relative">
                                              <Package size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                              <input 
                                                  type="text" 
                                                  placeholder="e.g. Basmati Rice (Premium)" 
                                                  className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 dark:placeholder:text-slate-600"
                                                  value={editingItem.name}
                                                  onChange={(e) => setEditingItem({...editingItem, name: e.target.value})}
                                              />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Unit of measure</label>
                                                <select className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all appearance-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
                                                    value={editingItem.unit}
                                                    onChange={(e) => setEditingItem({...editingItem, unit: e.target.value})}
                                                >
                                                    <option>kg</option><option>Gram</option><option>Liter</option><option>Pieces</option><option>Bundle</option>
                                                </select>
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Cost Center</label>
                                                <select className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all appearance-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
                                                  value={editingItem.category}
                                                  onChange={(e) => setEditingItem({...editingItem, category: e.target.value})}
                                                >
                                                    <option>Raw</option><option>Kitchen</option><option>Bar</option><option>Non-Issue</option>
                                                </select>
                                            </div>
                                        </div>

                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Applicable Sections (Departments)</label>
                                            <div className="flex flex-wrap gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg min-h-[42px] dark:bg-slate-800 dark:border-slate-700">
                                                {allDepts.length === 0 ? (
                                                    <p className="text-[10px] text-slate-400 italic dark:text-slate-600">No sections defined. Go to "Sections" tab first.</p>
                                                ) : (
                                                    allDepts.map(dept => {
                                                        const isSelected = editingItem.deptIds?.split(',').includes(dept.id);
                                                        return (
                                                            <button
                                                                key={dept.id}
                                                                type="button"
                                                                onClick={() => {
                                                                    const current = editingItem.deptIds?.split(',').filter(x => x.trim()) || [];
                                                                    const next = isSelected 
                                                                        ? current.filter(x => x !== dept.id)
                                                                        : [...current, dept.id];
                                                                    setEditingItem({...editingItem, deptIds: next.join(',')});
                                                                }}
                                                                className={cn(
                                                                    "px-3 py-1 rounded-full text-[10px] font-bold transition-all flex items-center gap-1",
                                                                    isSelected 
                                                                        ? "bg-emerald-600 text-white shadow-sm" 
                                                                        : "bg-white text-slate-500 border border-slate-200 hover:border-emerald-300 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-700 dark:hover:border-emerald-500"
                                                                )}
                                                            >
                                                                {isSelected && <Check size={10} />}
                                                                {dept.name}
                                                            </button>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Base Unit Rate</label>
                                                <div className="relative">
                                                  <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                                  <input type="number" className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200" placeholder="Rs. 0" 
                                                    value={editingItem.buyPrice} onChange={(e) => setEditingItem({...editingItem, buyPrice: Number(e.target.value)})}
                                                  />
                                                </div>
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Initial Stock</label>
                                                <input type="number" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200" placeholder="0.00" 
                                                   value={editingItem.openingStock} onChange={(e) => setEditingItem({...editingItem, openingStock: Number(e.target.value)})}
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Min Par Level</label>
                                                <input type="number" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200" placeholder="0.00" 
                                                   value={editingItem.minParLevel} onChange={(e) => setEditingItem({...editingItem, minParLevel: Number(e.target.value)})}
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Reorder Qty</label>
                                                <input type="number" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200" placeholder="0.00" 
                                                   value={editingItem.reorderQty} onChange={(e) => setEditingItem({...editingItem, reorderQty: Number(e.target.value)})}
                                                />
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg dark:bg-slate-800 dark:border-slate-700">
                                            <input 
                                                type="checkbox" 
                                                id="edit-item-active"
                                                checked={editingItem.isActive !== false}
                                                onChange={(e) => setEditingItem({...editingItem, isActive: e.target.checked})}
                                                className="w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500 dark:bg-slate-900 dark:border-slate-700"
                                            />
                                            <label htmlFor="edit-item-active" className="text-xs font-bold text-slate-700 dark:text-slate-300">Item is Active</label>
                                        </div>
                                    </>
                                )}
                                {tab === 'depts' && editingDept && (
                                    <div className="space-y-4">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Section Name</label>
                                            <input type="text" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all dark:bg-slate-800 dark:border-slate-700 dark:text-white" 
                                              value={editingDept.name} onChange={(e) => setEditingDept({...editingDept, name: e.target.value})}
                                            />
                                        </div>
                                        <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg dark:bg-slate-800 dark:border-slate-700">
                                            <input 
                                                type="checkbox" 
                                                id="edit-dept-active"
                                                checked={editingDept.isActive !== false}
                                                onChange={(e) => setEditingDept({...editingDept, isActive: e.target.checked})}
                                                className="w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500 dark:bg-slate-900 dark:border-slate-700"
                                            />
                                            <label htmlFor="edit-dept-active" className="text-xs font-bold text-slate-700 dark:text-slate-300">Section is Active</label>
                                        </div>
                                    </div>
                                )}
                                {tab === 'suppliers' && editingSupplier && (
                                    <div className="space-y-4">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Supplier Name</label>
                                            <input type="text" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all dark:bg-slate-800 dark:border-slate-700 dark:text-white" 
                                              value={editingSupplier.name} onChange={(e) => setEditingSupplier({...editingSupplier, name: e.target.value})}
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Contact Info</label>
                                            <input type="text" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200" 
                                              value={editingSupplier.contact} onChange={(e) => setEditingSupplier({...editingSupplier, contact: e.target.value})}
                                            />
                                        </div>
                                        <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg dark:bg-slate-800 dark:border-slate-700">
                                            <input 
                                                type="checkbox" 
                                                id="edit-sup-active"
                                                checked={editingSupplier.isActive !== false}
                                                onChange={(e) => setEditingSupplier({...editingSupplier, isActive: e.target.checked})}
                                                className="w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500 dark:bg-slate-900 dark:border-slate-700"
                                            />
                                            <label htmlFor="edit-sup-active" className="text-xs font-bold text-slate-700 dark:text-slate-300">Supplier is Active</label>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-4 dark:bg-slate-950/20 dark:border-slate-800">
                                <button
                                    onClick={() => { setEditingItem(null); setEditingDept(null); setEditingSupplier(null); }}
                                    className="flex-1 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-900 transition-colors dark:text-slate-400 dark:hover:text-slate-200"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleUpdateEntity}
                                    disabled={loading}
                                    className="flex-1 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-bold shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
                                >
                                    {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16}/>}
                                    Update Entity
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
                {showSeedModal && (
                    <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-6">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-200 dark:bg-slate-900 dark:border-slate-800"
                        >
                            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-emerald-50 dark:bg-emerald-950/20 dark:border-slate-800">
                                <h3 className="font-bold text-emerald-900 tracking-tight dark:text-emerald-400">
                                    Confirm Demo Data Seeding
                                </h3>
                                <button onClick={() => setShowSeedModal(false)} className="text-emerald-400 hover:text-emerald-600 p-1 dark:hover:text-emerald-300"><X size={20} /></button>
                            </div>
                            <div className="p-6 space-y-4">
                                <p className="text-sm text-slate-700 dark:text-slate-300">
                                    {items.length > 0 
                                      ? "Your database already has items! Seeding will duplicate them. Are you REALLY sure you want to run this?" 
                                      : "This will seed all 190 items with their department mappings and initial stock. Continue?"}
                                </p>
                            </div>
                            <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-4 dark:bg-slate-950/20 dark:border-slate-800">
                                <button
                                    onClick={() => setShowSeedModal(false)}
                                    className="flex-1 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-900 transition-colors dark:text-slate-400 dark:hover:text-slate-200"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSeedDemo}
                                    disabled={loading}
                                    className="flex-1 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-bold shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
                                >
                                    {loading ? <Loader2 size={16} className="animate-spin" /> : <Check size={16}/>}
                                    Yes, Seed Data
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
                {showResetModal && (
                    <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-6">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-rose-200 dark:bg-slate-900 dark:border-rose-900/50"
                        >
                            <div className="px-6 py-4 border-b border-rose-100 flex items-center justify-between bg-rose-50 dark:bg-rose-950/20 dark:border-rose-900/30">
                                <h3 className="font-bold text-rose-900 tracking-tight dark:text-rose-400 flex items-center gap-2">
                                    <AlertTriangle size={18} />
                                    Confirm Factory Reset
                                </h3>
                                <button onClick={() => setShowResetModal(false)} className="text-rose-400 hover:text-rose-600 p-1 dark:hover:text-rose-300"><X size={20} /></button>
                            </div>
                            <div className="p-6 space-y-4">
                                <p className="text-sm text-slate-700 dark:text-slate-300">
                                    This action will <strong>permanently wipe</strong> all items, suppliers, ledgers, and inventory data from your Google Sheet. It reconstructs the base headers on empty sheets. Your logo and restaurant name will not be deleted.
                                </p>
                                <div className="p-3 bg-rose-50 border border-rose-100 rounded-lg dark:bg-rose-950/30 dark:border-rose-900/50">
                                    <p className="text-[10px] text-rose-700 font-bold uppercase tracking-widest mb-2 dark:text-rose-400">Action cannot be undone</p>
                                    <p className="text-xs text-rose-800 dark:text-rose-300">
                                        Type <strong>RESET</strong> in the field below to confirm.
                                    </p>
                                </div>
                                <input 
                                    type="text" 
                                    placeholder="Type RESET" 
                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-center font-bold tracking-widest uppercase focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 focus:outline-none transition-all dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                                    value={resetConfirmText}
                                    onChange={(e) => setResetConfirmText(e.target.value.toUpperCase())}
                                />
                            </div>
                            <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-4 dark:bg-slate-950/20 dark:border-slate-800">
                                <button
                                    onClick={() => setShowResetModal(false)}
                                    className="flex-1 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-900 transition-colors dark:text-slate-400 dark:hover:text-slate-200"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={executeFactoryReset}
                                    disabled={loading || resetConfirmText !== 'RESET'}
                                    className="flex-[2] py-2.5 bg-rose-600 text-white rounded-lg text-sm font-bold shadow-lg shadow-rose-600/20 hover:bg-rose-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 dark:disabled:text-slate-500 transition-all flex items-center justify-center gap-2"
                                >
                                    {loading ? <Loader2 size={16} className="animate-spin" /> : "Delete All System Data"}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};
