import { ZodValidationPipe } from './zod-validation.pipe';
import { BadRequestException } from '@nestjs/common';
import { QueryRequestSchema } from '../../clinical-trials/dto/query.dto';

describe('ZodValidationPipe', () => {
  let pipe: ZodValidationPipe;

  beforeEach(() => {
    pipe = new ZodValidationPipe(QueryRequestSchema);
  });

  it('should pass validation with a valid query', () => {
    const validInput = { query: 'Show me lung cancer trials' };
    const result = pipe.transform(validInput, { type: 'body' });
    expect(result).toMatchObject(validInput);
  });

  it('should pass with all optional fields', () => {
    const validInput = {
      query: 'Show Pembrolizumab Phase 3 trials in the US from 2018',
      drug_name: 'Pembrolizumab',
      condition: 'lung cancer',
      trial_phase: 'PHASE3',
      country: 'US',
      start_year: 2018,
      end_year: 2023,
      status: 'COMPLETED',
    };
    const result = pipe.transform(validInput, { type: 'body' });
    expect(result).toMatchObject(validInput);
  });

  it('should throw BadRequestException when query is missing', () => {
    expect(() => pipe.transform({}, { type: 'body' })).toThrow(BadRequestException);
  });

  it('should throw BadRequestException when query is too short', () => {
    expect(() =>
      pipe.transform({ query: 'hi' }, { type: 'body' }),
    ).toThrow(BadRequestException);
  });

  it('should throw BadRequestException with invalid trial_phase', () => {
    expect(() =>
      pipe.transform(
        { query: 'Show trials', trial_phase: 'INVALID_PHASE' },
        { type: 'body' },
      ),
    ).toThrow(BadRequestException);
  });

  it('should throw BadRequestException with invalid status', () => {
    expect(() =>
      pipe.transform(
        { query: 'Show trials', status: 'INVALID_STATUS' },
        { type: 'body' },
      ),
    ).toThrow(BadRequestException);
  });

  it('should throw BadRequestException when start_year is out of range', () => {
    expect(() =>
      pipe.transform({ query: 'Show trials', start_year: 1980 }, { type: 'body' }),
    ).toThrow(BadRequestException);
  });

  it('should include field-level error details in the exception', () => {
    try {
      pipe.transform({}, { type: 'body' });
    } catch (e) {
      if (e instanceof BadRequestException) {
        const response = e.getResponse() as { message: string; errors: Array<{ field: string; message: string }> };
        expect(response.message).toBe('Validation failed');
        expect(response.errors).toBeDefined();
        expect(Array.isArray(response.errors)).toBe(true);
        expect(response.errors[0]).toHaveProperty('field');
        expect(response.errors[0]).toHaveProperty('message');
      }
    }
  });
});
