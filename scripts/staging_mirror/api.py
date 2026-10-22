"""Management API client and redacted database errors."""
import json
import re
import sys
import time
import urllib.error
import urllib.request


class Management:
    def __init__(self, source, target, token):
        if not source or not target or source == target:
            raise ValueError('Distinct source and Staging project refs required')
        for ref in (source, target):
            if not re.fullmatch('[a-z]{20}', ref):
                raise ValueError('Invalid project reference')
        self.source, self.target, self.token = source, target, token
        self.last_request_at = 0.0

    def request(self, request):
        for attempt in range(4):
            # One shared budget for reads and writes, below Management API limits.
            time.sleep(max(0, self.last_request_at + 0.75 - time.monotonic()))
            self.last_request_at = time.monotonic()
            try:
                with urllib.request.urlopen(request, timeout=120) as response:
                    return json.load(response)
            except urllib.error.HTTPError as error:
                if error.code not in (429, 502, 503, 504) or attempt == 3:
                    raise
                retry_after = error.headers.get('Retry-After', '') if error.headers else ''
                delay = min(60, float(retry_after)) if retry_after.isdigit() else min(60, 30 * (attempt + 1))
                print(f'Management API HTTP {error.code}; retrying in {delay:g}s', file=sys.stderr, flush=True)
                time.sleep(delay)

    def function_versions(self):
        request = urllib.request.Request(f'https://api.supabase.com/v1/projects/{self.target}/functions',
                                         headers={'Authorization': f'Bearer {self.token}'})
        rows = self.request(request)
        if isinstance(rows, dict): rows = rows['functions']
        return {f['slug']: {'id': f['id'], 'version': f['version']} for f in rows}

    def query(self, sql, source=False):
        ref = self.source if source else self.target
        suffix = '/read-only' if source else ''
        req = urllib.request.Request(
            f'https://api.supabase.com/v1/projects/{ref}/database/query{suffix}',
            data=json.dumps({'query': sql}).encode(),
            headers={'Authorization': f'Bearer {self.token}', 'Content-Type': 'application/json'},
            method='POST',
        )
        try:
            return self.request(req)
        except urllib.error.HTTPError as error:
            # API errors may echo SQL containing customer data. Never log bodies.
            detail = safe_database_error(error.read())
            raise RuntimeError(f"{'Source read' if source else 'Staging query'} failed: HTTP {error.code}{detail}") from None


GUARD_MESSAGES = frozenset({
    'Staging containment is not verified',
    'Pending Staging invitations require identity reconciliation',
    'Historical Staging identity matches an invitation',
})


def safe_database_error(body):
    # Only schema identifiers and SQLSTATE help operators diagnose failures;
    # row values, SQL statements and arbitrary error text must stay out of logs.
    try:
        value = json.loads(body)
        message = value.get('message', '') if isinstance(value, dict) else ''
    except (ValueError, UnicodeDecodeError):
        return ''
    if not isinstance(message, str): return ''
    parts = []
    code = re.search(r'ERROR:\s*([A-Z0-9]{5}):', message)
    if code: parts.append('SQLSTATE ' + code.group(1))
    # P0001 is the default SQLSTATE for any RAISE EXCEPTION. Only the exact
    # guard messages below, read from the primary error header, are shown.
    header = message.split('DETAIL:')[0].split('\n')[0]
    guard = re.fullmatch(r'ERROR:\s*P0001:\s*(.+?)\s*', header)
    if guard and guard.group(1) in GUARD_MESSAGES: parts.append('message: ' + guard.group(1))
    for kind, name in re.findall(r'\b(constraint|column|relation) "([a-z_][a-z0-9_]{0,62})"', message.split('DETAIL:')[0]):
        parts.append(kind + ' ' + name)
    return ' (' + ', '.join(parts) + ')' if parts else ''
