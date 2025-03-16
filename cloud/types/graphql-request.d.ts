declare module 'graphql-request' {
  export class GraphQLClient {
    constructor(url: string, options?: { timeout?: number });
    request<T = any>(query: string, variables?: Record<string, any>): Promise<T>;
  }
  export const gql: (template: TemplateStringsArray, ...expressions: any[]) => string;
}
