/**
 * Shared skills-layer metadata and injection types.
 */

export interface SkillMeta {
  name: string;
  version: string;
  tags: string[];
}

export interface LoadedSkillFile {
  path: string;
  content: string;
  skill_name: string;
  activation_reason: string;
}

export interface SkillManifest {
  declared_skills: string[];
  loaded_skills: string[];
  missing_skills: string[];
  activation_reason: "declared" | "auto-matched";
  generation_timestamp: string;
}

export interface SkillInjection {
  manifest: SkillManifest;
  loadedFiles: LoadedSkillFile[];
}
