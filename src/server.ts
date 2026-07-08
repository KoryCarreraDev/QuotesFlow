import app from './app.js';
import { env } from './config/env.js';

const start = async () => {
  try {
    app.listen(env.PORT, () => {
      console.log(`Servidor corriendo en puerto ${env.PORT} [${env.NODE_ENV}]`);
    });
  } catch (error) {
    console.error('Error al iniciar el servidor:', error);
    process.exit(1);
  }
};

start();