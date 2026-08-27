import { createApp } from "./app";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);

const app = createApp({
  dbPath: process.env.DURABLE_DB_PATH ?? "data/shdos.sqlite",
});
app.server.listen(port, () => {
  console.log(`SH-DOS M3 Content API listening on http://localhost:${port}`);
  console.log(`OpenAPI: http://localhost:${port}/openapi.json`);
});
