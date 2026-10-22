import { requestHandler } from "./generate";

Bun.serve({
  fetch: requestHandler,
  port: 8000,
});
