import * as readline from "readline";

function askYesNo(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      resolve(normalized === "y" || normalized === "yes");
    });
  });
}

export async function permissionsPrompt(permissions: string[]): Promise<boolean> {
  if (!permissions || permissions.length === 0) return true;

  console.log("\nThis agent requests the following permissions:");
  for (const p of permissions) console.log(`- ${p}`);

  const ok = await askYesNo("\nApprove? (y/n): ");
  return ok;
}