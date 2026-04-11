interface GitHubCommentLike {
  user?: { login?: string };
  body?: string;
}

const AC_SECTION_HEADER = /^##\s*(acceptance criteria|ac|definition of done|dod)\s*$/i;
const NEXT_SECTION_HEADER = /^##\s+/i;

function cleanBullet(line: string): string | null {
  const trimmed = line.trim();
  if (!/^[-*]\s+/.test(trimmed)) return null;
  const cleaned = trimmed.replace(/^[-*]\s+/, "").trim();
  return cleaned.length > 0 ? cleaned : null;
}

function isBadgeOnly(body: string): boolean {
  const normalized = body.trim();
  if (normalized === "") return true;
  return /^\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)$/i.test(normalized);
}

export function extractAcceptanceCriteria(body: string): string[] {
  if (!body || typeof body !== "string") return [];

  const lines = body.split(/\r?\n/);
  let inAcSection = false;
  const items: string[] = [];

  for (const line of lines) {
    if (!inAcSection && AC_SECTION_HEADER.test(line.trim())) {
      inAcSection = true;
      continue;
    }

    if (inAcSection && NEXT_SECTION_HEADER.test(line.trim())) {
      break;
    }

    if (inAcSection) {
      const bullet = cleanBullet(line);
      if (bullet) items.push(bullet);
    }
  }

  return items;
}

export function filterPlanningComments(comments: GitHubCommentLike[]): string[] {
  return comments
    .filter((comment) => {
      const login = (comment.user?.login ?? "").toLowerCase();
      if (login.endsWith("[bot]")) return false;
      const body = typeof comment.body === "string" ? comment.body : "";
      if (isBadgeOnly(body)) return false;
      return true;
    })
    .map((comment) => (typeof comment.body === "string" ? comment.body.trim() : ""))
    .filter((body) => body.length > 0);
}
