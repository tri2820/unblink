import { auth_required } from '~/backend/auth';
import { load_settings } from '~/backend/startup/load_settings';
import { createAgent, updateAgent, createMetric, createEmbedding } from '~/backend/database/utils';
import { logger } from '~/backend/logger';
import { v4 as uuid } from "uuid";
import { createRequestBuilder } from '~/index';
import type { WorkerInput__Llm, WorkerOutput__Llm, WorkerInput__Embedding, WorkerOutput__Embedding } from '~/shared/engine';
import { parseDirtyJson } from '~/backend/utils/dirty_json';

export const agentsPostHandler = async (req: Request) => {
    const { settings } = await load_settings();
    const auth_res = await auth_required(settings, req);
    if (auth_res.error) {
        return new Response(auth_res.error.msg, {
            status: auth_res.error.code || 401,
        });
    }

    const body = await req.json();
    const { name, instruction } = body;
    if (!name || !instruction) {
        return new Response("Missing name or instruction", { status: 400 });
    }
    const id = uuid();
    await createAgent({ id, name, instruction });

    logger.info(`Creating new agent via API: ${name} (${id}) with instruction: ${instruction}`);

    const rb = createRequestBuilder();
    const template = (t: string) => `Given an instruction to monitor video cameras, you return a list of explicit things to look for, and things to ignore. Instruction: ${t}`
    const job_output_promise = rb.add_job<WorkerInput__Llm, WorkerOutput__Llm>("llm_fast", {
        messages: [
            {
                "role": "system",
                "content": "You are a helpful coding assistant. Answer in valid JSON format with a list objects for detection and a list of metrics. Each metric has keys \"entailment\" and \"contradiction\"."
            },
            {
                "role": "user",
                "content": template("Was there an incident? Check if anyone has fallen to ensure worker safety. Is there a potentially dangerous situation (people near edges, not wearing safety gear, etc)?")
            },
            {
                "role": "assistant",
                "content": JSON.stringify({
                    "objects": ["person", "worker", "helmet", "safety vest", "edge", "ground", "height"],
                    "metrics": [
                        {
                            "entailment": "Person lying on the ground after a fall.",
                            "contradiction": "Person kneeling or sitting normally."
                        },
                        {
                            "entailment": "Sudden collapse or loss of balance.",
                            "contradiction": "Controlled sitting or intentional crouching."
                        },
                        {
                            "entailment": "Person standing near an unprotected edge.",
                            "contradiction": "Person on a flat, safe surface."
                        },
                        {
                            "entailment": "Workers in a 1-2m drop zone.",
                            "contradiction": "Workers inside a secured ground-level area."
                        },
                        {
                            "entailment": "Person lying motionless while others approach.",
                            "contradiction": "Person lying in a rest area."
                        },
                        {
                            "entailment": "Worker missing required safety gear (helmet, vest).",
                            "contradiction": "Worker wearing all required PPE."
                        }
                    ]
                })
            },
            // New query
            {
                "role": "user",
                "content": template(instruction)
            }
        ]
    })


    logger.info(`Sending job to LLM worker for agent creation: ${name} (${id}) with instruction: ${instruction}`);
    rb.send();

    const output = await job_output_promise;    

    const parsed = parseDirtyJson(output.response);
    if (parsed.error) {
        logger.error(`Error parsing LLM output for agent ${name} (${id}): ${parsed.error}`);
        return new Response("Error parsing LLM output", { status: 500 });
    }

    // validate structure
    if (!parsed.data.objects || !Array.isArray(parsed.data.objects) ||
        !parsed.data.metrics || !Array.isArray(parsed.data.metrics)) {
        logger.error(`Invalid LLM output structure for agent ${name} (${id}): ${output.response}`);
        return new Response("Invalid LLM output structure", { status: 500 });
    }

    // Create metrics for each item (batch)
    const metricIds: string[] = [];
    for (const metric of parsed.data.metrics) {
        const metricId = uuid();
        await createMetric({
            id: metricId,
            entailment: metric.entailment,
            contradiction: metric.contradiction
        });
        metricIds.push(metricId);
    }

    // Update agent with metric_ids and objects
    await updateAgent(id, {
        metric_ids: metricIds,
        objects: parsed.data.objects
    });

    // Generate embeddings for each entailment and contradiction and store in embeddings table
    const embeddingPromises: Promise<void>[] = [];
    const rbEmbeddings = createRequestBuilder();
    for (let i = 0; i < parsed.data.metrics.length; i++) {
        const metric = parsed.data.metrics[i];
        const metricId = metricIds[i];

        // Job for entailment embedding
        const entailmentJobPromise = rbEmbeddings.add_job<WorkerInput__Embedding, WorkerOutput__Embedding>("embedding", {
            text: metric.entailment,
            instruction: "Find a video frame that matches the given query"
        }).then(async (output) => {
            const entailmentEmbeddingId = uuid();
            await createEmbedding({
                id: entailmentEmbeddingId,
                value: output.embedding,
                type: 'metric_entailment',
                ref_key: { metric_id: metricId, agent_id: id }
            });
        });

        // Job for contradiction embedding
        const contradictionJobPromise = rbEmbeddings.add_job<WorkerInput__Embedding, WorkerOutput__Embedding>("embedding", {
            text: metric.contradiction,
            instruction: "Find a video frame that matches the given query"
        }).then(async (output) => {
            const contradictionEmbeddingId = uuid();
            await createEmbedding({
                id: contradictionEmbeddingId,
                value: output.embedding,
                type: 'metric_contradiction',
                ref_key: { metric_id: metricId, agent_id: id }
            });
        });

        embeddingPromises.push(entailmentJobPromise, contradictionJobPromise);
    }

    // Send the embedding jobs
    rbEmbeddings.send();

    // Wait for all embedding jobs to complete
    await Promise.all(embeddingPromises);

    logger.info(`New agent created via API: ${name} (${id})`);
    return Response.json({ success: true, id });
};