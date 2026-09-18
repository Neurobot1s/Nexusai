import { query } from "./_generated/server";

/**
 * Reports whether the NVIDIA NIM API key is present in the server
 * environment. Returns only a boolean — never the key itself.
 */
export const configured = query({
  args: {},
  handler: async () => {
    return { configured: !!process.env.NIM_API_KEY };
  },
});
