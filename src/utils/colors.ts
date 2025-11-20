/**
 * Generates a color palette for a given stream ID.
 * Uses a hash of the ID to select from a hardcoded Tailwind color palette.
 * Returns a base color and a set of shades.
 */

// Hardcoded Tailwind color palette
const TAILWIND_COLORS = [
    {
        base: '#ef4444', // red-500
        shades: {
            200: '#fecaca',
            300: '#fca5a5',
            500: '#ef4444',
            700: '#b91c1c',
        }
    },
    {
        base: '#f97316', // orange-500
        shades: {
            200: '#fed7aa',
            300: '#fdba74',
            500: '#f97316',
            700: '#c2410c',
        }
    },
    {
        base: '#eab308', // yellow-500
        shades: {
            200: '#fef08a',
            300: '#fde047',
            500: '#eab308',
            700: '#a16207',
        }
    },
    {
        base: '#84cc16', // lime-500
        shades: {
            200: '#d9f99d',
            300: '#bef264',
            500: '#84cc16',
            700: '#4d7c0f',
        }
    },
    {
        base: '#22c55e', // green-500
        shades: {
            200: '#bbf7d0',
            300: '#86efac',
            500: '#22c55e',
            700: '#15803d',
        }
    },
    {
        base: '#14b8a6', // teal-500
        shades: {
            200: '#99f6e4',
            300: '#5eead4',
            500: '#14b8a6',
            700: '#0f766e',
        }
    },
    {
        base: '#06b6d4', // cyan-500
        shades: {
            200: '#a5f3fc',
            300: '#67e8f9',
            500: '#06b6d4',
            700: '#0e7490',
        }
    },
    {
        base: '#3b82f6', // blue-500
        shades: {
            200: '#bfdbfe',
            300: '#93c5fd',
            500: '#3b82f6',
            700: '#1d4ed8',
        }
    },
    {
        base: '#6366f1', // indigo-500
        shades: {
            200: '#c7d2fe',
            300: '#a5b4fc',
            500: '#6366f1',
            700: '#4338ca',
        }
    },
    {
        base: '#8b5cf6', // violet-500
        shades: {
            200: '#ddd6fe',
            300: '#c4b5fd',
            500: '#8b5cf6',
            700: '#6d28d9',
        }
    },
    {
        base: '#a855f7', // purple-500
        shades: {
            200: '#e9d5ff',
            300: '#d8b4fe',
            500: '#a855f7',
            700: '#7e22ce',
        }
    },
    {
        base: '#ec4899', // pink-500
        shades: {
            200: '#fbcfe8',
            300: '#f9a8d4',
            500: '#ec4899',
            700: '#be185d',
        }
    },
];

export function getStreamColor(mediaId: string) {
    // Generate a deterministic hash from the mediaId
    let hash = 0;
    for (let i = 0; i < mediaId.length; i++) {
        hash = mediaId.charCodeAt(i) + ((hash << 5) - hash);
    }

    const index = Math.abs(hash) % TAILWIND_COLORS.length;
    return TAILWIND_COLORS[index] ?? TAILWIND_COLORS[0]!;
}
