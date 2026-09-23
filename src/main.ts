import 'dotenv/config';
import { ConsoleLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { configureApp } from './common/configure-app.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    logger: new ConsoleLogger({ json: true }),
  });
  configureApp(app);
  app.enableShutdownHooks();
  const host = process.env.HOST ?? '127.0.0.1';
  if (
    process.env.NODE_ENV !== 'production' &&
    ['127.0.0.1', '::1', 'localhost'].includes(host)
  ) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Unified Service Scheduler')
        .setDescription(
          'Customer scheduling API. Availability does not reserve resources. All timestamps include an explicit timezone offset.',
        )
        .setVersion('1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('docs', app, document);
  }
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error('PORT must be a valid TCP port.');
  await app.listen(port, host);
  const address = app.getHttpServer().address() as { port: number };
  // IPC is used only by the two-process system-test launcher.
  process.send?.({ type: 'ready', port: address.port });
}
await bootstrap();
