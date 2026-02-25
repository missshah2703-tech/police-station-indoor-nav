export type Language = "en" | "ar" | "hi";

export const languageNames: Record<Language, string> = {
  en: "English",
  ar: "العربية",
  hi: "हिन्दी",
};

const translations: Record<Language, Record<string, string>> = {
  en: {
    "app.title": "Police Station Indoor Navigation",
    "app.subtitle": "Accessible indoor navigation for everyone",
    "scan.title": "Scan QR Code",
    "scan.input": "Enter Building ID",
    "scan.submit": "Open Map",
    "scan.placeholder": "Scan QR at reception",
    "scan.or": "Scan the QR code at reception desk",
    "scan.instruction": "Point your camera at the QR code displayed at the reception desk",
    "map.selectDestination": "Tap a location to navigate",
    "map.navigate": "Navigate Here",
    "map.startNav": "Start Voice Navigation",
    "map.stopNav": "Stop Navigation",
    "map.arAssist": "AR Assist",
    "map.accessibility": "Wheelchair-accessible route",
    "map.distance": "Distance",
    "map.meters": "m",
    "map.steps": "Steps",
    "map.backToMap": "Back to Map",
    "settings.title": "Settings",
    "settings.language": "Language",
    "settings.accessibility": "Wheelchair Accessible Route",
    "settings.largeText": "Large Text",
    "nav.home": "Home",
    "nav.scan": "Scan",
    "nav.map": "Map",
    "nav.settings": "Settings",
    "nav.back": "Back",
    "nav.close": "Close",
    "nav.navigatingTo": "Navigating to",
    "nav.liveView": "Live View",
    "nav.floorMap": "Floor Map",
    "dept.search": "Search department or room...",
    "dept.allDepartments": "All Departments",
    "dept.noResults": "No departments found",
    "dept.buildingNotFound": "Building not found",
    "dir.start": "Start at {location}",
    "dir.straight": "Go straight ~{distance}m",
    "dir.left": "Turn left and walk ~{distance}m",
    "dir.right": "Turn right and walk ~{distance}m",
    "dir.arrive": "You have arrived at {destination}",
  },
  ar: {
    "app.title": "التنقل الداخلي لمركز الشرطة",
    "app.subtitle": "تنقل داخلي متاح للجميع",
    "scan.title": "مسح رمز QR",
    "scan.input": "أدخل معرف المبنى",
    "scan.submit": "فتح الخريطة",
    "scan.placeholder": "امسح رمز QR في الاستقبال",
    "scan.or": "امسح رمز QR في مكتب الاستقبال",
    "scan.instruction": "وجّه الكاميرا نحو رمز QR الموجود في مكتب الاستقبال",
    "map.selectDestination": "اضغط على موقع للتنقل",
    "map.navigate": "التنقل إلى هنا",
    "map.startNav": "بدء التنقل الصوتي",
    "map.stopNav": "إيقاف التنقل",
    "map.arAssist": "مساعد الواقع المعزز",
    "map.accessibility": "مسار متاح لكرسي متحرك",
    "map.distance": "المسافة",
    "map.meters": "م",
    "map.steps": "الخطوات",
    "map.backToMap": "العودة للخريطة",
    "settings.title": "الإعدادات",
    "settings.language": "اللغة",
    "settings.accessibility": "مسار متاح لذوي الاحتياجات الخاصة",
    "settings.largeText": "نص كبير",
    "nav.home": "الرئيسية",
    "nav.scan": "مسح",
    "nav.map": "خريطة",
    "nav.settings": "الإعدادات",
    "nav.back": "رجوع",
    "nav.close": "إغلاق",
    "nav.navigatingTo": "التنقل إلى",
    "nav.liveView": "العرض المباشر",
    "nav.floorMap": "خريطة الطابق",
    "dept.search": "ابحث عن قسم أو غرفة...",
    "dept.allDepartments": "جميع الأقسام",
    "dept.noResults": "لم يتم العثور على أقسام",
    "dept.buildingNotFound": "المبنى غير موجود",
    "dir.start": "ابدأ من {location}",
    "dir.straight": "استمر بالمشي ~{distance}م",
    "dir.left": "انعطف يساراً وامشِ ~{distance}م",
    "dir.right": "انعطف يميناً وامشِ ~{distance}م",
    "dir.arrive": "لقد وصلت إلى {destination}",
  },
  hi: {
    "app.title": "पुलिस स्टेशन इंडोर नेविगेशन",
    "app.subtitle": "सभी के लिए सुलभ इंडोर नेविगेशन",
    "scan.title": "QR कोड स्कैन करें",
    "scan.input": "बिल्डिंग ID दर्ज करें",
    "scan.submit": "मैप खोलें",
    "scan.placeholder": "रिसेप्शन पर QR स्कैन करें",
    "scan.or": "रिसेप्शन डेस्क पर QR कोड स्कैन करें",
    "scan.instruction": "रिसेप्शन डेस्क पर दिखाए गए QR कोड की ओर कैमरा करें",
    "map.selectDestination": "नेविगेट करने के लिए स्थान पर टैप करें",
    "map.navigate": "यहाँ नेविगेट करें",
    "map.startNav": "वॉइस नेविगेशन शुरू करें",
    "map.stopNav": "नेविगेशन बंद करें",
    "map.arAssist": "AR सहायता",
    "map.accessibility": "व्हीलचेयर सुलभ मार्ग",
    "map.distance": "दूरी",
    "map.meters": "मी",
    "map.steps": "चरण",
    "map.backToMap": "मैप पर वापस",
    "settings.title": "सेटिंग्स",
    "settings.language": "भाषा",
    "settings.accessibility": "व्हीलचेयर सुलभ मार्ग",
    "settings.largeText": "बड़ा टेक्स्ट",
    "nav.home": "होम",
    "nav.scan": "स्कैन",
    "nav.map": "मैप",
    "nav.settings": "सेटिंग्स",
    "nav.back": "वापस",
    "nav.close": "बंद करें",
    "nav.navigatingTo": "नेविगेट कर रहे हैं",
    "nav.liveView": "लाइव व्यू",
    "nav.floorMap": "फ्लोर मैप",
    "dept.search": "विभाग या कमरा खोजें...",
    "dept.allDepartments": "सभी विभाग",
    "dept.noResults": "कोई विभाग नहीं मिला",
    "dept.buildingNotFound": "बिल्डिंग नहीं मिली",
    "dir.start": "{location} से शुरू करें",
    "dir.straight": "सीधे चलें ~{distance}मी",
    "dir.left": "बाएं मुड़ें और ~{distance}मी चलें",
    "dir.right": "दाएं मुड़ें और ~{distance}मी चलें",
    "dir.arrive": "आप {destination} पर पहुंच गए",
  },
};

/**
 * Translate a key into the given language.
 * Supports {param} placeholders replaced by the params object.
 */
export function t(
  key: string,
  lang: Language,
  params?: Record<string, string>
): string {
  let text = translations[lang]?.[key] || translations.en[key] || key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(`{${k}}`, v);
    }
  }
  return text;
}

/** Check if the language uses right-to-left direction */
export function isRTL(lang: Language): boolean {
  return lang === "ar";
}
