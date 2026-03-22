export const EXCLUDED_RESOURCE_HOSTS = [
  "figma.com",
  "drive.google.com",
  "docs.google.com",
];

export function hasHttpProtocol(value = "") {
  return /^https?:\/\//i.test(value);
}

export function normalizeCandidate(value = "") {
  return value.trim().replace(/[),.;]+$/g, "");
}

export function normalizeResourceUrl(value = "") {
  const candidate = normalizeCandidate(value);
  if (!hasHttpProtocol(candidate)) {
    return "";
  }

  try {
    const parsed = new globalThis.URL(candidate);
    parsed.hash = "";

    if (parsed.pathname !== "/") {
      parsed.pathname = parsed.pathname.replace(/\/+$/g, "");
    }

    return parsed.toString();
  } catch {
    return "";
  }
}

export function isExcludedResourceHost(hostname = "") {
  const cleanHost = hostname.toLowerCase();
  return EXCLUDED_RESOURCE_HOSTS.some(
    (excluded) => cleanHost === excluded || cleanHost.endsWith(`.${excluded}`),
  );
}

export function isResourceUrl(url = "") {
  const normalized = normalizeResourceUrl(url);
  if (!normalized) {
    return false;
  }

  try {
    const hostname = new globalThis.URL(normalized).hostname;
    return !isExcludedResourceHost(hostname);
  } catch {
    return false;
  }
}

export function getResourceHost(url = "") {
  try {
    return new globalThis.URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

export function getWeekNumberFromContentPath(contentPath = "") {
  const match = contentPath.match(/[\\/]weeks[\\/]week-(\d+)\.md$/i);
  return match ? Number(match[1]) : null;
}
