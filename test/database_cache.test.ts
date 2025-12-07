import { expect, test, describe, beforeEach } from "bun:test";
import { DatabaseCache } from "../backend/database/cache";

describe("DatabaseCache", () => {
  let cache: DatabaseCache;

  beforeEach(() => {
    cache = new DatabaseCache();
  });

  test("should set and get values", () => {
    cache.set("test", "value");
    expect(cache.get<string>("test")).toBe("value");
  });

  test("should return undefined for non-existent keys", () => {
    expect(cache.get("nonexistent")).toBeUndefined();
  });

  test("should handle different data types", () => {
    cache.set("string", "hello");
    cache.set("number", 42);
    cache.set("boolean", true);
    cache.set("object", { key: "value" });
    cache.set("array", [1, 2, 3]);

    expect(cache.get<string>("string")).toBe("hello");
    expect(cache.get<number>("number")).toBe(42);
    expect(cache.get<boolean>("boolean")).toBe(true);
    expect(cache.get<any>("object")).toEqual({ key: "value" });
    expect(cache.get<any>("array")).toEqual([1, 2, 3]);
  });

  test("should overwrite existing values", () => {
    cache.set("key", "first");
    expect(cache.get<string>("key")).toBe("first");

    cache.set("key", "second");
    expect(cache.get<string>("key")).toBe("second");
  });

  test("should check if key exists", () => {
    expect(cache.has("nonexistent")).toBe(false);

    cache.set("exists", "value");
    expect(cache.has("exists")).toBe(true);
  });

  test("should delete existing keys", () => {
    cache.set("key", "value");
    expect(cache.has("key")).toBe(true);

    const deleted = cache.delete("key");
    expect(deleted).toBe(true);
    expect(cache.has("key")).toBe(false);
    expect(cache.get("key")).toBeUndefined();
  });

  test("should return false when deleting non-existent keys", () => {
    const deleted = cache.delete("nonexistent");
    expect(deleted).toBe(false);
  });

  test("should clear all entries", () => {
    cache.set("key1", "value1");
    cache.set("key2", "value2");
    cache.set("key3", "value3");

    expect(cache.size()).toBe(3);

    cache.clear();

    expect(cache.size()).toBe(0);
    expect(cache.get("key1")).toBeUndefined();
    expect(cache.get("key2")).toBeUndefined();
    expect(cache.get("key3")).toBeUndefined();
  });

  test("should clear keys with specific prefix", () => {
    cache.set("agents:all", "agentData");
    cache.set("agents:1", "agent1");
    cache.set("agents:2", "agent2");
    cache.set("metrics:1", "metric1");
    cache.set("metrics:2", "metric2");
    cache.set("embeddings:1:type1", "embedding1");
    cache.set("other:key", "other");

    expect(cache.size()).toBe(7);

    cache.clearPrefix("agents:");

    expect(cache.size()).toBe(4);
    expect(cache.has("agents:all")).toBe(false);
    expect(cache.has("agents:1")).toBe(false);
    expect(cache.has("agents:2")).toBe(false);
    expect(cache.has("metrics:1")).toBe(true);
    expect(cache.has("metrics:2")).toBe(true);
    expect(cache.has("embeddings:1:type1")).toBe(true);
    expect(cache.has("other:key")).toBe(true);
  });

  test("should handle empty prefix", () => {
    cache.set("key1", "value1");
    cache.set("key2", "value2");

    cache.clearPrefix("");

    // Should clear all keys since all keys start with empty string
    expect(cache.size()).toBe(0);
  });

  test("should handle non-existent prefix", () => {
    cache.set("key1", "value1");
    cache.set("key2", "value2");

    const originalSize = cache.size();

    cache.clearPrefix("nonexistent:");

    expect(cache.size()).toBe(originalSize);
  });

  test("should handle null and undefined values", () => {
    cache.set("null", null);
    cache.set("undefined", undefined);

    expect(cache.get("null")).toBeNull();
    expect(cache.get("undefined")).toBeUndefined();
  });

  test("should handle empty string keys", () => {
    cache.set("", "empty key");
    expect(cache.get<string>("")).toBe("empty key");
    expect(cache.has("")).toBe(true);
  });

  test("should handle special characters in keys", () => {
    const specialKey = "key:with:colons-and-dashes_underscores.123";
    cache.set(specialKey, "value");
    expect(cache.get<string>(specialKey)).toBe("value");
  });

  test("should handle many entries efficiently", () => {
    // Add many entries
    for (let i = 0; i < 1000; i++) {
      cache.set(`key${i}`, `value${i}`);
    }

    expect(cache.size()).toBe(1000);

    // Verify random access
    expect(cache.get<string>("key0")).toBe("value0");
    expect(cache.get<string>("key999")).toBe("value999");
    expect(cache.get<string>("key500")).toBe("value500");
  });

  test("should handle prefix clearing on many entries", () => {
    // Add entries with different prefixes
    for (let i = 0; i < 100; i++) {
      cache.set(`agents:${i}`, `agent${i}`);
      cache.set(`metrics:${i}`, `metric${i}`);
      cache.set(`embeddings:${i}`, `embedding${i}`);
    }

    expect(cache.size()).toBe(300);

    cache.clearPrefix("agents:");

    expect(cache.size()).toBe(200);
    expect(cache.keys().filter(key => key.startsWith("agents:"))).toHaveLength(0);
    expect(cache.keys().filter(key => key.startsWith("metrics:"))).toHaveLength(100);
    expect(cache.keys().filter(key => key.startsWith("embeddings:"))).toHaveLength(100);
  });

  test("should handle agent cache keys", () => {
    const agents = [{ id: "1", name: "Agent 1" }, { id: "2", name: "Agent 2" }];

    cache.set("agents:all", agents);
    expect(cache.get<any>("agents:all")).toEqual(agents);
  });

  test("should handle metric cache keys", () => {
    const metric = { id: "1", entailment: "test", contradiction: "test" };

    cache.set("metrics:1", metric);
    expect(cache.get<any>("metrics:1")).toEqual(metric);
  });

  test("should handle embedding cache keys", () => {
    const embedding = { id: "1", value: [1, 2, 3], type: "test" };

    cache.set("embeddings:ref1:type1", embedding);
    expect(cache.get<any>("embeddings:ref1:type1")).toEqual(embedding);
  });
});