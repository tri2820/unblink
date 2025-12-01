import { getAgentResponsesByAgent, getAllAgentResponses, getAllAgents, getAllMedia, getAllMoments, getAllMetrics, getAllEmbeddings } from "./utils";

// const mediaRes = await getAllMedia()
// console.log("All media:", mediaRes);

// const res = await getAllMoments()
// console.log("All moments:", res);

// const res = await getAllAgentResponses()
// console.log("All agent responses:", res);

const agents = await getAllAgents()
console.log("All agents:", agents);

const metrics = await getAllMetrics()
console.log("All metrics:", metrics);

const embeddings = await getAllEmbeddings()
console.log("All embeddings:", embeddings);