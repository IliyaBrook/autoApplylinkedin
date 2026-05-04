// ============================================================================
// LinkedIn Apply-button selectors
// ----------------------------------------------------------------------------
// LinkedIn no longer renders the literal text "Easy Apply" on the apply
// control. The reliable cross-UI signals are now (in priority order):
//
//   Easy Apply (in-app):
//     1. aria-label starts with "linkedin apply to"   — covers BOTH UIs:
//          legacy:  "LinkedIn Apply to <Title> at <Company>"  (BUTTON)
//          new SDUI: "LinkedIn Apply to this job"              (A)
//        We require the "to" suffix so the search filter pill
//        (aria-label="LinkedIn Apply" / "LinkedIn Apply filter.") is excluded.
//     2. href contains "openSDUIApplyFlow=true"        (new SDUI flow)
//     3. <button class*="jobs-apply-button"> as legacy fallback
//        (excluding the search-filter pill via role="radio" / artdeco-pill).
//
//   External Apply (off-platform):
//     1. aria-label = "Apply on company website"
//     2. (legacy fallback) <button class*="jobs-apply-button"> whose
//        aria-label does NOT start with "LinkedIn Apply".
//
// All comparisons are lower-cased via XPath translate() since LinkedIn ships
// the same labels in different cases.
// ============================================================================

const _UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const _LOWER = "abcdefghijklmnopqrstuvwxyz";
const _LC = (attr) => `translate(${attr}, '${_UPPER}', '${_LOWER}')`;
const _NOT_FILTER_PILL =
	"not(@role='radio') and not(contains(@class, 'artdeco-pill'))";

// Easy Apply — union of three strategies.
const easy_apply_button = [
	// 1. aria-label starts with "linkedin apply to" — covers BOTH UIs and
	//    excludes the search-filter pill (which uses just "LinkedIn Apply").
	`//*[(self::button or self::a) and starts-with(${_LC("@aria-label")}, 'linkedin apply to')]`,
	// 2. SDUI apply-flow link (new UI only — see PR GodsScion#96).
	`//a[contains(@href, 'openSDUIApplyFlow=true')]`,
	// 3. Legacy fallback: jobs-apply-button class without an external aria-label
	//    and not the filter pill.
	`//button[contains(@class, 'jobs-apply-button') and not(${_LC("@aria-label")} = 'apply on company website') and ${_NOT_FILTER_PILL}]`,
].join(" | ");

// External Apply — anything that takes the user off-platform.
const not_easy_apply_button = [
	// 1. aria-label explicitly says "apply on company website".
	`//*[(self::button or self::a) and ${_LC("@aria-label")} = 'apply on company website']`,
	// 2. Legacy: jobs-apply-button without "linkedin apply" prefix and not the filter pill.
	`//button[contains(@class, 'jobs-apply-button') and not(starts-with(${_LC("@aria-label")}, 'linkedin apply')) and ${_NOT_FILTER_PILL}]`,
].join(" | ");
