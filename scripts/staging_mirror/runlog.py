"""Phase timing and the GitHub step summary."""
import os
import time
from .sql import batches


class RunLog:
    # Phase timings plus a Markdown step summary, written even when a run fails.
    def __init__(self):
        self.phases, self.failed, self.progress = [], None, {}

    def phase(self, name):
        log = self
        class Phase:
            def __enter__(self):
                self.start = time.monotonic()
                print(f'[phase] {name}: start', flush=True)
            def __exit__(self, kind, error, trace):
                seconds = time.monotonic() - self.start
                status = 'failed' if error else 'ok'
                print(f'[phase] {name}: {status} in {seconds:.1f}s' + (f' - {error}' if error else ''), flush=True)
                log.phases.append((name, status, seconds))
                if error and log.failed is None: log.failed = (name, str(error))
        return Phase()

    def write_summary(self, results, failures, rejected):
        path = os.environ.get('GITHUB_STEP_SUMMARY')
        if not path: return
        failures = list(failures)
        if self.failed and not failures:
            failures.insert(0, {'table': self.failed[0], 'error': self.failed[1]})
        # Tables that failed after committing some batches keep those rows.
        done = {r['table'] for r in results}
        partial = {t: n for t, n in self.progress.items() if t not in done and n}
        copied = sum(r['changed_rows'] for r in results) + sum(partial.values())
        lines = ['## Staging data mirror', '',
                 f'Result: **{"failed" if failures or rejected else "ok"}**; '
                 f'{len(results)} tables synced, {copied} rows copied.', '']
        if failures:
            lines += ['### Failed', ''] + [
                f"- `{f['table']}`: {f['error']}" + (f" ({partial[f['table']]} rows copied before failing)" if f['table'] in partial else '')
                for f in failures] + ['']
        if rejected:
            lines += ['### Rejected rows', ''] + [f"- `{r['table']}`: {r['rejected_rows']}" for r in rejected] + ['']
        lines += ['### Tables', '', '| Table | Source rows | Copied | Removed | Rejected |', '| --- | ---: | ---: | ---: | ---: |']
        lines += [f"| {r['table']} | {r['source_rows']} | {r['changed_rows']} | {r['removed_rows']} | {r['rejected_rows']} |" for r in results]
        lines += ['', '### Phases', '', '| Phase | Status | Seconds |', '| --- | --- | ---: |']
        lines += [f'| {n} | {st} | {sec:.1f} |' for n, st, sec in self.phases]
        with open(path, 'a') as handle: handle.write('\n'.join(lines) + '\n')
