import z from "zod";

const envSchema = z.object({
    BOT_TOKEN: z.string(),
    API_KEY: z.string(),
    API_URL: z.url(),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
        console.error("Invalid environment variables:", JSON.stringify(z.treeifyError(result.error)));
        process.exit(1);
    }

    return result.data;
}

export const env = validateEnv();
