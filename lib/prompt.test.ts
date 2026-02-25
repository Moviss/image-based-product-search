import { describe, it, expect } from 'vitest';
import { renderPrompt } from '@/lib/prompt';

describe('prompt templating', () => {
    it('interpolates taxonomy and count', () => {
        const template = 'Select {{resultsCount}} from {{taxonomy}}';
        const result = renderPrompt(template, {
            resultsCount: 5,
            taxonomy: 'Beds, Chairs',
        });
        expect(result).toBe('Select 5 from Beds, Chairs');
    });

    it('strips conditional userPrompt block if undefined', () => {
        const template = 'System rules.{{#userPrompt}}User says: {{userPrompt}}{{/userPrompt}}';
        const result = renderPrompt(template, {});
        expect(result).toBe('System rules.');
    });

    it('replaces conditional userPrompt block if defined', () => {
        const template = 'System rules.{{#userPrompt}}User says: {{userPrompt}}{{/userPrompt}}';
        const result = renderPrompt(template, { userPrompt: 'Find something red' });
        expect(result).toBe('System rules.User says: Find something red');
    });

    it('maintains rest of prompt intact when no vars provided', () => {
        const template = 'Static string';
        const result = renderPrompt(template, {});
        expect(result).toBe('Static string');
    });
});
