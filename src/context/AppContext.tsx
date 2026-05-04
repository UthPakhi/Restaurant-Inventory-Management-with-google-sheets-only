import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { sheetsService } from '../services/sheetsService';
import { mapRowToItem, mapRowToDepartment, mapRowToSupplier } from '../services/dataMappers';
import { Item, Department, Supplier } from '../types';

interface AppContextProps {
  items: Item[];
  activeItems: Item[];
  departments: Department[];
  activeDepartments: Department[];
  suppliers: Supplier[];
  activeSuppliers: Supplier[];
  loadingStaticData: boolean;
  refreshStaticData: () => Promise<void>;
}

const AppContext = createContext<AppContextProps | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<Item[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loadingStaticData, setLoadingStaticData] = useState(true);

  const fetchStaticData = async () => {
    setLoadingStaticData(true);
    try {
      if (!sheetsService.isConfigured() && !sheetsService.isDemoMode) {
        // We'll skip fetching if the sheets aren't available yet or app isn't configured
        return;
      }
      const [itemRows, deptRows, suppRows] = await Promise.all([
        sheetsService.getAllItems(),
        sheetsService.getAllDepartments(),
        sheetsService.getAllSuppliers()
      ]);
      
      setItems((itemRows || []).map(mapRowToItem));
      setDepartments((deptRows || []).map(mapRowToDepartment));
      setSuppliers((suppRows || []).map(mapRowToSupplier));
    } catch (error) {
      console.error('Error fetching static lookup data:', error);
    } finally {
      setLoadingStaticData(false);
    }
  };

  useEffect(() => {
    fetchStaticData();
  }, []);

  return (
    <AppContext.Provider value={{
      items,
      activeItems: items.filter(i => i.isActive !== false),
      departments,
      activeDepartments: departments.filter(d => d.isActive !== false),
      suppliers,
      activeSuppliers: suppliers.filter(s => s.isActive !== false),
      loadingStaticData,
      refreshStaticData: fetchStaticData
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppLookup = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppLookup must be used within an AppProvider');
  }
  return context;
};
