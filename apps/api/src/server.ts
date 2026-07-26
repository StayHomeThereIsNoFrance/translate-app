import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { CliproxyTranslationService } from './translator.js';

const config = loadConfig();
const translator = new CliproxyTranslationService(config);
const app = await buildApp({ config, translator });

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
