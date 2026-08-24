declare module "cloudflare:workers" {
  export interface Env { ASSETS: Fetcher; DB?: D1Database }
  export const env: Env;
}
interface Fetcher { fetch(input: Request | string, init?: RequestInit): Promise<Response> }
interface D1Database {}
