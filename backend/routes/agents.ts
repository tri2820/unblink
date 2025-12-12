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
    const template = (t: string) => `Given an instruction to monitor video cameras in a manufacturing environment, you return a list of 3-5 explicit unique physical objects to look for. Instruction: ${t}`
    const job_output_promise = rb.add_job<WorkerInput__Llm, WorkerOutput__Llm>("llm_fast", {
        messages: [
            {
                "role": "system",
                "content": "You are a helpful assistant specialized in manufacturing production monitoring. Answer in valid JSON format with a list of 3-5 physical items for detection and a list of metrics. Each metric has keys \"entailment\" and \"contradiction\"."
            },
            {
                "role": "user",
                "content": template("Monitor automotive assembly line to detect when car parts or components stop moving on the production line, indicating a jam or production downtime.")
            },
            {
                "role": "assistant",
                "content": JSON.stringify({
                    "objects": ["car body", "component", "assembly line", "conveyor", "vehicle part"],
                    "metrics": [
                        {
                            "entailment": "Car parts stationary on assembly line for more than 10 seconds.",
                            "contradiction": "Car parts moving continuously through assembly stations."
                        },
                        {
                            "entailment": "Production line stopped with vehicles backed up at multiple stations.",
                            "contradiction": "Vehicles flowing smoothly between assembly stations."
                        },
                    ]
                })
            },
            {
                "role": "user",
                "content": template("Monitor mask production line to detect when masks stop flowing or pile up on the conveyor, and check for quality issues like misaligned ear loops or defective masks.")
            },
            {
                "role": "assistant",
                "content": JSON.stringify({
                    "objects": ["mask", "ear loop", "conveyor belt", "mask stack", "production machine"],
                    "metrics": [
                        {
                            "entailment": "Masks piled up or jammed on the production line.",
                            "contradiction": "Masks flowing evenly and separated on conveyor."
                        },
                        {
                            "entailment": "Mask with missing, broken, or misaligned ear loops.",
                            "contradiction": "Mask with properly attached ear loops on both sides."
                        },
                    ]
                })
            },
            {
                "role": "user",
                "content": template("Monitor steel manufacturing to detect when workers are too close to hot materials, welding operations, or heavy equipment without proper safety distance.")
            },
            {
                "role": "assistant",
                "content": JSON.stringify({
                    "objects": ["worker", "steel beam", "welding arc", "crane", "hot material", "protective barrier"],
                    "metrics": [
                        {
                            "entailment": "Worker within 2 meters of welding operation or hot steel without barriers.",
                            "contradiction": "Worker maintaining safe distance from welding and hot materials."
                        },
                        {
                            "entailment": "Person standing in the path of overhead crane or moving steel beams.",
                            "contradiction": "All personnel clear of crane operation zones and moving materials."
                        },
                    ]
                })
            },
            {
                "role": "user",
                "content": template("Monitor medical mask machine to detect when the machine stops producing masks or when finished mask bins are nearly full.")
            },
            {
                "role": "assistant",
                "content": JSON.stringify({
                    "objects": ["mask machine", "finished mask", "collection bin", "production counter", "machine arm"],
                    "metrics": [
                        {
                            "entailment": "Mask machine idle with no masks being produced for over 15 seconds.",
                            "contradiction": "Machine actively producing masks at regular intervals."
                        },
                        {
                            "entailment": "Collection bin filled to 90% capacity or masks overflowing.",
                            "contradiction": "Collection bin less than 75% full with adequate space."
                        },
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