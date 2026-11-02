import { loadQuery, usePreloadedQuery, type PreloadedQuery } from 'react-relay';
import type { GraphQLTaggedNode, OperationType } from 'relay-runtime';
import { useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { environment } from '../relay/environment.ts';

const KEEP_PER_ROUTE = 3;

// Route loaders start the query as navigation begins, while the route's code is still loading,
// so data and code arrive together (render-as-you-fetch). Each route keeps its few most recent
// query references and releases older ones, so the store stays bounded without ever releasing
// a query that is still on screen.
export function queryLoader<T extends OperationType>(
  query: GraphQLTaggedNode,
  variables: (args: LoaderFunctionArgs) => T['variables'] = () => ({}) as T['variables'],
  fetchPolicy: 'store-or-network' | 'store-and-network' | 'network-only' = 'store-or-network',
) {
  const issued: PreloadedQuery<T>[] = [];
  return (args: LoaderFunctionArgs): PreloadedQuery<T> => {
    const ref = loadQuery<T>(environment, query, variables(args), { fetchPolicy });
    issued.push(ref);
    while (issued.length > KEEP_PER_ROUTE) issued.shift()?.dispose();
    return ref;
  };
}

export function useRouteQuery<T extends OperationType>(query: GraphQLTaggedNode): T['response'] {
  return usePreloadedQuery<T>(query, useLoaderData() as PreloadedQuery<T>);
}
