import type { CapacitorConfig } from '@capacitor/cli';

// إعداد تطبيق التراخيص (APK منفصل عن تطبيق البنا وتطبيق السائق). بيتنسخ مكان capacitor.config.ts وقت البناء (شوف .github/workflows/build-licenses-apk.yml)
const config: CapacitorConfig = {
  appId: 'com.elbanna.licenses',
  appName: 'تراخيص البنا',
  webDir: 'dist',
  // أندرويد 15+: بيمنع المحتوى من الظهور تحت شريط الحالة وشريط التنقل
  android: { allowMixedContent: false, adjustMarginsForEdgeToEdge: 'auto' },
};

export default config;
