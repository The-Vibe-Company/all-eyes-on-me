export { comparePages, scorePages, type PageComparison, type PageScore } from "./compare.js";
export { ConfigError, loadConfig, type ProjectConfig } from "./config.js";
export { isInside, snapshot, SnapshotPathError } from "./snapshot.js";
export { STYLE_PRINCIPLES, verdictOf, type Failure, type RunVerdict } from "./verdict.js";
export { readRun, resultHtml, RunReportError, type ResultPage, type SavedVerdict } from "./report.js";
export { BLOCKING_PRINCIPLES, blockedJourneys, type BlockedJourney } from "./features.js";
export { prBody } from "./pr.js";
