import { requestHandler } from "./generate";

Bun.serve({
  fetch: requestHandler,
  port: Bun.env.PORT ?? 8000,
});
