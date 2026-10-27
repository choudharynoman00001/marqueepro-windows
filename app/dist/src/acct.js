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
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
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
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ACCT_CONTROLLERS = exports.PlatformStatusController = exports.CouponController = exports.AccountingController = exports.ReportFilesController = exports.M = void 0;
exports.ledger = ledger;
const pdfUr_1 = require("./pdfUr");
const common_1 = require("@nestjs/common");
const exceljs_1 = __importDefault(require("exceljs"));
const L = __importStar(require("./lib"));
const D = __importStar(require("./domain"));
const infra_1 = require("./infra");
const ops2_1 = require("./ops2");
/** A money cell: kept in minor units so PDF shows "Rs 1,234.00" and CSV/XLSX get a real number. */
class M {
    minor;
    constructor(m) { this.minor = m === 0 ? 0 : m; }
}
exports.M = M;
const cellText = (v) => (v instanceof M ? (0, ops2_1.rs)(v.minor) : v === null || v === undefined ? '' : String(v));
const cellNum = (v) => (v instanceof M ? Number((v.minor / 100).toFixed(2)) : v === null || v === undefined ? '' : v);
const acctOf = (q) => (q.account === 'bank' ? 'bank' : q.account === 'noncash' ? 'noncash' : 'cash');
const ACCT_TITLE = { cash: 'CASH BOOK', bank: 'BANK BOOK (BANK TRANSFERS ONLY)', noncash: 'CARD / DIGITAL / CHEQUE BOOK (NOT CONFIRMED CLEARED)' };
const OPENING = (c, a) => (a === 'cash' ? Number(c.tenant.opening_cash_minor) : a === 'bank' ? Number(c.tenant.opening_bank_minor) : 0) || 0;
const LEDGER_SQL = `SELECT day, dir, amt, descr, method FROM (
  SELECT received_on AS day, 'in' AS dir, amount_minor AS amt, 'Receipt ' || receipt_no AS descr, method FROM payments WHERE tenant_id=?
  UNION ALL SELECT a.adjusted_on, 'out', a.amount_minor, 'Payment ' || a.kind || ' ' || p.receipt_no, COALESCE(a.method, p.method) FROM payment_adjustments a JOIN payments p ON p.id=a.payment_id WHERE a.tenant_id=?
  UNION ALL SELECT spent_on, 'out', amount_minor, 'Expense ' || COALESCE(note, ''), method FROM expenses WHERE tenant_id=? AND voided=0
  UNION ALL SELECT paid_on, 'out', amount_minor, 'Vendor payment', method FROM vendor_payments WHERE tenant_id=?
  UNION ALL SELECT paid_on, 'out', net_minor, 'Salary ' || period, method FROM payroll_entries WHERE tenant_id=?
) l WHERE ((?='cash' AND method='cash') OR (?='bank' AND method='bank') OR (?='noncash' AND method NOT IN ('cash','bank'))) ORDER BY day, dir DESC, descr`;
async function ledger(c, account, from, to) {
    const all = await c.db.all(LEDGER_SQL, c.tid, c.tid, c.tid, c.tid, c.tid, account, account, account);
    const open0 = OPENING(c, account);
    let opening = open0;
    const lines = [];
    let tin = 0, tout = 0, run = 0;
    for (const r of all) {
        const a = Number(r.amt), signed = r.dir === 'in' ? a : -a;
        if (r.day < from)
            opening += signed;
        else if (r.day <= to) {
            if (!lines.length)
                run = opening;
            run += signed;
            if (r.dir === 'in')
                tin += a;
            else
                tout += a;
            lines.push({ day: r.day, descr: r.descr, method: r.method, in: r.dir === 'in' ? a : 0, out: r.dir === 'out' ? a : 0, balance: run });
        }
    }
    return { opening, lines, in_minor: tin, out_minor: tout, closing: opening + tin - tout };
}
/** Balance at the end of `day` (opening balance plus all movements up to and including that day). */
async function balanceAt(c, account, day) {
    const all = await c.db.all(LEDGER_SQL, c.tid, c.tid, c.tid, c.tid, c.tid, account, account, account);
    return all.filter((r) => r.day <= day).reduce((s, r) => s + (r.dir === 'in' ? Number(r.amt) : -Number(r.amt)), OPENING(c, account));
}
async function profitLoss(c, from, to) {
    const one = async (sql, ...p) => Number((await c.db.get(sql, ...p)).n);
    const received = await one('SELECT COALESCE(SUM(amount_minor),0) n FROM payments WHERE tenant_id=? AND received_on BETWEEN ? AND ?', c.tid, from, to);
    const reversed = await one("SELECT COALESCE(SUM(amount_minor),0) n FROM payment_adjustments WHERE tenant_id=? AND kind='reversal' AND adjusted_on BETWEEN ? AND ?", c.tid, from, to);
    const refunded = await one("SELECT COALESCE(SUM(amount_minor),0) n FROM payment_adjustments WHERE tenant_id=? AND kind='refund' AND adjusted_on BETWEEN ? AND ?", c.tid, from, to);
    const cats = await c.db.all('SELECT k.name, COALESCE(SUM(e.amount_minor),0) AS amount FROM expenses e JOIN expense_categories k ON k.id=e.category_id WHERE e.tenant_id=? AND e.voided=0 AND e.spent_on BETWEEN ? AND ? GROUP BY k.name ORDER BY k.name', c.tid, from, to);
    const vendors = await one('SELECT COALESCE(SUM(amount_minor),0) n FROM vendor_payments WHERE tenant_id=? AND paid_on BETWEEN ? AND ?', c.tid, from, to);
    const payroll = await one('SELECT COALESCE(SUM(net_minor),0) n FROM payroll_entries WHERE tenant_id=? AND paid_on BETWEEN ? AND ?', c.tid, from, to);
    const income = received - reversed - refunded, expenses = cats.reduce((s, x) => s + Number(x.amount), 0), out = expenses + vendors + payroll;
    return { from, to, basis: 'Cash basis: money actually received minus money actually paid out in the period. Receipts recorded as card, digital or cheque count as received here; they are not confirmed as cleared into the bank. Not an accrual or tax statement.', income_minor: income, received_minor: received, reversed_minor: reversed, refunded_minor: refunded,
        expense_categories: cats.map((x) => ({ name: x.name, amount_minor: Number(x.amount) })), expenses_minor: expenses, vendor_payments_minor: vendors, payroll_minor: payroll, outflow_minor: out, profit_minor: income - out };
}
async function dataset(c, kind, q) {
    const t = c.tenant;
    switch (kind) {
        case 'profit-loss': {
            const { from, to } = (0, ops2_1.range)(q);
            const p = await profitLoss(c, from, to);
            return { title: (0, pdfUr_1.T)('PROFIT AND LOSS (CASH BASIS)'), sub: `${from} to ${to}`, head: [(0, pdfUr_1.T)('Line'), (0, pdfUr_1.T)('Amount')], money: [false, true],
                rows: [[(0, pdfUr_1.T)('Received'), new M(p.received_minor)], [(0, pdfUr_1.T)('Less reversed'), new M(-p.reversed_minor)], [(0, pdfUr_1.T)('Less refunded'), new M(-p.refunded_minor)], ...p.expense_categories.map((x) => [`Expense: ${x.name}`, new M(-x.amount_minor)]), [(0, pdfUr_1.T)('Vendor payments'), new M(-p.vendor_payments_minor)], [(0, pdfUr_1.T)('Salaries paid'), new M(-p.payroll_minor)]],
                totals: [[(0, pdfUr_1.T)('Money in'), new M(p.income_minor)], [(0, pdfUr_1.T)('Total ordinary expenses'), new M(p.expenses_minor)], [(0, pdfUr_1.T)('Total vendor payments'), new M(p.vendor_payments_minor)], [(0, pdfUr_1.T)('Total salaries paid'), new M(p.payroll_minor)], [(0, pdfUr_1.T)('Money out'), new M(p.outflow_minor)], [(0, pdfUr_1.T)('Net'), new M(p.profit_minor)]], note: p.basis };
        }
        case 'cash-book': {
            const { from, to } = (0, ops2_1.range)(q);
            const account = acctOf(q);
            const l = await ledger(c, account, from, to);
            return { title: ACCT_TITLE[account], sub: `${from} to ${to}`, head: [(0, pdfUr_1.T)('Date'), (0, pdfUr_1.T)('Entry'), (0, pdfUr_1.T)('Method'), (0, pdfUr_1.T)('In'), (0, pdfUr_1.T)('Out'), (0, pdfUr_1.T)('Balance')], money: [false, false, false, true, true, true],
                rows: [['', 'Opening balance', '', null, null, new M(l.opening)], ...l.lines.map((x) => [x.day, x.descr, x.method, x.in ? new M(x.in) : null, x.out ? new M(x.out) : null, new M(x.balance)])],
                totals: [[(0, pdfUr_1.T)('Total in'), new M(l.in_minor)], [(0, pdfUr_1.T)('Total out'), new M(l.out_minor)], [(0, pdfUr_1.T)('Closing balance'), new M(l.closing)]], note: account === 'bank' ? 'Only receipts and payments recorded with method bank. Card, digital and cheque are in their own book until you confirm they cleared.' : account === 'noncash' ? 'Recorded as card, digital or cheque. These are NOT confirmed as cleared bank funds. Check them against your bank statement.' : undefined };
        }
        case 'receivables': {
            const today = L.todayIn(t.timezone);
            const rows = await c.db.all(`SELECT i.number, i.issue_date, b.code AS booking_code, cu.name AS customer, cu.phone,
        i.total_minor - COALESCE((SELECT SUM(amount_minor) FROM credit_notes n WHERE n.invoice_id=i.id),0) - COALESCE((SELECT SUM(amount_minor) FROM payment_allocations a WHERE a.invoice_id=i.id),0) AS due_minor
        FROM invoices i JOIN bookings b ON b.id=i.booking_id JOIN customers cu ON cu.id=i.customer_id WHERE i.tenant_id=? AND i.kind='invoice' AND i.status='issued' ORDER BY i.issue_date, i.id`, c.tid);
            const open = rows.filter((r) => Number(r.due_minor) > 0);
            return { title: (0, pdfUr_1.T)('RECEIVABLES'), sub: `As of ${today}`, head: [(0, pdfUr_1.T)('Invoice'), (0, pdfUr_1.T)('Issued'), (0, pdfUr_1.T)('Booking'), (0, pdfUr_1.T)('Customer'), (0, pdfUr_1.T)('Due')], money: [false, false, false, false, true], rows: open.map((r) => [r.number, r.issue_date, r.booking_code, r.customer, new M(Number(r.due_minor))]), totals: [[(0, pdfUr_1.T)('Total outstanding'), new M(open.reduce((s, r) => s + Number(r.due_minor), 0))]] };
        }
        case 'events': {
            const { from, to } = (0, ops2_1.range)(q);
            const rows = await c.db.all(`SELECT b.code,b.event_type,b.event_date,b.guests,v.name AS venue_name,
        COALESCE((SELECT SUM(i.total_minor) FROM invoices i WHERE i.booking_id=b.id AND i.kind='invoice' AND i.status='issued'),0) - COALESCE((SELECT SUM(n.amount_minor) FROM credit_notes n JOIN invoices i ON i.id=n.invoice_id WHERE i.booking_id=b.id),0) AS invoiced_minor,
        COALESCE((SELECT SUM(e.amount_minor) FROM expenses e WHERE e.booking_id=b.id AND e.voided=0),0) AS expenses_minor
        FROM bookings b JOIN venues v ON v.id=b.venue_id WHERE b.tenant_id=? AND b.event_date BETWEEN ? AND ? AND b.status IN ('confirmed','completed') ORDER BY b.event_date, b.id`, c.tid, from, to);
            const inv = rows.reduce((s, r) => s + Number(r.invoiced_minor), 0), ex = rows.reduce((s, r) => s + Number(r.expenses_minor), 0);
            return { title: (0, pdfUr_1.T)('EVENT-WISE ESTIMATED MARGIN'), sub: `${from} to ${to}`, head: [(0, pdfUr_1.T)('Booking'), (0, pdfUr_1.T)('Date'), (0, pdfUr_1.T)('Type'), (0, pdfUr_1.T)('Hall'), (0, pdfUr_1.T)('Guests'), (0, pdfUr_1.T)('Invoiced'), (0, pdfUr_1.T)('Expenses'), (0, pdfUr_1.T)('Margin'), (0, pdfUr_1.T)('Margin per head')], money: [false, false, false, false, false, true, true, true, true],
                rows: rows.map((r) => { const g = Number(r.guests) || 0, m = Number(r.invoiced_minor) - Number(r.expenses_minor); return [r.code, r.event_date, r.event_type, r.venue_name, g, new M(Number(r.invoiced_minor)), new M(Number(r.expenses_minor)), new M(m), g > 0 ? new M(Math.trunc(m / g)) : '-']; }),
                totals: [[(0, pdfUr_1.T)('Invoiced'), new M(inv)], [(0, pdfUr_1.T)('Expenses tagged to events'), new M(ex)], [(0, pdfUr_1.T)('Estimated margin'), new M(inv - ex)]], note: 'Estimate: invoiced revenue minus expenses tagged to the event. Untagged overheads are not included. Per head = margin divided by guests, cut to a whole minor unit.' };
        }
        case 'hall-revenue': {
            const { from, to } = (0, ops2_1.range)(q);
            const rows = await c.db.all(`SELECT v.name, COUNT(DISTINCT b.id) AS bookings, COALESCE(SUM(i.total_minor),0) AS invoiced_minor FROM venues v LEFT JOIN bookings b ON b.venue_id=v.id AND b.event_date BETWEEN ? AND ? AND b.status IN ('confirmed','completed')
        LEFT JOIN invoices i ON i.booking_id=b.id AND i.kind='invoice' AND i.status='issued' WHERE v.tenant_id=? GROUP BY v.id, v.name ORDER BY v.id`, from, to, c.tid);
            return { title: (0, pdfUr_1.T)('HALL REVENUE'), sub: `${from} to ${to}`, head: [(0, pdfUr_1.T)('Hall'), (0, pdfUr_1.T)('Bookings'), (0, pdfUr_1.T)('Invoiced')], money: [false, false, true], rows: rows.map((r) => [r.name, Number(r.bookings), new M(Number(r.invoiced_minor))]), totals: [[(0, pdfUr_1.T)('Total invoiced'), new M(rows.reduce((s, r) => s + Number(r.invoiced_minor), 0))]] };
        }
        case 'tax-summary': {
            const { from, to } = (0, ops2_1.range)(q);
            const rows = await c.db.all(`SELECT tax_bp, COUNT(*) AS invoices, SUM(subtotal_minor - discount_minor) AS taxable_minor, SUM(tax_minor) AS tax_minor, SUM(total_minor) AS total_minor
        FROM invoices WHERE tenant_id=? AND kind='invoice' AND status='issued' AND issue_date BETWEEN ? AND ? GROUP BY tax_bp ORDER BY tax_bp`, c.tid, from, to);
            const sm = (k) => rows.reduce((x, r) => x + Number(r[k]), 0);
            return { title: (0, pdfUr_1.T)('TAX SUMMARY'), sub: `${from} to ${to}`, head: [(0, pdfUr_1.T)('Rate'), (0, pdfUr_1.T)('Invoices'), (0, pdfUr_1.T)('Taxable'), (0, pdfUr_1.T)('Tax'), (0, pdfUr_1.T)('Total')], money: [false, false, true, true, true],
                rows: rows.map((r) => [`${(Number(r.tax_bp) / 100).toFixed(2)}%`, Number(r.invoices), new M(Number(r.taxable_minor)), new M(Number(r.tax_minor)), new M(Number(r.total_minor))]),
                totals: [[(0, pdfUr_1.T)('Taxable'), new M(sm('taxable_minor'))], [(0, pdfUr_1.T)('Tax'), new M(sm('tax_minor'))], [(0, pdfUr_1.T)('Total'), new M(sm('total_minor'))]],
                note: 'Issued invoices by issue date, grouped by the tax rate stored on each invoice. Voided invoices and quotes are left out. Credit notes are not netted because their tax part is not recorded. A summary of what was invoiced, not a tax return; no filing rule is applied.' };
        }
        case 'collections': {
            const { from, to } = (0, ops2_1.range)(q);
            const pays = await c.db.all('SELECT received_on AS day, method, SUM(amount_minor) AS amount FROM payments WHERE tenant_id=? AND received_on BETWEEN ? AND ? GROUP BY received_on, method ORDER BY received_on, method', c.tid, from, to);
            const p = await profitLoss(c, from, to);
            return { title: (0, pdfUr_1.T)('COLLECTIONS'), sub: `${from} to ${to}`, head: [(0, pdfUr_1.T)('Date'), (0, pdfUr_1.T)('Method'), (0, pdfUr_1.T)('Received')], money: [false, false, true], rows: pays.map((r) => [r.day, r.method, new M(Number(r.amount))]),
                totals: [[(0, pdfUr_1.T)('Received'), new M(p.received_minor)], [(0, pdfUr_1.T)('Reversed'), new M(-p.reversed_minor)], [(0, pdfUr_1.T)('Refunded'), new M(-p.refunded_minor)], [(0, pdfUr_1.T)('Net collected'), new M(p.income_minor)]], note: 'Cash collected only. This is not profit.' };
        }
        default: throw L.notFound('Unknown report');
    }
}
function dsPdf(ds, t) {
    return (0, ops2_1.pdfBuffer)((d) => {
        (0, ops2_1.head)(d, t, ds.title, ds.sub);
        const n = ds.head.length, money = ds.money || [], fixed = 78, flex = money.filter((x) => !x).length || 1;
        const wFlex = (ops2_1.W0 - 12 - money.filter(Boolean).length * fixed) / flex;
        const w = ds.head.map((_, i) => (money[i] ? fixed : wFlex));
        const xs = [];
        w.reduce((a, b, i) => { xs[i] = ops2_1.L0 + 6 + a; return a + b; }, 0);
        const font = ds.head.length > 5 ? 9 : 10;
        const header = () => { const hy = d.y; d.rect(ops2_1.L0, hy - 4, ops2_1.W0, 20).fill('#eee'); d.fillColor('#111').font('Helvetica-Bold').fontSize(font); ds.head.forEach((h, i) => d.text(h, xs[i], hy, { width: w[i] - 4, align: money[i] ? 'right' : 'left', lineBreak: false })); d.y = hy + 22; };
        header();
        for (const r of ds.rows) {
            d.font('Helvetica').fontSize(font);
            const h = Math.max(...r.map((v, i) => d.heightOfString(cellText(v) || ' ', { width: w[i] - 4 })));
            if (d.y + h + 12 > d.page.height - 90) {
                d.addPage();
                d.y = 48;
                header();
            }
            const y = d.y;
            d.font('Helvetica').fontSize(font).fillColor('#111');
            r.forEach((v, i) => d.text(cellText(v), xs[i], y, { width: w[i] - 4, align: money[i] ? 'right' : 'left' }));
            d.y = y + h + 5;
            d.moveTo(ops2_1.L0, d.y).lineTo(ops2_1.L0 + ops2_1.W0, d.y).strokeColor('#ddd').lineWidth(0.5).stroke();
            d.y += 5;
        }
        if (!ds.rows.length)
            d.font('Helvetica').fontSize(11).fillColor('#555').text((0, pdfUr_1.T)('No entries for this selection.'), ops2_1.L0 + 6, d.y);
        if (d.y + 40 + ds.totals.length * 20 > d.page.height - 60) {
            d.addPage();
            d.y = 48;
        }
        d.moveDown(0.5);
        ds.totals.forEach(([k, v], i) => (0, ops2_1.totalRow)(d, k, (0, ops2_1.rs)(v.minor), i === ds.totals.length - 1));
        if (ds.note)
            d.font('Helvetica').fontSize(9).fillColor('#555').text((0, pdfUr_1.T)(ds.note), ops2_1.L0, d.y + 4, { width: ops2_1.W0 });
        void n;
        (0, ops2_1.credit)(d);
    });
}
async function dsXlsx(ds, t) {
    const wb = new exceljs_1.default.Workbook();
    wb.creator = 'MarqueePro';
    const ws = wb.addWorksheet(ds.title.slice(0, 30).replace(/[\\/?*\[\]:]/g, ' '));
    ws.addRow([String(t.name)]).font = { bold: true, size: 14 };
    ws.addRow([ds.title + '  ' + ds.sub]);
    ws.addRow([]);
    const hr = ws.addRow(ds.head);
    hr.font = { bold: true };
    const text = (v) => { const x = cellNum(v); return typeof x === 'string' && /^[=+\-@]/.test(x) && !/^-?\d+(\.\d+)?$/.test(x) ? "'" + x : x; };
    for (const r of ds.rows) {
        const row = ws.addRow(r.map(text));
        (ds.money || []).forEach((m, i) => { if (m)
            row.getCell(i + 1).numFmt = '#,##0.00'; });
    }
    ws.addRow([]);
    for (const [k, v] of ds.totals) {
        const row = ws.addRow([k, Number((v.minor / 100).toFixed(2))]);
        row.font = { bold: true };
        row.getCell(2).numFmt = '#,##0.00';
    }
    const ncol = Math.max(ds.head.length, 2);
    const wrapRow = (text, lines) => { const r = ws.addRow([text]); ws.mergeCells(r.number, 1, r.number, ncol); r.getCell(1).alignment = { wrapText: true, vertical: 'top' }; r.height = 15 * lines; };
    if (ds.note)
        wrapRow(ds.note, Math.max(2, Math.ceil(ds.note.length / (ncol * 18))));
    wrapRow('Developed by Chaudhry Noman | Powered by Alpha Blue Digital - alphablue.digital', 1);
    ws.columns.forEach((col, i) => { col.width = i === 0 ? 28 : 18; });
    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
    ws.pageSetup.printArea = `A1:${String.fromCharCode(64 + Math.min(ncol, 26))}${ws.rowCount}`;
    return Buffer.from(await wb.xlsx.writeBuffer());
}
const dsCsv = (ds) => (0, ops2_1.toCsv)(ds.head, [...ds.rows.map((r) => r.map(cellNum)), ...ds.totals.map(([k, v]) => [k, cellNum(v)])]);
const KINDS = ['profit-loss', 'cash-book', 'receivables', 'events', 'hall-revenue', 'collections', 'tax-summary'];
const POLICY_LABELS = { cancellation_policy: 'Cancellation policy', refund_policy: 'Refund policy', clearing_policy: 'Card, digital and cheque clearing rule', retention_policy: 'Data retention rule' };
const POLICY_KEYS = Object.keys(POLICY_LABELS);
function policyView(t) { const items = POLICY_KEYS.map((k) => ({ key: k, label: POLICY_LABELS[k], text: t[k] || null, configured: !!t[k] })); return { items, unset: items.filter((i) => !i.configured).map((i) => i.key), applied_automatically: false }; }
let ReportFilesController = class ReportFilesController {
    async file(c, kind, q, res) {
        if (!KINDS.includes(kind))
            throw L.notFound('Unknown report');
        const fmt = String(q.format || 'pdf');
        if (!['pdf', 'xlsx', 'csv'].includes(fmt))
            throw L.bad('Format must be pdf, xlsx or csv');
        const ds = await dataset(c, kind, q);
        const lg = c.tid ? await c.db.get('SELECT data FROM tenant_logos WHERE tenant_id=?', c.tid) : null;
        const tn = lg ? { ...c.tenant, logo: Buffer.from(lg.data) } : c.tenant;
        const base = `${kind}${kind === 'cash-book' && acctOf(q) !== 'cash' ? '-' + acctOf(q) : ''}`;
        if (fmt === 'csv') {
            res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${base}.csv"` });
            return new common_1.StreamableFile(Buffer.from(dsCsv(ds), 'utf8'));
        }
        if (fmt === 'xlsx') {
            res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${base}.xlsx"` });
            return new common_1.StreamableFile(await dsXlsx(ds, tn));
        }
        res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${base}.pdf"` });
        return new common_1.StreamableFile(await dsPdf(ds, tn));
    }
};
exports.ReportFilesController = ReportFilesController;
__decorate([
    (0, infra_1.Perm)('reports.read'),
    (0, common_1.Get)(':kind'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('kind')),
    __param(2, (0, common_1.Query)()),
    __param(3, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, Object]),
    __metadata("design:returntype", Promise)
], ReportFilesController.prototype, "file", null);
exports.ReportFilesController = ReportFilesController = __decorate([
    (0, common_1.Controller)('api/report-files')
], ReportFilesController);
let AccountingController = class AccountingController {
    pl(c, q) { const { from, to } = (0, ops2_1.range)(q); return profitLoss(c, from, to); }
    async cashBook(c, q) { const { from, to } = (0, ops2_1.range)(q); const account = acctOf(q); const l = await ledger(c, account, from, to); return { from, to, account, ...l }; }
    async opening(c, b) {
        const used = await c.db.get('SELECT (SELECT COUNT(*) FROM cash_closings WHERE tenant_id=?) + (SELECT COUNT(*) FROM bank_reconciliations WHERE tenant_id=?) AS n', c.tid, c.tid);
        if (Number(used.n) > 0)
            throw L.bad('Opening balances cannot change after a cash closing or bank reconciliation exists');
        const cash = L.parseMoney(b.cash ?? '0', { allowZero: true, field: 'Opening cash' }), bank = L.parseMoney(b.bank ?? '0', { allowZero: true, field: 'Opening bank' });
        await c.db.run('UPDATE tenants SET opening_cash_minor=?, opening_bank_minor=? WHERE id=?', cash, bank, c.tid);
        await D.audit(c.db, c, 'opening_balances.set', 'tenant', c.tid, { cash, bank });
        return { opening_cash_minor: cash, opening_bank_minor: bank };
    }
    async closeCash(c, b) {
        const day = L.checkDate(b.day, 'Day');
        const counted = L.parseMoney(b.counted, { allowZero: true, field: 'Counted cash' });
        const expected = await balanceAt(c, 'cash', day);
        const r = await c.db.run('INSERT INTO cash_closings(tenant_id,day,expected_minor,counted_minor,difference_minor,note,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)', c.tid, day, expected, counted, counted - expected, L.str(b.note, 'Note', { max: 500 }), c.user.id, L.nowIso());
        await D.audit(c.db, c, 'cash_closing.create', 'cash_closing', r.id, { day, expected, counted });
        return c.db.get('SELECT * FROM cash_closings WHERE id=?', r.id);
    }
    list(c) { return c.db.all('SELECT * FROM cash_closings WHERE tenant_id=? ORDER BY day DESC, id DESC LIMIT 200', c.tid); }
    async reconcile(c, b) {
        const asOf = L.checkDate(b.as_of, 'As of');
        const stmt = L.parseMoney(b.statement_balance, { allowZero: true, field: 'Statement balance' });
        const book = await balanceAt(c, 'bank', asOf);
        const pending = await balanceAt(c, 'noncash', asOf);
        const r = await c.db.run('INSERT INTO bank_reconciliations(tenant_id,as_of,book_minor,noncash_pending_minor,statement_minor,difference_minor,note,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)', c.tid, asOf, book, pending, stmt, stmt - book, L.str(b.note, 'Note', { max: 500 }), c.user.id, L.nowIso());
        await D.audit(c.db, c, 'bank_reconciliation.create', 'bank_reconciliation', r.id, { as_of: asOf, book, stmt });
        return c.db.get('SELECT * FROM bank_reconciliations WHERE id=?', r.id);
    }
    reconciliations(c) { return c.db.all('SELECT * FROM bank_reconciliations WHERE tenant_id=? ORDER BY as_of DESC, id DESC LIMIT 200', c.tid); }
    // contract terms: written by the owner, never pre-filled
    async terms(c, b) { const v = L.str(b.terms, 'Contract terms', { max: 8000 }) || null; await c.db.run('UPDATE tenants SET contract_terms=? WHERE id=?', v, c.tid); await D.audit(c.db, c, 'contract_terms.set', 'tenant', c.tid); return { contract_terms: v }; }
    // business policies: written by each business, never pre-filled, never applied automatically (they are shown and printed, they do not change any amount)
    async getPolicies(c) { return policyView(c.tenant); }
    async setPolicies(c, b) {
        const sets = [];
        const vals = [];
        for (const k of POLICY_KEYS)
            if (b && Object.prototype.hasOwnProperty.call(b, k)) {
                sets.push(k + '=?');
                vals.push(L.str(b[k], POLICY_LABELS[k], { max: 4000 }) || null);
            }
        if (!sets.length)
            throw L.bad('Send at least one policy field');
        await c.db.run('UPDATE tenants SET ' + sets.join(',') + ' WHERE id=?', ...vals, c.tid);
        await D.audit(c.db, c, 'policies.set', 'tenant', c.tid, { fields: sets.map((x) => x.split('=')[0]) });
        return policyView(await c.db.get('SELECT * FROM tenants WHERE id=?', c.tid));
    }
    async getTerms(c) { return { contract_terms: c.tenant.contract_terms || null, configured: !!c.tenant.contract_terms }; }
    async contract(c, id, res) {
        await D.own(c.db, 'bookings', Number(id), c.tid, 'Booking');
        const bk = await D.getBooking(c.db, c.tid, Number(id));
        const cu = await c.db.get('SELECT name,phone,address FROM customers WHERE id=?', bk.customer_id);
        const t = await (0, ops2_1.withLogo)(c);
        const invs = await c.db.all("SELECT kind, number, status, total_minor FROM invoices WHERE booking_id=? AND tenant_id=? AND status<>'void' ORDER BY id", bk.id, c.tid);
        res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="contract.pdf"' });
        return new common_1.StreamableFile(await (0, ops2_1.pdfBuffer)((d) => {
            (0, ops2_1.head)(d, t, 'BOOKING CONTRACT', `Booking ${bk.code}`);
            const kv2 = (k, v) => { const y = d.y; d.font('Helvetica-Bold').fontSize(11).fillColor('#111').text(k, ops2_1.L0, y, { width: 110 }); d.font('Helvetica').text(v, ops2_1.L0 + 115, y, { width: ops2_1.W0 - 115 }); d.y = Math.max(d.y, y + 15); };
            kv2((0, pdfUr_1.T)('Customer'), `${cu.name}${cu.phone ? '   ' + cu.phone : ''}`);
            if (cu.address)
                kv2((0, pdfUr_1.T)('Address'), cu.address);
            kv2((0, pdfUr_1.T)('Event'), String(bk.event_type));
            kv2((0, pdfUr_1.T)('Hall'), String(bk.venue_name));
            kv2((0, pdfUr_1.T)('Date'), String(bk.event_date));
            kv2((0, pdfUr_1.T)('Time'), `${String(bk.starts_at).slice(11, 16)} to ${String(bk.ends_at).slice(11, 16)}`);
            kv2((0, pdfUr_1.T)('Guests'), String(bk.guests));
            kv2((0, pdfUr_1.T)('Status'), (0, pdfUr_1.TS)(bk.status));
            for (const i of invs)
                kv2(i.kind === 'invoice' ? (0, pdfUr_1.T)('Invoice') : (0, pdfUr_1.T)('Quote'), `${i.number || '(draft)'}   ${(0, ops2_1.rs)(Number(i.total_minor))}   [${(0, pdfUr_1.TS)(i.status)}]`);
            d.moveDown().font('Helvetica-Bold').fontSize(12).fillColor('#111').text((0, pdfUr_1.T)('Terms and conditions'), ops2_1.L0, d.y);
            if (t.contract_terms)
                d.font('Helvetica').fontSize(10).fillColor('#222').text(String(t.contract_terms), ops2_1.L0, d.y + 4, { width: ops2_1.W0 });
            else
                d.font('Helvetica-Oblique').fontSize(10).fillColor('#a00').text((0, pdfUr_1.T)('Contract terms have not been configured by the business. Add them in Settings before using this document as a contract.'), ops2_1.L0, d.y + 4, { width: ops2_1.W0 });
            for (const k of ['cancellation_policy', 'refund_policy']) {
                if (d.y + 90 > d.page.height - 60) {
                    d.addPage();
                    d.y = 48;
                }
                d.moveDown().font('Helvetica-Bold').fontSize(12).fillColor('#111').text((0, pdfUr_1.T)(POLICY_LABELS[k]), ops2_1.L0, d.y);
                if (t[k])
                    d.font('Helvetica').fontSize(10).fillColor('#222').text(String(t[k]), ops2_1.L0, d.y + 4, { width: ops2_1.W0 });
                else
                    d.font('Helvetica-Oblique').fontSize(10).fillColor('#a00').text((0, pdfUr_1.T)('Not configured by the business.'), ops2_1.L0, d.y + 4, { width: ops2_1.W0 });
            }
            if (d.y + 120 > d.page.height - 60) {
                d.addPage();
                d.y = 48;
            }
            d.moveDown(3);
            const y = d.y;
            d.moveTo(ops2_1.L0, y).lineTo(ops2_1.L0 + 200, y).strokeColor('#111').stroke();
            d.moveTo(ops2_1.L0 + 290, y).lineTo(ops2_1.L0 + 490, y).stroke();
            d.font('Helvetica').fontSize(10).fillColor('#111').text((0, pdfUr_1.T)('Customer signature'), ops2_1.L0, y + 4, { width: 200 }).text((0, pdfUr_1.T)('For the business'), ops2_1.L0 + 290, y + 4, { width: 200 });
            (0, ops2_1.credit)(d);
        }));
    }
};
exports.AccountingController = AccountingController;
__decorate([
    (0, infra_1.Perm)('reports.read'),
    (0, common_1.Get)('reports/profit-loss'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AccountingController.prototype, "pl", null);
__decorate([
    (0, infra_1.Perm)('reports.read'),
    (0, common_1.Get)('reports/cash-book'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AccountingController.prototype, "cashBook", null);
__decorate([
    (0, infra_1.Perm)('settings'),
    (0, common_1.Put)('opening-balances'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AccountingController.prototype, "opening", null);
__decorate([
    (0, infra_1.Perm)('expenses.write'),
    (0, common_1.Post)('cash-closings'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AccountingController.prototype, "closeCash", null);
__decorate([
    (0, infra_1.Perm)('reports.read'),
    (0, common_1.Get)('cash-closings'),
    __param(0, (0, infra_1.C)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AccountingController.prototype, "list", null);
__decorate([
    (0, infra_1.Perm)('expenses.write'),
    (0, common_1.Post)('bank-reconciliations'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AccountingController.prototype, "reconcile", null);
__decorate([
    (0, infra_1.Perm)('reports.read'),
    (0, common_1.Get)('bank-reconciliations'),
    __param(0, (0, infra_1.C)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AccountingController.prototype, "reconciliations", null);
__decorate([
    (0, infra_1.Perm)('settings'),
    (0, common_1.Put)('contract-terms'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AccountingController.prototype, "terms", null);
__decorate([
    (0, infra_1.Perm)('bookings.read'),
    (0, common_1.Get)('policies'),
    __param(0, (0, infra_1.C)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AccountingController.prototype, "getPolicies", null);
__decorate([
    (0, infra_1.Perm)('settings'),
    (0, common_1.Put)('policies'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AccountingController.prototype, "setPolicies", null);
__decorate([
    (0, infra_1.Perm)('bookings.read'),
    (0, common_1.Get)('contract-terms'),
    __param(0, (0, infra_1.C)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AccountingController.prototype, "getTerms", null);
__decorate([
    (0, infra_1.Perm)('bookings.read'),
    (0, common_1.Get)('bookings/:id/contract.pdf'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], AccountingController.prototype, "contract", null);
exports.AccountingController = AccountingController = __decorate([
    (0, common_1.Controller)('api')
], AccountingController);
let CouponController = class CouponController {
    list(c) { return c.db.all('SELECT * FROM coupons ORDER BY id'); }
    async add(c, b) {
        const code = String(b.code || '').trim().toUpperCase();
        if (!/^[A-Z0-9_-]{2,30}$/.test(code))
            throw L.bad('Coupon code must be 2-30 letters, numbers, - or _');
        const pct = b.percent === undefined || b.percent === '' ? null : L.parseBp(b.percent);
        const amount = b.amount === undefined || b.amount === '' ? null : L.parseMoney(b.amount, { allowZero: false, field: 'Amount' });
        if ((pct === null) === (amount === null))
            throw L.bad('Set either a percent or a fixed amount');
        if (pct !== null && pct > 10000)
            throw L.bad('Percent cannot exceed 100');
        if (await c.db.get('SELECT id FROM coupons WHERE code=?', code))
            throw L.bad('That coupon code exists');
        const r = await c.db.run('INSERT INTO coupons(code,percent_bp,amount_minor,valid_until,active,note,created_at) VALUES(?,?,?,?,1,?,?)', code, pct, amount, b.valid_until ? L.checkDate(b.valid_until, 'Valid until') : null, L.str(b.note, 'Note', { max: 300 }), L.nowIso());
        return c.db.get('SELECT * FROM coupons WHERE id=?', r.id);
    }
    async off(c, id) { await c.db.run('UPDATE coupons SET active=0 WHERE id=?', Number(id)); return c.db.get('SELECT * FROM coupons WHERE id=?', Number(id)); }
};
exports.CouponController = CouponController;
__decorate([
    (0, infra_1.SuperOnly)(),
    (0, common_1.Get)('coupons'),
    __param(0, (0, infra_1.C)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], CouponController.prototype, "list", null);
__decorate([
    (0, infra_1.SuperOnly)(),
    (0, common_1.Post)('coupons'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], CouponController.prototype, "add", null);
__decorate([
    (0, infra_1.SuperOnly)(),
    (0, common_1.Post)('coupons/:id/deactivate'),
    __param(0, (0, infra_1.C)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], CouponController.prototype, "off", null);
exports.CouponController = CouponController = __decorate([
    (0, common_1.Controller)('api/admin')
], CouponController);
/** Read-only usage counts per business and the platform's own operating status. Nothing here charges, limits or sends anything. */
let PlatformStatusController = class PlatformStatusController {
    async usage(c) {
        const since = new Date(Date.now() - 30 * 86400_000).toISOString();
        const rows = await c.db.all(`SELECT t.id, t.name, t.status,
      (SELECT COUNT(*) FROM users u WHERE u.tenant_id=t.id AND u.status='active') AS users,
      (SELECT COUNT(*) FROM branches b WHERE b.tenant_id=t.id) AS branches,
      (SELECT COUNT(*) FROM venues v WHERE v.tenant_id=t.id AND v.active=1) AS halls,
      (SELECT COUNT(*) FROM bookings k WHERE k.tenant_id=t.id) AS bookings_total,
      (SELECT COUNT(*) FROM bookings k WHERE k.tenant_id=t.id AND k.created_at >= ?) AS bookings_30d,
      (SELECT COUNT(*) FROM invoices i WHERE i.tenant_id=t.id AND i.status IN ('issued','paid')) AS invoices_issued,
      (SELECT COUNT(*) FROM support_tickets s WHERE s.tenant_id=t.id AND s.status='open') AS open_tickets,
      (SELECT MAX(a.created_at) FROM audit_logs a WHERE a.tenant_id=t.id) AS last_activity
      FROM tenants t ORDER BY t.id`, since);
        const norm = rows.map((r) => ({ id: Number(r.id), name: r.name, status: r.status, users: Number(r.users), branches: Number(r.branches), halls: Number(r.halls), bookings_total: Number(r.bookings_total), bookings_30d: Number(r.bookings_30d), invoices_issued: Number(r.invoices_issued), open_tickets: Number(r.open_tickets), last_activity: r.last_activity || null }));
        await c.db.get('SELECT 1 AS ok');
        const age = (iso) => (iso ? Date.now() - new Date(iso).getTime() : null);
        const alerts = [];
        if (!infra_1.opStats.backupScheduled)
            alerts.push('Scheduled backups are off on this server.');
        else if (infra_1.opStats.backupFailedAt && (!infra_1.opStats.backupOkAt || infra_1.opStats.backupFailedAt > infra_1.opStats.backupOkAt))
            alerts.push('The last scheduled backup failed.');
        else if (infra_1.opStats.backupOkAt && age(infra_1.opStats.backupOkAt) > 2 * infra_1.opStats.backupIntervalHours * 3600_000)
            alerts.push('The last successful backup is older than two backup intervals.');
        if (infra_1.opStats.errors > 0)
            alerts.push(`${infra_1.opStats.errors} unexpected server error(s) since this server started.`);
        return {
            note: 'Counts only. Nothing is billed, limited or sent from this screen. Server counters reset when the server restarts.',
            businesses: norm,
            platform: { database: 'ok', uptime_seconds: Math.round((Date.now() - infra_1.opStats.startedAt) / 1000), unexpected_errors_since_start: infra_1.opStats.errors, last_error_at: infra_1.opStats.lastErrorAt, backups_scheduled: infra_1.opStats.backupScheduled, last_backup_ok_at: infra_1.opStats.backupOkAt, last_backup_failed_at: infra_1.opStats.backupFailedAt, alerts },
        };
    }
};
exports.PlatformStatusController = PlatformStatusController;
__decorate([
    (0, infra_1.SuperOnly)(),
    (0, common_1.Get)('usage'),
    __param(0, (0, infra_1.C)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PlatformStatusController.prototype, "usage", null);
exports.PlatformStatusController = PlatformStatusController = __decorate([
    (0, common_1.Controller)('api/admin')
], PlatformStatusController);
exports.ACCT_CONTROLLERS = [ReportFilesController, AccountingController, CouponController, PlatformStatusController];
void ops2_1.negrs;
//# sourceMappingURL=acct.js.map