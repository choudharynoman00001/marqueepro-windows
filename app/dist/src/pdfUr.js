"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TS = exports.TT = exports.T = exports.pdfLang = void 0;
exports.urText = urText;
exports.withUrduLabels = withUrduLabels;
// Urdu for the fixed words in business PDFs (headings, column names, labels). Machine draft, not reviewed by a native speaker.
// Only exact fixed labels are translated. Names, notes the owner typed, numbers and dates are never changed.
const async_hooks_1 = require("async_hooks");
exports.pdfLang = new async_hooks_1.AsyncLocalStorage();
const D = {
    Address: 'پتہ', Amount: 'رقم', 'Amount received': 'وصول شدہ رقم', 'BOOKING CONTRACT': 'بکنگ معاہدہ', Balance: 'بقایا', 'Billed so far': 'اب تک بل شدہ', 'Billed to': 'بنام', Booking: 'بکنگ',
    'COLLECTIONS REPORT': 'وصولیوں کی رپورٹ', 'Cash collected only. This is not profit.': 'صرف وصول شدہ نقد۔ یہ منافع نہیں۔', Customer: 'گاہک', 'Customer signature': 'گاہک کے دستخط', 'DAILY EVENT SCHEDULE': 'روزانہ تقریبات کا شیڈول',
    Date: 'تاریخ', Description: 'تفصیل', 'Dietary requirements': 'غذائی ضروریات', Discount: 'رعایت', Entry: 'اندراج', 'Equipment out with this event': 'اس تقریب کے ساتھ جاری سامان', Event: 'تقریب', 'For the business': 'کاروبار کی طرف سے',
    Guests: 'مہمان', Hall: 'ہال', 'In stock': 'اسٹاک میں', 'Ingredients needed (recipe quantity per guest x guests)': 'درکار اجزا (فی مہمان ترکیب کی مقدار × مہمان)', Issued: 'جاری', Item: 'آئٹم', 'KITCHEN PREP SHEET': 'کچن تیاری شیٹ',
    'Line value': 'لائن کی مالیت', Menu: 'مینو', Method: 'طریقہ', Needed: 'درکار', 'Net after refunds': 'ریفنڈ کے بعد خالص', 'Net collected': 'خالص وصولی', 'No entries for this selection.': 'اس انتخاب میں کوئی اندراج نہیں۔',
    'No events on this day.': 'اس دن کوئی تقریب نہیں۔', 'No menu has been set for this booking.': 'اس بکنگ کا مینو طے نہیں کیا گیا۔', 'No receipts or adjustments in this period.': 'اس مدت میں کوئی رسید یا ایڈجسٹمنٹ نہیں۔',
    'No recipes are linked to this menu, so no ingredient quantities can be calculated.': 'اس مینو سے کوئی ترکیب منسلک نہیں، اس لیے اجزا کی مقدار نہیں نکالی جا سکتی۔', 'None recorded.': 'کچھ درج نہیں۔', 'Nothing issued yet.': 'ابھی کچھ جاری نہیں ہوا۔',
    Ordered: 'آرڈر شدہ', 'Ordered value': 'آرڈر کی مالیت', 'PURCHASE ORDER': 'خریداری آرڈر', 'Paid so far': 'اب تک ادا', Qty: 'مقدار', Rate: 'ریٹ', Received: 'وصول', 'Received from': 'وصول کنندہ از', 'Received value': 'وصول شدہ مالیت',
    Reference: 'حوالہ', Refunded: 'ریفنڈ', Returned: 'واپس', Reversed: 'ریورس', Short: 'کمی', Status: 'حالت', 'Still out': 'ابھی باہر', Subtotal: 'ذیلی کل', Tasks: 'کام', Tax: 'ٹیکس', Terms: 'شرائط', 'Terms and conditions': 'شرائط و ضوابط',
    Time: 'وقت', Total: 'کل', Unit: 'یونٹ', 'Unit cost': 'فی یونٹ لاگت', 'VENDOR ADVANCE': 'وینڈر ایڈوانس', 'VENDOR BILL': 'وینڈر بل', 'VENDOR DOCUMENT': 'وینڈر دستاویز', 'VENDOR QUOTATION': 'وینڈر کوٹیشن', Vendor: 'وینڈر',
    COLLECTIONS: 'وصولیاں', 'EVENT-WISE ESTIMATED MARGIN': 'تقریب وار تخمینی منافع', 'HALL REVENUE': 'ہال کی آمدنی', 'PROFIT AND LOSS (CASH BASIS)': 'نفع و نقصان (کیش بنیاد)', RECEIVABLES: 'قابل وصول', 'TAX SUMMARY': 'ٹیکس خلاصہ',
    Note: 'نوٹ', 'Due on': 'واجب الادا', Reason: 'وجہ', 'For booking': 'بکنگ', Voided: 'کالعدم', Quote: 'کوٹیشن', Type: 'قسم', Invoiced: 'انوائس شدہ', Expenses: 'اخراجات', Margin: 'منافع', 'Margin per head': 'فی کس منافع', In: 'آمد', Out: 'اخراج', Bookings: 'بکنگز', Invoice: 'انوائس', Due: 'واجب الادا', Line: 'مد', Invoices: 'انوائسز', Taxable: 'قابل ٹیکس',
    'Closing balance': 'اختتامی بیلنس', 'Estimated margin': 'تخمینی منافع', 'Expenses tagged to events': 'تقریبات سے منسلک اخراجات', 'Less refunded': 'منفی ریفنڈ', 'Less reversed': 'منفی ریورس', 'Money in': 'آمد', 'Money out': 'اخراج', Net: 'خالص',
    'Salaries paid': 'ادا شدہ تنخواہیں', 'Total in': 'کل آمد', 'Total invoiced': 'کل انوائس شدہ', 'Total ordinary expenses': 'کل عام اخراجات', 'Total out': 'کل اخراج', 'Total outstanding': 'کل بقایا', 'Total salaries paid': 'کل ادا شدہ تنخواہیں',
    'Total vendor payments': 'کل وینڈر ادائیگیاں', 'Vendor payments': 'وینڈر ادائیگیاں', 'Developed by Chaudhry Noman | Powered by Alpha Blue Digital': '',
    'Contract terms have not been configured by the business. Add them in Settings before using this document as a contract.': 'کاروبار نے معاہدے کی شرائط ترتیب نہیں دیں۔ اس دستاویز کو معاہدے کے طور پر استعمال کرنے سے پہلے سیٹنگز میں شرائط لکھیں۔',
    'Record of what was entered in the system. It states no terms, tax or delivery conditions; add those by agreement with the vendor.': 'یہ سسٹم میں درج معلومات کا ریکارڈ ہے۔ اس میں کوئی شرائط، ٹیکس یا ڈیلیوری کی شرط درج نہیں؛ وہ وینڈر سے طے کر کے شامل کریں۔',
    'Record of what was entered in the system. Values are quantity x the unit cost entered. It states no terms, tax, delivery date or payment condition; add those by agreement with the vendor.': 'یہ سسٹم میں درج معلومات کا ریکارڈ ہے۔ قدریں مقدار × درج فی یونٹ لاگت ہیں۔ اس میں کوئی شرائط، ٹیکس، ڈیلیوری کی تاریخ یا ادائیگی کی شرط درج نہیں؛ وہ وینڈر سے طے کر کے شامل کریں۔',
    'Cancellation policy': 'منسوخی کی پالیسی', 'Refund policy': 'ریفنڈ کی پالیسی', 'Not configured by the business.': 'کاروبار نے ترتیب نہیں دی۔',
    RECEIPT: 'رسید', INVOICE: 'انوائس', QUOTE: 'کوٹیشن', QUOTATION: 'کوٹیشن', 'Receipt': 'رسید',
    'Cash basis: money actually received minus money actually paid out in the period. Receipts recorded as card, digital or cheque count as received here; they are not confirmed as cleared into the bank. Not an accrual or tax statement.': 'کیش بنیاد: مدت میں اصل وصول رقم منفی اصل ادا رقم۔ کارڈ، ڈیجیٹل یا چیک سے درج رسیدیں یہاں وصول شمار ہیں؛ بینک میں کلیئر ہونے کی تصدیق نہیں۔ یہ ایکروئل یا ٹیکس گوشوارہ نہیں۔',
};
delete D['Developed by Chaudhry Noman | Powered by Alpha Blue Digital'];
const ST = { confirmed: 'تصدیق شدہ', tentative: 'عارضی', inquiry: 'انکوائری', completed: 'مکمل', draft: 'ڈرافٹ', issued: 'جاری', voided: 'کالعدم', paid: 'ادا شدہ', open: 'کھلا', cancelled: 'منسوخ', ordered: 'آرڈر شدہ', received: 'وصول' };
const w = (s) => D[s] ?? s;
function urText(s) {
    if (D[s])
        return D[s];
    const t = s.trim();
    if (D[t])
        return s.replace(t, D[t]);
    let m;
    if ((m = s.match(/^(Booking|Status|Date): (.+)$/)))
        return `${w(m[1])}: ${m[1] === 'Status' ? (ST[m[2]] ?? m[2]) : m[2]}`;
    if ((m = s.match(/^Booking ([A-Z0-9-]+)$/)))
        return `بکنگ ${m[1]}`;
    if ((m = s.match(/^(INVOICE|QUOTE|QUOTATION|RECEIPT) (.+)$/)))
        return `${w(m[1])} ${m[2]}`;
    if ((m = s.match(/^(.+?) \(VOIDED\)$/)))
        return `${urText(m[1])} (کالعدم)`;
    if ((m = s.match(/^(.+?) \(CANCELLED\)$/)))
        return `${urText(m[1])} (منسوخ)`;
    if ((m = s.match(/^PURCHASE ORDER (PO-\d+)(.*)$/)))
        return `خریداری آرڈر ${m[1]}${m[2]}`;
    if ((m = s.match(/^Date (\S+)   Status: (.+)$/)))
        return `${w('Date')} ${m[1]}   ${w('Status')}: ${ST[m[2]] ?? m[2]}`;
    if ((m = s.match(/^(\d{4}-\d\d-\d\d) to (\d{4}-\d\d-\d\d)$/)))
        return `${m[1]} - ${m[2]}`;
    if ((m = s.match(/^Ref (VB-\d+)   Date (\S+)$/)))
        return `حوالہ ${m[1]}   تاریخ ${m[2]}`;
    return s;
}
const T = (s) => (exports.pdfLang.getStore() === 'ur' ? (D[s] ?? s) : s);
exports.T = T;
const TT = (s) => (exports.pdfLang.getStore() === 'ur' ? urText(s) : s);
exports.TT = TT;
const TS = (s) => (exports.pdfLang.getStore() === 'ur' ? (ST[String(s)] ?? String(s)) : String(s));
exports.TS = TS;
function withUrduLabels(d) {
    void d; // labels are translated at their call sites with T(); owner-typed text is never passed through a global matcher
}
//# sourceMappingURL=pdfUr.js.map