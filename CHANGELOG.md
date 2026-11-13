# Changelog

All notable changes to PathShala LMS are documented here.

## 1.0.0 — 2026-11-12

Initial public release.

### Platform
- Next.js 16 App Router + React 19 + TypeScript 5 codebase with Turbopack dev server and standalone production output
- Prisma 6 data layer (SQLite) with 20+ models: users, courses, chapters/lessons, quizzes, attempts, written exams, orders, enrollments, certificates, notices, media and site settings
- 40+ REST API route handlers covering auth, catalog, checkout, payments, exams, admin modules and SEO tooling

### Learning
- Course catalog with categories, search, ratings and moderated reviews (56 demo courses seeded)
- Classroom player for video (YouTube / Vimeo / Drive / Bunny / self-hosted) and PDF lecture sheets with per-lesson progress
- MCQ exam engine: timed quizzes, negative marking, instant auto-grading, leaderboards
- Written (CQ) exam engine: question papers, answer-sheet uploads, admin annotation, result publishing
- Live classes, study-material (suggestion) library, auto-issued certificates with public verification
- GPA / CGPA / percentage calculators

### Commerce
- Cart and checkout for courses, combos, exams and suggestions
- bKash Tokenized Checkout and SSLCommerz gateways (sandbox mode) plus a manual payment verification flow
- Scoped coupon system, discount pricing, per-order invoices

### Admin
- 25+ management modules with role-based access (Admin / Manager / Moderator)
- Analytics dashboard, course builder, exam & result center, media library, broadcast, testimonials
- Site settings with 21 focused sub-modules (branding, hero variants, header/footer editors, SEO & GA4, custom CSS/code, SMTP, SMS, payments, popup, invoices…)

### SEO & infrastructure
- SEO Center with live scores powered by a 68-check audit engine (27 on-page + 41 technical) and per-issue fix guidance
- Instant content-revision-driven sitemap, per-deployment-domain origin resolution for canonical/OpenGraph URLs, robots.txt, JSON-LD structured data
- JWT session auth with edge route guards, bcrypt hashing, OTP tokens, CSP/HSTS/X-Frame-Options headers on every route
- Content-addressed media uploads with immutable caching and masked paid-content streaming
- Fully bilingual Bangla/English interface with server-synced language cookie (no hydration flash) and light/dark theme
