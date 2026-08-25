import { seedSustainabilityDemoData } from "../server/sustainabilityDemoSeed";

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("The sustainability demo seed is development-only");
  }
  const result = await seedSustainabilityDemoData();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});