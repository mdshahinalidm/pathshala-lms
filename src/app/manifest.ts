import type { MetadataRoute } from 'next'

/**
 * PWA web manifest — brand identity for installed/standalone sessions.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'পাঠশালা — PathShala LMS',
    short_name: 'পাঠশালা',
    description:
      'বাংলাদেশের সেরা অনলাইন লার্নিং প্ল্যাটফর্ম — কোর্স, লাইভ পরীক্ষা ও ফ্রি সাজেশন এক জায়গায়।',
    lang: 'bn',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#0e7a5f',
    icons: [
      {
        src: '/favicon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  }
}
