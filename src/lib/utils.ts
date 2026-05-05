import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function parseFinancialNumber(val: any): number {
  if (val === undefined || val === null || val === '') return 0;
  const str = String(val).replace(/,/g, '').trim();
  const n = Number(str);
  return isNaN(n) ? 0 : n;
}
