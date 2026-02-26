import { main } from "./main";

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});