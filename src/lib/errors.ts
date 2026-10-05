const arabicErrors: Record<string, string> = {
  "Invalid request origin.":
    "تعذر التحقق من عنوان الموقع. تحقق من إعداد رابط التطبيق على الخادم.",
  "Enter a learning goal, name and valid target date.":
    "أدخل اسم المساحة وهدف التعلم وتاريخًا مستهدفًا صالحًا.",
  "Learning space not found.": "مساحة التعلم غير موجودة أو غير متاحة لحسابك.",
  "Enter a title and valid event dates.":
    "أدخل عنوانًا وتاريخ بداية ونهاية صالحين للحدث.",
  "Enter a topic and valid session length.":
    "أدخل موضوعًا ومدة جلسة بين دقيقة و180 دقيقة.",
  "Finish the active session first.": "أنهِ جلسة التركيز النشطة أولًا.",
  "Choose a task from this workspace.": "اختر مهمة من مساحة التعلم هذه.",
  "Enter a deck name.": "أدخل اسمًا لمجموعة البطاقات.",
  "Enter a card front and back.": "أدخل السؤال والإجابة للبطاقة.",
  "This card has changed or is not due yet.":
    "تم تعديل البطاقة أو لم يحن موعد مراجعتها. أعد فتح المجموعة.",
  "Enter a quiz title.": "أدخل عنوانًا للاختبار.",
  "Enter a question and a valid correct answer.":
    "أدخل سؤالًا وإجابة صحيحة صالحة. تحقق من الخيارات أو أزواج المطابقة.",
  "Answer every question before submitting.":
    "أجب عن جميع الأسئلة قبل الإرسال.",
  "This attempt has already been submitted.": "تم إرسال هذه المحاولة بالفعل.",
  "Combined grading weights cannot exceed 100%.":
    "مجموع أوزان الدرجات والامتحانات لا يمكن أن يتجاوز 100%.",
  "Enter valid marks and weights. Score cannot exceed total.":
    "أدخل درجات وأوزانًا صالحة. الدرجة لا يمكن أن تتجاوز العلامة الكلية.",
  "Enter a valid exam, date, marks and weights.":
    "أدخل اسم امتحان وتاريخًا ودرجات وأوزانًا صالحة.",
  "Enter a valid GPA scale with increasing grade points and a zero-percent rule.":
    "تحقق من سلم المعدل: النقاط تزداد مع النسبة ويجب إضافة قاعدة تبدأ من 0%.",
  "Files must be 10 MB or smaller.": "الحد الأعلى لحجم الملف هو 10 ميغابايت.",
  "AI is not configured.": "خدمة الذكاء الاصطناعي غير مُعدّة بعد.",
  "Enter a question or select a study source.":
    "أدخل سؤالًا أو اختر مصدرًا للدراسة.",
  "An AI request is already running.":
    "يوجد طلب ذكاء اصطناعي قيد التنفيذ. انتظر اكتماله.",
  "AI request limit reached. Try again later.":
    "وصلت إلى حد الطلبات. حاول لاحقًا.",
  "This source has no extractable text. Use a text PDF or a note.":
    "لا يوجد نص قابل للاستخراج. استخدم PDF نصيًا أو ملاحظة.",
  "AI could not complete this request. Please retry.":
    "تعذر إكمال الطلب. تحقق من إعداد الخدمة وحاول مجددًا.",
  "Enter a semester name and valid start/end dates.":
    "أدخل اسم الفصل وتاريخ بداية ونهاية صالحين.",
  "Enter a course name, credits (0–30), and a valid color.":
    "أدخل اسم المساق وساعات بين 0 و30 ولونًا صالحًا.",
  "Enter a task title and a valid due date.":
    "أدخل عنوان المهمة وموعدًا صالحًا.",
  "Semester not found.": "الفصل غير موجود أو غير متاح لحسابك.",
  "Course not found.": "المساق غير موجود أو غير متاح لحسابك.",
  "Task not found.": "المهمة غير موجودة أو غير متاحة لحسابك.",
  "This link is invalid or expired.": "هذا الرابط غير صالح أو انتهت صلاحيته.",
  "Enter a valid reset link and a password of 10–128 characters.":
    "أدخل رابط استعادة صالحًا وكلمة مرور من 10 إلى 128 حرفًا.",
  "Enter a valid email address.": "أدخل بريدًا إلكترونيًا صالحًا.",
  "Please wait a minute before requesting another email.":
    "انتظر دقيقة قبل طلب رسالة أخرى.",
  "Email delivery is not configured.": "خدمة إرسال البريد غير مُعدّة بعد.",
  "Email delivery failed. Try again later.": "تعذر إرسال البريد. حاول لاحقًا.",
  "Verify your email before accessing study data.":
    "أكد بريدك الإلكتروني قبل الوصول إلى بيانات الدراسة.",
  "This email is already registered.": "هذا البريد الإلكتروني مسجل بالفعل.",
  "Email or password is incorrect.":
    "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
  "Enter a valid email and password.":
    "أدخل بريدًا إلكترونيًا وكلمة مرور صالحين.",
  "Enter a name, valid email, and a password of 10–128 characters.":
    "أدخل اسمًا وبريدًا صالحًا وكلمة مرور من 10 إلى 128 حرفًا.",
  "Too many attempts. Try again in 15 minutes.":
    "محاولات كثيرة. حاول مجددًا بعد 15 دقيقة.",
  "Invalid preferences.": "التفضيلات غير صالحة.",
  "Sign in required.": "يرجى تسجيل الدخول.",
};
export function errorMessage(error: unknown, language: "ar" | "en") {
  const message =
    error instanceof Error
      ? error.message
      : "Something went wrong. Please try again.";
  return language === "ar"
    ? (arabicErrors[message] ?? "تعذر إتمام العملية. يرجى المحاولة مجددًا.")
    : message;
}
