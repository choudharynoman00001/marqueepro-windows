"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.isWin = void 0;
exports._setWinToolsForTest = _setWinToolsForTest;
exports.sddlUnexpectedSids = sddlUnexpectedSids;
exports.protectPath = protectPath;
exports.walkPlain = walkPlain;
exports.protectTree = protectTree;
// File and folder protection for secrets kept on disk. Windows: SID-level ACL with readback. Linux/macOS: owner-only permission bits.
// The Windows branch is tested here only with fake icacls/whoami programs on Linux; it has NOT been run on a real NTFS volume.
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const node_child_process_1 = require("node:child_process");
const isWin = () => process.platform === 'win32';
exports.isWin = isWin;
const sysRoot = () => { const r = process.env.SystemRoot; return r && /^[A-Za-z]:\\Windows$/i.test(r) ? r : 'C:\\Windows'; };
let winBin = {};
/** Test-only: lets a test point at a fake icacls/whoami. Refused unless NODE_ENV is exactly 'test'. */
function _setWinToolsForTest(o) { if (process.env.NODE_ENV !== 'test')
    throw new Error('test hook refused'); winBin = o; }
const ICACLS = () => winBin.icacls || sysRoot() + '\\System32\\icacls.exe';
const WHOAMI = () => winBin.whoami || sysRoot() + '\\System32\\whoami.exe';
const SID_OF_ALIAS = { SY: 'S-1-5-18', BA: 'S-1-5-32-544', WD: 'S-1-1-0', BU: 'S-1-5-32-545', AU: 'S-1-5-11', IU: 'S-1-5-4', NU: 'S-1-5-2', AC: 'S-1-15-2-1', LS: 'S-1-5-19', NS: 'S-1-5-20', CO: 'S-1-3-0', OW: 'S-1-3-4' };
/**
 * Trustee SIDs in the DACL of SDDL text (from `icacls /save`) that are not in `allowed`. Aliases are mapped to SIDs.
 * Fails closed: a missing/empty DACL, unbalanced parentheses, any ACE that is not a plain six-field Allow/Deny ACE
 * (conditional/callback ACEs with nested parentheses or extra fields, object ACEs, audit ACEs ...) is reported as an entry starting with '<'.
 * Only the D: section is read; O:, G: and S: (SACL) sections are skipped. Lines that are not SDDL (such as the path line icacls writes) are ignored.
 */
function sddlUnexpectedSids(sddl, allowed) {
    const res = [];
    const add = (x) => { if (!res.includes(x))
        res.push(x); };
    let found = false;
    for (const raw of sddl.replace(/^\uFEFF/, '').split(/\r?\n/)) {
        const line = raw.trim();
        if (!/^[OGDS]:/.test(line) || /^[A-Za-z]:[\\/]/.test(line))
            continue;
        // split into sections at depth 0
        let depth = 0;
        const secs = [];
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (depth === 0 && /[OGDS]/.test(ch) && line[i + 1] === ':' && (i === 0 || /[)A-Z0-9-]/.test(line[i - 1]))) {
                secs.push({ tag: ch, text: '' });
                i++;
                continue;
            }
            if (!secs.length) {
                add('<unparsable SDDL>');
                break;
            }
            if (ch === '(')
                depth++;
            else if (ch === ')') {
                depth--;
                if (depth < 0) {
                    add('<unbalanced SDDL>');
                    break;
                }
            }
            secs[secs.length - 1].text += ch;
        }
        if (depth !== 0)
            add('<unbalanced SDDL>');
        for (const s of secs.filter((x) => x.tag === 'D')) {
            found = true;
            const t = s.text;
            const first = t.indexOf('(');
            const flags = first < 0 ? t : t.slice(0, first);
            if (!/^[A-Z]*$/.test(flags))
                add('<unsupported DACL flags>');
            if (first < 0) {
                add('<empty DACL>');
                continue;
            }
            let d = 0, start = -1, n = 0;
            for (let i = first; i < t.length; i++) {
                const ch = t[i];
                if (ch === '(') {
                    if (d === 0)
                        start = i + 1;
                    d++;
                }
                else if (ch === ')') {
                    d--;
                    if (d === 0) {
                        n++;
                        const body = t.slice(start, i);
                        const f = body.split(';');
                        if (/[()]/.test(body) || f.length !== 6 || !/^(A|D)$/.test(f[0]) || !f[5])
                            add('<unsupported ACE>');
                        else {
                            const sid = SID_OF_ALIAS[f[5]] || f[5];
                            if (!/^S-1-[0-9-]+$/.test(sid))
                                add('<unknown trustee ' + f[5] + '>');
                            else if (!allowed.includes(sid))
                                add(sid);
                        }
                    }
                }
                else if (d === 0)
                    add('<stray text in DACL>');
            }
            if (n === 0)
                add('<empty DACL>');
        }
    }
    if (!found)
        add('<no DACL>');
    return res;
}
const run = (bin, args) => (0, node_child_process_1.execFileSync)(bin, args, { stdio: 'pipe', windowsHide: true }).toString();
function currentSid() { const m = run(WHOAMI(), ['/user', '/fo', 'csv', '/nh']).match(/"[^"]*","(S-1-[0-9-]+)"/); if (!m)
    throw new Error('cannot determine the current Windows account SID'); return m[1]; }
/** Windows: no inherited entries, only this account, SYSTEM and Administrators (folders: inherited by their contents), then an SID-level readback of the real ACL. Throws (fail closed) on any doubt. */
function winReadback(f, allowed) {
    const tmp = f.replace(/[\\/]+$/, '') + '.chk.acl';
    run(ICACLS(), [f, '/save', tmp, '/q']);
    try {
        const raw = fs.readFileSync(tmp);
        const txt = raw[0] === 0xff && raw[1] === 0xfe ? raw.toString('utf16le') : raw.toString('utf8');
        return sddlUnexpectedSids(txt, allowed);
    }
    finally {
        try {
            fs.unlinkSync(tmp);
        }
        catch { }
    }
}
function protectWin(f, dir) {
    const sid = currentSid();
    const allowed = [sid, 'S-1-5-18', 'S-1-5-32-544'];
    const tmp = f.replace(/[\\/]+$/, '') + (dir ? '.dir.acl' : '.acl');
    const perm = dir ? '(OI)(CI)(F)' : '(F)';
    const readback = () => { run(ICACLS(), [f, '/save', tmp, '/q']); try {
        const raw = fs.readFileSync(tmp);
        const txt = raw[0] === 0xff && raw[1] === 0xfe ? raw.toString('utf16le') : raw.toString('utf8');
        return sddlUnexpectedSids(txt, allowed);
    }
    finally {
        try {
            fs.unlinkSync(tmp);
        }
        catch { }
    } };
    run(ICACLS(), [f, '/inheritance:r']);
    run(ICACLS(), [f, '/grant:r', `*${sid}:${perm}`, `*S-1-5-18:${perm}`, `*S-1-5-32-544:${perm}`]);
    let bad = readback();
    if (bad.length) {
        for (const b of bad) {
            if (!/^S-1-/.test(b))
                throw new Error('unexpected access entry ' + b);
            try {
                run(ICACLS(), [f, '/remove', '*' + b]);
            }
            catch { }
        }
        bad = readback();
    }
    if (bad.length)
        throw new Error('other accounts still have access to ' + f + ': ' + bad.join(', '));
}
/** Restrict and verify a secret file (mode 600) or folder (mode 700). Called before secrets are written and on every load. Throws on any doubt; never deletes data.
 *  repair=true (Linux/macOS): tighten loose permission bits of an existing item, then verify; otherwise loose bits are an error. */
function protectPath(f, dir = false, repair = false) {
    if ((0, exports.isWin)())
        return protectWin(f, dir);
    if (fs.statSync(f).mode & 0o077) {
        if (repair)
            fs.chmodSync(f, dir ? 0o700 : 0o600);
    }
    if (fs.statSync(f).mode & 0o077)
        throw new Error(f + (dir ? ' is accessible to other users; fix its permissions (chmod 700)' : ' is readable by other users; fix its permissions (chmod 600)'));
}
/** Every file and folder below `dir`, without following links. Throws on a symbolic link or junction: the tree must be plain so a path cannot lead outside it. */
function walkPlain(dir) {
    const out = [];
    const rec = (d) => { for (const n of fs.readdirSync(d)) {
        const f = path.join(d, n);
        const st = fs.lstatSync(f);
        if (st.isSymbolicLink())
            throw new Error('refusing a link inside ' + dir + ': ' + f);
        out.push(f);
        if (st.isDirectory())
            rec(f);
    } };
    rec(dir);
    return out;
}
/** Folder tree (the database folder). Verifies EVERY entry, not a sample: one recursive `icacls /save /T` of the real ACLs, parsed with the fail-closed SDDL reader; any entry with another
 *  trustee (explicit entry or inheritance exception) causes `icacls /reset /T /C` (children go back to inheriting from the protected folder), then the whole tree is read back again;
 *  anything still open refuses the start. Links/junctions inside the tree are refused. Callers must have established that `dir` is ours BEFORE calling (it mutates ACLs).
 *  Linux/macOS: the folder is 0700 (blocks other users from everything below it) and every entry is checked for group/other bits. */
function protectTree(dir) {
    protectPath(dir, true, true);
    const all = walkPlain(dir);
    if (!(0, exports.isWin)()) {
        for (const f of all)
            if (fs.lstatSync(f).mode & 0o077 && !fs.lstatSync(f).isDirectory()) {
                try {
                    fs.chmodSync(f, fs.lstatSync(f).mode & ~0o077);
                }
                catch {
                    throw new Error('cannot restrict ' + f);
                }
            }
        return;
    }
    const sid = currentSid();
    const allowed = [sid, 'S-1-5-18', 'S-1-5-32-544'];
    const tmp = dir.replace(/[\\/]+$/, '') + '.tree.acl';
    const bad = () => { run(ICACLS(), [dir, '/save', tmp, '/T', '/C', '/Q']); try {
        const raw = fs.readFileSync(tmp);
        const txt = raw[0] === 0xff && raw[1] === 0xfe ? raw.toString('utf16le') : raw.toString('utf8');
        return sddlUnexpectedSids(txt, allowed);
    }
    finally {
        try {
            fs.unlinkSync(tmp);
        }
        catch { }
    } };
    let b = bad();
    if (!b.length)
        return;
    run(ICACLS(), [dir, '/reset', '/T', '/C', '/Q']);
    protectPath(dir, true, true);
    walkPlain(dir);
    b = bad();
    if (b.length)
        throw new Error('other accounts still have access inside ' + dir + ': ' + b.slice(0, 5).join('; '));
}
//# sourceMappingURL=fsacl.js.map