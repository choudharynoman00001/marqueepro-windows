"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withRtl = exports.baseIsRtl = exports.RTL_RE = void 0;
exports.visualRuns = visualRuns;
// Right-to-left (Urdu/Arabic script) text for PDF documents.
// pdfkit's built-in fonts have no Urdu letters, and fontkit shapes letters but does not reorder mixed right-to-left and left-to-right text.
// So: lines are broken here in logical order, each line is reordered with the Unicode bidirectional algorithm (bidi-js), and each run is drawn on its own:
// right-to-left runs with the bundled Noto Naskh Arabic (fontkit joins the letters), left-to-right runs (English, digits) with the font the caller already chose.
// Text with no Urdu/Arabic letters is not touched at all.
const urduFont_1 = require("./urduFont");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const bidi = require('bidi-js')();
exports.RTL_RE = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
const REG = Buffer.from(urduFont_1.NASKH_REGULAR_B64, 'base64'), BOLD = Buffer.from(urduFont_1.NASKH_BOLD_B64, 'base64');
/** Run segments of one line in visual (left to right on the page) order. */
function visualRuns(s) {
    const { levels } = bidi.getEmbeddingLevels(s);
    const order = bidi.getReorderedIndices(s, { levels, paragraphs: [{ start: 0, end: s.length - 1, level: levels[0] }] }, 0, s.length - 1);
    const runs = [];
    for (const i of order) {
        const rtl = levels[i] % 2 === 1;
        const r = runs[runs.length - 1];
        if (r && r.rtl === rtl)
            r.idx.push(i);
        else
            runs.push({ idx: [i], rtl });
    }
    const mir = bidi.getMirroredCharactersMap(s, levels); // brackets inside right-to-left text are drawn mirrored
    return runs.map((r) => ({ rtl: r.rtl, text: [...r.idx].sort((a, b) => a - b).map((i) => (levels[i] % 2 === 1 && mir.get(i)) || s[i]).join('') }));
}
/** Paragraph base direction from the first strong letter. */
const baseIsRtl = (s) => { const { levels } = bidi.getEmbeddingLevels(s); return levels[0] % 2 === 1; };
exports.baseIsRtl = baseIsRtl;
/** fontkit returns the glyphs of a right-to-left run already in visual order (verified by rendering), so a run is handed to pdfkit in logical order. */
function fkFont(d, name) { d.font(name); return d._font.font; }
function setup(d) {
    if (d.__rtl)
        return;
    d.__rtl = true;
    d.registerFont('NaskhR', REG);
    d.registerFont('NaskhB', BOLD);
    const has = (name, ch) => { const fk = fkFont(d, name); return fk.hasGlyphForCodePoint(ch.codePointAt(0)); };
    const orig = d.text.bind(d);
    d.text = function (str, a, b, c) {
        if (typeof str !== 'string' || !exports.RTL_RE.test(str))
            return orig(str, a, b, c);
        let x, y, o;
        if (typeof a === 'object' && a !== null) {
            x = d.x;
            y = d.y;
            o = a;
        }
        else {
            x = a ?? d.x;
            y = b ?? d.y;
            o = c || {};
        }
        const left = d.page.margins.left, width = o.width ?? d.page.width - d.page.margins.right - x;
        const bold = /Bold/i.test(String(d._font?.name || ''));
        const size = d._fontSize;
        const lh = Math.max(d.currentLineHeight(true), size * 1.55);
        const base = d._font;
        const rtlFont = bold ? 'NaskhB' : 'NaskhR';
        const restore = () => d.font(base.name);
        const asc = (n) => { d.font(n); const v = d._font.ascender; return v; };
        const pieces = (t) => {
            const out = [];
            for (const r of visualRuns(t)) {
                if (!r.rtl) {
                    const segs = [];
                    for (const ch of r.text) {
                        const non = ch.charCodeAt(0) > 0x24f && has(rtlFont, ch);
                        const l = segs[segs.length - 1];
                        if (l && !!l.flip === non)
                            l.text += ch;
                        else
                            segs.push({ text: ch, rtl: non, flip: non });
                    }
                    for (const g of segs)
                        out.push(g.flip ? { text: [...g.text].reverse().join(''), rtl: true } : g);
                    continue;
                }
                const segs = [];
                for (const ch of r.text) {
                    const ok = has(rtlFont, ch);
                    const l = segs[segs.length - 1];
                    if (l && l.rtl === ok)
                        l.text += ch;
                    else
                        segs.push({ text: ch, rtl: ok });
                }
                for (const g of segs)
                    if (!g.rtl)
                        g.text = [...g.text].reverse().join(''); // neutral characters set in the Latin font keep right-to-left order
                // fontkit keeps the words of a run in logical order, so each word is drawn on its own and the words are laid out right to left
                const toks = [];
                for (const g of segs) {
                    if (g.rtl)
                        for (const w of g.text.split(/( )/)) {
                            if (w)
                                toks.push({ text: w, rtl: true });
                        }
                    else
                        toks.push(g);
                }
                out.push(...toks.reverse()); // right-to-left run: first logical segment is the rightmost
            }
            return out;
        };
        const wOf = (pc) => { if (pc.rtl)
            d.font(rtlFont);
        else
            restore(); return d.widthOfString(pc.text); };
        const measure = (t) => pieces(t).reduce((w, pc) => w + wOf(pc), 0);
        const paras = str.split('\n');
        let cy = y;
        for (const para of paras) {
            const words = para.split(/(?<= )/);
            const lines = [];
            let cur = '';
            for (const w of words) {
                const t = cur + w;
                if (cur && measure(t.replace(/ +$/, '')) > width) {
                    lines.push(cur.replace(/ +$/, ''));
                    cur = w;
                }
                else
                    cur = t;
            }
            lines.push(cur.replace(/ +$/, ''));
            for (const ln of lines) {
                if (cy + lh > d.page.height - d.page.margins.bottom) {
                    d.addPage();
                    cy = d.page.margins.top;
                }
                const w = measure(ln);
                const rtlPara = (0, exports.baseIsRtl)(ln || ' ');
                const align = o.align && o.align !== 'left' ? o.align : rtlPara && ln ? 'right' : 'left';
                let cx = align === 'right' ? x + width - w : align === 'center' ? x + (width - w) / 2 : x;
                for (const pc of pieces(ln)) {
                    const rw = wOf(pc);
                    orig(pc.text, cx, pc.rtl ? cy + ((asc(base.name) - asc(rtlFont)) / 1000) * size : cy, { lineBreak: false, link: o.link, underline: o.underline });
                    cx += rw;
                }
                restore();
                cy += lh;
            }
        }
        d.x = left;
        d.y = cy;
        return d;
    };
}
exports.withRtl = setup;
//# sourceMappingURL=pdfText.js.map