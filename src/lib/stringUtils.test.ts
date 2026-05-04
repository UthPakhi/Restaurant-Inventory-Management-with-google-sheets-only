import { describe, it, expect } from 'vitest';
import { normalize, superNormalize, fuzzyMatch } from './stringUtils';

describe('String Utilities', () => {
    describe('normalize', () => {
        it('should lowercase and trim', () => {
            expect(normalize('  Lemon Syrup  ')).toBe('lemon syrup');
        });
        
        it('should collapse multiple spaces', () => {
            expect(normalize('Lemon   Syrup')).toBe('lemon syrup');
        });
    });

    describe('superNormalize', () => {
        it('should remove non-alphanumeric characters', () => {
            expect(superNormalize('Lemon-Syrup!')).toBe('lemonsyrup');
        });
        
        it('should remove all spaces', () => {
            expect(superNormalize('Lemon   Syrup')).toBe('lemonsyrup');
        });
    });

    describe('fuzzyMatch', () => {
        it('should match with standard normalization', () => {
            expect(fuzzyMatch('Lemon Syrup', '  lemon   syrup  ')).toBe(true);
        });
        
        it('should match with aggressive normalization', () => {
            expect(fuzzyMatch('Lemon Syrup', 'Lemon-Syrup')).toBe(true);
            expect(fuzzyMatch('Medo 50kg', 'Medo 50 Kg')).toBe(true);
        });
        
        it('should not match completely different strings', () => {
            expect(fuzzyMatch('Lemon Syrup', 'Orange Juice')).toBe(false);
        });
    });
});
