import * as fs from "fs";
import * as path from "path";
import { parseFrontmatter } from "./parse.ts";
import { resolveFactoryRoot } from "./factory-environment.ts";
import {
  type PlanningDraftValidationRecord,
  type TaskDraftCommitStage,
  type TaskPlanningDraft,
} from "./planning-draft.ts";
import type { TaskMeta } from "./parse.ts";
import { renderTaskDraftTarget } from "./task-markdown-renderer.ts";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface TaskDraftValidationResult extends ValidationResult {
  draft_id: string;
  target_stage: TaskDraftCommitStage;
  target_path: string;
}

export interface ValidateTaskOptions {
  factoryRoot?: string;
}

export const REQUIRED_FIELDS: Array<keyof TaskMeta> = [
  "id",
  "title",
  "project",
  "status",
  "agent",
];

function validateTaskCapabilityMetadata(meta: Partial<TaskMeta>): string[] {
  const errors: string[] = [];

  if (
    meta.required_tier !== undefined &&
    typeof meta.required_tier === "string" &&
    meta.required_tier.trim() === ""
  ) {
    errors.push('Task capability metadata "required_tier" cannot be empty');
  }

  if (!Array.isArray(meta.required_features)) {
    return errors;
  }

  for (const [index, feature] of meta.required_features.entries()) {
    if (typeof feature !== "string" || feature.trim() === "") {
      errors.push(
        `Task capability metadata "required_features" entry ${index + 1} must be a non-empty string`
      );
    }
  }

  return errors;
}

function validateTaskSkillsMetadata(
  meta: Partial<TaskMeta>,
  options: ValidateTaskOptions
): Pick<ValidationResult, "errors" | "warnings"> {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (meta.skills === undefined) {
    return { errors, warnings };
  }

  if (!Array.isArray(meta.skills)) {
    errors.push('Task metadata "skills" must be an array of non-empty skill names');
    return { errors, warnings };
  }

  const declaredSkills: string[] = [];
  for (const [index, skillName] of meta.skills.entries()) {
    if (typeof skillName !== "string" || skillName.trim() === "") {
      errors.push(
        `Task metadata "skills" entry ${index + 1} must be a non-empty string`
      );
      continue;
    }
    declaredSkills.push(skillName.trim());
  }

  if (errors.length > 0 || declaredSkills.length === 0) {
    return { errors, warnings };
  }

  const resolvedFactoryRoot = options.factoryRoot ?? resolveFactoryRoot().root;
  const skillsRoot = path.join(resolvedFactoryRoot, "skills");

  // Soft validation: skip existence checks when no skills root is available.
  if (!fs.existsSync(skillsRoot) || !fs.statSync(skillsRoot).isDirectory()) {
    return { errors, warnings };
  }

  for (const skillName of declaredSkills) {
    const skillDirectory = path.join(skillsRoot, skillName);
    if (!fs.existsSync(skillDirectory) || !fs.statSync(skillDirectory).isDirectory()) {
      warnings.push(
        `Task metadata "skills" references unknown skill "${skillName}" (expected directory: skills/${skillName})`
      );
    }
  }

  return { errors, warnings };
}

export function validateTask(
  meta: Partial<TaskMeta>,
  expectedStatus: string,
  options: ValidateTaskOptions = {}
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const field of REQUIRED_FIELDS) {
    const value = meta[field];
    if (value === undefined || value === null || String(value).trim() === "") {
      errors.push(`Missing required field: "${field}"`);
    }
  }

  if (meta.status && meta.status !== expectedStatus) {
    errors.push(`Expected status "${expectedStatus}", got "${meta.status}"`);
  }

  errors.push(...validateTaskCapabilityMetadata(meta));
  const skillsValidation = validateTaskSkillsMetadata(meta, options);
  errors.push(...skillsValidation.errors);
  warnings.push(...skillsValidation.warnings);

  return { valid: errors.length === 0, errors, warnings };
}

const REQUIRED_BODY_SECTIONS = [
  "## Goal",
  "## Context",
  "## Acceptance Criteria",
  "## Expected Artifacts",
  "## Failure Conditions",
] as const;

function extractSectionContent(body: string, heading: string): string[] {
  const lines = body.split("\n");
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) return [];

  const content: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (line.startsWith("## ") || line.startsWith("# ")) break;
    if (line.trim()) content.push(line.trim());
  }
  return content;
}

export function validateTaskBody(body: string): Pick<ValidationResult, "errors" | "warnings"> {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const section of REQUIRED_BODY_SECTIONS) {
    if (!body.includes(section)) {
      errors.push(`Missing required section: "${section}"`);
    }
  }

  const criteriaContent = extractSectionContent(body, "## Acceptance Criteria");
  const criteriaItems = criteriaContent.filter((line) => line.startsWith("- "));
  if (criteriaItems.length === 0 && body.includes("## Acceptance Criteria")) {
    errors.push(`"## Acceptance Criteria" has no items — add at least one "- " line`);
  }

  if (!body.includes("## Reviewer Checklist")) {
    warnings.push(`"## Reviewer Checklist" section is missing — consider adding one`);
  } else {
    const checklistContent = extractSectionContent(body, "## Reviewer Checklist");
    const checklistItems = checklistContent.filter((line) => line.startsWith("- "));
    if (checklistItems.length === 0) {
      warnings.push(`"## Reviewer Checklist" has no items`);
    }
  }

  return { errors, warnings };
}

export function validateTaskMarkdown(
  markdown: string,
  expectedStatus?: string,
  options: ValidateTaskOptions = {}
): ValidationResult {
  const { meta, body } = parseFrontmatter(markdown);
  const statusToCheck = expectedStatus ?? meta.status ?? "";
  const frontmatterResult = validateTask(meta, statusToCheck, options);
  const bodyResult = validateTaskBody(body);
  const errors = [...frontmatterResult.errors, ...bodyResult.errors];
  const warnings = [...frontmatterResult.warnings, ...bodyResult.warnings];

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function validateTaskDraft(
  draft: TaskPlanningDraft,
  expectedStatus?: TaskDraftCommitStage
): TaskDraftValidationResult {
  const rendered = renderTaskDraftTarget(draft);
  const targetStage = expectedStatus ?? rendered.target_stage;
  const validation = validateTaskMarkdown(rendered.markdown, targetStage);

  return {
    ...validation,
    draft_id: draft.draft_id,
    target_stage: targetStage,
    target_path: rendered.target_path,
  };
}

export function toPlanningDraftValidationRecord(
  result: Pick<ValidationResult, "errors" | "warnings">
): PlanningDraftValidationRecord {
  return {
    status: result.errors.length === 0 ? "valid" : "invalid",
    errors: [...result.errors],
    warnings: [...result.warnings],
  };
}

export function applyTaskDraftValidation(
  draft: TaskPlanningDraft,
  expectedStatus?: TaskDraftCommitStage
): TaskPlanningDraft {
  const result = validateTaskDraft(draft, expectedStatus);
  return {
    ...draft,
    validation: toPlanningDraftValidationRecord(result),
  };
}
