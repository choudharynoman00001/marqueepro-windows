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
exports.paymentNet = exports.invoiceCredits = exports.invoiceAllocated = exports.bookingServices = exports.EVENT_TYPES = exports.HOLD = void 0;
exports.audit = audit;
exports.nextSeq = nextSeq;
exports.own = own;
exports.conflictsFor = conflictsFor;
exports.createBooking = createBooking;
exports.getBooking = getBooking;
exports.updateBooking = updateBooking;
exports.setStatus = setStatus;
exports.bookingEstimate = bookingEstimate;
exports.compute = compute;
exports.createInvoiceDraft = createInvoiceDraft;
exports.updateInvoiceDraft = updateInvoiceDraft;
exports.deleteInvoiceDraft = deleteInvoiceDraft;
exports.issueInvoice = issueInvoice;
exports.getInvoice = getInvoice;
exports.voidInvoice = voidInvoice;
exports.creditNote = creditNote;
exports.allocate = allocate;
exports.paymentView = paymentView;
exports.recordPayment = recordPayment;
exports.adjustPayment = adjustPayment;
exports.bookingFinance = bookingFinance;
const L = __importStar(require("./lib"));
const { bad, notFound, HttpError } = L;
async function audit(db, ctx, action, type, id, detail) {
    await db.run('INSERT INTO audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,detail,created_at) VALUES(?,?,?,?,?,?,?)', ctx.tid ?? null, ctx.user?.id ?? null, action, type ?? null, id ?? null, detail ? JSON.stringify(detail).slice(0, 2000) : null, L.nowIso());
}
async function nextSeq(db, tid, kind) {
    await db.run('INSERT INTO counters(tenant_id,kind,next) VALUES(?,?,2) ON CONFLICT(tenant_id,kind) DO UPDATE SET next=counters.next+1', tid, kind);
    return (await db.get('SELECT next-1 AS n FROM counters WHERE tenant_id=? AND kind=?', tid, kind)).n;
}
const TABLES = new Set(['branches', 'venues', 'venue_blocks', 'customers', 'bookings', 'invoices', 'payments', 'expenses', 'expense_categories', 'vendors',
    'vendor_bills', 'employees', 'inventory_items', 'stock_locations', 'menu_items', 'packages', 'service_catalog', 'event_tasks', 'users', 'support_tickets']);
// every lookup of a record by a client-supplied id is tenant-scoped
async function own(db, table, id, tid, label) {
    if (!TABLES.has(table))
        throw new Error('bad table');
    const n = Number(id);
    const row = Number.isInteger(n) && n > 0 && n < 9e15 ? await db.get(`SELECT * FROM ${table} WHERE id=? AND tenant_id=?`, n, tid) : null;
    if (!row)
        throw notFound(`${label || table} not found`);
    return row;
}
// ---------- bookings ----------
exports.HOLD = ['tentative', 'confirmed', 'completed'];
exports.EVENT_TYPES = ['wedding', 'barat', 'walima', 'mehndi', 'birthday', 'corporate', 'other'];
const blockWindow = (s, e, setup, cleanup) => ({ start: L.shiftMin(s, -setup), end: L.shiftMin(e, cleanup) });
async function conflictsFor(db, tid, venueId, bs, be, excludeId) {
    const b = await db.get(`SELECT id, code, status, starts_at, ends_at FROM bookings WHERE tenant_id=? AND venue_id=? AND id<>? AND status IN ('tentative','confirmed','completed')
    AND block_start < ?::timestamp AND block_end > ?::timestamp LIMIT 1`, tid, venueId, excludeId || 0, be, bs);
    if (b)
        return { type: 'booking', ...b };
    const v = await db.get('SELECT id, starts_at, ends_at, reason FROM venue_blocks WHERE tenant_id=? AND venue_id=? AND starts_at < ?::timestamp AND ends_at > ?::timestamp LIMIT 1', tid, venueId, be, bs);
    return v ? { type: 'block', ...v } : null;
}
function overlapError(c) {
    return new HttpError(409, c.type === 'booking'
        ? `This hall is already held by ${c.code} (${c.status}) from ${c.starts_at.replace('T', ' ')} to ${c.ends_at.replace('T', ' ')} (including setup/cleanup time)`
        : `This hall is blocked (${c.reason || 'maintenance'}) from ${c.starts_at.replace('T', ' ')} to ${c.ends_at.replace('T', ' ')}`, 'OVERLAP');
}
async function normBooking(db, ctx, d, existing) {
    const tid = ctx.tid;
    const customer = await own(db, 'customers', d.customer_id ?? existing?.customer_id, tid, 'Customer');
    const venue = await own(db, 'venues', d.venue_id ?? existing?.venue_id, tid, 'Hall');
    if (!venue.active)
        throw bad('This hall is inactive');
    const starts = L.checkDT(d.starts_at ?? existing?.starts_at, 'Start time');
    const ends = L.checkDT(d.ends_at ?? existing?.ends_at, 'End time');
    if (ends <= starts)
        throw bad('End time must be after start time');
    const intIn = (v, dflt, f, max) => { const x = v === undefined || v === '' ? dflt : Number(v); if (!Number.isInteger(x) || x < 0 || x > max)
        throw bad(`${f} must be a whole number between 0 and ${max}`); return x; };
    const setup = intIn(d.setup_min, existing?.setup_min ?? 0, 'Setup minutes', 1440);
    const cleanup = intIn(d.cleanup_min, existing?.cleanup_min ?? 0, 'Cleanup minutes', 1440);
    const guests = intIn(d.guests, existing?.guests ?? 0, 'Guests', 100000);
    const evt = String(d.event_type ?? existing?.event_type ?? '').toLowerCase();
    if (!exports.EVENT_TYPES.includes(evt))
        throw bad('Event type must be one of: ' + exports.EVENT_TYPES.join(', '));
    const per = d.per_head === undefined ? (existing?.per_head_minor ?? 0) : L.parseMoney(d.per_head || '0', { field: 'Per-head rate' });
    const rent = d.rent === undefined ? (existing?.rent_minor ?? 0) : L.parseMoney(d.rent || '0', { field: 'Hall rent' });
    const pkg = d.package_id === undefined ? existing?.package_id ?? null : (d.package_id ? (await own(db, 'packages', d.package_id, tid, 'Package')).id : null);
    const w = blockWindow(starts, ends, setup, cleanup);
    return { customer, venue, starts, ends, setup, cleanup, guests, evt, per, rent, pkg, block_start: w.start, block_end: w.end, event_date: starts.slice(0, 10),
        requirements: d.requirements === undefined ? existing?.requirements ?? null : String(d.requirements).slice(0, 4000) };
}
async function createBooking(db, ctx, d) {
    const n = await normBooking(db, ctx, d, null);
    const status = d.status === undefined ? 'inquiry' : String(d.status);
    if (!['inquiry', 'tentative', 'confirmed'].includes(status))
        throw bad('New bookings can start as inquiry, tentative or confirmed');
    if (status === 'confirmed' && !L.can(ctx.user.role, 'bookings.confirm'))
        throw L.forbidden('Your role cannot confirm bookings');
    if (exports.HOLD.includes(status)) {
        const c = await conflictsFor(db, ctx.tid, n.venue.id, n.block_start, n.block_end, 0);
        if (c)
            throw overlapError(c);
    }
    const now = L.nowIso();
    const code = 'BK-' + String(await nextSeq(db, ctx.tid, 'booking')).padStart(4, '0');
    const r = await db.run(`INSERT INTO bookings(tenant_id,code,branch_id,customer_id,venue_id,status,event_type,event_date,starts_at,ends_at,setup_min,cleanup_min,
    block_start,block_end,guests,per_head_minor,rent_minor,package_id,requirements,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?::timestamp,?::timestamp,?,?,?,?,?,?,?,?)`, ctx.tid, code, n.venue.branch_id, n.customer.id, n.venue.id, status, n.evt, n.event_date, n.starts, n.ends, n.setup, n.cleanup, n.block_start, n.block_end, n.guests, n.per, n.rent, n.pkg, n.requirements, ctx.user.id, now, now);
    await db.run('INSERT INTO booking_status_history(tenant_id,booking_id,old_status,new_status,note,changed_by,created_at) VALUES(?,?,?,?,?,?,?)', ctx.tid, r.id, null, status, 'created', ctx.user.id, now);
    await audit(db, ctx, 'booking.create', 'booking', r.id, { code, status });
    return getBooking(db, ctx.tid, r.id);
}
async function getBooking(db, tid, id) {
    return db.get(`SELECT b.*, to_char(b.block_start,'YYYY-MM-DD"T"HH24:MI') AS block_start_s, to_char(b.block_end,'YYYY-MM-DD"T"HH24:MI') AS block_end_s,
    c.name AS customer_name, c.phone AS customer_phone, v.name AS venue_name FROM bookings b JOIN customers c ON c.id=b.customer_id JOIN venues v ON v.id=b.venue_id
    WHERE b.id=? AND b.tenant_id=?`, id, tid);
}
async function updateBooking(db, ctx, id, d) {
    const ex = await own(db, 'bookings', id, ctx.tid, 'Booking');
    if (ex.status === 'cancelled' || ex.status === 'completed')
        throw bad(`A ${ex.status} booking cannot be edited`);
    const n = await normBooking(db, ctx, d, ex);
    if (exports.HOLD.includes(ex.status)) {
        const c = await conflictsFor(db, ctx.tid, n.venue.id, n.block_start, n.block_end, ex.id);
        if (c)
            throw overlapError(c);
    }
    const moved = ex.starts_at !== n.starts || ex.ends_at !== n.ends || ex.venue_id !== n.venue.id;
    await db.run(`UPDATE bookings SET branch_id=?,customer_id=?,venue_id=?,event_type=?,event_date=?,starts_at=?,ends_at=?,setup_min=?,cleanup_min=?,block_start=?::timestamp,block_end=?::timestamp,
    guests=?,per_head_minor=?,rent_minor=?,package_id=?,requirements=?,updated_at=? WHERE id=? AND tenant_id=?`, n.venue.branch_id, n.customer.id, n.venue.id, n.evt, n.event_date, n.starts, n.ends, n.setup, n.cleanup, n.block_start, n.block_end, n.guests, n.per, n.rent, n.pkg, n.requirements, L.nowIso(), ex.id, ctx.tid);
    if (moved)
        await db.run('INSERT INTO booking_status_history(tenant_id,booking_id,old_status,new_status,note,changed_by,created_at) VALUES(?,?,?,?,?,?,?)', ctx.tid, ex.id, ex.status, ex.status, `rescheduled from ${ex.starts_at} (hall ${ex.venue_id}) to ${n.starts} (hall ${n.venue.id})`, ctx.user.id, L.nowIso());
    await audit(db, ctx, moved ? 'booking.reschedule' : 'booking.update', 'booking', ex.id, { from: ex.starts_at, to: n.starts });
    return getBooking(db, ctx.tid, ex.id);
}
const TRANSITIONS = { inquiry: ['tentative', 'confirmed', 'cancelled'], tentative: ['confirmed', 'cancelled', 'inquiry'], confirmed: ['completed', 'cancelled', 'tentative'], completed: [], cancelled: ['inquiry', 'tentative'] };
async function setStatus(db, ctx, id, to, note) {
    const b = await own(db, 'bookings', id, ctx.tid, 'Booking');
    if (!TRANSITIONS[b.status]?.includes(to))
        throw bad(`Cannot change a ${b.status} booking to ${to}`);
    if (to === 'confirmed' && !L.can(ctx.user.role, 'bookings.confirm'))
        throw L.forbidden('Your role cannot confirm bookings');
    if (to === 'cancelled' && !String(note || '').trim())
        throw bad('Please give a cancellation reason');
    if (to === 'completed') {
        const t = L.todayIn((await db.get('SELECT timezone FROM tenants WHERE id=?', ctx.tid)).timezone);
        if (b.event_date > t)
            throw bad('An event in the future cannot be marked completed yet');
    }
    if (exports.HOLD.includes(to)) {
        const bl = await db.get(`SELECT to_char(block_start,'YYYY-MM-DD"T"HH24:MI') s, to_char(block_end,'YYYY-MM-DD"T"HH24:MI') e FROM bookings WHERE id=?`, b.id);
        const c = await conflictsFor(db, ctx.tid, b.venue_id, bl.s, bl.e, b.id);
        if (c)
            throw overlapError(c);
    }
    await db.run('UPDATE bookings SET status=?, cancel_reason=?, updated_at=? WHERE id=? AND tenant_id=?', to, to === 'cancelled' ? String(note).slice(0, 500) : b.cancel_reason, L.nowIso(), b.id, ctx.tid);
    await db.run('INSERT INTO booking_status_history(tenant_id,booking_id,old_status,new_status,note,changed_by,created_at) VALUES(?,?,?,?,?,?,?)', ctx.tid, b.id, b.status, to, note ? String(note).slice(0, 500) : null, ctx.user.id, L.nowIso());
    await audit(db, ctx, 'booking.status', 'booking', b.id, { from: b.status, to });
    return getBooking(db, ctx.tid, b.id);
}
const bookingServices = (db, tid, bid) => db.all('SELECT * FROM booking_services WHERE tenant_id=? AND booking_id=? ORDER BY id', tid, bid);
exports.bookingServices = bookingServices;
async function bookingEstimate(db, b) {
    const items = [];
    if (b.guests > 0 && b.per_head_minor > 0)
        items.push({ description: `Catering (${b.guests} guests x per head)`, qty_milli: b.guests * 1000, unit_minor: b.per_head_minor });
    if (b.rent_minor > 0)
        items.push({ description: 'Hall rent', qty_milli: 1000, unit_minor: b.rent_minor });
    for (const s of await (0, exports.bookingServices)(db, b.tenant_id, b.id))
        items.push({ description: s.description, qty_milli: s.qty_milli, unit_minor: s.unit_minor });
    return items;
}
// ---------- invoices / quotes ----------
function compute(items, discount, taxBp) {
    const lines = items.map((it, i) => ({ ...it, line_minor: L.lineTotal(it.qty_milli, it.unit_minor), position: i }));
    const subtotal = lines.reduce((s, l) => s + l.line_minor, 0);
    if (discount > subtotal)
        throw bad('Discount cannot be more than the subtotal');
    const tax = L.taxOf(subtotal - discount, taxBp);
    return { lines, subtotal, tax, total: subtotal - discount + tax };
}
function parseItems(raw) {
    if (!Array.isArray(raw) || raw.length === 0)
        throw bad('Add at least one line item');
    if (raw.length > 100)
        throw bad('Too many line items');
    return raw.map((r, i) => {
        const description = String(r.description || '').trim().slice(0, 200);
        if (!description)
            throw bad(`Line ${i + 1}: description is required`);
        return { description, qty_milli: L.parseQty(r.qty ?? '1', { field: `Line ${i + 1} quantity` }), unit_minor: L.parseMoney(r.unit ?? '0', { field: `Line ${i + 1} rate` }) };
    });
}
async function writeInvoiceBody(db, ctx, inv, d) {
    const t = await db.get('SELECT default_tax_bp, terms FROM tenants WHERE id=?', ctx.tid);
    const items = d.items !== undefined ? parseItems(d.items) : await db.all('SELECT description, qty_milli, unit_minor FROM invoice_items WHERE invoice_id=? ORDER BY position', inv.id);
    const discount = d.discount !== undefined ? L.parseMoney(d.discount || '0', { field: 'Discount' }) : inv.discount_minor;
    let discountBy = inv.discount_by;
    if (discount !== inv.discount_minor) {
        if (discount > 0 && !L.can(ctx.user.role, 'invoices.discount'))
            throw L.forbidden('A discount needs manager, accountant or owner approval');
        discountBy = discount > 0 ? ctx.user.id : null;
    }
    const taxBp = d.tax_percent !== undefined ? L.parseBp(d.tax_percent) : inv.tax_bp;
    const c = compute(items, discount, taxBp);
    await db.run('DELETE FROM invoice_items WHERE invoice_id=? AND tenant_id=?', inv.id, ctx.tid);
    for (const l of c.lines)
        await db.run('INSERT INTO invoice_items(tenant_id,invoice_id,description,qty_milli,unit_minor,line_minor,position) VALUES(?,?,?,?,?,?,?)', ctx.tid, inv.id, l.description, l.qty_milli, l.unit_minor, l.line_minor, l.position);
    await db.run('UPDATE invoices SET subtotal_minor=?,discount_minor=?,discount_by=?,tax_bp=?,tax_minor=?,total_minor=?,notes=?,terms=? WHERE id=? AND tenant_id=?', c.subtotal, discount, discountBy, taxBp, c.tax, c.total, d.notes === undefined ? inv.notes : String(d.notes).slice(0, 1000), d.terms === undefined ? (inv.terms ?? t.terms) : String(d.terms).slice(0, 4000), inv.id, ctx.tid);
}
async function createInvoiceDraft(db, ctx, bookingId, kind, d = {}) {
    if (!['quote', 'invoice'].includes(kind))
        throw bad('Kind must be quote or invoice');
    const b = await own(db, 'bookings', bookingId, ctx.tid, 'Booking');
    if (b.status === 'cancelled')
        throw bad('Cannot bill a cancelled booking');
    const t = await db.get('SELECT default_tax_bp, terms FROM tenants WHERE id=?', ctx.tid);
    const r = await db.run('INSERT INTO invoices(tenant_id,booking_id,customer_id,kind,status,tax_bp,terms,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)', ctx.tid, b.id, b.customer_id, kind, 'draft', t.default_tax_bp, t.terms, ctx.user.id, L.nowIso());
    const inv = await db.get('SELECT * FROM invoices WHERE id=?', r.id);
    const body = { ...d };
    if (body.items === undefined) {
        const est = await bookingEstimate(db, b);
        if (est.length === 0)
            throw bad('Booking has no guests/rate/rent/services yet. Enter line items manually.');
        body.items = est.map((e) => ({ description: e.description, qty: String(e.qty_milli / 1000), unit: (e.unit_minor / 100).toFixed(2) }));
    }
    await writeInvoiceBody(db, ctx, inv, body);
    await audit(db, ctx, `${kind}.create`, 'invoice', r.id, { booking: b.code });
    return getInvoice(db, ctx.tid, r.id);
}
async function updateInvoiceDraft(db, ctx, id, d) {
    const inv = await own(db, 'invoices', id, ctx.tid, 'Invoice');
    if (inv.status !== 'draft')
        throw bad('Issued documents cannot be edited. Use a credit note or void and re-issue.', 'FROZEN');
    await writeInvoiceBody(db, ctx, inv, d);
    await audit(db, ctx, 'invoice.update', 'invoice', inv.id);
    return getInvoice(db, ctx.tid, inv.id);
}
async function deleteInvoiceDraft(db, ctx, id) {
    const inv = await own(db, 'invoices', id, ctx.tid, 'Invoice');
    if (inv.status !== 'draft')
        throw bad('Only drafts can be deleted', 'FROZEN');
    await db.run('DELETE FROM invoice_items WHERE invoice_id=? AND tenant_id=?', inv.id, ctx.tid);
    await db.run('DELETE FROM invoices WHERE id=? AND tenant_id=?', inv.id, ctx.tid);
    await audit(db, ctx, 'invoice.delete_draft', 'invoice', inv.id);
    return { ok: true };
}
async function issueInvoice(db, ctx, id) {
    const inv = await own(db, 'invoices', id, ctx.tid, 'Invoice');
    if (inv.status !== 'draft')
        throw bad('Already issued');
    if (inv.total_minor <= 0)
        throw bad('Total must be more than zero to issue');
    const t = await db.get('SELECT invoice_prefix, timezone FROM tenants WHERE id=?', ctx.tid);
    const date = L.todayIn(t.timezone);
    const seq = await nextSeq(db, ctx.tid, inv.kind === 'quote' ? 'quote' : 'invoice');
    const prefix = inv.kind === 'quote' ? 'QT' : t.invoice_prefix;
    const number = `${prefix}-${date.slice(0, 4)}-${String(seq).padStart(4, '0')}`;
    await db.run("UPDATE invoices SET status='issued', number=?, issue_date=? WHERE id=? AND tenant_id=?", number, date, inv.id, ctx.tid);
    if (inv.kind === 'invoice')
        await allocate(db, ctx, inv.booking_id);
    await audit(db, ctx, `${inv.kind}.issue`, 'invoice', inv.id, { number, total: inv.total_minor });
    return getInvoice(db, ctx.tid, inv.id);
}
const invoiceAllocated = async (db, id) => (await db.get('SELECT COALESCE(SUM(amount_minor),0) a FROM payment_allocations WHERE invoice_id=?', id)).a;
exports.invoiceAllocated = invoiceAllocated;
const invoiceCredits = async (db, id) => (await db.get('SELECT COALESCE(SUM(amount_minor),0) a FROM credit_notes WHERE invoice_id=?', id)).a;
exports.invoiceCredits = invoiceCredits;
async function getInvoice(db, tid, id) {
    const inv = await own(db, 'invoices', id, tid, 'Invoice');
    const items = await db.all('SELECT * FROM invoice_items WHERE invoice_id=? AND tenant_id=? ORDER BY position', id, tid);
    const credits = await (0, exports.invoiceCredits)(db, id), paid = await (0, exports.invoiceAllocated)(db, id);
    return { ...inv, items, credits_minor: credits, paid_minor: paid, due_minor: inv.status === 'issued' && inv.kind === 'invoice' ? inv.total_minor - credits - paid : 0,
        credit_notes: await db.all('SELECT * FROM credit_notes WHERE invoice_id=? AND tenant_id=? ORDER BY id', id, tid) };
}
async function voidInvoice(db, ctx, id, reason) {
    const inv = await own(db, 'invoices', id, ctx.tid, 'Invoice');
    if (inv.status !== 'issued')
        throw bad('Only issued documents can be voided');
    if (!String(reason || '').trim())
        throw bad('Please give a reason');
    if ((await (0, exports.invoiceAllocated)(db, inv.id)) !== 0)
        throw bad('Payments are applied to this invoice. Refund or reverse them first.');
    if ((await (0, exports.invoiceCredits)(db, inv.id)) !== 0)
        throw bad('This invoice has credit notes and cannot be voided');
    await db.run("UPDATE invoices SET status='void', void_reason=? WHERE id=? AND tenant_id=?", String(reason).slice(0, 500), inv.id, ctx.tid);
    await audit(db, ctx, 'invoice.void', 'invoice', inv.id, { number: inv.number, reason });
    return getInvoice(db, ctx.tid, inv.id);
}
async function creditNote(db, ctx, id, d) {
    const inv = await own(db, 'invoices', id, ctx.tid, 'Invoice');
    if (inv.status !== 'issued' || inv.kind !== 'invoice')
        throw bad('Credit notes apply to issued invoices');
    const amt = L.parseMoney(d.amount, { allowZero: false, field: 'Credit amount' });
    if (!String(d.reason || '').trim())
        throw bad('Please give a reason');
    if (amt > inv.total_minor - (await (0, exports.invoiceCredits)(db, inv.id)))
        throw bad('Credit is more than the invoice total');
    const number = 'CN-' + String(await nextSeq(db, ctx.tid, 'credit')).padStart(4, '0');
    await db.run('INSERT INTO credit_notes(tenant_id,invoice_id,number,amount_minor,reason,created_by,created_at) VALUES(?,?,?,?,?,?,?)', ctx.tid, inv.id, number, amt, String(d.reason).slice(0, 500), ctx.user.id, L.nowIso());
    await allocate(db, ctx, inv.booking_id);
    await audit(db, ctx, 'creditnote.create', 'invoice', inv.id, { number, amount: amt });
    return getInvoice(db, ctx.tid, inv.id);
}
// ---------- payments ----------
const paymentNet = async (db, id) => (await db.get('SELECT p.amount_minor - COALESCE((SELECT SUM(amount_minor) FROM payment_adjustments WHERE payment_id=p.id),0) AS n FROM payments p WHERE p.id=?', id)).n;
exports.paymentNet = paymentNet;
const paymentAllocated = async (db, id) => (await db.get('SELECT COALESCE(SUM(amount_minor),0) a FROM payment_allocations WHERE payment_id=?', id)).a;
// Append-only: applies unallocated receipts to open invoices of the booking, oldest first.
async function allocate(db, ctx, bookingId) {
    const pays = await db.all('SELECT id FROM payments WHERE tenant_id=? AND booking_id=? ORDER BY id', ctx.tid, bookingId);
    const invs = await db.all("SELECT id, total_minor FROM invoices WHERE tenant_id=? AND booking_id=? AND kind='invoice' AND status='issued' ORDER BY id", ctx.tid, bookingId);
    for (const p of pays) {
        let free = (await (0, exports.paymentNet)(db, p.id)) - (await paymentAllocated(db, p.id));
        for (const i of invs) {
            if (free <= 0)
                break;
            const due = i.total_minor - (await (0, exports.invoiceCredits)(db, i.id)) - (await (0, exports.invoiceAllocated)(db, i.id));
            if (due <= 0)
                continue;
            const a = Math.min(free, due);
            await db.run('INSERT INTO payment_allocations(tenant_id,payment_id,invoice_id,amount_minor,created_at) VALUES(?,?,?,?,?)', ctx.tid, p.id, i.id, a, L.nowIso());
            free -= a;
        }
    }
}
async function paymentView(db, p) {
    const net = await (0, exports.paymentNet)(db, p.id);
    return { ...p, adjusted_minor: p.amount_minor - net, net_minor: net, allocated_minor: await paymentAllocated(db, p.id),
        adjustments: await db.all('SELECT * FROM payment_adjustments WHERE payment_id=? ORDER BY id', p.id) };
}
async function recordPayment(db, ctx, d) {
    const b = await own(db, 'bookings', d.booking_id, ctx.tid, 'Booking');
    if (b.status === 'cancelled')
        throw bad('Booking is cancelled. Record refunds on existing payments instead.');
    const amt = L.parseMoney(d.amount, { allowZero: false, field: 'Amount' });
    if (!['cash', 'bank', 'card', 'digital', 'cheque'].includes(d.method))
        throw bad('Choose a payment method');
    const key = d.idempotency_key ? String(d.idempotency_key).slice(0, 80) : null;
    if (key) {
        const dup = await db.get('SELECT * FROM payments WHERE tenant_id=? AND idempotency_key=?', ctx.tid, key);
        if (dup)
            return { ...(await paymentView(db, dup)), duplicate: true };
    }
    const t = await db.get('SELECT timezone FROM tenants WHERE id=?', ctx.tid);
    const today = L.todayIn(t.timezone);
    const on = d.received_on ? L.checkDate(d.received_on, 'Date') : today;
    if (on > today)
        throw bad('Payment date cannot be in the future');
    const receipt = 'RCP-' + String(await nextSeq(db, ctx.tid, 'receipt')).padStart(6, '0');
    const r = await db.run('INSERT INTO payments(tenant_id,booking_id,customer_id,receipt_no,amount_minor,method,reference,note,received_on,idempotency_key,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', ctx.tid, b.id, b.customer_id, receipt, amt, d.method, d.reference ? String(d.reference).slice(0, 100) : null, d.note ? String(d.note).slice(0, 300) : null, on, key, ctx.user.id, L.nowIso());
    await allocate(db, ctx, b.id);
    await audit(db, ctx, 'payment.create', 'payment', r.id, { receipt, amount: amt, method: d.method });
    return paymentView(db, await db.get('SELECT * FROM payments WHERE id=?', r.id));
}
async function adjustPayment(db, ctx, id, d) {
    const p = await own(db, 'payments', id, ctx.tid, 'Payment');
    const kind = d.kind;
    if (!['refund', 'reversal'].includes(kind))
        throw bad('Choose refund or reversal');
    const amt = L.parseMoney(d.amount, { allowZero: false, field: 'Amount' });
    if (!String(d.reason || '').trim())
        throw bad('Please give a reason');
    const net = await (0, exports.paymentNet)(db, p.id);
    if (amt > net)
        throw bad('More than what is left on this receipt');
    const t = await db.get('SELECT timezone FROM tenants WHERE id=?', ctx.tid);
    const free = net - (await paymentAllocated(db, p.id));
    await db.run('INSERT INTO payment_adjustments(tenant_id,payment_id,kind,amount_minor,method,reference,reason,adjusted_on,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)', ctx.tid, p.id, kind, amt, kind === 'refund' ? (d.method || p.method) : null, d.reference ? String(d.reference).slice(0, 100) : null, String(d.reason).slice(0, 300), L.todayIn(t.timezone), ctx.user.id, L.nowIso());
    // take back from the unapplied part first, then from the latest invoice allocations (negative rows; nothing is edited)
    let take = Math.max(0, amt - Math.max(0, free));
    if (take > 0) {
        const rows = await db.all('SELECT invoice_id, SUM(amount_minor) AS a FROM payment_allocations WHERE payment_id=? GROUP BY invoice_id HAVING SUM(amount_minor)>0 ORDER BY invoice_id DESC', p.id);
        for (const r of rows) {
            if (take <= 0)
                break;
            const x = Math.min(take, r.a);
            await db.run('INSERT INTO payment_allocations(tenant_id,payment_id,invoice_id,amount_minor,created_at) VALUES(?,?,?,?,?)', ctx.tid, p.id, r.invoice_id, -x, L.nowIso());
            take -= x;
        }
    }
    await audit(db, ctx, 'payment.' + kind, 'payment', p.id, { amount: amt, reason: d.reason });
    await allocate(db, ctx, p.booking_id);
    return paymentView(db, await db.get('SELECT * FROM payments WHERE id=?', p.id));
}
async function bookingFinance(db, tid, bid) {
    const invs = await db.all("SELECT id,total_minor FROM invoices WHERE tenant_id=? AND booking_id=? AND kind='invoice' AND status='issued'", tid, bid);
    let invoiced = 0, credits = 0, applied = 0;
    for (const i of invs) {
        invoiced += i.total_minor;
        credits += await (0, exports.invoiceCredits)(db, i.id);
        applied += await (0, exports.invoiceAllocated)(db, i.id);
    }
    const pays = await db.all('SELECT id FROM payments WHERE tenant_id=? AND booking_id=?', tid, bid);
    let received = 0;
    for (const p of pays)
        received += await (0, exports.paymentNet)(db, p.id);
    const refunded = (await db.get("SELECT COALESCE(SUM(a.amount_minor),0) s FROM payment_adjustments a JOIN payments p ON p.id=a.payment_id WHERE p.tenant_id=? AND p.booking_id=? AND a.kind='refund'", tid, bid)).s;
    return { invoiced_minor: invoiced, credits_minor: credits, net_invoiced_minor: invoiced - credits, received_net_minor: received, refunded_minor: refunded,
        applied_minor: applied, outstanding_minor: invoiced - credits - applied, advance_held_minor: received - applied };
}
//# sourceMappingURL=domain.js.map