/**
 * URL parsing utilities using modern WHATWG URL API
 * Replacement for deprecated url.parse() usage
 */

export interface ParsedUrl {
    pathname: string;
    query: Record<string, string | string[]>;
    search: string;
    hash: string;
}

export class UrlUtils {
    /**
     * Parse URL using modern WHATWG URL API
     * Safe replacement for deprecated url.parse()
     */
    public static parseUrl(urlString: string, baseUrl = 'http://localhost'): ParsedUrl {
        try {
            const url = new URL(urlString, baseUrl);

            // Convert URLSearchParams to Record format
            const query: Record<string, string | string[]> = {};
            for (const [key, value] of url.searchParams.entries()) {
                if (query[key]) {
                    // Handle multiple values for the same parameter
                    if (Array.isArray(query[key])) {
                        (query[key] as string[]).push(value);
                    } else {
                        query[key] = [query[key] as string, value];
                    }
                } else {
                    query[key] = value;
                }
            }

            return {
                pathname: url.pathname,
                query,
                search: url.search,
                hash: url.hash,
            };
        } catch (error) {
            // Fallback parsing for malformed URLs
            return UrlUtils.fallbackParseUrl(urlString);
        }
    }

    /**
     * Fallback URL parsing for malformed URLs
     * Does not use any deprecated APIs
     */
    private static fallbackParseUrl(urlString: string): ParsedUrl {
        // Manual parsing without deprecated url.parse()
        const hashIndex = urlString.indexOf('#');
        const hash = hashIndex !== -1 ? urlString.substring(hashIndex) : '';
        const urlWithoutHash = hashIndex !== -1 ? urlString.substring(0, hashIndex) : urlString;

        const queryIndex = urlWithoutHash.indexOf('?');
        const pathname = queryIndex !== -1 ? urlWithoutHash.substring(0, queryIndex) : urlWithoutHash;
        const search = queryIndex !== -1 ? urlWithoutHash.substring(queryIndex) : '';

        // Parse query string manually
        const query: Record<string, string | string[]> = {};
        if (search) {
            try {
                // Remove leading '?' and parse with URLSearchParams
                const searchParams = new URLSearchParams(search.substring(1));
                for (const [key, value] of searchParams.entries()) {
                    if (query[key]) {
                        if (Array.isArray(query[key])) {
                            (query[key] as string[]).push(value);
                        } else {
                            query[key] = [query[key] as string, value];
                        }
                    } else {
                        query[key] = value;
                    }
                }
            } catch {
                // If URLSearchParams fails, leave query empty
            }
        }

        return {
            pathname: decodeURIComponent(pathname || '/'),
            query,
            search,
            hash,
        };
    }

    /**
     * Validate URL format without deprecated APIs
     */
    public static isValidUrl(urlString: string): boolean {
        try {
            new URL(urlString);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Join URL paths safely
     */
    public static joinPaths(...paths: string[]): string {
        return paths
            .map(path => path.replace(/^\/+|\/+$/g, '')) // Remove leading/trailing slashes
            .filter(path => path.length > 0)
            .join('/');
    }

    /**
     * Build query string from object
     */
    public static buildQueryString(params: Record<string, string | string[] | number | boolean>): string {
        const searchParams = new URLSearchParams();

        for (const [key, value] of Object.entries(params)) {
            if (Array.isArray(value)) {
                value.forEach(v => searchParams.append(key, String(v)));
            } else {
                searchParams.set(key, String(value));
            }
        }

        return searchParams.toString();
    }
}