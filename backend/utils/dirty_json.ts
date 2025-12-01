/**
 * The result of a parsing operation, which can either succeed or fail.
 * - On success, it contains a `data` key with the parsed JSON.
 * - On failure, it contains an `error` key with a descriptive message.
 */
type ParseResult = { data: any; error?: undefined } | { error: string; data?: undefined };

/**
 * Flexibly extracts and parses the first valid JSON object or array from a raw,
 * potentially "dirty" string. It handles embedded JSON, markdown blocks, and
 * surrounding text by finding a balanced structure.
 *
 * It iterates through the string to find the first balanced and parsable JSON
 * structure. If it encounters balanced but malformed JSON, it will store the
 * parsing error. If no valid JSON is found, it returns the stored error if
- * available, providing more specific feedback.
 *
 * @param text The raw string that may contain a JSON object or array.
 * @returns An object with a `data` key containing the parsed JSON if successful,
 *          or an `error` key with a message if parsing fails.
 */
export function parseDirtyJson(text: string): ParseResult {
    if (!text || typeof text !== 'string') {
        return { error: "Input must be a non-empty string." };
    }

    let lastParseError: string | null = null;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];

        if (char === '{' || char === '[') {
            const startChar = char;
            const endChar = startChar === '{' ? '}' : ']';
            let balance = 1;

            // Scan forward to find the matching, balanced closing character.
            for (let j = i + 1; j < text.length; j++) {
                if (text[j] === startChar) {
                    balance++;
                } else if (text[j] === endChar) {
                    balance--;
                }

                if (balance === 0) {
                    const potentialJson = text.substring(i, j + 1);
                    try {
                        const parsedJson = JSON.parse(potentialJson);
                        // First valid JSON found, return immediately.
                        return { data: parsedJson };
                    } catch (e) {
                        const error = e instanceof Error ? e.message : String(e);
                        // Found a balanced but malformed JSON. Store this error.
                        // We'll continue searching for a valid one, but if none is found,
                        // this error is more useful than a generic "not found" message.
                        lastParseError = `Malformed JSON found. Details: ${error}`;

                        // Skip ahead to avoid re-parsing subsets of this invalid block.
                        i = j;
                        break; // Exit inner loop and continue outer loop.
                    }
                }
            }
        }
    }

    // If we finished the loop, no valid JSON was parsed.
    // Return the last parsing error we found, or a generic error if none.
    if (lastParseError) {
        return { error: lastParseError };
    }

    return { error: "No valid JSON object or array found in the string." };
}