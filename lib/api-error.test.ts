import { describe, it, expect } from 'vitest';
import { mapApiError } from '@/lib/api-error';
import Anthropic from "@anthropic-ai/sdk";

describe('api-error mapper', () => {
    it('maps Anthropic AuthenticationError to 401', () => {
        // @ts-ignore - patching the constructor to simulate the error instance
        const error = new Anthropic.AuthenticationError(401, {}, 'Invalid API key', undefined);
        const result = mapApiError(error);
        expect(result.status).toBe(401);
        expect(result.message).toContain('Invalid API key');
    });

    it('maps Anthropic RateLimitError to 429', () => {
        const error = new Anthropic.RateLimitError(429, {}, 'Slow down', undefined);
        const result = mapApiError(error);
        expect(result.status).toBe(429);
        expect(result.message).toContain('Rate limit exceeded');
    });

    it('maps generic parsing errors to 502', () => {
        const error = new Error('Failed to parse Claude response: invalid json');
        const result = mapApiError(error);
        expect(result.status).toBe(502);
        expect(result.message).toBe('Unexpected response from AI service.');
    });

    it('maps Mongoose Server Selection errors to 503', () => {
        const error = new Error('Could not connect to DB');
        error.name = 'MongooseServerSelectionError';
        const result = mapApiError(error);
        expect(result.status).toBe(503);
        expect(result.message).toContain('Product catalog is temporarily unavailable');
    });

    it('maps unknown random errors to 500', () => {
        const error = new Error('Something exploded entirely.');
        const result = mapApiError(error);
        expect(result.status).toBe(500);
        expect(result.message).toBe('An unexpected error occurred.');
    });
});
