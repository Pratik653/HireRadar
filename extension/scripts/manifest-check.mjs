// The permission boundary the companion must keep. Used by build.mjs and the tests.
export function checkManifest(m) {
  const problems = [];
  if (m.manifest_version !== 3) problems.push("must be Manifest V3");
  if (JSON.stringify(m.permissions) !== JSON.stringify(["storage"])) problems.push("permissions must be exactly ['storage']");
  for (const key of ["host_permissions", "optional_permissions", "optional_host_permissions", "content_scripts", "web_accessible_resources"]) {
    if (m[key]) problems.push(`${key} is not allowed`);
  }
  const matches = m.externally_connectable?.matches ?? [];
  if (!matches.length || matches.some((x) => !/^https:\/\/pratik653\.github\.io\/\*$/.test(x))) {
    problems.push("externally_connectable must list only https://pratik653.github.io/*");
  }
  if (!/script-src 'self'/.test(m.content_security_policy?.extension_pages ?? "")) problems.push("extension CSP must restrict scripts to 'self'");
  if (!/^[A-Za-z0-9+/=]{300,}$/.test(m.key ?? "")) problems.push("key (public key that pins the extension ID) is missing");
  return problems;
}
