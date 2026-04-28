import { IndexOutput } from "./types";
import indexHtml from "./web/index.html";

const indexData = Promise.resolve()
  .then(() => import("#std-index", { with: { type: "json" } }))
  .then((module) => module.default as IndexOutput)
  .catch(console.error);

const server = Bun.serve({
  port: import.meta.env.PORT || 3000,
  routes: {
    "/std-index.json": async () => {
      return Response.json(await indexData);
    },
    "/*": indexHtml,
  },
});
console.log(`Server running at http://localhost:${server.port}`);
