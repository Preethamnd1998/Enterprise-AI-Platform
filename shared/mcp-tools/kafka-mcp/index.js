import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Kafka, logLevel } from "kafkajs";

// Read-only Kafka MCP server. Every handler below only calls read-side
// KafkaJS Admin APIs (listTopics, fetchTopicMetadata, describeConfigs,
// listGroups, describeGroups, fetchOffsets, fetchTopicOffsets,
// describeCluster) plus a short-lived consumer that never commits offsets.
// No createTopics / deleteTopics / alterConfigs / commitOffsets / produce
// call exists anywhere in this file — that is the enforcement mechanism,
// not a runtime flag.

const brokers = (process.env.KAFKA_BROKERS || "localhost:9092")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const ssl = ["1", "true", "yes"].includes((process.env.KAFKA_SSL || "").toLowerCase());

const sasl = process.env.KAFKA_SASL_MECHANISM
  ? {
      mechanism: process.env.KAFKA_SASL_MECHANISM,
      username: process.env.KAFKA_SASL_USERNAME || "",
      password: process.env.KAFKA_SASL_PASSWORD || "",
    }
  : undefined;

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || "kafka-mcp-readonly",
  brokers,
  ssl,
  sasl,
  connectionTimeout: Number(process.env.KAFKA_CONNECTION_TIMEOUT_MS || 8000),
  requestTimeout: Number(process.env.KAFKA_REQUEST_TIMEOUT_MS || 15000),
  logLevel: logLevel.NOTHING,
});

async function withAdmin(fn) {
  const admin = kafka.admin();
  await admin.connect();
  try {
    return await fn(admin);
  } finally {
    await admin.disconnect().catch(() => {});
  }
}

function validateName(name, label) {
  if (!name || typeof name !== "string" || !/^[A-Za-z0-9._-]{1,249}$/.test(name)) {
    throw new Error(`invalid ${label}: ${JSON.stringify(name)}`);
  }
  return name;
}

function clamp(n, def, max) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return def;
  return Math.min(Math.floor(v), max);
}

const server = new McpServer({ name: "kafka-mcp", version: "1.0.0" });

server.tool(
  "kafka_list_brokers",
  "List Kafka brokers in the cluster, plus controller and cluster id (read-only).",
  {},
  async () => {
    const info = await withAdmin((a) => a.describeCluster());
    return { content: [{ type: "text", text: JSON.stringify(info, null, 2) }] };
  }
);

server.tool(
  "kafka_list_topics",
  "List topic names, optionally filtered by a case-insensitive substring.",
  { filter: z.string().optional().describe("Substring to match against topic names") },
  async ({ filter }) => {
    const topics = await withAdmin((a) => a.listTopics());
    const result = filter
      ? topics.filter((t) => t.toLowerCase().includes(filter.toLowerCase()))
      : topics;
    return { content: [{ type: "text", text: JSON.stringify({ count: result.length, topics: result }, null, 2) }] };
  }
);

server.tool(
  "kafka_describe_topic",
  "Describe a topic: partitions, leaders, replicas, ISR, and topic-level config.",
  { topic: z.string().describe("Exact topic name") },
  async ({ topic }) => {
    const name = validateName(topic, "topic");
    const [metadata, configs] = await withAdmin(async (a) => [
      await a.fetchTopicMetadata({ topics: [name] }),
      await a
        .describeConfigs({ resources: [{ type: 2, name }], includeSynonyms: false })
        .catch(() => null),
    ]);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ metadata: metadata.topics[0], config: configs?.resources?.[0]?.configEntries ?? null }, null, 2),
        },
      ],
    };
  }
);

server.tool(
  "kafka_list_partitions",
  "List partitions for a topic (id, leader, replicas, ISR) without full config detail.",
  { topic: z.string().describe("Exact topic name") },
  async ({ topic }) => {
    const name = validateName(topic, "topic");
    const metadata = await withAdmin((a) => a.fetchTopicMetadata({ topics: [name] }));
    const partitions = metadata.topics[0]?.partitions ?? [];
    return { content: [{ type: "text", text: JSON.stringify({ topic: name, partitionCount: partitions.length, partitions }, null, 2) }] };
  }
);

server.tool(
  "kafka_search_topic_metadata",
  "Search topics by substring/regex and return metadata (partitions + config) for each match, capped to `limit` topics.",
  {
    pattern: z.string().describe("Substring or regex to match topic names"),
    regex: z.boolean().optional().describe("Treat `pattern` as a regex (default: substring match)"),
    limit: z.number().optional().describe("Max topics to describe in detail (default 10, max 25)"),
  },
  async ({ pattern, regex, limit }) => {
    const all = await withAdmin((a) => a.listTopics());
    const cap = clamp(limit, 10, 25);
    const matcher = regex ? new RegExp(pattern, "i") : null;
    const matched = all
      .filter((t) => (matcher ? matcher.test(t) : t.toLowerCase().includes(pattern.toLowerCase())))
      .slice(0, cap);
    if (matched.length === 0) {
      return { content: [{ type: "text", text: JSON.stringify({ matchCount: 0, topics: [] }, null, 2) }] };
    }
    const metadata = await withAdmin((a) => a.fetchTopicMetadata({ topics: matched }));
    return { content: [{ type: "text", text: JSON.stringify({ matchCount: matched.length, topics: metadata.topics }, null, 2) }] };
  }
);

server.tool(
  "kafka_list_consumer_groups",
  "List consumer group ids and their protocol type.",
  {},
  async () => {
    const groups = await withAdmin((a) => a.listGroups());
    return { content: [{ type: "text", text: JSON.stringify(groups, null, 2) }] };
  }
);

server.tool(
  "kafka_describe_consumer_group",
  "Describe a consumer group: state, protocol, and members.",
  { groupId: z.string().describe("Exact consumer group id") },
  async ({ groupId }) => {
    const id = validateName(groupId, "groupId");
    const desc = await withAdmin((a) => a.describeGroups([id]));
    return { content: [{ type: "text", text: JSON.stringify(desc.groups[0], null, 2) }] };
  }
);

server.tool(
  "kafka_consumer_offsets",
  "Show committed offsets for a consumer group, optionally scoped to one topic.",
  {
    groupId: z.string().describe("Exact consumer group id"),
    topic: z.string().optional().describe("Restrict to a single topic; omit for all topics the group has committed offsets for"),
  },
  async ({ groupId, topic }) => {
    const id = validateName(groupId, "groupId");
    const topics = topic ? [validateName(topic, "topic")] : undefined;
    const offsets = await withAdmin((a) => a.fetchOffsets({ groupId: id, topics }));
    return { content: [{ type: "text", text: JSON.stringify(offsets, null, 2) }] };
  }
);

server.tool(
  "kafka_consumer_lag",
  "Compute per-partition consumer lag (high-watermark minus committed offset) for a group, optionally scoped to one topic.",
  {
    groupId: z.string().describe("Exact consumer group id"),
    topic: z.string().optional().describe("Restrict to a single topic; omit for all topics the group has committed offsets for"),
  },
  async ({ groupId, topic }) => {
    const id = validateName(groupId, "groupId");
    const topics = topic ? [validateName(topic, "topic")] : undefined;
    const committed = await withAdmin((a) => a.fetchOffsets({ groupId: id, topics }));
    const result = [];
    for (const topicOffsets of committed) {
      const highWatermarks = await withAdmin((a) => a.fetchTopicOffsets(topicOffsets.topic));
      const hwByPartition = Object.fromEntries(highWatermarks.map((p) => [p.partition, Number(p.high)]));
      const partitions = topicOffsets.partitions.map((p) => {
        const high = hwByPartition[p.partition];
        const committedOffset = Number(p.offset);
        return {
          partition: p.partition,
          committedOffset,
          highWatermark: high,
          lag: Number.isFinite(high) && committedOffset >= 0 ? Math.max(0, high - committedOffset) : null,
        };
      });
      result.push({ topic: topicOffsets.topic, partitions });
    }
    return { content: [{ type: "text", text: JSON.stringify({ groupId: id, topics: result }, null, 2) }] };
  }
);

server.tool(
  "kafka_consume_recent",
  "Peek the most recent N messages of a topic (best-effort, ~4s window). Read-only: uses a throwaway consumer group and never commits offsets.",
  {
    topic: z.string().describe("Exact topic name"),
    max: z.number().optional().describe("Max messages to return (default 10, max 100)"),
    partition: z.number().optional().describe("Restrict to a single partition"),
  },
  async ({ topic, max, partition }) => {
    const name = validateName(topic, "topic");
    const count = clamp(max, 10, 100);
    const offsets = await withAdmin((a) => a.fetchTopicOffsets(name));
    const targetPartitions = partition !== undefined ? offsets.filter((o) => o.partition === partition) : offsets;

    const consumer = kafka.consumer({
      groupId: `mcp-readonly-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    });
    await consumer.connect();
    await consumer.subscribe({ topic: name, fromBeginning: false });

    const messages = [];
    await consumer.run({
      autoCommit: false,
      eachMessage: async ({ partition: p, message }) => {
        messages.push({
          partition: p,
          offset: message.offset,
          key: message.key?.toString() ?? null,
          value: message.value?.toString()?.slice(0, 2000) ?? null,
          timestamp: message.timestamp,
        });
      },
    });

    const perPartition = Math.max(1, Math.ceil(count / Math.max(1, targetPartitions.length)));
    for (const o of targetPartitions) {
      consumer.seek({
        topic: name,
        partition: o.partition,
        offset: String(Math.max(Number(o.low), Number(o.high) - perPartition)),
      });
    }
    await new Promise((r) => setTimeout(r, 4000));
    await consumer.disconnect().catch(() => {});

    return { content: [{ type: "text", text: JSON.stringify({ topic: name, returned: messages.slice(0, count).length, messages: messages.slice(0, count) }, null, 2) }] };
  }
);

await server.connect(new StdioServerTransport());
