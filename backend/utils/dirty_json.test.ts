import { describe, it, expect } from "bun:test";
import { parseDirtyJson } from "./dirty_json";

describe("parseDirtyJson", () => {
    it("should parse valid JSON object", () => {
        const input = '{"key": "value"}';
        const result = parseDirtyJson(input);
        expect(result).toEqual({ data: { key: "value" } });
    });

    it("should parse valid JSON array", () => {
        const input = '[1, 2, 3]';
        const result = parseDirtyJson(input);
        expect(result).toEqual({ data: [1, 2, 3] });
    });

    it("should extract JSON from dirty string", () => {
        const input = 'Some text before {"key": "value"} and after';
        const result = parseDirtyJson(input);
        expect(result).toEqual({ data: { key: "value" } });
    });

    it("should return error for invalid input", () => {
        const input = "not json";
        const result = parseDirtyJson(input);
        expect(result.error).toBeDefined();
    });

    it("should handle the provided JSON data", () => {
        const input = `{
    "image": [
        {
            "image_url": "https://i.imgur.com/25/11/2511.jpg",
            "description": "A group of people are standing in line at a counter. The counter has a sign that says 'Clerks' on it. There is a fence in the foreground and a building in the background. The people in line are wearing different colored clothing. There are yellow buckets and shovels near the fence."
        },
        {
            "image_url": "https://i.imgur.com/25/11/2511.jpg",
            "description": "A group of people are standing in line at a counter. The counter has a sign that says 'Clerks' on it. There is a fence in the foreground and a building in the background. The people in line are wearing different colored clothing. There are yellow buckets and shovels near the fence. The time stamp on the image is 25/11/2015 04:47 PM."
        }
    ]
}`;
        const result = parseDirtyJson(input);
        expect(result.data).toBeDefined();
        expect(result.data.image).toHaveLength(2);
    });

    it("should return error for empty string", () => {
        const input = "";
        const result = parseDirtyJson(input);
        expect(result.error).toBe("Input must be a non-empty string.");
    });

    it("should return error for non-string input", () => {
        const input = 123 as any;
        const result = parseDirtyJson(input);
        expect(result.error).toBe("Input must be a non-empty string.");
    });
});