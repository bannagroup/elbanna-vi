import type { CapacitorConfig } from '@capacitor/cli';

// إعداد التطبيق الكامل (نظام الإدارة بكل الشاشات) — appId واسم مختلفين عن تطبيق السائق وتطبيق الطلبات
// عشان يتثبّتوا كلهم على نفس الموبايل. بيتنسخ مكان capacitor.config.ts وقت البناء (build-full-apk.yml)
const config: CapacitorConfig = {
  appId: 'com.elbanna.fleet',
  appName: 'إدارة البنا',
  webDir: 'dist',
  // أندرويد 15+: بيمنع المحتوى من الظهور تحت شريط الحالة وشريط التنقل
  // zoomEnabled: تكبير/تصغير وتحريك الشاشة بالإصبعين (مقفول افتراضيًا في أندرويد)
  android: { allowMixedContent: false, adjustMarginsForEdgeToEdge: 'auto', zoomEnabled: true },
};

export default config;
