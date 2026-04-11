import type { ExternalWorkItem } from "@devory/core";
import {
  extractAcceptanceCriteria,
  filterPlanningComments,
} from "./issue-content-extractor.ts";

const GITHUB_ISSUE_URL = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)(?:\/)?(?:\?.*)?(?:#.*)?$/i;

function normalizeDescription(body: unknown): string {
  if (typeof body !== "string") return "";
  return body
    .replace(/<[^>]+>/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseIssueUrl(url: string): { owner: string; repo: string; number: string } | null {
  const match = url.trim().match(GITHUB_ISSUE_URL);
  if (!match) return null;
  return {
    owner: match[1],
    repo: match[2],
    number: match[3],
  };
}

export function isGitHubIssueUrl(url: string): boolean {
  return parseIssueUrl(url) !== null;
}

export async function fetchGitHubIssue(url: string): Promise<ExternalWorkItem> {
  const parsed = parseIssueUrl(url);
  if (!parsed) {
    throw new Error(`GitHub issue URL is invalid: ${url}`);
  }

  const token = process.env.GITHUB_TOKEN;
  if (typeof token !== "string" || token.trim() === "") {
    throw new Error("GITHUB_TOKEN is required to fetch GitHub issues");
  }

  const apiUrl = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/issues/${parsed.number}`;
  const response = await fetch(apiUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "devory-intake",
    },
  });

  if (response.status === 404) {
    throw new Error(`GitHub issue not found: ${url}`);
  }
  if (response.status === 401) {
    throw new Error("GitHub authentication failed — check GITHUB_TOKEN");
  }
  if (!response.ok) {
    throw new Error(`GitHub issue fetch failed (${response.status})`);
  }

  const payload = (await response.json()) as {
    title?: string;
    body?: string | null;
    html_url?: string;
    comments_url?: string;
    labels?: Array<{ name?: string }>;
  };

  let planningComments: string[] = [];
  if (typeof payload.comments_url === "string" && payload.comments_url.trim() !== "") {
    try {
      const commentsResponse = await fetch(payload.comments_url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "devory-intake",
        },
      });
      if (commentsResponse.ok) {
        const commentsPayload = (await commentsResponse.json()) as Array<{
          user?: { login?: string };
          body?: string;
        }>;
        planningComments = filterPlanningComments(commentsPayload);
      }
    } catch {
      // Comment fetch is best-effort; issue intake should still succeed without it.
    }
  }

  const normalizedBody = normalizeDescription(payload.body);
  const acceptanceCriteria = extractAcceptanceCriteria(normalizedBody);
  const description =
    planningComments.length > 0
      ? `${normalizedBody}\n\nPlanning comments:\n${planningComments
          .map((entry) => `- ${entry}`)
          .join("\n")}`
      : normalizedBody;

  return {
    source: "github-issue",
    key: `${parsed.owner}/${parsed.repo}#${parsed.number}`,
    url: payload.html_url ?? url,
    title: typeof payload.title === "string" && payload.title.trim() !== "" ? payload.title.trim() : `Issue ${parsed.number}`,
    description,
    acceptance_criteria: acceptanceCriteria,
    labels: Array.isArray(payload.labels)
      ? payload.labels
          .map((entry) => (typeof entry?.name === "string" ? entry.name.trim() : ""))
          .filter((entry) => entry !== "")
      : [],
    repo: `${parsed.owner}/${parsed.repo}`,
  };
}
