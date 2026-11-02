import { Environment, Network, RecordSource, Store, type FetchFunction, type GraphQLResponse } from 'relay-runtime';

export class NetworkError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Sends only the persisted query id; the server knows the text from the build.
const fetchGraphQL: FetchFunction = async (params, variables) => {
  const res = await fetch('/graphql', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', 'x-tenuro-client': 'web' },
    body: JSON.stringify(params.id ? { id: params.id, variables } : { query: params.text, variables }),
  });
  if (!res.ok && res.status !== 200) {
    throw new NetworkError(res.status, res.status === 429 ? 'rate-limited' : `HTTP ${res.status}`);
  }
  const json = (await res.json()) as GraphQLResponse;
  if ('errors' in json && Array.isArray(json.errors) && json.errors.length && !('data' in json && json.data)) {
    throw new Error(json.errors.map((e) => e.message).join('; '));
  }
  return json;
};

export function createEnvironment(): Environment {
  return new Environment({
    network: Network.create(fetchGraphQL),
    store: new Store(new RecordSource(), { gcReleaseBufferSize: 10, queryCacheExpirationTime: 5 * 60_000 }),
  });
}

// One store per page load. Signing in, out or as someone else reloads the page, so no cached data
// from one account can ever be shown to another.
export const environment = createEnvironment();
