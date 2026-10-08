import { PipeTransform, ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { ZodSchema, ZodError } from 'zod';

/**
 * Validation pipe that uses a Zod schema for runtime validation.
 * Throws a 400 Bad Request with detailed field errors on failure.
 */
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) { }

  transform(value: unknown, _metadata: ArgumentMetadata): unknown {
    try {
      return this.schema.parse(value);
    } catch (error) {
      if (error instanceof ZodError) {
        const issues = error.issues ?? [];
        const details = issues.map((e) => ({
          field: e.path.map(String).join('.'),
          message: e.message,
        }));
        throw new BadRequestException({
          message: 'Validation failed',
          errors: details,
        });
      }
      throw new BadRequestException('Invalid request body');
    }
  }
}
