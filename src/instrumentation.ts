export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateStartupConfiguration } = await import("@/lib/startup-validation");
    validateStartupConfiguration();
  }
}
