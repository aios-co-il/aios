import re, sys, json

def statements(text):
    out, buf, i, n = [], [], 0, len(text)
    start = 0
    while i < n:
        c = text[i]
        if c == "'":
            j = i + 1
            while j < n:
                if text[j] == "'":
                    if j + 1 < n and text[j+1] == "'": j += 2; continue
                    break
                j += 1
            i = j + 1; continue
        if c == '"':
            j = text.index('"', i + 1); i = j + 1; continue
        if c == '-' and text.startswith('--', i):
            j = text.find('\n', i); i = n if j < 0 else j; continue
        if c == '$':
            m = re.match(r'\$([A-Za-z_][A-Za-z0-9_]*)?\$', text[i:])
            if m:
                tag = m.group(0)
                j = text.find(tag, i + len(tag))
                i = j + len(tag); continue
        if c == ';':
            out.append(text[start:i].strip()); start = i + 1
        i += 1
    tail = text[start:].strip()
    if tail: out.append(tail)
    return [s for s in out if s and not all(l.strip().startswith('--') or not l.strip() for l in s.splitlines())]

def strip_comments(s):
    return '\n'.join(l for l in s.splitlines() if not l.strip().startswith('--')).strip()

def norm(s):
    return re.sub(r'\s+', ' ', s).strip()

def ident(s):
    return s.replace('"', '').lower()

def split_cols(body):
    parts, depth, cur, q = [], 0, '', False
    for ch in body:
        if ch == "'" : q = not q
        if not q:
            if ch == '(': depth += 1
            elif ch == ')': depth -= 1
            elif ch == ',' and depth == 0:
                parts.append(cur.strip()); cur = ''; continue
        cur += ch
    if cur.strip(): parts.append(cur.strip())
    return parts

def keyed(path):
    text = open(path).read()
    objs = {}
    def put(k, v):
        if k in objs: k = k + ' #' + str(sum(1 for x in objs if x.startswith(k)))
        objs[k] = v
    for raw in statements(text):
        s = strip_comments(raw); ns = norm(s); u = ns.upper()
        m = re.match(r'CREATE (?:OR REPLACE )?(FUNCTION|PROCEDURE) ("?[\w]+"?\."?[\w]+"?)\s*\((.*?)\) RETURNS', ns, re.I)
        if m:
            put(f'FUNCTION {ident(m.group(2))}({norm(m.group(3)).lower()})', ns); continue
        m = re.match(r'CREATE TABLE (?:IF NOT EXISTS )?("?[\w]+"?\."?[\w]+"?) \((.*)\)(.*)$', ns, re.I | re.S)
        if m:
            t = ident(m.group(1))
            put(f'TABLE {t}', 'exists' + m.group(3))
            for col in split_cols(m.group(2)):
                cm = re.match(r'("[^"]+"|\S+)\s+(.*)', col)
                if cm.group(1).upper() in ('CONSTRAINT',):
                    nm = re.match(r'CONSTRAINT ("[^"]+"|\S+) (.*)', col)
                    put(f'CONSTRAINT {t}.{ident(nm.group(1))}', nm.group(2))
                else:
                    put(f'COLUMN {t}.{ident(cm.group(1))}', cm.group(2))
            continue
        m = re.match(r'CREATE POLICY ("[^"]+"|\S+) ON ("?[\w]+"?\."?[\w]+"?)', ns, re.I)
        if m: put(f'POLICY {ident(m.group(2))} :: {ident(m.group(1))}', ns); continue
        m = re.match(r'CREATE (?:OR REPLACE )?(?:CONSTRAINT )?TRIGGER ("[^"]+"|\S+) .*? ON ("?[\w]+"?\."?[\w]+"?)', ns, re.I)
        if m: put(f'TRIGGER {ident(m.group(2))} :: {ident(m.group(1))}', ns); continue
        m = re.match(r'CREATE (?:UNIQUE )?INDEX (?:IF NOT EXISTS )?("[^"]+"|\S+) ON (?:ONLY )?("?[\w]+"?\."?[\w]+"?)', ns, re.I)
        if m: put(f'INDEX {ident(m.group(2))} :: {ident(m.group(1))}', ns); continue
        m = re.match(r'ALTER TABLE (?:ONLY )?("?[\w]+"?\."?[\w]+"?) ADD CONSTRAINT ("[^"]+"|\S+) (.*)', ns, re.I)
        if m: put(f'CONSTRAINT {ident(m.group(1))}.{ident(m.group(2))}', m.group(3)); continue
        m = re.match(r'ALTER TABLE (?:ONLY )?("?[\w]+"?\."?[\w]+"?) ALTER COLUMN ("[^"]+"|\S+) SET DEFAULT (.*)', ns, re.I)
        if m: put(f'DEFAULT {ident(m.group(1))}.{ident(m.group(2))}', m.group(3)); continue
        m = re.match(r'(?:CREATE OR REPLACE |CREATE )(VIEW|MATERIALIZED VIEW) (?:IF NOT EXISTS )?("?[\w]+"?\."?[\w]+"?)', ns, re.I)
        if m: put(f'VIEW {ident(m.group(2))}', ns); continue
        m = re.match(r'CREATE TYPE ("?[\w]+"?\."?[\w]+"?)', ns, re.I)
        if m: put(f'TYPE {ident(m.group(1))}', ns); continue
        m = re.match(r'CREATE SEQUENCE (?:IF NOT EXISTS )?("?[\w]+"?\."?[\w]+"?)', ns, re.I)
        if m: put(f'SEQUENCE {ident(m.group(1))}', ns); continue
        if re.match(r'ALTER .* OWNER TO', ns, re.I): continue
        if re.match(r'(GRANT|REVOKE|ALTER DEFAULT PRIVILEGES)', ns, re.I): put('ACL ' + ns, ns); continue
        m = re.match(r'COMMENT ON (\w+(?: \w+)?) (.*?) IS ', ns, re.I)
        if m: put(f'COMMENT {m.group(1).upper()} {ident(m.group(2))}', ns); continue
        put('OTHER ' + ns[:120], ns)
    return objs

if __name__ == '__main__':
    p, s = keyed(sys.argv[1]), keyed(sys.argv[2])
    json.dump({'prod': p, 'staging': s}, open(sys.argv[3], 'w'))
    from collections import Counter
    both = [k for k in p if k in s]
    diff = [k for k in both if p[k] != s[k]]
    print('prod', len(p), 'staging', len(s), 'both', len(both), 'differ', len(diff))
    print('differ by type', Counter(k.split()[0] for k in diff))
    print('prod-only', Counter(k.split()[0] for k in p if k not in s))
    print('staging-only', Counter(k.split()[0] for k in s if k not in p))
