import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';

describe('ClinicalTrials Query API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('POST /api/v1/query Validation', () => {
    it('should return 400 when body is empty', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/query')
        .send({})
        .expect(400);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('message', 'Validation failed');
      expect(response.body).toHaveProperty('errors');
      expect(Array.isArray(response.body.errors)).toBe(true);
      expect(response.body.errors[0].field).toBe('query');
    });

    it('should return 400 when query string is too short (< 5 chars)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/query')
        .send({ query: 'abc' })
        .expect(400);

      expect(response.status).toBe(400);
      expect(response.body.errors[0].field).toBe('query');
    });

    it('should return 400 when trial_phase is invalid enum', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/query')
        .send({
          query: 'Show me studies in phase 9',
          trial_phase: 'PHASE9',
        })
        .expect(400);

      expect(response.status).toBe(400);
      expect(response.body.errors[0].field).toBe('trial_phase');
    });

    it('should return 400 when start_year is out of bounds', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/query')
        .send({
          query: 'Show me studies in year 1800',
          start_year: 1800,
        })
        .expect(400);

      expect(response.status).toBe(400);
      expect(response.body.errors[0].field).toBe('start_year');
    });
  });
});
