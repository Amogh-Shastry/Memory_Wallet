/** Shared flag: while a one-click import sends the "what do you know" prompt,
 *  the wallet must not intercept it as a user question and show a permission
 *  card over its own UI. Module-level is fine — this lives in the page's
 *  content-script isolated world. */
let importing = false;

export function setImporting(value: boolean): void {
  importing = value;
}

export function isImporting(): boolean {
  return importing;
}
