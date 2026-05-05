import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function parseFinancialNumber(val: any): number {
  if (val === undefined || val === null || val === '') return 0;
  // Remove any character that is not a digit, dot, minus, or comma
  let str = String(val).replace(/[^0-9.,-]/g, '').trim();
  // If we have commas and dots, figure out which one is the decimal separator
  // Usually, if the last non-digit is a comma, it's a decimal separator
  // But for safety, let's just remove commas unless we are explicitly handling EU locales.
  // We'll strip commas as thousand separators.
  str = str.replace(/,/g, '');
  // If there are multiple dots or something strange, just try parsing.
  const n = Number(str);
  return isNaN(n) ? 0 : n;
}
