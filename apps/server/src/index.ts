import 'dotenv/config';
import { app } from './app.js';

const port = Number(process.env.PORT ?? 4000);
const serverHost = process.env.NOVO_SERVER_HOST ?? process.env.HOST ?? '0.0.0.0';

app.listen(port, serverHost, () => {
  console.log(`novo API listening on http://${serverHost}:${port}`);
});
