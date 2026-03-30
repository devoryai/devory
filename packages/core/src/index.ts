/**
 * @devory/core — public API
 *
 * Shared types, parsing utilities, and path configuration
 * for the AI Dev Factory monorepo.
 */

export { parseFrontmatter } from "./parse.ts";
export {
  clearLicenseCache,
  clearLicenseToken,
  detectTier,
  getLicenseCacheFilePath,
  getLicenseFilePath,
  getLicenseStatus,
  isFeatureEnabled,
  tierGateMessage,
  writeLicenseToken,
} from "./license.ts";
export type { Tier, ProFeature, LicenseInfo, LicenseStatus } from "./license.ts";
export {
  loadStandards,
  loadBaseline,
  mergeStandards,
  resolveBaselinePath,
  serializeStandardsAsDoctrine,
  STANDARDS_FILENAME,
} from "./standards.ts";
export type {
  Standards,
  StandardsStack,
  StandardsTesting,
  StandardsArchitecture,
  StandardsCodeStyle,
  StandardsDoctrine,
  StandardsSource,
  StandardsSourceType,
  LoadedStandards,
} from "./standards.ts";
export type { TaskMeta, ParseResult } from "./parse.ts";
export {
  factoryPaths,
  findFactoryContextDir,
  resolveFactoryEnvironment,
  resolveFactoryMode,
  resolveFactoryRoot,
} from "./factory-environment.ts";
export {
  applyTaskRoutingOutcomeEvaluation,
  normalizeRunRecord,
  normalizeTaskRecord,
  RESUMABLE_RUN_STATUSES,
  RUN_LEDGER_VERSION,
} from "./run-ledger.ts";
export {
  applyExecutionPolicyOverrides,
  buildExecutionPolicyInjection,
  EXECUTION_POLICY_FILENAME,
  EXECUTION_POLICY_VERSION,
  EXECUTION_POLICY_WORKSPACE_PATH,
  loadDefaultExecutionPolicy,
  loadWorkspaceExecutionPolicy,
  normalizeExecutionPolicyOverrides,
  resolveExecutionPolicy,
  VALID_POLICY_ESCALATION_BEHAVIORS,
} from "./execution-policy.ts";
export {
  buildMinimalTaskDraftFixture,
  buildRichTaskDraftFixture,
  buildTaskDraftRenderFixture,
  normalizeTaskDraft,
  renderTaskDraftMarkdown,
  renderTaskDraftTarget,
  TASK_DRAFT_BODY_SECTION_ORDER,
  TASK_DRAFT_OPTIONAL_FRONTMATTER_FIELDS,
  TASK_DRAFT_RENDER_CONTRACT_VERSION,
  TASK_DRAFT_REQUIRED_FRONTMATTER_FIELDS,
} from "./task-draft.ts";
export {
  buildTaskDraftTargetPath,
  renderTaskDraftMarkdown as renderTaskMarkdown,
  renderTaskDraftTarget as renderTaskMarkdownTarget,
  TASK_MARKDOWN_FRONTMATTER_ORDER,
  TASK_MARKDOWN_RENDERER_VERSION,
  TASK_MARKDOWN_SECTION_ORDER,
} from "./task-markdown-renderer.ts";
export {
  applyTaskDraftValidation,
  REQUIRED_FIELDS,
  toPlanningDraftValidationRecord,
  validateTask,
  validateTaskBody,
  validateTaskDraft,
  validateTaskMarkdown,
} from "./task-validation.ts";
export {
  buildEpicPlanningDraft,
  buildEpicPlanningDraftFixture,
  buildPlanningDraftArtifactPath,
  buildPlanningDraftStorageRelativePath,
  buildTaskPlanningDraftFixture,
  normalizePlanningDraft,
  PLANNING_DRAFT_COMMIT_STATES,
  PLANNING_DRAFT_CONTRACT_VERSION,
  PLANNING_DRAFT_KINDS,
  PLANNING_DRAFT_PERSISTENCE_MODES,
  PLANNING_DRAFT_VALIDATION_STATUSES,
  renderTaskPlanningDraftTarget,
  serializePlanningDraft,
  TASK_DRAFT_COMMIT_STAGES,
  updateEpicPlanningDraft,
} from "./planning-draft.ts";
export {
  normalizeUnattendedExecutionSnapshot,
  ESCALATION_REASONS,
  PROGRESS_EVENT_CATEGORIES,
  UNATTENDED_EXECUTION_CONTRACT_VERSION,
  UNATTENDED_RUN_STATUSES,
  WORKER_HEALTH_STATUSES,
} from "./unattended-execution.ts";
export {
  normalizeUnattendedCheckpointArtifact,
  UNATTENDED_CHECKPOINT_TRIGGERS,
  UNATTENDED_CHECKPOINT_VERSION,
} from "./unattended-checkpoint.ts";
export {
  buildRunAttentionQueueItem,
  buildTaskReviewQueueItem,
  buildTaskTriageQueueItem,
  getSupportedReviewActions,
  normalizeReviewQueueItem,
  REVIEW_CONTROL_ACTIONS,
  REVIEW_CONTROL_CONTRACT_VERSION,
  REVIEW_CONTROL_MECHANISMS,
  REVIEW_QUEUE_ITEM_KINDS,
  REVIEW_QUEUE_RUN_STATUSES,
  REVIEW_QUEUE_TASK_STAGES,
  REVIEW_QUEUE_TRIAGE_STAGES,
  TASK_REVIEW_ACTIONS,
  TASK_REVIEW_ACTION_STAGE_MAP,
} from "./review-control.ts";
export {
  applyUnattendedStallPolicyOverrides,
  loadDefaultUnattendedStallPolicy,
  loadWorkspaceUnattendedStallPolicy,
  normalizeUnattendedStallPolicyOverrides,
  resolveUnattendedStallPolicy,
  UNATTENDED_STALL_POLICY_FILENAME,
  UNATTENDED_STALL_POLICY_VERSION,
  UNATTENDED_STALL_POLICY_WORKSPACE_PATH,
} from "./unattended-stall-policy.ts";
export {
  normalizeRoutingInput,
  VALID_ROUTING_CONTEXT_INTENSITIES,
  VALID_ROUTING_EXECUTION_PROFILES,
  VALID_ROUTING_PRIORITY_LEVELS,
} from "./routing-input.ts";
export {
  attachRoutingDecisionLinkage,
  buildRoutingDecisionId,
  ROUTING_DECISION_VERSION,
} from "./routing-decision.ts";
export { buildRoutingOutcomeEvaluation } from "./routing-evaluation.ts";
export {
  buildHumanQuestionFixture,
  HUMAN_INTERRUPTION_POLICY_MAP,
  HUMAN_QUESTION_VERSION,
} from "./human-question.ts";
export {
  buildHumanQuestionArtifactRelativePath,
  extractHumanQuestionArtifactMetadata,
  HUMAN_QUESTION_ARTIFACT_DIR,
  HUMAN_QUESTION_ARTIFACT_TYPE,
  parseHumanQuestionArtifact,
  serializeHumanQuestionArtifact,
} from "./human-question-artifact.ts";
export {
  buildHumanQuestionDigest,
  buildHumanQuestionDigestRelativePath,
  buildHumanQuestionLifecycleEvent,
  buildHumanQuestionLifecycleEventRelativePath,
  HUMAN_QUESTION_DIGEST_ARTIFACT_DIR,
  HUMAN_QUESTION_DIGEST_VERSION,
  HUMAN_QUESTION_EVENT_ARTIFACT_DIR,
  HUMAN_QUESTION_EVENT_VERSION,
  parseHumanQuestionLifecycleEvent,
  renderHumanQuestionDigestMarkdown,
  serializeHumanQuestionDigest,
  serializeHumanQuestionLifecycleEvent,
} from "./human-question-event.ts";
export {
  applyHumanInterruptionPolicyOverrides,
  getTaskHumanInterruptionPolicyOverrides,
  HUMAN_INTERRUPTION_POLICY_FILENAME,
  HUMAN_INTERRUPTION_POLICY_VERSION,
  HUMAN_INTERRUPTION_POLICY_WORKSPACE_PATH,
  loadDefaultHumanInterruptionPolicy,
  loadWorkspaceHumanInterruptionPolicy,
  normalizeHumanInterruptionPolicyOverrides,
  resolveHumanInterruptionPolicy,
  VALID_HUMAN_NOTIFICATION_MODES,
  VALID_HUMAN_POLICY_THRESHOLD_KEYS,
} from "./human-interruption-policy.ts";
export {
  normalizeSlackNotificationConfig,
  SLACK_NOTIFICATION_CONFIG_VERSION,
  VALID_SLACK_DELIVERY_MODES,
  VALID_SLACK_DIGEST_GROUP_BY,
  VALID_SLACK_TRANSPORT_KINDS,
} from "./slack-notification.ts";
export type {
  FactoryEnvironment,
  FactoryMode,
  FactoryPaths,
  FactoryRootSource,
} from "./factory-environment.ts";
export type {
  CostEventRecord,
  FailureRecord,
  OutcomeEvidence,
  ProgressEventRecord,
  RunInterruptionState,
  RoutingEvidenceRecord,
  RoutingFallbackEvidence,
  RoutingInputSnapshot,
  RoutingLedger,
  RoutingRetryEvidence,
  RoutingSelectionEvidence,
  RoutingTimingEvidence,
  RoutingUsageEvidence,
  RunLedgerSummary,
  RunRecord,
  TaskBlockKind,
  TaskBlockState,
  TaskRecord,
} from "./run-ledger.ts";
export type {
  ExecutionCommandPolicy,
  ExecutionFilesystemPolicy,
  ExecutionNetworkPolicy,
  ExecutionPackageInstallPolicy,
  ExecutionPolicyEscalation,
  ExecutionPolicyManifest,
  ExecutionPolicyManifestOverrides,
  ExecutionPolicyResolution,
  ExecutionTestPolicy,
  PolicyEscalationBehavior,
} from "./execution-policy.ts";
export type {
  TaskDraft,
} from "./task-draft.ts";
export type {
  TaskDraftValidationResult,
  ValidationResult,
} from "./task-validation.ts";
export type {
  CreateEpicPlanningDraftInput,
  EpicPlanningDraft,
  PlanningDraft,
  PlanningDraftBase,
  PlanningDraftCommitRecord,
  PlanningDraftCommitState,
  PlanningDraftKind,
  PlanningDraftPersistenceMode,
  PlanningDraftStorageRecord,
  PlanningDraftValidationRecord,
  PlanningDraftValidationStatus,
  RenderedTaskDraftTarget,
  TaskDraftCommitStage,
  TaskPlanningDraft,
  UpdateEpicPlanningDraftInput,
} from "./planning-draft.ts";
export type {
  ReviewControlAction,
  ReviewControlMechanism,
  ReviewQueueBaseItem,
  ReviewQueueItem,
  ReviewQueueItemKind,
  ReviewQueueRunSource,
  ReviewQueueTaskSource,
  RunAttentionQueueItem,
  TaskReviewAction,
  TaskReviewQueueItem,
  TaskTriageQueueItem,
} from "./review-control.ts";
export type {
  UnattendedCheckpointArtifact,
  UnattendedCheckpointArtifactReferences,
  UnattendedCheckpointPolicySnapshot,
  UnattendedCheckpointTrigger,
} from "./unattended-checkpoint.ts";
export type {
  CheckpointReferenceRecord,
  EscalationReason,
  EscalationRecord,
  ProgressEventCategory,
  ProgressPointerRecord,
  RecoveryAttemptRecord,
  UnattendedExecutionSnapshot,
  UnattendedRunStatus,
  WorkerHeartbeatRecord,
  WorkerHealthStatus,
} from "./unattended-execution.ts";
export type {
  UnattendedStallPolicy,
  UnattendedStallPolicyOverrides,
  UnattendedStallPolicyResolution,
} from "./unattended-stall-policy.ts";
export type {
  RoutingDecisionFallbackPath,
  RoutingDecisionLinkage,
  RoutingDecisionRejectedCandidate,
  RoutingDecisionStatus,
  UnifiedRoutingDecision,
} from "./routing-decision.ts";
export type {
  BuildRoutingOutcomeEvaluationInput,
  RoutingEvaluationStatus,
  RoutingEvidenceStatus,
  RoutingManualIntervention,
  RoutingOutcomeEvaluation,
  RoutingReviewOutcome,
  RoutingValidationOutcome,
} from "./routing-evaluation.ts";
export type {
  HumanInterruptionLevel,
  HumanQuestionAnswerPayload,
  HumanQuestionAuditEvent,
  HumanQuestionFallbackBehavior,
  HumanQuestionInputMode,
  HumanQuestionOption,
  HumanQuestionRecord,
  HumanQuestionStatus,
  HumanQuestionTimeoutPolicy,
  InterruptionPolicyMapping,
} from "./human-question.ts";
export type { HumanQuestionArtifactMetadata } from "./human-question-artifact.ts";
export type {
  HumanQuestionDigestArtifact,
  HumanQuestionDigestEntry,
  HumanQuestionLifecycleEvent,
  HumanQuestionLifecycleEventType,
} from "./human-question-event.ts";
export type {
  HumanInterruptionPolicy,
  HumanInterruptionPolicyOverrides,
  HumanInterruptionPolicyResolution,
  HumanNotificationMode,
  HumanPolicyThresholdKey,
} from "./human-interruption-policy.ts";
export type {
  SlackDeliveryMode,
  SlackDeliveryRecordLink,
  SlackDeliveryRequest,
  SlackDigestConfig,
  SlackDigestGroupBy,
  SlackDmRoutingConfig,
  SlackNotificationConfig,
  SlackSeverityRoutingConfig,
  SlackTransportConfig,
  SlackTransportKind,
} from "./slack-notification.ts";
export type {
  NormalizedRoutingInput,
  RoutingContextIntensity,
  RoutingExecutionProfile,
  RoutingPriorityLevel,
  RoutingRuntimeContext,
} from "./routing-input.ts";
