import crypto from "node:crypto";
import type { DbSession, DbUser } from "~/shared";
import { getSessionById, getUserById as getUserByIdDB } from "./database/utils";

export function generateSecret(length = 64) {

    const raw = crypto.randomBytes(length);

    // base64url encode (URL-safe, no padding)
    function base64url(buffer: Buffer) {
        return buffer.toString("base64")
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");
    }

    const secret = base64url(raw);
    return secret;
}

export async function hashPassword(password: string): Promise<string> {
    return await Bun.password.hash(password, {
        algorithm: "argon2id",
        memoryCost: 4,
        timeCost: 3,
    });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
    return await Bun.password.verify(password, hash);
}

export async function auth_required(settings: () => Record<string, string>, req: Request): Promise<{
    data: {
        user?: DbUser,
        session?: DbSession
    },
    error?: undefined
} | {
    data?: undefined,
    error: {
        code: number,
        msg: string
    }
}> {

    if (settings().auth_enabled !== "true") {
        return {
            data: {
                // Empty
            }
        }

    }

    const cookies = req.headers.get("cookie");
    const session_id = cookies?.match(/session_id=([^;]+)/)?.[1];
    if (!session_id) return {
        error: {
            code: 401,
            msg: "No session ID"
        }
    }

    const session = await getSessionById(session_id);
    if (!session) return { error: { code: 401, msg: "Invalid or expired session" } };

    // Convert Session numbers to DbSession Dates
    const dbSession: DbSession = {
        session_id: session.session_id,
        user_id: session.user_id,
        created_at: new Date(session.created_at),
        expires_at: new Date(session.expires_at)
    };

    if (!session || new Date(session.expires_at) < new Date())
        return {
            error: {
                code: 401,
                msg: "Invalid or expired session"
            }
        };

    const user = await getUserByIdDB(session.user_id);

    if (!user) return {
        error: {
            code: 404,
            msg: "User not found"
        }
    }

    return {
        data: {
            user,
            session: dbSession
        }
    };

    // // optional: extend session on activity
    // const newExpiresAt = new Date(Date.now() + SESSION_DURATION_HOURS * 3600 * 1000);
    // await table_sessions.update(
    //     { expires_at: newExpiresAt.getTime().toString() },
    //     { where: `session_id = "${session_id}"` }
    // );
}