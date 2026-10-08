import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from '@nestjs/common';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const logger = new Logger('Bootstrap');

  // ─── Static Assets (Interactive Demo UI) ────────────────────────────────────
  app.useStaticAssets(join(process.cwd(), 'public'), {
    prefix: '/',
  });

  // ─── Global prefix ─────────────────────────────────────────────────────────
  app.setGlobalPrefix('api/v1');

  // ─── CORS ──────────────────────────────────────────────────────────────────
  app.enableCors();

  // ─── Swagger ───────────────────────────────────────────────────────────────
  const config = new DocumentBuilder()
    .setTitle('ClinicalTrials.gov Query-to-Visualization API')
    .setDescription(
      `An AI-powered backend that converts natural language questions about clinical trials
      into structured visualization specifications backed by real ClinicalTrials.gov data.
      
      **How it works:**
      1. Send a POST /api/v1/query with a natural language question
      2. OpenAI interprets the query and selects the optimal visualization type
      3. Data is fetched from ClinicalTrials.gov API v2
      4. A structured visualization spec is returned (frontend-renderable)
      
      **Supported visualizations:** bar_chart, grouped_bar_chart, time_series, scatter_plot, histogram, network_graph, pie_chart, table
      `,
    )
    .setVersion('1.0')
    .addTag('Clinical Trials Query', 'Query clinical trial data with natural language')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      defaultModelsExpandDepth: 3,
      defaultResponseContentType: 'application/json',
    },
  });

  // ─── Start ─────────────────────────────────────────────────────────────────
  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  logger.log(`🚀 Server running on: http://localhost:${port}`);
  logger.log(`📚 Swagger docs: http://localhost:${port}/api/docs`);
  logger.log(`🔗 API endpoint: POST http://localhost:${port}/api/v1/query`);
}

bootstrap();
