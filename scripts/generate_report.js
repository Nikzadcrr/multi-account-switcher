// generate_report.js — گزارش فارسی RTL: استخراج API ایمیل موقت از اپ Instant Mail 8.6.0
const {
  Document, Packer, Paragraph, TextRun, Header, Footer, PageNumber, NumberFormat,
  AlignmentType, HeadingLevel, SectionType, TableOfContents, PageBreak,
} = require("docx");
const fs = require("fs");
const {
  P, FA, fa, en, bodyP, h1, h2, codeBlock, tableTitle, rtlTable, cellRuns,
  buildCoverR1RTL,
} = require("./report_helpers.js");

const OUT = "/home/z/my-project/download/InstantMail_API_Report.docx";
const pgSize = { width: 11906, height: 16838 };
const pgMargin = { top: 1440, bottom: 1440, left: 1417, right: 1417 };

// ─── footers ───
const numFooter = () => new Footer({
  children: [new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: P.secondary, font: FA })],
  })],
});
const docHeader = () => new Header({
  children: [new Paragraph({
    bidirectional: true, alignment: AlignmentType.START,
    border: { bottom: { style: "single", size: 2, color: "D5DCE5" } },
    spacing: { after: 60 },
    children: [fa("گزارش مهندسی معکوس اپلیکیشن Instant Mail 8.6.0", { size: 16, color: P.secondary })],
  })],
});

// ══════════════════ BODY CONTENT ══════════════════
const body = [];

// ─── 1. خلاصه اجرایی ───
body.push(h1("1. خلاصه اجرایی"));
body.push(bodyP("این گزارش نتیجه مهندسی معکوس اپلیکیشن اندرویدی Instant Mail نسخه 8.6.0 (شناسه پکیج com.temporary.email.pro) است. فایل APK از لینک ارائه‌شده دانلود و باندل جاوااسکریپت آن (assets/index.android.bundle با فرمت بایت‌کد Hermes نسخه 96) دیکامپایل شد. از آنجا که فایل ری‌پک شده و امضای متفاوتی (MOBAROK) داشت، بررسی صحت SHA-1 انتهای فایل در ابزار دیساسمبلر غیرفعال و سپس کل باندل به زبان اسمبلی تبدیل شد؛ در ادامه جدول رشته‌ها، توابع ماژول‌ها و ساختار درخواست‌های شبکه به‌صورت کامل بازسازی شد."));
body.push(bodyP("یافته اصلی این است که اپ به چهار سرویس ایمیل موقت متصل می‌شود: سرویس اختصاصی HD (پیش‌فرض) و HD_GMAIL روی زیرساخت 1timetech.com، سرویس temp-mail.org از طریق API موبایل آن (mob2.temp-mail.org) و سرویس temp-mail.io از طریق API وب آن. برای سرویس اختصاصی HD، ورودی و خروجی همه درخواست‌ها داخل یک «پاکت» کدگذاری‌شده قرار می‌گیرد که الگوریتم آن (معکوس‌سازی رشته Base64 و جابه‌جایی کاراکترها با کلید ao-sq-=x-5b-4*-Bz) به‌طور کامل از بایت‌کد استخراج و بازپیاده‌سازی شد. همه endpoint های کشف‌شده به‌صورت زنده تست شدند و هر چهار سرویس با موفقیت پاسخ دادند؛ نمونه پاسخ‌های واقعی در بخش 10 آمده است."));
body.push(bodyP("در کنار مستندات، یک کلاینت پایتون آماده به اجرا (instant_mail_api_client.py) نیز تهیه شده که هر چهار سرویس را با همان پارامترها و هدرهای اپلیکیشن اصلی فراخوانی می‌کند و می‌توان از آن برای ساخت ایمیل موقت و دریافت پیام‌ها استفاده کرد."));

// ─── 2. روش استخراج ───
body.push(h1("2. روش استخراج"));
body.push(bodyP("مراحل کار به ترتیب زیر انجام شد و در هر گام، خروجی با گام بعدی صحت‌سنجی شد:"));
body.push(...codeBlock([
  "1)  unzip instant_mail.apk  →  assets/index.android.bundle (Hermes v96)",
  "2)  hbc-disassembler bundle  →  bundle.asm (883,785 خط، 19,386 رشته)",
  "3)  جستجوی جدول رشته‌ها  →  پایگاه‌های API، مسیرها، کلیدها",
  "4)  ردیابی توابع ماژول هر سرویس  →  بازسازی endpoint ها",
  "5)  بازپیاده‌سازی الگوریتم کدگذاری HD  →  تایید رفت و برگشت",
  "6)  تست زنده همه endpoint ها با پارامترهای اصلی اپ  →  موفق",
]));
body.push(bodyP("نکته فنی مهم این است که فایل باندل به‌دلیل ری‌پک شدن، فیلد SHA-1 انتهایی نامعتبری داشت؛ بنابراین بررسی یکپارچگی در hermes-dec غیرفعال شد. همچنین چون خروجی خام دیساسمبلر رشته‌های مجاور را به‌هم‌چسبیده نشان می‌دهد، برای دستیابی به رشته‌های تمیز از جدول رشته‌های خود بایت‌کد استفاده شد و endpoint ها با ردیابی فراخوانی‌های axios در توابع مخصوص هر سرویس بازسازی شدند."));

// ─── 3. مشخصات فنی اپلیکیشن ───
body.push(h1("3. مشخصات فنی اپلیکیشن"));
body.push(bodyP("اپلیکیشن با فریم‌ورک React Native و پلتفرم Expo ساخته شده و منطق اصلی آن در قالب بایت‌کد Hermes داخل خود APK قرار دارد. مشخصات کلیدی استخراج‌شده از AndroidManifest و فایل app.config در جدول زیر آمده است."));
body.push(tableTitle("جدول 1 — مشخصات اپلیکیشن"));
body.push(rtlTable(
  ["ویژگی", "مقدار"],
  [
    ["نام اپ / توسعه‌دهنده", "Instant Mail — حساب Expo: hoangdaicntt"],
    [cellRuns([{ text: "شناسه پکیج", }]), cellRuns([{ text: "com.temporary.email.pro", ltr: true }])],
    ["نسخه", "8.6.0 (versionCode 601250338، runtimeVersion 80)"],
    ["فریم‌ورک", "React Native + Expo SDK 54، موتور Hermes (بایت‌کد نسخه 96)"],
    ["حجم باندل JS", "حدود 4.97 مگابایت (index.android.bundle)"],
    ["امضای APK", "MOBAROK — نشانه ری‌پک شدن فایل نصبی"],
    [cellRuns([{ text: "سرویس به‌روزرسانی OTA", }]), cellRuns([{ text: "https://expo-service.1timetech.com/update/temporary-email-pro", ltr: true }])],
    [cellRuns([{ text: "شناسه AdMob", }]), cellRuns([{ text: "ca-app-pub-2528767647739792~4986140395", ltr: true }])],
  ],
  [30, 70]
));

// ─── 4. معماری سرویس‌ها ───
body.push(h1("4. معماری سرویس‌های ایمیل"));
body.push(bodyP("مدیریت ایمیل در اپ از یک لایه انتزاع (Service Layer) استفاده می‌کند؛ هر سرویس چهار عملیات استاندارد createMailbox، getMessages، getMessage و getDomains را پیاده‌سازی می‌کند و در زمان اجرا بر اساس انتخاب کاربر یکی از آن‌ها فعال می‌شود. فهرست سرویس‌ها و مقدار پیش‌فرض از Firebase Remote Config خوانده می‌شود که مقادیر اولیه آن داخل باندل تعبیه شده است: مقدار mailServicesStr برابر temp-mail,HD,HD_GMAIL,temp-mail-io و مقدار mailServiceDefaultStr برابر HD است. یعنی سرویس پیش‌فرض اپ، بک‌اند اختصاصی خود توسعه‌دهنده است و سه سرویس دیگر به‌عنوان گزینه‌های جایگزین در اختیار کاربر قرار می‌گیرند."));
body.push(tableTitle("جدول 2 — چهار سرویس ایمیل موقت اپ"));
body.push(rtlTable(
  ["سرویس", "پایگاه API", "سازوکار احراز", "نتیجه تست"],
  [
    [cellRuns([{ text: "HD (پیش‌فرض)" }]),
     cellRuns([{ text: "https://mail-server.1timetech.com/api", ltr: true }]),
     "هدر x-app-key + پاکت کدگذاری‌شده", "موفق"],
    [cellRuns([{ text: "HD_GMAIL" }]),
     cellRuns([{ text: "https://mail-server-2.1timetech.com/api", ltr: true }]),
     "مشابه HD", "موفق"],
    [cellRuns([{ text: "temp-mail (سایت temp-mail.org)" }]),
     cellRuns([{ text: "https://mob2.temp-mail.org", ltr: true }]),
     "توکن JWT در هدر authorization", "موفق"],
    [cellRuns([{ text: "temp-mail-io (سایت temp-mail.io)" }]),
     cellRuns([{ text: "https://api.internal.temp-mail.io/api", ltr: true }]),
     "بدون احراز؛ هدرهای نمایشی مرورگر", "موفق"],
  ],
  [22, 36, 26, 16]
));
body.push(bodyP("دامنه‌های ارائه‌شده در سرویس HD از Remote Config (کلید hdDomainsStr) می‌آیند و در نسخه فعلی شامل ۹ دامنه است: gmail10p.com، oletters.com، oemails.com، oegmail.com، suiemail.com، voewo.com، yanemail.com، tempmail.edu.pl و rommiui.com. دامنه‌های ویژه پولی نیز در کلید mailDomainsPremiumStr تعریف شده‌اند که آدرس‌های gmail.com، outlook.com، protonmail.com و icloud.com را از طریق سرویس HD_GMAIL و دو دامنه دیگر را از طریق HD فراهم می‌کنند."));

// ─── 5. سرویس HD ───
body.push(h1("5. سرویس HD (سرویس پیش‌فرض)"));
body.push(bodyP("این سرویس بک‌اند اختصاصی اپ است و مهم‌ترین یافته این تحلیل محسوب می‌شود، چون مستند عمومی ندارد و رفتار آن فقط از دل بایت‌کد قابل بازسازی بود. همه درخواست‌ها با axios ارسال می‌شوند و کلاینت آن با مقادیر زیر ساخته می‌شود (کد از تابع شماره 16015 باندل استخراج شده است):"));
body.push(...codeBlock([
  "baseURL : https://mail-server.1timetech.com/api",
  "headers : { accept: application/json,",
  "            x-app-key: b9db03078622 }",
]));
body.push(bodyP("مقدار x-app-key از کلیدهای Remote Config با نام hdServiceKey خوانده می‌شود و در نسخه فعلی برای هر دو سرویس HD و HD_GMAIL یکسان است (b9db03078622). یک interceptor روی درخواست‌ها نصب شده که پارامترهای کوئری را داخل شیء params و بدنه درخواست‌های POST را داخل شیء data به‌صورت کدگذاری‌شده می‌پیچد؛ جزئیات این کدگذاری در بخش 6 آمده است. مسیرها و قالب ورودی و خروجی هر عملیات در جدول زیر آمده است."));
body.push(tableTitle("جدول 3 — نقاط پایانی سرویس HD"));
body.push(rtlTable(
  ["عملیات", "متد و مسیر", "ورودی", "خروجی"],
  [
    ["ساخت ایمیل",
     cellRuns([{ text: "POST /email", ltr: true }]),
     cellRuns([{ text: '{"data": ENC({"email": "user@dom"})}', ltr: true }]),
     cellRuns([{ text: '{"success":true,"email":"...","id":"..."}', ltr: true }])],
    ["لیست پیام‌ها",
     cellRuns([{ text: "GET /email/{id}/messages", ltr: true }]),
     cellRuns([{ text: '?params=ENC({"email": "..."})', ltr: true }]),
     "آرایه خلاصه پیام‌ها"],
    ["جزئیات پیام",
     cellRuns([{ text: "GET /email/{id}/messages/{mid}", ltr: true }]),
     cellRuns([{ text: '?params=ENC({"email": "..."})', ltr: true }]),
     "متن کامل + bodyHtml + پیوست‌ها"],
    ["فهرست دامنه‌ها", "بدون فراخوانی شبکه", cellRuns([{ text: "RemoteConfig: hdDomainsStr", ltr: true }]), "۹ دامنه"],
  ],
  [16, 30, 28, 26]
));
body.push(bodyP("در پاسخ عملیات ساخت ایمیل، فیلد id همان توکن باکس است که در مسیر دو عملیات بعدی استفاده می‌شود و فیلد email آدرس ساخته‌شده است. خروجی هر سه عملیات به‌صورت دولایه کدگذاری‌شده برمی‌گردد؛ یعنی پس از باز کردن لایه اول، مجدداً یک شیء به شکل {\"data\": \"...\", \"type\": \"object\"} به دست می‌آید که باید یک بار دیگر کدگشایی شود. هر دو لایه با همان الگوریتم بخش 6 باز می‌شوند و کلاینت پایتون پیوستی این کار را به‌صورت خودکار انجام می‌دهد. نمونه واقعی رفت و برگشت (از تست زنده بخش 10) چنین است:"));
body.push(...codeBlock([
  'POST /api/email   body: {"data":"xxQfiETObQmYlZGN2IGNjJDOyMD..."}',
  "HTTP 200",
  'layer-1 -> {"data":"x0nIkNmMwEBMyITM1gTO=AjYwUBY=ABN1kBYbYGMB..."}',
  'layer-2 -> {"success": true, "email": "test1793490491@tempmail.edu.pl",',
  '            "id": "17cb315d07cd8ed3ebb624ce2ca54e1b"}',
]));

// ─── 6. الگوریتم کدگذاری ───
body.push(h1("6. الگوریتم کدگذاری پاکت HD"));
body.push(bodyP("الگوریتم از سه تابع باندل استخراج شده است: encodeStr (تابع 16018) که خروجی JSON.stringify را با Base64 کد می‌کند، تابع replaceChars (تابع 16020) که رشته را معکوس و سپس کاراکترها را با هم جابه‌جا می‌کند، و interceptor درخواست (تابع 16024) که همین کدگذاری را روی پارامترها و بدنه اعمال می‌کند. کلید جابه‌جایی از فیلد encryptKey در کانفیگ اپ می‌آید و مقدار آن ao-sq-=x-5b-4*-Bz است؛ یعنی شش جفت‌کاراکتر: a با o، s با q، علامت = با x، رقم 5 با b، رقم 4 با ستاره و حرف B با z. ترتیب گام‌ها چنین است:"));
body.push(...codeBlock([
  "ENC(x):",
  "  1) s = JSON.stringify(x)            # بدون فاصله",
  "  2) s = base64(s)                    # استاندارد، همراه با =",
  "  3) s = reverse(s)                   # معکوس کردن کل رشته",
  "  4) برای هر جفت (a,b) از [ao,sq,=x,5b,4*,Bz]:",
  "       s = s.replace(a,TMP).replace(b,a).replace(TMP,b)",
  "",
  "DEC(s):  همان جابه‌جایی (خودمتقارن) + reverse + ترمیم پدینگ + base64 decode",
]));
body.push(bodyP("دو نکته پیاده‌سازی اهمیت دارد. نخست اینکه جابه‌جایی جفت‌کاراکترها خودمتقارن است، پس تابع کدگذاری و کدگشایی یکی است و فقط ترتیب گام‌ها برعکس می‌شود. دوم اینکه پاسخ سرور دولایه است؛ پس از بازکردن لایه اول ممکن است به شیء دیگری با فیلد data برسید که باید دوباره کدگشایی شود تا به JSON اصلی برسید. در سمت درخواست نیز پدینگ Base64 پس از جابه‌جایی باید در نظر گرفته شود، چون علامت مساوی خودش یکی از کاراکترهای جابه‌جاشده است."));

// ─── 7. HD_GMAIL ───
body.push(h1("7. سرویس HD_GMAIL"));
body.push(bodyP("این سرویس نسخه ویژه Gmail همان بک‌اند است و روی سرور دوم (mail-server-2.1timetech.com) اجرا می‌شود. تنها تفاوت مسیر ساخت ایمیل است: به جای POST /email از POST /g-mail استفاده می‌شود؛ دو عملیات دریافت پیام همان مسیرهای /email/{id}/messages را روی این سرور دارند. کاربرد اصلی این سرویس، ساخت آدرس‌های gmail.com با ترفند نقطه است: سرور برای آدرس درخواستی، نسخه نقطه‌گذاری‌شده‌ای می‌سازد و همه ایمیل‌های ارسالی به آن را به همین باکس تحویل می‌دهد. در تست زنده، درخواست ساخت باکس روی این سرور پاسخ موفق داد و آدرسی مانند p.e.l.li.g.r.i.n.op.h.i.lip.o.se.7.60@gmail.com تولید شد (بخش 10، جدول 5). این سرویس در کانفیگ اپ به‌عنوان سرویس پریمیوم معرفی شده و دامنه‌های outlook.com، protonmail.com و icloud.com نیز از طریق آن قابل درخواست‌اند."));

// ─── 8. temp-mail.org ───
body.push(h1("8. سرویس temp-mail.org"));
body.push(bodyP("این سرویس از API موبایل سایت temp-mail.org استفاده می‌کند و رفتار آن از توابع 15623 تا 15645 باندل بازسازی شد. کلاینت axios آن با پاگاه mob2.temp-mail.org و هدرهای نمایشی نسخه iOS اپ ساخته می‌شود؛ نکته جالب اینکه هدر user-agent آن به TempMail/1022 CFNetwork/1568.100.1 Darwin/24.0.0 تنظیم شده تا درخواست‌ها مانند اپ رسمی iOS به نظر برسند. ساخت باکس با یک درخواست POST بدون بدنه انجام می‌شود و سرور یک توکن JWT و آدرس تصادفی برمی‌گرداند:"));
body.push(...codeBlock([
  "POST https://mob2.temp-mail.org/mailbox",
  "accept: application/json | accept-encoding: gzip | content-length: 0",
  'user-agent: TempMail/1022 CFNetwork/1568.100.1 Darwin/24.0.0',
  "",
  'HTTP 200  {"token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1dWlk...","',
  '           "mailbox":"gatabe4469@topexample.com"}',
]));
body.push(bodyP("دریافت پیام‌ها با GET /messages و هدر authorization حاوی همان توکن انجام می‌شود و جزئیات یک پیام با GET /messages/{id} قابل خواندن است. اپ زمان اعتبار باکس این سرویس را حدود دو روز اعلام می‌کند و در رابط کاربری می‌گوید آدرس تصادفی تولید می‌شود، قابل بازیابی نیست و برای حساب‌های مهم مناسب نیست. عملیات getDomains این سرویس هیچ فراخوانی شبکه‌ای ندارد و فقط آرایه ثابت [\"random.com\"] را برمی‌گرداند، چون سرور خودش دامنه را انتخاب می‌کند."));

// ─── 9. temp-mail.io ───
body.push(h1("9. سرویس temp-mail.io"));
body.push(bodyP("این سرویس همان API وب سایت temp-mail.io است (توابع 18022 تا 18050 باندل) و برخلاف دو سرویس قبلی هیچ احراز هویتی ندارد؛ فقط مجموعه‌ای از هدرهای نمایشی ارسال می‌شود تا درخواست مانند مرورگر واقعی به نظر برسد. اپ نسخه وب را با مقادیر application-name: web و application-version: 2.2.29 و مرجع temp-mail.io جعل می‌کند. نقاط پایانی آن در جدول زیر آمده است."));
body.push(tableTitle("جدول 4 — نقاط پایانی سرویس temp-mail.io"));
body.push(rtlTable(
  ["عملیات", "متد و مسیر", "ورودی / خروجی"],
  [
    ["فهرست دامنه‌ها",
     cellRuns([{ text: "GET /v4/domains", ltr: true }]),
     cellRuns([{ text: '{"domains":[{"name":"yzcalo.com","type":"public",...}]}', ltr: true }])],
    ["ساخت ایمیل",
     cellRuns([{ text: "POST /v3/email/new", ltr: true }]),
     cellRuns([{ text: 'بدنه اختیاری {"name","domain"} → {"email","token"}', ltr: true }])],
    ["لیست پیام‌ها",
     cellRuns([{ text: "GET /v3/email/{email}/messages", ltr: true }]),
     "آرایه پیام‌ها (خالی یا فهرست)"],
    ["جزئیات پیام",
     cellRuns([{ text: "GET /v3/message/{id}", ltr: true }]),
     "متن کامل پیام با پیوست‌ها"],
  ],
  [18, 32, 50]
));
body.push(bodyP("برای ساخت آدرس دلخواه کافی است نام و دامنه را در بدنه ارسال کنید؛ اگر بدنه خالی باشد، سرور آدرس کاملاً تصادفی می‌سازد. توکن این سرویس رشته کوتاهی مانند ez2IZP2vnlfobanBAtTE است که در تست‌ها همراه آدرس برگردانده شد و در حال حاضر هیچ endpoint دیگری از آن استفاده نمی‌کند؛ شناسه اصلی برای خواندن پیام‌ها خودِ آدرس ایمیل است."));

// ─── 10. نتایج تست زنده ───
body.push(h1("10. نتایج تست زنده"));
body.push(bodyP("تمام endpoint های استخراج‌شده در تاریخ 31 اکتبر 2026 با همان هدرها و الگوریتم کدگذاری اپ تست شدند و همگی پاسخ موفق (HTTP 200) دادند. نتایج واقعی در جدول زیر آمده است؛ مقادیر توکن‌ها برای خوانایی کوتاه شده‌اند اما در خروجی کامل تست، رشته کامل آن‌ها موجود است."));
body.push(tableTitle("جدول 5 — نتایج تست زنده endpoint ها"));
body.push(rtlTable(
  ["#", "درخواست", "پاسخ (خلاصه)"],
  [
    ["1", cellRuns([{ text: "temp-mail.io  GET /api/v4/domains", ltr: true }]),
     cellRuns([{ text: "yzcalo.com, lnovic.com, ruutukf.com, ...", ltr: true }])],
    ["2", cellRuns([{ text: "temp-mail.org  POST /mailbox", ltr: true }]),
     cellRuns([{ text: '{"token":"eyJhbGci...","mailbox":"gatabe4469@topexample.com"}', ltr: true }])],
    ["3", cellRuns([{ text: "temp-mail.org  GET /messages (JWT)", ltr: true }]),
     cellRuns([{ text: '{"mailbox":"gatabe4469@topexample.com","messages":[]}', ltr: true }])],
    ["4", cellRuns([{ text: "HD  POST /api/email (پاکت ENC)", ltr: true }]),
     cellRuns([{ text: '{"success":true,"email":"test1793490491@tempmail.edu.pl","id":"17cb315d..."}', ltr: true }])],
    ["5", cellRuns([{ text: "HD  GET /api/email/{id}/messages", ltr: true }]),
     cellRuns([{ text: "[]  (صندوق خالی — موفق)", }])],
    ["6", cellRuns([{ text: "HD_GMAIL  POST /api/g-mail", ltr: true }]),
     cellRuns([{ text: '{"success":true,"email":"p.e.l.li.g.r.i.n.op.h.i.lip.o.se.7.60@gmail.com",...}', ltr: true }])],
    ["7", cellRuns([{ text: "temp-mail.io  POST /api/v3/email/new", ltr: true }]),
     cellRuns([{ text: '{"email":"l2v6disb6wk@lnovic.com","token":"ez2IZP2vnlfobanBAtTE"}', ltr: true }])],
  ],
  [6, 42, 52]
));

// ─── 11. کلاینت پایتون ───
body.push(h1("11. کلاینت پایتون و نحوه استفاده"));
body.push(bodyP("پیوستی این گزارش، فایل instant_mail_api_client.py است که هر چهار سرویس را در یک کلاس واحد پیاده‌سازی می‌کند؛ کدگذاری و کدگشایی پاکت HD، دولایه بودن پاسخ، هدرهای هر سرویس و ترمیم پدینگ Base64 به‌صورت خودکار انجام می‌شود. نمونه استفاده:"));
body.push(...codeBlock([
  "from instant_mail_api_client import TempMailClient",
  "",
  "c = TempMailClient('HD')                       # یا HD_GMAIL / temp-mail / temp-mail-io",
  "box = c.create(email='ali@tempmail.edu.pl')    # آدرس دلخواه (سرویس HD)",
  "box = c.create()                               # آدرس تصادفی",
  "print(box['email'], box['token'])",
  "msgs = c.get_messages(box)                     # polling تا رسیدن ایمیل",
  "full = c.get_message(box, msgs[0]['_id'])      # متن کامل پیام",
]));
body.push(bodyP("همچنین فایل instant_mail_extracted_config.json حاوی کل کانفیگ استخراج‌شده (کلیدهای Remote Config، آدرس‌ها، کلید x-app-key و شناسه‌های مربوط به هر ماژول در باندل) است تا بتوانید یافته‌ها را مستقیماً با دیساسمبلر تطبیق دهید. برای اجرای کلاینت فقط کتابخانه requests لازم است."));

// ─── 12. ملاحظات ───
body.push(h1("12. ملاحظات و محدودیت‌ها"));
body.push(bodyP("چند نکته پیش از استفاده مهم است. مقدار x-app-key و آدرس سرورها از Firebase Remote Config خوانده می‌شود؛ توسعه‌دهنده می‌تواند بدون انتشار نسخه جدید، این مقادیر را تغییر دهد یا به کلاینت‌های بدون کلید معتبر پاسخ 403 بدهد. توکن سرویس HD در واقع شناسه دیتابیس باکس است و در پاسخ هیچ فیلد انقضایی دیده نمی‌شود، اما به نظر می‌رسد سرور باکس‌های بی‌استفاده را پس از مدتی پاکسازی می‌کند؛ توکن سرویس temp-mail.org یک JWT با اعتبار حدود دو روز است. هیچ‌کدام از سرویس‌ها محدودیت نرخ مستندسازی‌شده ندارند، اما رفتار محتاطانه (فاصله چند ثانیه بین درخواست‌ها و استفاده تک‌کاربره) توصیه می‌شود تا دامنه‌ها و کلیدها مسدود نشوند."));
body.push(bodyP("از نظر کاربرد، این APIها برای دریافت ایمیل‌های یک‌بار مصرف در تست نرم‌افزار، حفظ حریم خصوصی در ثبت‌نام‌های بی‌اهمیت و پژوهش امنیتی طراحی شده‌اند. استفاده از ایمیل موقت برای دور زدن قوانین سرویس‌های دیگر، ایجاد حساب‌های متقلب یا فعالیت‌های مخرب، خلاف قوانین سرویس‌های مبدأ (شرایط استفاده temp-mail.io و temp-mail.org و سیاست حریم خصوصی Instant Mail) و مسئولیت کاربر است. این گزارش صرفاً با هدف مستندسازی فنی رفتار یک اپلیکیشن عمومی تهیه شده و هیچ داده شخصی از کاربران اپ در آن وجود ندارد."));

// ══════════════════ DOCUMENT ══════════════════
const doc = new Document({
  creator: "Reverse Engineering Report",
  title: "Instant Mail 8.6.0 — Temp Mail API Extraction",
  styles: {
    default: {
      document: {
        run: { font: FA, size: 22, color: P.body },
        paragraph: { spacing: { line: 312 } },
      },
      heading1: {
        run: { font: FA, size: 30, bold: true, color: P.primary },
        paragraph: { spacing: { before: 360, after: 160, line: 312 }, outlineLevel: 0 },
      },
      heading2: {
        run: { font: FA, size: 26, bold: true, color: P.primary },
        paragraph: { spacing: { before: 240, after: 120, line: 312 }, outlineLevel: 1 },
      },
    },
  },
  sections: [
    // ── Section 1: cover (margin 0, no footer) ──
    {
      properties: { page: { size: pgSize, margin: { top: 0, bottom: 0, left: 0, right: 0 } } },
      children: buildCoverR1RTL({
        title: "گزارش مهندسی معکوس اپلیکیشن Instant Mail",
        subtitle: "استخراج کامل API سرویس‌های ایمیل موقت از باندل Hermes — نسخه 8.6.0 اندروید",
        englishLabel: "TEMP MAIL API EXTRACTION",
        metaLines: [
          [fa("شناسه پکیج: ", { size: 22, color: "D7DEE9" }), en("com.temporary.email.pro", { size: 20, color: "D7DEE9" })],
          [fa("سرویس‌ها: ", { size: 22, color: "D7DEE9" }), en("HD | HD_GMAIL | temp-mail.org | temp-mail.io", { size: 20, color: "D7DEE9" })],
          [fa("منبع: ", { size: 22, color: "D7DEE9" }), en("assets/index.android.bundle (Hermes v96)", { size: 20, color: "D7DEE9" })],
          [fa("تاریخ تهیه: ", { size: 22, color: "D7DEE9" }), en("October 2026", { size: 20, color: "D7DEE9" })],
        ],
        footerRight: "سند فنی — کاربرد پژوهشی و آموزشی",
        footerLeft: "Instant Mail 8.6.0 API Report",
        palette: P.cover,
      }),
    },
    // ── Section 2: TOC (roman) ──
    {
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: pgSize, margin: pgMargin, pageNumbers: { start: 1, formatType: NumberFormat.UPPER_ROMAN } },
      },
      headers: { default: docHeader() },
      footers: { default: numFooter() },
      children: [
        new Paragraph({
          bidirectional: true, alignment: AlignmentType.CENTER,
          spacing: { before: 480, after: 360 },
          children: [fa("فهرست مطالب", { bold: true, size: 32, color: P.primary })],
        }),
        new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-3" }),
        new Paragraph({
          bidirectional: true, spacing: { before: 200 },
          children: [fa("یادآوری: این فهرست با کد فیلد ساخته شده است؛ برای به‌روزرسانی شماره صفحات روی فهرست راست‌کلیک کرده و گزینه Update Field را انتخاب کنید.", { italics: true, size: 18, color: "888888" })],
        }),
        // body starts in its own NEXT_PAGE section → no trailing PageBreak here
      ],
    },
    // ── Section 3: body (arabic, start 1) ──
    {
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: pgSize, margin: pgMargin, pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } },
      },
      headers: { default: docHeader() },
      footers: { default: numFooter() },
      children: body,
    },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUT, buf);
  console.log("WROTE", OUT, buf.length, "bytes");
});
