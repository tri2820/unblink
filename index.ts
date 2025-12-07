import type { ServerWebSocket } from "bun";
import { decode } from "cbor-x";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { v4 as uuid } from "uuid";
import { admin } from "./admin";
import { WsClient } from "./backend/WsClient";
import { FRAMES_DIR, RUNTIME_DIR } from "./backend/appdir";
import { auth_required, verifyPassword } from "./backend/auth";
import { executeREST } from './backend/database/rest';
import {
    createMedia,
    createSession,
    deleteAgent,
    deleteMedia,
    deleteSession,
    getAgentById,
    getAllAgents,
    getAllMedia,
    getAllMoments,
    getAllSettings as getAllSettingsDB,
    getAllUsers,
    getMediaUnitById,
    getMetricsByIds,
    getMomentById,
    getUserByUsername as getUserByUsernameDB,
    setSetting as setSettingDB,
    updateMedia
} from "./backend/database/utils";
import { createForwardFunction } from "./backend/forward";
import { logger } from "./backend/logger";
import { agentsPostHandler } from "./backend/routes/agents";
import { check_version } from "./backend/startup/check_version";
import { connect_to_engine } from "./backend/startup/connect_to_engine";
import { load_secrets } from "./backend/startup/load_secrets";
import { load_settings } from "./backend/startup/load_settings";
import { create_webhook_forward } from "./backend/webhook";
import { spawn_worker } from "./backend/worker_connect/shared";
import {
    start_stream,
    start_streams,
} from "./backend/worker_connect/worker_stream_connector";
import homepage from "./index.html";
import type {
    ClientToServerMessage,
    FrameStatsMessage,
    RESTQuery,
} from "./shared";
import { type RemoteJob, type Resource, type WorkerRequest } from "./shared/engine";
import { type StreamStats } from "./backend/utils/frame_stats";

type ServerEphemeralState = {
    remote_worker_jobs_cont: Map<string, (output: any) => void>
    frame_stats_messages: FrameStatsMessage[];
    stream_stats_map: Map<string, StreamStats>;
    active_moments: Set<string>;
    moment_frames: Map<string, { id: string, at_time: number, data: Uint8Array }[]>;
    current_moment_ids: Map<string, string>; // media_id -> moment_id for active moments
    agent_scores: Map<string, Map<string, number>>; // media_id -> agent_id -> score
    stream_start_times: Map<string, number>; // media_id -> start timestamp in milliseconds
    streaming_vlm_state: Map<string, { id: string; data: Uint8Array; timestamp: number }[]>; // media_id -> accumulated frames
};

export type { ServerEphemeralState };

// ... (rest of imports)

// Check args for "admin" mode
if (process.argv[2] === "admin") {
    await admin();
    process.exit(0);
}

logger.info(`Using runtime directory: ${RUNTIME_DIR}`);

const ENGINE_URL = process.env.ENGINE_URL || "api.zapdoslabs.com";
await check_version({ ENGINE_URL });

const clients = new Map<ServerWebSocket, WsClient>();

const { settings, setSettings } = await load_settings();
const { secrets } = await load_secrets();
const forward_to_webhook = create_webhook_forward({ settings });

// For things we don't want to persist in database
// But want to be readily available upon new client connections
const state: ServerEphemeralState = {
    remote_worker_jobs_cont: new Map(),
    frame_stats_messages: [],
    stream_stats_map: new Map(),
    active_moments: new Set(),
    moment_frames: new Map(),
    current_moment_ids: new Map(),
    agent_scores: new Map(),
    stream_start_times: new Map(),
    streaming_vlm_state: new Map(),
};

export type RequestBuilder = {
    req: WorkerRequest;
    add_resource: (res: Resource) => void;
    add_resources: (res_list: Resource[]) => void;
    add_job: <I extends Record<string, any>, O>(worker_type: string, input: I) => Promise<O>;
    send: () => void;
};

export const createRequestBuilder = (): RequestBuilder => {
    const req: WorkerRequest = {
        type: "worker_request",
        jobs: [],
        resources: [],
    };

    const add_resource = (res: Resource) => {
        req.resources = req.resources || [];
        req.resources.push(res);
    };

    const add_resources = (res_list: Resource[]) => {
        req.resources = req.resources || [];
        req.resources.push(...res_list);
    };

    const add_job = <I extends Record<string, any>, O>(
        worker_type: string,
        input: I
    ): Promise<O> => {
        let _resolve: ((output: O) => void) | undefined = undefined;
        const output_promise = new Promise<O>((resolve) => {
            _resolve = resolve;
        });
        const serializable_job: RemoteJob = {
            job_id: randomUUID(),
            input,
            worker_type,
        };

        // Add to map for later resolution
        state.remote_worker_jobs_cont.set(serializable_job.job_id, (output) => {
            _resolve?.(output)
        });

        req.jobs.push(serializable_job);

        return output_promise;
    };

    const send = () => {
        if (req.jobs.length === 0) return; // Nothing to send
        engine_conn.send(req);
    };

    return {
        req,
        add_resource,
        add_resources,
        add_job,
        send,
    };
};

const handleMessage = createForwardFunction({
    clients,
    worker_stream: () => worker_stream,
    settings,
    forward_to_webhook,
    state: () => state,
});

const worker_stream = await spawn_worker("worker_stream.js", handleMessage);

const engine_conn = connect_to_engine({
    ENGINE_URL,
    state: () => state,
    clients: () => clients,
    forward_to_webhook,
    worker_stream,
});

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const HOSTNAME = process.env.HOSTNAME || "localhost";
const SESSION_DURATION_HOURS = 8;
// Create Bun server
const server = Bun.serve({
    port: PORT,
    hostname: HOSTNAME,
    routes: {
        "/": homepage,
        "/test": async (req) => {
            return new Response("Test endpoint working");
        },
        "/auth/login": {
            POST: async (req: Request) => {
                const body = await req.json();
                const { username, password } = body;
                if (!username || !password) {
                    return new Response("Missing username or password", { status: 400 });
                }

                const user = await getUserByUsernameDB(username);

                if (!user)
                    return new Response("Invalid username or password", { status: 401 });

                const is_valid = await verifyPassword(password, user.password_hash);
                if (!is_valid)
                    return new Response("Invalid username or password", { status: 401 });

                const session_id = uuid();
                const created_at = new Date();
                const expires_at = new Date(
                    created_at.getTime() + SESSION_DURATION_HOURS * 60 * 60 * 1000
                );

                await createSession({
                    session_id,
                    user_id: user.id,
                    created_at: created_at.getTime(),
                    expires_at: expires_at.getTime(),
                });

                const res = Response.json({ message: "Login successful" });
                const DANGEROUS_DISABLE_SECURE_COOKIE =
                    process.env.DANGEROUS_DISABLE_SECURE_COOKIE === "true";
                let cookie = `session_id=${session_id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_DURATION_HOURS * 3600
                    };${DANGEROUS_DISABLE_SECURE_COOKIE ? "" : " Secure"}`;
                res.headers.append("Set-Cookie", cookie);

                console.log(
                    `User '${username}' logged in, session created with ID: ${session_id}`
                );
                return res;
            },
        },

        "/auth/logout": {
            POST: async (req: Request) => {
                const cookies = req.headers.get("cookie");
                const session_id = cookies?.match(/session_id=([^;]+)/)?.[1];

                if (!session_id)
                    return new Response("Missing session_id", { status: 400 });

                await deleteSession(session_id);

                const res = new Response("Logged out successfully", { status: 200 });
                let cookie =
                    "session_id=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0;";
                const DANGEROUS_DISABLE_SECURE_COOKIE =
                    process.env.DANGEROUS_DISABLE_SECURE_COOKIE === "true";
                cookie += DANGEROUS_DISABLE_SECURE_COOKIE ? "" : " Secure";
                res.headers.append("Set-Cookie", cookie);
                return res;
            },
        },

        "/auth/me": {
            GET: async (req: Request) => {
                const auth_res = await auth_required(settings, req);
                if (auth_res.error) {
                    return new Response(auth_res.error.msg, {
                        status: auth_res.error.code || 401,
                    });
                }

                const { user } = auth_res.data;
                if (!user) {
                    return new Response("User not found", { status: 404 });
                }
                const maskedUser = {
                    id: user.id,
                    username: user.username,
                    role: user.role,
                };
                return Response.json({ user: maskedUser });
            },
        },

        "/media/:id": {
            PUT: async (req: Request, params: { id: string }) => {
                const auth_res = await auth_required(settings, req);
                if (auth_res.error) {
                    return new Response(auth_res.error.msg, {
                        status: auth_res.error.code || 401,
                    });
                }

                const { id } = params;
                const data = await req.json();
                const { name, uri, labels, save_to_disk, save_location } = data;
                if (!name || !uri) {
                    return new Response("Missing name or uri", { status: 400 });
                }
                const updated_at = new Date();
                await updateMedia(id, {
                    name,
                    uri,
                    labels: labels ?? [],
                    save_to_disk: save_to_disk ? 1 : 0,
                    save_location: save_location ?? "",
                });
                return Response.json({ success: true });
            },
            DELETE: async (req: Request, params: { id: string }) => {
                const auth_res = await auth_required(settings, req);
                if (auth_res.error) {
                    return new Response(auth_res.error.msg, {
                        status: auth_res.error.code || 401,
                    });
                }

                const { id } = params;
                await deleteMedia(id);
                return Response.json({ success: true });
            },
        },
        "/media": {
            GET: async (req: Request) => {
                const auth_res = await auth_required(settings, req);
                if (auth_res.error) {
                    return new Response(auth_res.error.msg, {
                        status: auth_res.error.code || 401,
                    });
                }

                const media = await getAllMedia();
                media.sort((a, b) => b.updated_at - a.updated_at);
                return Response.json(media);
            },
            POST: async (req: Request) => {
                const auth_res = await auth_required(settings, req);
                if (auth_res.error) {
                    return new Response(auth_res.error.msg, {
                        status: auth_res.error.code || 401,
                    });
                }

                const body = await req.json();
                const { name, uri, labels, save_to_disk, save_location } = body;
                if (!name || !uri) {
                    return new Response("Missing name or uri", { status: 400 });
                }
                const id = uuid();
                await createMedia({
                    id,
                    name,
                    uri,
                    labels: labels ?? [],
                    updated_at: Date.now(),
                    save_to_disk: save_to_disk ? 1 : 0,
                    save_location: save_location ?? "",
                });

                logger.info(`New media added via API: ${name} (${id})`);
                // Start the media stream
                start_stream(worker_stream, {
                    id,
                    uri: uri as string,
                    save_location: save_location as string,
                });

                return Response.json({ success: true, id });
            },
        },
        "/query": {
            POST: async (req: Request) => {
                const auth_res = await auth_required(settings, req);
                if (auth_res.error) {
                    return new Response(auth_res.error.msg, {
                        status: auth_res.error.code || 401,
                    });
                }

                const body = await req.json();

                if (!body.query) {
                    return new Response("Missing query", { status: 400 });
                }

                const query: RESTQuery = body.query;

                // Whitelist supported tables
                const supportedTables = ["media_units", "agent_responses", "agents", "moments"];
                if (!supportedTables.includes(query.table)) {
                    return new Response("Invalid table in query", { status: 400 });
                }

                const results = await executeREST(query);

                if (Array.isArray(results)) {
                    // Sanitize results to remove sensitive path fields
                    let sanitizedResults = results;
                    if (query.table === "media_units") {
                        sanitizedResults = results.map((mu: any) => {
                            const { path, ...rest } = mu;
                            return rest;
                        });
                    } else if (query.table === "moments") {
                        sanitizedResults = results.map((moment: any) => {
                            const { thumbnail_path, clip_path, ...rest } = moment;
                            return rest;
                        });
                    }

                    // Return results with the table name as the key
                    return Response.json({ [query.table]: sanitizedResults });
                } else {
                    // Write operation successful
                    return Response.json({ success: true });
                }
            },
        },
        "/moments": {
            GET: async (req: Request) => {
                const auth_res = await auth_required(settings, req);
                if (auth_res.error) {
                    return new Response(auth_res.error.msg, {
                        status: auth_res.error.code || 401,
                    });
                }
                const moments = await getAllMoments();
                // Remove sensitive path fields before sending to frontend
                const safeMoments = moments.map(({ thumbnail_path, ...rest }) => rest);
                return Response.json(safeMoments);
            },
        },
        "/moments/:id": {
            GET: async (req: Request & { params: { id: string } }) => {
                const auth_res = await auth_required(settings, req);
                if (auth_res.error) {
                    return new Response(auth_res.error.msg, {
                        status: auth_res.error.code || 401,
                    });
                }
                const { id } = req.params;
                const moment = await getMomentById(id);

                if (!moment) {
                    return new Response("Moment not found", { status: 404 });
                }

                // Remove sensitive path fields before sending to frontend
                const { thumbnail_path, ...safeMoment } = moment;
                return Response.json(safeMoment);
            },
        },
        "/moments/:id/thumbnail": {
            GET: async (req: Request & { params: { id: string } }) => {
                const auth_res = await auth_required(settings, req);
                if (auth_res.error) {
                    return new Response(auth_res.error.msg, {
                        status: auth_res.error.code || 401,
                    });
                }

                const { id } = req.params;

                // Fetch the moment from the database
                const moment = await getMomentById(id);

                if (!moment) {
                    return new Response("Moment not found", { status: 404 });
                }

                if (!moment.thumbnail_path) {
                    return new Response("No thumbnail available", { status: 404 });
                }

                // Validate that the thumbnail path is within FRAMES_DIR
                const absoluteFilePath = path.resolve(moment.thumbnail_path);
                if (!absoluteFilePath.startsWith(FRAMES_DIR)) {
                    logger.error(
                        { moment_id: id, path: moment.thumbnail_path },
                        "Invalid thumbnail path"
                    );
                    return new Response("Invalid thumbnail path", { status: 400 });
                }

                try {
                    const file = Bun.file(moment.thumbnail_path);

                    // Check if file exists
                    if (!(await file.exists())) {
                        return new Response("Thumbnail file not found", { status: 404 });
                    }

                    const headers = new Headers();
                    headers.set("Content-Type", file.type || "image/jpeg");
                    headers.set("Content-Disposition", "inline");
                    headers.set("Cache-Control", "public, max-age=31536000"); // Cache for 1 year

                    return new Response(file.stream(), { headers });
                } catch (error) {
                    logger.error(
                        { error, moment_id: id },
                        "Error fetching moment thumbnail"
                    );
                    return new Response("Error fetching thumbnail", { status: 500 });
                }
            },
        },
        "/media_units/:id/image": {
            GET: async (req: Request & { params: { id: string } }) => {
const auth_res = await auth_required(settings, req);
                if (auth_res.error) {
                    return new Response(auth_res.error.msg, {
                        status: auth_res.error.code || 401,
                    });
                }
                

                const { id } = req.params;

                // Fetch the media unit from the database
                const mediaUnit = await getMediaUnitById(id);

                if (!mediaUnit) {
                    return new Response("Media unit not found", { status: 404 });
                }

                if (!mediaUnit.path) {
                    return new Response("No image available", { status: 404 });
                }

                // Validate that the image path is within FRAMES_DIR
                const absoluteFilePath = path.resolve(mediaUnit.path);
                if (!absoluteFilePath.startsWith(FRAMES_DIR)) {
                    logger.error(
                        { media_unit_id: id, path: mediaUnit.path },
                        "Invalid image path"
                    );
                    return new Response("Invalid image path", { status: 400 });
                }

                try {
                    const file = Bun.file(mediaUnit.path);

                    // Check if file exists
                    if (!(await file.exists())) {
                        return new Response("Image file not found", { status: 404 });
                    }

                    const headers = new Headers();
                    headers.set("Content-Type", file.type || "image/jpeg");
                    headers.set("Content-Disposition", "inline");
                    headers.set("Cache-Control", "public, max-age=31536000"); // Cache for 1 year

                    return new Response(file.stream(), { headers });
                } catch (error) {
                    logger.error(
                        { error, media_unit_id: id },
                        "Error fetching media unit image"
                    );
                    return new Response("Error fetching image", { status: 500 });
                }
            },
        },

        "/settings": {
            GET: async (req) => {
                const settings = await getAllSettingsDB();
                return Response.json(settings);
            },
            PUT: async (req: Request) => {
                const auth_res = await auth_required(settings, req);
                if (auth_res.error) {
                    return new Response(auth_res.error.msg, {
                        status: auth_res.error.code || 401,
                    });
                }

                const body = await req.json();
                const { entries } = body;
                if (!entries || !Array.isArray(entries)) {
                    return new Response("Missing or invalid entries", { status: 400 });
                }

                for (const entry of entries) {
                    const { key, value } = entry;
                    await setSettingDB(key, value.toString());
                    setSettings(key, value.toString());
                    logger.info(`Setting updated: ${key} = ${value}`);
                }

                return Response.json({ success: true });
            },
        },
        "/users": {
            GET: async (req: Request) => {
                const auth_res = await auth_required(settings, req);
                if (auth_res.error) {
                    return new Response(auth_res.error.msg, {
                        status: auth_res.error.code || 401,
                    });
                }

                const users = await getAllUsers();
                const safeUsers = users.map(({ password_hash, ...rest }) => rest);
                return Response.json(safeUsers);
            },
        },
        "/search": {
            POST: async (req: Request) => {
                const auth_res = await auth_required(settings, req);
                if (auth_res.error) {
                    return new Response(auth_res.error.msg, {
                        status: auth_res.error.code || 401,
                    });
                }

                return new Response("Search functionality temporarily disabled", { status: 503 });
            },
        },
        "/agents": {
            GET: async (req: Request) => {
                const auth_res = await auth_required(settings, req);
                if (auth_res.error) {
                    return new Response(auth_res.error.msg, {
                        status: auth_res.error.code || 401,
                    });
                }

                const agents = await getAllAgents();
                return Response.json(agents);
            },
            POST: agentsPostHandler,
        },
        "/agents/:id": {
            DELETE: async (req: Request, params: { id: string }) => {
                const auth_res = await auth_required(settings, req);
                if (auth_res.error) {
                    return new Response(auth_res.error.msg, {
                        status: auth_res.error.code || 401,
                    });
                }

                const { id } = params;
                await deleteAgent(id);
                return Response.json({ success: true });
            },
        },
        "/agents/:id/metrics": {
            GET: async (req: Request & { params: { id: string } }) => {
                const auth_res = await auth_required(settings, req);
                if (auth_res.error) {
                    return new Response(auth_res.error.msg, {
                        status: auth_res.error.code || 401,
                    });
                }

                const { id } = req.params;
                const agent = await getAgentById(id);
                console.log('Fetching metrics for agent', { agent_id: id, agent });
                if (!agent) {
                    return new Response("Agent not found", { status: 404 });
                }


                const metrics = await getMetricsByIds(agent.metric_ids || []);
                
                return Response.json(metrics);
            },
        },
        "/frame-stats": {
            GET: async (req: Request) => {
                const auth_res = await auth_required(settings, req);
                if (auth_res.error) {
                    return new Response(auth_res.error.msg, {
                        status: auth_res.error.code || 401,
                    });
                }

                return Response.json(state.frame_stats_messages);
            },
        },
    },
    websocket: {
        open(ws) {
            logger.info("WebSocket connection opened");
            clients.set(ws, new WsClient(ws, () => worker_stream));
        },
        close(ws, code, reason) {
            logger.info(`WebSocket connection closed: ${code} - ${reason}`);
            const client = clients.get(ws);
            if (client) {
                // Mark the client as closed to prevent further processing
                // Just in case other functions are still referencing it
                client.destroy();
            }
            clients.delete(ws);
        },
        async message(ws, message) {
            try {
                const decoded = decode(message as Buffer) as ClientToServerMessage;
                if (decoded.type === "set_subscription") {
                    const client = clients.get(ws);
                    await client?.updateSubscription(decoded.subscription);
                }
            } catch (error) {
                logger.error(error, "Error parsing websocket message");
            }
        },
    },

    async fetch(req, server) {
        const url = new URL(req.url);

        // WebSocket upgrade
        if (url.pathname === "/ws") {
            if (server.upgrade(req)) {
                return; // do not return a Response
            } else {
                return new Response("Cannot upgrade to WebSocket", { status: 400 });
            }
        }

        // API Proxying
        if (url.pathname.startsWith("/api")) {
            // --- FIX START ---
            // Construct a new URL using the target host and the incoming path.
            // This avoids carrying over the original request's port.
            const targetUrl = new URL(url.pathname, `https://${ENGINE_URL}`);
            targetUrl.search = url.search; // Preserve any query parameters
            // --- FIX END ---

            const headers = new Headers(req.headers);
            // The "host" header should reflect the target server, not the proxy server.
            headers.set("host", new URL(`https://${ENGINE_URL}`).host);

            // if (appConfig.store.auth_token) {
            //     headers.set("authorization", `Bearer ${appConfig.store.auth_token}`);
            // }

            try {
                const response = await fetch(targetUrl.toString(), {
                    method: req.method,
                    headers: headers,
                    body: req.body,
                    redirect: "manual",
                });
                return response;
            } catch (error) {
                logger.error(error, "Proxy error:");
                return new Response(JSON.stringify({ error: "Proxy error occurred" }), {
                    status: 500,
                    headers: { "Content-Type": "application/json" },
                });
            }
        }

        return new Response("Not found", { status: 404 });
    },
    development: process.env.NODE_ENV === "development",
});

logger.info(`Server running on ${HOSTNAME}:${PORT}`);

if (process.env.DEV_MODE === "lite") {
    logger.info("Running in lite development mode - skipping stream startup");
} else {
    // Start all streams from the database
    start_streams({
        worker_stream,
    });
}

// // Graceful shutdown
// const cleanup = async () => {
//     logger.info("Shutting down server...");
//     await closeDb();
//     server.stop();
//     process.exit(0);
// };

// process.on('SIGINT', cleanup);
// process.on('SIGTERM', cleanup);
