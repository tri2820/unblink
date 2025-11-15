import { generateSecret } from "../auth";
import { getAllSecrets, createSecret, setSecret } from "../database/utils";
import { logger } from "../logger";

export async function load_secrets() {
    // Load secrets into memory
    const SECRETS: Record<string, string> = {};
    const secrets_db = await getAllSecrets();
    for (const secret of secrets_db) {
        SECRETS[secret.key] = secret.value;
    }
    logger.info("Loaded secrets from database");

    if (!SECRETS['jwt_signing_key']) {
        const new_key = generateSecret(64);
        await setSecret('jwt_signing_key', new_key);
        SECRETS['jwt_signing_key'] = new_key;
        logger.info("Generated new JWT signing key");
    }


    const secrets = () => SECRETS;
    return { secrets };
}