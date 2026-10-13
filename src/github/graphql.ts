// Minimal GitHub GraphQL client. Retries transient failures and surfaces
// GitHub's RESOURCE_LIMITS_EXCEEDED as a typed error so callers can fall back
// to smaller windows (very active profiles trip it on wide date ranges).

const ENDPOINT = "https://api.github.com/graphql";

export class GithubError extends Error {
  constructor(
    message: string,
    readonly kind: "auth" | "notfound" | "resource" | "ratelimit" | "network",
  ) {
    super(message);
  }
}

export async function gql<T>(
  token: string,
  query: string,
  variables: Record<string, unknown> = {},
  attempts = 3,
): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await once<T>(token, query, variables);
    } catch (e) {
      last = e;
      const kind = (e as GithubError).kind;
      // Only network blips and 5xx are worth a retry; the rest fail the same way again.
      if (kind !== "network") throw e;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
  throw last;
}

async function once<T>(token: string, query: string, variables: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "fullpitch",
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch (e) {
    throw new GithubError(`GitHub unreachable: ${(e as Error).message}`, "network");
  }

  if (res.status === 401) throw new GithubError("GitHub rejected the token (401). Check the `token` input.", "auth");
  if (res.status === 403 || res.status === 429) throw new GithubError("GitHub rate limit hit.", "ratelimit");
  if (res.status >= 500) throw new GithubError(`GitHub returned ${res.status}.`, "network");

  const body = (await res.json()) as { data?: T; errors?: { type?: string; message: string }[] };
  if (body.errors?.length) {
    const err = body.errors[0];
    if (err.type === "RESOURCE_LIMITS_EXCEEDED" || /resource limits/i.test(err.message))
      throw new GithubError(err.message, "resource");
    if (err.type === "NOT_FOUND") throw new GithubError(err.message, "notfound");
    if (err.type === "RATE_LIMITED") throw new GithubError(err.message, "ratelimit");
    // Partial data (e.g. one inaccessible repo) is still useful; only bail when nothing came back.
    if (!body.data) throw new GithubError(err.message, "network");
  }
  return body.data as T;
}
