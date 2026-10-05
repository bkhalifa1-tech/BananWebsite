/** Resolve the public URL from trusted runtime configuration, never proxy headers. */
export function publicAppUrl(
  port: number,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (env.APP_URL) return new URL(env.APP_URL).origin;
  const name = env.CODESPACE_NAME,
    domain = env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN || "app.github.dev";
  if (
    env.CODESPACES === "true" &&
    name &&
    /^[a-z0-9][a-z0-9-]*$/.test(name) &&
    /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(domain)
  )
    return `https://${name}-${port}.${domain}`;
  return `http://localhost:${port}`;
}
